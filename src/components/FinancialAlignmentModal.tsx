import React, { useEffect, useState } from 'react';
import { Sparkles, MessageCircleHeart, RefreshCcw } from 'lucide-react';
import Modal from './Modal';
import { authHeader } from '../firebase';
import { User } from '../types';

interface Props {
  members: (Pick<User, 'uid' | 'name' | 'income' | 'partnerIncome' | 'financialProfile'>)[];
  activeUser: string;
  /** Worst reported-vs-estimated gap across the group, as a percentage. */
  severityPct: number;
  onClose: () => void;
}

const currency = (value: unknown): string | null => {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
};

// Reasonable openers if the AI call fails - picked by how large the gap is.
const fallbackStarter = (severityPct: number) => {
  if (severityPct >= 50) {
    return "It looks like the numbers you each had in mind are pretty far apart - that usually just means you haven't had the full conversation yet. Maybe start with: \"What does a fair split feel like to you, and what would you want me to know about your situation?\"";
  }
  if (severityPct >= 25) {
    return "Your pictures of each other's income don't quite line up. A gentle way in: \"I realized I might be guessing wrong about your numbers - want to swap real ones so our split feels fair to both of us?\"";
  }
  return "You're close, but not quite in sync on the numbers. Try: \"Quick money check-in - want to make sure our split still matches reality?\"";
};

/**
 * Opened from the income-discrepancy banner. Shows each member's narrative
 * financial profile, the raw numbers everyone reported, and an AI-written
 * conversation starter tuned to how big the gap is and how each person
 * prefers to talk about money.
 */
export default function FinancialAlignmentModal({ members, activeUser, severityPct, onClose }: Props) {
  const [starter, setStarter] = useState<string | null>(null);
  const [loadingStarter, setLoadingStarter] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/generate-conversation-starter', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
          body: JSON.stringify({
            severityPct: Math.round(severityPct),
            styles: members.map(m => ({
              name: m.name || 'A member',
              type: m.financialProfile?.type || '',
              communicationStyle: m.financialProfile?.communicationStyle || '',
            })),
          }),
        });
        const data = res.ok ? await res.json() : null;
        if (!cancelled) setStarter(data?.starter || fallbackStarter(severityPct));
      } catch {
        if (!cancelled) setStarter(fallbackStarter(severityPct));
      } finally {
        if (!cancelled) setLoadingStarter(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <Modal
      onClose={onClose}
      title="Financial Alignment"
      icon={<Sparkles className="h-5 w-5 text-natural-primary" />}
      size="lg"
    >
      <div className="space-y-6">

        {/* Narrative profiles only - no scores, no quiz answers. */}
        <section>
          <h3 className="text-xs font-bold text-natural-muted uppercase tracking-wider mb-2">Your Financial Styles</h3>
          <div className="space-y-3">
            {members.map(m => (
              <div key={m.uid} className="bg-natural-bg/50 border border-natural-border rounded-xl p-4">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-bold text-natural-text capitalize">
                    {m.uid === activeUser ? 'You' : (m.name || 'A member')}
                  </span>
                  {m.financialProfile?.type && (
                    <span className="text-xs font-semibold text-natural-primary text-right">{m.financialProfile.type}</span>
                  )}
                </div>
                {m.financialProfile?.description ? (
                  <p className="text-sm text-natural-text mt-1.5 leading-relaxed">{m.financialProfile.description}</p>
                ) : (
                  <p className="text-sm text-natural-muted mt-1.5 italic">Hasn't finished the profile quiz yet.</p>
                )}
                {m.financialProfile?.communicationStyle && (
                  <p className="text-xs text-natural-muted mt-2 border-t border-natural-border/50 pt-2">
                    <span className="font-semibold">Talking about money:</span> {m.financialProfile.communicationStyle}
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* The raw numbers, side by side. */}
        <section>
          <h3 className="text-xs font-bold text-natural-muted uppercase tracking-wider mb-2">What You Each Reported</h3>
          <div className="bg-natural-sage/20 border border-natural-primary/20 rounded-xl p-4 space-y-3">
            {members.map(m => {
              const own = currency(m.income);
              const estimate = currency(m.partnerIncome);
              const label = m.uid === activeUser ? 'You' : (m.name || 'A member');
              return (
                <div key={m.uid} className="text-sm border-b border-natural-border/40 pb-2 last:border-0 last:pb-0">
                  <span className="font-semibold text-natural-text capitalize">{label}</span>
                  <div className="mt-0.5 space-y-0.5">
                    <div className="flex justify-between text-natural-muted">
                      <span>Reported own income</span>
                      <span className="font-mono font-semibold text-natural-text">{own || 'Not shared'}</span>
                    </div>
                    <div className="flex justify-between text-natural-muted">
                      <span>Estimated partner's income</span>
                      <span className="font-mono font-semibold text-natural-text">{estimate || 'No estimate'}</span>
                    </div>
                  </div>
                </div>
              );
            })}
            <p className="text-xs text-natural-muted pt-1">
              These differ by up to <span className="font-mono font-bold">{Math.round(severityPct)}%</span> - that gap is what triggered this check-in.
            </p>
          </div>
        </section>

        {/* AI conversation starter, tuned to severity + styles. */}
        <section>
          <h3 className="text-xs font-bold text-natural-muted uppercase tracking-wider mb-2">A Way to Start the Conversation</h3>
          <div className="bg-white border border-natural-border rounded-xl p-4 flex gap-3 items-start shadow-sm">
            <MessageCircleHeart className="h-5 w-5 text-natural-primary shrink-0 mt-0.5" />
            {loadingStarter ? (
              <div className="flex items-center gap-2 text-sm text-natural-muted">
                <RefreshCcw className="h-4 w-4 animate-spin" /> Writing a starter for you…
              </div>
            ) : (
              <p className="text-sm text-natural-text leading-relaxed italic">{starter}</p>
            )}
          </div>
        </section>

      </div>
    </Modal>
  );
}
