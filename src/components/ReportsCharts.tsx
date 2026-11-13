import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
} from 'recharts';
import { Expense } from '../types';
import {
  ReportFilter,
  PeriodKey,
  Granularity,
  totals,
  monthlyStats,
  recurringSplit,
  byCategory,
  categoryOverTime,
  frontedBy,
  topExpenses,
  applyFilter,
  reportAmount,
  bucketOf,
  OTHER_CATEGORY,
} from '../lib/reports';
import { instrumentOf, medianDaysToSettle } from '../lib/insights';
import { formatAmount, formatCurrency, formatDateWith, formatShortDate } from '../lib/format';
import { parseLocalDate } from '../lib/recurring';
import { colors, categoryColor } from '../lib/ui';
import CategoryChip from './CategoryChip';
import { panel, label } from './Controls';

interface Props {
  expenses: Expense[];
  filter: ReportFilter;
  period: PeriodKey;
  memberIds: string[];
  nameOf: (uid: string) => string;
  today: string;
  onOpenLedger: () => void;
}

const PARTIAL_OPACITY = 0.55;

/**
 * The charts tab: a totals strip, stacked monthly bars by category, the
 * category donut with its legend, who fronted what, the biggest lines and
 * recurring against one-off. Every number is lib/reports; the partial current
 * bucket is drawn lighter.
 */
export default function ReportsCharts({
  expenses,
  filter,
  period,
  memberIds,
  nameOf,
  today,
  onOpenLedger,
}: Props) {
  const { t } = useTranslation();
  // A single month splits into weeks; longer periods into months.
  const granularity: Granularity =
    period === 'this_month' || period === 'last_month' ? 'week' : 'month';
  const months = period === '1y' ? 12 : period === '6m' ? 6 : period === '3m' ? 3 : 1;

  const data = useMemo(() => {
    const lines = applyFilter(expenses, filter);
    const credit = lines.filter((e) => instrumentOf(e) === 'CREDIT');
    return {
      totals: totals(expenses, filter, today),
      monthly: monthlyStats(expenses, filter),
      recurring: recurringSplit(expenses, filter),
      categories: byCategory(expenses, filter),
      timeline: categoryOverTime(expenses, filter, granularity, 5),
      fronted: frontedBy(expenses, filter, memberIds),
      biggest: topExpenses(expenses, filter, 5),
      creditTotal: credit.reduce((s, e) => s + reportAmount(e, filter), 0),
      creditMedianDays: medianDaysToSettle(credit),
      oneOffCount: lines.filter((e) => !e.isRecurring && !e.recurringSourceId).length,
    };
  }, [expenses, filter, today, granularity, memberIds]);

  const currentBucket = bucketOf(today, granularity);
  const bucketLabel = (b: string) =>
    granularity === 'month'
      ? formatDateWith(parseLocalDate(`${b}-01`), { month: 'short' })
      : formatShortDate(b);

  const chartRows = data.timeline.points.map((p) => ({
    bucket: p.bucket,
    name:
      p.bucket === currentBucket
        ? t('reports.soFar', { label: bucketLabel(p.bucket) })
        : bucketLabel(p.bucket),
    ...p.values,
  }));
  const series = [...data.timeline.categories, OTHER_CATEGORY].filter((c) =>
    chartRows.some((r) => (r as Record<string, number | string>)[c])
  );
  const seriesColor = (c: string) => (c === OTHER_CATEGORY ? colors.subtle : categoryColor(c));
  const seriesName = (c: string) =>
    c === OTHER_CATEGORY ? t('reports.other') : c || t('category.none');

  const grand = data.categories.reduce((s, c) => s + c.total, 0);
  const donut = data.categories.slice(0, 6).map((c) => ({ name: c.category, value: c.total }));
  const frontedMax = Math.max(1, ...data.fronted.map((r) => r.total));
  const recurringPct = grand > 0 ? Math.round((data.recurring.recurring / grand) * 100) : 0;

  const tile = `${panel} rounded-[20px] px-5 py-4 flex flex-col gap-1.5 min-w-0`;
  const big = 'font-mono text-[28px] leading-8 font-medium tracking-tight';
  const sub = 'font-mono text-xs';

  if (data.totals.count === 0) {
    return (
      <section className={`${panel} p-5`} id="reports-empty">
        <p className="text-sm text-natural-muted">{t('reports.empty')}</p>
      </section>
    );
  }

  const changeText =
    data.totals.changePct === null
      ? t('reports.noPrevious')
      : data.totals.changePct < 0
        ? t('reports.downOnBefore', { pct: Math.abs(data.totals.changePct), count: months })
        : t('reports.upOnBefore', { pct: data.totals.changePct, count: months });

  return (
    <div className="flex flex-col gap-4" id="reports-charts">
      {/* Totals strip */}
      <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(170px,1fr))]">
        <section className={tile}>
          <span className={label}>{t(`reports.totalLabel.${filter.view}`)}</span>
          <span className={big}>{formatAmount(data.totals.total)}</span>
          <span
            className={`${sub} ${data.totals.changePct !== null && data.totals.changePct < 0 ? 'text-natural-primary' : 'text-natural-muted'}`}
          >
            {changeText}
          </span>
        </section>
        <section className={tile}>
          <span className={label}>{t('reports.perMonth')}</span>
          <span className={big}>{formatAmount(data.monthly.perMonth)}</span>
          <span className={`${sub} text-natural-muted`}>
            {t('reports.highLow', {
              high: formatCurrency(data.monthly.high, 0),
              low: formatCurrency(data.monthly.low, 0),
            })}
          </span>
        </section>
        <section className={tile}>
          <span className={label}>{t('reports.recurring')}</span>
          <span className={big}>{recurringPct}%</span>
          <span className={`${sub} text-natural-muted`}>
            {t('reports.sourcesActive', { count: data.recurring.sources })}
          </span>
        </section>
        <section className={tile}>
          <span className={label}>{t('reports.frontedOnCredit')}</span>
          <span className={big}>{formatAmount(data.creditTotal)}</span>
          <span className={`${sub} text-natural-muted`}>
            {data.creditMedianDays === null
              ? t('reports.nothingSettledYet')
              : t('reports.medianDays', { count: data.creditMedianDays })}
          </span>
        </section>
      </div>

      <div className="flex flex-wrap gap-4 items-stretch">
        {/* Month by month, by category */}
        <section
          className={`${panel} rounded-[20px] px-5 py-[18px] flex flex-col gap-3 [flex:999_1_440px] min-w-0`}
          id="reports-stacked"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className={label}>
              {granularity === 'month' ? t('reports.monthByMonth') : t('reports.weekByWeek')}
            </span>
            <span className="flex flex-wrap gap-3 text-xs text-natural-muted">
              {series.map((c) => (
                <span key={c} className="flex items-center gap-1.5">
                  <span
                    className="w-2.5 h-2.5 rounded-[3px]"
                    style={{ background: seriesColor(c) }}
                  />
                  {seriesName(c)}
                </span>
              ))}
            </span>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartRows}
                margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                barCategoryGap="30%"
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={colors.sidebar} />
                <XAxis
                  dataKey="name"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11, fill: colors.muted, fontFamily: 'JetBrains Mono' }}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11, fill: colors.muted, fontFamily: 'JetBrains Mono' }}
                  tickFormatter={(v) => formatCurrency(Number(v), 0)}
                  width={52}
                />
                <Tooltip
                  cursor={{ fill: colors.sidebar, opacity: 0.4 }}
                  contentStyle={{
                    borderRadius: 8,
                    border: `1px solid ${colors.sidebar}`,
                    fontSize: 12,
                  }}
                  formatter={(value, name) => [
                    formatCurrency(Number(value)),
                    seriesName(String(name)),
                  ]}
                />
                {series.map((c) => (
                  <Bar
                    key={c}
                    dataKey={c}
                    stackId="a"
                    fill={seriesColor(c)}
                    name={c}
                    isAnimationActive={false}
                  >
                    {chartRows.map((r) => (
                      <Cell
                        key={r.bucket}
                        fillOpacity={r.bucket === currentBucket ? PARTIAL_OPACITY : 1}
                      />
                    ))}
                  </Bar>
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* By category donut */}
        <section
          className={`${panel} rounded-[20px] px-5 py-[18px] flex flex-col gap-3 [flex:1_1_280px] min-w-0`}
          id="reports-donut"
        >
          <span className={label}>
            {t('reports.byCategory', { range: t(`reports.period.${period}`) })}
          </span>
          <div className="flex items-center gap-4">
            <div className="w-[120px] h-[120px] shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={donut}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={37}
                    outerRadius={55}
                    startAngle={90}
                    endAngle={-270}
                    stroke="#fff"
                    strokeWidth={2}
                    isAnimationActive={false}
                  >
                    {donut.map((d) => (
                      <Cell key={d.name || '__none__'} fill={categoryColor(d.name)} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      borderRadius: 8,
                      border: `1px solid ${colors.sidebar}`,
                      fontSize: 12,
                    }}
                    formatter={(value, name) => [
                      formatCurrency(Number(value)),
                      String(name) || t('category.none'),
                    ]}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex-1 min-w-0 flex flex-col gap-1.5 text-[13px] leading-[18px]">
              {donut.map((d) => (
                <div key={d.name || '__none__'} className="flex justify-between gap-2">
                  <CategoryChip name={d.name} />
                  <span className="font-mono">
                    {grand > 0 ? Math.round((d.value / grand) * 100) : 0}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>

      <div className="flex flex-wrap gap-4 items-stretch">
        {/* Who fronted what */}
        <section
          className={`${panel} rounded-[20px] px-5 py-[18px] flex flex-col gap-2.5 [flex:1_1_260px] min-w-0`}
          id="reports-fronted"
        >
          <span className={label}>{t('reports.whoFronted')}</span>
          <div className="flex flex-col gap-2 text-sm leading-5">
            {data.fronted.map((r) => (
              <div key={r.uid} className="flex flex-col gap-1.5">
                <div className="flex justify-between gap-2">
                  <span>{nameOf(r.uid)}</span>
                  <span className="font-mono font-medium">{formatAmount(r.total)}</span>
                </div>
                <span className="h-1.5 rounded-full bg-natural-sidebar overflow-hidden flex">
                  <span
                    className="block h-full"
                    style={{ width: `${(r.credit / frontedMax) * 100}%`, background: colors.text }}
                  />
                  <span
                    className="block h-full"
                    style={{
                      width: `${(r.ownMoney / frontedMax) * 100}%`,
                      background: colors.accent,
                    }}
                  />
                  <span
                    className="block h-full"
                    style={{
                      width: `${(r.unknown / frontedMax) * 100}%`,
                      background: colors.subtle,
                    }}
                  />
                </span>
              </div>
            ))}
            <span className="text-xs text-natural-muted flex gap-3 flex-wrap">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-1.5 rounded-[3px]" style={{ background: colors.text }} />
                {t('reports.credit')}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-1.5 rounded-[3px]" style={{ background: colors.accent }} />
                {t('reports.ownMoney')}
              </span>
            </span>
          </div>
        </section>

        {/* Biggest lines */}
        <section
          className={`${panel} rounded-[20px] px-5 py-[18px] flex flex-col gap-2.5 [flex:1_1_260px] min-w-0`}
          id="reports-biggest"
        >
          <span className={label}>{t('reports.biggestLines')}</span>
          <div className="flex flex-col gap-2 text-sm leading-5">
            {data.biggest.map((e) => (
              <div key={e.id} className="flex justify-between gap-2">
                <span className="truncate">
                  {e.title}, {formatShortDate(e.date)}
                </span>
                <span className="font-mono font-medium shrink-0">
                  {formatAmount(reportAmount(e, filter))}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* Recurring vs one-off */}
        <section
          className={`${panel} rounded-[20px] px-5 py-[18px] flex flex-col gap-2.5 [flex:1_1_260px] min-w-0`}
          id="reports-recurring"
        >
          <span className={label}>{t('reports.recurringVsOneOff')}</span>
          <div className="flex flex-col gap-2 text-sm leading-5">
            <div className="flex justify-between gap-2">
              <span>{t('reports.recurringSources', { count: data.recurring.sources })}</span>
              <span className="font-mono font-medium">
                {formatAmount(data.recurring.recurring)}
              </span>
            </div>
            <div className="flex justify-between gap-2">
              <span>{t('reports.oneOffItems', { count: data.oneOffCount })}</span>
              <span className="font-mono font-medium">{formatAmount(data.recurring.oneOff)}</span>
            </div>
            <button
              type="button"
              onClick={onOpenLedger}
              className="text-xs text-left text-natural-text font-semibold hover:text-natural-primary cursor-pointer"
            >
              {t('reports.seeInLedger')}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
