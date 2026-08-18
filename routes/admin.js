const express = require("express");
const router = express.Router();
const QRCode = require("qrcode");

const Booking = require("../models/Booking");
const SlotOverride = require("../models/SlotOverride");
const Config = require("../models/Config");
const { getSlotState, allocateForDate, checkAssignable } = require("../utils/allocate");
const { ALL_SLOTS, MAX_PER_SLOT, windowFor, formatSlotLabel, getOperationalDate, addDays, addMonths, slotLevel } = require("../utils/slots");
const { sendAllocationEmail, sendChangeConfirmed, sendChangeRejected } = require("../utils/mailer");

// Single shared dashboard for both front desk and driver - no login, no role split.
// Everyone who has the link can view, edit, block, regroup, and send emails.

// GET /api/admin/today - the "operational date" (shuttle day rolls over at 7 AM, not midnight),
// plus a couple of handy reference dates for the dashboard's Upcoming/History tabs.
router.get("/today", (req, res) => {
  const today = getOperationalDate();
  res.json({
    today,
    previousDay: addDays(today, -1),
    upcomingMax: addMonths(today, 4),
    historyMin: addMonths(today, -4),
    // Lets the dashboard warn staff up front if emails will silently not send.
    emailConfigured: Boolean(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD)
  });
});

// GET /api/admin/bookings?date=YYYY-MM-DD&sort=asc|desc
// or GET /api/admin/bookings?from=YYYY-MM-DD&to=YYYY-MM-DD&sort=asc|desc  (date range, for the
// Upcoming/History agenda views - shows every reservation in the window in one call instead of
// requiring front desk to page through one date at a time).
router.get("/bookings", async (req, res) => {
  const { date, from, to } = req.query;
  let filter = {};
  if (date) {
    filter = { date };
  } else if (from || to) {
    const range = {};
    if (from) range.$gte = from;
    if (to) range.$lte = to;
    filter = { date: range };
  }
  const sortDir = req.query.sort === "desc" ? -1 : 1; // ascending (oldest request first) by default
  const bookings = await Booking.find(filter).sort({ createdAt: sortDir }).lean();
  res.json({
    bookings: bookings.map((b) => ({
      ...b,
      assignedSlotLabel: b.assignedSlot ? formatSlotLabel(b.assignedSlot) : null,
      requestedSlotLabel: b.requestedSlot ? formatSlotLabel(b.requestedSlot) : null,
      preferredSlotLabels: b.preferredSlots.map(formatSlotLabel)
    }))
  });
});

// PATCH /api/admin/bookings/:id  { status?, assignedSlot? }  - manual override by staff
router.patch("/bookings/:id", async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ error: "Not found" });

    if (req.body.assignedSlot !== undefined) {
      if (req.body.assignedSlot && !ALL_SLOTS.includes(req.body.assignedSlot)) {
        return res.status(400).json({ error: "Invalid slot" });
      }
      if (req.body.assignedSlot) {
        const check = await checkAssignable(booking.date, booking, req.body.assignedSlot);
        if (!check.ok) return res.status(409).json({ error: check.error });
      }
      booking.assignedSlot = req.body.assignedSlot || null;
      if (booking.assignedSlot && booking.status === "PENDING") booking.status = "ALLOCATED";
    }
    if (req.body.status !== undefined) {
      booking.status = req.body.status;
    }
    await booking.save();
    res.json({ ok: true, booking });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/admin/bookings/bulk-assign  { ids: [...], slotTime, sendEmail, reason? }
// Front desk/driver regroup a batch of requests into one time slot and (optionally) email
// everyone their new time in one action. If any selected booking already has a
// confirmed/allocated time different from the target slot, this counts as a CHANGE (not a
// first-time assignment) and a reason is required - it's stored on the booking and included in
// that guest's email so they know why their time moved.
router.post("/bookings/bulk-assign", async (req, res) => {
  try {
    const { ids, slotTime, sendEmail, reason } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: "ids is required" });
    if (!slotTime || !ALL_SLOTS.includes(slotTime)) return res.status(400).json({ error: "Invalid slot" });

    const bookings = [];
    for (const id of ids) {
      const b = await Booking.findById(id);
      if (b) bookings.push(b);
    }

    const isChangeFor = (b) => Boolean(b.assignedSlot) && b.assignedSlot !== slotTime && ["ALLOCATED", "CONFIRMED"].includes(b.status);
    const changingCount = bookings.filter(isChangeFor).length;
    if (changingCount > 0 && !(reason && reason.trim())) {
      return res.status(400).json({
        error: `${changingCount} of the selected guest(s) already have a confirmed time - a reason is required to change it.`,
        needsReason: true
      });
    }

    let updated = 0;
    let emailed = 0;
    let emailSkipped = 0;
    let blocked = 0;
    for (const booking of bookings) {
      const check = await checkAssignable(booking.date, booking, slotTime);
      if (!check.ok) {
        blocked++;
        continue;
      }
      const isChange = isChangeFor(booking);
      booking.assignedSlot = slotTime;
      booking.requestedSlot = null;
      if (isChange) {
        booking.reviewNote = reason.trim();
        booking.status = "CONFIRMED";
      } else if (booking.status === "PENDING" || booking.status === "NEEDS_REVIEW" || booking.status === "CHANGE_REQUESTED") {
        booking.status = "ALLOCATED";
      }
      await booking.save();
      updated++;
      if (sendEmail) {
        const result = isChange ? await sendChangeConfirmed(booking, reason.trim()) : await sendAllocationEmail(booking);
        if (result && result.skipped) {
          emailSkipped++;
        } else {
          booking.allocationEmailSentAt = new Date();
          await booking.save();
          emailed++;
        }
      }
    }
    res.json({ ok: true, updated, emailed, emailSkipped, blocked });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/admin/bookings/:id/approve-change - move the guest to the slot they requested
router.post("/bookings/:id/approve-change", async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ error: "Not found" });
    if (!booking.requestedSlot) return res.status(400).json({ error: "This booking has no pending change request." });

    const check = await checkAssignable(booking.date, booking, booking.requestedSlot);
    if (!check.ok) return res.status(409).json({ error: check.error });

    booking.assignedSlot = booking.requestedSlot;
    booking.requestedSlot = null;
    booking.status = "CONFIRMED";
    await booking.save();
    const mailResult = await sendChangeConfirmed(booking).catch((e) => {
      console.error("email error:", e.message);
      return { skipped: true, error: e.message };
    });
    res.json({ ok: true, booking, emailSkipped: Boolean(mailResult?.skipped) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/admin/bookings/:id/reject-change - guest goes back to their previously assigned slot
router.post("/bookings/:id/reject-change", async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ error: "Not found" });

    booking.requestedSlot = null;
    booking.status = booking.assignedSlot ? "CONFIRMED" : "NEEDS_REVIEW";
    await booking.save();
    let mailResult = null;
    if (booking.assignedSlot) {
      mailResult = await sendChangeRejected(booking).catch((e) => {
        console.error("email error:", e.message);
        return { skipped: true, error: e.message };
      });
    }
    res.json({ ok: true, booking, emailSkipped: Boolean(mailResult?.skipped) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/admin/slots?date=YYYY-MM-DD  - full grid for the day, color-coded as it fills
router.get("/slots", async (req, res) => {
  const { date } = req.query;
  if (!date) return res.status(400).json({ error: "date is required" });
  const state = await getSlotState(date);
  const slots = ALL_SLOTS.map((slotTime) => {
    const s = state[slotTime];
    return {
      time: slotTime,
      label: formatSlotLabel(slotTime),
      window: windowFor(slotTime),
      blocked: s.blocked,
      blockReason: s.blockReason,
      group: s.group,
      used: s.used,
      max: MAX_PER_SLOT,
      remaining: MAX_PER_SLOT - s.used,
      bookingCount: s.bookings.length,
      level: slotLevel(s.used, MAX_PER_SLOT, s.blocked) // "green" | "yellow" | "red"
    };
  });
  res.json({ slots });
});

// POST /api/admin/slots/block  { date, slotTime, blocked, reason, blockedBy }
router.post("/slots/block", async (req, res) => {
  try {
    const { date, slotTime, blocked, reason, blockedBy } = req.body;
    if (!date || !slotTime) return res.status(400).json({ error: "date and slotTime are required" });
    if (!ALL_SLOTS.includes(slotTime)) return res.status(400).json({ error: "Invalid slot" });

    const doc = await SlotOverride.findOneAndUpdate(
      { date, slotTime },
      { blocked: Boolean(blocked), reason: reason || "", blockedBy: blockedBy || "" },
      { upsert: true, new: true }
    );
    res.json({ ok: true, override: doc });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/admin/allocate  { date }
router.post("/allocate", async (req, res) => {
  try {
    const { date } = req.body;
    if (!date) return res.status(400).json({ error: "date is required" });
    const result = await allocateForDate(date);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/send-emails  { date }  - emails everyone ALLOCATED-but-not-yet-emailed for the date
router.post("/send-emails", async (req, res) => {
  try {
    const { date } = req.body;
    if (!date) return res.status(400).json({ error: "date is required" });

    const toEmail = await Booking.find({
      date,
      status: "ALLOCATED",
      allocationEmailSentAt: null
    });

    let sent = 0;
    let emailSkipped = 0;
    for (const booking of toEmail) {
      const result = await sendAllocationEmail(booking);
      if (result && result.skipped) {
        emailSkipped++;
      } else {
        booking.allocationEmailSentAt = new Date();
        await booking.save();
        sent++;
      }
    }
    res.json({ ok: true, sent, emailSkipped });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/config
router.get("/config", async (req, res) => {
  let config = await Config.findOne({ key: "singleton" });
  if (!config) config = await Config.create({ key: "singleton" });
  res.json({ config });
});

// PATCH /api/admin/config  { hotelName?, frontdeskPhone?, frontdeskEmail? }
router.patch("/config", async (req, res) => {
  const updates = {};
  for (const field of ["hotelName", "frontdeskPhone", "frontdeskEmail"]) {
    if (req.body[field] !== undefined) updates[field] = req.body[field];
  }
  const config = await Config.findOneAndUpdate(
    { key: "singleton" },
    { $set: updates },
    { upsert: true, new: true }
  );
  res.json({ ok: true, config });
});

// GET /api/admin/qrcode?url=https://...  - PNG for printing/posting at the front desk
router.get("/qrcode", async (req, res) => {
  try {
    const url = req.query.url;
    if (!url) return res.status(400).json({ error: "url is required" });
    const png = await QRCode.toBuffer(url, { width: 400, margin: 2 });
    res.set("Content-Type", "image/png");
    res.send(png);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
