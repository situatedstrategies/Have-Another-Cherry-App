// Plan a Purchase projection (lib/planPurchase): shares that sum exactly,
// drift to the payer, net today, and the delta a purchase adds. Mirrors the
// iOS `test/` expectations. Run with `npm run test:parity`.
import {
  sharesFromPercentages,
  equalShares,
  netNow,
  purchaseDelta,
  projectPurchase,
} from '../src/lib/planPurchase';
import type { Expense } from '../src/types';

let bad = 0;
const check = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) bad++;
  console.log(
    `${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ` (got ${JSON.stringify(got)}, want ${JSON.stringify(want)})`}`
  );
};

check('65/35 of 100', sharesFromPercentages(100, { a: 65, b: 35 }, 'a'), { a: 65, b: 35 });
check(
  'thirds sum exactly, drift to payer',
  sharesFromPercentages(100, { a: 33.33, b: 33.33, c: 33.34 }, 'b'),
  {
    a: 33.33,
    b: 33.33,
    c: 33.34,
  }
);
const thirds = equalShares(100, ['a', 'b', 'c'], 'a');
check('equal thirds sum to 100', Math.round((thirds.a + thirds.b + thirds.c) * 100) / 100, 100);
check('equal thirds payer absorbs the cent', thirds.a, 33.34);
check('empty roster', equalShares(50, [], 'a'), {});

const exp = (id: string, paidBy: string, shares: Record<string, number>): Expense =>
  ({
    id,
    groupId: 'g',
    title: id,
    amount: Object.values(shares).reduce((t, v) => t + v, 0),
    date: '2026-09-01',
    category: 'Other',
    paidBy,
    splitType: 'equal',
    shares,
    status: 'pending',
    createdAt: '2026-09-01',
  }) as unknown as Expense;
const ledger = [exp('e1', 'a', { a: 60, b: 40 }), exp('e2', 'b', { a: 10, b: 10 })];
check('net today: b owes 40, is owed 10', netNow(ledger, 'b'), 30);
check('net today: a is owed 40, owes 10', netNow(ledger, 'a'), -30);

check('payer delta is minus the others', purchaseDelta({ a: 65, b: 35 }, 'a', 'a'), -35);
check('other delta is their share', purchaseDelta({ a: 65, b: 35 }, 'b', 'a'), 35);

const p = projectPurchase(1200, { a: 65, b: 35 }, 'household', 'a', 12);
check('projection shares', p.shares, { a: 780, b: 420 });
check('projection per month', p.perMonth, { a: 65, b: 35 });
check('even projection', projectPurchase(100, { a: 65, b: 35 }, 'even', 'b', 1).shares, {
  a: 50,
  b: 50,
});

console.log(bad ? `\n${bad} FAILURES` : '\nall plan purchase rules hold');
if (bad) process.exit(1);
