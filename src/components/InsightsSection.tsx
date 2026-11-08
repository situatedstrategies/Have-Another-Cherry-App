import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
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
import { formatAmount } from '../lib/format';
import { instrumentShortLabel } from '../lib/instruments';

interface Props {
  expenses: Expense[];
  members: { uid: string; name?: string }[];
  activeUser: string;
}

const label = 'text-xs font-bold text-natural-muted uppercase tracking-widest';
const panel = 'bg-white border border-natural-border rounded-3xl shadow-sm';

/**
 * Insights: how the money moved, not just how much. Port of the iOS stats
 * screen; the arithmetic is `lib/insights.ts`, mirrored in the Flutter
 * `insights.dart`. Cherry+ only, mounted by App.
 */
export default function InsightsSection({ expenses, members, activeUser }: Props) {
  const { t } = useTranslation();
  const nameOf = (uid: string) =>
    uid === activeUser
      ? t('common.you')
      : members.find((m) => m.uid === uid)?.name || t('common.someone');
  const instrumentName = (k: string) =>
    k === UNKNOWN_INSTRUMENT ? t('insights.notRecorded') : instrumentShortLabel(k);

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
          <Lightbulb className="h-3.5 w-3.5 text-natural-primary" /> {t('insights.title')}
        </h3>
        <p className="mt-2 text-sm text-natural-muted">{t('insights.empty')}</p>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div>
        <h3 className={`${label} flex items-center gap-1.5`}>
          <Lightbulb className="h-3.5 w-3.5 text-natural-primary" /> {t('insights.title')}
        </h3>
        <p className="mt-1 text-xs text-natural-muted">{t('insights.subtitle')}</p>
      </div>

      {/* How it was paid */}
      <div className={`${panel} p-5`}>
        <span className={label}>{t('insights.howPaid')}</span>
        <p className="mt-1 text-xs text-natural-muted">{t('insights.howPaidBody')}</p>
        <div className="mt-3 space-y-2">
          {data.mix.map(([k, v]) => (
            <div key={k}>
              <div className="flex items-center justify-between text-sm">
                <span className="text-natural-text font-medium">{instrumentName(k)}</span>
                <span className="font-mono text-xs text-natural-text">{formatAmount(v)}</span>
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
          <span className={label}>{t('insights.frontedOnCredit')}</span>
          <p className="mt-1 text-xs text-natural-muted">{t('insights.frontedBody')}</p>
          <div className="mt-3 space-y-1.5">
            {data.credit.map(([uid, v]) => (
              <div key={uid} className="flex items-center justify-between text-sm">
                <span className="text-natural-text font-medium">{nameOf(uid)}</span>
                <span className="font-mono text-xs text-natural-text">{formatAmount(v)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Time to pay back */}
      <div className={`${panel} p-5`}>
        <span className={label}>{t('insights.timeToPayBack')}</span>
        <p className="mt-1 text-xs text-natural-muted">{t('insights.timeBody')}</p>
        {data.median === null ? (
          <p className="mt-3 text-sm text-natural-muted">{t('insights.nothingSettled')}</p>
        ) : (
          <p className="mt-3 flex items-baseline gap-1.5">
            <span className="font-display text-3xl font-semibold text-natural-text">
              {data.median}
            </span>
            <span className="font-mono text-xs text-natural-muted">
              {t('insights.day', { count: data.median })}
            </span>
          </p>
        )}
      </div>

      {/* Venmo instant transfer */}
      {data.venmo.settlementCount > 0 && (
        <div className={`${panel} p-5`}>
          <span className={label}>{t('insights.venmoInstant')}</span>
          <p className="mt-1 text-xs text-natural-muted">{t('insights.venmoBody')}</p>
          <div className="mt-3 space-y-1.5 text-sm">
            {[
              [t('insights.movedThroughVenmo'), formatAmount(data.venmo.transferred), ''],
              [
                t('insights.estimatedFees'),
                formatAmount(data.venmo.estimatedFees),
                'text-natural-primary',
              ],
              [t('insights.payments'), String(data.venmo.settlementCount), ''],
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
          <span className={label}>{t('insights.byCategory')}</span>
          <p className="mt-1 text-xs text-natural-muted">{t('insights.byCategoryBody')}</p>
        </div>
        <div className="divide-y divide-natural-border">
          {data.trends.map((trend) => {
            const row = data.lending[trend.category] || {};
            let carrier: [string, number] | null = null;
            for (const [uid, net] of Object.entries(row)) {
              if (net > 0.01 && (carrier === null || net > carrier[1])) carrier = [uid, net];
            }
            const bits = [
              trend.medianDays !== null
                ? t('insights.daysToSettle', { count: trend.medianDays })
                : null,
              carrier
                ? carrier[0] === activeUser
                  ? t('insights.youCarry', { amount: formatAmount(carrier[1]) })
                  : t('insights.carries', {
                      name: nameOf(carrier[0]),
                      amount: formatAmount(carrier[1]),
                    })
                : null,
            ].filter(Boolean);
            return (
              <div key={trend.category} className="px-5 py-3.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-natural-text truncate">
                    {trend.category}
                  </span>
                  <span className="font-display text-[15px] font-semibold text-natural-text">
                    {formatAmount(trend.total)}
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
