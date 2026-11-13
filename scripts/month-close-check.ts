// Month close (lib/monthClose): the summary card's figures and when it shows.
// Runs over the Phase 2 plan fixture (scripts/plan-check.ts, the same ledger,
// budgets and goals), closing October. Mirrors the Flutter
// test/month_close_test.dart vector for vector. Run with `npm run test:parity`.
import { monthCloseSummary, shouldShowMonthClose, closedMonthFor } from '../src/lib/monthClose';
import type { Budget, Goal } from '../src/lib/plan';
import type { Expense } from '../src/types';

let bad = 0;
const check = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) bad++;
  console.log(
    `${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ` (got ${JSON.stringify(got)}, want ${JSON.stringify(want)})`}`
  );
};

// Identical to plan-check.ts.
const e = (
  id: string,
  o: {
    amount: number;
    date: string;
    category?: string;
    paidBy?: string;
    dark?: boolean;
    deposit?: boolean;
    goal?: string;
    settled?: boolean;
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
    contributions: [{ userId: paidBy, amount: o.amount, instrumentType: 'CREDIT' }],
    splitType: o.dark
      ? 'dark_cherry'
      : o.deposit
        ? 'deposit'
        : o.goal
          ? 'goal'
          : 'household_default',
    shares: o.deposit ? {} : o.goal ? { [paidBy]: o.amount } : { a: aShare, b: bShare },
    ...(o.goal ? { goalId: o.goal } : {}),
    status: 'OPEN',
    createdAt: `${o.date}T12:00:00.000Z`,
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
      : [],
  } as Expense;
};

const ledger: Expense[] = [
  e('groceries-nov-1', { amount: 86.4, date: '2026-11-03' }),
  e('groceries-nov-2', { amount: 52.3, date: '2026-11-10', paidBy: 'b' }),
  e('takeout-nov', { amount: 42.75, date: '2026-11-01', category: 'Dining' }),
  e('dinner-nov', { amount: 31, date: '2026-11-08', category: 'Dining', paidBy: 'b' }),
  e('soap-nov', { amount: 12.5, date: '2026-11-05', category: 'Household' }),
  e('dark-nov', { amount: 40, date: '2026-11-06', paidBy: 'b', dark: true }),
  e('groceries-oct-1', { amount: 91.2, date: '2026-10-24' }),
  e('groceries-oct-2', { amount: 60, date: '2026-10-05', paidBy: 'b' }),
  e('dinner-oct', { amount: 78.5, date: '2026-10-19', category: 'Dining', paidBy: 'b' }),
  e('soap-oct', { amount: 23.1, date: '2026-10-28', category: 'Household', paidBy: 'b' }),
  e('groceries-sep', { amount: 74.9, date: '2026-09-06' }),
  e('bulbs-sep', { amount: 18.4, date: '2026-09-03', category: 'Household', paidBy: 'b' }),
  e('brunch-sep', { amount: 46, date: '2026-09-14', category: 'Dining' }),
  e('groceries-aug', { amount: 120, date: '2026-08-15' }),
  e('deposit-nov', { amount: 120, date: '2026-11-10', category: 'House account', deposit: true }),
  e('couch-aug-a', { amount: 100, date: '2026-08-20', category: 'Couch fund', goal: 'couch' }),
  e('couch-sep-a', { amount: 120, date: '2026-09-20', category: 'Couch fund', goal: 'couch' }),
  e('couch-sep-b', {
    amount: 80,
    date: '2026-09-25',
    category: 'Couch fund',
    paidBy: 'b',
    goal: 'couch',
  }),
  e('couch-oct-a', { amount: 120, date: '2026-10-20', category: 'Couch fund', goal: 'couch' }),
  e('couch-nov-b', {
    amount: 100,
    date: '2026-11-02',
    category: 'Couch fund',
    paidBy: 'b',
    goal: 'couch',
  }),
  e('buffer-jul-a', { amount: 2000, date: '2026-07-01', category: 'Buffer', goal: 'buffer' }),
];

const budget = (
  id: string,
  o: Partial<Budget> & { category: string; limit: number; startMonth: string }
): Budget => ({ id, group: 'flexible', rollover: false, alerts: true, scope: 'household', ...o });
const budgets: Budget[] = [
  budget('groceries', { category: 'Groceries', limit: 320, startMonth: '2026-09' }),
  budget('dining', { category: 'Dining', limit: 60, startMonth: '2026-09' }),
  budget('household', { category: 'Household', limit: 40, startMonth: '2026-09', rollover: true }),
  budget('utilities', {
    category: 'Utilities',
    limit: 240,
    startMonth: '2026-11',
    group: 'fixed',
    alerts: false,
  }),
  budget('insurance', {
    category: 'Insurance',
    limit: 90,
    startMonth: '2026-10',
    group: 'nonMonthly',
    rollover: true,
    alerts: false,
  }),
];
const goals: Goal[] = [
  {
    id: 'couch',
    name: 'Couch fund',
    target: 1200,
    dueDate: '2027-03-01',
    scope: 'household',
    createdAt: '2026-08-01T12:00:00.000Z',
  },
  {
    id: 'buffer',
    name: 'Deposit buffer',
    target: 2000,
    scope: 'household',
    createdAt: '2026-07-01T12:00:00.000Z',
  },
];

console.log('--- monthCloseSummary ---');
check(
  'October, household view, a',
  monthCloseSummary(ledger, budgets, goals, '2026-10', 'household', 'a'),
  {
    month: '2026-10',
    total: 252.8,
    yourShare: 151.68,
    change: 81,
    topCategory: 'Groceries',
    budgetsUnder: 4,
    budgetsOver: 1,
    biggestOver: 'dining',
    openCount: 4,
    openTotal: 133.44,
    goalsFunded: 120,
  }
);
check(
  'October, personal view, a',
  monthCloseSummary(ledger, budgets, goals, '2026-10', 'personal', 'a'),
  {
    month: '2026-10',
    total: 252.8,
    yourShare: 151.68,
    change: 81,
    topCategory: 'Groceries',
    budgetsUnder: 5,
    budgetsOver: 0,
    biggestOver: null,
    openCount: 3,
    openTotal: 96.96,
    goalsFunded: 120,
  }
);
check(
  'October, personal view, b',
  monthCloseSummary(ledger, budgets, goals, '2026-10', 'personal', 'b'),
  {
    month: '2026-10',
    total: 252.8,
    yourShare: 101.12,
    change: 81,
    topCategory: 'Groceries',
    budgetsUnder: 5,
    budgetsOver: 0,
    biggestOver: null,
    openCount: 1,
    openTotal: 36.48,
    goalsFunded: 0,
  }
);
check(
  'a settled line leaves the open figures',
  (() => {
    const settled = ledger.map((x) =>
      x.id === 'dinner-oct'
        ? e('dinner-oct', {
            amount: 78.5,
            date: '2026-10-19',
            category: 'Dining',
            paidBy: 'b',
            settled: true,
          })
        : x
    );
    const s = monthCloseSummary(settled, budgets, goals, '2026-10', 'household', 'a');
    return [s.openCount, s.openTotal, s.total];
  })(),
  [3, 86.34, 252.8]
);
check('an empty month', monthCloseSummary(ledger, budgets, goals, '2026-06', 'household', 'a'), {
  month: '2026-06',
  total: 0,
  yourShare: 0,
  change: null,
  topCategory: null,
  budgetsUnder: 5,
  budgetsOver: 0,
  biggestOver: null,
  openCount: 0,
  openTotal: 0,
  goalsFunded: 0,
});
check('no budgets, no goals', monthCloseSummary(ledger, [], [], '2026-09', 'household', 'a'), {
  month: '2026-09',
  total: 139.3,
  yourShare: 83.58,
  change: 16,
  topCategory: 'Groceries',
  budgetsUnder: 0,
  budgetsOver: 0,
  biggestOver: null,
  openCount: 3,
  openTotal: 59.4,
  goalsFunded: 0,
});

console.log('--- shouldShowMonthClose ---');
check(
  'closedMonthFor',
  [closedMonthFor('2026-11-12'), closedMonthFor('2027-01-05')],
  ['2026-10', '2026-12']
);
check('never shown', shouldShowMonthClose('2026-11-12', null), true);
check('shown this month already', shouldShowMonthClose('2026-11-12', '2026-10'), false);
check('shown an older month', shouldShowMonthClose('2026-11-12', '2026-09'), true);
check('on the 1st', shouldShowMonthClose('2026-11-01', '2026-10'), false);
check('on the 1st, not yet shown', shouldShowMonthClose('2026-11-01', '2026-09'), true);

console.log(bad === 0 ? '\nALL MONTH CLOSE CHECKS PASSED' : `\n${bad} FAILURE(S)`);
process.exit(bad === 0 ? 0 : 1);
