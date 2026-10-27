// My month ahead: one member's share of the shared life for a calendar month,
// worked out from what the ledger already holds. Three sources, all of them
// already recorded: expenses dated in the month, recurring definitions whose
// cycles fall in the month but have not been logged yet, and open shares from
// earlier months that are still owed. No bank link, no suggested limit, and
// nothing here is advice: it is the household's own numbers arranged by date,
// so a person can plan their own account around them.
//
// Cherry + only. The mobile client has no counterpart yet; when it gets one,
// mirror this file and scripts/forecast-check.ts the way insights.dart does.

import { Expense } from '../types';
import { roundCurrency, isDarkCherry, isUnclaimed, getRemainingSettlementAmount } from './money';
import { recurringDaysInMonth, toLocalIso } from './recurring';

export interface ForecastItem {
  /** The expense id, or `${sourceId}@${date}` for a cycle not yet logged. */
  id: string;
  title: string;
  date: string; // YYYY-MM-DD
  category: string;
  /** This member's share of the item. */
  share: number;
  /** 'logged' is in the ledger; 'projected' is a recurring cycle still to come. */
  kind: 'logged' | 'projected';
  /** Logged and nothing left for this member to pay on it. */
  paid: boolean;
  /** This member fronted it, so their share went out when it was logged. */
  frontedByMe: boolean;
}

export interface MonthForecast {
  year: number;
  monthIndex: number;
  /** Every item with a share for this member, by date. */
  items: ForecastItem[];
  /** Shares on expenses dated in the month. */
  loggedShare: number;
  /** Shares on recurring cycles from today onward that are not logged yet. */
  projectedShare: number;
  /** loggedShare + projectedShare: the member's share of the whole month. */
  total: number;
  /** What has not left this member's pocket yet: unpaid logged shares plus
   *  everything projected. Pending payments count as paid, since the money
   *  is gone from the payer's side. */
  leftToPay: number;
  /** Shares this member still owes on expenses dated before the month began. */
  carriedIn: number;
}

const monthKey = (iso: string): string => iso.slice(0, 7);

const pad = (n: number) => String(n).padStart(2, '0');

/** YYYY-MM for a month. */
export const monthIso = (year: number, monthIndex: number): string =>
  `${year}-${pad(monthIndex + 1)}`;

/** Recurring definitions are expenses too (the first cycle is the definition
 *  itself), so they count as logged on their own date and project from there. */
const isDefinition = (e: Expense): boolean => !!e.isRecurring && !!e.recurringInterval && !!e.date;

export function forecastMonth(
  expenses: Expense[],
  member: string,
  year: number,
  monthIndex: number,
  today: string = toLocalIso(new Date())
): MonthForecast {
  const key = monthIso(year, monthIndex);
  const items: ForecastItem[] = [];
  let loggedShare = 0;
  let projectedShare = 0;
  let leftToPay = 0;
  let carriedIn = 0;

  // Dark Cherry pots carry no per-person share by design, so they stay out.
  const visible = expenses.filter((e) => !isDarkCherry(e));

  for (const e of visible) {
    const share = roundCurrency(e.shares?.[member] ?? 0);
    if (share <= 0) continue;
    const frontedByMe = e.paidBy === member;
    // Unclaimed: nobody has paid it yet, so the whole share is still to come.
    const remaining = isUnclaimed(e)
      ? share
      : frontedByMe
        ? 0
        : getRemainingSettlementAmount(e, member, true);

    if (monthKey(e.date) === key) {
      loggedShare = roundCurrency(loggedShare + share);
      leftToPay = roundCurrency(leftToPay + remaining);
      items.push({
        id: e.id,
        title: e.title,
        date: e.date,
        category: e.category,
        share,
        kind: 'logged',
        paid: remaining <= 0.01,
        frontedByMe,
      });
    } else if (e.date < key && remaining > 0.01) {
      carriedIn = roundCurrency(carriedIn + remaining);
    }
  }

  // Cycles the autopilot has not materialised yet. Only from today forward: a
  // past cycle with no instance means the payer has not opened the app, and
  // guessing at it would double count once they do.
  for (const def of visible) {
    if (!isDefinition(def)) continue;
    const share = roundCurrency(def.shares?.[member] ?? 0);
    if (share <= 0) continue;
    for (const day of recurringDaysInMonth(def, year, monthIndex)) {
      const date = `${key}-${pad(day)}`;
      if (date < today) continue;
      if (date === def.date) continue;
      const logged = expenses.some((x) => x.recurringSourceId === def.id && x.date === date);
      if (logged) continue;
      projectedShare = roundCurrency(projectedShare + share);
      leftToPay = roundCurrency(leftToPay + share);
      items.push({
        id: `${def.id}@${date}`,
        title: def.title,
        date,
        category: def.category,
        share,
        kind: 'projected',
        paid: false,
        frontedByMe: false,
      });
    }
  }

  items.sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : a.title.localeCompare(b.title)
  );

  return {
    year,
    monthIndex,
    items,
    loggedShare,
    projectedShare,
    total: roundCurrency(loggedShare + projectedShare),
    leftToPay,
    carriedIn,
  };
}
