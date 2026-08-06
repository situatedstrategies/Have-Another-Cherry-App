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
  if (expense.status === 'settled' || expense.status === 'CLOSED') {
    return true;
  }

  const debtors = Object.keys(expense.shares || {}).filter(
    userId => userId !== expense.paidBy
  );

  return (
    debtors.length > 0 &&
    debtors.every(
      userId => getRemainingSettlementAmount(expense, userId, false) <= 0.01
    )
  );
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
