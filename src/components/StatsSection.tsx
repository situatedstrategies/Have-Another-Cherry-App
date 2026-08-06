import { Expense, Group } from '../types';
import { getRemainingSettlementAmount, getTotalRemainingOwedToPayer, isExpenseFullySettled, roundCurrency } from '../lib/money';
import { CreditCard, CheckCircle2, AlertCircle, TrendingUp } from 'lucide-react';

interface StatsSectionProps {
  expenses: Expense[];
  group: Group;
  activeUser: string;
}

export default function StatsSection({ expenses, group, activeUser }: StatsSectionProps) {
  let youOweAmount = 0;
  let othersOweYouAmount = 0;
  let youOweCount = 0;
  let othersOweYouCount = 0;
  let settledCount = 0;
  let settledTotalAmount = 0;

  expenses.forEach(exp => {
    const isFullySettled = isExpenseFullySettled(exp);

    if (exp.paidBy === activeUser) {
      const totalRemaining = getTotalRemainingOwedToPayer(exp, false);

      if (!isFullySettled && totalRemaining > 0.01) {
        othersOweYouCount++;
        othersOweYouAmount = roundCurrency(othersOweYouAmount + totalRemaining);
      }
    } else {
      const remainingForMe = getRemainingSettlementAmount(exp, activeUser, false);

      if (!isFullySettled && remainingForMe > 0.01) {
        youOweCount++;
        youOweAmount = roundCurrency(youOweAmount + remainingForMe);
      }
    }

    if (isFullySettled) {
      settledCount++;
      const payerShare = exp.shares?.[exp.paidBy] || 0;
      settledTotalAmount = roundCurrency(
        settledTotalAmount + Math.max(0, exp.amount - payerShare)
      );
    }
  });

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8" id="stats-container">
      {/* You owe */}
      <div className="bg-white rounded-3xl border border-natural-border p-6 shadow-sm hover:shadow-md transition-all duration-200" id="stat-card-you-owe">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-bold uppercase tracking-wider text-natural-muted">You Owe</span>
          <div className="p-2.5 bg-natural-sidebar text-natural-text rounded-2xl">
            <CreditCard className="h-5 w-5" />
          </div>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-display font-bold text-natural-text">
            ${youOweAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>
        <p className="text-xs text-natural-muted mt-2 font-mono">
          Across {youOweCount} individual {youOweCount === 1 ? 'item' : 'items'}
        </p>
      </div>

      {/* Others owe you */}
      <div className="bg-white rounded-3xl border border-natural-border p-6 shadow-sm hover:shadow-md transition-all duration-200" id="stat-card-others-owe">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-bold uppercase tracking-wider text-natural-muted">Others Owe You</span>
          <div className="p-2.5 bg-natural-sage text-natural-primary rounded-2xl">
            <TrendingUp className="h-5 w-5" />
          </div>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-display font-bold text-natural-text">
            ${othersOweYouAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>
        <p className="text-xs text-natural-text mt-2 font-mono">
          Across {othersOweYouCount} individual {othersOweYouCount === 1 ? 'item' : 'items'}
        </p>
      </div>

      {/* Settled Audit Summary */}
      <div className="bg-natural-sidebar rounded-3xl border border-natural-border p-6 shadow-sm hover:shadow-md transition-all duration-200" id="stat-card-settled">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-bold uppercase tracking-wider text-natural-muted">Fully Settled Items</span>
          <div className="p-2.5 bg-white text-natural-primary rounded-2xl border border-natural-border">
            <CheckCircle2 className="h-5 w-5" />
          </div>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-display font-bold text-natural-primary">
            {settledCount}
          </span>
          <span className="text-sm text-natural-muted font-medium">items</span>
        </div>
        <p className="text-xs text-natural-muted mt-2 font-mono">
          Total settled spend: ${settledTotalAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </p>
      </div>
    </div>
  );
}
