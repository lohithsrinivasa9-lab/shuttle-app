const dateInput = document.getElementById("date");
const toLocalDateStr = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function todayStr() { return toLocalDateStr(new Date()); }
function fourMonthsOutStr() {
  const d = new Date();
  d.setMonth(d.getMonth() + 4);
  return toLocalDateStr(d);
}

// Browsers sometimes restore stale form field values on a page refresh (bfcache / form
// autofill), which can silently overwrite the date field back to whatever it was before the
// reload instead of today. Re-asserting the default here, on load AND on pageshow (covers the
// back/forward-cache case), plus the explicit "Reset to today" button, keeps this reliable.
function setDefaultDate() {
  dateInput.value = todayStr();
  dateInput.min = todayStr();
  dateInput.max = fourMonthsOutStr();
}
setDefaultDate();
window.addEventListener("pageshow", (e) => {
  if (e.persisted) {
    setDefaultDate();
    selectedSlots = [];
    loadSlots();
  }
});
document.getElementById("reset-date-btn").addEventListener("click", () => {
  setDefaultDate();
  selectedSlots = [];
  loadSlots();
});

let selectedSlots = []; // ordered array of slot times, preference order
let slotsData = [];
let roomFloors = []; // [{ floor, rooms: [...] }]
let phoneCountries = [];

// --- Room number(s), scoped to floor 3-5 dropdowns instead of free text ---
const roomListEl = document.getElementById("room-list");
const roomSection = document.getElementById("room-section");
const roomNotNeeded = document.getElementById("room-not-needed");
const directionSelect = document.getElementById("direction");

function roomsForFloor(floor) {
  const entry = roomFloors.find((f) => String(f.floor) === String(floor));
  return entry ? entry.rooms : [];
}

function addRoomRow() {
  const row = document.createElement("div");
  row.className = "room-row";
  row.style.display = "flex";
  row.style.gap = "8px";
  row.style.marginTop = "6px";
  const defaultFloor = roomFloors[0] ? roomFloors[0].floor : "";
  row.innerHTML = `
    <select class="room-floor" style="flex:0 0 auto; width:auto;">
      ${roomFloors.map((f) => `<option value="${f.floor}">Floor ${f.floor}</option>`).join("")}
    </select>
    <select class="room-input" style="flex:1;"></select>
    <button type="button" class="btn secondary small remove-room-btn" style="flex:0;">Remove</button>
  `;
  roomListEl.appendChild(row);

  const floorSel = row.querySelector(".room-floor");
  const roomSel = row.querySelector(".room-input");
  const populateRooms = () => {
    roomSel.innerHTML = roomsForFloor(floorSel.value).map((r) => `<option value="${r}">${r}</option>`).join("");
  };
  floorSel.value = defaultFloor;
  populateRooms();
  floorSel.addEventListener("change", populateRooms);

  row.querySelector(".remove-room-btn").addEventListener("click", () => {
    if (roomListEl.querySelectorAll(".room-row").length > 1) row.remove();
  });
}

function renderRoomInputs() {
  if (roomListEl.querySelectorAll(".room-row").length === 0) addRoomRow();
}

document.getElementById("add-room-btn").addEventListener("click", addRoomRow);

function getRoomNumbers() {
  return [...roomListEl.querySelectorAll(".room-input")].map((el) => el.value).filter(Boolean);
}

function updateRoomVisibility() {
  const isPickup = directionSelect.value === "PICKUP";
  roomSection.style.display = isPickup ? "none" : "";
  roomNotNeeded.style.display = isPickup ? "" : "none";
}
directionSelect.addEventListener("change", updateRoomVisibility);

// --- Accessibility note toggle ---
const wheelchairCheckbox = document.getElementById("wheelchair");
const accessibilityWrap = document.getElementById("accessibility-note-wrap");
wheelchairCheckbox.addEventListener("change", () => {
  accessibilityWrap.style.display = wheelchairCheckbox.checked ? "" : "none";
});

// --- Phone country dropdown ---
const phoneDialSelect = document.getElementById("phone-dial");
const phoneNumberInput = document.getElementById("phone-number");
phoneNumberInput.addEventListener("input", () => {
  phoneNumberInput.value = phoneNumberInput.value.replace(/\D/g, "");
});

function renderPhoneCountries() {
  phoneDialSelect.innerHTML = phoneCountries.map((c) => `<option value="${c.dial}">${c.dial} ${c.name}</option>`).join("");
  const us = phoneCountries.find((c) => c.code === "US");
  if (us) phoneDialSelect.value = us.dial;
}

function banner(msg, isError) {
  document.getElementById("banner").innerHTML = msg
    ? `<div class="banner ${isError ? "error" : ""}">${msg}</div>`
    : "";
}

async function loadSlots() {
  const date = dateInput.value;
  const res = await fetch(`/api/bookings/slots?date=${date}`);
  const data = await res.json();
  slotsData = data.slots || [];
  selectedSlots = selectedSlots.filter((s) => slotsData.some((sd) => sd.time === s && !sd.blocked && !sd.past));
  renderSlots();
}

function renderSlots() {
  const morning = slotsData.filter((s) => s.window === "morning");
  const evening = slotsData.filter((s) => s.window === "evening");
  const el = document.getElementById("slot-container");
  const chip = (s) => {
    const rankIdx = selectedSlots.indexOf(s.time);
    const selected = rankIdx > -1;
    const disabled = s.blocked || s.past;
    return `<div class="slot-chip ${selected ? "selected" : ""} ${disabled ? "disabled" : ""}" data-time="${s.time}">
      ${selected ? `<span class="rank">#${rankIdx + 1}</span>` : ""}${s.label}${s.past && !s.blocked ? `<span class="rank">Passed</span>` : ""}
    </div>`;
  };
  el.innerHTML = `
    <div class="window-title">Morning (7:00 AM - 2:00 PM)</div>
    <div class="slot-grid">${morning.map(chip).join("")}</div>
    <div class="window-title">Evening (4:00 PM - 10:00 PM)</div>
    <div class="slot-grid">${evening.map(chip).join("")}</div>
  `;
  el.querySelectorAll(".slot-chip").forEach((node) => {
    node.addEventListener("click", () => {
      if (node.classList.contains("disabled")) return;
      const time = node.dataset.time;
      const idx = selectedSlots.indexOf(time);
      if (idx > -1) {
        selectedSlots.splice(idx, 1);
      } else {
        if (selectedSlots.length >= 3) selectedSlots.shift();
        selectedSlots.push(time);
      }
      renderSlots();
      updateSlotCountMsg();
    });
  });
  updateSlotCountMsg();
}

function updateSlotCountMsg() {
  const msgEl = document.getElementById("slot-count-msg");
  if (selectedSlots.length === 0) {
    msgEl.textContent = "Select 2 or 3 preferred times.";
  } else if (selectedSlots.length === 1) {
    msgEl.textContent = "Select at least 1 more time (2-3 total).";
  } else {
    msgEl.textContent = "";
  }
}

dateInput.addEventListener("change", loadSlots);

// Keep "past" status accurate as real time passes while the page is left open on today's date.
setInterval(() => {
  if (dateInput.value === todayStr()) loadSlots();
}, 60 * 1000);

function fieldError(id, msg) {
  const el = document.getElementById(id);
  if (el) el.textContent = msg || "";
}

const NAME_RE = /^[A-Za-z][A-Za-z'\-.\s]{0,79}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function init() {
  const [roomsRes, countriesRes] = await Promise.all([
    fetch("/api/bookings/rooms").then((r) => r.json()),
    fetch("/api/bookings/phone-countries").then((r) => r.json())
  ]);
  roomFloors = roomsRes.floors || [];
  phoneCountries = countriesRes.countries || [];
  renderPhoneCountries();
  renderRoomInputs();
  updateRoomVisibility();
  loadSlots();
}
init();

document.getElementById("booking-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  banner("");
  fieldError("name-error", "");
  fieldError("email-error", "");
  fieldError("phone-error", "");

  if (selectedSlots.length < 2) {
    banner("Please select at least 2 preferred time slots.", true);
    return;
  }

  const name = document.getElementById("name").value.trim();
  if (!NAME_RE.test(name)) {
    fieldError("name-error", "Please enter a valid name (letters only).");
    return;
  }

  const email = document.getElementById("email").value.trim();
  if (!EMAIL_RE.test(email)) {
    fieldError("email-error", "Please enter a valid email address.");
    return;
  }

  const phoneDial = phoneDialSelect.value;
  const phoneNumber = phoneNumberInput.value.trim();
  if (!phoneNumber) {
    fieldError("phone-error", "Please enter your phone number.");
    return;
  }

  const isPickup = directionSelect.value === "PICKUP";
  const roomNumbers = isPickup ? [] : getRoomNumbers();
  if (!isPickup && roomNumbers.length === 0) {
    banner("Please select at least one room number.", true);
    return;
  }

  const payload = {
    name,
    roomNumbers,
    partySize: Number(document.getElementById("partySize").value),
    email,
    phoneDial,
    phoneNumber,
    destination: document.getElementById("destination").value,
    direction: directionSelect.value,
    date: dateInput.value,
    preferredSlots: selectedSlots,
    notes: document.getElementById("notes").value.trim(),
    wheelchairAccessible: wheelchairCheckbox.checked,
    accessibilityNote: document.getElementById("accessibilityNote").value.trim()
  };

  const submitBtn = document.getElementById("submit-btn");
  submitBtn.disabled = true;
  submitBtn.textContent = "Submitting...";

  try {
    const res = await fetch("/api/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Something went wrong");

    document.getElementById("form-wrap").innerHTML = `
      <div class="card">
        <h2 style="margin-top:0;">Request received!</h2>
        <p>Thanks, ${payload.name}. We'll email <b>${payload.email}</b> once your shuttle time is confirmed.</p>
        <p class="muted">Preferred times: ${selectedSlots.map((t) => slotsData.find((s) => s.time === t)?.label || t).join(", ")}</p>
      </div>`;
  } catch (err) {
    banner(err.message, true);
    submitBtn.disabled = false;
    submitBtn.textContent = "Request Shuttle";
  }
});
