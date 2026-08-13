const nodemailer = require("nodemailer");
const { formatSlotLabel } = require("./slots");

function getTransporter() {
  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD
    }
  });
}

async function sendMail({ to, subject, html }) {
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    console.log("[mailer] GMAIL_USER/GMAIL_APP_PASSWORD not set - skipping real send. Preview:");
    console.log(`To: ${to}\nSubject: ${subject}\n${html}\n`);
    return { skipped: true };
  }
  const transporter = getTransporter();
  return transporter.sendMail({
    from: `"Hotel Shuttle" <${process.env.GMAIL_USER}>`,
    to,
    subject,
    html
  });
}

function wrap(bodyHtml) {
  return `
  <div style="font-family: -apple-system, Arial, sans-serif; max-width: 480px; margin: 0 auto; color:#1a1a1a;">
    <h2 style="color:#0b5fa5;">Hotel Shuttle</h2>
    ${bodyHtml}
    <p style="margin-top:24px; font-size:13px; color:#666;">
      Questions? Call the front desk at ${process.env.FRONTDESK_PHONE || "the front desk"}.
    </p>
  </div>`;
}

async function sendBookingReceived(booking) {
  const html = wrap(`
    <p>Hi ${booking.name},</p>
    <p>We've received your shuttle request for <b>${booking.destination}</b>
    (${booking.direction === "DROPOFF" ? "hotel &rarr; " + booking.destination : booking.destination + " &rarr; hotel"})
    on <b>${booking.date}</b> for <b>${booking.partySize}</b> guest(s).</p>
    <p>Your preferred times: ${booking.preferredSlots.map(formatSlotLabel).join(", ")}.</p>
    <p>We group guests by demand to run as few shuttle trips as possible, so we'll confirm your
    exact time slot shortly by email. Thanks for your patience!</p>
  `);
  return sendMail({ to: booking.email, subject: "Shuttle request received", html });
}

async function sendAllocationEmail(booking) {
  const baseUrl = process.env.BASE_URL || "http://localhost:3000";
  const link = `${baseUrl}/respond.html?token=${booking.respondToken}`;
  const html = wrap(`
    <p>Hi ${booking.name},</p>
    <p>Your shuttle to/from <b>${booking.destination}</b> on <b>${booking.date}</b> has been
    scheduled for:</p>
    <p style="font-size:20px; font-weight:bold; color:#0b5fa5;">${formatSlotLabel(booking.assignedSlot)}</p>
    <p>Party size: ${booking.partySize}. Please let us know if this works:</p>
    <p>
      <a href="${link}" style="display:inline-block; padding:10px 18px; background:#0b5fa5; color:#fff; text-decoration:none; border-radius:6px;">
        Review &amp; respond
      </a>
    </p>
    <p style="font-size:13px; color:#666;">You can accept, reject, or request a different time from that page.</p>
  `);
  return sendMail({ to: booking.email, subject: "Your shuttle time is scheduled", html });
}

async function sendChangeConfirmed(booking) {
  const html = wrap(`
    <p>Hi ${booking.name},</p>
    <p>Your new shuttle time to/from <b>${booking.destination}</b> on <b>${booking.date}</b> is confirmed:</p>
    <p style="font-size:20px; font-weight:bold; color:#0b5fa5;">${formatSlotLabel(booking.assignedSlot)}</p>
  `);
  return sendMail({ to: booking.email, subject: "Your new shuttle time is confirmed", html });
}

module.exports = { sendBookingReceived, sendAllocationEmail, sendChangeConfirmed, sendMail };
