import { useMemo } from 'react';
import { Expense } from '../types';
import { computeRhythm } from '../lib/rhythm';
import { HeartHandshake, Cherry, Sparkles } from 'lucide-react';

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
          <span className="text-[10px] font-bold tracking-wider text-white bg-natural-dark px-1.5 py-0.5 rounded-md">
            Cherry +
          </span>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center" aria-hidden="true">
          {['Settled', 'Days to settle', 'Month streak'].map((label) => (
            <div
              key={label}
              className="bg-natural-bg/50 rounded-xl p-2 border border-natural-border/50"
            >
              <span className="block text-lg font-display font-semibold text-natural-border select-none">
                ···
              </span>
              <span className="block text-xs font-semibold text-natural-muted uppercase">
                {label}
              </span>
            </div>
          ))}
        </div>
        <p className="text-xs text-natural-muted flex items-center gap-1.5">
          <Sparkles className="h-3 w-3 shrink-0" /> Settle streaks, anniversaries, and milestones -
          with Cherry +.
        </p>
      </button>
    );
  }

  if (!rhythm) return null;

  return (
    <div
      className="bg-white border border-natural-border rounded-3xl p-5 shadow-sm space-y-3"
      id="rhythm-card"
    >
      <h3 className="text-xs font-bold text-natural-muted uppercase tracking-widest flex items-center gap-1.5">
        <HeartHandshake className="h-3.5 w-3.5 text-natural-primary" /> Your Rhythm
      </h3>

      {rhythm.celebration && (
        <div className="bg-natural-sage/30 border border-natural-primary/20 rounded-xl p-3 flex items-start gap-2 animate-in fade-in">
          <Cherry className="h-4 w-4 text-natural-primary shrink-0 mt-0.5" />
          <p className="text-xs font-semibold text-natural-text leading-relaxed">
            {rhythm.celebration}
          </p>
        </div>
      )}

      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="bg-natural-bg/50 rounded-xl p-2 border border-natural-border/50">
          <span className="block text-lg font-display font-semibold text-natural-text">
            {rhythm.settledPct}%
          </span>
          <span className="block text-xs font-semibold text-natural-muted uppercase">Settled</span>
        </div>
        <div className="bg-natural-bg/50 rounded-xl p-2 border border-natural-border/50">
          <span className="block text-lg font-display font-semibold text-natural-text">
            {rhythm.medianSettleDays == null
              ? ' - '
              : rhythm.medianSettleDays < 1
                ? '<1'
                : Math.round(rhythm.medianSettleDays)}
          </span>
          <span className="block text-xs font-semibold text-natural-muted uppercase">
            Days to settle
          </span>
        </div>
        <div className="bg-natural-bg/50 rounded-xl p-2 border border-natural-border/50">
          <span className="block text-lg font-display font-semibold text-natural-text">
            {rhythm.streakMonths}
          </span>
          <span className="block text-xs font-semibold text-natural-muted uppercase">
            Month streak
          </span>
        </div>
      </div>

      {rhythm.streakMonths === 0 && !rhythm.celebration && (
        <p className="text-xs text-natural-muted flex items-center gap-1.5">
          <Sparkles className="h-3 w-3 shrink-0" /> Settle out a full month to start a streak.
        </p>
      )}
    </div>
  );
}
