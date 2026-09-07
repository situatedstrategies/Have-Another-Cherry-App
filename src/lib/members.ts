// Group roster helpers. A group has two kinds of seats: joined members (real
// accounts, in `members` / `memberIds` / `defaultSplit`) and pending seats
// (`availableSplits`: a name and a percentage waiting for someone to redeem
// the invite code). Pending seats are surfaced as `ghost_<index>` pseudo
// members so every screen can render one roster.
//
// Mirrored in the Flutter app's `lib/domain/group/seats.dart`; change them
// together.

import { Group } from '../types';

// A group can be created with up to five people, and an existing group can
// grow by up to two more after the fact (a couple bringing in a roommate, a
// household adding a relative). The two limits are separate on purpose: the
// growth allowance is what lets a two-person group become four without
// starting over, and the hard cap keeps the ledger readable.
export const MAX_GROUP_MEMBERS = 5;
export const MAX_ADDED_SEATS = 2;

export interface PendingSeat {
  name: string;
  split: number;
}

export const getFullMembers = (group: any) => {
  if (!group) return [];
  const members = [...(group.members || [])];
  const splits = group.availableSplits || [];
  splits.forEach((s, idx) => {
    members.push({
      uid: `ghost_${idx}`,
      name: typeof s === 'string' ? s : s.name,
      email: ''
    });
  });
  return members;
};

export const getFullDefaultSplit = (group: any) => {
  if (!group) return {};
  const ds = { ...(group.defaultSplit || {}) };
  const splits = group.availableSplits || [];
  splits.forEach((s, idx) => {
    ds[`ghost_${idx}`] = typeof s === 'object' ? s.split : 0;
  });
  return ds;
};

/** Pending seats in their canonical object form. Legacy groups stored a bare
 *  number (just the percentage) or a bare string (just the name). */
export const pendingSeats = (group: Partial<Group> | null | undefined): PendingSeat[] => {
  const raw: any[] = Array.isArray(group?.availableSplits) ? (group!.availableSplits as any[]) : [];
  return raw.map((s, idx) => {
    if (s && typeof s === 'object') {
      return { name: String(s.name || `Person ${idx + 2}`), split: Number(s.split) || 0 };
    }
    if (typeof s === 'number') return { name: `Person ${idx + 2}`, split: s };
    return { name: String(s || `Person ${idx + 2}`), split: 0 };
  });
};

/** Unique uids of everyone who has actually joined. Counted from both lists
 *  so a half-joined member (in one list but not the other) still counts once. */
export const joinedUids = (group: Partial<Group> | null | undefined): string[] => {
  const ids = new Set<string>();
  (group?.memberIds || []).forEach(id => { if (id) ids.add(id); });
  (group?.members || []).forEach(m => { if (m?.uid) ids.add(m.uid); });
  return Array.from(ids);
};

/** The smallest capacity a group is ever written with. A group of one is a
 *  person keeping their own ledger, and the invite code they are still shown
 *  has to work when someone uses it. */
export const MIN_GROUP_CAPACITY = 2;

/** How many people the group is sized for: the join flow refuses anyone past
 *  this. Groups written before the field existed fall back to the hard cap;
 *  a group written with a capacity of one reads as two. */
export const groupCapacity = (group: Partial<Group> | null | undefined): number => {
  const n = Number(group?.targetNumPeople) || 0;
  if (n <= 0) return MAX_GROUP_MEMBERS;
  return Math.max(MIN_GROUP_CAPACITY, n);
};

/** Joined members plus pending seats: every seat that is spoken for. */
export const seatsInUse = (group: Partial<Group> | null | undefined): number =>
  joinedUids(group).length + pendingSeats(group).length;

export const addedSeats = (group: Partial<Group> | null | undefined): number =>
  Math.max(0, Math.floor(Number(group?.addedSeats) || 0));

/** Why a seat cannot be added right now, or null when one can. */
export const seatAddBlocker = (group: Partial<Group> | null | undefined): string | null => {
  if (!group) return 'No group loaded.';
  if (addedSeats(group) >= MAX_ADDED_SEATS) {
    return 'This group has already grown by two people, which is as far as a group can grow.';
  }
  if (seatsInUse(group) >= MAX_GROUP_MEMBERS) {
    return `A group can have up to ${MAX_GROUP_MEMBERS} people.`;
  }
  return null;
};

export const canAddSeat = (group: Partial<Group> | null | undefined): boolean =>
  seatAddBlocker(group) === null;

/** The percentage a new seat is offered by default: an equal share of the
 *  roster it is joining. */
export const suggestedSeatPercent = (group: Partial<Group> | null | undefined): number =>
  Math.round(100 / (Math.max(0, seatsInUse(group)) + 1));

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Scale a list of percentages so they add up to `target`, to one decimal,
 *  with the rounding remainder placed on the largest entry so the sum is
 *  exact. Entries that are all zero get an equal share each. */
export const scalePercents = (values: number[], target: number): number[] => {
  if (values.length === 0) return [];
  const safeTarget = Math.max(0, round1(target));
  const sum = values.reduce((a, b) => a + (Number(b) || 0), 0);
  const scaled = sum > 0
    ? values.map(v => round1(((Number(v) || 0) / sum) * safeTarget))
    : values.map(() => round1(safeTarget / values.length));
  const drift = round1(safeTarget - scaled.reduce((a, b) => a + b, 0));
  if (drift !== 0) {
    let big = 0;
    scaled.forEach((v, i) => { if (v > scaled[big]) big = i; });
    scaled[big] = round1(scaled[big] + drift);
  }
  return scaled;
};

export interface SeatUpdate {
  defaultSplit: Record<string, number>;
  availableSplits: PendingSeat[];
  targetNumPeople: number;
  addedSeats: number;
}

/** Rebalance the joined and pending shares so that, together with `reserve`,
 *  they add up to 100. Joined members come first in the scaled list. */
const rebalance = (
  group: Partial<Group>,
  pending: PendingSeat[],
  reserve: number
): { defaultSplit: Record<string, number>; availableSplits: PendingSeat[] } => {
  const uids = joinedUids(group);
  const current = group.defaultSplit || {};
  const values = [
    ...uids.map(uid => Number(current[uid]) || 0),
    ...pending.map(p => p.split),
  ];
  const scaled = scalePercents(values, 100 - reserve);
  const defaultSplit: Record<string, number> = {};
  uids.forEach((uid, i) => { defaultSplit[uid] = scaled[i]; });
  const availableSplits = pending.map((p, i) => ({ name: p.name, split: scaled[uids.length + i] }));
  return { defaultSplit, availableSplits };
};

/**
 * Add one pending seat for `name` at `percent`, shrinking everyone else's
 * share proportionally so the split still totals 100. Returns the fields to
 * write to the group document. Throws when the group cannot grow.
 */
export const withAddedSeat = (group: Partial<Group>, name: string, percent: number): SeatUpdate => {
  const blocker = seatAddBlocker(group);
  if (blocker) throw new Error(blocker);
  const cleanName = name.trim();
  if (!cleanName) throw new Error('Enter a name for the new person.');
  const pct = round1(Number(percent));
  if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
    throw new Error('Enter a percentage between 0 and 100.');
  }
  const pending = [...pendingSeats(group), { name: cleanName, split: pct }];
  // Scale everyone who was already here into what is left after the new seat.
  const { defaultSplit, availableSplits } = rebalance(group, pending.slice(0, -1), pct);
  availableSplits.push({ name: cleanName, split: pct });
  return {
    defaultSplit,
    availableSplits,
    targetNumPeople: Math.max(groupCapacity(group), seatsInUse(group) + 1),
    addedSeats: addedSeats(group) + 1,
  };
};

/**
 * Drop the pending seat at `index` and hand its share back to everyone else,
 * proportionally. Capacity shrinks with it so the invite code cannot be
 * redeemed for a seat nobody set up. A removed seat gives the growth
 * allowance back, so adding the wrong name is not a permanent mistake.
 */
export const withRemovedSeat = (group: Partial<Group>, index: number): SeatUpdate => {
  const pending = pendingSeats(group);
  if (index < 0 || index >= pending.length) throw new Error('That seat no longer exists.');
  const remaining = pending.filter((_, i) => i !== index);
  const { defaultSplit, availableSplits } = rebalance(group, remaining, 0);
  const seats = joinedUids(group).length + remaining.length;
  return {
    defaultSplit,
    availableSplits,
    // Floors at two rather than at the seats that exist: removing the last
    // pending seat used to write a capacity of one, after which every invite
    // was refused as "already full" while Settings still showed the code.
    targetNumPeople: Math.max(MIN_GROUP_CAPACITY, seats),
    addedSeats: Math.max(0, addedSeats(group) - 1),
  };
};
