const mongoose = require("mongoose");

// Single-document collection holding site-wide settings editable from front desk.
const configSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true, default: "singleton" },
  hotelName: { type: String, default: process.env.HOTEL_NAME || "Our Hotel" },
  frontdeskPhone: { type: String, default: process.env.FRONTDESK_PHONE || "" },
  frontdeskEmail: { type: String, default: process.env.FRONTDESK_EMAIL || process.env.GMAIL_USER || "" }
});

module.exports = mongoose.model("Config", configSchema);
