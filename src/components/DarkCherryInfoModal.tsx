import React from 'react';
import { EyeOff, HandCoins, ShieldCheck, Cherry } from 'lucide-react';
import Modal from './Modal';

// First-use explainer for the Dark Cherry blind split. The "seen" flag is
// per-user and per-device - the point is that nobody meets a Dark Cherry cold.
const seenKey = (uid?: string) => `dark_cherry_intro_seen_${uid || 'anon'}`;

export const hasSeenDarkCherryIntro = (uid?: string): boolean => {
  try {
    return localStorage.getItem(seenKey(uid)) === '1';
  } catch {
    return true; // storage unavailable - don't nag every time
  }
};

export const markDarkCherryIntroSeen = (uid?: string) => {
  try {
    localStorage.setItem(seenKey(uid), '1');
  } catch {
    // best-effort
  }
};

export default function DarkCherryInfoModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal
      onClose={onClose}
      title="What's a Dark Cherry?"
      icon={<Cherry className="h-5 w-5 text-natural-primary" />}
      footer={
        <button
          onClick={onClose}
          className="w-full py-2.5 text-xs font-bold text-white bg-natural-primary hover:bg-[#A00E00] rounded-full shadow-md transition-all cursor-pointer"
        >
          Got it
        </button>
      }
    >
      <div className="space-y-5">
        <p className="text-sm text-natural-text leading-relaxed">
          A <strong>Dark Cherry</strong> is a blind split - for the expenses where talking
          about exact numbers feels weird. Think of it as money going into a shared pot,
          without anyone staring at a balance.
        </p>

        <div className="space-y-3">
          <div className="flex gap-3 items-start bg-natural-bg/50 border border-natural-border rounded-xl p-3.5">
            <EyeOff className="h-5 w-5 text-natural-primary shrink-0 mt-0.5" />
            <p className="text-xs text-natural-text leading-relaxed">
              <strong>No totals, no balances.</strong> Whoever creates it sets the amount that
              settles it - but the people chipping in never see the total, what's left, or what
              anyone else has put in.
            </p>
          </div>
          <div className="flex gap-3 items-start bg-natural-bg/50 border border-natural-border rounded-xl p-3.5">
            <HandCoins className="h-5 w-5 text-natural-primary shrink-0 mt-0.5" />
            <p className="text-xs text-natural-text leading-relaxed">
              <strong>Give what you can, when you can.</strong> The creator sets a comfortable
              range for each payment. You just log something in that range toward the pot - once, or as many times as you like.
            </p>
          </div>
          <div className="flex gap-3 items-start bg-natural-bg/50 border border-natural-border rounded-xl p-3.5">
            <ShieldCheck className="h-5 w-5 text-natural-primary shrink-0 mt-0.5" />
            <p className="text-xs text-natural-text leading-relaxed">
              <strong>It closes itself.</strong> When the pot quietly reaches the target, the
              cherry is settled and everyone sees it's done. Nobody ever had to ask anyone for
              a specific amount.
            </p>
          </div>
        </div>

        <p className="text-xs text-natural-muted leading-relaxed italic border-t border-natural-border/60 pt-3">
          It's for the households where "you owe me $43.50" lands wrong - a little less
          precise, a lot more kind.
        </p>
      </div>
    </Modal>
  );
}
