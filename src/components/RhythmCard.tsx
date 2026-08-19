import React, { useMemo } from 'react';
import { Expense } from '../types';
import { isExpenseFullySettled } from '../lib/money';
import { HeartHandshake, Cherry, Sparkles } from 'lucide-react';

// Anniversary / rhythm awareness: quiet pattern-spotting worth celebrating.
// Everything is derived locally from the ledger - no extra syncing.

const MS_DAY = 24 * 60 * 60 * 1000;

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

interface Rhythm {
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

  const withDates = expenses.filter(e => e.createdAt);
  const firstAt = withDates.length
    ? Math.min(...withDates.map(e => new Date(e.createdAt).getTime()))
    : null;
  const monthsTogether = firstAt
    ? Math.max(0, Math.floor((Date.now() - firstAt) / (30.44 * MS_DAY)))
    : 0;

  const settled = expenses.filter(isExpenseFullySettled);
  const settledPct = Math.round((settled.length / expenses.length) * 100);

  // Days from logging to the last confirmed settlement, per settled expense.
  const settleDays = settled
    .map(e => {
      const confirmed = (e.settlements || []).filter(s => s.status === 'confirmed');
      if (!confirmed.length || !e.createdAt) return null;
      const last = Math.max(...confirmed.map(s => new Date(s.timestamp).getTime()));
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
    celebration = `${monthsTogether} months of sharing this ledger together.`;
  } else if (streakMonths >= 3) {
    celebration = `${streakMonths} straight months with everything settled. You two are in rhythm.`;
  } else if ([25, 50, 100, 250, 500].includes(settled.length)) {
    celebration = `${settled.length} expenses settled together - sweet milestone.`;
  }

  return { monthsTogether, settledCount: settled.length, settledPct, medianSettleDays, streakMonths, celebration };
}

interface RhythmCardProps {
  expenses: Expense[];
  /** Cherry + gate: render a teaser that opens the coming-soon page. */
  locked?: boolean;
  onUnlock?: () => void;
}

export default function RhythmCard({ expenses, locked, onUnlock }: RhythmCardProps) {
  const rhythm = useMemo(() => (locked ? null : computeRhythm(expenses)), [expenses, locked]);

  if (locked) {
    return (
      <button
        onClick={onUnlock}
        className="w-full text-left bg-white border border-natural-border rounded-3xl p-5 shadow-sm space-y-3 hover:border-natural-primary/40 transition-colors cursor-pointer"
        id="rhythm-card-locked"
      >
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold text-natural-muted uppercase tracking-widest flex items-center gap-1.5">
            <HeartHandshake className="h-3.5 w-3.5 text-natural-primary" /> Your Rhythm
          </h3>
          <span className="text-[9px] font-bold tracking-wider text-white bg-natural-dark px-1.5 py-0.5 rounded-md">Cherry +</span>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center" aria-hidden="true">
          {['Settled', 'Days to settle', 'Month streak'].map(label => (
            <div key={label} className="bg-natural-bg/50 rounded-xl p-2 border border-natural-border/50">
              <span className="block text-lg font-display font-bold text-natural-border select-none">···</span>
              <span className="block text-[10px] font-semibold text-natural-muted uppercase">{label}</span>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-natural-muted flex items-center gap-1.5">
          <Sparkles className="h-3 w-3 shrink-0" /> Settle streaks, anniversaries, and milestones - with Cherry +.
        </p>
      </button>
    );
  }

  if (!rhythm) return null;

  return (
    <div className="bg-white border border-natural-border rounded-3xl p-5 shadow-sm space-y-3" id="rhythm-card">
      <h3 className="text-xs font-bold text-natural-muted uppercase tracking-widest flex items-center gap-1.5">
        <HeartHandshake className="h-3.5 w-3.5 text-natural-primary" /> Your Rhythm
      </h3>

      {rhythm.celebration && (
        <div className="bg-natural-sage/30 border border-natural-primary/20 rounded-xl p-3 flex items-start gap-2 animate-in fade-in">
          <Cherry className="h-4 w-4 text-natural-primary shrink-0 mt-0.5" />
          <p className="text-xs font-semibold text-natural-text leading-relaxed">{rhythm.celebration}</p>
        </div>
      )}

      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="bg-natural-bg/50 rounded-xl p-2 border border-natural-border/50">
          <span className="block text-lg font-display font-bold text-natural-text">{rhythm.settledPct}%</span>
          <span className="block text-[10px] font-semibold text-natural-muted uppercase">Settled</span>
        </div>
        <div className="bg-natural-bg/50 rounded-xl p-2 border border-natural-border/50">
          <span className="block text-lg font-display font-bold text-natural-text">
            {rhythm.medianSettleDays == null ? ' - ' : rhythm.medianSettleDays < 1 ? '<1' : Math.round(rhythm.medianSettleDays)}
          </span>
          <span className="block text-[10px] font-semibold text-natural-muted uppercase">Days to settle</span>
        </div>
        <div className="bg-natural-bg/50 rounded-xl p-2 border border-natural-border/50">
          <span className="block text-lg font-display font-bold text-natural-text">{rhythm.streakMonths}</span>
          <span className="block text-[10px] font-semibold text-natural-muted uppercase">Month streak</span>
        </div>
      </div>

      {rhythm.streakMonths === 0 && !rhythm.celebration && (
        <p className="text-[11px] text-natural-muted flex items-center gap-1.5">
          <Sparkles className="h-3 w-3 shrink-0" /> Settle out a full month to start a streak.
        </p>
      )}
    </div>
  );
}
