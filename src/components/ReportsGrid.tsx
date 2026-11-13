import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Expense } from '../types';
import {
  ReportFilter,
  pivot,
  columnChanges,
  applyFilter,
  bucketOf,
  reportAmount,
  monthKey,
} from '../lib/reports';
import { formatAmount, formatDateWith, formatShortDate } from '../lib/format';
import { parseLocalDate } from '../lib/recurring';
import { instrumentOf, UNKNOWN_INSTRUMENT } from '../lib/insights';
import { instrumentShortLabel } from '../lib/instruments';
import CategoryChip from './CategoryChip';
import { panel, label } from './Controls';

interface Props {
  expenses: Expense[];
  filter: ReportFilter;
  today: string;
  onOpenExpense: (e: Expense) => void;
}

/**
 * The grid: pivot() as a table, categories down and months across, totals
 * both ways and a change row. Tapping a cell lists its lines in a side card.
 */
export default function ReportsGrid({ expenses, filter, today, onOpenExpense }: Props) {
  const { t } = useTranslation();
  const [picked, setPicked] = useState<{ category: string; column: string } | null>(null);

  const pv = useMemo(() => pivot(expenses, filter, 'month'), [expenses, filter]);
  const changes = useMemo(() => columnChanges(pv), [pv]);
  const current = monthKey(today);
  const dayOfMonth = parseLocalDate(today).getDate();

  const lines = useMemo(() => {
    if (!picked) return [];
    return applyFilter(expenses, filter)
      .filter(
        (e) =>
          (e.category || '').trim() === picked.category &&
          bucketOf(e.date, 'month') === picked.column
      )
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [picked, expenses, filter]);

  const colLabel = (c: string) =>
    formatDateWith(parseLocalDate(`${c}-01`), {
      month: 'short',
      year: c.slice(0, 4) === current.slice(0, 4) ? undefined : '2-digit',
    });

  const cell = 'px-3 py-[11px] text-right font-mono';
  const shade = (c: string) => (c === current ? 'bg-natural-bg' : '');

  if (pv.rows.length === 0) {
    return (
      <section className={`${panel} p-5`}>
        <p className="text-sm text-natural-muted">{t('reports.empty')}</p>
      </section>
    );
  }

  return (
    <div className="flex flex-wrap gap-4 items-start">
      <section
        className={`${panel} rounded-[20px] overflow-hidden [flex:999_1_420px] min-w-0`}
        id="reports-grid"
      >
        <div className="overflow-x-auto">
          <table className="w-full border-collapse min-w-[520px] text-sm leading-5">
            <thead>
              <tr className="text-natural-muted text-[11px] tracking-wider uppercase text-right">
                <th className="font-bold pl-5 pr-3 py-3 text-left">{t('sheet.category')}</th>
                {pv.columns.map((c) => (
                  <th
                    key={c}
                    className={`font-bold px-3 py-3 ${c === current ? 'text-natural-text' : ''}`}
                  >
                    {colLabel(c)}
                  </th>
                ))}
                <th className="font-bold pl-3 pr-5 py-3 text-natural-text">{t('reports.total')}</th>
              </tr>
            </thead>
            <tbody>
              {pv.rows.map((r) => (
                <tr key={r.key || '__none__'} className="border-t border-natural-sidebar">
                  <td className="pl-5 pr-3 py-[11px]">
                    <CategoryChip name={r.key} />
                  </td>
                  {pv.columns.map((c) => {
                    const v = r.cells[c] ?? 0;
                    const on = picked?.category === r.key && picked?.column === c;
                    return (
                      <td key={c} className={`p-0 ${shade(c)}`}>
                        <button
                          type="button"
                          onClick={() => setPicked(on ? null : { category: r.key, column: c })}
                          disabled={v === 0}
                          aria-pressed={on}
                          className={`w-full min-h-[44px] ${cell} ${v === 0 ? 'text-natural-muted' : 'cursor-pointer hover:bg-natural-sidebar/60'} ${
                            on
                              ? 'outline outline-[1.5px] -outline-offset-[1.5px] outline-natural-dark rounded-md text-natural-primary'
                              : ''
                          }`}
                        >
                          {v === 0 ? '$0' : formatAmount(v)}
                        </button>
                      </td>
                    );
                  })}
                  <td className={`${cell} pr-5 font-medium`}>{formatAmount(r.total)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-natural-dark">
                <td className="pl-5 pr-3 py-3 text-[11px] font-bold tracking-wider uppercase text-natural-muted">
                  {t(`reports.totalLabel.${filter.view}`)}
                </td>
                {pv.columns.map((c) => (
                  <td key={c} className={`${cell} py-3 font-medium ${shade(c)}`}>
                    {formatAmount(pv.columnTotals[c] ?? 0)}
                  </td>
                ))}
                <td className={`${cell} py-3 pr-5 font-medium`}>{formatAmount(pv.grandTotal)}</td>
              </tr>
              <tr>
                <td className="pl-5 pr-3 pb-3 text-[11px] font-bold tracking-wider uppercase text-natural-muted">
                  {t('reports.change')}
                </td>
                {pv.columns.map((c, i) => {
                  const ch = changes[i];
                  return (
                    <td key={c} className={`px-3 pb-3 text-right font-mono text-xs ${shade(c)}`}>
                      {c === current ? (
                        <span className="text-natural-muted">
                          {t('reports.daysIn', { count: dayOfMonth })}
                        </span>
                      ) : ch === null ? (
                        ''
                      ) : ch > 0 ? (
                        <span className="text-natural-primary">
                          {t('reports.upPct', { pct: ch })}
                        </span>
                      ) : (
                        <span className="text-natural-muted">
                          {t('reports.downPct', { pct: Math.abs(ch) })}
                        </span>
                      )}
                    </td>
                  );
                })}
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      {picked && (
        <section
          className={`${panel} rounded-[20px] px-5 py-[18px] flex flex-col gap-2 [flex:1_1_240px] max-w-[360px] min-w-0`}
          id="reports-cell-lines"
        >
          <span className={label}>
            {picked.category || t('category.none')}, {colLabel(picked.column)}
          </span>
          <span className="text-[13px] leading-[18px] text-natural-muted">
            {t('reports.cellLines', { count: lines.length })}
          </span>
          <ul className="divide-y divide-natural-sidebar border-t border-natural-sidebar">
            {lines.map((e) => {
              const inst = instrumentOf(e);
              return (
                <li key={e.id}>
                  <button
                    type="button"
                    onClick={() => onOpenExpense(e)}
                    className="w-full flex justify-between gap-3 py-2.5 text-sm text-left hover:text-natural-primary cursor-pointer min-h-[44px] items-center"
                  >
                    <span className="truncate">
                      {e.title}, {formatShortDate(e.date)}
                      {inst !== UNKNOWN_INSTRUMENT && (
                        <span className="text-natural-muted">
                          , {instrumentShortLabel(inst).toLowerCase()}
                        </span>
                      )}
                    </span>
                    <span className="font-mono font-medium shrink-0">
                      {formatAmount(reportAmount(e, filter))}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
