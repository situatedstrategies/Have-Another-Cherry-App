// Alerts (lib/alerts): budget and goal crossings between before and after a
// save. Mirrors the Flutter test/alerts_test.dart vector for vector. Run with
// `npm run test:parity`.
import { budgetAlerts, goalAlerts, PLAN_ALERT_KINDS } from '../src/lib/alerts';
import type { BudgetStatus } from '../src/lib/plan';

let bad = 0;
const check = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) bad++;
  console.log(
    `${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ` (got ${JSON.stringify(got)}, want ${JSON.stringify(want)})`}`
  );
};

// A status with the fields the alerts read; the money fields are consistent
// with pct over an available of 100.
const st = (id: string, pct: number, alerts = true): BudgetStatus => ({
  id,
  category: id,
  group: 'flexible',
  rollover: false,
  alerts,
  limit: 100,
  carry: 0,
  available: 100,
  spent: Math.round(pct * 100 * 100) / 100,
  left: Math.round((100 - pct * 100) * 100) / 100,
  pct,
  over: pct > 1,
});

console.log('--- budgetAlerts ---');
check(
  'kinds',
  [...PLAN_ALERT_KINDS],
  ['budget_near', 'budget_over', 'goal_milestone', 'goal_off_track']
);
check('crossing 0.8 is near', budgetAlerts([st('g', 0.7)], [st('g', 0.85)]), [
  { kind: 'budget_near', budgetId: 'g' },
]);
check('reaching 1.0 exactly is over', budgetAlerts([st('g', 0.9)], [st('g', 1)]), [
  { kind: 'budget_over', budgetId: 'g' },
]);
check('crossing both at once is over only', budgetAlerts([st('g', 0.5)], [st('g', 1.2)]), [
  { kind: 'budget_over', budgetId: 'g' },
]);
check('reaching 0.8 exactly is near', budgetAlerts([st('g', 0.79)], [st('g', 0.8)]), [
  { kind: 'budget_near', budgetId: 'g' },
]);
check('already near is nothing', budgetAlerts([st('g', 0.85)], [st('g', 0.9)]), []);
check('already over is nothing', budgetAlerts([st('g', 1.1)], [st('g', 1.3)]), []);
check('going down is nothing', budgetAlerts([st('g', 1.1)], [st('g', 0.9)]), []);
check('alerts off is nothing', budgetAlerts([st('g', 0.5, false)], [st('g', 1.2, false)]), []);
check('a budget new since before counts from zero', budgetAlerts([], [st('g', 0.85)]), [
  { kind: 'budget_near', budgetId: 'g' },
]);
check(
  'several budgets, in the order of next',
  budgetAlerts(
    [st('a', 0.5), st('b', 0.95), st('c', 0.1), st('d', 0.6, false)],
    [st('d', 0.9, false), st('c', 0.1), st('b', 1.05), st('a', 0.81)]
  ),
  [
    { kind: 'budget_over', budgetId: 'b' },
    { kind: 'budget_near', budgetId: 'a' },
  ]
);

console.log('--- goalAlerts ---');
const couch = { id: 'couch', target: 1200 };
const on = { onTrack: true };
const off = { onTrack: false };
const unknown = { onTrack: null };
check('crossing 25 percent', goalAlerts(200, 320, couch, on, on), [
  { kind: 'goal_milestone', goalId: 'couch' },
]);
check('reaching 50 percent exactly', goalAlerts(500, 600, couch, null, null), [
  { kind: 'goal_milestone', goalId: 'couch' },
]);
check('crossing three milestones at once is one alert', goalAlerts(300, 1250, couch, on, on), [
  { kind: 'goal_milestone', goalId: 'couch' },
]);
check('no milestone crossed', goalAlerts(300, 310, couch, on, on), []);
check(
  'a goal with no target has no milestones',
  goalAlerts(0, 50, { id: 'x', target: 0 }, on, on),
  []
);
check('on track to off track', goalAlerts(300, 310, couch, on, off), [
  { kind: 'goal_off_track', goalId: 'couch' },
]);
check('unknown to off track is nothing', goalAlerts(300, 310, couch, unknown, off), []);
check('on track to unknown is nothing', goalAlerts(300, 310, couch, on, unknown), []);
check('off track stays off track is nothing', goalAlerts(300, 310, couch, off, off), []);
check('milestone and off track together, milestone first', goalAlerts(200, 320, couch, on, off), [
  { kind: 'goal_milestone', goalId: 'couch' },
  { kind: 'goal_off_track', goalId: 'couch' },
]);
check('funded going down is nothing', goalAlerts(600, 500, couch, on, on), []);

console.log(bad === 0 ? '\nALL ALERTS CHECKS PASSED' : `\n${bad} FAILURE(S)`);
process.exit(bad === 0 ? 0 : 1);
