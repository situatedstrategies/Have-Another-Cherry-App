import { useMemo } from 'react';
import { CreditCard } from 'lucide-react';
import { Expense } from '../types';
import { computeCarrying, householdCredit } from '../lib/carrying';
import { todayLocal } from '../lib/recurring';
import { formatAmount } from '../lib/format';
import { labelClass } from '../lib/ui';

interface Props {
  expenses: Expense[];
  members: { uid: string; name?: string }[];
  activeUser: string;
}

const panel = 'bg-white border border-natural-border rounded-3xl p-5 shadow-sm';

const days = (n: number) => `${n} ${n === 1 ? 'day' : 'days'}`;
const count = (n: number) => `${n} ${n === 1 ? 'expense' : 'expenses'}`;

/**
 * Who's carrying what: each member's money that is out for the household and
 * not back yet, split by whether it is riding on a card or already gone from
 * their account. Arithmetic in `lib/carrying.ts`. Cherry + only, mounted by
 * App under Insights.
 */
export default function CarryingCard({ expenses, members, activeUser }: Props) {
  const nameOf = (uid: string) =>
    uid === activeUser ? 'You' : members.find((m) => m.uid === uid)?.name || 'Someone';

  const { rows, household } = useMemo(() => {
    const rows = computeCarrying(expenses, todayLocal());
    return { rows, household: householdCredit(rows) };
  }, [expenses]);

  return (
    <section className={`${panel} space-y-3`} id="carrying-card">
      <div>
        <h3 className={`${labelClass} flex items-center gap-1.5`}>
          <CreditCard className="h-3.5 w-3.5 text-natural-primary" /> Who's carrying what
        </h3>
        <p className="mt-1 text-xs text-natural-muted">
          Money out for the household that has not come back. A card balance someone is floating is
          a different favour from cash already gone.
        </p>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-natural-muted">
          Nobody is carrying anything right now. Everything fronted has come back.
        </p>
      ) : (
        <>
          <p className="flex items-baseline gap-1.5">
            <span className="font-display text-3xl font-semibold text-natural-text">
              {formatAmount(household.onCredit)}
            </span>
            <span className="font-mono text-xs text-natural-muted">
              on cards
              {household.longestDays !== null && <>, longest {days(household.longestDays)}</>}
            </span>
          </p>

          <ul className="divide-y divide-natural-border border-t border-natural-border">
            {rows.map((r) => (
              <li key={r.uid} className="py-2.5 space-y-1">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="font-semibold text-natural-text">{nameOf(r.uid)}</span>
                  <span className="font-mono text-xs text-natural-text">
                    {formatAmount(r.total)}
                  </span>
                </div>
                <div className="space-y-0.5 font-mono text-[10px] text-natural-muted">
                  {r.onCredit > 0.01 && (
                    <p className="flex justify-between gap-2">
                      <span>
                        On a card, {count(r.onCreditCount)}
                        {r.oldestCreditDays !== null && <>, oldest {days(r.oldestCreditDays)}</>}
                      </span>
                      <span className="text-natural-primary font-semibold">
                        {formatAmount(r.onCredit)}
                      </span>
                    </p>
                  )}
                  {r.fromOwnMoney > 0.01 && (
                    <p className="flex justify-between gap-2">
                      <span>From their own money, {count(r.fromOwnMoneyCount)}</span>
                      <span>{formatAmount(r.fromOwnMoney)}</span>
                    </p>
                  )}
                  {r.unknown > 0.01 && (
                    <p className="flex justify-between gap-2">
                      <span>How it was paid not recorded</span>
                      <span>{formatAmount(r.unknown)}</span>
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      <p className="text-[10px] text-natural-muted">
        Confirmed payments only, so it agrees with Balances.
      </p>
    </section>
  );
}
