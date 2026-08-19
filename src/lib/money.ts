import { Expense } from '../types';

export const roundCurrency = (value: number): number =>
  Math.round((value + Number.EPSILON) * 100) / 100;

export const getSettlementTotal = (
  expense: Expense,
  userId: string,
  includePending = true
): number =>
  roundCurrency(
    (expense.settlements || [])
      .filter(
        settlement =>
          settlement.paidBy === userId &&
          (includePending || settlement.status === 'confirmed')
      )
      .reduce((total, settlement) => total + settlement.amount, 0)
  );

export const getRemainingSettlementAmount = (
  expense: Expense,
  userId: string,
  includePending = true
): number => {
  const share = roundCurrency(expense.shares?.[userId] || 0);
  const settled = getSettlementTotal(expense, userId, includePending);

  return Math.max(0, roundCurrency(share - settled));
};

export const isExpenseFullySettled = (expense: Expense): boolean => {
  const debtors = Object.keys(expense.shares || {}).filter(
    userId => userId !== expense.paidBy
  );

  // Modern records: the share/settlement math is the single source of truth.
  // We deliberately do NOT trust a stored 'settled'/'CLOSED' flag here, because
  // an edit that changes the shares can leave that flag stale and hide real debt.
  if (debtors.length > 0) {
    return debtors.every(
      userId => getRemainingSettlementAmount(expense, userId, false) <= 0.01
    );
  }

  // Legacy / no-debtor records (old settleDetails-only rows, or an expense with
  // only the payer and nothing owed): fall back to the stored status flag.
  return expense.status === 'settled' || expense.status === 'CLOSED';
};

export const getTotalRemainingOwedToPayer = (
  expense: Expense,
  includePending = false
): number =>
  roundCurrency(
    Object.entries(expense.shares || {})
      .filter(([userId]) => userId !== expense.paidBy)
      .reduce(
        (total, [userId]) =>
          total +
          getRemainingSettlementAmount(expense, userId, includePending),
        0
      )
  );

export type NormalizedExpenseStatus =
  | 'OPEN'
  | 'PARTIALLY_SETTLED'
  | 'CLOSED';

export const getNormalizedExpenseStatus = (
  expense: Expense
): NormalizedExpenseStatus => {
  if (isExpenseFullySettled(expense)) {
    return 'CLOSED';
  }

  const hasConfirmedSettlement = (expense.settlements || []).some(
    settlement => settlement.status === 'confirmed'
  );

  const hasPendingSettlement = (expense.settlements || []).some(
    settlement => settlement.status === 'pending'
  );

  if (
    hasConfirmedSettlement ||
    hasPendingSettlement ||
    expense.status === 'PARTIALLY_SETTLED' ||
    expense.status === 'pending_confirmation'
  ) {
    return 'PARTIALLY_SETTLED';
  }

  return 'OPEN';
};

export const getExpenseStatusLabel = (expense: Expense): string => {
  const status = getNormalizedExpenseStatus(expense);

  if (status === 'CLOSED') return 'Fully Settled';
  if (status === 'PARTIALLY_SETTLED') return 'Partially Settled';

  return 'Open';
};
