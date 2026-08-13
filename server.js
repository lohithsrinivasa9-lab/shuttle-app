require("dotenv").config();
const path = require("path");
const express = require("express");
const cors = require("cors");
const connectDB = require("./config/db");

const bookingRoutes = require("./routes/booking");
const respondRoutes = require("./routes/respond");
const adminRoutes = require("./routes/admin");

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.use("/api/bookings", bookingRoutes);
app.use("/api/respond", respondRoutes);
app.use("/api/admin", adminRoutes);

app.get("/health", (req, res) => res.json({ ok: true }));

// Friendly root -> booking page (this is what the QR code should point to)
app.get("/", (req, res) => {
  res.redirect("/book.html");
});

const PORT = process.env.PORT || 3000;

connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`Shuttle booking app running on port ${PORT}`);
  });
});
