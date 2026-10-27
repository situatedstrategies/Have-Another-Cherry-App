// Who's carrying what: for each member, the money they fronted for the
// household that has not come back yet, split by how they fronted it. A card
// balance someone is floating until payday is a different favour from cash
// already gone from their account, and the ledger knows which it was because
// `contributions[].instrumentType` is recorded on every expense. Turning that
// field from a record into a running position is what this file does.
//
// Outstanding amounts count confirmed payments only, like the Balances cards:
// money is not back in the fronter's account until they say it arrived.
// Cherry + only. No mobile counterpart yet; when one lands, mirror this file
// and scripts/carrying-check.ts.

import { Expense } from '../types';
import { roundCurrency, isDarkCherry, isUnclaimed, getTotalRemainingOwedToPayer } from './money';
import { getInstrumentClass } from './mismatch';
import { instrumentOf, UNKNOWN_INSTRUMENT } from './insights';
import { parseLocalDate } from './recurring';

export interface MemberCarrying {
  uid: string;
  /** Outstanding on expenses this member fronted on credit. */
  onCredit: number;
  onCreditCount: number;
  /** Outstanding on expenses fronted with money already gone: cash, debit,
   *  a transfer, Venmo or Zelle. */
  fromOwnMoney: number;
  fromOwnMoneyCount: number;
  /** Outstanding where the instrument was 'OTHER' or never recorded. */
  unknown: number;
  /** Days the oldest still-open credit-fronted expense has been carried. */
  oldestCreditDays: number | null;
  /** Everything outstanding to this member, whatever the instrument. */
  total: number;
}

const MS_DAY = 86400000;

const daysBetween = (fromIso: string, today: string): number | null => {
  const from = parseLocalDate(fromIso).getTime();
  const to = parseLocalDate(today).getTime();
  if (Number.isNaN(from) || Number.isNaN(to)) return null;
  return Math.max(0, Math.round((to - from) / MS_DAY));
};

/** Every member who fronted something that is still outstanding, most
 *  carried on credit first. Members with nothing open are left out. */
export function computeCarrying(expenses: Expense[], today: string): MemberCarrying[] {
  const rows: Record<string, MemberCarrying> = {};

  for (const e of expenses) {
    // No payer means nobody is carrying it; a Dark Cherry pot hides its total.
    if (isUnclaimed(e) || isDarkCherry(e)) continue;
    const outstanding = getTotalRemainingOwedToPayer(e, false);
    if (outstanding <= 0.01) continue;

    const row = (rows[e.paidBy] ??= {
      uid: e.paidBy,
      onCredit: 0,
      onCreditCount: 0,
      fromOwnMoney: 0,
      fromOwnMoneyCount: 0,
      unknown: 0,
      oldestCreditDays: null,
      total: 0,
    });
    row.total = roundCurrency(row.total + outstanding);

    const instrument = instrumentOf(e);
    const cls =
      instrument === UNKNOWN_INSTRUMENT
        ? null
        : getInstrumentClass(instrument as Parameters<typeof getInstrumentClass>[0]);
    if (cls === 'DEFERRED') {
      row.onCredit = roundCurrency(row.onCredit + outstanding);
      row.onCreditCount++;
      const age = daysBetween(e.date, today);
      if (age !== null && (row.oldestCreditDays === null || age > row.oldestCreditDays)) {
        row.oldestCreditDays = age;
      }
    } else if (cls === 'IMMEDIATE') {
      row.fromOwnMoney = roundCurrency(row.fromOwnMoney + outstanding);
      row.fromOwnMoneyCount++;
    } else {
      row.unknown = roundCurrency(row.unknown + outstanding);
    }
  }

  return Object.values(rows).sort((a, b) =>
    b.onCredit !== a.onCredit ? b.onCredit - a.onCredit : b.total - a.total
  );
}

/** The household's whole open credit position: how much is on cards right
 *  now, and the longest anyone has carried one. */
export function householdCredit(rows: MemberCarrying[]): {
  onCredit: number;
  longestDays: number | null;
} {
  let onCredit = 0;
  let longestDays: number | null = null;
  for (const r of rows) {
    onCredit = roundCurrency(onCredit + r.onCredit);
    if (r.oldestCreditDays !== null && (longestDays === null || r.oldestCreditDays > longestDays)) {
      longestDays = r.oldestCreditDays;
    }
  }
  return { onCredit, longestDays };
}
