import { Expense, Settlement, Credit } from '../types';

/**
 * Open-Item Accounting Business Logic
 * 
 * In this model:
 * - Every Expense is an independent transaction.
 * - Settlements are tied to a specific Expense (foreign key: expenseId) and can be partial or multiple.
 * - Aggregate balances are computed dynamically as the sum of open shares on open expenses, rather than a stored ledger.
 * - Overpayments generate isolated Credit objects.
 */

export function getExpenseSettlementStatus(expense: Expense, userId: string): { 
  amountOwedByMe: number, 
  amountSettledByMe: number, 
  status: 'OPEN' | 'PARTIALLY_SETTLED' | 'CLOSED' 
} {
  const myShare = expense.shares[userId] || 0;
  
  // What did I contribute originally?
  const myContributions = expense.contributions
    ? expense.contributions.filter(c => c.userId === userId).reduce((sum, c) => sum + c.amount, 0)
    : (expense.paidBy === userId ? expense.amount : 0); // fallback to legacy
  
  // My net obligation for this specific expense
  const netOwed = Math.max(0, myShare - myContributions);
  
  if (netOwed <= 0) {
    return { amountOwedByMe: 0, amountSettledByMe: 0, status: 'CLOSED' };
  }

  // Calculate how much I have settled towards this transaction
  const mySettlements = expense.settlements?.filter(s => s.paidBy === userId && s.status === 'confirmed') || [];
  
  // Check legacy settleDetails if no new settlements exist
  let amountSettledByMe = mySettlements.reduce((sum, s) => sum + s.amount, 0);
  if (amountSettledByMe === 0 && expense.settleDetails?.paidBy === userId && expense.status === 'settled') {
    amountSettledByMe = expense.settleDetails.amount;
  }
  
  let status: 'OPEN' | 'PARTIALLY_SETTLED' | 'CLOSED' = 'OPEN';
  if (amountSettledByMe >= netOwed) {
    status = 'CLOSED';
  } else if (amountSettledByMe > 0) {
    status = 'PARTIALLY_SETTLED';
  }

  return { amountOwedByMe: netOwed, amountSettledByMe, status };
}

export function getAllPendingSettlements(expense: Expense): Settlement[] {
  return expense.settlements?.filter(s => s.status === 'pending') || [];
}

/**
 * Calculates overpayment if a settlement amount exceeds the remaining open balance.
 * Returns a new Credit record if applicable, which can be stored and allocated later.
 */
export function handleOverpayment(expense: Expense, settlementAmount: number, userId: string): Credit | null {
  const { amountOwedByMe, amountSettledByMe } = getExpenseSettlementStatus(expense, userId);
  const totalPaid = amountSettledByMe + settlementAmount;
  
  if (totalPaid > amountOwedByMe) {
    const excess = totalPaid - amountOwedByMe;
    return {
      id: crypto.randomUUID(),
      groupId: expense.groupId,
      userId: userId,
      amount: excess,
      timestamp: new Date().toISOString(),
      notes: `Overpayment on expense: ${expense.title}`
    };
  }
  return null;
}
