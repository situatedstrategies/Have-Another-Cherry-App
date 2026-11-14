// Plan: budgets and goals. A budget is a per-month limit on one category,
// grouped the way Monarch groups them (fixed, flexible, non-monthly), with a
// rollover switch and an alerts switch. A goal is a target amount with an
// optional date, funded by ledger lines of splitType 'goal'. Nothing here is
// stored except the budgets and goals themselves (one encrypted payload per
// scope); every figure is computed over the expenses it is handed through the
// reports arithmetic, so Personal view is the member's share. Mirrored in the
// Flutter app's domain/plan/plan.dart and checked by scripts/plan-check.ts
// (`npm run test:parity`).
//
// Months are 'YYYY-MM' strings compared as strings; dates are the ledger's
// local 'YYYY-MM-DD' strings. Money is rounded to cents at the end of each
// function, like reports.
import { Expense, Group } from '../types';
import { roundCurrency, isGoalContribution } from './money';
import { applyFilter, reportAmount, ReportView } from './reports';
import { parseLocalDate } from './recurring';
import type { CategoryRule } from './rules';

export type BudgetGroup = 'fixed' | 'flexible' | 'nonMonthly';
export type PlanScope = 'household' | 'personal';

export interface Budget {
  id: string;
  category: string;
  /** Per month. */
  limit: number;
  group: BudgetGroup;
  rollover: boolean;
  alerts: boolean;
  /** 'YYYY-MM': the first month that counts, for the rollover. */
  startMonth: string;
  scope: PlanScope;
}

export interface Goal {
  id: string;
  name: string;
  target: number;
  /** 'YYYY-MM-DD'. */
  dueDate?: string;
  scope: PlanScope;
  /** ISO datetime. */
  createdAt: string;
  /** ISO datetime, set when the goal is marked done. */
  doneAt?: string;
}

/** One encrypted document per scope. Rules (lib/rules) are household only;
 *  the personal payload carries an empty list. */
export interface PlanPayload {
  budgets: Budget[];
  goals: Goal[];
  rules: CategoryRule[];
}

const MONTH_KEY = /^\d{4}-(0[1-9]|1[0-2])$/;

export const BUDGET_GROUPS: BudgetGroup[] = ['flexible', 'fixed', 'nonMonthly'];

const pad = (n: number): string => String(n).padStart(2, '0');

export const daysInMonth = (month: string): number => {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m, 0).getDate();
};

/** The month after [month]. */
export const nextMonth = (month: string): string => {
  const [y, m] = month.split('-').map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${pad(m + 1)}`;
};

/** [delta] months after [month] (negative goes back). */
export const addMonthsTo = (month: string, delta: number): string => {
  const [y, m] = month.split('-').map(Number);
  const total = y * 12 + (m - 1) + delta;
  return `${Math.floor(total / 12)}-${pad((((total % 12) + 12) % 12) + 1)}`;
};

export const monthOf = (iso: string): string => iso.slice(0, 7);

const monthBounds = (month: string) => ({
  start: `${month}-01`,
  end: `${month}-${pad(daysInMonth(month))}`,
});

/** The category's spending in [month] through the reports filter, so the
 *  Personal view is the member's share, Household the total; deposits, goal
 *  contributions and other people's Dark Cherry pots never count. The
 *  category is matched on its trimmed name, as byCategory keys it. */
export const budgetSpent = (
  expenses: Expense[],
  budget: Budget,
  month: string,
  view: ReportView,
  uid: string
): number => {
  const filter = { ...monthBounds(month), view, uid };
  const category = budget.category.trim();
  return roundCurrency(
    applyFilter(expenses, filter)
      .filter((e) => (e.category || '').trim() === category)
      .reduce((t, e) => t + reportAmount(e, filter), 0)
  );
};

/** What earlier months left behind: 0 without rollover, otherwise the signed
 *  sum of `limit - spent` over every month from startMonth up to but not
 *  including [month]. Nothing is clamped; a negative carry is "behind by". */
export const budgetCarry = (
  expenses: Expense[],
  budget: Budget,
  month: string,
  view: ReportView,
  uid: string
): number => {
  if (!budget.rollover) return 0;
  // A start month that is not a real 'YYYY-MM' carries nothing (the same on
  // the phone); stepping from one would never reach [month].
  if (!MONTH_KEY.test(budget.startMonth || '') || !MONTH_KEY.test(month)) return 0;
  let carry = 0;
  for (let m = budget.startMonth; m < month; m = nextMonth(m)) {
    carry += budget.limit - budgetSpent(expenses, budget, m, view, uid);
  }
  return roundCurrency(carry);
};

export interface BudgetStatus {
  id: string;
  category: string;
  group: BudgetGroup;
  rollover: boolean;
  alerts: boolean;
  limit: number;
  carry: number;
  /** limit + carry. */
  available: number;
  spent: number;
  /** available - spent. */
  left: number;
  /** spent / available, 0 when nothing is available. Not a percent. */
  pct: number;
  over: boolean;
}

export const budgetStatus = (
  expenses: Expense[],
  budget: Budget,
  month: string,
  view: ReportView,
  uid: string
): BudgetStatus => {
  const limit = roundCurrency(budget.limit);
  const carry = budgetCarry(expenses, budget, month, view, uid);
  const available = roundCurrency(limit + carry);
  const spent = budgetSpent(expenses, budget, month, view, uid);
  return {
    id: budget.id,
    category: budget.category,
    group: budget.group,
    rollover: budget.rollover,
    alerts: budget.alerts,
    limit,
    carry,
    available,
    spent,
    left: roundCurrency(available - spent),
    pct: available > 0 ? spent / available : 0,
    over: spent > available,
  };
};

export interface BudgetPace {
  daysElapsed: number;
  daysInMonth: number;
  /** spent / daysElapsed * daysInMonth; spent itself before the month starts. */
  projected: number;
}

/** "<n> days in, on pace for <projected>". [today] before the month gives 0
 *  days in; after it, the whole month. */
export const budgetPace = (
  status: Pick<BudgetStatus, 'spent'>,
  month: string,
  today: string
): BudgetPace => {
  const days = daysInMonth(month);
  const t = monthOf(today);
  const daysElapsed = t < month ? 0 : t > month ? days : Number(today.slice(8, 10));
  return {
    daysElapsed,
    daysInMonth: days,
    projected:
      daysElapsed === 0 ? status.spent : roundCurrency((status.spent / daysElapsed) * days),
  };
};

export interface GroupTotal {
  limit: number;
  spent: number;
  /** The sum of each budget's `left`, so carried-over money is in it. */
  left: number;
}

export const groupTotals = (statuses: BudgetStatus[]): Record<BudgetGroup, GroupTotal> => {
  const out: Record<BudgetGroup, GroupTotal> = {
    fixed: { limit: 0, spent: 0, left: 0 },
    flexible: { limit: 0, spent: 0, left: 0 },
    nonMonthly: { limit: 0, spent: 0, left: 0 },
  };
  for (const s of statuses) {
    const g = out[s.group];
    g.limit = roundCurrency(g.limit + s.limit);
    g.spent = roundCurrency(g.spent + s.spent);
    g.left = roundCurrency(g.left + s.left);
  }
  return out;
};

/** 'over' once spending reaches the whole available amount, 'near' from 80%,
 *  only for budgets with alerts on; null otherwise. */
export const budgetAlertLevel = (status: BudgetStatus): 'over' | 'near' | null => {
  if (!status.alerts || status.available <= 0) return null;
  if (status.spent >= status.available) return 'over';
  if (status.spent >= status.available * 0.8) return 'near';
  return null;
};

/** The budget most worth watching: the highest pct, only when some budget is
 *  past 80%; null otherwise. */
export const budgetToWatch = (statuses: BudgetStatus[]): BudgetStatus | null => {
  let top: BudgetStatus | null = null;
  // A rollover budget in deficit is over with a pct of 0 (nothing is
  // available), so "over" ranks as at least 1.
  const rank = (s: BudgetStatus) => (s.over ? Math.max(s.pct, 1) : s.pct);
  for (const s of statuses) if (!top || rank(s) > rank(top)) top = s;
  return top && rank(top) > 0.8 ? top : null;
};

/** The contributions to [goal], oldest first. */
export const goalContributions = (expenses: Expense[], goal: Pick<Goal, 'id'>): Expense[] =>
  expenses
    .filter((e) => isGoalContribution(e) && e.goalId === goal.id && !!e.date)
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));

/** What has been put towards the goal: everyone's contributions in Household
 *  view, only the member's own in Personal. */
export const goalFunded = (
  expenses: Expense[],
  goal: Pick<Goal, 'id'>,
  view: ReportView,
  uid: string
): number =>
  roundCurrency(
    goalContributions(expenses, goal)
      .filter((e) => view === 'household' || e.paidBy === uid)
      .reduce((t, e) => t + e.amount, 0)
  );

export interface GoalProjection {
  funded: number;
  /** Average monthly contribution over the three whole months before today's. */
  avg: number;
  /** ceil((target - funded) / avg), never below 0; null when avg is 0. */
  monthsLeft: number | null;
  /** The first day of the month monthsLeft months after today's; null when unknown. */
  projectedDate: string | null;
  /** projectedDate <= dueDate when both exist; null otherwise. */
  onTrack: boolean | null;
}

/** When the goal lands at the current pace, from everyone's contributions. */
export const goalProjection = (expenses: Expense[], goal: Goal, today: string): GoalProjection => {
  const thisMonth = monthOf(today);
  const from = addMonthsTo(thisMonth, -3);
  const trailing = goalContributions(expenses, goal).filter((e) => {
    const m = monthOf(e.date);
    return m >= from && m < thisMonth;
  });
  const avg = roundCurrency(trailing.reduce((t, e) => t + e.amount, 0) / 3);
  const funded = goalFunded(expenses, goal, 'household', '');
  if (avg <= 0) return { funded, avg, monthsLeft: null, projectedDate: null, onTrack: null };
  const monthsLeft = Math.max(0, Math.ceil(roundCurrency(goal.target - funded) / avg));
  const projectedDate = `${addMonthsTo(thisMonth, monthsLeft)}-01`;
  return {
    funded,
    avg,
    monthsLeft,
    projectedDate,
    onTrack: goal.dueDate ? projectedDate <= goal.dueDate : null,
  };
};

/** The month name of a goal's date for the card caption. */
export const goalMonthLabel = (iso: string, locale: string): string =>
  parseLocalDate(iso).toLocaleDateString(locale, { month: 'long' });

const WEEKS_PER_MONTH = 52 / 12;

/** The group's existing spending thresholds as budget lines, for a household
 *  with no plan document yet (migration on read, never written back on its
 *  own). A weekly cap becomes a monthly limit of amount * 52 / 12. A cap with
 *  no category ("Everything") has no category to budget and is skipped. */
export const thresholdsAsBudgets = (
  group: Pick<Group, 'spendingThresholds'>,
  month: string
): Budget[] =>
  (group.spendingThresholds || [])
    .filter((th) => !!(th.category || '').trim() && th.amount > 0)
    .map((th) => ({
      id: `threshold:${th.category!.trim()}`,
      category: th.category!.trim(),
      limit: roundCurrency(th.period === 'week' ? th.amount * WEEKS_PER_MONTH : th.amount),
      group: 'flexible' as const,
      rollover: false,
      alerts: true,
      startMonth: month,
      scope: 'household' as const,
    }));

/** The statuses of every budget in [scope] for [month], in group order then
 *  by category, the way the Plan tab lists them. */
export const planStatuses = (
  expenses: Expense[],
  budgets: Budget[],
  month: string,
  view: ReportView,
  uid: string
): BudgetStatus[] =>
  budgets
    .slice()
    .sort(
      (a, b) =>
        BUDGET_GROUPS.indexOf(a.group) - BUDGET_GROUPS.indexOf(b.group) ||
        a.category.localeCompare(b.category)
    )
    .map((b) => budgetStatus(expenses, b, month, view, uid));
