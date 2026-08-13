const express = require("express");
const router = express.Router();
const Booking = require("../models/Booking");
const { getSlotState } = require("../utils/allocate");
const { ALL_SLOTS, windowFor, formatSlotLabel } = require("../utils/slots");
const { sendBookingReceived } = require("../utils/mailer");

// GET /api/bookings/slots?date=YYYY-MM-DD
// Public list of slots for the booking form, with blocked ones flagged so the UI can grey them out.
router.get("/slots", async (req, res) => {
  try {
    const date = req.query.date;
    if (!date) return res.status(400).json({ error: "date is required" });
    const state = await getSlotState(date);
    const slots = ALL_SLOTS.map((slotTime) => ({
      time: slotTime,
      label: formatSlotLabel(slotTime),
      window: windowFor(slotTime),
      blocked: state[slotTime].blocked,
      full: !state[slotTime].blocked && state[slotTime].used >= 20
    }));
    res.json({ slots });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/bookings
// Guest submits the booking form (from the QR-code page).
router.post("/", async (req, res) => {
  try {
    const { name, partySize, email, phone, roomNumber, destination, direction, date, preferredSlots } = req.body;

    if (!name || !partySize || !email || !phone || !roomNumber || !destination || !direction || !date || !preferredSlots) {
      return res.status(400).json({ error: "All fields are required." });
    }
    if (!Array.isArray(preferredSlots) || preferredSlots.length < 2 || preferredSlots.length > 3) {
      return res.status(400).json({ error: "Choose 2 or 3 preferred time slots." });
    }
    const invalidSlot = preferredSlots.find((s) => !ALL_SLOTS.includes(s));
    if (invalidSlot) return res.status(400).json({ error: `Invalid time slot: ${invalidSlot}` });

    const booking = await Booking.create({
      name, partySize, email, phone, roomNumber, destination, direction, date, preferredSlots
    });

    sendBookingReceived(booking).catch((e) => console.error("email error:", e.message));

    res.status(201).json({ ok: true, booking });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
