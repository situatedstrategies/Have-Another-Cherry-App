// Insights: what the ledger knows once you stop asking "how much" and start
// asking "how, who, and how long". Port of the iOS
// `lib/domain/ledger/insights.dart`; change them together.
//
// Every figure comes from data the app already records. Two fields do the
// heavy lifting: `contributions[].instrumentType` (how the payer fronted the
// money) and `settlements[].instrumentType` (how they were paid back).

import { Expense } from '../types';
import { roundCurrency, isExpenseFullySettled, isUnclaimed } from './money';

// Venmo's instant transfer fee, as a fraction, with its floor and ceiling.
// Published by Venmo and subject to change, so it lives in one place and
// everything derived from it is labelled an estimate.
export const VENMO_INSTANT_FEE_RATE = 0.0175;
export const VENMO_INSTANT_FEE_MIN = 0.25;
export const VENMO_INSTANT_FEE_MAX = 25;

export const venmoInstantFee = (amount: number): number => {
  if (amount <= 0) return 0;
  const raw = amount * VENMO_INSTANT_FEE_RATE;
  if (raw < VENMO_INSTANT_FEE_MIN) return VENMO_INSTANT_FEE_MIN;
  if (raw > VENMO_INSTANT_FEE_MAX) return VENMO_INSTANT_FEE_MAX;
  return roundCurrency(raw);
};

/** Expenses logged before payment type existed have no contribution; those
 *  are reported as unknown rather than folded into "other". */
export const UNKNOWN_INSTRUMENT = 'UNKNOWN';

export const instrumentOf = (expense: Expense): string => {
  const c = (expense.contributions || []).find((x) => x.userId === expense.paidBy);
  const type = (c?.instrumentType || '').trim();
  return type === '' ? UNKNOWN_INSTRUMENT : type;
};

/** Total spend by how it was paid. */
export const spendByInstrument = (expenses: Expense[]): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const e of expenses) {
    if (e.isRecurring) continue;
    const k = instrumentOf(e);
    out[k] = roundCurrency((out[k] ?? 0) + e.amount);
  }
  return out;
};

/** Who fronted how much on credit. Floating the household on a card is a
 *  real cost to one person that an even split hides entirely. */
export const creditFrontedBy = (expenses: Expense[]): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const e of expenses) {
    if (e.isRecurring) continue;
    if (instrumentOf(e) !== 'CREDIT') continue;
    out[e.paidBy] = roundCurrency((out[e.paidBy] ?? 0) + e.amount);
  }
  return out;
};

const dayOf = (iso: string): number | null => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
};

/** Days from the expense date to the day it was fully settled. Null while
 *  anything is outstanding or a date is missing. */
export const daysToSettle = (expense: Expense): number | null => {
  if (!isExpenseFullySettled(expense)) return null;
  const start = dayOf(expense.date);
  if (start === null) return null;
  let last: number | null = null;
  for (const s of expense.settlements || []) {
    if (s.status === 'voided') continue;
    const at = dayOf(s.paymentDate || s.timestamp);
    if (at === null) continue;
    if (last === null || at > last) last = at;
  }
  if (last === null) return null;
  const days = Math.round((last - start) / 86400000);
  return days < 0 ? 0 : days;
};

/** Median rather than mean: one expense that sat unsettled for a year would
 *  drag an average somewhere that describes no actual month. */
export const medianDaysToSettle = (expenses: Expense[]): number | null => {
  const days = expenses
    .map(daysToSettle)
    .filter((d): d is number => d !== null)
    .sort((a, b) => a - b);
  if (days.length === 0) return null;
  const mid = Math.floor(days.length / 2);
  return days.length % 2 === 1 ? days[mid] : Math.round((days[mid - 1] + days[mid]) / 2);
};

export interface CategoryTrend {
  category: string;
  total: number;
  /** Null when nothing in this category has fully settled yet. */
  medianDays: number | null;
  /** uid -> that person's share of this category. */
  perPerson: Record<string, number>;
}

const categoryName = (e: Expense) =>
  (e.category || '').trim() === '' ? 'Uncategorised' : e.category;

export const categoryTrends = (expenses: Expense[]): CategoryTrend[] => {
  const byCategory: Record<string, Expense[]> = {};
  for (const e of expenses) {
    if (e.isRecurring) continue;
    (byCategory[categoryName(e)] ??= []).push(e);
  }
  const out: CategoryTrend[] = Object.entries(byCategory).map(([category, items]) => {
    const perPerson: Record<string, number> = {};
    for (const e of items) {
      for (const [uid, share] of Object.entries(e.shares || {})) {
        perPerson[uid] = roundCurrency((perPerson[uid] ?? 0) + share);
      }
    }
    return {
      category,
      total: roundCurrency(items.reduce((t, e) => t + e.amount, 0)),
      medianDays: medianDaysToSettle(items),
      perPerson,
    };
  });
  out.sort((a, b) => b.total - a.total);
  return out;
};

/** Net lending by category: what each person fronted minus what was theirs
 *  to pay. Positive means they carried the household in that category. */
export const categoryLending = (expenses: Expense[]): Record<string, Record<string, number>> => {
  const out: Record<string, Record<string, number>> = {};
  for (const e of expenses) {
    if (e.isRecurring) continue;
    if (isUnclaimed(e)) continue;
    const row = (out[categoryName(e)] ??= {});
    const ownShare = e.shares?.[e.paidBy] ?? 0;
    row[e.paidBy] = roundCurrency((row[e.paidBy] ?? 0) + e.amount - ownShare);
    for (const [uid, share] of Object.entries(e.shares || {})) {
      if (uid === e.paidBy) continue;
      row[uid] = roundCurrency((row[uid] ?? 0) - share);
    }
  }
  return out;
};

export interface VenmoFeeEstimate {
  settlementCount: number;
  transferred: number;
  estimatedFees: number;
}

/** Every settlement taken through Venmo, and what instant transfer would
 *  have cost on it. */
export const venmoFees = (expenses: Expense[]): VenmoFeeEstimate => {
  let count = 0;
  let total = 0;
  let fees = 0;
  for (const e of expenses) {
    for (const s of e.settlements || []) {
      if (s.status === 'voided') continue;
      if ((s.instrumentType || '').toUpperCase() !== 'VENMO') continue;
      count++;
      total = roundCurrency(total + s.amount);
      fees = roundCurrency(fees + venmoInstantFee(s.amount));
    }
  }
  return { settlementCount: count, transferred: total, estimatedFees: fees };
};
