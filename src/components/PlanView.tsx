import { useTranslation } from 'react-i18next';
import { TrendingUp, ArrowRight } from 'lucide-react';
import { Expense, Group } from '../types';
import HouseAccount from './HouseAccount';
import ModuleBoundary from './ModuleBoundary';
import { panel, label, PageHeader } from './Controls';

interface Props {
  expenses: Expense[];
  group: Group;
  activeUser: string;
  members: { uid: string; name?: string }[];
  onPlanPurchase: () => void;
  onLogDeposit: () => void;
}

/**
 * Plan: the purchase planner (the existing modal) and the house account.
 * Budgets and goals land here in phase 2.
 */
export default function PlanView({
  expenses,
  group,
  activeUser,
  members,
  onPlanPurchase,
  onLogDeposit,
}: Props) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-5" id="plan-view">
      <PageHeader title={t('nav.plan')} subtitle={t('planView.subtitle')} />

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
    </div>
  );
}
