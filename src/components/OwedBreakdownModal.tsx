import React, { useMemo, useState } from 'react';
import { Expense, Group } from '../types';
import { getFullMembers } from '../lib/members';
import { getRemainingSettlementAmount, getTotalRemainingOwedToPayer, isDarkCherry } from '../lib/money';
import { authHeader } from '../firebase';
import Modal from './Modal';
import { CreditCard, TrendingUp, ChevronRight, BellRing, Check, RefreshCcw } from 'lucide-react';

interface OwedBreakdownModalProps {
  mode: 'you_owe' | 'owed_to_you';
  expenses: Expense[];
  group: Group;
  activeUser: string;
  isPlus: boolean;
  onSelectExpense: (expense: Expense) => void;
  onCherryPlus: () => void;
  onToast: (title: string, message: string, type: 'info' | 'success' | 'error') => void;
  onClose: () => void;
}

const fmt = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (dateStr: string) => {
  const d = /^\d{4}-\d{2}-\d{2}$/.test(dateStr) ? new Date(dateStr + 'T00:00:00') : new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

// Opened from the balance cards in the rail: the transactions still owed,
// grouped per person, with a Cherry + option to email them a gentle reminder.
export default function OwedBreakdownModal({
  mode, expenses, group, activeUser, isPlus, onSelectExpense, onCherryPlus, onToast, onClose,
}: OwedBreakdownModalProps) {
  const members = useMemo(() => getFullMembers(group), [group]);
  const nameOf = (uid: string) => members.find(m => m.uid === uid)?.name || 'Unknown';
  const [sendingTo, setSendingTo] = useState<string | null>(null);
  const [remindedUids, setRemindedUids] = useState<string[]>([]);

  // Per-person breakdown of open items. Dark Cherries are excluded on purpose:
  // their whole point is that nobody tracks or chases exact numbers.
  const byPerson = useMemo(() => {
    const map = new Map<string, { uid: string; total: number; items: { expense: Expense; amount: number }[] }>();
    for (const exp of expenses) {
      if (isDarkCherry(exp)) continue;
      if (mode === 'you_owe') {
        if (exp.paidBy === activeUser) continue;
        const remaining = getRemainingSettlementAmount(exp, activeUser, false);
        if (remaining <= 0.01) continue;
        const entry = map.get(exp.paidBy) || { uid: exp.paidBy, total: 0, items: [] };
        entry.total += remaining;
        entry.items.push({ expense: exp, amount: remaining });
        map.set(exp.paidBy, entry);
      } else {
        if (exp.paidBy !== activeUser) continue;
        if (getTotalRemainingOwedToPayer(exp, false) <= 0.01) continue;
        for (const uid of Object.keys(exp.shares || {})) {
          if (uid === activeUser) continue;
          const remaining = getRemainingSettlementAmount(exp, uid, false);
          if (remaining <= 0.01) continue;
          const entry = map.get(uid) || { uid, total: 0, items: [] };
          entry.total += remaining;
          entry.items.push({ expense: exp, amount: remaining });
          map.set(uid, entry);
        }
      }
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [expenses, mode, activeUser]);

  const grandTotal = byPerson.reduce((s, p) => s + p.total, 0);

  const sendReminder = async (debtorUid: string, total: number, items: { expense: Expense; amount: number }[]) => {
    if (!isPlus) {
      onCherryPlus();
      return;
    }
    setSendingTo(debtorUid);
    try {
      const res = await fetch('/api/send-reminder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
        body: JSON.stringify({
          debtorUid,
          groupId: group.id,
          amount: Math.round(total * 100) / 100,
          items: items.slice(0, 10).map(i => ({ title: i.expense.title, amount: Math.round(i.amount * 100) / 100 })),
        }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.success) {
        setRemindedUids(prev => [...prev, debtorUid]);
        onToast('Reminder Sent', `A gentle nudge is on its way to ${nameOf(debtorUid)}.`, 'success');
      } else {
        onToast('Error', data?.error || 'Could not send the reminder. Please try again.', 'error');
      }
    } catch (e) {
      console.error('Reminder failed', e);
      onToast('Error', 'Could not send the reminder. Please try again.', 'error');
    } finally {
      setSendingTo(null);
    }
  };

  return (
    <Modal
      onClose={onClose}
      title={mode === 'you_owe' ? 'What You Still Owe' : 'Still Owed to You'}
      icon={mode === 'you_owe'
        ? <CreditCard className="h-5 w-5 text-natural-primary" />
        : <TrendingUp className="h-5 w-5 text-natural-primary" />}
      size="lg"
    >
      <div className="space-y-5">
        <div className="flex items-baseline justify-between bg-natural-sage/20 border border-natural-primary/20 rounded-xl px-4 py-3">
          <span className="text-xs font-bold text-natural-muted uppercase tracking-wider">
            {mode === 'you_owe' ? 'Total you owe' : 'Total owed to you'}
          </span>
          <span className="text-2xl font-display font-bold text-natural-text">{fmt(grandTotal)}</span>
        </div>

        {byPerson.length === 0 ? (
          <p className="text-center text-sm text-natural-muted py-6">
            Nothing outstanding. Sweet.
          </p>
        ) : (
          byPerson.map(person => (
            <div key={person.uid} className="border border-natural-border rounded-2xl overflow-hidden">
              <div className="flex items-center justify-between gap-3 px-4 py-3 bg-natural-bg/60 border-b border-natural-border">
                <div>
                  <span className="text-sm font-bold text-natural-text capitalize">
                    {mode === 'you_owe' ? `You owe ${nameOf(person.uid)}` : nameOf(person.uid)}
                  </span>
                  <span className="block text-[11px] text-natural-muted">
                    {person.items.length} open {person.items.length === 1 ? 'item' : 'items'} · {fmt(person.total)}
                  </span>
                </div>
                {mode === 'owed_to_you' && (
                  remindedUids.includes(person.uid) ? (
                    <span className="text-[11px] font-bold text-natural-primary flex items-center gap-1">
                      <Check size={12} /> Reminder sent
                    </span>
                  ) : (
                    <button
                      onClick={() => sendReminder(person.uid, person.total, person.items)}
                      disabled={sendingTo === person.uid}
                      className="shrink-0 text-[11px] font-bold text-natural-primary bg-white border border-natural-primary/30 hover:bg-natural-sage/30 px-3 py-1.5 rounded-full flex items-center gap-1.5 transition-colors disabled:opacity-50"
                    >
                      {sendingTo === person.uid
                        ? <RefreshCcw size={12} className="animate-spin" />
                        : <BellRing size={12} />}
                      Send reminder
                      {!isPlus && <span className="text-[8px] font-bold tracking-wider text-white bg-natural-dark px-1 py-0.5 rounded">Cherry +</span>}
                    </button>
                  )
                )}
              </div>
              <div className="divide-y divide-natural-border/60">
                {person.items.map(({ expense, amount }) => (
                  <button
                    key={expense.id}
                    onClick={() => { onClose(); onSelectExpense(expense); }}
                    className="w-full flex items-center justify-between gap-3 px-4 py-2.5 text-left hover:bg-natural-sidebar/30 transition-colors cursor-pointer group"
                  >
                    <div className="min-w-0">
                      <span className="text-sm font-semibold text-natural-text truncate block">{expense.title}</span>
                      <span className="text-[11px] text-natural-muted font-mono">{fmtDate(expense.date)} · {expense.category}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-sm font-mono font-bold text-natural-text">{fmt(amount)}</span>
                      <ChevronRight size={14} className="text-natural-border group-hover:text-natural-primary transition-colors" />
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))
        )}

        {mode === 'owed_to_you' && byPerson.length > 0 && (
          <p className="text-[11px] text-natural-muted">
            Reminders arrive as a kind, no-pressure email from tartcherry@haveanothercherry.com. One tap, no awkward text message.
          </p>
        )}
      </div>
    </Modal>
  );
}
