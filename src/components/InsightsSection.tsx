import { useMemo } from 'react';
import { Lightbulb } from 'lucide-react';
import { Expense } from '../types';
import {
  spendByInstrument,
  creditFrontedBy,
  medianDaysToSettle,
  categoryTrends,
  categoryLending,
  venmoFees,
  UNKNOWN_INSTRUMENT,
} from '../lib/insights';

interface Props {
  expenses: Expense[];
  members: { uid: string; name?: string }[];
  activeUser: string;
}

const INSTRUMENT_LABELS: Record<string, string> = {
  CASH: 'Cash',
  CREDIT: 'Credit',
  DEBIT: 'Debit',
  TRANSFER: 'Bank',
  VENMO: 'Venmo',
  ZELLE: 'Zelle',
  OTHER: 'Other',
  [UNKNOWN_INSTRUMENT]: 'Not recorded',
};

const money = (v: number) => `$${v.toFixed(2)}`;
const label = 'text-xs font-bold text-natural-muted uppercase tracking-widest';
const panel = 'bg-white border border-natural-border rounded-3xl shadow-sm';

/**
 * Insights: how the money moved, not just how much. Port of the iOS stats
 * screen; the arithmetic is `lib/insights.ts`, mirrored in the Flutter
 * `insights.dart`. Cherry+ only, mounted by App.
 */
export default function InsightsSection({ expenses, members, activeUser }: Props) {
  const nameOf = (uid: string) =>
    uid === activeUser ? 'You' : members.find((m) => m.uid === uid)?.name || 'Someone';

  const data = useMemo(() => {
    const mix = spendByInstrument(expenses);
    const mixTotal = Object.values(mix).reduce((t, v) => t + v, 0);
    return {
      mix: Object.entries(mix).sort((a, b) => b[1] - a[1]),
      mixTotal,
      credit: Object.entries(creditFrontedBy(expenses)).sort((a, b) => b[1] - a[1]),
      median: medianDaysToSettle(expenses),
      venmo: venmoFees(expenses),
      trends: categoryTrends(expenses),
      lending: categoryLending(expenses),
    };
  }, [expenses]);

  if (expenses.length === 0) {
    return (
      <section className={`${panel} p-5`}>
        <h3 className={`${label} flex items-center gap-1.5`}>
          <Lightbulb className="h-3.5 w-3.5 text-natural-primary" /> Insights
        </h3>
        <p className="mt-2 text-sm text-natural-muted">Log a few expenses and this fills in.</p>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div>
        <h3 className={`${label} flex items-center gap-1.5`}>
          <Lightbulb className="h-3.5 w-3.5 text-natural-primary" /> Insights
        </h3>
        <p className="mt-1 text-xs text-natural-muted">How the money moved, not just how much.</p>
      </div>

      {/* How it was paid */}
      <div className={`${panel} p-5`}>
        <span className={label}>How it was paid</span>
        <p className="mt-1 text-xs text-natural-muted">
          Cash and credit are not the same event. This is the split of everything logged.
        </p>
        <div className="mt-3 space-y-2">
          {data.mix.map(([k, v]) => (
            <div key={k}>
              <div className="flex items-center justify-between text-sm">
                <span className="text-natural-text font-medium">{INSTRUMENT_LABELS[k] || k}</span>
                <span className="font-mono text-xs text-natural-text">{money(v)}</span>
              </div>
              <div className="mt-1 h-1.5 rounded-full bg-natural-sidebar overflow-hidden">
                <div
                  className="h-full bg-natural-primary rounded-full"
                  style={{
                    width: `${data.mixTotal > 0 ? Math.min(100, (v / data.mixTotal) * 100) : 0}%`,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Fronted on credit */}
      {data.credit.length > 0 && (
        <div className={`${panel} p-5`}>
          <span className={label}>Fronted on credit</span>
          <p className="mt-1 text-xs text-natural-muted">
            Floating the household on a card is a real cost to one person that an even split hides.
          </p>
          <div className="mt-3 space-y-1.5">
            {data.credit.map(([uid, v]) => (
              <div key={uid} className="flex items-center justify-between text-sm">
                <span className="text-natural-text font-medium">{nameOf(uid)}</span>
                <span className="font-mono text-xs text-natural-text">{money(v)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Time to pay back */}
      <div className={`${panel} p-5`}>
        <span className={label}>Time to pay back</span>
        <p className="mt-1 text-xs text-natural-muted">
          Median, so one expense that sat for months cannot make the whole household look slow.
        </p>
        {data.median === null ? (
          <p className="mt-3 text-sm text-natural-muted">Nothing has settled yet.</p>
        ) : (
          <p className="mt-3 flex items-baseline gap-1.5">
            <span className="font-display text-3xl font-semibold text-natural-text">
              {data.median}
            </span>
            <span className="font-mono text-xs text-natural-muted">
              {data.median === 1 ? 'day' : 'days'}
            </span>
          </p>
        )}
      </div>

      {/* Venmo instant transfer */}
      {data.venmo.settlementCount > 0 && (
        <div className={`${panel} p-5`}>
          <span className={label}>Venmo instant transfer</span>
          <p className="mt-1 text-xs text-natural-muted">
            An upper bound. The app cannot tell whether a payment was taken instantly or on the free
            standard transfer, so this is what instant would have cost.
          </p>
          <div className="mt-3 space-y-1.5 text-sm">
            {[
              ['Moved through Venmo', money(data.venmo.transferred), ''],
              [
                'Estimated fees if instant',
                money(data.venmo.estimatedFees),
                'text-natural-primary',
              ],
              ['Payments', String(data.venmo.settlementCount), ''],
            ].map(([l, v, tone]) => (
              <div key={l} className="flex items-center justify-between">
                <span className="text-natural-muted">{l}</span>
                <span className={`font-mono text-xs font-semibold ${tone || 'text-natural-text'}`}>
                  {v}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* By category */}
      <div className={panel}>
        <div className="p-5 pb-3">
          <span className={label}>By category</span>
          <p className="mt-1 text-xs text-natural-muted">
            What it costs, how long it takes to come back, and who ends up carrying it.
          </p>
        </div>
        <div className="divide-y divide-natural-border">
          {data.trends.map((t) => {
            const row = data.lending[t.category] || {};
            let carrier: [string, number] | null = null;
            for (const [uid, net] of Object.entries(row)) {
              if (net > 0.01 && (carrier === null || net > carrier[1])) carrier = [uid, net];
            }
            const bits = [
              t.medianDays !== null
                ? `${t.medianDays} day${t.medianDays === 1 ? '' : 's'} to settle`
                : null,
              carrier ? `${nameOf(carrier[0])} carries ${money(carrier[1])}` : null,
            ].filter(Boolean);
            return (
              <div key={t.category} className="px-5 py-3.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-natural-text truncate">
                    {t.category}
                  </span>
                  <span className="font-display text-[15px] font-semibold text-natural-text">
                    {money(t.total)}
                  </span>
                </div>
                {bits.length > 0 && (
                  <p className="mt-1 font-mono text-[10px] text-natural-muted">
                    {bits.join('  ·  ')}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
