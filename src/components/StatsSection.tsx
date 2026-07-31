import { Expense, Group } from '../types';
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
    let settledByDebtor: Record<string, number> = {};
    let isFullySettled = exp.status === 'settled' || exp.status === 'CLOSED';
    
    if (exp.settlements) {
      exp.settlements.forEach(s => {
        if (s.status === 'confirmed') {
          settledByDebtor[s.paidBy] = (settledByDebtor[s.paidBy] || 0) + s.amount;
        }
      });
    }

    // Determine how much is owed to the payer by each person
    const myShare = exp.shares?.[activeUser] || 0;
    
    if (exp.paidBy === activeUser) {
      // You paid, others owe you the remainder
      let totalRemainder = 0;
      Object.entries(exp.shares || {}).forEach(([uid, share]) => {
        if (uid !== activeUser) {
          const paid = settledByDebtor[uid] || 0;
          const left = share - paid;
          if (left > 0.01 && !isFullySettled) {
            totalRemainder += left;
          }
        }
      });
      if (totalRemainder > 0.01) {
        othersOweYouCount++;
        othersOweYouAmount += totalRemainder;
      }
    } else {
      // Someone else paid, you owe your share minus what you've paid
      const paidByMe = settledByDebtor[activeUser] || 0;
      const leftToPay = myShare - paidByMe;
      if (leftToPay > 0.01 && !isFullySettled) {
        youOweCount++;
        youOweAmount += leftToPay;
      }
    }

    // For settled audit
    if (isFullySettled) {
      settledCount++;
      // If it's settled, the total amount that was settled is the original amount minus the payer's own share
      const payerShare = exp.shares?.[exp.paidBy] || 0;
      settledTotalAmount += (exp.amount - payerShare);
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
