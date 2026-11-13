// The house account: a shared account members pay into. A deposit is a ledger
// line of splitType 'deposit' whose paidBy is the depositor and whose shares
// are empty, so it stays encrypted, exportable and visible in the sheet, but is
// never owed to anyone and never counts as spending. This file turns those
// lines into the screen: each person's total against the agreed ratio, and a
// week by week or month by month grid per person. Pure over the expenses it is
// handed; mirrored in the Flutter app's domain/ledger/deposits.dart and checked
// by scripts/deposits-check.ts (`npm run test:parity`).
import { Expense } from '../types';
import { roundCurrency, isDeposit } from './money';
import { bucketOf, bucketsFor, Granularity } from './reports';

/** The deposits in a ledger, oldest first. */
export const depositsOf = (expenses: Expense[]): Expense[] =>
  expenses
    .filter((e) => isDeposit(e) && !!e.date && !!e.paidBy)
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));

export interface DepositRatioRow {
  uid: string;
  /** What this member has put in. */
  deposited: number;
  /** Their part of everything deposited, 0..1. */
  actual: number;
  /** The agreed part from the group's default split, 0..1. */
  agreed: number;
  /** What the agreed part of the total would be. */
  agreedAmount: number;
  /** deposited - agreedAmount: positive means ahead of the ratio. */
  difference: number;
}

export interface DepositSummary {
  total: number;
  count: number;
  rows: DepositRatioRow[];
}

/** Everyone's total against the agreed ratio. [defaultSplit] is uid ->
 *  percentage; members on the roster with nothing deposited still get a row,
 *  and a depositor missing from the split is shown against 0%. */
export const depositSummary = (
  expenses: Expense[],
  defaultSplit: Record<string, number>,
  memberIds: string[]
): DepositSummary => {
  const deposits = depositsOf(expenses);
  const byMember: Record<string, number> = {};
  let total = 0;
  for (const d of deposits) {
    byMember[d.paidBy] = roundCurrency((byMember[d.paidBy] ?? 0) + d.amount);
    total = roundCurrency(total + d.amount);
  }
  const ids = [...new Set([...memberIds.filter(Boolean), ...Object.keys(byMember)])];
  const rows = ids.map((uid) => {
    const deposited = byMember[uid] ?? 0;
    const agreed = Math.max(0, Number(defaultSplit[uid]) || 0) / 100;
    const agreedAmount = roundCurrency(total * agreed);
    return {
      uid,
      deposited,
      actual: total > 0 ? deposited / total : 0,
      agreed,
      agreedAmount,
      difference: roundCurrency(deposited - agreedAmount),
    };
  });
  return { total, count: deposits.length, rows };
};

export interface DepositGridRow {
  /** The bucket: a Monday for weeks, YYYY-MM for months. */
  bucket: string;
  cells: Record<string, number>;
  total: number;
}

export interface DepositGrid {
  members: string[];
  rows: DepositGridRow[];
  columnTotals: Record<string, number>;
  grandTotal: number;
}

/** Periods down, people across, totals both ways. Covers every bucket from
 *  the first deposit to the last (or to [through], when later) so quiet weeks
 *  show as zero. [only] narrows the grid to one depositor ("Just mine"). */
export const depositGrid = (
  expenses: Expense[],
  granularity: Exclude<Granularity, 'day'>,
  memberIds: string[],
  through?: string,
  only?: string
): DepositGrid => {
  const deposits = depositsOf(expenses).filter((d) => !only || d.paidBy === only);
  const members = only
    ? [only]
    : [...new Set([...memberIds.filter(Boolean), ...deposits.map((d) => d.paidBy)])];
  const columnTotals: Record<string, number> = {};
  for (const m of members) columnTotals[m] = 0;
  if (deposits.length === 0) return { members, rows: [], columnTotals, grandTotal: 0 };
  const first = deposits[0].date;
  let last = deposits[deposits.length - 1].date;
  if (through && through > last) last = through;
  const byBucket: Record<string, DepositGridRow> = {};
  let grandTotal = 0;
  for (const d of deposits) {
    const b = bucketOf(d.date, granularity);
    const row = (byBucket[b] ||= { bucket: b, cells: {}, total: 0 });
    row.cells[d.paidBy] = roundCurrency((row.cells[d.paidBy] ?? 0) + d.amount);
    row.total = roundCurrency(row.total + d.amount);
    columnTotals[d.paidBy] = roundCurrency((columnTotals[d.paidBy] ?? 0) + d.amount);
    grandTotal = roundCurrency(grandTotal + d.amount);
  }
  const rows = bucketsFor({ start: first, end: last }, granularity).map(
    (bucket) => byBucket[bucket] ?? { bucket, cells: {}, total: 0 }
  );
  return { members, rows, columnTotals, grandTotal };
};
