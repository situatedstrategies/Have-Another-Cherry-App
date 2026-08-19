import { Expense, Group } from '../types';
import { getRemainingSettlementAmount, getTotalRemainingOwedToPayer, isExpenseFullySettled, roundCurrency } from '../lib/money';
import { CreditCard, CheckCircle2, AlertCircle, TrendingUp } from 'lucide-react';

interface StatsSectionProps {
  expenses: Expense[];
  group: Group;
  activeUser: string;
  /**
   * 'band' - full-width row of three cards (default).
   * 'rail' - full-width band on phone/tablet-portrait, but a single stacked
   *           column once there's room for a side rail (lg+).
   */
  orientation?: 'band' | 'rail';
}

export default function StatsSection({ expenses, group, activeUser, orientation = 'band' }: StatsSectionProps) {
  let youOweAmount = 0;
  let othersOweYouAmount = 0;
  let youOweCount = 0;
  let othersOweYouCount = 0;
  let settledCount = 0;
  let settledTotalAmount = 0;
  // Amounts that have been logged as paid but not yet confirmed. The headline
  // balances are confirmed-only; these are surfaced separately so the cards
  // agree with the settle screen (which reserves pending payments).
  let youOwePending = 0;
  let othersOwePending = 0;

  expenses.forEach(exp => {
    const isFullySettled = isExpenseFullySettled(exp);

    if (exp.paidBy === activeUser) {
      const totalRemaining = getTotalRemainingOwedToPayer(exp, false);
      // Difference between confirmed-only and pending-inclusive = amount in-flight.
      othersOwePending = roundCurrency(othersOwePending + Math.max(0, totalRemaining - getTotalRemainingOwedToPayer(exp, true)));

      if (!isFullySettled && totalRemaining > 0.01) {
        othersOweYouCount++;
        othersOweYouAmount = roundCurrency(othersOweYouAmount + totalRemaining);
      }
    } else {
      const remainingForMe = getRemainingSettlementAmount(exp, activeUser, false);
      youOwePending = roundCurrency(youOwePending + Math.max(0, remainingForMe - getRemainingSettlementAmount(exp, activeUser, true)));

      if (!isFullySettled && remainingForMe > 0.01) {
        youOweCount++;
        youOweAmount = roundCurrency(youOweAmount + remainingForMe);
      }
    }

    if (isFullySettled) {
      settledCount++;
      // Count only what non-payer MEMBERS owed (the tracked, settleable debt).
      // Using amount - payerShare wrongly folded in guest / third-party portions
      // that are part of the amount but never actually settled to the payer.
      const memberDebt = Object.entries(exp.shares || {})
        .filter(([uid]) => uid !== exp.paidBy)
        .reduce((total, [, share]) => total + (Number(share) || 0), 0);
      settledTotalAmount = roundCurrency(settledTotalAmount + memberDebt);
    }
  });

  return (
    <div
      id="stats-container"
      className={
        orientation === 'rail'
          ? 'grid grid-cols-1 md:grid-cols-3 lg:grid-cols-1 gap-4'
          : 'grid grid-cols-1 md:grid-cols-3 gap-5 mb-8'
      }
    >
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
        {youOwePending > 0.01 && (
          <p className="text-[11px] text-amber-600 mt-1 font-medium">
            ${youOwePending.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} awaiting confirmation
          </p>
        )}
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
        {othersOwePending > 0.01 && (
          <p className="text-[11px] text-amber-600 mt-1 font-medium">
            ${othersOwePending.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} pending your confirmation
          </p>
        )}
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
