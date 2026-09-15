import { useState, useMemo, useEffect } from 'react';
import { Expense, Group } from '../types';
import { getFullMembers, getFullDefaultSplit } from '../lib/members';
import { roundCurrency } from '../lib/money';
import { computeNetBetween } from '../lib/balances';
import { netNow, projectPurchase, purchaseDelta, SplitMode } from '../lib/planPurchase';
import { X, Sparkles, TrendingUp, MessageCircle, Cherry, Plus, ArrowRight } from 'lucide-react';
import { labelClass } from '../lib/ui';

export interface PlanPrefill {
  title: string;
  amount: number;
  paidBy: string;
  splitType: 'household_default' | 'equal';
}

interface PlanPurchaseProps {
  group: Group;
  activeUser: string;
  groupUsers: Record<string, any>;
  expenses: Expense[];
  /** Your own spending threshold, for the monthly-share warning. */
  myThreshold?: number;
  /** Open the expense form prefilled with this projection. */
  onLogIt?: (prefill: PlanPrefill) => void;
  onClose: () => void;
}

const money = (v: number) => `$${v.toFixed(2)}`;
/** Owing reads as a plain figure, being owed in parentheses, as on iOS. */
const signed = (v: number) => (v < 0 ? `(${money(Math.abs(v))})` : money(v));

// A capsule choice, the same control for every either/or question below.
function Choice({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`py-1.5 px-3 text-xs font-semibold rounded-full border transition-all ${
        selected
          ? 'bg-natural-primary border-natural-primary text-white shadow-sm'
          : 'bg-natural-sidebar border-natural-border text-natural-text hover:bg-natural-bg'
      }`}
    >
      {label}
    </button>
  );
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

type Juice = {
  level: string;
  cherries: number;
  recommended: boolean;
  blurb: string;
  color: string;
};

// Turn a 0-100 score into a "juiciness" verdict.
function juiceFor(score: number): Juice {
  if (score >= 75)
    return {
      level: 'Extra juicy',
      cherries: 2,
      recommended: true,
      color: 'text-natural-primary',
      blurb: 'Great time to bring this up - the balance is in your favor.',
    };
  if (score >= 55)
    return {
      level: 'Juicy',
      cherries: 1,
      recommended: true,
      color: 'text-natural-primary',
      blurb: 'This looks reasonable to propose right now.',
    };
  if (score >= 35)
    return {
      level: 'A little juice',
      cherries: 1,
      recommended: false,
      color: 'text-natural-text',
      blurb: 'Doable, but worth a gentle, considerate conversation first.',
    };
  return {
    level: 'No juice',
    cherries: 0,
    recommended: false,
    color: 'text-natural-muted',
    blurb: 'Maybe hold off, or plan to cover more of it yourself for now.',
  };
}

const STARTERS: Record<string, string[]> = {
  good: [
    "Hey, I've been eyeing {item} for us - want to split it {theirPct}%/{yourPct}%? Your part would be about ${theirShare}.",
    'I think {item} would be a great add for the place. Fair split puts you around ${theirShare} - how does that sit with you?',
    "Been thinking about {item}. Given how things have balanced out, splitting it feels fair - you'd be at ~${theirShare}. Thoughts?",
  ],
  careful: [
    "No pressure at all, but I've been considering {item} (~${theirShare} for your share). Is now an okay time, or should we plan for later?",
    "I'd love to get {item} eventually. Your share would be about ${theirShare} - want to talk through timing so it's comfortable for everyone?",
  ],
  hold: [
    "I've been wanting {item}, but I know things are a bit tight - no rush. Maybe we revisit it next month?",
    'Thinking ahead to {item} (~${theirShare} for your part). Totally fine to wait. Want to set a target date instead?',
  ],
};

export default function PlanPurchase({
  group,
  activeUser,
  groupUsers,
  expenses,
  myThreshold = 0,
  onLogIt,
  onClose,
}: PlanPurchaseProps) {
  const members = useMemo(() => getFullMembers(group), [group]);
  const others = members.filter((m) => m.uid !== activeUser && !m.uid.startsWith('ghost_'));

  const [otherUid, setOtherUid] = useState(others[0]?.uid || '');
  const [item, setItem] = useState('');
  const [amount, setAmount] = useState('');
  // Who fronts it, how it splits, and whether it is carried across months:
  // the three things the arguments actually happen over (ported from iOS).
  const [payer, setPayer] = useState(activeUser);
  const [mode, setMode] = useState<SplitMode>('household');
  const [months, setMonths] = useState(1);
  const householdSize = Object.keys(getFullDefaultSplit(group)).length;

  // The roster can arrive after the modal opens (a join landing, or the
  // group snapshot catching up), in which case the initial pick was empty and
  // the verdict would never appear. Seed it once someone is there.
  const firstOtherUid = others[0]?.uid || '';
  useEffect(() => {
    if (!otherUid && firstOtherUid) setOtherUid(firstOtherUid);
  }, [otherUid, firstOtherUid]);

  const defaultSplit = getFullDefaultSplit(group);
  const theirPct = Math.round(
    defaultSplit[otherUid] ?? (others.length ? 100 / (others.length + 1) : 50)
  );
  const yourPct = 100 - theirPct;

  const numericAmount = parseFloat(amount) || 0;
  const theirShare = roundCurrency((numericAmount * theirPct) / 100);

  const other = groupUsers[otherUid] || {};
  const otherName = members.find((m) => m.uid === otherUid)?.name || 'The other person';
  const otherIncome = Number(other.income) || 0;
  const otherThreshold = Number(other.recurringThreshold) || 0;

  const { theyOweYou, youOweThem, net } = useMemo(
    () => computeNetBetween(expenses, activeUser, otherUid),
    [expenses, activeUser, otherUid]
  );

  // Nobody else has joined yet. There is no balance to weigh, so the verdict
  // is simply what it costs; the modal still works rather than sitting on an
  // empty prompt however much is typed.
  const solo = others.length === 0;

  // The projection: every seat's share, its monthly slice, and net before
  // and after. Null until there is a price.
  const projection = useMemo(() => {
    if (numericAmount <= 0) return null;
    const { shares, perMonth } = projectPurchase(numericAmount, defaultSplit, mode, payer, months);
    const rows = Object.keys(defaultSplit).map((uid) => {
      const before = netNow(expenses, uid);
      return {
        uid,
        name: uid === activeUser ? 'You' : members.find((m) => m.uid === uid)?.name || 'Someone',
        share: shares[uid] ?? 0,
        monthly: perMonth[uid] ?? 0,
        before,
        after: roundCurrency(before + purchaseDelta(shares, uid, payer)),
        isPayer: uid === payer,
      };
    });
    const myMonthly = perMonth[activeUser] ?? 0;
    return { rows, myMonthly, overThreshold: myThreshold > 0 && myMonthly > myThreshold };
    // defaultSplit is rebuilt each render from group; group is the stable input.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [numericAmount, group, mode, payer, months, expenses, activeUser, members, myThreshold]);

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
  }, [
    otherUid,
    numericAmount,
    theirShare,
    net,
    otherIncome,
    otherThreshold,
    item,
    theirPct,
    yourPct,
  ]);

  return (
    <div className="fixed inset-0 bg-natural-dark/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl border border-natural-border flex flex-col max-h-[90vh] animate-in fade-in-50 zoom-in-95 duration-150">
        <div className="flex items-center justify-between px-6 py-4 border-b border-natural-border">
          <h2 className="text-lg font-display font-semibold text-natural-text flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-natural-primary" /> Plan a Purchase
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-natural-muted hover:text-natural-text hover:bg-natural-sidebar p-2 rounded-xl transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto">
          <p className="text-xs text-natural-muted">
            {solo
              ? 'Thinking about a big purchase? See what it would cost you. Once someone joins, this weighs the balance between you too.'
              : "Thinking about a big shared purchase? See if it's a good moment to bring it up - based on your real balances."}
          </p>

          <div>
            <label className="block text-xs font-bold text-natural-text uppercase tracking-wider mb-1.5">
              What is it?
            </label>
            <input
              type="text"
              value={item}
              onChange={(e) => setItem(e.target.value)}
              placeholder="Item"
              className="w-full px-3 py-2.5 bg-natural-bg/50 border border-natural-border focus:border-natural-primary rounded-xl text-sm outline-none"
            />
          </div>

          {others.length > 1 && (
            <div>
              <label className="block text-xs font-bold text-natural-text uppercase tracking-wider mb-1.5">
                With whom?
              </label>
              <select
                value={otherUid}
                onChange={(e) => setOtherUid(e.target.value)}
                className="w-full px-3 py-2.5 bg-white border border-natural-border rounded-xl text-sm outline-none"
              >
                {others.map((o) => (
                  <option key={o.uid} value={o.uid}>
                    {o.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-natural-text uppercase tracking-wider mb-1.5">
              Total price
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-natural-muted">
                $
              </span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="w-full pl-8 pr-3 py-2.5 bg-natural-bg/50 border border-natural-border focus:border-natural-primary rounded-xl font-mono text-sm outline-none"
              />
            </div>
          </div>

          {/* Who fronts it / how it splits / spread over (ported from iOS) */}
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-bold text-natural-text uppercase tracking-wider mb-1">
                Who fronts it
              </label>
              <p className="text-[11px] text-natural-muted mb-1.5">
                {householdSize <= 1
                  ? 'You cover the whole thing.'
                  : "Whoever pays is owed the others' shares."}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {Object.keys(getFullDefaultSplit(group)).map((uid) => (
                  <Choice
                    key={uid}
                    label={
                      uid === activeUser
                        ? 'You'
                        : members.find((m) => m.uid === uid)?.name || 'Someone'
                    }
                    selected={payer === uid}
                    onClick={() => setPayer(uid)}
                  />
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-natural-text uppercase tracking-wider mb-1.5">
                How it splits
              </label>
              <div className="flex flex-wrap gap-1.5">
                <Choice
                  label="Household ratio"
                  selected={mode === 'household'}
                  onClick={() => setMode('household')}
                />
                <Choice label="Even" selected={mode === 'even'} onClick={() => setMode('even')} />
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-natural-text uppercase tracking-wider mb-1">
                Spread over
              </label>
              <p className="text-[11px] text-natural-muted mb-1.5">
                Carrying a large purchase changes what it costs each month, not what it costs.
              </p>
              <div className="flex flex-wrap gap-1.5">
                {[1, 3, 6, 12].map((n) => (
                  <Choice
                    key={n}
                    label={n === 1 ? 'One go' : `${n} months`}
                    selected={months === n}
                    onClick={() => setMonths(n)}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Balance snapshot */}
          {!solo && (
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="bg-natural-sidebar/40 rounded-xl p-2.5 border border-natural-border/50">
                <span className="block text-xs font-bold text-natural-muted uppercase">
                  They owe you
                </span>
                <span className="block text-sm font-bold text-natural-text mt-0.5">
                  ${theyOweYou.toFixed(2)}
                </span>
              </div>
              <div className="bg-natural-sidebar/40 rounded-xl p-2.5 border border-natural-border/50">
                <span className="block text-xs font-bold text-natural-muted uppercase">
                  You owe them
                </span>
                <span className="block text-sm font-bold text-natural-text mt-0.5">
                  ${youOweThem.toFixed(2)}
                </span>
              </div>
              <div className="bg-natural-sidebar/40 rounded-xl p-2.5 border border-natural-border/50">
                <span className="block text-xs font-bold text-natural-muted uppercase">Net</span>
                <span
                  className={`block text-sm font-bold mt-0.5 ${net >= 0 ? 'text-natural-primary' : 'text-natural-text'}`}
                >
                  {net >= 0 ? '+' : ''}${net.toFixed(2)}
                </span>
              </div>
            </div>
          )}

          {result && (
            <div className="bg-natural-sage/20 border border-natural-primary/20 rounded-2xl p-4 space-y-3 animate-in fade-in">
              <div className="flex items-center justify-between">
                <span className={labelClass}>
                  {otherName}'s share ({theirPct}%)
                </span>
                <span className="text-lg font-display font-semibold text-natural-text">
                  ${theirShare.toFixed(2)}
                </span>
              </div>
              <div className="text-center py-1">
                <span className="inline-flex items-center justify-center gap-1">
                  {result.juice.cherries > 0 ? (
                    Array.from({ length: result.juice.cherries }).map((_, i) => (
                      <Cherry key={i} className="h-6 w-6 text-natural-primary" />
                    ))
                  ) : (
                    <Cherry className="h-6 w-6 text-natural-border" />
                  )}
                </span>
                <p className={`text-lg font-display font-semibold ${result.juice.color}`}>
                  {result.juice.level}
                </p>
                <p className="text-xs text-natural-muted mt-1">{result.juice.blurb}</p>
                {otherThreshold > 0 && theirShare > otherThreshold && (
                  <p className="text-xs text-natural-primary mt-1 font-semibold">
                    Note: this exceeds {otherName}'s spending threshold ($
                    {otherThreshold.toFixed(0)}).
                  </p>
                )}
              </div>
              <div className="bg-white rounded-xl p-3 border border-natural-border/60">
                <span className="text-[10px] font-bold text-natural-primary uppercase tracking-wider flex items-center gap-1.5">
                  <MessageCircle className="h-3 w-3" /> Conversation starter
                </span>
                <p className="text-sm text-natural-text mt-1.5 italic leading-relaxed">
                  "{result.starter}"
                </p>
              </div>
            </div>
          )}

          {solo && numericAmount > 0 && (
            <div className="bg-natural-sage/20 border border-natural-primary/20 rounded-2xl p-4 space-y-2 animate-in fade-in">
              <div className="flex items-center justify-between">
                <span className={labelClass}>Your share (100%)</span>
                <span className="text-lg font-display font-semibold text-natural-text">
                  ${numericAmount.toFixed(2)}
                </span>
              </div>
              <p className="text-xs text-natural-muted">
                Nobody has joined yet, so this is all yours for now. Invite someone from Settings
                and this turns into a split and a conversation starter.
              </p>
            </div>
          )}

          {projection && (
            <div className="space-y-2">
              <span className={labelClass}>
                {householdSize <= 1 ? 'What it does to you' : 'What it does to each of you'}
              </span>
              <p className="text-xs text-natural-muted">
                Net position today, what this adds, and where it leaves you. A negative number means
                you are owed.
              </p>
              <div className="bg-white rounded-2xl border border-natural-border shadow-sm divide-y divide-natural-border">
                {projection.rows.map((r) => (
                  <div key={r.uid} className="px-4 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-2 min-w-0">
                        <span className="text-sm font-semibold text-natural-text truncate">
                          {r.name}
                        </span>
                        {r.isPayer && (
                          <span className="text-[8.5px] font-mono tracking-[0.1em] text-natural-primary bg-natural-primary-wash px-2 py-0.5 rounded-full">
                            PAYS
                          </span>
                        )}
                      </span>
                      <span className="text-[15px] font-display font-semibold text-natural-text">
                        {money(r.share)}
                      </span>
                    </div>
                    <div className="mt-1.5 flex items-center justify-between gap-2 font-mono text-[11px]">
                      <span className="text-natural-muted truncate">
                        {months > 1
                          ? `${money(r.monthly)} a month for ${months} months`
                          : 'Share of this purchase'}
                      </span>
                      <span className="flex items-center gap-1.5 shrink-0">
                        <span
                          className={r.before > 0 ? 'text-natural-primary' : 'text-natural-text'}
                        >
                          {signed(r.before)}
                        </span>
                        <ArrowRight className="h-3 w-3 text-natural-accent" />
                        <span
                          className={`font-medium ${r.after > 0 ? 'text-natural-primary' : 'text-natural-text'}`}
                        >
                          {signed(r.after)}
                        </span>
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              {projection.overThreshold && (
                <div className="bg-natural-primary-wash border border-natural-primary/35 rounded-xl p-3 text-xs text-natural-text">
                  Your share works out at {money(projection.myMonthly)}
                  {months > 1 ? ' a month' : ''}, past the ${myThreshold.toFixed(0)} you set as
                  comfortable. Worth talking about before it is logged.
                </div>
              )}
              {onLogIt && (
                <button
                  type="button"
                  onClick={() =>
                    onLogIt({
                      title: item.trim(),
                      amount: numericAmount,
                      paidBy: payer.startsWith('ghost_') ? activeUser : payer,
                      splitType: mode === 'household' ? 'household_default' : 'equal',
                    })
                  }
                  className="w-full py-2.5 text-sm font-bold text-white bg-natural-primary hover:bg-natural-primary-ink rounded-full flex items-center justify-center gap-1.5 transition-colors"
                >
                  <Plus className="h-4 w-4" /> Log it
                </button>
              )}
            </div>
          )}

          {!result && !(solo && numericAmount > 0) && (
            <div className="text-center text-xs text-natural-muted py-4 flex flex-col items-center gap-2">
              <Sparkles className="h-5 w-5 text-natural-primary/40" />
              {solo
                ? 'Enter a price to see what it would cost you.'
                : "Enter a price to see whether it's a juicy time to ask."}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
