// Reports (lib/reports): periods, filters, totals, categories, timelines,
// people, instruments, recurring split, pivot and export rows. Mirrors the
// Flutter test/reports_test.dart vector for vector. Run with
// `npm run test:parity`.
import {
  periodBounds,
  previousPeriod,
  weekStart,
  applyFilter,
  totals,
  byCategory,
  overTime,
  categoryOverTime,
  byPerson,
  byInstrument,
  recurringSplit,
  topExpenses,
  pivot,
  exportRows,
  ReportFilter,
} from '../src/lib/reports';
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
  o: {
    amount: number;
    date: string;
    category?: string;
    paidBy?: string;
    instrument?: string;
    settled?: boolean;
    recurring?: boolean;
    sourceId?: string;
    dark?: boolean;
  }
): Expense => {
  const paidBy = o.paidBy ?? 'a';
  const aShare = Math.round(o.amount * 60) / 100;
  const bShare = Math.round(o.amount * 100) / 100 - aShare;
  const other = paidBy === 'a' ? 'b' : 'a';
  return {
    id,
    groupId: 'g',
    title: id,
    amount: o.amount,
    date: o.date,
    category: o.category ?? 'Groceries',
    paidBy,
    contributions: [{ userId: paidBy, amount: o.amount, instrumentType: o.instrument ?? 'CREDIT' }],
    splitType: o.dark ? 'dark_cherry' : 'household_default',
    shares: { a: aShare, b: bShare },
    status: 'OPEN',
    createdAt: `${o.date}T12:00:00.000Z`,
    isRecurring: o.recurring,
    recurringSourceId: o.sourceId,
    settlements: o.settled
      ? [
          {
            id: `s-${id}`,
            expenseId: id,
            paidBy: other,
            receivedBy: paidBy,
            amount: other === 'a' ? aShare : bShare,
            instrumentType: 'VENMO',
            timestamp: `${o.date}T18:00:00.000Z`,
            status: 'confirmed',
          },
        ]
      : undefined,
  } as Expense;
};

// The shared vector. Keep it identical to the Dart test.
const ledger: Expense[] = [
  e('groceries-nov', { amount: 86.4, date: '2026-11-03', instrument: 'CREDIT' }),
  e('electric-nov', { amount: 112, date: '2026-11-02', category: 'Utilities', paidBy: 'b', instrument: 'DEBIT', sourceId: 'electric' }),
  e('takeout-nov', { amount: 42.75, date: '2026-11-01', category: 'Dining', instrument: 'CASH' }),
  e('internet-oct', { amount: 65, date: '2026-10-30', category: 'Utilities', instrument: 'CREDIT', recurring: true, settled: true }),
  e('soap-oct', { amount: 23.1, date: '2026-10-28', category: 'Household', paidBy: 'b', instrument: 'CASH', settled: true }),
  e('train-oct', { amount: 54, date: '2026-10-26', category: 'Transport', paidBy: 'b', instrument: 'CREDIT' }),
  e('groceries-oct', { amount: 91.2, date: '2026-10-24', instrument: 'DEBIT', settled: true }),
  e('dark-oct', { amount: 40, date: '2026-10-20', category: 'Gifts', paidBy: 'b', dark: true }),
  e('brunch-sep', { amount: 46, date: '2026-09-14', category: 'Dining', instrument: 'CASH', settled: true }),
];

const today = '2026-11-12';
const nov: ReportFilter = { start: '2026-11-01', end: '2026-11-30', view: 'household', uid: 'a' };
const novMine: ReportFilter = { ...nov, view: 'personal' };
const q: ReportFilter = { start: '2026-09-01', end: '2026-11-30', view: 'household', uid: 'a' };

check('periodBounds this_month', periodBounds('this_month', today), { start: '2026-11-01', end: '2026-11-30' });
check('periodBounds last_month', periodBounds('last_month', today), { start: '2026-10-01', end: '2026-10-31' });
check('periodBounds 3m', periodBounds('3m', today), { start: '2026-09-01', end: '2026-11-30' });
check('periodBounds 1y', periodBounds('1y', today), { start: '2025-12-01', end: '2026-11-30' });
check('periodBounds this_week (Thursday)', periodBounds('this_week', today), { start: '2026-11-09', end: '2026-11-15' });
check('weekStart Sunday', weekStart('2026-11-08'), '2026-11-02');
check('previousPeriod whole month', previousPeriod({ start: '2026-11-01', end: '2026-11-30' }), { start: '2026-10-01', end: '2026-10-31' });
check('previousPeriod three months', previousPeriod({ start: '2026-09-01', end: '2026-11-30' }), { start: '2026-06-01', end: '2026-08-31' });
check('previousPeriod custom 10 days', previousPeriod({ start: '2026-11-05', end: '2026-11-14' }), { start: '2026-10-26', end: '2026-11-04' });

check('applyFilter hides other people dark cherry', applyFilter(ledger, { ...q }).map((x) => x.id).includes('dark-oct'), false);
check('applyFilter shows own dark cherry', applyFilter(ledger, { ...q, uid: 'b' }).map((x) => x.id).includes('dark-oct'), true);
check('applyFilter open only', applyFilter(ledger, { ...q, status: 'open' }).map((x) => x.id), ['groceries-nov', 'electric-nov', 'takeout-nov', 'train-oct']);
check('applyFilter recurring only', applyFilter(ledger, { ...q, recurring: 'recurring' }).map((x) => x.id), ['electric-nov', 'internet-oct']);
check('applyFilter payer and category', applyFilter(ledger, { ...q, payers: ['b'], categories: ['Utilities'] }).map((x) => x.id), ['electric-nov']);

check('totals household Nov', totals(ledger, nov, today), { total: 241.15, count: 3, daysElapsed: 12, perDay: 20.1, previousTotal: 233.3, change: 7.85, changePct: 3 });
check('totals personal Nov', totals(ledger, novMine, today), { total: 144.69, count: 3, daysElapsed: 12, perDay: 12.06, previousTotal: 139.98, change: 4.71, changePct: 3 });

check('byCategory household Nov', byCategory(ledger, nov), [
  { category: 'Utilities', total: 112, share: 112 / 241.15, previousTotal: 65, change: 47 },
  { category: 'Groceries', total: 86.4, share: 86.4 / 241.15, previousTotal: 91.2, change: -4.8 },
  { category: 'Dining', total: 42.75, share: 42.75 / 241.15, previousTotal: 0, change: 42.75 },
]);

// Nov 1 is a Sunday, so it sits in the week of Monday Oct 26; the previous
// period (October) lines up week for week, so its fourth and fifth weeks
// show against November's fourth and fifth.
check('overTime weeks Nov', overTime(ledger, nov, 'week').map((p) => [p.bucket, p.total, p.previousTotal]), [
  ['2026-10-26', 42.75, 0],
  ['2026-11-02', 198.4, 0],
  ['2026-11-09', 0, 0],
  ['2026-11-16', 0, 91.2],
  ['2026-11-23', 0, 142.1],
  ['2026-11-30', 0, 0],
]);
check('overTime months quarter', overTime(ledger, q, 'month').map((p) => [p.bucket, p.total]), [
  ['2026-09', 46],
  ['2026-10', 233.3],
  ['2026-11', 241.15],
]);

const cot = categoryOverTime(ledger, q, 'month', 2);
check('categoryOverTime top two', cot.categories, ['Groceries', 'Utilities']);
check('categoryOverTime Oct folds the rest', cot.points[1].values, { Utilities: 65, __other__: 77.1, Groceries: 91.2 });

check('byPerson household', byPerson(ledger, q, ['a', 'b']), [
  { uid: 'a', paid: 331.35, responsible: 312.27 },
  { uid: 'b', paid: 189.1, responsible: 208.18 },
]);
check('byPerson personal (fronted for a)', byPerson(ledger, { ...q, view: 'personal' }, ['a', 'b']), [{ uid: 'b', paid: 113.46, responsible: 0 }]);

check('byInstrument Nov', byInstrument(ledger, nov), { CREDIT: 86.4, DEBIT: 112, CASH: 42.75 });
check('recurringSplit quarter', recurringSplit(ledger, q), { recurring: 177, oneOff: 343.45, sources: 2 });
check('topExpenses 2 personal', topExpenses(ledger, { ...q, view: 'personal' }, 2).map((x) => x.id), ['electric-nov', 'groceries-oct']);

const pv = pivot(ledger, q, 'month');
check('pivot columns', pv.columns, ['2026-09', '2026-10', '2026-11']);
check('pivot first row', { ...pv.rows[0], cells: Object.fromEntries(Object.entries(pv.rows[0].cells).sort()) }, { key: 'Groceries', cells: { '2026-10': 91.2, '2026-11': 86.4 }, total: 177.6 });
check('pivot column totals', pv.columnTotals, { '2026-09': 46, '2026-10': 233.3, '2026-11': 241.15 });
check('pivot grand', pv.grandTotal, 520.45);

const rows = exportRows(ledger, nov, (u) => (u === 'a' ? 'Olivia' : 'Sam'), () => 'Open');
check('exportRows order and shape', rows.map((r) => [r.date, r.item, r.paidBy, r.method, r.amount, r.yourShare, r.recurring]), [
  ['2026-11-01', 'takeout-nov', 'Olivia', 'CASH', 42.75, 25.65, false],
  ['2026-11-02', 'electric-nov', 'Sam', 'DEBIT', 112, 67.2, true],
  ['2026-11-03', 'groceries-nov', 'Olivia', 'CREDIT', 86.4, 51.84, false],
]);

if (bad) {
  console.error(`${bad} check(s) failed`);
  process.exit(1);
}
