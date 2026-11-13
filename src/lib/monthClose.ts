// Month close: the summary card Home shows on the first open of a new month.
// Last month's totals strip, the budget result and what is still unsettled,
// all from the reports and plan arithmetic; nothing stored but the month this
// device has shown. Pure; mirrored in the Flutter app's
// domain/plan/month_close.dart and checked by scripts/month-close-check.ts
// (`npm run test:parity`).
import { Expense } from '../types';
import {
  roundCurrency,
  isDarkCherry,
  isUnclaimed,
  getNormalizedExpenseStatus,
  getRemainingSettlementAmount,
  getTotalRemainingOwedToPayer,
} from './money';
import { applyFilter, byCategory, totals, ReportView } from './reports';
import {
  Budget,
  Goal,
  addMonthsTo,
  daysInMonth,
  goalContributions,
  monthOf,
  planStatuses,
} from './plan';

export interface MonthCloseSummary {
  /** 'YYYY-MM'. */
  month: string;
  /** The household's spending in the month. */
  total: number;
  /** The member's share of it. */
  yourShare: number;
  /** Percent change against the month before, in [view]; null when the month
   *  before had nothing. */
  change: number | null;
  /** The largest category in [view]; null when the month had nothing. */
  topCategory: string | null;
  budgetsUnder: number;
  budgetsOver: number;
  /** The over budget with the most spent past its available amount, or null. */
  biggestOver: string | null;
  /** Lines from the month still open (household: any open line visible to
   *  the member; personal: lines the member still owes on). */
  openCount: number;
  /** Still unsettled on them (household: everything still owed to payers;
   *  personal: what the member still owes). */
  openTotal: number;
  /** Put towards the goals in the month (personal: the member's own). */
  goalsFunded: number;
}

const pad = (n: number): string => String(n).padStart(2, '0');

export const monthCloseSummary = (
  expenses: Expense[],
  budgets: Budget[],
  goals: Goal[],
  month: string,
  view: ReportView,
  uid: string
): MonthCloseSummary => {
  const bounds = { start: `${month}-01`, end: `${month}-${pad(daysInMonth(month))}` };
  const household = { ...bounds, view: 'household' as const, uid };
  const personal = { ...bounds, view: 'personal' as const, uid };
  const inView = view === 'household' ? household : personal;

  const total = totals(expenses, household, bounds.end).total;
  const yourShare = totals(expenses, personal, bounds.end).total;
  const change = totals(expenses, inView, bounds.end).changePct;
  const top = byCategory(expenses, inView)[0];

  const statuses = planStatuses(expenses, budgets, month, view, uid);
  let biggest: { id: string; by: number } | null = null;
  for (const s of statuses) {
    if (!s.over) continue;
    const by = roundCurrency(s.spent - s.available);
    if (!biggest || by > biggest.by) biggest = { id: s.id, by };
  }

  let openCount = 0;
  let openTotal = 0;
  for (const e of applyFilter(expenses, household)) {
    if (isUnclaimed(e) || isDarkCherry(e)) continue;
    if (view === 'household') {
      if (getNormalizedExpenseStatus(e) === 'CLOSED') continue;
      openCount++;
      openTotal = roundCurrency(openTotal + getTotalRemainingOwedToPayer(e, false));
    } else {
      if (e.paidBy === uid) continue;
      const owed = getRemainingSettlementAmount(e, uid, false);
      if (owed <= 0.01) continue;
      openCount++;
      openTotal = roundCurrency(openTotal + owed);
    }
  }

  let goalsFunded = 0;
  for (const g of goals) {
    for (const c of goalContributions(expenses, g)) {
      if (monthOf(c.date) !== month) continue;
      if (view === 'personal' && c.paidBy !== uid) continue;
      goalsFunded = roundCurrency(goalsFunded + c.amount);
    }
  }

  return {
    month,
    total,
    yourShare,
    change,
    topCategory: top ? top.category : null,
    budgetsUnder: statuses.filter((s) => !s.over).length,
    budgetsOver: statuses.filter((s) => s.over).length,
    biggestOver: biggest ? biggest.id : null,
    openCount,
    openTotal,
    goalsFunded,
  };
};

/** The month a given day closes: the one before it. */
export const closedMonthFor = (today: string): string => addMonthsTo(monthOf(today), -1);

/** Whether to show the card: the month before today's has not been shown on
 *  this device yet. (Every day is on or after the 1st of its month, so this
 *  is true from the 1st until the person dismisses it.) */
export const shouldShowMonthClose = (today: string, lastShownMonth: string | null): boolean =>
  lastShownMonth !== closedMonthFor(today);
