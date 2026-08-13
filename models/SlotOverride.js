const mongoose = require("mongoose");

// Only slots that have been touched by front desk/driver get a document here.
// Any (date, slotTime) with no document is open by default.
const slotOverrideSchema = new mongoose.Schema(
  {
    date: { type: String, required: true }, // "YYYY-MM-DD"
    slotTime: { type: String, required: true }, // "HH:MM"
    blocked: { type: Boolean, default: false },
    reason: { type: String, default: "" },
    blockedBy: { type: String, default: "" } // "front desk" or "driver"
  },
  { timestamps: true }
);

slotOverrideSchema.index({ date: 1, slotTime: 1 }, { unique: true });

module.exports = mongoose.model("SlotOverride", slotOverrideSchema);
