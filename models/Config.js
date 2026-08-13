const mongoose = require("mongoose");

// Single-document collection holding site-wide settings editable from front desk.
const configSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true, default: "singleton" },
  frontdeskPhone: { type: String, default: process.env.FRONTDESK_PHONE || "" }
});

module.exports = mongoose.model("Config", configSchema);
