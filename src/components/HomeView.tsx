import { useMemo, useState } from 'react';
import { useTranslation, Trans } from 'react-i18next';
import { Camera, Plus, ArrowRight } from 'lucide-react';
import { Expense } from '../types';
import {
  getRemainingSettlementAmount,
  getTotalRemainingOwedToPayer,
  getNormalizedExpenseStatus,
  isDarkCherry,
  isDeposit,
  isSavings,
  isUnclaimed,
  roundCurrency,
} from '../lib/money';
import { formatAmount, formatCurrency, formatDateWith, formatShortDate } from '../lib/format';
import { nameOf as rosterName } from '../lib/members';
import { todayLocal, parseLocalDate } from '../lib/recurring';
import { periodBounds, totals, byCategory, isRecurringLine } from '../lib/reports';
import { forecastMonth } from '../lib/forecast';
import { instrumentShortLabel } from '../lib/instruments';
import { instrumentOf, UNKNOWN_INSTRUMENT } from '../lib/insights';
import { categoryColor } from '../lib/ui';
import { BudgetStatus, budgetPace, budgetAlertLevel, budgetToWatch } from '../lib/plan';
import { RecurringCandidate } from '../lib/recurringDetect';
import { intervalLabel } from '../lib/recurring';
import CategoryChip from './CategoryChip';
import RecurringMark from './RecurringMark';
import { panel, label, Chip, GhostButton, PrimaryButton, StatusPill, PageHeader } from './Controls';

interface Props {
  expenses: Expense[];
  activeUser: string;
  members: { uid: string; name?: string }[];
  userName: string;
  greetingNote?: string;
  onLogExpense: () => void;
  onScanReceipt: () => void;
  onOpenExpense: (e: Expense) => void;
  onSettle: () => void;
  onOpenLedger: () => void;
  onOpenReports: () => void;
  /** Rendered in the right column under the three cards (My month ahead). */
  aside?: React.ReactNode;
  /** This month's budget statuses (lib/plan) for the budget tile and the
   *  nudges; null for a free member, [] when nothing is budgeted. */
  budgets?: BudgetStatus[] | null;
  onOpenPlan?: () => void;
  /** The top "make it recurring" candidate (lib/recurringDetect), if any. */
  candidate?: RecurringCandidate | null;
  onMakeRecurring?: (c: RecurringCandidate) => void;
  onDismissCandidate?: (c: RecurringCandidate) => void;
  /** The month close card, rendered first, on the first open of a month. */
  monthClose?: React.ReactNode;
}

type LedgerFilter = 'all' | 'open' | 'settled' | 'recurring';
const SHOWN = 8;

/**
 * Home: the summary tiles, what to do next, the itemized ledger and two side
 * cards. Every figure is the ledger's own arithmetic (lib/money, lib/reports,
 * lib/forecast); nothing here is stored.
 */
export default function HomeView({
  expenses,
  activeUser,
  members,
  userName,
  greetingNote,
  onLogExpense,
  onScanReceipt,
  onOpenExpense,
  onSettle,
  onOpenLedger,
  onOpenReports,
  aside,
  budgets,
  onOpenPlan,
  candidate,
  onMakeRecurring,
  onDismissCandidate,
  monthClose,
}: Props) {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<LedgerFilter>('all');
  const today = todayLocal();
  const now = useMemo(() => parseLocalDate(today), [today]);
  const nameOf = (uid: string) => rosterName(uid, members, activeUser);

  const spending = useMemo(() => expenses.filter((e) => !isSavings(e)), [expenses]);

  // Balances, the same way the Balances cards count them: confirmed payments
  // only, and never a Dark Cherry pot or an unclaimed line.
  const balances = useMemo(() => {
    let youOwe = 0;
    let youOweCount = 0;
    let owedToYou = 0;
    let owedCount = 0;
    let oldestOwed: string | null = null;
    const owedTo: Record<string, number> = {};
    const waiting = new Set<string>();
    for (const e of spending) {
      if (isUnclaimed(e) || isDarkCherry(e)) continue;
      if (e.paidBy === activeUser) {
        const r = getTotalRemainingOwedToPayer(e, false);
        if (r > 0.01) {
          owedToYou = roundCurrency(owedToYou + r);
          owedCount++;
        }
        for (const s of e.settlements || []) {
          if (s.status === 'pending' && s.receivedBy === activeUser) waiting.add(e.id);
        }
      } else {
        const r = getRemainingSettlementAmount(e, activeUser, false);
        if (r > 0.01) {
          youOwe = roundCurrency(youOwe + r);
          youOweCount++;
          owedTo[e.paidBy] = roundCurrency((owedTo[e.paidBy] ?? 0) + r);
          if (!oldestOwed || e.date < oldestOwed) oldestOwed = e.date;
        }
      }
    }
    const top = Object.entries(owedTo).sort((a, b) => b[1] - a[1])[0];
    const oldestDays = oldestOwed
      ? Math.max(0, Math.round((now.getTime() - parseLocalDate(oldestOwed).getTime()) / 86400000))
      : null;
    return { youOwe, youOweCount, owedToYou, owedCount, top, oldestDays, waiting: waiting.size };
  }, [spending, activeUser, now]);

  const month = periodBounds('this_month', today);
  const mine = useMemo(
    () => totals(spending, { ...month, view: 'personal', uid: activeUser }, today),
    [spending, month, activeUser, today]
  );
  const household = useMemo(
    () => totals(spending, { ...month, view: 'household', uid: activeUser }, today),
    [spending, month, activeUser, today]
  );
  const categories = useMemo(
    () => byCategory(spending, { ...month, view: 'personal', uid: activeUser }).slice(0, 4),
    [spending, month, activeUser]
  );
  const catMax = categories[0]?.total || 1;

  // The budget tile: everything budgeted this month against its limits, and
  // the alerts-on budgets that have crossed 80% or 100% for "Up next".
  const budget = useMemo(() => {
    if (!budgets || budgets.length === 0) return null;
    const limit = budgets.reduce((s, b) => s + b.limit, 0);
    const spent = budgets.reduce((s, b) => s + b.spent, 0);
    const pct = limit > 0 ? Math.round((spent / limit) * 100) : 0;
    const pace = budgetPace({ spent }, today.slice(0, 7), today);
    const watch = budgetToWatch(budgets);
    const alerts = budgets
      .map((b) => ({ status: b, level: budgetAlertLevel(b) }))
      .filter((a): a is { status: BudgetStatus; level: 'over' | 'near' } => a.level !== null);
    return { limit, spent, pct, onPace: pace.projected <= limit, watch, alerts };
  }, [budgets, today]);

  const comingUp = useMemo(() => {
    const items: { id: string; title: string; date: string; note: string }[] = [];
    for (const offset of [0, 1]) {
      const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
      const f = forecastMonth(spending, activeUser, d.getFullYear(), d.getMonth(), today);
      for (const i of f.items) {
        if (i.kind !== 'projected') continue;
        const def = spending.find((e) => e.id === i.id.split('@')[0]);
        items.push({
          id: i.id,
          title: i.title,
          date: i.date,
          note: def?.recurringInterval || '',
        });
      }
    }
    return items.sort((a, b) => a.date.localeCompare(b.date)).slice(0, 4);
  }, [spending, activeUser, now, today]);

  const openCount = spending.filter(
    (e) => !isSavings(e) && getNormalizedExpenseStatus(e) !== 'CLOSED'
  ).length;

  const rows = useMemo(() => {
    const visible = expenses.filter((e) => !isDarkCherry(e) || e.paidBy === activeUser);
    return visible
      .filter((e) => {
        const closed = getNormalizedExpenseStatus(e) === 'CLOSED';
        if (filter === 'open') return !closed && !isSavings(e);
        if (filter === 'settled') return closed && !isSavings(e);
        if (filter === 'recurring') return isRecurringLine(e);
        return true;
      })
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
      .slice(0, SHOWN);
  }, [expenses, filter, activeUser]);

  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? t('home.goodMorning') : hour < 18 ? t('home.goodAfternoon') : t('home.goodEvening');
  const prevMonthName = formatDateWith(new Date(now.getFullYear(), now.getMonth() - 1, 1), {
    month: 'long',
  });
  const monthName = formatDateWith(now, { month: 'long' });
  const mono = { m: <span className="font-mono text-natural-text" /> };
  const changeLine =
    household.changePct === null ? (
      t('home.noPreviousMonth')
    ) : household.changePct < 0 ? (
      <Trans
        i18nKey="home.downOn"
        values={{ pct: Math.abs(household.changePct), month: prevMonthName }}
        components={mono}
      />
    ) : (
      <Trans
        i18nKey="home.upOn"
        values={{ pct: household.changePct, month: prevMonthName }}
        components={mono}
      />
    );

  const tile = `${panel} rounded-[20px] px-5 py-[18px] flex flex-col gap-2 min-w-0`;
  const big = 'font-mono text-[32px] leading-9 font-medium tracking-tight';

  return (
    <div className="flex flex-col gap-5" id="home-view">
      <PageHeader
        title={`${greeting}, ${userName}`}
        subtitle={
          <>
            {formatDateWith(now, { weekday: 'long', month: 'long', day: 'numeric' })}.{' '}
            <Trans i18nKey="home.openCount" count={openCount} components={mono} />
            {balances.waiting > 0 && (
              <>
                , <Trans i18nKey="home.waitingCount" count={balances.waiting} components={mono} />
              </>
            )}
            .
            {greetingNote && (
              <span className="block text-natural-primary italic mt-0.5">{greetingNote}</span>
            )}
          </>
        }
      >
        <GhostButton onClick={onScanReceipt} id="home-scan-btn">
          <Camera className="h-4 w-4" /> {t('home.scanReceipt')}
        </GhostButton>
        <PrimaryButton onClick={onLogExpense} id="home-log-btn">
          <Plus className="h-4 w-4" /> {t('home.logExpense')}
        </PrimaryButton>
      </PageHeader>

      {monthClose}

      {/* Summary tiles */}
      <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
        <section className={tile} id="tile-your-share">
          <span className={label}>{t('home.yourShare', { month: monthName })}</span>
          <span className={big}>{formatAmount(mine.total)}</span>
          <span className="text-[13px] leading-[18px] text-natural-muted">
            {t('home.householdLine')}{' '}
            <span className="font-mono text-natural-text">{formatAmount(household.total)}</span>,{' '}
            {changeLine}
          </span>
        </section>
        <section className={tile} id="tile-you-owe">
          <span className={label}>{t('home.youOwe')}</span>
          <span className={`${big} ${balances.youOwe > 0.01 ? 'text-natural-primary' : ''}`}>
            {formatAmount(balances.youOwe)}
          </span>
          <span className="text-[13px] leading-[18px] text-natural-muted">
            {balances.top ? (
              <>
                <Trans
                  i18nKey="home.itemsTo"
                  count={balances.youOweCount}
                  values={{ name: nameOf(balances.top[0]) }}
                  components={mono}
                />
                {balances.oldestDays !== null && (
                  <>
                    ,{' '}
                    <Trans
                      i18nKey="home.oldestDays"
                      count={balances.oldestDays}
                      components={mono}
                    />
                  </>
                )}
              </>
            ) : (
              t('home.nothingOwed')
            )}
          </span>
        </section>
        <section className={tile} id="tile-owed-to-you">
          <span className={label}>{t('home.owedToYou')}</span>
          <span className={big}>{formatAmount(balances.owedToYou)}</span>
          <span className="text-[13px] leading-[18px] text-natural-muted">
            {balances.owedCount > 0 ? (
              <Trans i18nKey="home.itemsOwed" count={balances.owedCount} components={mono} />
            ) : (
              t('home.nobodyOwesYou')
            )}
          </span>
        </section>
        <button
          type="button"
          onClick={onOpenPlan}
          className={`${tile} text-left cursor-pointer hover:border-natural-primary/40 transition-colors`}
          id="tile-budget"
        >
          <span className={`${label} flex items-center justify-between gap-2`}>
            {t('home.budget')}
            {budgets === null && (
              <span className="text-[10px] font-bold tracking-wider text-white bg-natural-dark px-1 py-0.5 rounded normal-case">
                Cherry +
              </span>
            )}
          </span>
          {budget ? (
            <>
              <span className={big}>{budget.pct}%</span>
              <span className="h-1.5 rounded-full bg-natural-sidebar overflow-hidden block">
                <span
                  className={`block h-full rounded-full ${budget.spent > budget.limit ? 'bg-natural-primary' : 'bg-natural-dark'}`}
                  style={{ width: `${Math.min(100, budget.pct)}%` }}
                />
              </span>
              <span className="text-[13px] leading-[18px] text-natural-muted">
                {budget.onPace ? t('home.onPace') : t('home.offPace')}{' '}
                {budget.watch &&
                  (budget.watch.over ? (
                    <Trans
                      i18nKey="home.overBy"
                      values={{
                        category: budget.watch.category,
                        amount: formatCurrency(Math.abs(budget.watch.left), 0),
                      }}
                      components={{ m: <span className="font-mono text-natural-primary" /> }}
                    />
                  ) : (
                    t('home.nearLimit', { category: budget.watch.category })
                  ))}
              </span>
            </>
          ) : (
            <>
              <span className="font-display text-2xl leading-9 font-semibold text-natural-muted">
                {budgets === null ? t('home.budgetLocked') : t('home.noBudgets')}
              </span>
              <span className="h-1.5 rounded-full bg-natural-sidebar overflow-hidden block">
                <span className="block h-full w-0 bg-natural-dark rounded-full" />
              </span>
              <span className="text-[13px] leading-[18px] text-natural-muted">
                {t('home.budgetBody')}
              </span>
            </>
          )}
        </button>
      </div>

      <div className="flex flex-wrap gap-4 items-start">
        {/* Itemized ledger */}
        <section
          className={`${panel} rounded-[20px] overflow-hidden flex flex-col [flex:999_1_440px] min-w-0`}
          id="home-ledger"
        >
          <div className="flex flex-wrap items-center justify-between gap-2.5 px-5 py-4 border-b border-natural-sidebar">
            <span className={label}>{t('home.itemizedLedger')}</span>
            <div className="flex gap-1.5 flex-wrap">
              {(['all', 'open', 'settled', 'recurring'] as LedgerFilter[]).map((f) => (
                <Chip key={f} small selected={filter === f} onClick={() => setFilter(f)}>
                  {t(`home.filter.${f}`)}
                </Chip>
              ))}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse min-w-[560px] text-sm leading-5">
              <thead>
                <tr className="text-natural-muted text-[11px] tracking-wider uppercase text-left whitespace-nowrap">
                  <th className="font-bold px-5 py-2.5">{t('sheet.item')}</th>
                  <th className="font-bold px-3 py-2.5">{t('sheet.category')}</th>
                  <th className="font-bold px-3 py-2.5">{t('sheet.paid')}</th>
                  <th className="font-bold px-3 py-2.5 text-right">{t('sheet.amount')}</th>
                  <th className="font-bold px-3 py-2.5 text-right">{t('sheet.yourShare')}</th>
                  <th className="font-bold pl-3 pr-5 py-2.5">{t('sheet.status')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr className="border-t border-natural-sidebar">
                    <td colSpan={6} className="px-5 py-8 text-center text-natural-muted text-sm">
                      {t('home.emptyLedger')}
                    </td>
                  </tr>
                )}
                {rows.map((e) => {
                  const closed = getNormalizedExpenseStatus(e) === 'CLOSED';
                  const deposit = isDeposit(e);
                  const share = e.shares?.[activeUser] ?? 0;
                  const owe = !closed && e.paidBy !== activeUser && share > 0.01;
                  const inst = instrumentOf(e);
                  return (
                    <tr
                      key={e.id}
                      className="border-t border-natural-sidebar hover:bg-natural-bg/60 cursor-pointer"
                      onClick={() => onOpenExpense(e)}
                      tabIndex={0}
                      onKeyDown={(ev) => {
                        if (ev.key === 'Enter' || ev.key === ' ') {
                          ev.preventDefault();
                          onOpenExpense(e);
                        }
                      }}
                      aria-label={t('list.openAria', { title: e.title })}
                    >
                      <td className="px-5 py-3 font-medium">
                        <span className="flex items-center gap-1.5 max-w-[16rem]">
                          <span className="truncate">{e.title}</span>
                          {isRecurringLine(e) && <RecurringMark interval={e.recurringInterval} />}
                        </span>
                        <span className="block text-xs text-natural-muted font-normal">
                          {formatShortDate(e.date)}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <CategoryChip name={e.category} />
                      </td>
                      <td className="px-3 py-3 text-natural-muted whitespace-nowrap">
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
                        className={`px-3 py-3 text-right font-mono ${closed ? 'text-natural-muted' : 'font-medium'}`}
                      >
                        {formatAmount(e.amount)}
                      </td>
                      <td
                        className={`px-3 py-3 text-right font-mono ${owe ? 'text-natural-primary' : 'text-natural-muted'}`}
                      >
                        {deposit ? '' : formatAmount(share)}
                      </td>
                      <td className="pl-3 pr-5 py-3">
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
              </tbody>
            </table>
          </div>
          <div className="px-5 py-3 border-t border-natural-sidebar">
            <button
              type="button"
              onClick={onOpenLedger}
              className="text-[13px] font-semibold text-natural-text hover:text-natural-primary inline-flex items-center gap-1 cursor-pointer"
              id="home-open-ledger"
            >
              {t('home.openLedger')} <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </section>

        <aside className="flex flex-col gap-4 [flex:1_1_280px] min-w-0">
          {/* Up next */}
          <section
            className={`${panel} rounded-[20px] px-5 py-[18px] flex flex-col gap-3`}
            id="up-next"
          >
            <span className={`${label} text-natural-primary`}>{t('home.upNext')}</span>
            {budget && budget.alerts.length > 0 && (
              <div className="flex flex-col gap-1.5" id="budget-alerts">
                {budget.alerts.map(({ status, level }) => (
                  <button
                    key={status.id}
                    type="button"
                    onClick={onOpenPlan}
                    className="flex items-center gap-2 text-[13px] leading-[18px] text-left cursor-pointer hover:text-natural-primary"
                  >
                    <CategoryChip name={status.category} />
                    <span className="min-w-0">
                      {level === 'over' ? (
                        <Trans
                          i18nKey="home.alertOver"
                          values={{ amount: formatCurrency(Math.abs(status.left), 0) }}
                          components={{ m: <span className="font-mono text-natural-primary" /> }}
                        />
                      ) : (
                        <Trans
                          i18nKey="home.alertNear"
                          values={{ amount: formatCurrency(status.left, 0) }}
                          components={mono}
                        />
                      )}
                    </span>
                  </button>
                ))}
              </div>
            )}
            {candidate && (
              <div
                className="flex flex-col gap-2 rounded-2xl border border-natural-border bg-natural-bg/60 px-3.5 py-3"
                id="recurring-candidate"
              >
                <span className="text-[13px] leading-[18px]">
                  <Trans
                    i18nKey="home.candidateLine"
                    values={{
                      title: candidate.title,
                      interval: intervalLabel(candidate.interval).toLocaleLowerCase(),
                    }}
                    components={{
                      q: <span className="font-medium" />,
                      r: <RecurringMark interval={candidate.interval} className="mx-0.5" />,
                    }}
                  />
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onMakeRecurring?.(candidate)}
                    className="h-8 px-3.5 rounded-full bg-natural-dark hover:bg-black text-white text-[13px] font-semibold cursor-pointer whitespace-nowrap"
                    id="candidate-make"
                  >
                    {t('home.makeRecurring')}
                  </button>
                  <button
                    type="button"
                    onClick={() => onDismissCandidate?.(candidate)}
                    className="h-8 px-3 rounded-full text-[13px] font-semibold text-natural-muted hover:text-natural-text cursor-pointer whitespace-nowrap"
                    id="candidate-dismiss"
                  >
                    {t('home.notThisOne')}
                  </button>
                </div>
              </div>
            )}
            {balances.top ? (
              <>
                <span className="text-[15px] leading-5 font-medium">
                  {t('home.settleWith', { name: nameOf(balances.top[0]) })}{' '}
                  <span className="font-mono">{formatAmount(balances.top[1])}</span>
                </span>
                <span className="text-[13px] leading-[18px] text-natural-muted">
                  <Trans i18nKey="home.settleBody" count={balances.youOweCount} components={mono} />
                </span>
                <button
                  type="button"
                  onClick={onSettle}
                  className="h-11 rounded-full bg-natural-dark hover:bg-black text-white text-sm font-semibold cursor-pointer transition-colors"
                  id="home-settle-btn"
                >
                  {t('home.settleUp')}
                </button>
              </>
            ) : (
              <span className="text-[13px] leading-[18px] text-natural-muted">
                {t('home.allSquare')}
              </span>
            )}
          </section>

          {/* This month by category */}
          <section
            className={`${panel} rounded-[20px] px-5 py-[18px] flex flex-col gap-2.5`}
            id="home-categories"
          >
            <span className={label}>{t('home.byCategory')}</span>
            {categories.length === 0 ? (
              <span className="text-[13px] text-natural-muted">{t('home.nothingThisMonth')}</span>
            ) : (
              <div className="flex flex-col gap-2 text-[13px] leading-[18px]">
                {categories.map((c) => (
                  <div key={c.category} className="flex items-center gap-2">
                    <CategoryChip name={c.category} />
                    <span className="flex-1 h-1.5 rounded-full bg-natural-sidebar overflow-hidden">
                      <span
                        className="block h-full rounded-full"
                        style={{
                          width: `${Math.round((c.total / catMax) * 100)}%`,
                          background: categoryColor(c.category),
                        }}
                      />
                    </span>
                    <span className="font-mono">{formatAmount(c.total)}</span>
                  </div>
                ))}
              </div>
            )}
            <button
              type="button"
              onClick={onOpenReports}
              className="text-[13px] font-semibold text-natural-text hover:text-natural-primary text-left cursor-pointer"
              id="home-open-reports"
            >
              {t('home.openReports')}
            </button>
          </section>

          {/* Coming up */}
          <section
            className={`${panel} rounded-[20px] px-5 py-[18px] flex flex-col gap-2.5`}
            id="home-coming-up"
          >
            <span className={label}>{t('home.comingUp')}</span>
            {comingUp.length === 0 ? (
              <span className="text-[13px] text-natural-muted">{t('home.nothingComingUp')}</span>
            ) : (
              <div className="flex flex-col gap-2 text-[13px] leading-[18px]">
                {comingUp.map((i) => (
                  <div key={i.id} className="flex justify-between gap-3">
                    <span className="truncate flex items-center gap-1.5 min-w-0">
                      <span className="truncate">{i.title}</span>
                      {i.note && <RecurringMark interval={i.note} />}
                    </span>
                    <span className="font-mono text-natural-muted shrink-0">
                      {formatShortDate(i.date)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>

          {aside}
        </aside>
      </div>
    </div>
  );
}
