// Category rules (lib/rules): matching, the Log form's preselect and the
// after-save suggestion. Mirrors the Flutter test/rules_test.dart vector for
// vector. Run with `npm run test:parity`.
import { CategoryRule, matchRule, categoryFor, suggestRule, ruleFrom } from '../src/lib/rules';
import type { Expense } from '../src/types';

let bad = 0;
const check = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) bad++;
  console.log(
    `${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ` (got ${JSON.stringify(got)}, want ${JSON.stringify(want)})`}`
  );
};

const e = (title: string, category: string, date: string): Expense =>
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
  }) as Expense;

const rules: CategoryRule[] = [
  {
    id: 'r1',
    contains: 'trader joe',
    category: 'Groceries',
    createdAt: '2026-10-01T12:00:00.000Z',
  },
  { id: 'r2', contains: 'joe', category: 'Dining Out', createdAt: '2026-10-02T12:00:00.000Z' },
  { id: 'r3', contains: '', category: 'Other', createdAt: '2026-10-03T12:00:00.000Z' },
  { id: 'r4', contains: 'Con Ed', category: 'Utilities', createdAt: '2026-10-04T12:00:00.000Z' },
];
const cats = ['Rent', 'Groceries', 'Dining Out', 'Transport', 'Subscription', 'Other'];
const history = [
  e('Corner shop', 'Groceries', '2026-09-01'),
  e('corner shop', 'Groceries', '2026-10-01'),
  e('Corner Shop', 'Dining Out', '2026-10-15'),
  e('Netflix', 'Subscription', '2026-10-05'),
];

console.log('--- matchRule ---');
check('first stored rule wins', matchRule("Trader Joe's #12", rules)?.id, 'r1');
check('substring of the normalized title', matchRule('Lunch at JOE S', rules)?.id, 'r2');
check('a blank contains never matches', matchRule('anything', rules), null);
check('the rule contains is normalized too', matchRule('con ed bill', rules)?.id, 'r4');
check('blank title', matchRule('  ', rules), null);
check('no rules', matchRule('Trader Joe', []), null);

console.log('--- categoryFor ---');
check(
  'a rule beats history',
  categoryFor('Trader Joe', rules, [e('Trader Joe', 'Dining Out', '2026-10-01')], cats),
  'Groceries'
);
check(
  'a rule category outside the list still wins',
  categoryFor('Con Ed', rules, [], cats),
  'Utilities'
);
check('then history', categoryFor('Corner shop', rules, history, cats), 'Groceries');
check('then keywords', categoryFor('Uber home', rules, history, cats), 'Transport');
check('then nothing', categoryFor('zzz', rules, history, cats), null);

console.log('--- suggestRule ---');
check(
  'second time with a non-keyword category',
  suggestRule('Corner shop', 'Dining Out', history),
  {
    contains: 'corner shop',
    category: 'Dining Out',
  }
);
check(
  'a variant spelling is a different title',
  suggestRule("Corner Shop's", 'Groceries', history),
  null
);
check(
  'contains is the normalized title',
  suggestRule("Corner Shop's", 'Groceries', [
    ...history,
    e("corner shop's", 'Groceries', '2026-10-20'),
  ]),
  {
    contains: 'corner shop s',
    category: 'Groceries',
  }
);
check('first time is nothing', suggestRule('Bodega', 'Groceries', history), null);
check('the keyword already gets it right', suggestRule('Netflix', 'Subscription', history), null);
check(
  'a keyword that guesses wrong is overridden',
  suggestRule('Netflix', 'Other', [e('Netflix', 'Other', '2026-09-05')]),
  {
    contains: 'netflix',
    category: 'Other',
  }
);
check(
  'a matching rule with the same category is not offered again',
  suggestRule('Corner shop', 'Groceries', history, [
    { id: 'x', contains: 'corner', category: 'Groceries', createdAt: '2026-10-01T12:00:00.000Z' },
  ]),
  null
);
check(
  'a matching rule with another category is overridden',
  suggestRule('Corner shop', 'Groceries', history, [
    { id: 'x', contains: 'corner', category: 'Dining Out', createdAt: '2026-10-01T12:00:00.000Z' },
  ]),
  {
    contains: 'corner shop',
    category: 'Groceries',
  }
);
check('blank category', suggestRule('Corner shop', ' ', history), null);
check('blank title', suggestRule('42', 'Groceries', history), null);
check(
  'ruleFrom',
  ruleFrom({ contains: 'corner shop', category: 'Dining Out' }, '2026-11-13T12:00:00.000Z', 'r9'),
  {
    id: 'r9',
    contains: 'corner shop',
    category: 'Dining Out',
    createdAt: '2026-11-13T12:00:00.000Z',
  }
);

console.log(bad === 0 ? '\nALL RULES CHECKS PASSED' : `\n${bad} FAILURE(S)`);
process.exit(bad === 0 ? 0 : 1);
