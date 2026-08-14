// Shared dashboard for front desk + driver (no login, no role split).
const app = document.getElementById("app");
const DEST_LABEL = { AIRPORT: "Airport", STADIUM: "Stadium", FERRY: "Ferry", TRAIN: "Train" };
const DEST_LABEL_FULL = { AIRPORT: "Airport", STADIUM: "Stadium", FERRY: "Ferry Terminal", TRAIN: "Train Station" };
const MORNING_TIMES = ["07:00", "08:00", "09:00", "10:00", "11:00", "12:00", "13:00"];
const EVENING_TIMES = ["16:00", "17:00", "18:00", "19:00", "20:00", "21:00"];

let currentTab = "today";
let todayInfo = null; // { today, previousDay, upcomingMax, historyMin, emailConfigured }
let config = {};
let pickerDate = { upcoming: null, history: null };
let selected = new Set();
let showAllSlots = false;

// Snapshot of the currently-rendered day view, kept so the bulk bar can re-render itself
// (e.g. when the "show all slots" toggle flips) without refetching from the server.
let currentView = { date: null, slots: [], bookings: [] };

function banner(msg, isError) {
  document.getElementById("banner").innerHTML = msg
    ? `<div class="banner ${isError ? "error" : ""}">${msg}</div>`
    : "";
}

async function api(method, path, body) {
  const res = await fetch(path, {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

function fmtTimestamp(iso) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function niceDate(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

function roomsText(b) {
  return (b.roomNumbers && b.roomNumbers.length) ? b.roomNumbers.join(", ") : "—";
}

async function init() {
  const [t, c] = await Promise.all([api("GET", "/api/admin/today"), api("GET", "/api/admin/config")]);
  todayInfo = t;
  config = c.config;
  pickerDate.upcoming = addDaysStr(todayInfo.today, 1);
  pickerDate.history = addDaysStr(todayInfo.previousDay, -1);

  if (!todayInfo.emailConfigured) {
    document.getElementById("mail-warning").innerHTML = `
      <div class="banner error">
        Email sending isn't configured yet (no Gmail credentials set) - guests will NOT receive
        emails until <code>GMAIL_USER</code> and <code>GMAIL_APP_PASSWORD</code> are added in your
        host's environment variables. Assignments/approvals still work, they just won't notify guests.
      </div>`;
  }

  document.querySelectorAll(".tabbtn").forEach((btn) => {
    btn.addEventListener("click", () => setTab(btn.dataset.tab));
  });
  document.getElementById("guest-modal-overlay").addEventListener("click", (e) => {
    if (e.target.id === "guest-modal-overlay") closeGuestModal();
  });
  setTab("today");

  // Catch the 7 AM rollover if the dashboard is left open.
  setInterval(async () => {
    const t2 = await api("GET", "/api/admin/today");
    if (t2.today !== todayInfo.today) {
      todayInfo = t2;
      if (currentTab === "today" || currentTab === "previous") render();
    }
  }, 5 * 60 * 1000);
}

function addDaysStr(dateStr, n) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + n);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

function setTab(tab) {
  currentTab = tab;
  selected = new Set();
  showAllSlots = false;
  document.querySelectorAll(".tabbtn").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
  render();
}

async function render() {
  banner("");
  if (currentTab === "settings") return renderSettings();

  const dateInfo = {
    today: { date: todayInfo.today, title: `Today - ${niceDate(todayInfo.today)}`, note: "Resets automatically at 7:00 AM each day.", picker: null },
    previous: { date: todayInfo.previousDay, title: `Previous Day - ${niceDate(todayInfo.previousDay)}`, note: "", picker: null },
    upcoming: { date: pickerDate.upcoming, title: "Upcoming Reservations", note: `Bookable up to ${niceDate(todayInfo.upcomingMax)}.`, picker: { min: todayInfo.today, max: todayInfo.upcomingMax, key: "upcoming" } },
    history: { date: pickerDate.history, title: "Previous Reservations", note: "", picker: { min: todayInfo.historyMin, max: todayInfo.previousDay, key: "history" } }
  }[currentTab];

  await renderDayView(dateInfo);
}

async function renderDayView(info) {
  const [slotsRes, bookingsRes] = await Promise.all([
    api("GET", `/api/admin/slots?date=${info.date}`),
    api("GET", `/api/admin/bookings?date=${info.date}&sort=asc`)
  ]);
  const slots = slotsRes.slots;
  const bookings = bookingsRes.bookings;
  currentView = { date: info.date, slots, bookings };
  const byTime = Object.fromEntries(slots.map((s) => [s.time, s]));

  app.innerHTML = `
    <div class="toolbar">
      <div>
        <h2 style="margin:0;">${info.title}</h2>
        ${info.note ? `<p class="muted" style="margin:2px 0 0;">${info.note}</p>` : ""}
      </div>
      ${info.picker ? `<input type="date" id="picker-input" value="${info.date}" min="${info.picker.min}" max="${info.picker.max}" style="width:auto; margin-left:auto;" />` : ""}
    </div>

    <div class="grid-2">
      <div>
        <div class="window-title">Morning (7 AM - 2 PM)</div>
        <div class="slot-grid" style="grid-template-columns:1fr;">${MORNING_TIMES.map((t) => slotCard(byTime[t])).join("")}</div>
      </div>
      <div>
        <div class="window-title">Evening (4 PM - 10 PM)</div>
        <div class="slot-grid" style="grid-template-columns:1fr;">${EVENING_TIMES.map((t) => slotCard(byTime[t])).join("")}</div>
      </div>
    </div>

    <h2>Requests <span class="muted">(${bookings.length}, oldest first)</span></h2>
    ${bookings.length === 0 ? `<p class="muted">No requests for this date.</p>` : bookings.map((b) => requestRow(b)).join("")}

    <div id="bulkbar-slot"></div>
  `;

  if (info.picker) {
    document.getElementById("picker-input").addEventListener("change", (e) => {
      pickerDate[info.picker.key] = e.target.value;
      render();
    });
  }

  slots.forEach((s) => {
    const el = document.getElementById(`slot-${s.time}`);
    if (el) el.addEventListener("click", () => toggleBlock(info.date, s));
  });

  bookings.forEach((b) => {
    const cb = document.getElementById(`chk-${b._id}`);
    if (cb) cb.addEventListener("change", () => { cb.checked ? selected.add(b._id) : selected.delete(b._id); renderBulkBar(); });
    const nameBtn = document.getElementById(`name-${b._id}`);
    if (nameBtn) nameBtn.addEventListener("click", () => openGuestModal(b));
    const approveBtn = document.getElementById(`approve-${b._id}`);
    if (approveBtn) approveBtn.addEventListener("click", () => approveChange(b._id));
    const rejectBtn = document.getElementById(`reject-${b._id}`);
    if (rejectBtn) rejectBtn.addEventListener("click", () => rejectChange(b._id));
  });

  renderBulkBar();
}

function slotCard(s) {
  return `<div class="slot-status ${s.level}" id="slot-${s.time}">
    <div class="row">
      <span><span class="dot ${s.level}"></span><b>${s.label}</b></span>
      <span class="count">${s.blocked ? "Blocked" : `${s.used}/${s.max}`}${s.group ? " · " + s.group : ""}</span>
    </div>
  </div>`;
}

function requestRow(b) {
  const isChange = b.status === "CHANGE_REQUESTED";
  return `<div class="card">
    <div class="req-row">
      <input type="checkbox" id="chk-${b._id}" ${selected.has(b._id) ? "checked" : ""} />
      <div class="req-body">
        <div class="row">
          <button class="guest-link" id="name-${b._id}" type="button">${b.name}</button>
          <span class="pill ${b.status}">${b.status.replace("_", " ")}</span>
        </div>
        <p class="muted" style="margin:2px 0;">
          Room ${roomsText(b)} · ${b.partySize} guest(s) · ${DEST_LABEL[b.destination] || b.destination} ·
          ${b.direction === "DROPOFF" ? "Out" : "Return"} · requested ${fmtTimestamp(b.createdAt)}
        </p>
        <p style="margin:2px 0;">
          Preferred: <span class="muted">${b.preferredSlotLabels.join(", ")}</span> &nbsp;|&nbsp;
          Assigned: <b>${b.assignedSlotLabel || "—"}</b>
        </p>
        ${isChange ? `
          <div class="banner" style="margin-top:8px;">
            ${b.requestedSlotLabel
              ? `Guest wants <b>${b.requestedSlotLabel}</b> instead of ${b.assignedSlotLabel || "their current time"}.`
              : `Guest asked for a different time (no specific slot chosen). Use the checkbox below to regroup them into a slot.`}
            ${b.requestedSlotLabel ? `
              <div class="btn-row" style="margin-top:8px;">
                <button class="btn small" id="approve-${b._id}">Approve → move to ${b.requestedSlotLabel}</button>
                <button class="btn small secondary" id="reject-${b._id}">Reject → keep ${b.assignedSlotLabel || "current time"}</button>
              </div>` : ""}
          </div>` : ""}
      </div>
    </div>
  </div>`;
}

// --- Guest detail modal ---
function openGuestModal(b) {
  const overlay = document.getElementById("guest-modal-overlay");
  const box = document.getElementById("guest-modal-box");
  box.innerHTML = `
    <button class="btn secondary small modal-close" id="modal-close-btn">Close</button>
    <h2>${b.name}</h2>
    <div class="field"><b>Status</b><span class="pill ${b.status}">${b.status.replace("_", " ")}</span></div>
    <div class="field"><b>Room(s)</b>${roomsText(b)}</div>
    <div class="field"><b>Party size</b>${b.partySize} guest(s)</div>
    <div class="field"><b>Email</b><a href="mailto:${b.email}">${b.email}</a></div>
    <div class="field"><b>Phone</b><a href="tel:${b.phone}">${b.phone}</a></div>
    <div class="field"><b>Destination</b>${DEST_LABEL_FULL[b.destination] || b.destination} (${b.direction === "DROPOFF" ? "Hotel → Destination" : "Destination → Hotel"})</div>
    <div class="field"><b>Travel date</b>${b.date}</div>
    <div class="field"><b>Preferred times</b>${b.preferredSlotLabels.join(", ")}</div>
    <div class="field"><b>Assigned time</b>${b.assignedSlotLabel || "Not yet assigned"}</div>
    ${b.requestedSlotLabel ? `<div class="field"><b>Requested change to</b>${b.requestedSlotLabel}</div>` : ""}
    <div class="field"><b>Requested</b>${fmtTimestamp(b.createdAt)}</div>
    ${b.allocationEmailSentAt ? `<div class="field"><b>Confirmation emailed</b>${fmtTimestamp(b.allocationEmailSentAt)}</div>` : ""}
  `;
  overlay.classList.remove("hidden");
  document.getElementById("modal-close-btn").addEventListener("click", closeGuestModal);
}

function closeGuestModal() {
  document.getElementById("guest-modal-overlay").classList.add("hidden");
}

// --- Bulk regroup bar ---
// By default, only shows slots that ALL selected guests actually listed as a preference
// (the intersection), so front desk can't accidentally park someone at a time they never
// wanted. "Show all slots" opts out of that restriction for edge cases (e.g. Needs Review).
function candidateSlotTimes() {
  const chosen = currentView.bookings.filter((b) => selected.has(b._id));
  const blockedTimes = new Set(currentView.slots.filter((s) => s.blocked).map((s) => s.time));
  const order = currentView.slots.map((s) => s.time);

  if (showAllSlots) return order.filter((t) => !blockedTimes.has(t));
  if (chosen.length === 0) return [];

  let common = new Set(chosen[0].preferredSlots);
  for (let i = 1; i < chosen.length; i++) {
    const s = new Set(chosen[i].preferredSlots);
    common = new Set([...common].filter((t) => s.has(t)));
  }
  return order.filter((t) => common.has(t) && !blockedTimes.has(t));
}

function renderBulkBar() {
  const wrap = document.getElementById("bulkbar-slot");
  if (!wrap) return;
  if (selected.size === 0) { wrap.innerHTML = ""; return; }

  const byTime = Object.fromEntries(currentView.slots.map((s) => [s.time, s]));
  const candidates = candidateSlotTimes();
  const toggle = `
    <label>
      <input type="checkbox" id="show-all-toggle" ${showAllSlots ? "checked" : ""} />
      Show all slots (override preference)
    </label>`;

  if (candidates.length === 0) {
    wrap.innerHTML = `
      <div class="bulkbar">
        <span><b>${selected.size}</b> selected</span>
        <span class="muted">No preferred time is common to everyone selected${selected.size > 1 ? " - they don't share an overlapping choice" : ""}.</span>
        ${toggle}
      </div>`;
    document.getElementById("show-all-toggle").addEventListener("change", (e) => { showAllSlots = e.target.checked; renderBulkBar(); });
    return;
  }

  wrap.innerHTML = `
    <div class="bulkbar">
      <span><b>${selected.size}</b> selected</span>
      <select id="bulk-slot-select">
        ${candidates.map((t) => {
          const s = byTime[t];
          return `<option value="${t}">${s.label} - ${s.used}/${s.max}</option>`;
        }).join("")}
      </select>
      <button class="btn small" id="bulk-assign-email">Assign &amp; Email</button>
      <button class="btn small secondary" id="bulk-assign-silent">Assign only</button>
      ${toggle}
    </div>`;
  document.getElementById("bulk-assign-email").addEventListener("click", () => bulkAssign(true));
  document.getElementById("bulk-assign-silent").addEventListener("click", () => bulkAssign(false));
  document.getElementById("show-all-toggle").addEventListener("change", (e) => { showAllSlots = e.target.checked; renderBulkBar(); });
}

async function bulkAssign(sendEmail) {
  const slotTime = document.getElementById("bulk-slot-select").value;
  try {
    const res = await api("POST", "/api/admin/bookings/bulk-assign", { ids: [...selected], slotTime, sendEmail });
    let msg = `Moved ${res.updated} request(s) to ${slotTime}.`;
    if (sendEmail) {
      msg += ` Emailed ${res.emailed}.`;
      if (res.emailSkipped) msg += ` ${res.emailSkipped} email(s) were NOT sent - Gmail isn't configured yet.`;
    }
    banner(msg, sendEmail && res.emailSkipped > 0);
    selected = new Set();
    showAllSlots = false;
    render();
  } catch (e) {
    banner(e.message, true);
  }
}

async function approveChange(id) {
  try {
    const res = await api("POST", `/api/admin/bookings/${id}/approve-change`);
    banner(res.emailSkipped ? "Change approved, but the email was NOT sent - Gmail isn't configured yet." : "Change approved and guest notified.", Boolean(res.emailSkipped));
    render();
  } catch (e) { banner(e.message, true); }
}

async function rejectChange(id) {
  try {
    const res = await api("POST", `/api/admin/bookings/${id}/reject-change`);
    banner(res.emailSkipped ? "Change rejected, but the email was NOT sent - Gmail isn't configured yet." : "Change rejected - guest kept their original time and was notified.", Boolean(res.emailSkipped));
    render();
  } catch (e) { banner(e.message, true); }
}

async function toggleBlock(date, s) {
  const blocked = !s.blocked;
  let reason = "";
  if (blocked) reason = prompt("Reason for blocking this slot (optional):") || "Blocked";
  await api("POST", "/api/admin/slots/block", { date, slotTime: s.time, blocked, reason, blockedBy: "dashboard" });
  render();
}

function renderSettings() {
  app.innerHTML = `
    <h2>Hotel &amp; Contact Info</h2>
    <p class="muted">Shown to guests in every email.</p>
    <form id="config-form">
      <label>Hotel name</label>
      <input type="text" id="hotelName" value="${config.hotelName || ""}" />
      <label>Front desk phone</label>
      <input type="text" id="frontdeskPhone" value="${config.frontdeskPhone || ""}" />
      <label>Front desk email</label>
      <input type="email" id="frontdeskEmail" value="${config.frontdeskEmail || ""}" />
      <div class="btn-row"><button class="btn" type="submit">Save</button></div>
    </form>

    <h2>Guest Booking QR Code</h2>
    <p class="muted">Print this and place it at the front desk / in rooms. Points guests straight to the booking page.</p>
    <button class="btn secondary" id="qr-btn">Generate QR Code</button>
    <div id="qr-wrap" style="margin-top:12px;"></div>

    <h2>Dashboard Link</h2>
    <p class="muted">Share this one link with both front desk and driver - no login required.</p>
    <p><code>${location.origin}/dashboard.html</code></p>
  `;
  document.getElementById("config-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const body = {
      hotelName: document.getElementById("hotelName").value,
      frontdeskPhone: document.getElementById("frontdeskPhone").value,
      frontdeskEmail: document.getElementById("frontdeskEmail").value
    };
    const res = await api("PATCH", "/api/admin/config", body);
    config = res.config;
    banner("Saved.");
  });
  document.getElementById("qr-btn").addEventListener("click", () => {
    const url = `${location.origin}/book.html`;
    document.getElementById("qr-wrap").innerHTML = `
      <img src="/api/admin/qrcode?url=${encodeURIComponent(url)}" width="220" height="220" style="border-radius:8px; background:#fff; padding:8px;" />
      <p class="muted">Links to: ${url}</p>`;
  });
}

init();
