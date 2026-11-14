import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Landmark } from 'lucide-react';
import { Expense, Group } from '../types';
import { depositSummary, depositGrid } from '../lib/deposits';
import { formatAmount, formatDateWith, formatShortDate } from '../lib/format';
import { nameOf as rosterName, joinedUids } from '../lib/members';
import { parseLocalDate, todayLocal } from '../lib/recurring';
import { colors } from '../lib/ui';
import { panel, label, Chip, PrimaryButton } from './Controls';

type GridMode = 'week' | 'month' | 'mine';

interface Props {
  expenses: Expense[];
  group: Group;
  activeUser: string;
  members: { uid: string; name?: string }[];
  onLogDeposit: () => void;
}

/**
 * The house account: what everyone has paid into the shared account against
 * the agreed ratio, then a week by week or month by month grid per person.
 * Arithmetic in lib/deposits; "Log a deposit" is the one action.
 */
export default function HouseAccount({
  expenses,
  group,
  activeUser,
  members,
  onLogDeposit,
}: Props) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<GridMode>('month');
  const today = todayLocal();
  const nameOf = (uid: string) => rosterName(uid, members, activeUser);
  const memberIds = useMemo(() => joinedUids(group), [group]);

  const summary = useMemo(
    () => depositSummary(expenses, group.defaultSplit || {}, memberIds),
    [expenses, group.defaultSplit, memberIds]
  );
  const grid = useMemo(
    () =>
      mode === 'mine'
        ? depositGrid(expenses, 'month', memberIds, today, activeUser)
        : depositGrid(expenses, mode, memberIds, today),
    [expenses, mode, memberIds, today, activeUser]
  );
  const rows = useMemo(() => grid.rows.slice().reverse(), [grid]);

  const bucketLabel = (b: string) =>
    b.length === 7
      ? formatDateWith(parseLocalDate(`${b}-01`), { month: 'short', year: 'numeric' })
      : t('house.weekOf', { date: formatShortDate(b) });

  const cell = 'px-3 py-[11px] text-right font-mono';

  return (
    <section className="flex flex-col gap-4" id="house-account">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="mb-1 text-xs text-natural-muted">{t('house.eyebrow')}</p>
          <h2 className={`${label} flex items-center gap-1.5`}>
            <Landmark className="h-3.5 w-3.5 text-natural-primary" /> {t('house.title')}
          </h2>
          <p className="mt-1 text-xs text-natural-muted">{t('house.subtitle')}</p>
        </div>
        <PrimaryButton onClick={onLogDeposit} id="house-log-deposit-btn">
          <Plus className="h-4 w-4" /> {t('house.logDeposit')}
        </PrimaryButton>
      </div>

      <div className="flex flex-wrap gap-4 items-start">
        <section
          className={`${panel} rounded-[20px] px-5 py-[18px] flex flex-col gap-2 [flex:1_1_220px]`}
          id="house-total"
        >
          <span className={label}>{t('house.totalDeposited')}</span>
          <span className="font-mono text-[32px] leading-9 font-medium tracking-tight">
            {formatAmount(summary.total)}
          </span>
          <span className="text-[13px] leading-[18px] text-natural-muted">
            {t('house.depositCount', { count: summary.count })}
          </span>
        </section>

        <section
          className={`${panel} rounded-[20px] px-5 py-[18px] flex flex-col gap-3 [flex:999_1_320px] min-w-0`}
          id="house-ratio"
        >
          <div>
            <span className={label}>{t('house.againstRatio')}</span>
            <p className="mt-1 text-xs text-natural-muted">{t('house.againstRatioBody')}</p>
          </div>
          <div className="flex flex-col gap-3">
            {summary.rows.map((r) => (
              <div key={r.uid} className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="font-medium text-natural-text">{nameOf(r.uid)}</span>
                  <span className="font-mono">
                    {formatAmount(r.deposited)}{' '}
                    <span className="text-natural-muted text-xs">
                      {t('house.pctOfTotal', { pct: Math.round(r.actual * 100) })}
                    </span>
                  </span>
                </div>
                <div className="relative h-2 rounded-full bg-natural-sidebar" aria-hidden="true">
                  <div
                    className="absolute inset-y-0 left-0 rounded-full bg-natural-dark"
                    style={{ width: `${Math.min(100, Math.round(r.actual * 100))}%` }}
                  />
                  {/* The tick: where the agreed share sits. */}
                  <div
                    className="absolute -top-1 w-0.5 h-4 rounded-full"
                    style={{
                      left: `calc(${Math.round(r.agreed * 100)}% - 1px)`,
                      background: colors.primary,
                    }}
                    title={t('house.agreedTick', { pct: Math.round(r.agreed * 100) })}
                  />
                </div>
                <span className="font-mono text-[11px] text-natural-muted">
                  {t('house.agreedLine', {
                    pct: Math.round(r.agreed * 100),
                    amount: formatAmount(r.agreedAmount),
                  })}
                  {Math.abs(r.difference) > 0.01 &&
                    (r.difference > 0
                      ? `, ${t('house.ahead', { amount: formatAmount(r.difference) })}`
                      : `, ${t('house.behind', { amount: formatAmount(-r.difference) })}`)}
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className={`${panel} rounded-[20px] overflow-hidden`} id="house-grid">
        <div className="flex flex-wrap items-center justify-between gap-2.5 px-5 py-4 border-b border-natural-sidebar">
          <span className={label}>{t('house.byPeriod')}</span>
          <div className="flex gap-1.5 flex-wrap">
            {(['week', 'month', 'mine'] as GridMode[]).map((m) => (
              <Chip key={m} small selected={mode === m} onClick={() => setMode(m)}>
                {t(`house.mode.${m}`)}
              </Chip>
            ))}
          </div>
        </div>
        {rows.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-natural-muted">{t('house.empty')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse min-w-[420px] text-sm leading-5">
              <thead>
                <tr className="text-natural-muted text-[11px] tracking-wider uppercase">
                  <th className="font-bold pl-5 pr-3 py-3 text-left">{t('house.period')}</th>
                  {grid.members.map((m) => (
                    <th key={m} className="font-bold px-3 py-3 text-right">
                      {nameOf(m)}
                    </th>
                  ))}
                  <th className="font-bold pl-3 pr-5 py-3 text-right text-natural-text">
                    {t('reports.total')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.bucket} className="border-t border-natural-sidebar">
                    <td className="pl-5 pr-3 py-[11px] font-mono text-natural-muted whitespace-nowrap">
                      {bucketLabel(r.bucket)}
                    </td>
                    {grid.members.map((m) => (
                      <td key={m} className={`${cell} ${r.cells[m] ? '' : 'text-natural-muted'}`}>
                        {formatAmount(r.cells[m] ?? 0)}
                      </td>
                    ))}
                    <td className={`${cell} pr-5 font-medium`}>{formatAmount(r.total)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-natural-dark">
                  <td className="pl-5 pr-3 py-3 text-[11px] font-bold tracking-wider uppercase text-natural-muted">
                    {t('reports.total')}
                  </td>
                  {grid.members.map((m) => (
                    <td key={m} className={`${cell} font-medium`}>
                      {formatAmount(grid.columnTotals[m] ?? 0)}
                    </td>
                  ))}
                  <td className={`${cell} pr-5 font-medium`}>{formatAmount(grid.grandTotal)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>
    </section>
  );
}
