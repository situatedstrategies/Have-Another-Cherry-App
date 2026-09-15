// Cherry Pick: the unsettled items as a deck. Port of the iOS
// `orchard_mode_screen.dart` queue rules; change them together.

import { Expense } from '../types';
import {
  getDarkCherryRemaining,
  getNormalizedExpenseStatus,
  getRemainingSettlementAmount,
  isDarkCherry,
  isUnclaimed,
} from './money';

/** Matches isExpenseFullySettled. A tighter tolerance would surface
 *  sub-cent remainders the rest of the app already counts as settled. */
export const ORCHARD_SETTLED_TOLERANCE = 0.01;

/** What `uid` still owes on `e`. The payer owes nothing: they fronted the
 *  money, and everyone else's share is owed to them. */
export const outstandingFor = (e: Expense, uid: string): number => {
  if (e.paidBy === uid) return 0;
  return isDarkCherry(e) ? getDarkCherryRemaining(e) : getRemainingSettlementAmount(e, uid);
};

/** Everything the signed-in user still owes on, oldest first. Unclaimed
 *  recurring instances have no payer, so there is nobody to settle with. */
export const orchardQueue = (expenses: Expense[], uid: string): Expense[] =>
  expenses
    .filter(
      (e) =>
        !isUnclaimed(e) &&
        getNormalizedExpenseStatus(e) !== 'CLOSED' &&
        outstandingFor(e, uid) > ORCHARD_SETTLED_TOLERANCE
    )
    .sort((a, b) => a.date.localeCompare(b.date));

/** The deck keeps anything already handled this session so a page never
 *  vanishes mid-swipe, and never re-orders under the user's finger. */
export const orchardDeck = (expenses: Expense[], uid: string, handled: Set<string>): Expense[] => {
  const live = new Set(orchardQueue(expenses, uid).map((e) => e.id));
  return expenses
    .filter((e) => live.has(e.id) || handled.has(e.id))
    .sort((a, b) => a.date.localeCompare(b.date));
};
