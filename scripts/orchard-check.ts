// Cherry Pick deck rules (lib/orchard), mirroring the iOS orchard queue.
// Run with `npm run test:parity`.
import { orchardQueue, orchardDeck, outstandingFor } from '../src/lib/orchard';
import type { Expense } from '../src/types';

let bad = 0;
const check = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) bad++;
  console.log(
    `${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ` (got ${JSON.stringify(got)}, want ${JSON.stringify(want)})`}`
  );
};
const e = (
  id: string,
  o: Partial<Expense> & { paidBy: string; shares: Record<string, number> }
): Expense =>
  ({
    id,
    groupId: 'g',
    title: id,
    amount: Object.values(o.shares).reduce((t, v) => t + v, 0),
    date: '2026-08-01',
    category: 'Other',
    splitType: 'equal',
    status: 'pending',
    createdAt: '2026-08-01',
    settlements: [],
    ...o,
  }) as unknown as Expense;

const mine = e('mine', { paidBy: 'me', shares: { me: 5, you: 5 } });
const theirsOld = e('old', { paidBy: 'you', shares: { me: 5, you: 5 }, date: '2026-01-01' });
const theirsNew = e('new', { paidBy: 'you', shares: { me: 5, you: 5 }, date: '2026-09-01' });
const unclaimed = e('ghost', { paidBy: '', shares: { me: 5, you: 5 } });
const paid = e('paid', {
  paidBy: 'you',
  shares: { me: 5, you: 5 },
  settlements: [
    {
      id: 's',
      expenseId: 'paid',
      paidBy: 'me',
      receivedBy: 'you',
      amount: 5,
      instrumentType: 'CASH',
      timestamp: '2026-08-02',
      status: 'confirmed',
    },
  ] as unknown as Expense['settlements'],
});

check('payer owes nothing on their own expense', outstandingFor(mine, 'me'), 0);
check('debtor owes their share', outstandingFor(theirsOld, 'me'), 5);
check(
  'queue: only what I owe, oldest first, no unclaimed, no settled',
  orchardQueue([mine, theirsNew, unclaimed, paid, theirsOld], 'me').map((x) => x.id),
  ['old', 'new']
);
check(
  'deck keeps handled cards in place',
  orchardDeck([mine, theirsNew, paid, theirsOld], 'me', new Set(['paid'])).map((x) => x.id),
  ['old', 'paid', 'new']
);

console.log(bad ? `\n${bad} FAILURES` : '\nall orchard rules hold');
if (bad) process.exit(1);
