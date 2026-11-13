import { useEffect, useMemo, useState } from 'react';
import { useTranslation, Trans } from 'react-i18next';
import { Target, TrendingUp, ArrowRight, Plus, SlidersHorizontal, Sparkles } from 'lucide-react';
import { Expense, Group } from '../types';
import {
  Budget,
  BudgetGroup,
  BudgetStatus,
  Goal,
  PlanPayload,
  PlanScope,
  BUDGET_GROUPS,
  planStatuses,
  groupTotals,
  budgetPace,
  budgetToWatch,
  goalFunded,
  goalProjection,
  monthOf,
} from '../lib/plan';
import { ReportView } from '../lib/reports';
import { todayLocal, parseLocalDate } from '../lib/recurring';
import { formatCurrency, formatDateWith } from '../lib/format';
import { categoryColor } from '../lib/ui';
import HouseAccount from './HouseAccount';
import ModuleBoundary from './ModuleBoundary';
import CategoryChip from './CategoryChip';
import BudgetEditor from './BudgetEditor';
import GoalSheet from './GoalSheet';
import { panel, label, PageHeader, Segmented, GhostButton } from './Controls';

interface Props {
  expenses: Expense[];
  group: Group;
  activeUser: string;
  members: { uid: string; name?: string }[];
  /** Cherry + gate: the locked panel is the fallback behind the paywall. */
  locked?: boolean;
  onUnlock?: () => void;
  household: PlanPayload;
  personal: PlanPayload;
  onSave: (scope: PlanScope, next: PlanPayload) => Promise<boolean>;
  /** Opens the Log form in goal mode with this goal preselected. */
  onContribute: (goal: Goal) => void;
  onPlanPurchase: () => void;
  onLogDeposit: () => void;
}

const storageKey = (gid: string) => `plan_view_${gid}`;

const mono = 'font-mono text-natural-text';

/**
 * Plan: the month's budget against its limits, the budget rows by group,
 * the goals, then the purchase planner and the house account. Household
 * budgets live on the group plan, personal on the member's; every figure is
 * lib/plan over the ledger, nothing stored but the budgets and goals.
 */
export default function PlanView({
  expenses,
  group,
  activeUser,
  members,
  locked,
  onUnlock,
  household,
  personal,
  onSave,
  onContribute,
  onPlanPurchase,
  onLogDeposit,
}: Props) {
  const { t, i18n } = useTranslation();
  const [view, setView] = useState<ReportView>(() => {
    try {
      const v = localStorage.getItem(storageKey(group.id));
      return v === 'personal' ? 'personal' : 'household';
    } catch {
      return 'household';
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(storageKey(group.id), view);
    } catch {
      /* per-device convenience only */
    }
  }, [view, group.id]);
  const [editing, setEditing] = useState(false);
  const [goalOpen, setGoalOpen] = useState<Goal | 'new' | null>(null);
  const [showDone, setShowDone] = useState(false);

  const today = todayLocal();
  const month = monthOf(today);
  const scope: PlanScope = view;
  const plan = view === 'household' ? household : personal;

  const statuses = useMemo(
    () => planStatuses(expenses, plan.budgets, month, view, activeUser),
    [expenses, plan.budgets, month, view, activeUser]
  );
  const totals = useMemo(() => groupTotals(statuses), [statuses]);
  const totalLimit = statuses.reduce((s, b) => s + b.limit, 0);
  const totalSpent = statuses.reduce((s, b) => s + b.spent, 0);
  const pace = budgetPace({ spent: totalSpent }, month, today);
  const watch = budgetToWatch(statuses);
  const monthName = formatDateWith(parseLocalDate(today), { month: 'long' });

  const goals = useMemo(() => {
    const open = plan.goals.filter((g) => !g.doneAt);
    const done = plan.goals.filter((g) => !!g.doneAt);
    const describe = (g: Goal) => ({
      goal: g,
      funded: goalFunded(expenses, g, view, activeUser),
      projection: goalProjection(expenses, g, today),
    });
    return { open: open.map(describe), done: done.map(describe) };
  }, [plan.goals, expenses, view, activeUser, today]);

  const monthLabel = (iso: string) =>
    formatDateWith(parseLocalDate(iso), {
      month: 'long',
      year:
        parseLocalDate(iso).getFullYear() === parseLocalDate(today).getFullYear()
          ? undefined
          : 'numeric',
    });

  const saveGoals = (next: Goal[]) => onSave(scope, { ...plan, goals: next });

  const header = (
    <PageHeader title={t('nav.plan')} subtitle={t('planTab.subtitle')}>
      <Segmented
        value={view}
        onChange={setView}
        ariaLabel={t('reports.viewAria')}
        options={[
          { value: 'household', label: t('reports.view.household') },
          { value: 'personal', label: t('reports.view.personal') },
        ]}
      />
      {!locked && (
        <GhostButton onClick={() => setEditing(true)} id="plan-edit-budgets">
          <SlidersHorizontal className="h-4 w-4" /> {t('planTab.editBudgets')}
        </GhostButton>
      )}
    </PageHeader>
  );

  if (locked) {
    return (
      <div className="flex flex-col gap-5" id="plan-view">
        {header}
        <button
          type="button"
          onClick={onUnlock}
          className={`${panel} p-5 w-full text-left space-y-3 hover:border-natural-primary/40 transition-colors cursor-pointer`}
          id="plan-locked"
        >
          <div className="flex items-center justify-between">
            <h3 className={`${label} flex items-center gap-1.5`}>
              <Target className="h-3.5 w-3.5 text-natural-primary" /> {t('planTab.budgets')}
            </h3>
            <span className="text-[10px] font-bold tracking-wider text-white bg-natural-dark px-1.5 py-0.5 rounded-md">
              Cherry +
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2" aria-hidden="true">
            {BUDGET_GROUPS.map((g) => (
              <div
                key={g}
                className="bg-natural-bg/50 rounded-xl p-2 border border-natural-border/50 text-center"
              >
                <span className="block text-lg font-display font-semibold text-natural-border select-none">
                  ···
                </span>
                <span className="block text-xs font-semibold text-natural-muted uppercase">
                  {t(`planTab.group.${g}`)}
                </span>
              </div>
            ))}
          </div>
          <p className="text-xs text-natural-muted flex items-center gap-1.5">
            <Sparkles className="h-3 w-3 shrink-0" /> {t('planTab.teaser')}
          </p>
        </button>
        <ModuleBoundary label={t('house.title')}>
          <HouseAccount
            expenses={expenses}
            group={group}
            activeUser={activeUser}
            members={members}
            onLogDeposit={onLogDeposit}
          />
        </ModuleBoundary>
      </div>
    );
  }

  const renderRow = (s: BudgetStatus) => {
    const color = categoryColor(s.category);
    const fill = s.available > 0 ? Math.min(1, s.spent / s.available) : s.spent > 0 ? 1 : 0;
    return (
      <div key={s.id} className="px-5 py-4 flex flex-col gap-2" id={`budget-${s.id}`}>
        <div className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-2 min-w-0">
            <CategoryChip name={s.category} />
            {s.rollover && (
              <span className="text-xs text-natural-muted">{t('planTab.rollsOver')}</span>
            )}
          </span>
          <span
            className={`font-mono text-[15px] font-medium shrink-0 ${s.over ? 'text-natural-primary' : ''}`}
          >
            {s.over
              ? t('planTab.over', { amount: formatCurrency(Math.abs(s.left), 0) })
              : t('planTab.left', { amount: formatCurrency(s.left, 0) })}
          </span>
        </div>
        <span className="h-1.5 rounded-full bg-natural-sidebar overflow-hidden block">
          <span
            className="block h-full rounded-full"
            style={{ width: `${fill * 100}%`, background: s.over ? '#C41200' : color }}
          />
        </span>
        <span className="text-[13px] leading-[18px] text-natural-muted">
          {s.rollover ? (
            s.carry < 0 ? (
              <Trans
                i18nKey="planTab.rolloverBehind"
                values={{
                  limit: formatCurrency(s.limit, 0),
                  carry: formatCurrency(Math.abs(s.carry), 0),
                }}
                components={{ m: <span className={mono} /> }}
              />
            ) : (
              <Trans
                i18nKey="planTab.rolloverAhead"
                values={{ limit: formatCurrency(s.limit, 0), carry: formatCurrency(s.carry, 0) }}
                components={{ m: <span className={mono} /> }}
              />
            )
          ) : (
            <Trans
              i18nKey="planTab.spentOf"
              values={{ spent: formatCurrency(s.spent, 0), limit: formatCurrency(s.available, 0) }}
              components={{ m: <span className={mono} /> }}
            />
          )}
          {watch && watch.id === s.id && ` ${t('planTab.oneToWatchShort')}`}
        </span>
      </div>
    );
  };

  const renderGroup = (g: BudgetGroup) => {
    const rows = statuses.filter((s) => s.group === g);
    if (rows.length === 0) return null;
    const tot = totals[g];
    return (
      <section key={g} className="flex flex-col gap-2" id={`plan-group-${g}`}>
        <div className="flex items-baseline justify-between gap-3 px-1">
          <h3 className={label}>{t(`planTab.group.${g}`)}</h3>
          <span className="font-mono text-[13px] text-natural-muted">
            {t('planTab.spentOfShort', {
              spent: formatCurrency(tot.spent, 0),
              limit: formatCurrency(tot.limit, 0),
            })}
          </span>
        </div>
        <div className={`${panel} rounded-[20px] divide-y divide-natural-sidebar`}>
          {rows.map(renderRow)}
        </div>
      </section>
    );
  };

  return (
    <div className="flex flex-col gap-5" id="plan-view">
      {header}

      {statuses.length === 0 ? (
        <section className={`${panel} rounded-[20px] px-5 py-[18px]`} id="plan-empty">
          <h3 className={`${label} flex items-center gap-1.5`}>
            <Target className="h-3.5 w-3.5 text-natural-primary" /> {t('planTab.budgets')}
          </h3>
          <p className="mt-2 text-sm text-natural-muted">
            {t(view === 'household' ? 'planTab.emptyHousehold' : 'planTab.emptyPersonal')}
          </p>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="mt-3 text-sm font-semibold text-natural-primary hover:underline cursor-pointer"
          >
            {t('planTab.setBudgets')}
          </button>
        </section>
      ) : (
        <section className="flex flex-col gap-2.5 px-1" id="plan-hero">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[17px] text-natural-muted">
              {t('planTab.monthBudget', { month: monthName })}
            </span>
            <span className="font-mono text-[17px] font-medium">
              {t('planTab.spentOfShort', {
                spent: formatCurrency(totalSpent, 0),
                limit: formatCurrency(totalLimit, 0),
              })}
            </span>
          </div>
          <span
            className="h-3 rounded-full bg-natural-sidebar overflow-hidden flex"
            role="img"
            aria-label={t('planTab.heroBarAria')}
          >
            {statuses.map((s) => (
              <span
                key={s.id}
                className="block h-full"
                style={{
                  width: `${totalLimit > 0 ? (Math.min(s.spent, s.available) / totalLimit) * 100 : 0}%`,
                  background: categoryColor(s.category),
                }}
              />
            ))}
          </span>
          <p className="text-[13px] leading-[18px] text-natural-muted">
            <Trans
              i18nKey="planTab.pace"
              count={pace.daysElapsed}
              values={{ projected: formatCurrency(pace.projected, 0) }}
              components={{ m: <span className={mono} /> }}
            />
            {watch && ` ${t('planTab.oneToWatch', { category: watch.category })}`}
          </p>
        </section>
      )}

      {BUDGET_GROUPS.map(renderGroup)}

      {/* Goals */}
      <section className="flex flex-col gap-2" id="plan-goals">
        <div className="flex items-baseline justify-between gap-3 px-1">
          <h3 className={label}>{t('planTab.goals')}</h3>
          <button
            type="button"
            onClick={() => setGoalOpen('new')}
            className="text-[13px] font-semibold text-natural-text hover:text-natural-primary inline-flex items-center gap-1 cursor-pointer"
            id="plan-new-goal"
          >
            <Plus className="h-3.5 w-3.5" /> {t('planTab.newGoal')}
          </button>
        </div>
        {goals.open.length === 0 ? (
          <p className={`${panel} rounded-[20px] px-5 py-4 text-sm text-natural-muted`}>
            {t('planTab.noGoals')}
          </p>
        ) : (
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
            {goals.open.map(({ goal, funded, projection }) => {
              const done = funded >= goal.target && goal.target > 0;
              const ratio = goal.target > 0 ? Math.min(1, funded / goal.target) : 0;
              return (
                <button
                  key={goal.id}
                  type="button"
                  onClick={() => setGoalOpen(goal)}
                  className={`${panel} rounded-[20px] px-5 py-[18px] text-left flex flex-col gap-2 hover:border-natural-primary/40 transition-colors cursor-pointer`}
                  id={`goal-${goal.id}`}
                >
                  <span className="text-[17px] leading-6 font-medium truncate">{goal.name}</span>
                  <span className="font-mono text-[28px] leading-8 font-medium tracking-tight">
                    {formatCurrency(funded, 0)}
                  </span>
                  <span className="h-1.5 rounded-full bg-natural-sidebar overflow-hidden block">
                    <span
                      className={`block h-full rounded-full ${done ? 'bg-natural-teal' : 'bg-natural-dark'}`}
                      style={{ width: `${ratio * 100}%` }}
                    />
                  </span>
                  <span
                    className={`text-[13px] leading-[18px] ${done ? 'text-natural-teal font-medium' : 'text-natural-muted'}`}
                  >
                    {done ? (
                      t('planTab.fundedDone')
                    ) : projection.projectedDate ? (
                      <Trans
                        i18nKey="planTab.ofTargetDoneBy"
                        values={{
                          target: formatCurrency(goal.target, 0),
                          month: monthLabel(projection.projectedDate),
                        }}
                        components={{ m: <span className={mono} /> }}
                      />
                    ) : goal.dueDate ? (
                      <Trans
                        i18nKey="planTab.ofTargetGoalMonth"
                        values={{
                          target: formatCurrency(goal.target, 0),
                          month: monthLabel(goal.dueDate),
                        }}
                        components={{ m: <span className={mono} /> }}
                      />
                    ) : (
                      <Trans
                        i18nKey="planTab.ofTarget"
                        values={{ target: formatCurrency(goal.target, 0) }}
                        components={{ m: <span className={mono} /> }}
                      />
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        )}
        {goals.done.length > 0 && (
          <div className={`${panel} rounded-[20px] overflow-hidden`} id="plan-goals-done">
            <button
              type="button"
              onClick={() => setShowDone((v) => !v)}
              aria-expanded={showDone}
              className="w-full flex items-center justify-between px-5 py-3 text-[13px] font-semibold text-natural-muted hover:text-natural-text cursor-pointer"
            >
              {t('planTab.doneCount', { count: goals.done.length })}
              <ArrowRight
                className={`h-3.5 w-3.5 transition-transform ${showDone ? 'rotate-90' : ''}`}
              />
            </button>
            {showDone && (
              <div className="divide-y divide-natural-sidebar border-t border-natural-sidebar">
                {goals.done.map(({ goal, funded }) => (
                  <button
                    key={goal.id}
                    type="button"
                    onClick={() => setGoalOpen(goal)}
                    className="w-full flex items-center justify-between gap-3 px-5 py-3 text-sm text-left hover:bg-natural-bg/60 cursor-pointer"
                  >
                    <span className="truncate">{goal.name}</span>
                    <span className="font-mono text-natural-muted shrink-0">
                      {formatCurrency(funded, 0)}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      <button
        type="button"
        onClick={onPlanPurchase}
        className={`${panel} rounded-[20px] px-5 py-[18px] text-left flex items-center justify-between gap-4 hover:border-natural-primary/40 transition-colors cursor-pointer`}
        id="plan-purchase-card"
      >
        <div className="min-w-0">
          <span className={`${label} flex items-center gap-1.5`}>
            <TrendingUp className="h-3.5 w-3.5 text-natural-primary" /> {t('app.planPurchase')}
          </span>
          <p className="mt-1.5 font-display text-lg font-semibold text-natural-text">
            {t('planView.purchaseTitle')}
          </p>
          <p className="mt-1 text-sm text-natural-muted">{t('planView.purchaseBody')}</p>
        </div>
        <ArrowRight className="h-5 w-5 text-natural-muted shrink-0" />
      </button>

      <ModuleBoundary label={t('house.title')}>
        <HouseAccount
          expenses={expenses}
          group={group}
          activeUser={activeUser}
          members={members}
          onLogDeposit={onLogDeposit}
        />
      </ModuleBoundary>

      {editing && (
        <BudgetEditor
          scope={scope}
          month={month}
          budgets={plan.budgets}
          categories={[
            ...(group.categories || []),
            ...expenses.map((e) => (e.category || '').trim()),
          ]}
          onSave={async (budgets: Budget[]) => {
            const ok = await onSave(scope, { ...plan, budgets });
            if (ok) setEditing(false);
            return ok;
          }}
          onClose={() => setEditing(false)}
        />
      )}

      {goalOpen && (
        <GoalSheet
          goal={goalOpen === 'new' ? null : goalOpen}
          scope={scope}
          funded={
            goalOpen === 'new'
              ? 0
              : (
                  goals.open.find((g) => g.goal.id === goalOpen.id) ??
                  goals.done.find((g) => g.goal.id === goalOpen.id)
                )?.funded || 0
          }
          locale={i18n.language}
          onSave={async (g) => {
            const exists = plan.goals.some((x) => x.id === g.id);
            const ok = await saveGoals(
              exists ? plan.goals.map((x) => (x.id === g.id ? g : x)) : [...plan.goals, g]
            );
            if (ok) setGoalOpen(null);
          }}
          onDelete={async (g) => {
            const ok = await saveGoals(plan.goals.filter((x) => x.id !== g.id));
            if (ok) setGoalOpen(null);
          }}
          onContribute={(g) => {
            setGoalOpen(null);
            onContribute(g);
          }}
          onClose={() => setGoalOpen(null)}
        />
      )}
    </div>
  );
}
