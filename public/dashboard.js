const role = document.body.dataset.role; // "frontdesk" or "driver"
const app = document.getElementById("app");

const today = new Date().toISOString().slice(0, 10);
let currentDate = today;
let slots = [];
let bookings = [];
let config = { frontdeskPhone: "" };

const DEST_LABEL = { AIRPORT: "Airport", STADIUM: "Stadium", FERRY: "Ferry", TRAIN: "Train" };

function banner(msg, isError) {
  document.getElementById("banner").innerHTML = msg
    ? `<div class="banner ${isError ? "error" : ""}">${msg}</div>`
    : "";
}

async function loadAll() {
  const [slotsRes, bookingsRes, configRes] = await Promise.all([
    fetch(`/api/admin/slots?date=${currentDate}`).then((r) => r.json()),
    fetch(`/api/admin/bookings?date=${currentDate}`).then((r) => r.json()),
    fetch(`/api/admin/config`).then((r) => r.json())
  ]);
  slots = slotsRes.slots || [];
  bookings = bookingsRes.bookings || [];
  config = configRes.config || {};
  render();
}

function render() {
  app.innerHTML = `
    <div class="toolbar">
      <label style="margin:0;">Date</label>
      <input type="date" id="date-input" value="${currentDate}" style="width:auto;" />
      ${role === "frontdesk" ? `<button class="btn" id="allocate-btn">Run Allocation</button>
      <button class="btn secondary" id="send-emails-btn">Send Allocation Emails</button>` : ""}
    </div>

    <h2>Slot Schedule</h2>
    <p class="muted">Tap a slot to block/unblock it. Airport + Train may share a slot (combined 20 max); every other destination needs its own slot.</p>
    <div class="grid-2">
      <div>
        <div class="window-title">Morning</div>
        ${renderSlotList(slots.filter((s) => ["07:00","08:00","09:00","10:00","11:00","12:00","13:00"].includes(s.time)))}
      </div>
      <div>
        <div class="window-title">Evening</div>
        ${renderSlotList(slots.filter((s) => ["16:00","17:00","18:00","19:00","20:00","21:00"].includes(s.time)))}
      </div>
    </div>

    <h2>Bookings (${bookings.length})</h2>
    ${renderBookingsTable()}

    ${role === "frontdesk" ? renderFrontDeskExtras() : renderDriverExtras()}
  `;

  document.getElementById("date-input").addEventListener("change", (e) => {
    currentDate = e.target.value;
    loadAll();
  });

  slots.forEach((s) => {
    const el = document.getElementById(`slot-${s.time}`);
    if (el) el.addEventListener("click", () => toggleBlock(s));
  });

  if (role === "frontdesk") {
    document.getElementById("allocate-btn").addEventListener("click", runAllocation);
    document.getElementById("send-emails-btn").addEventListener("click", sendEmails);
    const phoneForm = document.getElementById("phone-form");
    if (phoneForm) phoneForm.addEventListener("submit", savePhone);
    const qrBtn = document.getElementById("qr-btn");
    if (qrBtn) qrBtn.addEventListener("click", showQr);
  }

  bookings.forEach((b) => {
    const slotSelect = document.getElementById(`slot-select-${b._id}`);
    if (slotSelect) slotSelect.addEventListener("change", (e) => editBooking(b._id, { assignedSlot: e.target.value }));
    const statusSelect = document.getElementById(`status-select-${b._id}`);
    if (statusSelect) statusSelect.addEventListener("change", (e) => editBooking(b._id, { status: e.target.value }));
  });
}

function renderSlotList(list) {
  return `<div class="slot-grid" style="grid-template-columns:1fr;">
    ${list.map((s) => `
      <div class="card" id="slot-${s.time}" style="cursor:pointer; padding:10px 12px; ${s.blocked ? "opacity:.55;" : ""}">
        <div class="row">
          <b>${s.label}</b>
          <span>${s.blocked ? "🚫 Blocked" : `${s.used}/${s.max}${s.group ? " · " + s.group : ""}`}</span>
        </div>
      </div>`).join("")}
  </div>`;
}

async function toggleBlock(s) {
  const blocked = !s.blocked;
  let reason = "";
  if (blocked) reason = prompt("Reason for blocking this slot (optional):") || "Blocked";
  await fetch("/api/admin/slots/block", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ date: currentDate, slotTime: s.time, blocked, reason, blockedBy: role })
  });
  loadAll();
}

function renderBookingsTable() {
  if (bookings.length === 0) return `<p class="muted">No bookings yet for this date.</p>`;
  const slotOptions = (current) => slots.map((s) => `<option value="${s.time}" ${s.time === current ? "selected" : ""}>${s.label}</option>`).join("");
  const statusOptions = (current) => ["PENDING","ALLOCATED","CONFIRMED","REJECTED","CHANGE_REQUESTED","NEEDS_REVIEW"]
    .map((st) => `<option value="${st}" ${st === current ? "selected" : ""}>${st.replace("_"," ")}</option>`).join("");

  return `<table>
    <thead><tr>
      <th>Guest</th><th>Room</th><th>Party</th><th>Destination</th><th>Direction</th>
      <th>Preferred</th><th>Assigned slot</th><th>Status</th>
    </tr></thead>
    <tbody>
      ${bookings.map((b) => `
        <tr>
          <td>${b.name}<br/><span class="muted">${b.email}<br/>${b.phone}</span></td>
          <td>${b.roomNumber}</td>
          <td>${b.partySize}</td>
          <td>${DEST_LABEL[b.destination] || b.destination}</td>
          <td>${b.direction === "DROPOFF" ? "Out" : "Return"}</td>
          <td class="muted">${b.preferredSlotLabels.join(", ")}</td>
          <td><select id="slot-select-${b._id}"><option value="">-</option>${slotOptions(b.assignedSlot)}</select></td>
          <td>
            <span class="pill ${b.status}">${b.status.replace("_"," ")}</span>
            <select id="status-select-${b._id}" style="margin-top:4px;">${statusOptions(b.status)}</select>
          </td>
        </tr>`).join("")}
    </tbody>
  </table>`;
}

async function editBooking(id, patch) {
  const res = await fetch(`/api/admin/bookings/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch)
  });
  const data = await res.json();
  if (!res.ok) {
    banner(data.error || "Update failed", true);
    return;
  }
  loadAll();
}

async function runAllocation() {
  banner("Running allocation...");
  const res = await fetch("/api/admin/allocate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ date: currentDate })
  });
  const data = await res.json();
  if (!res.ok) return banner(data.error, true);
  banner(data.message);
  loadAll();
}

async function sendEmails() {
  banner("Sending emails...");
  const res = await fetch("/api/admin/send-emails", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ date: currentDate })
  });
  const data = await res.json();
  if (!res.ok) return banner(data.error, true);
  banner(`Sent ${data.sent} allocation email(s).`);
  loadAll();
}

function renderFrontDeskExtras() {
  return `
    <h2>Front Desk Contact Number</h2>
    <form id="phone-form" class="btn-row" style="align-items:center;">
      <input type="text" id="phone-input" value="${config.frontdeskPhone || ""}" style="width:220px;" />
      <button class="btn" type="submit">Save</button>
    </form>

    <h2>Guest Booking QR Code</h2>
    <p class="muted">Print this and place it at the front desk / in rooms. It points guests straight to the booking page.</p>
    <button class="btn secondary" id="qr-btn">Generate QR Code</button>
    <div id="qr-wrap" style="margin-top:12px;"></div>
  `;
}

function renderDriverExtras() {
  return `
    <h2>Front Desk Contact</h2>
    <p>${config.frontdeskPhone || "Not set yet"}</p>
  `;
}

async function savePhone(e) {
  e.preventDefault();
  const phone = document.getElementById("phone-input").value;
  await fetch("/api/admin/config", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ frontdeskPhone: phone })
  });
  banner("Front desk number saved.");
  loadAll();
}

function showQr() {
  const url = `${location.origin}/book.html`;
  document.getElementById("qr-wrap").innerHTML = `
    <img src="/api/admin/qrcode?url=${encodeURIComponent(url)}" width="220" height="220" style="border-radius:8px; background:#fff; padding:8px;" />
    <p class="muted">Links to: ${url}</p>`;
}

loadAll();
