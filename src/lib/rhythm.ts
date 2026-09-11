// Anniversary / rhythm awareness: quiet pattern-spotting worth celebrating.
// Everything is derived locally from the ledger, no extra syncing.

import { Expense } from '../types';
import { isExpenseFullySettled } from './money';

const MS_DAY = 24 * 60 * 60 * 1000;

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export interface Rhythm {
  monthsTogether: number;
  settledCount: number;
  settledPct: number;
  medianSettleDays: number | null;
  /** Consecutive fully-settled calendar months, counting back from last month. */
  streakMonths: number;
  celebration: string | null;
}

export function computeRhythm(expenses: Expense[]): Rhythm | null {
  if (expenses.length < 5) return null;

  const withDates = expenses.filter((e) => e.createdAt);
  const firstAt = withDates.length
    ? Math.min(...withDates.map((e) => new Date(e.createdAt).getTime()))
    : null;
  const monthsTogether = firstAt
    ? Math.max(0, Math.floor((Date.now() - firstAt) / (30.44 * MS_DAY)))
    : 0;

  const settled = expenses.filter(isExpenseFullySettled);
  const settledPct = Math.round((settled.length / expenses.length) * 100);

  // Days from logging to the last confirmed settlement, per settled expense.
  const settleDays = settled
    .map((e) => {
      const confirmed = (e.settlements || []).filter((s) => s.status === 'confirmed');
      if (!confirmed.length || !e.createdAt) return null;
      const last = Math.max(...confirmed.map((s) => new Date(s.timestamp).getTime()));
      const created = new Date(e.createdAt).getTime();
      return last > created ? (last - created) / MS_DAY : 0;
    })
    .filter((d): d is number => d !== null);
  const medianSettleDays = median(settleDays);

  // Streak: walk back from last month; a month counts if it had expenses and
  // every one of them is settled today. (The current month is still in play,
  // so it neither extends nor breaks the streak.)
  const monthKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}`;
  const byMonth = new Map<string, Expense[]>();
  for (const e of withDates) {
    const key = monthKey(new Date(e.createdAt));
    (byMonth.get(key) || byMonth.set(key, []).get(key)!).push(e);
  }
  let streakMonths = 0;
  const cursor = new Date();
  cursor.setDate(1);
  for (let i = 0; i < 36; i++) {
    cursor.setMonth(cursor.getMonth() - 1);
    const monthExpenses = byMonth.get(monthKey(cursor));
    if (!monthExpenses || monthExpenses.length === 0) break;
    if (!monthExpenses.every(isExpenseFullySettled)) break;
    streakMonths++;
  }

  // One celebration at a time, most meaningful first.
  let celebration: string | null = null;
  if (monthsTogether > 0 && monthsTogether % 12 === 0) {
    const years = monthsTogether / 12;
    celebration = `Ledger anniversary - ${years} ${years === 1 ? 'year' : 'years'} of sharing. Have another cherry on us.`;
  } else if (monthsTogether > 0 && monthsTogether % 6 === 0) {
    celebration = `${monthsTogether} months of keeping this ledger.`;
  } else if (streakMonths >= 3) {
    celebration = `${streakMonths} straight months with everything settled. You're in rhythm.`;
  } else if ([25, 50, 100, 250, 500].includes(settled.length)) {
    celebration = `${settled.length} expenses settled. Sweet milestone.`;
  }

  return {
    monthsTogether,
    settledCount: settled.length,
    settledPct,
    medianSettleDays,
    streakMonths,
    celebration,
  };
}
