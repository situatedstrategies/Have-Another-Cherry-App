// My month ahead (lib/forecast): logged shares, projected recurring cycles,
// what is left to pay and what carried in from earlier months. Run with
// `npm run test:parity`.
import { forecastMonth, monthIso } from '../src/lib/forecast';
import type { Expense, Settlement } from '../src/types';

let bad = 0;
const check = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) bad++;
  console.log(
    `${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ` (got ${JSON.stringify(got)}, want ${JSON.stringify(want)})`}`
  );
};

const paid = (by: string, amount: number, status: 'confirmed' | 'pending' = 'confirmed') =>
  ({
    id: `s-${by}-${amount}-${status}`,
    expenseId: 'x',
    paidBy: by,
    receivedBy: 'a',
    amount,
    instrumentType: 'VENMO',
    timestamp: '2026-10-05T00:00:00.000Z',
    paymentDate: '2026-10-05',
    status,
  }) as Settlement;

const e = (
  id: string,
  o: {
    date: string;
    shares: Record<string, number>;
    paidBy?: string;
    settlements?: Settlement[];
    recurring?: string;
    recurringSourceId?: string;
    splitType?: string;
  }
): Expense =>
  ({
    id,
    groupId: 'g',
    title: id,
    amount: Object.values(o.shares).reduce((t, v) => t + v, 0),
    date: o.date,
    category: 'Other',
    paidBy: o.paidBy ?? 'a',
    splitType: o.splitType ?? 'household_default',
    shares: o.shares,
    status: 'OPEN',
    createdAt: '2026-01-01T00:00:00.000Z',
    settlements: o.settlements ?? [],
    ...(o.recurring
      ? { isRecurring: true, recurringInterval: o.recurring, nextRecurringDate: '2026-11-01' }
      : {}),
    ...(o.recurringSourceId ? { recurringSourceId: o.recurringSourceId } : {}),
  }) as unknown as Expense;

check('month iso pads', monthIso(2026, 0), '2026-01');

// October 2026, viewed from the 15th by member b. a fronts everything.
const today = '2026-10-15';
const ledger: Expense[] = [
  // Settled last month: nothing carried in from it.
  e('sep-paid', { date: '2026-09-03', shares: { a: 60, b: 40 }, settlements: [paid('b', 40)] }),
  // Open from last month: b still owes 25.
  e('sep-open', { date: '2026-09-20', shares: { a: 30, b: 25 } }),
  // This month, b has paid their 10 (pending counts as paid on b's side).
  e('oct-pending', {
    date: '2026-10-02',
    shares: { a: 10, b: 10 },
    settlements: [paid('b', 10, 'pending')],
  }),
  // This month, b fronted it: their 20 went out when it was logged.
  e('oct-mine', { date: '2026-10-04', shares: { a: 20, b: 20 }, paidBy: 'b' }),
  // This month, still open: b owes 15.
  e('oct-open', { date: '2026-10-10', shares: { a: 15, b: 15 } }),
  // Recurring definition anchored on the 1st, monthly, started in August.
  // Its October cycle has been logged (unclaimed), November's has not.
  e('rent-def', { date: '2026-08-01', shares: { a: 65, b: 35 }, recurring: '1_months' }),
  e('rent-oct', {
    date: '2026-10-01',
    shares: { a: 65, b: 35 },
    paidBy: '',
    recurringSourceId: 'rent-def',
  }),
  // Weekly definition on Thursdays from October 1st; the 1st and 8th are
  // logged, the 15th (today), 22nd and 29th are still to come.
  e('veg-def', { date: '2026-10-01', shares: { a: 6, b: 4 }, recurring: '1_weeks' }),
  e('veg-oct-8', {
    date: '2026-10-08',
    shares: { a: 6, b: 4 },
    paidBy: '',
    recurringSourceId: 'veg-def',
  }),
  // Dark Cherry: no per-person shares, never counted.
  e('pot', { date: '2026-10-12', shares: { a: 50, b: 50 }, splitType: 'dark_cherry' }),
];

const oct = forecastMonth(ledger, 'b', 2026, 9, today);
check('logged share: 10 + 20 + 15 + 35 (rent) + 4 (veg def) + 4 (veg 8th)', oct.loggedShare, 88);
check('projected: veg on the 15th, 22nd, 29th', oct.projectedShare, 12);
check('total', oct.total, 100);
check(
  'left to pay: 15 open + 35 unclaimed rent + 4 + 4 unclaimed veg + 12 projected',
  oct.leftToPay,
  70
);
// The August definition is a real expense too, and b never paid their 35 on it.
check('carried in: 25 from September + 35 on the August rent', oct.carriedIn, 60);
check(
  'items by date',
  oct.items.map((i) => `${i.date} ${i.title} ${i.kind}${i.paid ? ' paid' : ''}`),
  [
    '2026-10-01 rent-oct logged',
    '2026-10-01 veg-def logged',
    '2026-10-02 oct-pending logged paid',
    '2026-10-04 oct-mine logged paid',
    '2026-10-08 veg-oct-8 logged',
    '2026-10-10 oct-open logged',
    '2026-10-15 veg-def projected',
    '2026-10-22 veg-def projected',
    '2026-10-29 veg-def projected',
  ]
);
check('fronted by me is flagged', oct.items.find((i) => i.id === 'oct-mine')?.frontedByMe, true);

// November: nothing logged, every cycle projected.
const nov = forecastMonth(ledger, 'b', 2026, 10, today);
check('november logged', nov.loggedShare, 0);
check('november projected: rent 35 + veg 5th 12th 19th 26th', nov.projectedShare, 51);
// 25 + 35 (earlier) + 15 + 35 + 4 + 4 open in October; the pending 10 and the
// projected cycles are not carried.
check('november carries in everything still open before it', nov.carriedIn, 118);

// The payer sees their own shares as paid, and projections too.
const octA = forecastMonth(ledger, 'a', 2026, 9, today);
check('payer logged share', octA.loggedShare, 10 + 20 + 15 + 65 + 6 + 6);
// 20 owed to b on oct-mine, the unclaimed rent 65 and veg 6, three projected 6s.
check('payer: own fronted shares are paid, the rest is not', octA.leftToPay, 20 + 65 + 6 + 18);

// A past cycle with no instance is not guessed at.
const late = forecastMonth(ledger, 'b', 2026, 9, '2026-10-31');
check('from the 31st nothing is projected', late.projectedShare, 0);

check('empty ledger', forecastMonth([], 'b', 2026, 9, today).total, 0);

console.log(bad ? `\n${bad} FAILURES` : '\nall forecast rules hold');
if (bad) process.exit(1);
