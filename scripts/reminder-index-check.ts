// The reminder index (lib/reminderIndex), mirroring the iOS
// reminder_index_test.dart. Run with `npm run test:parity`.
import {
  buildReminderIndex,
  nextVaultBillDate,
  reminderIndexSignature,
} from '../src/lib/reminderIndex';
import type { Expense, VaultBill } from '../src/types';

let bad = 0;
const check = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) bad++;
  console.log(
    `${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ` (got ${JSON.stringify(got)}, want ${JSON.stringify(want)})`}`
  );
};
const now = new Date(2026, 7, 27); // Aug 27 2026
const bill = (id: string, dueDay: number): VaultBill => ({
  id,
  name: 'Con Ed',
  amount: 120,
  dueDay,
  category: 'Utilities',
  notes: 'secret',
});
const recurring = (id: string, next: string | null): Expense =>
  ({
    id,
    groupId: 'g',
    title: 'Rent',
    amount: 2000,
    date: '2026-08-01',
    category: 'Rent',
    paidBy: 'a',
    splitType: 'equal',
    shares: { a: 1000, b: 1000 },
    status: 'pending',
    createdAt: '2026-08-01',
    isRecurring: true,
    ...(next ? { nextRecurringDate: next } : {}),
  }) as unknown as Expense;

const entry = buildReminderIndex([], { bills: [bill('b1', 30)], docs: [] }, { now })[0];
check('carries id, date, target and nothing else', Object.keys(entry).sort(), [
  'dueDate',
  'id',
  'target',
]);
check(
  'leaks no name or amount',
  JSON.stringify(entry).includes('Con Ed') || JSON.stringify(entry).includes('120'),
  false
);
check('date carries no time of day', /^\d{4}-\d{2}-\d{2}$/.test(entry.dueDate), true);
check(
  'this month when the day is ahead',
  nextVaultBillDate(bill('b', 30), now)?.getTime(),
  new Date(2026, 7, 30).getTime()
);
check(
  'rolls to next month once passed',
  nextVaultBillDate(bill('b', 3), now)?.getTime(),
  new Date(2026, 8, 3).getTime()
);
check(
  'today counts as due',
  nextVaultBillDate(bill('b', 27), now)?.getTime(),
  new Date(2026, 7, 27).getTime()
);
check(
  'clamps to a short month',
  nextVaultBillDate(bill('b', 31), new Date(2026, 1, 1))?.getTime(),
  new Date(2026, 1, 28).getTime()
);
check(
  'rejects nonsense days',
  [nextVaultBillDate(bill('b', 0), now), nextVaultBillDate(bill('b', 32), now)],
  [null, null]
);
const rec = buildReminderIndex([recurring('r1', '2026-09-05')], null, { now });
check('includes recurring by next date', rec, [
  { id: 'r1', dueDate: '2026-09-05', target: 'recurring' },
]);
check(
  'drops past the horizon',
  buildReminderIndex([recurring('r1', '2027-01-01')], null, { now }),
  []
);
check(
  'drops recurring with no next date',
  buildReminderIndex([recurring('r1', null)], null, { now }),
  []
);
check(
  'sorts soonest first',
  buildReminderIndex([recurring('later', '2026-09-20'), recurring('sooner', '2026-09-02')], null, {
    now,
  }).map((e) => e.id),
  ['sooner', 'later']
);
check(
  'signature ignores order',
  reminderIndexSignature([
    { id: 'a', dueDate: '2026-09-02', target: 'bill' },
    { id: 'b', dueDate: '2026-09-03', target: 'recurring' },
  ]),
  reminderIndexSignature([
    { id: 'b', dueDate: '2026-09-03', target: 'recurring' },
    { id: 'a', dueDate: '2026-09-02', target: 'bill' },
  ])
);

console.log(bad ? `\n${bad} FAILURES` : '\nall reminder index rules hold');
if (bad) process.exit(1);
