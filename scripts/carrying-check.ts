// Who's carrying what (lib/carrying): outstanding by payer and instrument
// class, oldest open card, household total. Run with `npm run test:parity`.
import { computeCarrying, householdCredit } from '../src/lib/carrying';
import type { Expense, Settlement } from '../src/types';

let bad = 0;
const check = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) bad++;
  console.log(
    `${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ` (got ${JSON.stringify(got)}, want ${JSON.stringify(want)})`}`
  );
};

const paid = (by: string, amount: number, status: 'confirmed' | 'pending' = 'confirmed') =>
  ({
    id: `s-${by}-${amount}-${status}`,
    expenseId: 'x',
    paidBy: by,
    receivedBy: 'a',
    amount,
    instrumentType: 'CASH',
    timestamp: '2026-10-05T00:00:00.000Z',
    paymentDate: '2026-10-05',
    status,
  }) as Settlement;

const e = (
  id: string,
  o: {
    date: string;
    paidBy: string;
    shares: Record<string, number>;
    instrument?: string;
    settlements?: Settlement[];
    splitType?: string;
  }
): Expense => {
  const amount = Object.values(o.shares).reduce((t, v) => t + v, 0);
  return {
    id,
    groupId: 'g',
    title: id,
    amount,
    date: o.date,
    category: 'Other',
    paidBy: o.paidBy,
    splitType: o.splitType ?? 'household_default',
    shares: o.shares,
    status: 'OPEN',
    createdAt: '2026-01-01T00:00:00.000Z',
    settlements: o.settlements ?? [],
    ...(o.instrument
      ? { contributions: [{ userId: o.paidBy, amount, instrumentType: o.instrument }] }
      : {}),
  } as unknown as Expense;
};

const today = '2026-10-15';
const ledger: Expense[] = [
  // a floated 40 on a card on the 1st; b owes 40 of it.
  e('card-old', {
    date: '2026-10-01',
    paidBy: 'a',
    shares: { a: 60, b: 40 },
    instrument: 'CREDIT',
  }),
  // a floated 30 on a card on the 10th; b has paid 10 back, 20 open.
  e('card-new', {
    date: '2026-10-10',
    paidBy: 'a',
    shares: { a: 30, b: 30 },
    instrument: 'CREDIT',
    settlements: [paid('b', 10)],
  }),
  // a paid 15 of debit; a pending payment is not back in a's account yet.
  e('debit', {
    date: '2026-10-11',
    paidBy: 'a',
    shares: { a: 15, b: 15 },
    instrument: 'DEBIT',
    settlements: [paid('b', 15, 'pending')],
  }),
  // Settled in full: carried by nobody.
  e('done', {
    date: '2026-09-01',
    paidBy: 'a',
    shares: { a: 5, b: 5 },
    instrument: 'CREDIT',
    settlements: [paid('b', 5)],
  }),
  // b fronted on credit; a owes 12.
  e('b-card', { date: '2026-10-12', paidBy: 'b', shares: { a: 12, b: 8 }, instrument: 'CREDIT' }),
  // b fronted with no instrument recorded; a owes 7.
  e('b-unknown', { date: '2026-10-13', paidBy: 'b', shares: { a: 7, b: 3 } }),
  // Unclaimed and Dark Cherry: nobody is carrying either.
  e('nobody', { date: '2026-10-14', paidBy: '', shares: { a: 50, b: 50 }, instrument: 'CREDIT' }),
  e('pot', {
    date: '2026-10-14',
    paidBy: 'a',
    shares: { a: 50, b: 50 },
    instrument: 'CREDIT',
    splitType: 'dark_cherry',
  }),
];

const rows = computeCarrying(ledger, today);
check(
  'a first, b second',
  rows.map((r) => r.uid),
  ['a', 'b']
);
const a = rows[0];
check('a on credit: 40 + 20', a.onCredit, 60);
check('a credit count', a.onCreditCount, 2);
check('a from own money: pending debit still out', a.fromOwnMoney, 15);
check('a own-money count', a.fromOwnMoneyCount, 1);
check('a unknown', a.unknown, 0);
check('a oldest card: the 1st to the 15th', a.oldestCreditDays, 14);
check('a total', a.total, 75);
const b = rows[1];
check('b on credit', b.onCredit, 12);
check('b unknown instrument', b.unknown, 7);
check('b oldest card', b.oldestCreditDays, 3);
check('b total', b.total, 19);

check('household credit', householdCredit(rows), { onCredit: 72, longestDays: 14 });
check('empty ledger', computeCarrying([], today), []);
check('empty household', householdCredit([]), { onCredit: 0, longestDays: null });

console.log(bad ? `\n${bad} FAILURES` : '\nall carrying rules hold');
if (bad) process.exit(1);
