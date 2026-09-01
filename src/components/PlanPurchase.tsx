import React, { useState, useMemo } from 'react';
import { Expense, Group } from '../types';
import { getFullMembers, getFullDefaultSplit } from '../lib/members';
import { getRemainingSettlementAmount, roundCurrency } from '../lib/money';
import { X, Sparkles, TrendingUp, MessageCircle, Cherry } from 'lucide-react';

interface PlanPurchaseProps {
  group: Group;
  activeUser: string;
  groupUsers: Record<string, any>;
  expenses: Expense[];
  onClose: () => void;
}

// Net balance between the active user and one other member, from the ledger.
export function computeNetBetween(expenses: Expense[], activeUser: string, otherUid: string) {
  let theyOweYou = 0;
  let youOweThem = 0;
  expenses.forEach(e => {
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

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

type Juice = { level: string; cherries: number; recommended: boolean; blurb: string; color: string };

// Turn a 0-100 score into a "juiciness" verdict.
function juiceFor(score: number): Juice {
  if (score >= 75) return { level: 'Extra juicy', cherries: 2, recommended: true, color: 'text-natural-primary', blurb: 'Great time to bring this up - the balance is in your favor.' };
  if (score >= 55) return { level: 'Juicy', cherries: 1, recommended: true, color: 'text-natural-primary', blurb: 'This looks reasonable to propose right now.' };
  if (score >= 35) return { level: 'A little juice', cherries: 1, recommended: false, color: 'text-natural-text', blurb: 'Doable, but worth a gentle, considerate conversation first.' };
  return { level: 'No juice', cherries: 0, recommended: false, color: 'text-natural-muted', blurb: 'Maybe hold off, or plan to cover more of it yourself for now.' };
}

const STARTERS: Record<string, string[]> = {
  good: [
    "Hey, I've been eyeing {item} for us - want to split it {theirPct}%/{yourPct}%? Your part would be about ${theirShare}.",
    "I think {item} would be a great add for the place. Fair split puts you around ${theirShare} - how does that sit with you?",
    "Been thinking about {item}. Given how things have balanced out, splitting it feels fair - you'd be at ~${theirShare}. Thoughts?",
  ],
  careful: [
    "No pressure at all, but I've been considering {item} (~${theirShare} for your share). Is now an okay time, or should we plan for later?",
    "I'd love to get {item} eventually. Your share would be about ${theirShare} - want to talk through timing so it's comfortable for both of us?",
  ],
  hold: [
    "I've been wanting {item}, but I know things are a bit tight - no rush. Maybe we revisit it next month?",
    "Thinking ahead to {item} (~${theirShare} each side). Totally fine to wait - want to set a target date together instead?",
  ],
};

export default function PlanPurchase({ group, activeUser, groupUsers, expenses, onClose }: PlanPurchaseProps) {
  const members = useMemo(() => getFullMembers(group), [group]);
  const others = members.filter(m => m.uid !== activeUser && !m.uid.startsWith('ghost_'));

  const [otherUid, setOtherUid] = useState(others[0]?.uid || '');
  const [item, setItem] = useState('');
  const [amount, setAmount] = useState('');

  const defaultSplit = getFullDefaultSplit(group);
  const theirPct = Math.round(defaultSplit[otherUid] ?? (others.length ? 100 / (others.length + 1) : 50));
  const yourPct = 100 - theirPct;

  const numericAmount = parseFloat(amount) || 0;
  const theirShare = roundCurrency((numericAmount * theirPct) / 100);

  const other = groupUsers[otherUid] || {};
  const otherName = members.find(m => m.uid === otherUid)?.name || 'Your partner';
  const otherIncome = Number(other.income) || 0;
  const otherThreshold = Number(other.recurringThreshold) || 0;

  const { theyOweYou, youOweThem, net } = useMemo(
    () => computeNetBetween(expenses, activeUser, otherUid),
    [expenses, activeUser, otherUid]
  );

  const result = useMemo(() => {
    if (!otherUid || numericAmount <= 0) return null;

    let score = 50;
    // Balance: if you already owe them (net < 0), it's a fine time to have them
    // chip in; if they already owe you a lot (net > 0), adding more is less ideal.
    score += clamp((-net / Math.max(theirShare, 1)) * 15, -35, 35);
    // Size relative to their income (if known).
    if (otherIncome > 0) {
      const monthly = otherIncome / 12;
      const ratio = theirShare / monthly;
      score -= clamp(ratio * 120, 0, 30);
    }
    // Their recurring threshold, if set.
    if (otherThreshold > 0 && theirShare > otherThreshold) score -= 25;
    score = Math.round(clamp(score, 0, 100));

    const juice = juiceFor(score);
    const bucket = score >= 55 ? 'good' : score >= 35 ? 'careful' : 'hold';
    const pool = STARTERS[bucket];
    // Deterministic pick so it doesn't flicker while typing.
    const starter = pool[Math.min(pool.length - 1, Math.floor(theirShare) % pool.length)]
      .replace('{item}', item.trim() || 'this')
      .replace('{theirPct}', String(theirPct))
      .replace('{yourPct}', String(yourPct))
      .replace(/\{theirShare\}/g, theirShare.toFixed(2));

    return { score, juice, starter };
  }, [otherUid, numericAmount, theirShare, net, otherIncome, otherThreshold, item, theirPct, yourPct]);

  return (
    <div className="fixed inset-0 bg-natural-dark/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl border border-natural-border flex flex-col max-h-[90vh] animate-in fade-in-50 zoom-in-95 duration-150">
        <div className="flex items-center justify-between px-6 py-4 border-b border-natural-border">
          <h2 className="text-lg font-display font-semibold text-natural-text flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-natural-primary" /> Plan a Purchase
          </h2>
          <button onClick={onClose} className="text-natural-muted hover:text-natural-text hover:bg-natural-sidebar p-2 rounded-xl transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto">
          <p className="text-xs text-natural-muted">
            Thinking about a big shared purchase? See if it's a good moment to bring it up - based on your real balances.
          </p>

          <div>
            <label className="block text-xs font-bold text-natural-text uppercase tracking-wider mb-1.5">What is it?</label>
            <input
              type="text"
              value={item}
              onChange={e => setItem(e.target.value)}
              placeholder="e.g. a new couch"
              className="w-full px-3 py-2.5 bg-natural-bg/50 border border-natural-border focus:border-natural-primary rounded-xl text-sm outline-none"
            />
          </div>

          {others.length > 1 && (
            <div>
              <label className="block text-xs font-bold text-natural-text uppercase tracking-wider mb-1.5">With whom?</label>
              <select value={otherUid} onChange={e => setOtherUid(e.target.value)} className="w-full px-3 py-2.5 bg-white border border-natural-border rounded-xl text-sm outline-none">
                {others.map(o => <option key={o.uid} value={o.uid}>{o.name}</option>)}
              </select>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-natural-text uppercase tracking-wider mb-1.5">Total price</label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-natural-muted">$</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="0.00"
                className="w-full pl-8 pr-3 py-2.5 bg-natural-bg/50 border border-natural-border focus:border-natural-primary rounded-xl font-mono text-sm outline-none"
              />
            </div>
          </div>

          {/* Balance snapshot */}
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="bg-natural-sidebar/40 rounded-xl p-2.5 border border-natural-border/50">
              <span className="block text-xs font-bold text-natural-muted uppercase">They owe you</span>
              <span className="block text-sm font-bold text-natural-text mt-0.5">${theyOweYou.toFixed(2)}</span>
            </div>
            <div className="bg-natural-sidebar/40 rounded-xl p-2.5 border border-natural-border/50">
              <span className="block text-xs font-bold text-natural-muted uppercase">You owe them</span>
              <span className="block text-sm font-bold text-natural-text mt-0.5">${youOweThem.toFixed(2)}</span>
            </div>
            <div className="bg-natural-sidebar/40 rounded-xl p-2.5 border border-natural-border/50">
              <span className="block text-xs font-bold text-natural-muted uppercase">Net</span>
              <span className={`block text-sm font-bold mt-0.5 ${net >= 0 ? 'text-natural-primary' : 'text-natural-text'}`}>{net >= 0 ? '+' : ''}${net.toFixed(2)}</span>
            </div>
          </div>

          {result && (
            <div className="bg-natural-sage/20 border border-natural-primary/20 rounded-2xl p-4 space-y-3 animate-in fade-in">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-natural-muted uppercase tracking-wider">{otherName}'s share ({theirPct}%)</span>
                <span className="text-lg font-display font-semibold text-natural-text">${theirShare.toFixed(2)}</span>
              </div>
              <div className="text-center py-1">
                <span className="inline-flex items-center justify-center gap-1">
                  {result.juice.cherries > 0
                    ? Array.from({ length: result.juice.cherries }).map((_, i) => (
                        <Cherry key={i} className="h-6 w-6 text-natural-primary" />
                      ))
                    : <Cherry className="h-6 w-6 text-natural-border" />}
                </span>
                <p className={`text-lg font-display font-semibold ${result.juice.color}`}>{result.juice.level}</p>
                <p className="text-xs text-natural-muted mt-1">{result.juice.blurb}</p>
                {otherThreshold > 0 && theirShare > otherThreshold && (
                  <p className="text-xs text-natural-primary mt-1 font-semibold">Note: this exceeds {otherName}'s spending threshold (${otherThreshold.toFixed(0)}).</p>
                )}
              </div>
              <div className="bg-white rounded-xl p-3 border border-natural-border/60">
                <span className="text-[10px] font-bold text-natural-primary uppercase tracking-wider flex items-center gap-1.5"><MessageCircle className="h-3 w-3" /> Conversation starter</span>
                <p className="text-sm text-natural-text mt-1.5 italic leading-relaxed">"{result.starter}"</p>
              </div>
            </div>
          )}

          {!result && (
            <div className="text-center text-xs text-natural-muted py-4 flex flex-col items-center gap-2">
              <Sparkles className="h-5 w-5 text-natural-primary/40" />
              Enter a price to see whether it's a juicy time to ask.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
