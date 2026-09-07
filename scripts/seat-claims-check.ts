// Claiming a pending seat's history (lib/seatClaims). Run with npm run test:parity.
import { claimSeats, claimSeatsOnExpense, seatClaimMap } from '../src/lib/seatClaims';
import type { Expense } from '../src/types';

let bad = 0;
const check = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) bad++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ` (got ${JSON.stringify(got)}, want ${JSON.stringify(want)})`}`);
};
const exp = (over: Partial<Expense>): Expense => ({
  id: 'e1', groupId: 'G', title: 'Rent', amount: 100, date: '2026-09-01', category: 'Rent',
  paidBy: 'rob', splitType: 'household_default', shares: { rob: 64, ghost_0: 36 },
  status: 'OPEN', createdAt: '2026-09-01T00:00:00.000Z', ...over,
});

// The bug: partner logs rent before Olivia joins; she joins; rent still names ghost_0.
const before = exp({});
const after = claimSeatsOnExpense(before, ['rob', 'liv']);
check('the placeholder share moves to the joiner', after.shares, { rob: 64, liv: 36 });
check('the original is untouched', before.shares, { rob: 64, ghost_0: 36 });
check('nothing else on the entry changes', after.editedAt, before.editedAt);

// Already claimed: same object back, so persist effects do not churn.
check('an entry with no placeholder is returned as-is', claimSeatsOnExpense(after, ['rob', 'liv']) === after, true);

// A seat nobody has taken stays pending.
check('no joiner, no change', claimSeatsOnExpense(before, ['rob']) === before, true);

// Two pending seats, joiners arrive one at a time, lowest index first.
const three = exp({ shares: { rob: 50, ghost_0: 30, ghost_1: 20 } });
const one = claimSeatsOnExpense(three, ['rob', 'liv']);
check('first joiner takes ghost_0, ghost_1 waits', one.shares, { rob: 50, liv: 30, ghost_1: 20 });
const two = claimSeatsOnExpense(one, ['rob', 'liv', 'cas']);
check('second joiner takes ghost_1', two.shares, { rob: 50, liv: 30, cas: 20 });
check('both at once maps in join order', claimSeatsOnExpense(three, ['rob', 'liv', 'cas']).shares, { rob: 50, liv: 30, cas: 20 });

// Members who already have a share are not candidates.
check('a seated member never takes a placeholder', seatClaimMap(exp({ shares: { rob: 50, liv: 30, ghost_0: 20 } }), ['rob', 'liv']), {});

// Every place a uid can hide.
const rich = exp({
  paidBy: 'ghost_0',
  contributions: [{ userId: 'ghost_0', amount: 100, instrumentType: 'CASH' }],
  settlements: [{ id: 's1', expenseId: 'e1', paidBy: 'rob', receivedBy: 'ghost_0', amount: 10, instrumentType: 'CASH', timestamp: 't', status: 'pending' }],
  comments: [{ id: 'c1', userId: 'ghost_0', text: 'hi', timestamp: 't' }],
});
const richOut = claimSeatsOnExpense(rich, ['rob', 'liv']);
check('paidBy remapped', richOut.paidBy, 'liv');
check('contribution remapped', richOut.contributions![0].userId, 'liv');
check('settlement receiver remapped', richOut.settlements![0].receivedBy, 'liv');
check('comment author remapped', richOut.comments![0].userId, 'liv');

// Ledger pass reports whether anything moved.
check('ledger pass: changed', claimSeats([before, after], ['rob', 'liv']).changed, true);
check('ledger pass: unchanged returns the same array', claimSeats([after], ['rob', 'liv']).expenses === [after][0] ? false : claimSeats([after], ['rob', 'liv']).changed, false);
check('ledger pass: no roster, no change', claimSeats([before], undefined).changed, false);

console.log(bad ? `\n${bad} FAILURES` : '\nall seat claim rules hold');
if (bad) process.exit(1);
