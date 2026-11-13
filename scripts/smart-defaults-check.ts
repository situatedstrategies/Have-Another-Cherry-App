// Smart defaults (lib/smartDefaults): title normalization, the category
// guess and the recurring guess. Mirrors the Flutter test/smart_defaults_test.dart
// vector for vector. Run with `npm run test:parity`.
import {
  normalizeTitle,
  suggestCategory,
  suggestRecurringInterval,
  keywordCategory,
} from '../src/lib/smartDefaults';
import type { Expense } from '../src/types';

let bad = 0;
const check = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) bad++;
  console.log(
    `${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ` (got ${JSON.stringify(got)}, want ${JSON.stringify(want)})`}`
  );
};

const e = (title: string, category: string, date: string, source?: string): Expense =>
  ({
    id: `${title}${date}`,
    groupId: 'G',
    title,
    amount: 10,
    date,
    category,
    paidBy: 'a',
    splitType: 'equal',
    shares: {},
    status: 'unsettled',
    createdAt: `${date}T12:00:00.000Z`,
    ...(source ? { recurringSourceId: source } : {}),
  }) as Expense;

const cats = ['Rent', 'Groceries', 'Dining Out', 'Transport', 'Subscription', 'Other'];

console.log('--- normalizeTitle ---');
check("Trader Joe's #12", normalizeTitle("Trader Joe's #12"), 'trader joe s');
check('collapses spaces', normalizeTitle('  trader   joes '), 'trader joes');
check('keeps Russian', normalizeTitle('Пятёрочка'), 'пятёрочка');
check('digits only is blank', normalizeTitle('2026'), '');

console.log('--- suggestCategory ---');
const history = [
  e('Corner shop', 'Groceries', '2026-09-01'),
  e('corner shop', 'Groceries', '2026-10-01'),
  e('Corner Shop', 'Dining Out', '2026-10-15'),
];
check(
  'the group history wins over keywords',
  suggestCategory('Corner shop', history, cats),
  'Groceries'
);
check('rent', suggestCategory('Monthly rent', [], cats), 'Rent');
check('netflix', suggestCategory('Netflix', [], cats), 'Subscription');
check('uber', suggestCategory('Uber home', [], cats), 'Transport');
check('russian grocer', suggestCategory('Пятёрочка', [], cats), 'Groceries');
check('spanish dinner', suggestCategory('Cena con amigos', [], cats), 'Dining Out');
check('Health is not offered', suggestCategory('Pharmacy', [], cats), null);
check('no guess', suggestCategory('zzz', [], cats), null);
check('blank title', suggestCategory('', [], cats), null);
check(
  'a tie goes to the first category seen',
  suggestCategory(
    'Corner shop',
    [e('Corner shop', 'Dining Out', '2026-09-01'), e('Corner shop', 'Groceries', '2026-10-01')],
    cats
  ),
  'Dining Out'
);

console.log('--- keywordCategory ---');
check('keyword only, no allowed list', keywordCategory('Pharmacy'), 'Health');
check('keyword none', keywordCategory('Corner shop'), null);
check('first table row wins', keywordCategory('gas bill'), 'Utilities');

console.log('--- suggestRecurringInterval ---');
check(
  'two months looks monthly',
  suggestRecurringInterval('Rent', [
    e('Rent', 'Rent', '2026-09-01'),
    e('rent', 'Rent', '2026-10-01'),
  ]),
  '1_months'
);
check(
  'four in two months looks weekly',
  suggestRecurringInterval('Groceries', [
    e('Groceries', 'Groceries', '2026-10-02'),
    e('Groceries', 'Groceries', '2026-10-09'),
    e('Groceries', 'Groceries', '2026-10-16'),
    e('Groceries', 'Groceries', '2026-11-01'),
  ]),
  '1_weeks'
);
check(
  'one entry is nothing',
  suggestRecurringInterval('Rent', [e('Rent', 'Rent', '2026-09-01')]),
  null
);
check(
  'autopilot instances do not count',
  suggestRecurringInterval('Rent', [
    e('Rent', 'Rent', '2026-09-01', 'src'),
    e('Rent', 'Rent', '2026-10-01', 'src'),
  ]),
  null
);

console.log(bad === 0 ? '\nALL SMART DEFAULTS CHECKS PASSED' : `\n${bad} FAILURE(S)`);
process.exit(bad === 0 ? 0 : 1);
