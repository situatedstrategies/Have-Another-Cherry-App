import { useTranslation, Trans } from 'react-i18next';
import { X, CalendarCheck, ArrowRight } from 'lucide-react';
import { MonthCloseSummary } from '../lib/monthClose';
import { formatAmount, formatDateWith } from '../lib/format';
import { parseLocalDate } from '../lib/recurring';
import { panel, label } from './Controls';

interface Props {
  summary: MonthCloseSummary;
  /** Whether the budget line is shown at all (Plan is Cherry +). */
  showBudgets: boolean;
  onSettle: () => void;
  onReport: () => void;
  onDismiss: () => void;
}

const mono = { m: <span className="font-mono text-natural-text" /> };

/**
 * "<October> is closed": the card Home shows once on the first open of a new
 * month. Last month's totals strip, the budget result, what is still open,
 * and two ways out: settle up or see the report. Arithmetic in lib/monthClose.
 */
export default function MonthCloseCard({
  summary,
  showBudgets,
  onSettle,
  onReport,
  onDismiss,
}: Props) {
  const { t } = useTranslation();
  const first = parseLocalDate(`${summary.month}-01`);
  const monthName = formatDateWith(first, { month: 'long' });
  const before = formatDateWith(new Date(first.getFullYear(), first.getMonth() - 1, 1), {
    month: 'long',
  });
  const stat = 'flex flex-col gap-0.5 min-w-[7rem]';
  const big = 'font-mono text-[22px] leading-7 font-medium tracking-tight';

  return (
    <section
      className={`${panel} rounded-[20px] px-5 py-[18px] flex flex-col gap-3 relative`}
      id="month-close"
    >
      <button
        type="button"
        onClick={onDismiss}
        aria-label={t('home.dismissMonthClose')}
        title={t('common.gotIt')}
        className="absolute top-3 right-3 tap-target flex items-center justify-center text-natural-muted hover:text-natural-text cursor-pointer"
      >
        <X className="h-4 w-4" />
      </button>
      <div className="flex items-center gap-2 pr-10">
        <CalendarCheck className="h-4 w-4 text-natural-primary shrink-0" />
        <h2 className="font-display text-xl leading-7 font-semibold text-natural-text">
          {t('home.monthClosed', { month: monthName })}
        </h2>
      </div>
      <div className="flex flex-wrap gap-x-8 gap-y-3" id="month-close-strip">
        <div className={stat}>
          <span className={label}>{t('home.householdLine')}</span>
          <span className={big}>{formatAmount(summary.total)}</span>
        </div>
        <div className={stat}>
          <span className={label}>{t('reports.yourShare')}</span>
          <span className={big}>{formatAmount(summary.yourShare)}</span>
        </div>
        <div className={stat}>
          <span className={label}>{t('home.vsMonth', { month: before })}</span>
          <span
            className={`${big} ${summary.change !== null && summary.change > 0 ? 'text-natural-primary' : ''}`}
          >
            {summary.change === null
              ? t('home.noMonthBefore')
              : summary.change < 0
                ? t('reports.downPct', { pct: Math.abs(summary.change) })
                : t('reports.upPct', { pct: summary.change })}
          </span>
        </div>
      </div>
      <p className="text-[13px] leading-[18px] text-natural-muted">
        {showBudgets &&
          summary.budgetsUnder + summary.budgetsOver > 0 &&
          (summary.budgetsOver === 0 ? (
            t('home.budgetsHeld')
          ) : (
            <Trans
              i18nKey="home.budgetsResult"
              values={{ under: summary.budgetsUnder, over: summary.budgetsOver }}
              components={{
                m: <span className="font-mono text-natural-text" />,
                o: <span className="font-mono text-natural-primary" />,
              }}
            />
          ))}
        {showBudgets && summary.budgetsUnder + summary.budgetsOver > 0 && ' '}
        {summary.openCount > 0 ? (
          <Trans
            i18nKey="home.stillOpen"
            count={summary.openCount}
            values={{ amount: formatAmount(summary.openTotal) }}
            components={mono}
          />
        ) : (
          t('home.allSettledMonth')
        )}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {summary.openCount > 0 && (
          <button
            type="button"
            onClick={onSettle}
            className="h-10 px-4 rounded-full bg-natural-dark hover:bg-black text-white text-sm font-semibold cursor-pointer transition-colors"
            id="month-close-settle"
          >
            {t('home.settleUp')}
          </button>
        )}
        <button
          type="button"
          onClick={onReport}
          className="h-10 px-4 rounded-full border border-natural-border bg-white text-natural-text text-sm font-semibold inline-flex items-center gap-1.5 hover:border-natural-muted cursor-pointer transition-colors"
          id="month-close-report"
        >
          {t('home.seeReport')} <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </section>
  );
}
