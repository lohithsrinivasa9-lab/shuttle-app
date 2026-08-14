const token = new URLSearchParams(location.search).get("token");
const content = document.getElementById("content");

function banner(msg, isError) {
  document.getElementById("banner").innerHTML = msg
    ? `<div class="banner ${isError ? "error" : ""}">${msg}</div>`
    : "";
}

async function load() {
  if (!token) {
    content.innerHTML = `<p>Missing link token. Please use the link from your email.</p>`;
    return;
  }
  const res = await fetch(`/api/respond/${token}`);
  const data = await res.json();
  if (!res.ok) {
    content.innerHTML = `<p>${data.error || "This link is no longer valid."}</p>`;
    return;
  }
  render(data.booking);
}

function render(booking) {
  const destLabel = { AIRPORT: "Airport", STADIUM: "Stadium", FERRY: "Ferry Terminal", TRAIN: "Train Station" }[booking.destination];
  const dirLabel = booking.direction === "DROPOFF" ? `Hotel → ${destLabel}` : `${destLabel} → Hotel`;

  const statusBlock = `
    <div class="card">
      <div class="row"><b>${destLabel}</b><span class="pill ${booking.status}">${booking.status.replace("_", " ")}</span></div>
      <p class="muted">${dirLabel} · ${booking.date} · ${booking.partySize} guest(s)</p>
      <p style="font-size:20px; font-weight:700; color:#0b5fa5;">${booking.assignedSlotLabel || "Not yet scheduled"}</p>
    </div>`;

  if (booking.status === "CONFIRMED") {
    content.innerHTML = statusBlock + `<p>You're all set. See you then! 🚐</p>`;
    return;
  }
  if (booking.status === "REJECTED") {
    content.innerHTML = statusBlock + `<p>This request has been cancelled. No further action needed.</p>`;
    return;
  }
  if (booking.status === "CHANGE_REQUESTED") {
    content.innerHTML = statusBlock + `
      <p>${booking.requestedSlotLabel
        ? `We've received your request to move to <b>${booking.requestedSlotLabel}</b>.`
        : `We've received your request for a different time.`}
      The front desk is reviewing it and you'll get an email once it's decided.</p>`;
    return;
  }
  if (booking.status !== "ALLOCATED") {
    content.innerHTML = statusBlock + `<p>We haven't scheduled a time yet - check back soon or call the front desk.</p>`;
    return;
  }

  content.innerHTML = statusBlock + `
    <p>Does this time work for you?</p>
    <div class="btn-row">
      <button class="btn" id="accept-btn">Accept</button>
      <button class="btn secondary" id="change-btn">Request a different time</button>
      <button class="btn danger" id="reject-btn">Reject</button>
    </div>
    <div id="alt-wrap"></div>
  `;

  document.getElementById("accept-btn").onclick = () => respond({ action: "accept" });
  document.getElementById("reject-btn").onclick = () => {
    if (confirm("Reject this shuttle time? No further action will be taken.")) {
      respond({ action: "reject" });
    }
  };
  document.getElementById("change-btn").onclick = showAlternatives;
}

async function showAlternatives() {
  const res = await fetch(`/api/respond/${token}/alternatives`);
  const data = await res.json();
  const wrap = document.getElementById("alt-wrap");
  if (!data.alternatives || data.alternatives.length === 0) {
    wrap.innerHTML = `<p class="muted">No other slots are open for this destination right now. The front desk will reach out.</p>`;
    return;
  }
  wrap.innerHTML = `
    <h2>Pick a different time</h2>
    <div class="slot-grid">
      ${data.alternatives.map((a) => `<div class="slot-chip" data-time="${a.time}">${a.label}</div>`).join("")}
    </div>`;
  wrap.querySelectorAll(".slot-chip").forEach((node) => {
    node.onclick = () => respond({ action: "change", newSlot: node.dataset.time });
  });
}

async function respond(body) {
  banner("");
  const res = await fetch(`/api/respond/${token}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const data = await res.json();
  if (!res.ok) {
    banner(data.error || "Something went wrong", true);
    return;
  }
  load();
}

load();
