// Settlement state (lib/money): when an expense counts as fully settled.
// Mirrors test/ledger_logic_test.dart in the iOS repo. Run with
// `npm run test:parity`.
import {
  isExpenseFullySettled,
  getNormalizedExpenseStatus,
  getExpenseStatusLabel,
} from '../src/lib/money';
import { Expense, Settlement } from '../src/types';

let bad = 0;
const check = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) bad++;
  console.log(
    `${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ` (got ${JSON.stringify(got)}, want ${JSON.stringify(want)})`}`
  );
};

const base = (over: Partial<Expense>): Expense =>
  ({
    id: 'e',
    title: 'Rent',
    amount: 100,
    date: '2026-08-01',
    category: 'Rent',
    paidBy: 'alice',
    shares: { alice: 65, bob: 35 },
    settlements: [],
    status: 'OPEN',
    ...over,
  }) as Expense;

// Two people: settled only when the debtor's share is confirmed paid.
check('open with a debtor is not settled', isExpenseFullySettled(base({})), false);
check(
  'confirmed payment settles it',
  isExpenseFullySettled(
    base({
      settlements: [
        {
          id: 's',
          paidBy: 'bob',
          receivedBy: 'alice',
          amount: 35,
          instrumentType: 'VENMO',
          timestamp: '2026-08-02T00:00:00Z',
          status: 'confirmed',
        } as any,
      ],
    })
  ),
  true
);

// One person: the payer carries the whole thing, nothing is owed, settled on
// logging. This is what makes "Fully settled" count for a solo household.
const solo = base({ shares: { alice: 100 }, status: 'OPEN' });
check('a row the payer carries alone is settled', isExpenseFullySettled(solo), true);
check('and normalises to CLOSED', getNormalizedExpenseStatus(solo), 'CLOSED');

// Legacy rows with no shares at all still trust only the stored flag.
check(
  'no shares, OPEN flag: not settled',
  isExpenseFullySettled(base({ shares: {}, status: 'OPEN' })),
  false
);
check(
  'no shares, CLOSED flag: settled',
  isExpenseFullySettled(base({ shares: {}, status: 'CLOSED' })),
  true
);

// Pending: paid in full, waiting on the other side. Nobody owes anybody once
// it confirms, so it is not "partially settled". Mirrors the Flutter tests
// "paid in full and awaiting confirmation is pending, not partial" and after.
const pending = (amount: number, over: Partial<Settlement> = {}): Settlement =>
  ({
    id: `s-${amount}`,
    expenseId: 'e',
    paidBy: 'bob',
    receivedBy: 'alice',
    amount,
    instrumentType: 'VENMO',
    timestamp: '2026-08-02T00:00:00Z',
    status: 'pending',
    ...over,
  }) as Settlement;
const fullPending = base({ settlements: [pending(35)] });
check(
  'a pending payment for the whole share is PENDING',
  getNormalizedExpenseStatus(fullPending),
  'PENDING'
);
check('and labelled so', getExpenseStatusLabel(fullPending), 'Pending Confirmation');
check(
  'a pending payment for part of the share is partial',
  getNormalizedExpenseStatus(base({ settlements: [pending(10)] })),
  'PARTIALLY_SETTLED'
);
check(
  'two debtors, one still owing, is partial',
  getNormalizedExpenseStatus(
    base({ shares: { alice: 50, bob: 25, carol: 25 }, settlements: [pending(25)] })
  ),
  'PARTIALLY_SETTLED'
);
check(
  'two debtors both in flight is PENDING',
  getNormalizedExpenseStatus(
    base({
      shares: { alice: 50, bob: 25, carol: 25 },
      settlements: [pending(25), pending(25, { id: 's2', paidBy: 'carol' })],
    })
  ),
  'PENDING'
);
check(
  'a voided payment leaves nothing pending',
  getNormalizedExpenseStatus(
    base({ status: 'PENDING', settlements: [pending(35, { status: 'voided' })] })
  ),
  'OPEN'
);
check(
  'legacy pending_confirmation with no records reads as pending',
  getNormalizedExpenseStatus(base({ status: 'pending_confirmation' })),
  'PENDING'
);
check(
  'a dark cherry pot covered by pending contributions is pending',
  getNormalizedExpenseStatus(
    base({
      splitType: 'dark_cherry',
      shares: {},
      settlements: [pending(60, { status: 'confirmed' }), pending(40)],
    })
  ),
  'PENDING'
);
check(
  'a dark cherry pot short of the target is partial',
  getNormalizedExpenseStatus(
    base({ splitType: 'dark_cherry', shares: {}, settlements: [pending(60)] })
  ),
  'PARTIALLY_SETTLED'
);

console.log(bad === 0 ? '\nSETTLED CHECKS PASSED' : `\n${bad} FAILURE(S)`);
process.exit(bad === 0 ? 0 : 1);
