const express = require("express");
const router = express.Router();
const Booking = require("../models/Booking");
const { getSlotState, openSlotsFor } = require("../utils/allocate");
const { formatSlotLabel } = require("../utils/slots");
const { sendChangeConfirmed } = require("../utils/mailer");

// GET /api/respond/:token  -> booking details for the guest response page
router.get("/:token", async (req, res) => {
  const booking = await Booking.findOne({ respondToken: req.params.token }).lean();
  if (!booking) return res.status(404).json({ error: "Not found" });
  res.json({
    booking: {
      name: booking.name,
      destination: booking.destination,
      direction: booking.direction,
      date: booking.date,
      partySize: booking.partySize,
      assignedSlot: booking.assignedSlot,
      assignedSlotLabel: booking.assignedSlot ? formatSlotLabel(booking.assignedSlot) : null,
      status: booking.status
    }
  });
});

// GET /api/respond/:token/alternatives -> other open slots for this guest's destination
router.get("/:token/alternatives", async (req, res) => {
  const booking = await Booking.findOne({ respondToken: req.params.token });
  if (!booking) return res.status(404).json({ error: "Not found" });

  const state = await getSlotState(booking.date);
  const open = openSlotsFor(state, booking.destination, booking.partySize).filter(
    (s) => s !== booking.assignedSlot
  );
  res.json({
    alternatives: open.map((s) => ({ time: s, label: formatSlotLabel(s) }))
  });
});

// POST /api/respond/:token  { action: "accept" | "reject" | "change", newSlot?: "HH:MM" }
router.post("/:token", async (req, res) => {
  try {
    const booking = await Booking.findOne({ respondToken: req.params.token });
    if (!booking) return res.status(404).json({ error: "Not found" });

    const { action, newSlot } = req.body;

    if (action === "accept") {
      booking.status = "CONFIRMED";
      await booking.save();
      return res.json({ ok: true, status: booking.status });
    }

    if (action === "reject") {
      // Spec: no further action needed. Freeing the slot happens automatically because
      // capacity is computed only from ALLOCATED/CONFIRMED bookings.
      booking.status = "REJECTED";
      await booking.save();
      return res.json({ ok: true, status: booking.status });
    }

    if (action === "change") {
      if (!newSlot) {
        booking.status = "CHANGE_REQUESTED";
        await booking.save();
        return res.json({ ok: true, status: booking.status, needsSelection: true });
      }

      // Guest picked a specific alternative slot - confirm it if there's still room.
      const state = await getSlotState(booking.date);
      const open = openSlotsFor(state, booking.destination, booking.partySize);
      if (!open.includes(newSlot)) {
        return res.status(409).json({ error: "That slot just filled up. Please pick another." });
      }

      booking.assignedSlot = newSlot;
      booking.status = "CONFIRMED";
      await booking.save();
      sendChangeConfirmed(booking).catch((e) => console.error("email error:", e.message));
      return res.json({ ok: true, status: booking.status, assignedSlot: booking.assignedSlot });
    }

    return res.status(400).json({ error: "Unknown action" });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
