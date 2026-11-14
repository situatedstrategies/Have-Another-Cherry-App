// Budget and goal alerts: the crossings between the plan's state before a
// save and after it. The client that saves computes them and posts each one
// to /api/notify-ledger-event as a contentless event (kind, group id, the
// budget or goal id, nothing else); the server pushes it to the other
// members. Pure; mirrored in the Flutter app's domain/plan/alerts.dart and
// checked by scripts/alerts-check.ts (`npm run test:parity`).
import { BudgetStatus, Goal, GoalProjection } from './plan';

export const PLAN_ALERT_KINDS = [
  'budget_near',
  'budget_over',
  'goal_milestone',
  'goal_off_track',
] as const;
export type PlanAlertKind = (typeof PLAN_ALERT_KINDS)[number];

export interface BudgetAlert {
  kind: 'budget_near' | 'budget_over';
  budgetId: string;
}

export interface GoalAlert {
  kind: 'goal_milestone' | 'goal_off_track';
  goalId: string;
}

/** Spending as a share of what is available: 0.8 is "near", 1.0 is "over". */
export const NEAR_RATIO = 0.8;
export const OVER_RATIO = 1;

/** For each budget in [next] with alerts on: 'budget_over' when it goes
 *  over between [prev] and [next], else 'budget_near' when it reaches 0.8.
 *  A budget missing from [prev] counts as 0 before. One alert per budget per
 *  save, in the order of [next]. */
export const budgetAlerts = (prev: BudgetStatus[], next: BudgetStatus[]): BudgetAlert[] => {
  const out: BudgetAlert[] = [];
  for (const n of next) {
    if (!n.alerts) continue;
    const before = alertLevel(prev.find((p) => p.id === n.id));
    const after = alertLevel(n);
    if (after === 2 && before < 2) out.push({ kind: 'budget_over', budgetId: n.id });
    else if (after === 1 && before < 1) out.push({ kind: 'budget_near', budgetId: n.id });
  }
  return out;
};

/** 2 is over, 1 is near, 0 is neither. "Over" reads the status's own flag as
 *  well as the ratio: a rollover budget in deficit has nothing available, so
 *  its pct is 0 while it is over. A budget that was not there counts as 0. */
export const alertLevel = (s: Pick<BudgetStatus, 'pct' | 'over'> | undefined): 0 | 1 | 2 => {
  if (!s) return 0;
  if (s.over || s.pct >= OVER_RATIO) return 2;
  return s.pct >= NEAR_RATIO ? 1 : 0;
};

/** The id a budget alert carries to the server. A budget read from a mobile
 *  spending threshold has its category in its id ('threshold:Groceries'),
 *  and the event must stay contentless, so those all post as 'threshold'. */
export const alertId = (budgetId: string): string =>
  budgetId.startsWith('threshold:') ? 'threshold' : budgetId;

export const GOAL_MILESTONES = [0.25, 0.5, 0.75, 1] as const;

/** 'goal_milestone' when funded crosses 25, 50, 75 or 100 percent of the
 *  target upward (one alert however many it crosses at once; none for a goal
 *  with no target), then 'goal_off_track' when onTrack goes from true to
 *  false. */
export const goalAlerts = (
  prevFunded: number,
  nextFunded: number,
  goal: Pick<Goal, 'id' | 'target'>,
  projectionBefore: Pick<GoalProjection, 'onTrack'> | null,
  projectionAfter: Pick<GoalProjection, 'onTrack'> | null
): GoalAlert[] => {
  const out: GoalAlert[] = [];
  if (goal.target > 0) {
    const before = prevFunded / goal.target;
    const after = nextFunded / goal.target;
    if (GOAL_MILESTONES.some((m) => before < m && after >= m)) {
      out.push({ kind: 'goal_milestone', goalId: goal.id });
    }
  }
  if (projectionBefore?.onTrack === true && projectionAfter?.onTrack === false) {
    out.push({ kind: 'goal_off_track', goalId: goal.id });
  }
  return out;
};
