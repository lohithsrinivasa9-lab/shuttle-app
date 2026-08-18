// Hotel room numbering by floor, used to build the guest booking form's floor/room dropdowns
// instead of a free-text field. Update these ranges here if the hotel's room numbering changes -
// nothing else in the app hardcodes room numbers.
const ROOM_FLOORS = {
  3: { start: 303, end: 355 },
  4: { start: 401, end: 455 },
  5: { start: 501, end: 555 }
};

function roomsForFloor(floor) {
  const range = ROOM_FLOORS[floor];
  if (!range) return [];
  const out = [];
  for (let n = range.start; n <= range.end; n++) out.push(String(n));
  return out;
}

function allFloors() {
  return Object.keys(ROOM_FLOORS)
    .map(Number)
    .sort((a, b) => a - b)
    .map((floor) => ({ floor, rooms: roomsForFloor(floor) }));
}

function isValidRoomNumber(room) {
  const n = Number(room);
  if (!Number.isInteger(n)) return false;
  return Object.values(ROOM_FLOORS).some((r) => n >= r.start && n <= r.end);
}

module.exports = { ROOM_FLOORS, roomsForFloor, allFloors, isValidRoomNumber };
