const Booking = require("../models/Booking");
const SlotOverride = require("../models/SlotOverride");
const { ALL_SLOTS, MAX_PER_SLOT, destinationGroup } = require("./slots");

const ACTIVE_STATUSES = ["ALLOCATED", "CONFIRMED"];

/**
 * Build a picture of every slot for a given date: which destination-group (if any)
 * currently "owns" it, how many seats are used, how many remain, and whether it is
 * blocked by front desk/driver.
 */
async function getSlotState(date) {
  const [overrides, activeBookings] = await Promise.all([
    SlotOverride.find({ date }).lean(),
    Booking.find({ date, status: { $in: ACTIVE_STATUSES } }).lean()
  ]);

  const blockedMap = {};
  overrides.forEach((o) => {
    if (o.blocked) blockedMap[o.slotTime] = o.reason || "Blocked";
  });

  const state = {};
  ALL_SLOTS.forEach((slotTime) => {
    state[slotTime] = {
      slotTime,
      blocked: Boolean(blockedMap[slotTime]),
      blockReason: blockedMap[slotTime] || "",
      group: null, // which destination-group has claimed this slot, e.g. "STADIUM" or "AIRPORT_TRAIN"
      used: 0,
      bookings: []
    };
  });

  activeBookings.forEach((b) => {
    const slot = state[b.assignedSlot];
    if (!slot) return; // stale/invalid slot, ignore defensively
    const group = destinationGroup(b.destination);
    if (!slot.group) slot.group = group;
    slot.used += b.partySize;
    slot.bookings.push(b);
  });

  return state;
}

/**
 * Slots a given destination could still be assigned to right now:
 * not blocked, and either unclaimed or already claimed by the same destination-group,
 * with enough remaining seats for partySize.
 */
function openSlotsFor(state, destination, partySize) {
  const group = destinationGroup(destination);
  return ALL_SLOTS.filter((slotTime) => {
    const s = state[slotTime];
    if (s.blocked) return false;
    if (s.group && s.group !== group) return false;
    return MAX_PER_SLOT - s.used >= partySize;
  });
}

/**
 * Greedy "majority cluster" allocation for one travel date.
 * For each destination-group, guests are matched to slots starting with whichever
 * candidate slot has the most demand (i.e. the majority preference), filling each
 * slot up to MAX_PER_SLOT before moving to the next slot. Guests are tried against
 * their preferences in order (1st choice, then 2nd, then 3rd).
 *
 * Returns a summary and leaves bookings updated in the database:
 *  - matched bookings -> status "ALLOCATED", assignedSlot set
 *  - unmatched bookings -> status "NEEDS_REVIEW"
 */
async function allocateForDate(date) {
  const pending = await Booking.find({ date, status: "PENDING" });
  if (pending.length === 0) {
    return { allocated: 0, needsReview: 0, message: "No pending bookings for this date." };
  }

  const state = await getSlotState(date);

  // Group pending bookings by destination-group (AIRPORT + TRAIN share a pool).
  const groups = {};
  pending.forEach((b) => {
    const g = destinationGroup(b.destination);
    groups[g] = groups[g] || [];
    groups[g].push(b);
  });

  let allocatedCount = 0;
  const stillUnassigned = new Set(pending.map((b) => String(b._id)));

  for (const group of Object.keys(groups)) {
    const bookings = groups[group];
    const remaining = new Map(bookings.map((b) => [String(b._id), b]));

    // Try 1st choice, then 2nd, then 3rd preference, in that order.
    for (let round = 0; round < 3; round++) {
      if (remaining.size === 0) break;

      // Tally demand (total people) per slot for this round's preference.
      const demand = {};
      remaining.forEach((b) => {
        const slot = b.preferredSlots[round];
        if (!slot) return;
        demand[slot] = (demand[slot] || 0) + b.partySize;
      });

      // Highest demand ("majority") slot first.
      const candidateSlots = Object.keys(demand).sort((a, b) => demand[b] - demand[a]);

      for (const slotTime of candidateSlots) {
        const s = state[slotTime];
        if (s.blocked) continue;
        if (s.group && s.group !== group) continue; // slot already claimed by a different destination

        // Guests requesting this slot at this preference round, largest party first
        // so bigger groups aren't starved by many small ones sneaking in first.
        const wanters = [...remaining.values()]
          .filter((b) => b.preferredSlots[round] === slotTime)
          .sort((a, b) => b.partySize - a.partySize);

        for (const b of wanters) {
          const free = MAX_PER_SLOT - s.used;
          if (b.partySize > free) continue; // doesn't fit this round, try again next round/slot
          s.used += b.partySize;
          s.group = group;
          b.status = "ALLOCATED";
          b.assignedSlot = slotTime;
          await b.save();
          allocatedCount++;
          remaining.delete(String(b._id));
          stillUnassigned.delete(String(b._id));
        }
      }
    }

    // Anything left after 3 rounds could not be fit into any preferred slot.
    for (const b of remaining.values()) {
      b.status = "NEEDS_REVIEW";
      b.reviewNote = "None of the requested time slots had room. Needs manual assignment.";
      await b.save();
    }
  }

  return {
    allocated: allocatedCount,
    needsReview: stillUnassigned.size,
    message: `Allocated ${allocatedCount} booking(s). ${stillUnassigned.size} need manual review.`
  };
}

/**
 * The single source of truth for "can this booking go into this slot right now?" - used by every
 * path that assigns a slot (manual PATCH, bulk-assign, approve-change), not just the automatic
 * algorithm and the guest's own self-service change request. Without this shared check, staff
 * tools could put two conflicting destinations in the same slot even though the algorithm and
 * guest-facing flow both forbid it.
 */
async function checkAssignable(date, booking, slotTime) {
  const state = await getSlotState(date);
  const s = state[slotTime];
  if (!s) return { ok: false, error: "Invalid slot" };
  if (s.blocked) return { ok: false, error: `That slot is blocked${s.blockReason ? ": " + s.blockReason : ""}.` };

  const group = destinationGroup(booking.destination);
  let used = s.used;
  let slotGroup = s.group;

  // If this booking already sits in this exact slot, back its own contribution out first so
  // re-saving it into the same slot (or just growing party size) isn't blocked by itself.
  if (booking.assignedSlot === slotTime) {
    used -= booking.partySize;
    if (s.bookings.length === 1 && String(s.bookings[0]._id) === String(booking._id)) slotGroup = null;
  }

  if (slotGroup && slotGroup !== group) {
    const label = slotGroup === "AIRPORT_TRAIN" ? "the airport/train" : slotGroup.toLowerCase();
    return { ok: false, error: `That time is already running to ${label}. Pick a slot not already claimed by a different destination.` };
  }
  if (MAX_PER_SLOT - used < booking.partySize) {
    return { ok: false, error: "That slot doesn't have enough room for this party size." };
  }
  return { ok: true };
}

module.exports = { getSlotState, openSlotsFor, allocateForDate, checkAssignable, ACTIVE_STATUSES };
