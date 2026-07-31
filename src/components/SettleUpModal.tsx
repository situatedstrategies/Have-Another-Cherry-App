import React, { useState } from 'react';
import { Expense, Group, PaymentInstrument } from '../types';
import { X, Check } from 'lucide-react';
import { getFullMembers } from '../lib/members';

interface SettleUpModalProps {
  expense: Expense;
  group: Group;
  activeUser: string;
  onClose: () => void;
  onSubmit: (paymentInstrument: PaymentInstrument, amount: number, label: string, debtorId: string) => void;
}

export default function SettleUpModal({ expense, group, activeUser, onClose, onSubmit }: SettleUpModalProps) {
  const [paymentMethod, setPaymentMethod] = useState<PaymentInstrument>('TRANSFER');
  const [notes, setNotes] = useState('');
  
  const isCreditor = expense.paidBy === activeUser;
  
  // Find out who owes money on this expense
  const members = getFullMembers(group);
  const debtors = Object.keys(expense.shares || {}).filter(uid => uid !== expense.paidBy && (expense.shares?.[uid] || 0) > 0);
  
  const [selectedDebtor, setSelectedDebtor] = useState(isCreditor ? (debtors[0] || '') : activeUser);
  
  // Calculate remaining amount for the selected debtor
  const getRemainingAmount = (uid: string) => {
    let paid = 0;
    if (expense.settlements) {
      expense.settlements.forEach(s => {
        if (s.paidBy === uid && s.status === 'confirmed') {
          paid += s.amount;
        }
      });
    }
    return Math.max(0, (expense.shares?.[uid] || 0) - paid);
  };

  const [amountToPay, setAmountToPay] = useState(getRemainingAmount(selectedDebtor).toString());

  const handleDebtorChange = (uid: string) => {
    setSelectedDebtor(uid);
    setAmountToPay(getRemainingAmount(uid).toString());
  };

  const handleSettleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(paymentMethod, parseFloat(amountToPay), notes.trim(), selectedDebtor);
  };

  const methods: { label: string; value: PaymentInstrument }[] = [
    { label: 'Cash', value: 'CASH' },
    { label: 'Credit Card', value: 'CREDIT' },
    { label: 'Debit Card', value: 'DEBIT' },
    { label: 'Bank / Venmo', value: 'TRANSFER' },
    { label: 'Other', value: 'OTHER' }
  ];

  return (
    <div className="fixed inset-0 bg-natural-dark/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl border border-natural-border flex flex-col max-h-[90vh] animate-in fade-in-50 zoom-in-95 duration-150">
        <div className="flex items-center justify-between px-6 py-4 border-b border-natural-border">
          <h2 className="text-lg font-display font-bold text-natural-text">
            {isCreditor ? 'Log Received Payment' : 'Settle Expense Share'}
          </h2>
          <button onClick={onClose} className="text-natural-muted hover:text-natural-text hover:bg-natural-sidebar p-2 rounded-xl transition-colors cursor-pointer">
            <X className="h-5 w-5" />
          </button>
        </div>
        
        <form onSubmit={handleSettleSubmit} className="p-6 space-y-5 overflow-y-auto">
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
            <span className="text-[10px] font-bold text-natural-primary uppercase tracking-wider">Settlement Transfer Amount</span>
            <div className="flex items-center text-4xl font-display font-bold text-natural-text mt-1">
              $
              <input 
                type="number"
                step="0.01"
                min="0.01"
                value={amountToPay}
                onChange={(e) => setAmountToPay(e.target.value)}
                className="bg-transparent border-none outline-none w-32 text-center"
              />
            </div>
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
            <button type="submit" disabled={!selectedDebtor} className="w-full py-2.5 text-xs font-semibold text-white bg-natural-primary hover:bg-natural-dark rounded-full shadow-md flex items-center justify-center gap-1.5 transition-all cursor-pointer disabled:opacity-50">
              <Check className="h-4 w-4" /> Log Payment
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
