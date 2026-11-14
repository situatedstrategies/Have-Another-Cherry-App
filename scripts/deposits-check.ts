// House account (lib/deposits): which lines are deposits, each person's total
// against the agreed ratio, and the period by person grid. Mirrors the
// Flutter test/deposits_test.dart vector for vector. Run with
// `npm run test:parity`.
import { depositsOf, depositSummary, depositGrid } from '../src/lib/deposits';
import { isDeposit } from '../src/lib/money';
import type { Expense } from '../src/types';

let bad = 0;
const check = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) bad++;
  console.log(
    `${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ` (got ${JSON.stringify(got)}, want ${JSON.stringify(want)})`}`
  );
};

const deposit = (id: string, amount: number, date: string, paidBy: string): Expense =>
  ({
    id,
    groupId: 'g',
    title: 'Deposit',
    amount,
    date,
    category: 'House account',
    paidBy,
    contributions: [{ userId: paidBy, amount, instrumentType: 'TRANSFER' }],
    splitType: 'deposit',
    shares: {},
    status: 'OPEN',
    createdAt: `${date}T09:00:00.000Z`,
  }) as Expense;

const spend: Expense = {
  id: 'groceries-nov',
  groupId: 'g',
  title: 'Groceries',
  amount: 86.4,
  date: '2026-11-03',
  category: 'Groceries',
  paidBy: 'a',
  splitType: 'household_default',
  shares: { a: 51.84, b: 34.56 },
  status: 'OPEN',
  createdAt: '2026-11-03T12:00:00.000Z',
} as Expense;

// The shared vector. Keep it identical to the Dart test.
const ledger: Expense[] = [
  spend,
  deposit('deposit-nov', 120, '2026-11-10', 'a'),
  deposit('deposit-oct-a', 300, '2026-10-01', 'a'),
  deposit('deposit-oct-b', 200, '2026-10-02', 'b'),
  deposit('deposit-sep-b', 200, '2026-09-29', 'b'),
];

check('isDeposit', ledger.map(isDeposit), [false, true, true, true, true]);
check(
  'depositsOf oldest first, spending left out',
  depositsOf(ledger).map((d) => d.id),
  ['deposit-sep-b', 'deposit-oct-a', 'deposit-oct-b', 'deposit-nov']
);

const summary = depositSummary(ledger, { a: 60, b: 40 }, ['a', 'b']);
check('summary total and count', [summary.total, summary.count], [820, 4]);
check('summary rows against the 60/40 ratio', summary.rows, [
  { uid: 'a', deposited: 420, actual: 420 / 820, agreed: 0.6, agreedAmount: 492, difference: -72 },
  { uid: 'b', deposited: 400, actual: 400 / 820, agreed: 0.4, agreedAmount: 328, difference: 72 },
]);
check(
  'a split that does not come to 100 is normalised over the members listed',
  depositSummary(ledger, { a: 33, b: 33 }, ['a', 'b']).rows.map((r) => [
    r.uid,
    r.agreed,
    r.agreedAmount,
    r.difference,
  ]),
  [
    ['a', 0.5, 410, 10],
    ['b', 0.5, 410, -10],
  ]
);
check(
  'no split at all is equal parts',
  depositSummary(ledger, {}, ['a', 'b']).rows.map((r) => [r.uid, r.agreed, r.agreedAmount]),
  [
    ['a', 0.5, 410],
    ['b', 0.5, 410],
  ]
);
check(
  'summary keeps a member with nothing deposited',
  depositSummary(ledger, { a: 50, b: 30, c: 20 }, ['a', 'b', 'c']).rows.map((r) => [
    r.uid,
    r.deposited,
    r.agreedAmount,
  ]),
  [
    ['a', 420, 410],
    ['b', 400, 246],
    ['c', 0, 164],
  ]
);
check('summary of an empty ledger', depositSummary([spend], { a: 60, b: 40 }, ['a', 'b']), {
  total: 0,
  count: 0,
  rows: [
    { uid: 'a', deposited: 0, actual: 0, agreed: 0.6, agreedAmount: 0, difference: 0 },
    { uid: 'b', deposited: 0, actual: 0, agreed: 0.4, agreedAmount: 0, difference: 0 },
  ],
});

const byMonth = depositGrid(ledger, 'month', ['a', 'b']);
check(
  'month grid buckets',
  byMonth.rows.map((r) => r.bucket),
  ['2026-09', '2026-10', '2026-11']
);
check(
  'month grid cells',
  byMonth.rows.map((r) => [r.cells.a ?? 0, r.cells.b ?? 0, r.total]),
  [
    [0, 200, 200],
    [300, 200, 500],
    [120, 0, 120],
  ]
);
check('month grid totals', [byMonth.columnTotals, byMonth.grandTotal], [{ a: 420, b: 400 }, 820]);

// Sep 29 is a Tuesday (week of Mon Sep 28), Oct 1 and 2 fall in that same
// week, Nov 10 in the week of Mon Nov 9; the five quiet weeks between show
// as zero.
const byWeek = depositGrid(ledger, 'week', ['a', 'b']);
check(
  'week grid first and last buckets',
  [byWeek.rows[0].bucket, byWeek.rows[byWeek.rows.length - 1].bucket],
  ['2026-09-28', '2026-11-09']
);
check('week grid row count', byWeek.rows.length, 7);
check('week grid first week', byWeek.rows[0].cells, { b: 400, a: 300 });
check(
  'week grid stretches to today',
  depositGrid(ledger, 'week', ['a', 'b'], '2026-11-25').rows.length,
  9
);

const mine = depositGrid(ledger, 'month', ['a', 'b'], undefined, 'a');
check(
  'just mine narrows members and buckets',
  [mine.members, mine.rows.map((r) => r.bucket), mine.grandTotal],
  [['a'], ['2026-10', '2026-11'], 420]
);
check('empty grid', depositGrid([spend], 'month', ['a', 'b']), {
  members: ['a', 'b'],
  rows: [],
  columnTotals: { a: 0, b: 0 },
  grandTotal: 0,
});

if (bad) {
  console.error(`${bad} check(s) failed`);
  process.exit(1);
}
