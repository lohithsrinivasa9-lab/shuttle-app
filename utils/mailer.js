const nodemailer = require("nodemailer");
const { formatSlotLabel } = require("./slots");
const Config = require("../models/Config");

const DEST_LABEL = { AIRPORT: "Airport", STADIUM: "Stadium", FERRY: "Ferry Terminal", TRAIN: "Train Station" };

function getTransporter() {
  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD
    }
  });
}

async function getBrand() {
  let config = null;
  try {
    config = await Config.findOne({ key: "singleton" });
  } catch (e) {
    // fall through to env defaults below
  }
  return {
    hotelName: config?.hotelName || process.env.HOTEL_NAME || "Our Hotel",
    phone: config?.frontdeskPhone || process.env.FRONTDESK_PHONE || "the front desk",
    email: config?.frontdeskEmail || process.env.FRONTDESK_EMAIL || process.env.GMAIL_USER || ""
  };
}

async function sendMail({ to, subject, html, fromName }) {
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    console.log("[mailer] GMAIL_USER/GMAIL_APP_PASSWORD not set - skipping real send. Preview:");
    console.log(`To: ${to}\nSubject: ${subject}\n${html}\n`);
    return { skipped: true };
  }
  const transporter = getTransporter();
  return transporter.sendMail({
    from: `"${fromName || "Hotel Shuttle"}" <${process.env.GMAIL_USER}>`,
    to,
    subject,
    html
  });
}

function wrap(hotelName, bodyHtml, { phone, email }) {
  return `
  <div style="font-family: -apple-system, Arial, sans-serif; max-width: 480px; margin: 0 auto; color:#1a1a1a;">
    <h2 style="color:#0b5fa5; margin-bottom:4px;">${hotelName}</h2>
    <p style="color:#888; font-size:13px; margin-top:0;">Shuttle Service</p>
    ${bodyHtml}
    <p style="margin-top:26px; padding-top:16px; border-top:1px solid #eee; font-size:13px; color:#666;">
      Questions? Call the front desk at <b>${phone}</b>${email ? ` or email <a href="mailto:${email}" style="color:#0b5fa5;">${email}</a>` : ""}.
    </p>
    <p style="font-size:13px; color:#666;">Safe travels! 🚐</p>
  </div>`;
}

function timeWedge(slotTime) {
  return `
    <div style="margin:18px 0; padding:18px 20px; background:#e7f0fa; border-radius:12px; text-align:center;">
      <div style="font-size:32px; font-weight:800; color:#0b5fa5; letter-spacing:0.5px;">${formatSlotLabel(slotTime)}</div>
    </div>`;
}

function directionLine(booking) {
  const dest = DEST_LABEL[booking.destination] || booking.destination;
  return booking.direction === "DROPOFF" ? `Hotel &rarr; ${dest}` : `${dest} &rarr; Hotel`;
}

async function sendBookingReceived(booking) {
  const brand = await getBrand();
  const html = wrap(brand.hotelName, `
    <p>Hi ${booking.name},</p>
    <p>We've received your shuttle request for <b>${directionLine(booking)}</b>
    on <b>${booking.date}</b> for <b>${booking.partySize}</b> guest(s).</p>
    <p>Your preferred times: ${booking.preferredSlots.map(formatSlotLabel).join(", ")}.</p>
    <p>We group guests by demand to run as few shuttle trips as possible, so we'll confirm your
    exact time slot shortly by email. Thanks for your patience!</p>
  `, brand);
  return sendMail({ to: booking.email, subject: "Shuttle request received", html, fromName: brand.hotelName });
}

async function sendAllocationEmail(booking) {
  const brand = await getBrand();
  const baseUrl = process.env.BASE_URL || "http://localhost:3000";
  const link = `${baseUrl}/respond.html?token=${booking.respondToken}`;
  const html = wrap(brand.hotelName, `
    <p>Hi ${booking.name},</p>
    <p>Your shuttle for <b>${directionLine(booking)}</b> on <b>${booking.date}</b> (${booking.partySize} guest(s))
    is scheduled for:</p>
    ${timeWedge(booking.assignedSlot)}
    <p>Please be in the lobby at least <b>15 minutes before</b> your departure time.</p>
    <p>Let us know if this works for you:</p>
    <p>
      <a href="${link}" style="display:inline-block; padding:10px 18px; background:#0b5fa5; color:#fff; text-decoration:none; border-radius:6px;">
        Review &amp; respond
      </a>
    </p>
    <p style="font-size:13px; color:#666;">You can accept, reject, or request a different time from that page.</p>
  `, brand);
  return sendMail({ to: booking.email, subject: `Your shuttle time is scheduled - ${formatSlotLabel(booking.assignedSlot)}`, html, fromName: brand.hotelName });
}

// Sent when front desk approves a guest's request to move to a different time.
async function sendChangeConfirmed(booking) {
  const brand = await getBrand();
  const html = wrap(brand.hotelName, `
    <p>Hi ${booking.name},</p>
    <p>Your shuttle time for <b>${directionLine(booking)}</b> on <b>${booking.date}</b> has been updated to:</p>
    ${timeWedge(booking.assignedSlot)}
    <p>Please be in the lobby at least <b>15 minutes before</b> your departure time.</p>
  `, brand);
  return sendMail({ to: booking.email, subject: `Your new shuttle time is confirmed - ${formatSlotLabel(booking.assignedSlot)}`, html, fromName: brand.hotelName });
}

// Sent when front desk rejects a guest's change request - they keep their original slot.
async function sendChangeRejected(booking) {
  const brand = await getBrand();
  const html = wrap(brand.hotelName, `
    <p>Hi ${booking.name},</p>
    <p>We're not able to move your shuttle for <b>${directionLine(booking)}</b> on <b>${booking.date}</b> to a
    different time right now. Your shuttle stays as originally scheduled:</p>
    ${timeWedge(booking.assignedSlot)}
    <p>Please be in the lobby at least <b>15 minutes before</b> your departure time. Reach out if you'd
    like to try a different date or have any questions.</p>
  `, brand);
  return sendMail({ to: booking.email, subject: `Your shuttle time remains ${formatSlotLabel(booking.assignedSlot)}`, html, fromName: brand.hotelName });
}

module.exports = {
  sendBookingReceived,
  sendAllocationEmail,
  sendChangeConfirmed,
  sendChangeRejected,
  sendMail,
  getBrand
};
