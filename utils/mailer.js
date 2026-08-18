const nodemailer = require("nodemailer");
const { formatSlotLabel } = require("./slots");
const Config = require("../models/Config");

const DEST_LABEL = { AIRPORT: "Airport", STADIUM: "Stadium", FERRY: "Ferry Terminal", TRAIN: "Train Station" };

// One pooled connection, reused for every send, instead of opening a fresh SMTP connection per
// email. Rebuilt if credentials change (rare, but happens right after adding them via env vars).
let transporter = null;
let transporterKey = null;
function getTransporter() {
  const key = `${process.env.GMAIL_USER}:${process.env.GMAIL_APP_PASSWORD}`;
  if (!transporter || transporterKey !== key) {
    transporter = nodemailer.createTransport({
      service: "gmail",
      pool: true,
      maxConnections: 1,
      maxMessages: 100,
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD
      }
    });
    transporterKey = key;
  }
  return transporter;
}

// Serializes every outbound send through one queue. Without this, a guest submitting a few
// bookings back to back (or front desk bulk-emailing a group) fires several concurrent SMTP
// sends at once, which can race or get throttled by Gmail - sometimes silently dropping a send
// that only ever gets logged to a server console nobody's watching. Queueing means each send
// waits its turn; one failure doesn't block the ones behind it.
let sendQueue = Promise.resolve();
function enqueueSend(task) {
  const run = sendQueue.then(task, task);
  sendQueue = run.catch(() => {});
  return run;
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
  return enqueueSend(() =>
    getTransporter().sendMail({
      from: `"${fromName || "Hotel Shuttle"}" <${process.env.GMAIL_USER}>`,
      to,
      subject,
      html
    })
  );
}

// Placeholder logo - swap /public/email-assets/logo.png for the real hotel logo whenever it's
// ready (same filename, same square-ish aspect ratio works best). Served as a normal static
// file, so it just needs to be reachable at BASE_URL/email-assets/logo.png.
function wrap(hotelName, bodyHtml, { phone, email }) {
  const baseUrl = process.env.BASE_URL || "http://localhost:3000";
  const logoUrl = `${baseUrl}/email-assets/logo.png`;
  return `
  <div style="font-family: -apple-system, Arial, sans-serif; max-width: 480px; margin: 0 auto; color:#1a1a1a; text-align:center;">
    <img src="${logoUrl}" alt="${hotelName}" width="84" height="84" style="display:block; margin:0 auto 10px;" />
    <h1 style="color:#0b5fa5; margin:0 0 2px; font-size:23px;">${hotelName}</h1>
    <p style="color:#b8860b; font-size:12px; letter-spacing:1.5px; text-transform:uppercase; margin:0 0 14px; font-weight:700;">Shuttle Service</p>
    <div style="height:3px; background:linear-gradient(90deg,#d4a529,#f0d16a,#d4a529); margin:0 0 22px; border-radius:2px;"></div>
    <div style="text-align:left;">
      ${bodyHtml}
    </div>
    <p style="margin-top:26px; padding-top:16px; border-top:1px solid #eee; font-size:13px; color:#666; text-align:left;">
      Questions? Call the front desk at <b>${phone}</b>${email ? ` or email <a href="mailto:${email}" style="color:#0b5fa5;">${email}</a>` : ""}.
    </p>
    <p style="font-size:13px; color:#666; text-align:left;">Safe travels! 🚐</p>
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

function roomLine(booking) {
  const rooms = booking.roomNumbers && booking.roomNumbers.length ? booking.roomNumbers.join(", ") : null;
  return rooms ? ` (Room${booking.roomNumbers.length > 1 ? "s" : ""} ${rooms})` : "";
}

async function sendBookingReceived(booking) {
  const brand = await getBrand();
  const html = wrap(brand.hotelName, `
    <p>Hi ${booking.name},</p>
    <p>We've received your shuttle request for <b>${directionLine(booking)}</b>
    on <b>${booking.date}</b> for <b>${booking.partySize}</b> guest(s)${roomLine(booking)}.</p>
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
    <p>Your shuttle for <b>${directionLine(booking)}</b> on <b>${booking.date}</b> (${booking.partySize} guest(s)${roomLine(booking)})
    is scheduled for:</p>
    ${timeWedge(booking.assignedSlot)}
    <p>Please be in the lobby at least <b>15 minutes before</b> your departure time.</p>
    <p>Need a different time, or just want to confirm this one works?</p>
    <p style="text-align:center; margin:22px 0;">
      <a href="${link}" style="display:inline-block; width:100%; max-width:320px; box-sizing:border-box; padding:14px 18px; background:#0b5fa5; color:#fff; text-decoration:none; border-radius:8px; font-weight:700; font-size:16px; text-align:center;">
        Request Changes
      </a>
    </p>
    <p style="font-size:13px; color:#666;">That page also lets you accept or reject this time directly.</p>
  `, brand);
  return sendMail({ to: booking.email, subject: `Your shuttle time is scheduled - ${formatSlotLabel(booking.assignedSlot)}`, html, fromName: brand.hotelName });
}

// Sent when front desk approves a guest's own change request, OR when front desk moves an
// already-assigned/confirmed guest to a different time on their own initiative (in which case a
// reason is required and included here so the guest knows why their time changed).
async function sendChangeConfirmed(booking, reason) {
  const brand = await getBrand();
  const html = wrap(brand.hotelName, `
    <p>Hi ${booking.name},</p>
    <p>Your shuttle time for <b>${directionLine(booking)}</b> on <b>${booking.date}</b> has been updated to:</p>
    ${timeWedge(booking.assignedSlot)}
    ${reason ? `<p><b>Reason for the change:</b> ${reason}</p>` : ""}
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
