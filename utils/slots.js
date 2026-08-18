// Defines the fixed daily shuttle timetable: 7am-2pm and 4pm-10pm, hourly runs.
const MORNING = ["07:00", "08:00", "09:00", "10:00", "11:00", "12:00", "13:00"]; // last run 1-2pm
const EVENING = ["16:00", "17:00", "18:00", "19:00", "20:00", "21:00"]; // last run 9-10pm

const ALL_SLOTS = [...MORNING, ...EVENING];

const MAX_PER_SLOT = 20;

// Destinations that are allowed to share a single slot (combined capacity <= MAX_PER_SLOT).
// Every other destination must have its own exclusive slot.
const COMBINABLE_GROUP = ["AIRPORT", "TRAIN"];

function destinationGroup(destination) {
  return COMBINABLE_GROUP.includes(destination) ? "AIRPORT_TRAIN" : destination;
}

function windowFor(slotTime) {
  return MORNING.includes(slotTime) ? "morning" : "evening";
}

function formatSlotLabel(slotTime) {
  const [h, m] = slotTime.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${period}`;
}

// "YYYY-MM-DD" in local time (avoids the UTC-shift bug you get from toISOString()).
function formatLocalDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// The shuttle "day" runs 7:00 AM - 10:00 PM, with nothing scheduled overnight, so the
// dashboard's "Today" view rolls over at 7:00 AM rather than midnight. Before 7 AM, "today"
// is still treated as the previous calendar date. Uses the server's local timezone - set the
// TZ environment variable to the hotel's timezone if the host's default differs.
function getOperationalDate(now = new Date()) {
  const d = new Date(now);
  if (d.getHours() < 7) {
    d.setDate(d.getDate() - 1);
  }
  return formatLocalDate(d);
}

function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + n);
  return formatLocalDate(dt);
}

function addMonths(dateStr, n) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setMonth(dt.getMonth() + n);
  return formatLocalDate(dt);
}

// Traffic-light status for a slot as it fills up.
function slotLevel(used, max, blocked) {
  if (blocked) return "red";
  if (used >= max) return "red";
  if (used >= max * 0.5) return "yellow";
  return "green";
}

// The actual Date a given "YYYY-MM-DD" + "HH:MM" slot represents, in local time.
function slotDateTime(dateStr, slotTime) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const [h, mi] = slotTime.split(":").map(Number);
  return new Date(y, m - 1, d, h, mi);
}

// True once a slot's departure time has arrived or passed. No buffer beyond "already started" -
// a slot 1 minute in the future is still bookable.
function isSlotPast(dateStr, slotTime, now = new Date()) {
  return slotDateTime(dateStr, slotTime).getTime() <= now.getTime();
}

module.exports = {
  MORNING,
  EVENING,
  ALL_SLOTS,
  MAX_PER_SLOT,
  COMBINABLE_GROUP,
  destinationGroup,
  windowFor,
  formatSlotLabel,
  formatLocalDate,
  getOperationalDate,
  addDays,
  addMonths,
  slotLevel,
  slotDateTime,
  isSlotPast
};
