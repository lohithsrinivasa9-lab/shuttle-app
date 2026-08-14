const express = require("express");
const router = express.Router();
const Booking = require("../models/Booking");
const { getSlotState, openSlotsFor } = require("../utils/allocate");
const { formatSlotLabel } = require("../utils/slots");

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
      requestedSlot: booking.requestedSlot,
      requestedSlotLabel: booking.requestedSlot ? formatSlotLabel(booking.requestedSlot) : null,
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
      // Requesting a change no longer confirms anything on the spot - it just flags the
      // booking for front desk to approve or reject. assignedSlot is left untouched so
      // front desk can revert to it if they reject the request.
      if (!newSlot) {
        booking.status = "CHANGE_REQUESTED";
        booking.requestedSlot = null;
        await booking.save();
        return res.json({ ok: true, status: booking.status, needsSelection: true });
      }

      const state = await getSlotState(booking.date);
      const open = openSlotsFor(state, booking.destination, booking.partySize);
      if (!open.includes(newSlot)) {
        return res.status(409).json({ error: "That slot just filled up. Please pick another." });
      }

      booking.status = "CHANGE_REQUESTED";
      booking.requestedSlot = newSlot;
      await booking.save();
      return res.json({ ok: true, status: booking.status, requestedSlot: booking.requestedSlot, pendingApproval: true });
    }

    return res.status(400).json({ error: "Unknown action" });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
