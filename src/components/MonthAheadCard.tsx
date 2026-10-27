import { useMemo, useState } from 'react';
import { CalendarRange, Sparkles, Repeat } from 'lucide-react';
import { Expense } from '../types';
import { forecastMonth } from '../lib/forecast';
import { todayLocal, parseLocalDate } from '../lib/recurring';
import { formatAmount, formatShortDate } from '../lib/format';
import { labelClass } from '../lib/ui';

interface Props {
  expenses: Expense[];
  activeUser: string;
  /** Cherry + gate: render a teaser that opens the Cherry + page. */
  locked?: boolean;
  onUnlock?: () => void;
}

const panel = 'bg-white border border-natural-border rounded-3xl p-5 shadow-sm';
const tile = 'bg-natural-bg/50 rounded-xl p-2 border border-natural-border/50 text-center';

const monthName = (year: number, monthIndex: number) =>
  new Date(year, monthIndex, 1).toLocaleDateString('en-US', { month: 'long' });

const SHOWN = 6;

/**
 * My month ahead: this member's share of the shared costs for a month, dated,
 * before they come due. Arithmetic in `lib/forecast.ts`. Cherry + only,
 * mounted by App in the right rail under Balances.
 */
export default function MonthAheadCard({ expenses, activeUser, locked, onUnlock }: Props) {
  // 0 is the current month, 1 the next: people budget by calendar month.
  const [offset, setOffset] = useState<0 | 1>(0);
  const today = todayLocal();

  const forecast = useMemo(() => {
    if (locked) return null;
    const now = parseLocalDate(today);
    const target = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    return forecastMonth(expenses, activeUser, target.getFullYear(), target.getMonth(), today);
  }, [expenses, activeUser, offset, locked, today]);

  if (locked) {
    return (
      <button
        onClick={onUnlock}
        className={`${panel} w-full text-left space-y-3 hover:border-natural-primary/40 transition-colors cursor-pointer`}
        id="month-ahead-locked"
      >
        <div className="flex items-center justify-between">
          <h3 className={`${labelClass} flex items-center gap-1.5`}>
            <CalendarRange className="h-3.5 w-3.5 text-natural-primary" /> My month ahead
          </h3>
          <span className="text-[10px] font-bold tracking-wider text-white bg-natural-dark px-1.5 py-0.5 rounded-md">
            Cherry +
          </span>
        </div>
        <div className="grid grid-cols-3 gap-2" aria-hidden="true">
          {['Left to pay', 'Your share', 'Carried in'].map((l) => (
            <div key={l} className={tile}>
              <span className="block text-lg font-display font-semibold text-natural-border select-none">
                ···
              </span>
              <span className="block text-xs font-semibold text-natural-muted uppercase">{l}</span>
            </div>
          ))}
        </div>
        <p className="text-xs text-natural-muted flex items-center gap-1.5">
          <Sparkles className="h-3 w-3 shrink-0" /> Your share of the month, dated, before it comes
          due - with Cherry +.
        </p>
      </button>
    );
  }

  if (!forecast) return null;

  const name = monthName(forecast.year, forecast.monthIndex);
  const upcoming = forecast.items.filter(
    (i) => !i.paid && (i.kind === 'projected' || i.date >= today)
  );
  const shown = upcoming.slice(0, SHOWN);
  const more = upcoming.length - shown.length;
  const empty = forecast.items.length === 0 && forecast.carriedIn <= 0.01;

  return (
    <section className={`${panel} space-y-3`} id="month-ahead-card">
      <div className="flex items-center justify-between gap-2">
        <h3 className={`${labelClass} flex items-center gap-1.5`}>
          <CalendarRange className="h-3.5 w-3.5 text-natural-primary" /> My month ahead
        </h3>
        <div
          className="flex rounded-lg border border-natural-border overflow-hidden text-[11px] font-semibold"
          role="tablist"
          aria-label="Month"
        >
          {([0, 1] as const).map((o) => (
            <button
              key={o}
              type="button"
              role="tab"
              aria-selected={offset === o}
              onClick={() => setOffset(o)}
              className={`px-2 py-1 transition-colors ${
                offset === o
                  ? 'bg-natural-dark text-white'
                  : 'bg-white text-natural-muted hover:text-natural-text'
              }`}
            >
              {o === 0 ? 'This month' : 'Next month'}
            </button>
          ))}
        </div>
      </div>

      {empty ? (
        <p className="text-sm text-natural-muted">
          Nothing with your name on it in {name} yet. Recurring costs show up here before they come
          due.
        </p>
      ) : (
        <>
          <div>
            <p className="flex items-baseline gap-1.5">
              <span className="font-display text-3xl font-semibold text-natural-text">
                {formatAmount(forecast.leftToPay)}
              </span>
              <span className="font-mono text-xs text-natural-muted">left to pay in {name}</span>
            </p>
            <p className="mt-1 text-xs text-natural-muted">
              Your share of the month is {formatAmount(forecast.total)}:{' '}
              {formatAmount(forecast.loggedShare)} logged
              {forecast.projectedShare > 0.01 && (
                <> and {formatAmount(forecast.projectedShare)} still expected</>
              )}
              .
              {forecast.carriedIn > 0.01 && (
                <> Plus {formatAmount(forecast.carriedIn)} still open from earlier months.</>
              )}
            </p>
          </div>

          {shown.length > 0 && (
            <ul className="divide-y divide-natural-border border-t border-natural-border">
              {shown.map((i) => (
                <li key={i.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                  <div className="min-w-0">
                    <span className="block truncate font-medium text-natural-text">{i.title}</span>
                    <span className="font-mono text-[10px] text-natural-muted flex items-center gap-1">
                      {formatShortDate(i.date)}
                      {i.kind === 'projected' && (
                        <>
                          <span aria-hidden="true">·</span>
                          <Repeat className="h-2.5 w-2.5" aria-hidden="true" /> expected
                        </>
                      )}
                    </span>
                  </div>
                  <span className="font-mono text-xs text-natural-text shrink-0">
                    {formatAmount(i.share)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {more > 0 && (
            <p className="font-mono text-[10px] text-natural-muted">and {more} more this month</p>
          )}
        </>
      )}

      <p className="text-[10px] text-natural-muted">
        Your household's own numbers, arranged by date. Not financial advice.
      </p>
    </section>
  );
}
