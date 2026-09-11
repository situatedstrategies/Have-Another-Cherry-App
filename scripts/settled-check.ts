// Settlement state (lib/money): when an expense counts as fully settled.
// Mirrors test/ledger_logic_test.dart in the iOS repo. Run with
// `npm run test:parity`.
import { isExpenseFullySettled, getNormalizedExpenseStatus } from '../src/lib/money';
import { Expense } from '../src/types';

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

console.log(bad === 0 ? '\nSETTLED CHECKS PASSED' : `\n${bad} FAILURE(S)`);
process.exit(bad === 0 ? 0 : 1);
