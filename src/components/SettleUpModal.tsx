import React, { useState } from 'react';
import { Expense, Group, PaymentInstrument } from '../types';
import { Check } from 'lucide-react';
import { getFullMembers } from '../lib/members';
import { getRemainingSettlementAmount, roundCurrency } from '../lib/money';
import Modal from './Modal';

interface SettleUpModalProps {
  expense: Expense;
  group: Group;
  activeUser: string;
  onClose: () => void;
  onSubmit: (paymentInstrument: PaymentInstrument, amount: number, label: string, debtorId: string, paymentDate: string) => void;
}

// Local YYYY-MM-DD (avoids UTC off-by-one from toISOString()).
const todayLocal = () => {
  const d = new Date();
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tz).toISOString().split('T')[0];
};

export default function SettleUpModal({ expense, group, activeUser, onClose, onSubmit }: SettleUpModalProps) {
  const [paymentMethod, setPaymentMethod] = useState<PaymentInstrument>('TRANSFER');
  const [notes, setNotes] = useState('');
  const [paymentDate, setPaymentDate] = useState(todayLocal());
  const [error, setError] = useState('');
  
  const isCreditor = expense.paidBy === activeUser;
  
  // Find out who owes money on this expense
  const members = getFullMembers(group);
  const debtors = Object.keys(expense.shares || {}).filter(uid => uid !== expense.paidBy && (expense.shares?.[uid] || 0) > 0);
  
  const [selectedDebtor, setSelectedDebtor] = useState(isCreditor ? (debtors[0] || '') : activeUser);
  
  // Pending payments reserve part of the balance so the same debt
  // cannot be submitted repeatedly while awaiting confirmation.
  const getRemainingAmount = (uid: string) =>
    getRemainingSettlementAmount(expense, uid, true);

  // Default to empty ($0) — the user enters how much they're settling.
  const [amountToPay, setAmountToPay] = useState('');

  const handleDebtorChange = (uid: string) => {
    setSelectedDebtor(uid);
    setAmountToPay('');
  };

  const handleSettleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const amount = roundCurrency(Number(amountToPay));
    const remaining = getRemainingAmount(selectedDebtor);

    if (!selectedDebtor) {
      setError('Please select the person making the payment.');
      return;
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      setError('Enter a valid payment amount greater than zero.');
      return;
    }

    if (remaining <= 0) {
      setError('This person has no remaining balance on this transaction.');
      return;
    }

    if (amount > remaining) {
      setError(`Payment cannot exceed the remaining balance of $${remaining.toFixed(2)}.`);
      return;
    }

    onSubmit(paymentMethod, amount, notes.trim(), selectedDebtor, paymentDate);
  };

  const methods: { label: string; value: PaymentInstrument }[] = [
    { label: 'Cash', value: 'CASH' },
    { label: 'Credit Card', value: 'CREDIT' },
    { label: 'Debit Card', value: 'DEBIT' },
    { label: 'Bank / Venmo', value: 'TRANSFER' },
    { label: 'Other', value: 'OTHER' }
  ];

  return (
    <Modal onClose={onClose} title={isCreditor ? 'Log Received Payment' : 'Settle Expense Share'} bodyClassName="">
        <form onSubmit={handleSettleSubmit} className="p-6 space-y-5">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm font-semibold">
              {error}
            </div>
          )}
          <div className="bg-natural-sidebar/30 p-4 rounded-2xl border border-natural-border space-y-2">
            <span className="text-[10px] font-bold text-natural-muted uppercase tracking-widest">Expense Details</span>
            <span className="block text-sm font-bold text-natural-text">{expense.title}</span>
            
            {isCreditor ? (
              <div className="pt-2 border-t border-natural-border/60">
                <label className="block text-xs font-bold text-natural-muted uppercase tracking-wider mb-1.5">Payment Received From</label>
                <select 
                  value={selectedDebtor}
                  onChange={(e) => handleDebtorChange(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-natural-border rounded-xl text-natural-text text-sm font-semibold outline-none"
                >
                  {debtors.map(uid => (
                    <option key={uid} value={uid}>{members.find(m => m.uid === uid)?.name || 'Unknown'}</option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="flex justify-between items-center pt-2 border-t border-natural-border/60">
                <span className="text-xs text-natural-muted font-medium">Paying To:</span>
                <span className="text-xs font-bold text-natural-text bg-natural-sidebar px-2 py-0.5 rounded-lg capitalize tracking-wider">
                  {members.find(m => m.uid === expense.paidBy)?.name || 'Unknown'}
                </span>
              </div>
            )}
          </div>

          <div className="flex flex-col items-center justify-center py-4 bg-natural-sage/20 rounded-2xl border border-dashed border-natural-primary/50">
            <span className="text-[10px] font-bold text-natural-primary uppercase tracking-wider">Settle Amount</span>
            <div className="flex items-center text-4xl font-display font-bold text-natural-text mt-1">
              $
              <input
                type="number"
                step="0.01"
                min="0"
                max={getRemainingAmount(selectedDebtor)}
                value={amountToPay}
                onChange={(e) => setAmountToPay(e.target.value)}
                placeholder="0.00"
                className="bg-transparent border-none outline-none w-32 text-center placeholder-natural-muted/40"
              />
            </div>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-[11px] font-medium text-natural-muted">
                Remaining owed: <span className="font-bold text-natural-text">${getRemainingAmount(selectedDebtor).toFixed(2)}</span>
              </span>
              <button
                type="button"
                onClick={() => setAmountToPay(getRemainingAmount(selectedDebtor).toFixed(2))}
                className="text-[11px] font-bold text-natural-primary hover:underline"
              >
                Settle full
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-natural-text uppercase tracking-wider mb-2">Payment Date</label>
            <input
              type="date"
              value={paymentDate}
              max={todayLocal()}
              onChange={(e) => setPaymentDate(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-natural-bg/50 hover:bg-natural-bg focus:bg-white border border-natural-border focus:border-natural-primary rounded-xl text-natural-text text-sm outline-none transition-all"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-natural-text uppercase tracking-wider mb-2">Transaction Payment Type</label>
            <div className="grid grid-cols-3 gap-2">
              {methods.map((m) => (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => setPaymentMethod(m.value)}
                  className={`py-2 px-3 text-xs font-semibold rounded-xl border text-center transition-all cursor-pointer ${
                    paymentMethod === m.value
                      ? 'bg-natural-primary border-natural-primary text-white font-bold shadow-md'
                      : 'bg-white border-natural-border text-natural-muted hover:border-natural-muted hover:bg-natural-sidebar'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-natural-text uppercase tracking-wider mb-2">Transfer Details / Notes</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Venmo confirmation code..."
              className="w-full px-3.5 py-2.5 bg-natural-bg/50 hover:bg-natural-bg focus:bg-white border border-natural-border focus:border-natural-primary rounded-xl text-natural-text text-sm outline-none transition-all"
            />
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button type="button" onClick={onClose} className="w-full py-2.5 text-xs font-semibold text-natural-muted hover:text-natural-text bg-natural-sidebar hover:bg-natural-sidebar/80 rounded-xl transition-all cursor-pointer">
              Cancel
            </button>
            <button type="submit" disabled={!selectedDebtor || getRemainingAmount(selectedDebtor) <= 0} className="w-full py-2.5 text-xs font-semibold text-white bg-natural-primary hover:bg-natural-dark rounded-full shadow-md flex items-center justify-center gap-1.5 transition-all cursor-pointer disabled:opacity-50">
              <Check className="h-4 w-4" /> Log Payment
            </button>
          </div>
        </form>
    </Modal>
  );
}
