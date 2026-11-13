import { useMemo, useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowUp, ArrowDown } from 'lucide-react';
import { Expense } from '../types';
import {
  getNormalizedExpenseStatus,
  getRemainingSettlementAmount,
  getTotalRemainingOwedToPayer,
  isDarkCherry,
  isDeposit,
  isUnclaimed,
  roundCurrency,
} from '../lib/money';
import { formatAmount, formatShortDate, formatDateWith } from '../lib/format';
import { nameOf as rosterName } from '../lib/members';
import { parseLocalDate } from '../lib/recurring';
import { monthKey, isRecurringLine } from '../lib/reports';
import { instrumentOf, UNKNOWN_INSTRUMENT } from '../lib/insights';
import { instrumentShortLabel } from '../lib/instruments';
import CategoryChip from './CategoryChip';
import RecurringMark from './RecurringMark';
import { panel, StatusPill } from './Controls';

export type SheetSort = 'date' | 'item' | 'paid' | 'amount' | 'share' | 'status';

interface Props {
  expenses: Expense[];
  activeUser: string;
  members: { uid: string; name?: string }[];
  /** The label of the foot total row, for example "Quarter so far". */
  periodLabel: string;
  onOpenExpense: (e: Expense) => void;
  /** Commits an amount typed into a cell; shares scale with it. */
  onEditAmount: (e: Expense, amount: number) => void;
}

const statusRank = (e: Expense) =>
  isDeposit(e) ? 3 : getNormalizedExpenseStatus(e) === 'CLOSED' ? 2 : 1;

/**
 * Sheet mode: the same ledger with the cards taken off. Six columns, sortable
 * headers, a subtotal row per month, a total at the foot, and the amount cell
 * editable in place (Enter commits, Escape cancels).
 */
export default function LedgerSheet({
  expenses,
  activeUser,
  members,
  periodLabel,
  onOpenExpense,
  onEditAmount,
}: Props) {
  const { t } = useTranslation();
  const [sort, setSort] = useState<SheetSort>('date');
  const [dir, setDir] = useState<'asc' | 'desc'>('desc');
  const [editing, setEditing] = useState<{ id: string; value: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const nameOf = (uid: string) => rosterName(uid, members, activeUser);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (field: SheetSort) => {
    if (sort === field) setDir(dir === 'asc' ? 'desc' : 'asc');
    else {
      setSort(field);
      setDir(field === 'item' || field === 'paid' || field === 'status' ? 'asc' : 'desc');
    }
  };

  const shareOf = (e: Expense) => (isDeposit(e) ? 0 : (e.shares?.[activeUser] ?? 0));

  const sorted = useMemo(() => {
    const m = dir === 'asc' ? 1 : -1;
    const cmp = (a: Expense, b: Expense): number => {
      switch (sort) {
        case 'item':
          return a.title.localeCompare(b.title);
        case 'paid':
          return nameOf(a.paidBy).localeCompare(nameOf(b.paidBy));
        case 'amount':
          return a.amount - b.amount;
        case 'share':
          return shareOf(a) - shareOf(b);
        case 'status':
          return statusRank(a) - statusRank(b);
        default:
          return a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt);
      }
    };
    return expenses.slice().sort((a, b) => m * cmp(a, b) || b.date.localeCompare(a.date));
  }, [expenses, sort, dir]); // eslint-disable-line react-hooks/exhaustive-deps

  // Month groups follow the rows' order when sorted by date; under any other
  // sort the rows run flat, since a subtotal would interrupt the ordering.
  const groups = useMemo(() => {
    if (sort !== 'date') return [{ key: null as string | null, rows: sorted }];
    const out: { key: string | null; rows: Expense[] }[] = [];
    for (const e of sorted) {
      const k = monthKey(e.date);
      const last = out[out.length - 1];
      if (last && last.key === k) last.rows.push(e);
      else out.push({ key: k, rows: [e] });
    }
    return out;
  }, [sorted, sort]);

  const sum = (rows: Expense[], f: (e: Expense) => number) =>
    roundCurrency(rows.reduce((t, e) => t + f(e), 0));
  const spendAmount = (e: Expense) => (isDeposit(e) ? 0 : e.amount);
  const total = sum(expenses, spendAmount);
  const totalShare = sum(expenses, shareOf);
  const openToMe = sum(expenses, (e) =>
    isDeposit(e) || isDarkCherry(e) || isUnclaimed(e)
      ? 0
      : e.paidBy === activeUser
        ? getTotalRemainingOwedToPayer(e, false)
        : getRemainingSettlementAmount(e, activeUser, false)
  );

  const commit = (e: Expense) => {
    if (!editing) return;
    const v = roundCurrency(parseFloat(editing.value));
    setEditing(null);
    if (!Number.isFinite(v) || v <= 0 || Math.abs(v - e.amount) < 0.005) return;
    onEditAmount(e, v);
  };

  const th = (field: SheetSort, text: string, align: 'left' | 'right' = 'left', extra = '') => {
    const active = sort === field;
    return (
      <th
        className={`font-bold px-3 py-3 ${align === 'right' ? 'text-right' : 'text-left'} ${active ? 'text-natural-text' : ''} ${extra}`}
        aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
      >
        <button
          type="button"
          onClick={() => toggle(field)}
          className={`inline-flex items-center gap-1.5 uppercase tracking-wider text-[11px] font-bold cursor-pointer hover:text-natural-text min-h-[44px] -my-3 ${align === 'right' ? 'flex-row-reverse' : ''}`}
        >
          {text}
          {active &&
            (dir === 'asc' ? (
              <ArrowUp className="h-3 w-3" aria-hidden="true" />
            ) : (
              <ArrowDown className="h-3 w-3" aria-hidden="true" />
            ))}
        </button>
      </th>
    );
  };

  const monthName = (k: string) => {
    const d = parseLocalDate(`${k}-01`);
    return formatDateWith(d, {
      month: 'long',
      year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
    });
  };

  const subtotalCell = 'px-3 py-2 text-right font-mono font-medium';

  return (
    <section className={`${panel} rounded-[20px] overflow-hidden`} id="ledger-sheet">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse min-w-[720px] text-sm leading-5">
          <thead>
            <tr className="text-natural-muted">
              {th('date', t('sheet.date'), 'left', 'pl-5')}
              {th('item', t('sheet.item'))}
              {th('paid', t('sheet.paid'))}
              {th('amount', t('sheet.amount'), 'right')}
              {th('share', t('sheet.yourShare'), 'right')}
              {th('status', t('sheet.status'), 'left', 'pr-5')}
            </tr>
          </thead>
          <tbody>
            {expenses.length === 0 && (
              <tr className="border-t border-natural-sidebar">
                <td colSpan={6} className="px-5 py-10 text-center text-natural-muted">
                  {t('sheet.empty')}
                </td>
              </tr>
            )}
            {groups.map((g) => (
              <GroupRows key={g.key ?? 'flat'}>
                {g.key && (
                  <tr className="bg-natural-bg border-t border-natural-sidebar">
                    <td
                      colSpan={3}
                      className="px-5 py-2 text-[11px] font-bold tracking-wider uppercase text-natural-muted"
                    >
                      {monthName(g.key)}
                    </td>
                    <td className={subtotalCell}>{formatAmount(sum(g.rows, spendAmount))}</td>
                    <td className={subtotalCell}>{formatAmount(sum(g.rows, shareOf))}</td>
                    <td />
                  </tr>
                )}
                {g.rows.map((e) => {
                  const deposit = isDeposit(e);
                  const closed = !deposit && getNormalizedExpenseStatus(e) === 'CLOSED';
                  const dark = isDarkCherry(e) && e.paidBy !== activeUser;
                  const share = shareOf(e);
                  const owe = !closed && !deposit && e.paidBy !== activeUser && share > 0.01;
                  const inst = instrumentOf(e);
                  const isEditing = editing?.id === e.id;
                  return (
                    <tr
                      key={e.id}
                      className="border-t border-natural-sidebar hover:bg-natural-bg/60"
                      id={`sheet-row-${e.id}`}
                    >
                      <td className="pl-5 pr-3 py-[11px] font-mono text-natural-muted whitespace-nowrap">
                        {formatShortDate(e.date)}
                      </td>
                      <td className="px-3 py-[11px] font-medium">
                        <button
                          type="button"
                          onClick={() => onOpenExpense(e)}
                          className="text-left hover:text-natural-primary cursor-pointer min-h-[44px] -my-[11px] inline-flex items-center gap-1.5 flex-wrap"
                          aria-label={t('list.openAria', { title: e.title })}
                        >
                          <span>{e.title}</span>
                          {isRecurringLine(e) && <RecurringMark interval={e.recurringInterval} />}
                          <CategoryChip name={e.category} />
                        </button>
                      </td>
                      <td className="px-3 py-[11px] text-natural-muted whitespace-nowrap">
                        {isUnclaimed(e) ? t('status.needsPayer') : nameOf(e.paidBy)}
                        {inst !== UNKNOWN_INSTRUMENT && (
                          <>
                            ,{' '}
                            <span className="font-mono text-natural-text">
                              {instrumentShortLabel(inst)}
                            </span>
                          </>
                        )}
                      </td>
                      <td
                        className={`px-3 text-right font-mono ${isEditing ? 'py-1.5' : 'py-[11px]'} ${closed ? 'text-natural-muted' : 'font-medium'}`}
                      >
                        {isEditing ? (
                          <input
                            ref={inputRef}
                            type="number"
                            step="0.01"
                            min="0"
                            value={editing.value}
                            onChange={(ev) => setEditing({ id: e.id, value: ev.target.value })}
                            onBlur={() => commit(e)}
                            onKeyDown={(ev) => {
                              if (ev.key === 'Enter') {
                                ev.preventDefault();
                                commit(e);
                              } else if (ev.key === 'Escape') {
                                ev.preventDefault();
                                setEditing(null);
                              }
                            }}
                            aria-label={t('sheet.editAmountAria', { title: e.title })}
                            className="w-28 h-[30px] px-2.5 text-right font-mono text-sm font-medium border-[1.5px] border-natural-dark rounded-lg bg-white outline-none"
                            id={`sheet-edit-${e.id}`}
                          />
                        ) : dark ? (
                          <span className="text-natural-muted">{t('sheet.hidden')}</span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setEditing({ id: e.id, value: e.amount.toFixed(2) })}
                            className="cursor-text hover:bg-natural-sidebar/60 rounded-md px-1.5 -mx-1.5 min-h-[44px] -my-[11px] inline-flex items-center"
                            title={t('sheet.editHint')}
                          >
                            {formatAmount(e.amount)}
                          </button>
                        )}
                      </td>
                      <td
                        className={`px-3 py-[11px] text-right font-mono ${owe ? 'text-natural-primary' : 'text-natural-muted'}`}
                      >
                        {deposit || dark ? '' : formatAmount(share)}
                      </td>
                      <td className="pl-3 pr-5 py-[11px]">
                        {deposit ? (
                          <StatusPill open={false}>{t('house.depositPill')}</StatusPill>
                        ) : (
                          <StatusPill open={!closed}>
                            {closed ? t('sheet.settled') : t('sheet.open')}
                          </StatusPill>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </GroupRows>
            ))}
          </tbody>
          {expenses.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-natural-dark">
                <td
                  colSpan={3}
                  className="px-5 py-3 text-[11px] font-bold tracking-wider uppercase text-natural-muted"
                >
                  {periodLabel}
                </td>
                <td className="px-3 py-3 text-right font-mono font-medium">
                  {formatAmount(total)}
                </td>
                <td className="px-3 py-3 text-right font-mono font-medium">
                  {formatAmount(totalShare)}
                </td>
                <td className="pl-3 pr-5 py-3 font-mono text-xs text-natural-primary whitespace-nowrap">
                  {openToMe > 0.01 ? t('sheet.openAmount', { amount: formatAmount(openToMe) }) : ''}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </section>
  );
}

// A keyed fragment for a month's rows, so React keeps the subtotal row with
// its rows when groups come and go.
function GroupRows({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
