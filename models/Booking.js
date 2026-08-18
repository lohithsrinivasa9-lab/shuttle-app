const mongoose = require("mongoose");
const crypto = require("crypto");

const DESTINATIONS = ["AIRPORT", "STADIUM", "FERRY", "TRAIN"];
const DIRECTIONS = ["DROPOFF", "PICKUP"]; // DROPOFF = hotel -> destination, PICKUP = destination -> hotel

const STATUSES = [
  "PENDING",          // just booked, waiting for allocation
  "ALLOCATED",        // assigned a slot by the algorithm/front desk, email sent, awaiting guest response
  "CONFIRMED",        // guest accepted (or picked a slot themselves during a change request)
  "REJECTED",         // guest rejected, no further action
  "CHANGE_REQUESTED", // guest asked for a different time; front desk must approve or reject it
  "NEEDS_REVIEW"      // could not be auto-allocated, or no alternate slot was available - front desk must handle manually
];

const bookingSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    partySize: { type: Number, required: true, min: 1, max: 20 },
    email: { type: String, required: true, trim: true, lowercase: true },
    phone: { type: String, required: true, trim: true },
    roomNumbers: {
      type: [String], // one guest booking can cover multiple rooms traveling together
      required: true,
      validate: {
        validator: function (arr) {
          // Not required for pickup trips (destination -> hotel) - the guest may not have
          // checked in / been assigned a room yet.
          if (this.direction === "PICKUP") return true;
          return Array.isArray(arr) && arr.length >= 1 && arr.every((r) => String(r).trim().length > 0);
        },
        message: "Enter at least one room number"
      },
      set: (arr) => (Array.isArray(arr) ? arr.map((r) => String(r).trim()).filter(Boolean) : arr)
    },

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

    notes: { type: String, default: "", trim: true },
    wheelchairAccessible: { type: Boolean, default: false },
    accessibilityNote: { type: String, default: "", trim: true },

    status: { type: String, enum: STATUSES, default: "PENDING" },
    assignedSlot: { type: String, default: null },

    // Set when a guest requests a different time. assignedSlot is left untouched (it's their
    // current/previous confirmed slot) until front desk approves or rejects the request.
    requestedSlot: { type: String, default: null },

    reviewNote: { type: String, default: "" },
    respondToken: { type: String, default: () => crypto.randomBytes(20).toString("hex"), unique: true },
    allocationEmailSentAt: { type: Date, default: null },
    bookingReceivedEmailSentAt: { type: Date, default: null }
  },
  { timestamps: true }
);

bookingSchema.index({ date: 1, assignedSlot: 1, status: 1 });

// Backfill guard: bookings created before multi-room support was added don't have a roomNumbers
// field at all. Mongoose re-validates the WHOLE document on every save (not just changed
// fields), so without this, any unrelated staff action on an old booking - approve, reject,
// bulk-assign, manual edit - would fail with "roomNumbers: Enter at least one room number" even
// though nothing about rooms was touched. This recovers the legacy single `roomNumber` value if
// present, or falls back to a placeholder, so old bookings stay editable. Only fires when the
// field is truly missing (undefined/null) - a deliberately empty array on a new pickup booking
// is left alone, since that's a valid state now.
bookingSchema.pre("validate", function (next) {
  if (this.roomNumbers === undefined || this.roomNumbers === null) {
    const legacy = this.get("roomNumber");
    if (legacy) this.roomNumbers = [String(legacy).trim()];
    else if (this.direction === "PICKUP") this.roomNumbers = [];
    else this.roomNumbers = ["Not provided"];
  }
  next();
});

module.exports = mongoose.model("Booking", bookingSchema);
module.exports.DESTINATIONS = DESTINATIONS;
module.exports.DIRECTIONS = DIRECTIONS;
module.exports.STATUSES = STATUSES;
