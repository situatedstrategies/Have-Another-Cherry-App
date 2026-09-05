import { Expense } from '../types';

export const roundCurrency = (value: number): number =>
  Math.round((value + Number.EPSILON) * 100) / 100;

// Dark Cherry: the blind split. No per-person shares - everyone contributes
// what they can (within the per-payment bounds) until the pot reaches the
// expense amount. Participants never see the total or the remainder.
/**
 * An expense nobody has claimed as payer yet.
 *
 * Recurring instances are spawned unclaimed rather than inheriting the payer
 * from their definition: who paid the internet bill in March is a fact about
 * March, not about whoever set the bill up a year ago.
 *
 * An unclaimed expense is real and visible, but it is not a debt. You cannot
 * owe someone who has not been identified, so everything that computes money
 * skips it until someone claims it. Mirrors isUnclaimed in the Flutter
 * client's domain/ledger/money.dart.
 */
export const isUnclaimed = (expense: Expense): boolean =>
  !(expense.paidBy || '').trim();

export const isDarkCherry = (expense: Expense): boolean =>
  expense.splitType === 'dark_cherry';

export const getDarkCherryPotTotal = (
  expense: Expense,
  includePending = true
): number =>
  roundCurrency(
    (expense.settlements || [])
      .filter(
        s =>
          s.status !== 'voided' &&
          (includePending || s.status === 'confirmed')
      )
      .reduce((total, s) => total + s.amount, 0)
  );

export const getDarkCherryRemaining = (
  expense: Expense,
  includePending = true
): number =>
  Math.max(
    0,
    roundCurrency(expense.amount - getDarkCherryPotTotal(expense, includePending))
  );

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
          settlement.status !== 'voided' &&
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
  // Dark Cherry: settled when confirmed contributions cover the pot target.
  if (isDarkCherry(expense)) {
    return getDarkCherryRemaining(expense, false) <= 0.01;
  }

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
  // Nobody has claimed it, so nothing is owed to anybody. Without this the
  // filter below keeps every share, since none of them equal an empty payer,
  // and the whole expense is reported as owed to a person who does not exist.
  isUnclaimed(expense) ? 0 :
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
  // Not "Open": nothing is owed and nothing can be settled until someone
  // claims it, so it does not belong in the same bucket as a real debt.
  if (isUnclaimed(expense)) return 'Needs a payer';

  const status = getNormalizedExpenseStatus(expense);

  if (status === 'CLOSED') return 'Fully Settled';
  if (status === 'PARTIALLY_SETTLED') return 'Partially Settled';

  return 'Open';
};
