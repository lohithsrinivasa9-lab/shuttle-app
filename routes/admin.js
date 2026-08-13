const express = require("express");
const router = express.Router();
const QRCode = require("qrcode");

const Booking = require("../models/Booking");
const SlotOverride = require("../models/SlotOverride");
const Config = require("../models/Config");
const { getSlotState, allocateForDate } = require("../utils/allocate");
const { ALL_SLOTS, MAX_PER_SLOT, windowFor, formatSlotLabel } = require("../utils/slots");
const { sendAllocationEmail } = require("../utils/mailer");

// Used by both the front desk and driver dashboards. There is no login in this version -
// both roles can view, edit, and block slots. Only front desk triggers "send emails" from its UI.

// GET /api/admin/bookings?date=YYYY-MM-DD
router.get("/bookings", async (req, res) => {
  const { date } = req.query;
  const filter = date ? { date } : {};
  const bookings = await Booking.find(filter).sort({ createdAt: -1 }).lean();
  res.json({
    bookings: bookings.map((b) => ({
      ...b,
      assignedSlotLabel: b.assignedSlot ? formatSlotLabel(b.assignedSlot) : null,
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

// GET /api/admin/slots?date=YYYY-MM-DD  - full grid for the day
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
      bookingCount: s.bookings.length
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
    for (const booking of toEmail) {
      await sendAllocationEmail(booking);
      booking.allocationEmailSentAt = new Date();
      await booking.save();
      sent++;
    }
    res.json({ ok: true, sent });
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

// PATCH /api/admin/config  { frontdeskPhone }
router.patch("/config", async (req, res) => {
  const config = await Config.findOneAndUpdate(
    { key: "singleton" },
    { $set: { frontdeskPhone: req.body.frontdeskPhone } },
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
