// Recurring detection (lib/recurringDetect): candidates and the make-recurring
// patch. Mirrors the Flutter test/recurring_detect_test.dart vector for
// vector. Run with `npm run test:parity`.
import {
  detectRecurringCandidates,
  makeRecurring,
  intervalForGap,
} from '../src/lib/recurringDetect';
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
  title: string,
  amount: number,
  date: string,
  o: { recurring?: boolean; sourceId?: string; deposit?: boolean; goal?: string } = {}
): Expense =>
  ({
    id,
    groupId: 'g',
    title,
    amount,
    date,
    category: 'Other',
    paidBy: 'a',
    splitType: o.deposit ? 'deposit' : o.goal ? 'goal' : 'household_default',
    shares: o.deposit ? {} : o.goal ? { a: amount } : { a: amount / 2, b: amount / 2 },
    ...(o.goal ? { goalId: o.goal } : {}),
    status: 'OPEN',
    createdAt: `${date}T12:00:00.000Z`,
    ...(o.recurring ? { isRecurring: true, recurringInterval: '1_months' } : {}),
    ...(o.sourceId ? { recurringSourceId: o.sourceId } : {}),
  }) as Expense;

const today = '2026-11-12';

const ledger: Expense[] = [
  // Monthly, four months, same amount; a fifth dated after today is ignored.
  e('rent-aug', 'Rent', 2000, '2026-08-01'),
  e('rent-sep', 'rent', 2000, '2026-09-01'),
  e('rent-oct', 'Rent', 2000, '2026-10-01'),
  e('rent-nov', 'Rent', 2000, '2026-11-01'),
  e('rent-dec', 'Rent', 2000, '2026-12-01'),
  // Monthly, three months, gaps 31 and 29.
  e('spotify-aug', 'Spotify', 10.99, '2026-08-15'),
  e('spotify-sep', 'Spotify', 10.99, '2026-09-15'),
  e('spotify-oct', 'Spotify', 10.99, '2026-10-14'),
  // Weekly, nine weeks across three months, amounts within 15% of the median 82.
  e('groc-1', 'Groceries', 80, '2026-09-07'),
  e('groc-2', 'Groceries', 85, '2026-09-14'),
  e('groc-3', 'Groceries', 78, '2026-09-21'),
  e('groc-4', 'Groceries', 90, '2026-09-28'),
  e('groc-5', 'Groceries', 82, '2026-10-05'),
  e('groc-6', 'Groceries', 79, '2026-10-12'),
  e('groc-7', 'Groceries', 88, '2026-10-19'),
  e('groc-8', 'Groceries', 84, '2026-10-26'),
  e('groc-9', 'Groceries', 81, '2026-11-02'),
  // Every two weeks, six times across three months.
  e('clean-0', 'Cleaner', 120, '2026-08-21'),
  e('clean-1', 'Cleaner', 120, '2026-09-04'),
  e('clean-2', 'Cleaner', 120, '2026-09-18'),
  e('clean-3', 'Cleaner', 120, '2026-10-02'),
  e('clean-4', 'Cleaner', 120, '2026-10-16'),
  e('clean-5', 'Cleaner', 120, '2026-10-30'),
  // Amounts too far apart (140 against a median of 95).
  e('elec-aug', 'Electric', 90, '2026-08-03'),
  e('elec-sep', 'Electric', 140, '2026-09-03'),
  e('elec-oct', 'Electric', 95, '2026-10-03'),
  // Three entries in one month only.
  e('coffee-1', 'Coffee', 4.5, '2026-10-01'),
  e('coffee-2', 'Coffee', 4.5, '2026-10-08'),
  e('coffee-3', 'Coffee', 4.5, '2026-10-15'),
  // Too old: only June is inside the six-month window.
  e('gym-apr', 'Gym', 40, '2026-04-01'),
  e('gym-may', 'Gym', 40, '2026-05-01'),
  e('gym-jun', 'Gym', 40, '2026-06-01'),
  // Already recurring: autopilot instances and their source are left out.
  e('internet-src', 'Internet', 65, '2026-08-30', { recurring: true }),
  e('internet-sep', 'Internet', 65, '2026-09-30', { sourceId: 'internet-src' }),
  e('internet-oct', 'Internet', 65, '2026-10-30', { sourceId: 'internet-src' }),
  // Three months but no steady gap (40 and 45 days).
  e('irr-1', 'Irregular', 50, '2026-08-01'),
  e('irr-2', 'Irregular', 50, '2026-09-10'),
  e('irr-3', 'Irregular', 50, '2026-10-25'),
  // Never spending.
  e('dep-1', 'Deposit', 300, '2026-08-01', { deposit: true }),
  e('dep-2', 'Deposit', 300, '2026-09-01', { deposit: true }),
  e('dep-3', 'Deposit', 300, '2026-10-01', { deposit: true }),
  e('goal-1', 'Couch fund', 100, '2026-08-20', { goal: 'couch' }),
  e('goal-2', 'Couch fund', 100, '2026-09-20', { goal: 'couch' }),
  e('goal-3', 'Couch fund', 100, '2026-10-20', { goal: 'couch' }),
];

console.log('--- intervalForGap ---');
check(
  '26 to 35 is monthly',
  [intervalForGap(26), intervalForGap(30), intervalForGap(35)],
  ['1_months', '1_months', '1_months']
);
check('6 to 8 is weekly', [intervalForGap(6), intervalForGap(8)], ['1_weeks', '1_weeks']);
check(
  '13 to 15 is every two weeks',
  [intervalForGap(13), intervalForGap(15)],
  ['2_weeks', '2_weeks']
);
check(
  'anything else is nothing',
  [intervalForGap(9), intervalForGap(20), intervalForGap(40)],
  [null, null, null]
);

console.log('--- detectRecurringCandidates ---');
const found = detectRecurringCandidates(ledger, today);
check('four candidates, best first', found, [
  {
    title: 'Groceries',
    interval: '1_weeks',
    anchorDay: 2,
    latestId: 'groc-9',
    count: 9,
    medianAmount: 82,
  },
  {
    title: 'Cleaner',
    interval: '2_weeks',
    anchorDay: 30,
    latestId: 'clean-5',
    count: 6,
    medianAmount: 120,
  },
  {
    title: 'Rent',
    interval: '1_months',
    anchorDay: 1,
    latestId: 'rent-nov',
    count: 4,
    medianAmount: 2000,
  },
  {
    title: 'Spotify',
    interval: '1_months',
    anchorDay: 14,
    latestId: 'spotify-oct',
    count: 3,
    medianAmount: 10.99,
  },
]);
check(
  'a dismissed title is left out, compared normalized',
  detectRecurringCandidates(ledger, today, [' RENT ']).map((c) => c.title),
  ['Groceries', 'Cleaner', 'Spotify']
);
check(
  'ties on count fall back to the title',
  detectRecurringCandidates(
    [
      e('b1', 'Beta', 10, '2026-08-01'),
      e('b2', 'Beta', 10, '2026-09-01'),
      e('b3', 'Beta', 10, '2026-10-01'),
      e('a1', 'Alpha', 10, '2026-08-05'),
      e('a2', 'Alpha', 10, '2026-09-05'),
      e('a3', 'Alpha', 10, '2026-10-05'),
    ],
    today
  ).map((c) => c.title),
  ['Alpha', 'Beta']
);
check(
  'an earlier today moves the window: the gym is in, everything later is out',
  detectRecurringCandidates(ledger, '2026-06-15').map((c) => c.title),
  ['Gym']
);
check(
  'the amount tolerance is inclusive',
  detectRecurringCandidates(
    [
      e('t1', 'Tol', 100, '2026-08-01'),
      e('t2', 'Tol', 115, '2026-09-01'),
      e('t3', 'Tol', 85, '2026-10-01'),
    ],
    today
  ).length,
  1
);
check('nothing in an empty ledger', detectRecurringCandidates([], today), []);

console.log('--- makeRecurring ---');
check('monthly from the 1st', makeRecurring({ date: '2026-11-01' }, '1_months', 1), {
  isRecurring: true,
  recurringInterval: '1_months',
  nextRecurringDate: '2026-12-01',
});
check('weekly', makeRecurring({ date: '2026-11-02' }, '1_weeks', 2), {
  isRecurring: true,
  recurringInterval: '1_weeks',
  nextRecurringDate: '2026-11-09',
});
check('every two weeks', makeRecurring({ date: '2026-10-30' }, '2_weeks', 30), {
  isRecurring: true,
  recurringInterval: '2_weeks',
  nextRecurringDate: '2026-11-13',
});
check(
  'a month cycle clamps to a short month',
  makeRecurring({ date: '2026-10-31' }, '1_months', 31).nextRecurringDate,
  '2026-11-30'
);

console.log(bad === 0 ? '\nALL RECURRING DETECT CHECKS PASSED' : `\n${bad} FAILURE(S)`);
process.exit(bad === 0 ? 0 : 1);
