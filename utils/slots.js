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

module.exports = {
  MORNING,
  EVENING,
  ALL_SLOTS,
  MAX_PER_SLOT,
  COMBINABLE_GROUP,
  destinationGroup,
  windowFor,
  formatSlotLabel
};
