// Seat helpers (lib/members): growing a group by up to two people, removing a
// pending seat, and the proportional rebalance that keeps the split at 100.
// Run with `npm run test:parity`.
import {
  withAddedSeat,
  withRemovedSeat,
  seatAddBlocker,
  scalePercents,
  seatsInUse,
  groupCapacity,
  suggestedSeatPercent,
  MAX_ADDED_SEATS,
} from '../src/lib/members';

let bad = 0;
const check = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) bad++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ` (got ${JSON.stringify(got)}, want ${JSON.stringify(want)})`}`);
};
const sum = (o: Record<string, number>, extra: { split: number }[] = []) =>
  Math.round((Object.values(o).reduce((a, b) => a + b, 0) + extra.reduce((a, s) => a + s.split, 0)) * 10) / 10;

const couple = {
  id: 'G', inviteCode: 'G', categories: [],
  members: [{ uid: 'a', name: 'A', email: '' }, { uid: 'b', name: 'B', email: '' }],
  memberIds: ['a', 'b'],
  defaultSplit: { a: 60, b: 40 },
  targetNumPeople: 2,
};

// The bug this exists for: a two-person group was "full" at two.
check('two joined, sized for two: capacity is 2', groupCapacity(couple), 2);
check('two joined, sized for two: seats in use is 2', seatsInUse(couple), 2);
check('a couple may add a seat', seatAddBlocker(couple), null);
check('suggested share for a third is an equal third', suggestedSeatPercent(couple), 33);

const three = withAddedSeat(couple, 'Casey', 30);
check('third seat: capacity grows to 3', three.targetNumPeople, 3);
check('third seat: pending seat carries the name and share', three.availableSplits, [{ name: 'Casey', split: 30 }]);
check('third seat: the couple is scaled into the remaining 70, keeping their 60/40 ratio', three.defaultSplit, { a: 42, b: 28 });
check('third seat: total is still 100', sum(three.defaultSplit, three.availableSplits), 100);
check('third seat: growth counter is 1', three.addedSeats, 1);

const withThree = { ...couple, ...three };
const four = withAddedSeat(withThree, 'Dana', 25);
check('fourth seat: capacity grows to 4', four.targetNumPeople, 4);
check('fourth seat: total is still 100', sum(four.defaultSplit, four.availableSplits), 100);
check('fourth seat: growth counter is 2', four.addedSeats, 2);
check('fourth seat: pending seats keep their order', four.availableSplits.map(s => s.name), ['Casey', 'Dana']);

const withFour = { ...couple, ...four };
check('a fifth would be a third addition: refused', typeof seatAddBlocker(withFour), 'string');
let threw = '';
try { withAddedSeat(withFour, 'Eve', 10); } catch (e: any) { threw = e.message; }
check('withAddedSeat throws past the growth allowance', threw.length > 0, true);
check('growth allowance constant is two', MAX_ADDED_SEATS, 2);

// Removing a pending seat hands its share back proportionally and refunds the
// allowance, so a typo in a name is not a permanent mistake.
const removed = withRemovedSeat(withFour, 0);
check('remove pending: only Dana is left pending', removed.availableSplits.map(s => s.name), ['Dana']);
check('remove pending: total is still 100', sum(removed.defaultSplit, removed.availableSplits), 100);
check('remove pending: capacity shrinks to the seats that exist', removed.targetNumPeople, 3);
check('remove pending: growth allowance refunded', removed.addedSeats, 1);

// A five-person group is at the hard cap whatever its growth counter says.
const five = { ...couple, memberIds: ['a', 'b', 'c', 'd', 'e'], members: [], defaultSplit: { a: 20, b: 20, c: 20, d: 20, e: 20 }, targetNumPeople: 5 };
check('five joined: hard cap refuses a sixth', typeof seatAddBlocker(five), 'string');

// Groups written before targetNumPeople existed fall back to the hard cap, as
// the join flow always has.
check('legacy group without a size falls back to five', groupCapacity({ ...couple, targetNumPeople: undefined }), 5);

// Half-joined members (in one list but not the other) count once.
const drifted = { ...couple, members: [{ uid: 'a', name: 'A', email: '' }], memberIds: ['a', 'b'] };
check('drifted member lists count each person once', seatsInUse(drifted), 2);

// Rounding: shares land on one decimal and the remainder goes to the largest.
check('scale to 70 keeps one decimal and sums exactly', scalePercents([33.3, 33.3, 33.4], 70), [23.3, 23.3, 23.4]);
check('all-zero shares get equal parts', scalePercents([0, 0], 50), [25, 25]);
check('empty list scales to nothing', scalePercents([], 100), []);

// Input validation.
threw = '';
try { withAddedSeat(couple, '   ', 20); } catch (e: any) { threw = e.message; }
check('blank name refused', threw.length > 0, true);
threw = '';
try { withAddedSeat(couple, 'Eve', 120); } catch (e: any) { threw = e.message; }
check('share over 100 refused', threw.length > 0, true);

console.log(bad ? `\n${bad} FAILURES` : '\nall seat rules hold');
if (bad) process.exit(1);
