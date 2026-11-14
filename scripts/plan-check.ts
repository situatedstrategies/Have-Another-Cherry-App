// Plan (lib/plan): budget spend, carry, status, pace, group totals, alerts,
// goal funding and projection, and the threshold migration. Mirrors the
// Flutter test/plan_test.dart vector for vector. Run with `npm run test:parity`.
import {
  Budget,
  Goal,
  budgetSpent,
  budgetCarry,
  budgetStatus,
  budgetPace,
  groupTotals,
  budgetAlertLevel,
  budgetToWatch,
  goalFunded,
  goalProjection,
  thresholdsAsBudgets,
  planStatuses,
  addMonthsTo,
  daysInMonth,
} from '../src/lib/plan';
import { applyFilter } from '../src/lib/reports';
import { getTotalRemainingOwedToPayer, getRemainingSettlementAmount } from '../src/lib/money';
import type { Expense } from '../src/types';

let bad = 0;
const check = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) bad++;
  console.log(
    `${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ` (got ${JSON.stringify(got)}, want ${JSON.stringify(want)})`}`
  );
};

// The same shape as reports-check: a 60/40 split between a and b, plus the
// two non-spending kinds (deposit, goal contribution).
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
  }
): Expense => {
  const paidBy = o.paidBy ?? 'a';
  const aShare = Math.round(o.amount * 60) / 100;
  const bShare = Math.round(o.amount * 100) / 100 - aShare;
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
  } as Expense;
};

// The shared vector. Keep it identical to the Dart test.
const ledger: Expense[] = [
  // November
  e('groceries-nov-1', { amount: 86.4, date: '2026-11-03' }),
  e('groceries-nov-2', { amount: 52.3, date: '2026-11-10', paidBy: 'b' }),
  e('takeout-nov', { amount: 42.75, date: '2026-11-01', category: 'Dining' }),
  e('dinner-nov', { amount: 31, date: '2026-11-08', category: 'Dining', paidBy: 'b' }),
  e('soap-nov', { amount: 12.5, date: '2026-11-05', category: 'Household' }),
  // b's Dark Cherry pot: in Groceries, but hidden from a.
  e('dark-nov', { amount: 40, date: '2026-11-06', paidBy: 'b', dark: true }),
  // October
  e('groceries-oct-1', { amount: 91.2, date: '2026-10-24' }),
  e('groceries-oct-2', { amount: 60, date: '2026-10-05', paidBy: 'b' }),
  e('dinner-oct', { amount: 78.5, date: '2026-10-19', category: 'Dining', paidBy: 'b' }),
  e('soap-oct', { amount: 23.1, date: '2026-10-28', category: 'Household', paidBy: 'b' }),
  // September
  e('groceries-sep', { amount: 74.9, date: '2026-09-06' }),
  e('bulbs-sep', { amount: 18.4, date: '2026-09-03', category: 'Household', paidBy: 'b' }),
  e('brunch-sep', { amount: 46, date: '2026-09-14', category: 'Dining' }),
  // August, before any budget starts
  e('groceries-aug', { amount: 120, date: '2026-08-15' }),
  // Never spending: a house account deposit and the goal contributions.
  e('deposit-nov', {
    amount: 120,
    date: '2026-11-10',
    category: 'House account',
    deposit: true,
  }),
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
): Budget => ({
  id,
  group: 'flexible',
  rollover: false,
  alerts: true,
  scope: 'household',
  ...o,
});

const groceries = budget('groceries', { category: 'Groceries', limit: 320, startMonth: '2026-09' });
const dining = budget('dining', { category: 'Dining', limit: 60, startMonth: '2026-09' });
const household = budget('household', {
  category: 'Household',
  limit: 40,
  startMonth: '2026-09',
  rollover: true,
});
const utilities = budget('utilities', {
  category: 'Utilities',
  limit: 240,
  startMonth: '2026-11',
  group: 'fixed',
  alerts: false,
});
const insurance = budget('insurance', {
  category: 'Insurance',
  limit: 90,
  startMonth: '2026-10',
  group: 'nonMonthly',
  rollover: true,
  alerts: false,
});
const budgets = [groceries, dining, household, utilities, insurance];

const couch: Goal = {
  id: 'couch',
  name: 'Couch fund',
  target: 1200,
  dueDate: '2027-03-01',
  scope: 'household',
  createdAt: '2026-08-01T12:00:00.000Z',
};
const buffer: Goal = {
  id: 'buffer',
  name: 'Deposit buffer',
  target: 2000,
  scope: 'household',
  createdAt: '2026-07-01T12:00:00.000Z',
};
const bike: Goal = {
  id: 'bike',
  name: 'Bike',
  target: 500,
  dueDate: '2027-06-01',
  scope: 'personal',
  createdAt: '2026-11-01T12:00:00.000Z',
};

const today = '2026-11-12';
const nov = '2026-11';

check('daysInMonth Nov', daysInMonth('2026-11'), 30);
check('daysInMonth Feb 2028', daysInMonth('2028-02'), 29);
check('addMonthsTo forward over a year', addMonthsTo('2026-11', 5), '2027-04');
check('addMonthsTo back over a year', addMonthsTo('2026-02', -3), '2025-11');

// Section C: goal contributions never reach a report.
check(
  'applyFilter leaves goal contributions out',
  applyFilter(ledger, { start: '2026-07-01', end: '2026-11-30', view: 'household', uid: 'a' })
    .map((x) => x.id)
    .filter((id) => id.startsWith('couch') || id.startsWith('buffer')),
  []
);
// Balances ignore a line whose shares equal its paidBy amount.
check('goal contribution owes nothing to the payer', getTotalRemainingOwedToPayer(ledger[15]), 0);
check(
  'goal contribution owes nothing from the other member',
  getRemainingSettlementAmount(ledger[15], 'b'),
  0
);

check(
  'budgetSpent groceries Nov household',
  budgetSpent(ledger, groceries, nov, 'household', 'a'),
  138.7
);
check(
  'budgetSpent groceries Nov personal (a)',
  budgetSpent(ledger, groceries, nov, 'personal', 'a'),
  83.22
);
check(
  'budgetSpent groceries Nov household as b (own dark cherry counts)',
  budgetSpent(ledger, groceries, nov, 'household', 'b'),
  178.7
);
check(
  'budgetSpent household Sep',
  budgetSpent(ledger, household, '2026-09', 'household', 'a'),
  18.4
);
check(
  'budgetSpent utilities Nov (nothing)',
  budgetSpent(ledger, utilities, nov, 'household', 'a'),
  0
);

check('budgetCarry no rollover', budgetCarry(ledger, groceries, nov, 'household', 'a'), 0);
check(
  'budgetCarry household Sep + Oct',
  budgetCarry(ledger, household, nov, 'household', 'a'),
  38.5
);
check('budgetCarry household personal', budgetCarry(ledger, household, nov, 'personal', 'a'), 55.1);
check(
  'budgetCarry insurance one untouched month',
  budgetCarry(ledger, insurance, nov, 'household', 'a'),
  90
);
check(
  'budgetCarry at startMonth is 0',
  budgetCarry(ledger, household, '2026-09', 'household', 'a'),
  0
);
check(
  'budgetCarry goes negative',
  budgetCarry(ledger, { ...dining, rollover: true }, nov, 'household', 'a'),
  -4.5
);

check('budgetStatus groceries Nov', budgetStatus(ledger, groceries, nov, 'household', 'a'), {
  id: 'groceries',
  category: 'Groceries',
  group: 'flexible',
  rollover: false,
  alerts: true,
  limit: 320,
  carry: 0,
  available: 320,
  spent: 138.7,
  left: 181.3,
  pct: 138.7 / 320,
  over: false,
});
check('budgetStatus dining Nov (over)', budgetStatus(ledger, dining, nov, 'household', 'a'), {
  id: 'dining',
  category: 'Dining',
  group: 'flexible',
  rollover: false,
  alerts: true,
  limit: 60,
  carry: 0,
  available: 60,
  spent: 73.75,
  left: -13.75,
  pct: 73.75 / 60,
  over: true,
});
check(
  'budgetStatus household Nov (rollover)',
  budgetStatus(ledger, household, nov, 'household', 'a'),
  {
    id: 'household',
    category: 'Household',
    group: 'flexible',
    rollover: true,
    alerts: true,
    limit: 40,
    carry: 38.5,
    available: 78.5,
    spent: 12.5,
    left: 66,
    pct: 12.5 / 78.5,
    over: false,
  }
);
check(
  'budgetStatus zero available has pct 0',
  budgetStatus(ledger, { ...dining, limit: 0 }, nov, 'household', 'a').pct,
  0
);

const statuses = planStatuses(ledger, budgets, nov, 'household', 'a');
check(
  'planStatuses order (group, then category)',
  statuses.map((s) => s.id),
  ['dining', 'groceries', 'household', 'utilities', 'insurance']
);

check('budgetPace mid month', budgetPace(statuses[1], nov, today), {
  daysElapsed: 12,
  daysInMonth: 30,
  projected: 346.75,
});
check('budgetPace before the month', budgetPace(statuses[1], nov, '2026-10-20'), {
  daysElapsed: 0,
  daysInMonth: 30,
  projected: 138.7,
});
check('budgetPace after the month', budgetPace(statuses[1], nov, '2026-12-03'), {
  daysElapsed: 30,
  daysInMonth: 30,
  projected: 138.7,
});

check('groupTotals', groupTotals(statuses), {
  fixed: { limit: 240, spent: 0, left: 240 },
  flexible: { limit: 420, spent: 224.95, left: 233.55 },
  nonMonthly: { limit: 90, spent: 0, left: 180 },
});

check(
  'budgetAlertLevel',
  statuses.map((s) => budgetAlertLevel(s)),
  ['over', null, null, null, null]
);
check(
  'budgetAlertLevel near at 80%',
  budgetAlertLevel(budgetStatus(ledger, { ...groceries, limit: 170 }, nov, 'household', 'a')),
  'near'
);
check(
  'budgetAlertLevel silent when alerts are off',
  budgetAlertLevel(budgetStatus(ledger, { ...dining, alerts: false }, nov, 'household', 'a')),
  null
);
check('budgetToWatch', budgetToWatch(statuses)?.id, 'dining');
check('budgetToWatch nothing past 80%', budgetToWatch([statuses[1], statuses[2]]), null);
check(
  'budgetToWatch sees a budget that is over with nothing available',
  budgetToWatch([
    { ...statuses[1], id: 'deficit', available: -50, pct: 0, over: true },
    statuses[2],
  ])?.id,
  'deficit'
);
check(
  'a start month that is not a month carries nothing, and returns',
  ['', '2026-13', 'soon'].map((startMonth) =>
    budgetCarry(ledger, { ...household, startMonth }, nov, 'household', 'a')
  ),
  [0, 0, 0]
);

check('goalFunded couch household', goalFunded(ledger, couch, 'household', 'a'), 520);
check('goalFunded couch personal (a)', goalFunded(ledger, couch, 'personal', 'a'), 340);
check('goalFunded couch personal (b)', goalFunded(ledger, couch, 'personal', 'b'), 180);
check('goalFunded bike (nothing)', goalFunded(ledger, bike, 'household', 'a'), 0);

check('goalProjection couch', goalProjection(ledger, couch, today), {
  funded: 520,
  avg: 140,
  monthsLeft: 5,
  projectedDate: '2027-04-01',
  onTrack: false,
});
check(
  'goalProjection couch with a later due date is on track',
  goalProjection(ledger, { ...couch, dueDate: '2027-04-01' }, today).onTrack,
  true
);
check(
  'goalProjection buffer (funded, no recent contributions)',
  goalProjection(ledger, buffer, today),
  {
    funded: 2000,
    avg: 0,
    monthsLeft: null,
    projectedDate: null,
    onTrack: null,
  }
);
check('goalProjection bike (nothing yet)', goalProjection(ledger, bike, today), {
  funded: 0,
  avg: 0,
  monthsLeft: null,
  projectedDate: null,
  onTrack: null,
});
check(
  'goalProjection funded ahead of pace lands this month',
  goalProjection(ledger, { ...couch, target: 500 }, today),
  {
    funded: 520,
    avg: 140,
    monthsLeft: 0,
    projectedDate: '2026-11-01',
    onTrack: true,
  }
);

check(
  'thresholdsAsBudgets',
  thresholdsAsBudgets(
    {
      spendingThresholds: [
        { id: 't1', period: 'month', amount: 300, category: 'Groceries' },
        { id: 't2', period: 'week', amount: 50, category: 'Dining' },
        { id: 't3', period: 'month', amount: 900 },
      ],
    },
    nov
  ),
  [
    {
      id: 'threshold:Groceries',
      category: 'Groceries',
      limit: 300,
      group: 'flexible',
      rollover: false,
      alerts: true,
      startMonth: '2026-11',
      scope: 'household',
    },
    {
      id: 'threshold:Dining',
      category: 'Dining',
      limit: 216.67,
      group: 'flexible',
      rollover: false,
      alerts: true,
      startMonth: '2026-11',
      scope: 'household',
    },
  ]
);
check('thresholdsAsBudgets with none', thresholdsAsBudgets({}, nov), []);

if (bad) {
  console.error(`${bad} check(s) failed`);
  process.exit(1);
}
