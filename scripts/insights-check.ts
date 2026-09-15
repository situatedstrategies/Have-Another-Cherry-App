// Insights (lib/insights): tender mix, credit fronted, days to settle,
// category lending and the Venmo fee estimate. Mirrors the iOS
// test/insights_test.dart. Run with `npm run test:parity`.
import {
  venmoInstantFee,
  VENMO_INSTANT_FEE_MIN,
  VENMO_INSTANT_FEE_MAX,
  instrumentOf,
  UNKNOWN_INSTRUMENT,
  spendByInstrument,
  creditFrontedBy,
  daysToSettle,
  medianDaysToSettle,
  categoryLending,
  venmoFees,
} from '../src/lib/insights';
import type { Expense, Settlement } from '../src/types';

let bad = 0;
const check = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) bad++;
  console.log(
    `${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ` (got ${JSON.stringify(got)}, want ${JSON.stringify(want)})`}`
  );
};

const settle = (
  amount: number,
  o: { instrument?: string; date?: string; status?: string } = {}
): Settlement =>
  ({
    id: `s${amount}${o.date || ''}`,
    expenseId: 'x',
    paidBy: 'b',
    receivedBy: 'a',
    amount,
    paymentDate: o.date || '2026-08-05',
    timestamp: o.date || '2026-08-05',
    instrumentType: o.instrument || 'CASH',
    status: o.status || 'confirmed',
  }) as unknown as Settlement;

const e = (
  id: string,
  o: {
    amount: number;
    date?: string;
    category?: string;
    paidBy?: string;
    instrument?: string;
    shares?: Record<string, number>;
    settlements?: Settlement[];
    recurring?: boolean;
  }
): Expense => {
  const paidBy = o.paidBy || 'a';
  return {
    id,
    groupId: 'g',
    title: id,
    amount: o.amount,
    date: o.date || '2026-08-01',
    category: o.category || 'Groceries',
    paidBy,
    splitType: 'equal',
    shares: o.shares || { a: 5, b: 5 },
    status: 'OPEN',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...(o.recurring !== undefined ? { isRecurring: o.recurring } : {}),
    ...(o.instrument
      ? { contributions: [{ userId: paidBy, amount: o.amount, instrumentType: o.instrument }] }
      : {}),
    settlements: o.settlements || [],
  } as unknown as Expense;
};

check('fee is 1.75%', venmoInstantFee(100), 1.75);
check('fee floors at 25c', venmoInstantFee(5), VENMO_INSTANT_FEE_MIN);
check('fee caps at 25', venmoInstantFee(10000), VENMO_INSTANT_FEE_MAX);
check('fee on nothing', venmoInstantFee(0), 0);

check(
  'instrument reads payer contribution',
  instrumentOf(e('a', { amount: 10, instrument: 'CREDIT' })),
  'CREDIT'
);
check(
  'no contribution is unknown, not other',
  instrumentOf(e('a', { amount: 10 })),
  UNKNOWN_INSTRUMENT
);

const mix = spendByInstrument([
  e('a', { amount: 20, instrument: 'CREDIT' }),
  e('b', { amount: 30, instrument: 'CREDIT' }),
  e('c', { amount: 10, instrument: 'CASH' }),
  e('d', { amount: 99, instrument: 'CASH', recurring: true }),
]);
check('spend by instrument: credit', mix.CREDIT, 50);
check('spend by instrument: cash, recurring skipped', mix.CASH, 10);

const credit = creditFrontedBy([
  e('a', { amount: 40, instrument: 'CREDIT', paidBy: 'a' }),
  e('b', { amount: 25, instrument: 'CREDIT', paidBy: 'b' }),
  e('c', { amount: 60, instrument: 'CASH', paidBy: 'a' }),
]);
check('credit fronted per payer', credit, { a: 40, b: 25 });

check(
  'days null while outstanding',
  daysToSettle(e('a', { amount: 10, settlements: [settle(2)] })),
  null
);
check(
  'days to the last settlement',
  daysToSettle(
    e('a', { amount: 10, date: '2026-08-01', settlements: [settle(5, { date: '2026-08-09' })] })
  ),
  8
);
check(
  'days never negative',
  daysToSettle(
    e('a', { amount: 10, date: '2026-08-10', settlements: [settle(5, { date: '2026-08-01' })] })
  ),
  0
);

check('median null when nothing settled', medianDaysToSettle([e('a', { amount: 10 })]), null);
const quick = [0, 1, 2].map((i) =>
  e(`q${i}`, { amount: 10, date: '2026-08-01', settlements: [settle(5, { date: '2026-08-02' })] })
);
const stale = e('s', {
  amount: 10,
  date: '2026-01-01',
  settlements: [settle(5, { date: '2026-12-01' })],
});
check('median resists one stale expense', medianDaysToSettle([...quick, stale]), 1);

check(
  'lending: positive carried the category',
  categoryLending([e('a', { amount: 10 })]).Groceries,
  { a: 5, b: -5 }
);
check(
  'lending nets across a category',
  categoryLending([e('a', { amount: 10, paidBy: 'a' }), e('b', { amount: 10, paidBy: 'b' })])
    .Groceries,
  { a: 0, b: 0 }
);

const fees = venmoFees([
  e('a', {
    amount: 100,
    settlements: [
      settle(100, { instrument: 'VENMO' }),
      settle(50, { instrument: 'CASH' }),
      settle(80, { instrument: 'VENMO', status: 'voided' }),
    ],
  }),
]);
check('venmo fees count only live venmo', fees, {
  settlementCount: 1,
  transferred: 100,
  estimatedFees: 1.75,
});
check(
  'venmo fees zero without venmo',
  venmoFees([e('a', { amount: 10, settlements: [settle(10)] })]).estimatedFees,
  0
);

console.log(bad ? `\n${bad} FAILURES` : '\nall insight rules hold');
if (bad) process.exit(1);
