// Export (lib/exportSheets): the sheets a workbook is built from and the CSV
// text. Plain columns, names not ids, dates as YYYY-MM-DD strings (the xlsx
// writer turns them into date cells), money as numbers. Run with
// `npm run test:parity`.
import { buildSheets, toCsv, ExportLabels } from '../src/lib/exportSheets';
import type { Expense } from '../src/types';

let bad = 0;
const check = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) bad++;
  console.log(
    `${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ` (got ${JSON.stringify(got)}, want ${JSON.stringify(want)})`}`
  );
};

const line = (
  id: string,
  o: {
    amount: number;
    date: string;
    category?: string;
    paidBy?: string;
    instrument?: string;
    settled?: boolean;
    deposit?: boolean;
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
    contributions: [{ userId: paidBy, amount: o.amount, instrumentType: o.instrument ?? 'CREDIT' }],
    splitType: o.deposit ? 'deposit' : 'household_default',
    shares: o.deposit ? {} : { a: aShare, b: bShare },
    status: 'OPEN',
    createdAt: `${o.date}T12:00:00.000Z`,
    settlements: o.settled
      ? [
          {
            id: `s-${id}`,
            expenseId: id,
            paidBy: paidBy === 'a' ? 'b' : 'a',
            receivedBy: paidBy,
            amount: paidBy === 'a' ? bShare : aShare,
            instrumentType: 'VENMO',
            timestamp: `${o.date}T18:00:00.000Z`,
            paymentDate: o.date,
            status: 'confirmed',
          },
        ]
      : undefined,
  } as Expense;
};

const ledger: Expense[] = [
  line('groceries-nov', { amount: 86.4, date: '2026-11-03' }),
  line('electric-nov', {
    amount: 112,
    date: '2026-11-02',
    category: 'Utilities',
    paidBy: 'b',
    instrument: 'DEBIT',
    settled: true,
  }),
  line('takeout-nov', {
    amount: 42.75,
    date: '2026-11-01',
    category: 'Dining, "late"',
    instrument: 'CASH',
  }),
  line('deposit-nov', {
    amount: 120,
    date: '2026-11-10',
    category: 'House account',
    instrument: 'TRANSFER',
    deposit: true,
  }),
  line('brunch-sep', { amount: 46, date: '2026-09-14', category: 'Dining', settled: true }),
];

const labels: ExportLabels = {
  sheet: {
    ledger: 'Ledger',
    pivot: 'By category and month',
    deposits: 'House account',
    settlements: 'Settlements',
  },
  date: 'Date',
  item: 'Item',
  category: 'Category',
  paidBy: 'Paid by',
  method: 'Method',
  amount: 'Amount',
  yourShare: 'Your share',
  status: 'Status',
  recurring: 'Recurring',
  total: 'Total',
  from: 'From',
  to: 'To',
  uncategorised: 'Uncategorised',
  month: (m) => m,
  methodName: (c) => c.toLowerCase(),
  settlementStatus: (s) => s,
};

const names: Record<string, string> = { a: 'Olivia', b: 'Sam' };
const sheets = buildSheets(['ledger', 'pivot', 'deposits', 'settlements'], {
  expenses: ledger,
  filter: { start: '2026-11-01', end: '2026-11-30', view: 'personal', uid: 'a' },
  nameOf: (u) => names[u] ?? u,
  statusLabel: (e) => (e.settlements?.length ? 'Settled' : 'Open'),
  labels,
});

check(
  'sheet order and names',
  sheets.map((s) => s.name),
  ['Ledger', 'By category and month', 'House account', 'Settlements']
);
check(
  'ledger headers',
  sheets[0].columns.map((c) => c.header),
  ['Date', 'Item', 'Category', 'Paid by', 'Method', 'Amount', 'Your share', 'Status', 'Recurring']
);
check('ledger rows: names, numbers, no deposit', sheets[0].rows, [
  ['2026-11-01', 'takeout-nov', 'Dining, "late"', 'Olivia', 'cash', 42.75, 25.65, 'Open', false],
  ['2026-11-02', 'electric-nov', 'Utilities', 'Sam', 'debit', 112, 67.2, 'Settled', false],
  ['2026-11-03', 'groceries-nov', 'Groceries', 'Olivia', 'credit', 86.4, 51.84, 'Open', false],
]);
check(
  'pivot headers',
  sheets[1].columns.map((c) => c.header),
  ['Category', '2026-11', 'Total']
);
check('pivot rows end with the total row', sheets[1].rows, [
  ['Utilities', 67.2, 67.2],
  ['Groceries', 51.84, 51.84],
  ['Dining, "late"', 25.65, 25.65],
  ['Total', 144.69, 144.69],
]);
check('deposits sheet', sheets[2].rows, [['2026-11-10', 'Olivia', 'transfer', 120, 'deposit-nov']]);
check('settlements in the period only', sheets[3].rows, [
  ['2026-11-02', 'electric-nov', 'Olivia', 'Sam', 67.2, 'venmo', 'confirmed'],
]);

const csv = toCsv([sheets[2], sheets[3]]);
check('csv quoting and sheet separation', csv.split('\r\n'), [
  'Date,Paid by,Method,Amount,Item',
  '2026-11-10,Olivia,transfer,120,deposit-nov',
  '',
  'Date,Item,From,To,Amount,Method,Status',
  '2026-11-02,electric-nov,Olivia,Sam,67.2,venmo,confirmed',
]);
check(
  'csv escapes quotes and commas',
  toCsv([sheets[0]]).split('\r\n')[1].split(',"')[1].split('",')[0],
  'Dining, ""late""'
);

if (bad) {
  console.error(`${bad} check(s) failed`);
  process.exit(1);
}
