const dateInput = document.getElementById("date");
const today = new Date();
const fourMonthsOut = new Date(today);
fourMonthsOut.setMonth(fourMonthsOut.getMonth() + 4);
const toLocalDateStr = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
dateInput.value = toLocalDateStr(today);
dateInput.min = toLocalDateStr(today);
dateInput.max = toLocalDateStr(fourMonthsOut);

let selectedSlots = []; // ordered array of slot times, preference order
let slotsData = [];

// --- Room number(s) ---
const roomListEl = document.getElementById("room-list");

function renderRoomInputs() {
  const count = roomListEl.querySelectorAll(".room-row").length;
  if (count === 0) addRoomRow();
}

function addRoomRow() {
  const row = document.createElement("div");
  row.className = "room-row";
  row.style.display = "flex";
  row.style.gap = "8px";
  row.style.marginTop = "6px";
  row.innerHTML = `
    <input type="text" class="room-input" placeholder="Room number" required style="flex:1;" />
    <button type="button" class="btn secondary small remove-room-btn" style="flex:0;">Remove</button>
  `;
  roomListEl.appendChild(row);
  row.querySelector(".remove-room-btn").addEventListener("click", () => {
    if (roomListEl.querySelectorAll(".room-row").length > 1) row.remove();
  });
}

document.getElementById("add-room-btn").addEventListener("click", addRoomRow);
renderRoomInputs();

function getRoomNumbers() {
  return [...roomListEl.querySelectorAll(".room-input")]
    .map((el) => el.value.trim())
    .filter(Boolean);
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
  selectedSlots = selectedSlots.filter((s) => slotsData.some((sd) => sd.time === s && !sd.blocked));
  renderSlots();
}

function renderSlots() {
  const morning = slotsData.filter((s) => s.window === "morning");
  const evening = slotsData.filter((s) => s.window === "evening");
  const el = document.getElementById("slot-container");
  const chip = (s) => {
    const rankIdx = selectedSlots.indexOf(s.time);
    const selected = rankIdx > -1;
    const disabled = s.blocked;
    return `<div class="slot-chip ${selected ? "selected" : ""} ${disabled ? "disabled" : ""}" data-time="${s.time}">
      ${selected ? `<span class="rank">#${rankIdx + 1}</span>` : ""}${s.label}
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
    });
  });
}

dateInput.addEventListener("change", loadSlots);
loadSlots();

document.getElementById("booking-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  banner("");

  if (selectedSlots.length < 2) {
    banner("Please select at least 2 preferred time slots.", true);
    return;
  }

  const roomNumbers = getRoomNumbers();
  if (roomNumbers.length === 0) {
    banner("Please enter at least one room number.", true);
    return;
  }

  const payload = {
    name: document.getElementById("name").value.trim(),
    roomNumbers,
    partySize: Number(document.getElementById("partySize").value),
    email: document.getElementById("email").value.trim(),
    phone: document.getElementById("phone").value.trim(),
    destination: document.getElementById("destination").value,
    direction: document.getElementById("direction").value,
    date: dateInput.value,
    preferredSlots: selectedSlots
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
