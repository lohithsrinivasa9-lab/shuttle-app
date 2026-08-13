const mongoose = require("mongoose");
const crypto = require("crypto");

const DESTINATIONS = ["AIRPORT", "STADIUM", "FERRY", "TRAIN"];
const DIRECTIONS = ["DROPOFF", "PICKUP"]; // DROPOFF = hotel -> destination, PICKUP = destination -> hotel

const STATUSES = [
  "PENDING",          // just booked, waiting for allocation
  "ALLOCATED",        // assigned a slot by the algorithm/front desk, email sent, awaiting guest response
  "CONFIRMED",        // guest accepted (or picked a slot themselves during a change request)
  "REJECTED",         // guest rejected, no further action
  "CHANGE_REQUESTED", // guest asked to change, currently picking a new slot
  "NEEDS_REVIEW"      // could not be auto-allocated, or no alternate slot was available - front desk must handle manually
];

const bookingSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    partySize: { type: Number, required: true, min: 1, max: 20 },
    email: { type: String, required: true, trim: true, lowercase: true },
    phone: { type: String, required: true, trim: true },
    roomNumber: { type: String, required: true, trim: true },

    destination: { type: String, required: true, enum: DESTINATIONS },
    direction: { type: String, required: true, enum: DIRECTIONS },

    date: { type: String, required: true }, // "YYYY-MM-DD"
    preferredSlots: {
      type: [String], // e.g. ["07:00", "08:00", "16:00"], 2-3 entries, in preference order
      required: true,
      validate: {
        validator: (arr) => arr.length >= 2 && arr.length <= 3,
        message: "Choose 2 or 3 preferred time slots"
      }
    },

    status: { type: String, enum: STATUSES, default: "PENDING" },
    assignedSlot: { type: String, default: null },

    reviewNote: { type: String, default: "" },
    respondToken: { type: String, default: () => crypto.randomBytes(20).toString("hex"), unique: true },
    allocationEmailSentAt: { type: Date, default: null }
  },
  { timestamps: true }
);

bookingSchema.index({ date: 1, assignedSlot: 1, status: 1 });

module.exports = mongoose.model("Booking", bookingSchema);
module.exports.DESTINATIONS = DESTINATIONS;
module.exports.DIRECTIONS = DIRECTIONS;
module.exports.STATUSES = STATUSES;
