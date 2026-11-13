// Cross-group personal view (lib/crossGroup): merging the member's shares
// across ledgers, then the existing reports arithmetic over the result.
// Mirrors the Flutter test/cross_group_test.dart vector for vector. Run with
// `npm run test:parity`.
import { mergePersonalAcrossGroups, groupsIn } from '../src/lib/crossGroup';
import { totals, byCategory, frontedBy } from '../src/lib/reports';
import { goalFunded } from '../src/lib/plan';
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
    paidBy: string;
    shares: Record<string, number>;
    splitType?: Expense['splitType'];
    goal?: string;
    createdAt?: string;
  }
): Expense =>
  ({
    id,
    groupId: 'stale',
    title: id,
    amount: o.amount,
    date: o.date,
    category: o.category ?? 'Groceries',
    paidBy: o.paidBy,
    contributions: [{ userId: o.paidBy, amount: o.amount, instrumentType: 'CREDIT' }],
    splitType: o.splitType ?? 'household_default',
    shares: o.shares,
    ...(o.goal ? { goalId: o.goal } : {}),
    status: 'OPEN',
    createdAt: o.createdAt ?? `${o.date}T12:00:00.000Z`,
  }) as Expense;

// Group g1: a and b, 60/40. Group g2: a and c, 50/50.
const g1: Expense[] = [
  e('g1-groceries-nov', { amount: 100, date: '2026-11-03', paidBy: 'a', shares: { a: 60, b: 40 } }),
  e('g1-dinner-nov', {
    amount: 50,
    date: '2026-11-08',
    category: 'Dining',
    paidBy: 'b',
    shares: { a: 30, b: 20 },
  }),
  e('g1-groceries-oct', { amount: 80, date: '2026-10-20', paidBy: 'b', shares: { a: 48, b: 32 } }),
  e('g1-deposit', {
    amount: 300,
    date: '2026-11-01',
    category: 'House account',
    paidBy: 'a',
    shares: {},
    splitType: 'deposit',
  }),
  e('g1-dark-b', {
    amount: 40,
    date: '2026-11-06',
    category: 'Gifts',
    paidBy: 'b',
    shares: {},
    splitType: 'dark_cherry',
  }),
  e('g1-bike-a', {
    amount: 100,
    date: '2026-11-02',
    category: 'Bike',
    paidBy: 'a',
    shares: { a: 100 },
    splitType: 'goal',
    goal: 'bike',
  }),
];
const g2: Expense[] = [
  e('g2-rent-nov', {
    amount: 1200,
    date: '2026-11-01',
    category: 'Rent',
    paidBy: 'c',
    shares: { a: 600, c: 600 },
  }),
  e('g2-groceries-nov', { amount: 70, date: '2026-11-03', paidBy: 'c', shares: { a: 35, c: 35 } }),
  // Only c is on this one: nothing of a's.
  e('g2-c-only', {
    amount: 25,
    date: '2026-11-04',
    category: 'Dining',
    paidBy: 'c',
    shares: { c: 25 },
  }),
  e('g2-bike-c', {
    amount: 50,
    date: '2026-11-05',
    category: 'Bike',
    paidBy: 'c',
    shares: { c: 50 },
    splitType: 'goal',
    goal: 'bike',
  }),
  e('g2-old', { amount: 90, date: '2026-05-10', paidBy: 'a', shares: { a: 45, c: 45 } }),
];

console.log('--- mergePersonalAcrossGroups ---');
const merged = mergePersonalAcrossGroups({ g2, g1 }, 'a');
check(
  'ids newest first, ties by createdAt then id; no deposit, no pot, no line without a share',
  merged.map((x) => x.id),
  [
    'g1-dinner-nov',
    'g1-groceries-nov',
    'g2-groceries-nov',
    'g1-bike-a',
    'g2-rent-nov',
    'g1-groceries-oct',
    'g2-old',
  ]
);
check(
  'every line carries the group it came from',
  merged.map((x) => x.groupId),
  ['g1', 'g1', 'g2', 'g1', 'g2', 'g1', 'g2']
);
check(
  'shares are reduced to the member alone, amounts untouched',
  merged.map((x) => [x.amount, x.shares]),
  [
    [50, { a: 30 }],
    [100, { a: 60 }],
    [70, { a: 35 }],
    [100, { a: 100 }],
    [1200, { a: 600 }],
    [80, { a: 48 }],
    [90, { a: 45 }],
  ]
);
check(
  'a date filter trims it',
  mergePersonalAcrossGroups({ g1, g2 }, 'a', { start: '2026-11-01', end: '2026-11-30' }).map(
    (x) => x.id
  ),
  ['g1-dinner-nov', 'g1-groceries-nov', 'g2-groceries-nov', 'g1-bike-a', 'g2-rent-nov']
);
check(
  'another member sees their own shares',
  mergePersonalAcrossGroups({ g1, g2 }, 'c').map((x) => [x.id, x.shares]),
  [
    ['g2-bike-c', { c: 50 }],
    ['g2-c-only', { c: 25 }],
    ['g2-groceries-nov', { c: 35 }],
    ['g2-rent-nov', { c: 600 }],
    ['g2-old', { c: 45 }],
  ]
);
check('groupsIn, in order of first appearance', groupsIn(merged), ['g1', 'g2']);
check('nothing from nothing', mergePersonalAcrossGroups({}, 'a'), []);

console.log('--- the reports arithmetic over the merged list, Personal view ---');
const nov = { start: '2026-11-01', end: '2026-11-30', view: 'personal' as const, uid: 'a' };
check(
  'November totals: shares across both groups, goal contribution left out',
  (({ total, count, previousTotal, changePct }) => ({ total, count, previousTotal, changePct }))(
    totals(merged, nov, '2026-11-30')
  ),
  { total: 725, count: 4, previousTotal: 48, changePct: 1410 }
);
check(
  'by category sums the same category across groups',
  byCategory(merged, nov).map((r) => [r.category, r.total]),
  [
    ['Rent', 600],
    ['Groceries', 95],
    ['Dining', 30],
  ]
);
check(
  'who fronted my share, across groups',
  frontedBy(merged, nov, ['a', 'b', 'c']).map((r) => [r.uid, r.total]),
  [
    ['c', 635],
    ['b', 30],
  ]
);
check(
  'a personal goal funded across groups counts only my own contributions',
  goalFunded(merged, { id: 'bike' }, 'personal', 'a'),
  100
);

console.log(bad === 0 ? '\nALL CROSS GROUP CHECKS PASSED' : `\n${bad} FAILURE(S)`);
process.exit(bad === 0 ? 0 : 1);
