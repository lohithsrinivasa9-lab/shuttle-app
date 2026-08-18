const express = require("express");
const router = express.Router();
const Booking = require("../models/Booking");
const { getSlotState } = require("../utils/allocate");
const { ALL_SLOTS, windowFor, formatSlotLabel, isSlotPast } = require("../utils/slots");
const { sendBookingReceived } = require("../utils/mailer");
const { isValidName, isValidEmail, PHONE_COUNTRIES, isValidPhoneDigits } = require("../utils/validate");
const { allFloors, isValidRoomNumber } = require("../utils/rooms");

// GET /api/bookings/slots?date=YYYY-MM-DD
// Public list of slots for the booking form, with blocked/already-passed ones flagged so the
// UI can grey them out and guests can't select a time that's already happened today.
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
      full: !state[slotTime].blocked && state[slotTime].used >= 20,
      past: isSlotPast(date, slotTime)
    }));
    res.json({ slots });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/bookings/rooms - floor -> room number dropdown data for the booking form.
router.get("/rooms", (req, res) => {
  res.json({ floors: allFloors() });
});

// GET /api/bookings/phone-countries - dial code dropdown data for the booking form.
router.get("/phone-countries", (req, res) => {
  res.json({ countries: PHONE_COUNTRIES });
});

// POST /api/bookings
// Guest submits the booking form (from the QR-code page).
router.post("/", async (req, res) => {
  try {
    const {
      name, partySize, email, phoneDial, phoneNumber, roomNumbers, destination, direction, date,
      preferredSlots, notes, wheelchairAccessible, accessibilityNote
    } = req.body;

    const cleanRooms = Array.isArray(roomNumbers) ? roomNumbers.map((r) => String(r).trim()).filter(Boolean) : [];
    const roomsRequired = direction !== "PICKUP"; // not mandatory when being picked up from the destination

    if (!name || !partySize || !email || !phoneDial || !phoneNumber || (roomsRequired && cleanRooms.length === 0) || !destination || !direction || !date || !preferredSlots) {
      return res.status(400).json({ error: `All fields are required${roomsRequired ? " (including at least one room number)" : ""}.` });
    }
    if (!isValidName(name)) {
      return res.status(400).json({ error: "Please enter a valid name (letters only)." });
    }
    if (!isValidEmail(email)) {
      return res.status(400).json({ error: "Please enter a valid email address." });
    }
    const digitsOnly = String(phoneNumber).replace(/\D/g, "");
    if (!isValidPhoneDigits(phoneDial, digitsOnly)) {
      return res.status(400).json({ error: "Please enter a valid phone number for the selected country." });
    }
    if (cleanRooms.some((r) => !isValidRoomNumber(r))) {
      return res.status(400).json({ error: "One or more room numbers are outside the valid range." });
    }
    if (!Array.isArray(preferredSlots) || preferredSlots.length < 2 || preferredSlots.length > 3) {
      return res.status(400).json({ error: "Choose 2 or 3 preferred time slots." });
    }
    const invalidSlot = preferredSlots.find((s) => !ALL_SLOTS.includes(s));
    if (invalidSlot) return res.status(400).json({ error: `Invalid time slot: ${invalidSlot}` });
    const pastSlot = preferredSlots.find((s) => isSlotPast(date, s));
    if (pastSlot) {
      return res.status(400).json({ error: `${formatSlotLabel(pastSlot)} has already passed today. Please choose an upcoming time.` });
    }

    const phone = `${phoneDial} ${digitsOnly}`;

    const booking = await Booking.create({
      name: name.trim(),
      partySize,
      email,
      phone,
      roomNumbers: cleanRooms,
      destination,
      direction,
      date,
      preferredSlots,
      notes: (notes || "").trim(),
      wheelchairAccessible: Boolean(wheelchairAccessible),
      accessibilityNote: (accessibilityNote || "").trim()
    });

    sendBookingReceived(booking)
      .then((result) => {
        if (!result || !result.skipped) {
          booking.bookingReceivedEmailSentAt = new Date();
          return booking.save();
        }
      })
      .catch((e) => console.error("email error:", e.message));

    res.status(201).json({ ok: true, booking });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
