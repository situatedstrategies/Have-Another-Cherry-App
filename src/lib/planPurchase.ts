// Plan a Purchase projection: who fronts it, how it splits, whether it is
// carried across months, and what that does to each person's net position.
// Port of the iOS planner (`lib/domain/ledger/splits.dart` and the
// `netNow`/`delta` logic in `plan_purchase_screen.dart`); change them
// together so both clients project the same purchase the same way.

import { Expense } from '../types';
import { roundCurrency, getRemainingSettlementAmount, isDarkCherry, isUnclaimed } from './money';

export type SplitMode = 'household' | 'even';

/** Per-member dollar shares from percentages, summing exactly to the
 *  amount; the rounding remainder goes to the payer (who is least likely
 *  to mind), or the first member when the payer has no share. */
export const sharesFromPercentages = (
  amount: number,
  percentages: Record<string, number>,
  paidBy: string
): Record<string, number> => {
  const shares: Record<string, number> = {};
  let allocated = 0;
  let totalPct = 0;
  for (const [uid, pct] of Object.entries(percentages)) {
    const share = roundCurrency((amount * pct) / 100);
    shares[uid] = share;
    allocated = roundCurrency(allocated + share);
    totalPct += pct;
  }
  const target = roundCurrency((amount * totalPct) / 100);
  const drift = roundCurrency(target - allocated);
  if (drift !== 0) {
    const keys = Object.keys(shares);
    const to = paidBy in shares ? paidBy : keys[0];
    if (to !== undefined) shares[to] = roundCurrency((shares[to] ?? 0) + drift);
  }
  return shares;
};

export const equalShares = (
  amount: number,
  memberIds: string[],
  paidBy: string
): Record<string, number> => {
  if (memberIds.length === 0) return {};
  const pct = 100 / memberIds.length;
  return sharesFromPercentages(
    amount,
    Object.fromEntries(memberIds.map((id) => [id, pct])),
    paidBy
  );
};

/** What a member owes today, net, before the purchase exists: everything
 *  they still owe on others' expenses minus everything still owed to them.
 *  Positive means they owe. Dark Cherry and unclaimed expenses carry no
 *  per-person shares and are skipped, as on iOS. */
export const netNow = (expenses: Expense[], member: string): number => {
  let owes = 0;
  for (const e of expenses) {
    if (isDarkCherry(e) || isUnclaimed(e)) continue;
    for (const uid of Object.keys(e.shares || {})) {
      if (uid === e.paidBy) continue;
      const remaining = getRemainingSettlementAmount(e, uid, true);
      if (remaining <= 0.01) continue;
      if (uid === member) owes += remaining;
      if (e.paidBy === member) owes -= remaining;
    }
  }
  return roundCurrency(owes);
};

/** What the purchase adds to a member's net: everyone except the payer moves
 *  into debt for their share; the payer is owed the others' shares. */
export const purchaseDelta = (
  shares: Record<string, number>,
  member: string,
  payer: string
): number => {
  if (member === payer) {
    const others = Object.entries(shares)
      .filter(([uid]) => uid !== payer)
      .reduce((t, [, v]) => t + v, 0);
    return roundCurrency(-others);
  }
  return roundCurrency(shares[member] ?? 0);
};

export const projectPurchase = (
  amount: number,
  split: Record<string, number>,
  mode: SplitMode,
  payer: string,
  months: number
): { shares: Record<string, number>; perMonth: Record<string, number> } => {
  const members = Object.keys(split);
  const divide = (value: number) =>
    mode === 'household'
      ? sharesFromPercentages(value, split, payer)
      : equalShares(value, members, payer);
  return { shares: divide(amount), perMonth: divide(roundCurrency(amount / months)) };
};
