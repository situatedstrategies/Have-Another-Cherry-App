import { Expense } from '../types';
import { getRemainingSettlementAmount, roundCurrency } from './money';

// Net balance between the active user and one other member, from the ledger.
export function computeNetBetween(expenses: Expense[], activeUser: string, otherUid: string) {
  let theyOweYou = 0;
  let youOweThem = 0;
  expenses.forEach((e) => {
    if (e.paidBy === activeUser) {
      theyOweYou += getRemainingSettlementAmount(e, otherUid, false);
    } else if (e.paidBy === otherUid) {
      youOweThem += getRemainingSettlementAmount(e, activeUser, false);
    }
  });
  theyOweYou = roundCurrency(theyOweYou);
  youOweThem = roundCurrency(youOweThem);
  return { theyOweYou, youOweThem, net: roundCurrency(theyOweYou - youOweThem) };
}
