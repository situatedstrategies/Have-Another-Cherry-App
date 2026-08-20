import React, { useState, useMemo, useEffect } from 'react';
import { getFullMembers } from '../lib/members';
import { Expense, Group } from '../types';
import { getRemainingSettlementAmount, isExpenseFullySettled, getNormalizedExpenseStatus, getExpenseStatusLabel, isDarkCherry, getDarkCherryRemaining, getDarkCherryPotTotal } from '../lib/money';
import { X, Calendar, Tag, ShieldCheck, CreditCard, Clock, User, Trash2, Edit2, AlertCircle, Repeat, Send, EyeOff, Cherry, Ban } from 'lucide-react';
import DarkCherryInfoModal, { hasSeenDarkCherryIntro, markDarkCherryIntroSeen } from './DarkCherryInfoModal';

interface ExpenseDetailProps {
  expense: Expense;
  group: Group;
  activeUser: string;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onSettleClick: () => void;
  onConfirmReceipt: (settlementId: string) => void;
  onVoidSettlement: (settlementId: string) => void;
  onAddComment: (text: string) => void;
}

export default function ExpenseDetail({
  expense,
  group,
  activeUser,
  onClose,
  onEdit,
  onDelete,
  onSettleClick,
  onConfirmReceipt,
  onVoidSettlement,
  onAddComment
}: ExpenseDetailProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [expandedSettlement, setExpandedSettlement] = useState<string | null>(null);
  // Settlement id awaiting inline "remove entry" confirmation.
  const [voidingSettlement, setVoidingSettlement] = useState<string | null>(null);

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '';
    // Date-only strings (YYYY-MM-DD) should render without timezone shifting.
    const d = /^\d{4}-\d{2}-\d{2}$/.test(dateStr) ? new Date(dateStr + 'T00:00:00') : new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };
  
  const handleCommentSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentText.trim()) return;
    onAddComment(commentText.trim());
    setCommentText('');
  };
  
  const formatDateTime = (dateStr?: string) => {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const members = useMemo(() => getFullMembers(group), [group]);
  const payerMember = members.find(m => m.uid === expense.paidBy);
  const payerName = payerMember?.name || 'Unknown';
  const isPayerActive = expense.paidBy === activeUser;
  
  const myShare = expense.shares?.[activeUser] || 0;
  const isDark = isDarkCherry(expense);
  // Dark Cherry: only its creator sees numbers; everyone else just contributes.
  const maskNumbers = isDark && !isPayerActive;
  const isDebtorActive = (!isPayerActive && myShare > 0) || (isDark && !isPayerActive);
  const isCreditorActive = isPayerActive;

  const [showDarkIntro, setShowDarkIntro] = useState(false);
  useEffect(() => {
    if (maskNumbers && !hasSeenDarkCherryIntro(activeUser)) {
      setShowDarkIntro(true);
    }
  }, [maskNumbers, activeUser]);

  return (
    <div className="fixed inset-0 bg-natural-dark/60 backdrop-blur-sm flex items-stretch sm:items-center justify-center z-50 p-0 sm:p-4 animate-in fade-in duration-200" id="detail-overlay">
      <div className="bg-white rounded-none sm:rounded-3xl w-full h-full sm:h-auto sm:max-w-lg shadow-2xl sm:border border-natural-border flex flex-col max-h-full sm:max-h-[90vh]" id="detail-container">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-natural-border shrink-0" id="detail-header">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-widest text-natural-muted">Expense Details</span>
            <span className={`px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-md border ${
              getNormalizedExpenseStatus(expense) === 'CLOSED'
                ? 'bg-natural-sage text-natural-primary border-natural-primary/20'
                : getNormalizedExpenseStatus(expense) === 'PARTIALLY_SETTLED'
                ? 'bg-natural-sidebar text-natural-text border-natural-border/20'
                : 'bg-natural-sidebar text-natural-muted border-natural-border'
            }`} id="detail-status-badge">
              {getExpenseStatusLabel(expense)}
            </span>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-natural-muted hover:text-natural-text hover:bg-natural-sidebar p-2 rounded-xl transition-colors cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body (Scrollable) */}
        <div className="p-6 overflow-y-auto space-y-8" id="detail-body">
          
          {/* Main Info */}
          <div className="flex items-start justify-between">
            <div className="pr-4">
              <h2 className="text-2xl font-display font-semibold text-natural-text mb-2">
                {expense.title}
              </h2>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-semibold text-natural-muted">
                <span className="flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5" /> {formatDate(expense.date)}</span>
                <span className="flex items-center gap-1.5 uppercase tracking-wider"><Tag className="h-3.5 w-3.5" /> {expense.category}</span>
                {expense.isRecurring && (
                  <span className="flex items-center gap-1 text-natural-primary bg-natural-primary/10 px-1.5 py-0.5 rounded-md border border-natural-primary/20">
                    <Repeat className="h-3 w-3" /> {expense.recurringInterval}
                  </span>
                )}
              </div>
            </div>
            <div className="text-right shrink-0">
              <span className="block text-3xl font-display font-semibold text-natural-text">
                {maskNumbers
                  ? <span className="inline-flex items-center gap-1.5"><Cherry className="h-7 w-7 text-natural-primary" /> •••</span>
                  : `$${expense.amount.toFixed(2)}`}
              </span>
              <span className="block text-xs font-semibold text-natural-muted mt-1">
                Paid by <span className="capitalize text-natural-text">{payerName}</span>
              </span>
            </div>
          </div>

          {/* Pending Confirmations Alert */}
          {isCreditorActive && expense.settlements?.some(s => s.status === 'pending') && (
            <div className="p-4 rounded-xl flex flex-col gap-3 bg-natural-sidebar border border-natural-border/20" id="detail-pending-settlements">
              {expense.settlements.filter(s => s.status === 'pending').map(s => (
                <div key={s.id} className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-white p-3 rounded-lg border border-natural-border/20 shadow-sm">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 text-natural-text mt-0.5 shrink-0" />
                    <div className="text-xs">
                      <p className="font-bold text-natural-text capitalize">
                        {members.find(m => m.uid === s.paidBy)?.name || 'Someone'} paid ${s.amount.toFixed(2)}
                      </p>
                      <p className="text-natural-muted mt-0.5">
                        via {s.instrumentType}{s.paymentDate ? ` · ${formatDate(s.paymentDate)}` : ''}
                      </p>
                      {s.label && (
                        <p className="text-natural-muted mt-0.5 italic">"{s.label}"</p>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => onConfirmReceipt(s.id)}
                    className="w-full sm:w-auto px-4 py-2 text-xs font-bold text-white bg-natural-primary hover:bg-[#A00E00] rounded-xl shadow-sm flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                  >
                    <ShieldCheck className="h-4 w-4" /> Confirm Receipt
                  </button>
                </div>
              ))}
            </div>
          )}
          
          {/* Awaiting Payments Notice for Debtor */}
          {!isCreditorActive && expense.settlements?.some(s => s.status === 'pending' && s.paidBy === activeUser) && (
            <div className="text-xs font-bold text-natural-text bg-natural-sidebar px-4 py-3 rounded-xl flex items-center gap-1.5 border border-natural-border/20">
              <Clock className="h-5 w-5 animate-pulse shrink-0" /> 
              <span>Waiting for {payerName} to confirm your payment.</span>
            </div>
          )}

          {/* Dark Cherry: no cost breakdown - the pot is the whole point. */}
          {isDark ? (
            <div className="space-y-3">
              <h3 className="text-xs font-bold text-natural-muted uppercase tracking-widest flex items-center gap-1.5">
                <EyeOff className="h-3.5 w-3.5" /> Dark Cherry - Blind Split
              </h3>
              {isPayerActive ? (
                <div className="bg-natural-dark/5 border border-natural-dark/20 rounded-2xl p-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-natural-muted">Pot target</span>
                    <span className="font-bold font-mono text-natural-text">${expense.amount.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-natural-muted">Collected (confirmed)</span>
                    <span className="font-bold font-mono text-natural-primary">${getDarkCherryPotTotal(expense, false).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-natural-muted">Still to go</span>
                    <span className="font-bold font-mono text-natural-text">${getDarkCherryRemaining(expense, false).toFixed(2)}</span>
                  </div>
                  <p className="text-[11px] text-natural-muted pt-2 border-t border-natural-border/50">
                    Members can log between <span className="font-mono font-semibold">${(expense.blindMin || 0).toFixed(2)}</span> and{' '}
                    <span className="font-mono font-semibold">${(expense.blindMax || 0).toFixed(2)}</span> per payment.
                    Only you can see these numbers.
                  </p>
                </div>
              ) : (
                <div className="bg-natural-dark/5 border border-natural-dark/20 rounded-2xl p-4">
                  <p className="text-sm text-natural-text leading-relaxed">
                    This is a blind split: chip in what you can, when you can. The total and
                    the pot stay hidden - when it's covered, the cherry closes on its own.
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowDarkIntro(true)}
                    className="mt-2 text-xs font-bold text-natural-primary hover:underline"
                  >
                    What's a Dark Cherry?
                  </button>
                </div>
              )}
            </div>
          ) : (
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-natural-muted uppercase tracking-widest">Cost Breakdown</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {Object.entries(expense.shares || {}).map(([uid, shareAmt]) => {
                const isMe = uid === activeUser;
                const m = members.find(x => x.uid === uid);
                return (
                  <div key={uid} className={`p-3 rounded-xl border ${isMe ? 'bg-natural-sidebar border-natural-border shadow-sm' : 'bg-transparent border-natural-border/50'}`}>
                    <span className="block text-[10px] font-bold text-natural-muted uppercase tracking-wider truncate">
                      {isMe ? 'My Share' : (m?.name || 'Unknown')}
                    </span>
                    <span className={`text-lg font-semibold font-display mt-1 block ${isMe ? 'text-natural-primary' : 'text-natural-text'}`}>
                      ${shareAmt.toFixed(2)}
                    </span>
                  </div>
                );
              })}
              {expense.splitType === 'third_party' && (
                <div className="p-3 rounded-xl border bg-transparent border-natural-border/50 text-center">
                  <span className="block text-[10px] font-bold text-natural-muted uppercase tracking-wider truncate">{expense.thirdPersonName}'s Share</span>
                  <span className="text-lg font-semibold font-display text-natural-text mt-1 block">
                    ${expense.thirdPersonShare?.toFixed(2)}
                  </span>
                </div>
              )}
              {expense.extraParticipants?.map((g, i) => (
                <div key={`extra-${i}`} className="p-3 rounded-xl border bg-transparent border-natural-border/50">
                  <span className="block text-[10px] font-bold text-natural-muted uppercase tracking-wider truncate">{g.name} (guest)</span>
                  <span className="text-lg font-semibold font-display text-natural-text mt-1 block">
                    ${g.share.toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          </div>
          )}

          {/* Audit Trail Section */}
          <div className="space-y-4 pt-4 border-t border-natural-border">
            <h3 className="text-xs font-bold text-natural-muted uppercase tracking-widest">Expense Audit Trail</h3>
            
            <div className="relative border-l-2 border-natural-border pl-5 ml-2.5 space-y-6">
              {/* Created */}
              <div className="relative">
                <div className="absolute -left-[27px] top-0 bg-white border-2 border-natural-border p-1 rounded-full text-natural-muted flex items-center justify-center">
                  <Tag className="h-3.5 w-3.5" />
                </div>
                <div>
                  <span className="block text-xs font-bold text-natural-text">Expense Logged</span>
                  <p className="text-xs text-natural-muted mt-0.5">
                    Logged by <span className="font-semibold capitalize text-natural-text">{payerName}</span>.
                  </p>
                  <span className="text-[10px] text-natural-muted font-mono mt-1 block">
                    {formatDateTime(expense.createdAt)}
                  </span>
                </div>
              </div>

              {/* Settlements */}
              {expense.settlements?.map((s) => {
                const isExpanded = expandedSettlement === s.id;
                const isVoided = s.status === 'voided';
                // Either party to the payment can remove an entry logged in error.
                const canVoid = !isVoided && (activeUser === s.paidBy || activeUser === s.receivedBy);
                const voidedByName = s.voidedBy ? (members.find(m => m.uid === s.voidedBy)?.name || 'a member') : null;
                return (
                <div key={s.id} className="relative">
                  <div className={`absolute -left-[27px] top-0 bg-white border-2 ${isVoided ? 'border-natural-border/50 text-natural-muted' : s.status === 'confirmed' ? 'border-natural-primary text-natural-primary' : 'border-natural-border/50 text-natural-text'} p-1 rounded-full flex items-center justify-center`}>
                    {isVoided ? <Ban className="h-3.5 w-3.5" /> : s.status === 'confirmed' ? <ShieldCheck className="h-3.5 w-3.5" /> : <Clock className="h-3.5 w-3.5" />}
                  </div>
                  <button
                    type="button"
                    onClick={() => setExpandedSettlement(isExpanded ? null : s.id)}
                    className="text-left w-full group"
                  >
                    <span className={`block text-xs font-bold flex items-center gap-1 ${isVoided ? 'text-natural-muted' : 'text-natural-text'}`}>
                      {isVoided ? 'Payment Removed' : s.status === 'confirmed' ? 'Payment Confirmed' : 'Payment Logged (Pending)'}
                      <span className="text-[10px] font-normal text-natural-primary group-hover:underline">{isExpanded ? 'Hide' : 'Details'}</span>
                    </span>
                    <p className={`text-xs text-natural-muted mt-0.5 ${isVoided ? 'line-through' : ''}`}>
                      <strong className={`capitalize ${isVoided ? '' : 'text-natural-text'}`}>{members.find(m => m.uid === s.paidBy)?.name || 'Someone'}</strong> paid{' '}
                      {maskNumbers && s.paidBy !== activeUser
                        ? <strong>a contribution</strong>
                        : <strong>${s.amount.toFixed(2)}</strong>}{' '}
                      to <strong className={`capitalize ${isVoided ? '' : 'text-natural-text'}`}>{members.find(m => m.uid === s.receivedBy)?.name || payerName}</strong> via {s.instrumentType}.
                    </p>
                    {isVoided && (
                      <p className="text-[10px] text-natural-muted mt-0.5">
                        Removed{voidedByName ? <> by <span className="font-semibold capitalize">{voidedByName}</span></> : ''}{s.voidedAt ? ` on ${formatDateTime(s.voidedAt)}` : ''} — no longer counts toward the balance.
                      </p>
                    )}
                    <span className="text-[10px] text-natural-muted font-mono mt-1 block">
                      {formatDateTime(s.timestamp)}
                    </span>
                  </button>

                  {isExpanded && (
                    <div className="mt-2 bg-natural-sidebar/40 border border-natural-border/60 rounded-lg p-3 text-xs space-y-1.5">
                      <div className="flex justify-between"><span className="text-natural-muted">Amount</span><span className="font-bold text-natural-text">{maskNumbers && s.paidBy !== activeUser ? <span className="inline-flex items-center gap-1"><Cherry className="h-3.5 w-3.5 text-natural-primary" /> •••</span> : `$${s.amount.toFixed(2)}`}</span></div>
                      <div className="flex justify-between"><span className="text-natural-muted">Method</span><span className="font-semibold text-natural-text">{s.instrumentType}</span></div>
                      <div className="flex justify-between"><span className="text-natural-muted">Payment date</span><span className="font-semibold text-natural-text">{s.paymentDate ? formatDate(s.paymentDate) : ' - '}</span></div>
                      <div className="flex justify-between"><span className="text-natural-muted">Logged</span><span className="font-semibold text-natural-text">{formatDateTime(s.timestamp)}</span></div>
                      <div className="flex justify-between"><span className="text-natural-muted">Status</span><span className={`font-bold ${isVoided ? 'text-natural-muted' : s.status === 'confirmed' ? 'text-natural-primary' : 'text-natural-text'}`}>{isVoided ? 'Removed' : s.status === 'confirmed' ? 'Confirmed' : 'Pending confirmation'}</span></div>
                      <div className="pt-1.5 border-t border-natural-border/50">
                        <span className="text-natural-muted block mb-0.5">Note</span>
                        <span className="text-natural-text">{s.label ? s.label : <span className="italic text-natural-muted">No note added.</span>}</span>
                      </div>
                      {canVoid && (
                        <div className="pt-1.5 border-t border-natural-border/50">
                          {voidingSettlement === s.id ? (
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[11px] font-bold text-rose-600 uppercase">Remove this payment entry?</span>
                              <div className="flex items-center gap-2">
                                <button type="button" onClick={() => setVoidingSettlement(null)} className="text-[11px] font-bold text-natural-muted hover:text-natural-text cursor-pointer">Cancel</button>
                                <button
                                  type="button"
                                  onClick={() => { setVoidingSettlement(null); onVoidSettlement(s.id); }}
                                  className="text-[11px] font-bold text-white bg-rose-600 hover:bg-rose-700 px-2 py-1 rounded-md cursor-pointer"
                                >
                                  Yes, Remove
                                </button>
                              </div>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setVoidingSettlement(s.id)}
                              className="text-[11px] font-bold text-rose-600 hover:text-rose-800 flex items-center gap-1 cursor-pointer"
                            >
                              <Ban className="h-3 w-3" /> Remove entry (logged in error)
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                );
              })}
            </div>
          </div>

          {/* Comments Section */}
          <div className="space-y-4 pt-4 border-t border-natural-border">
            <h3 className="text-xs font-bold text-natural-muted uppercase tracking-widest">Discussion</h3>

            <form onSubmit={handleCommentSubmit} className="relative flex items-center">
              <input
                type="text"
                value={commentText}
                onChange={e => setCommentText(e.target.value)}
                placeholder="Add a comment..."
                className="w-full text-xs px-3.5 py-2.5 bg-natural-sidebar/50 border border-natural-border rounded-xl focus:outline-none focus:border-natural-primary pr-10"
              />
              <button 
                type="submit" 
                disabled={!commentText.trim()}
                className="absolute right-2 text-natural-primary hover:text-natural-dark disabled:opacity-50 disabled:cursor-not-allowed p-1 cursor-pointer"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>

            {expense.comments && expense.comments.length > 0 && (
              <div className="space-y-3 mt-4">
                {expense.comments.map(c => (
                  <div key={c.id} className="flex gap-2.5">
                    <div className="h-7 w-7 rounded-full bg-natural-sidebar flex items-center justify-center shrink-0 border border-natural-border">
                      <User className="h-3.5 w-3.5 text-natural-muted" />
                    </div>
                    <div className="bg-natural-sidebar/30 p-3 rounded-xl rounded-tl-none border border-natural-border/50 flex-1">
                      <div className="flex justify-between items-baseline mb-1">
                        <span className="text-xs font-bold text-natural-text capitalize">{members.find(m => m.uid === c.userId)?.name || 'Unknown'}</span>
                        <span className="text-[10px] text-natural-muted">{formatDateTime(c.timestamp)}</span>
                      </div>
                      <p className="text-xs text-natural-text">{c.text}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          
        </div>

        {/* Footer (Quick Actions) */}
        <div className="p-4 bg-natural-sidebar/30 border-t border-natural-border flex flex-col sm:flex-row justify-between items-center gap-3 shrink-0" id="detail-footer">
          <div className="flex items-center gap-2 w-full sm:w-auto order-2 sm:order-1">
            {/* A Dark Cherry belongs to its creator: nobody else can edit or
                delete it - the edit form would reveal the hidden numbers. */}
            {!maskNumbers && (
            <>
            <button
              onClick={onEdit}
              className="px-3 py-2 text-xs font-semibold text-natural-text hover:bg-natural-sidebar border border-transparent hover:border-natural-border rounded-xl flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <Edit2 className="h-3.5 w-3.5" /> Edit
            </button>

            {isDeleting ? (
              <div className="flex items-center gap-2 border border-rose-200 bg-rose-50 px-3 py-1.5 rounded-xl">
                <span className="text-[10px] font-bold text-rose-600 uppercase">Confirm Delete?</span>
                <button onClick={() => setIsDeleting(false)} className="text-[10px] font-bold text-natural-muted hover:text-natural-text">Cancel</button>
                <button onClick={onDelete} className="text-[10px] font-bold text-white bg-rose-600 hover:bg-rose-700 px-2 py-1 rounded-md">Yes, Delete</button>
              </div>
            ) : (
              <button
                onClick={() => setIsDeleting(true)}
                className="px-3 py-2 text-xs font-semibold text-rose-600 hover:text-rose-800 bg-white hover:bg-natural-sidebar/30 border border-rose-200/50 rounded-xl flex items-center gap-1.5 transition-all cursor-pointer"
              >
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </button>
            )}
            </>
            )}
          </div>
          
          {/* State changes (Pay/Confirm) */}
          <div className="flex flex-col sm:flex-row justify-end gap-2 order-1 sm:order-2 w-full sm:w-auto">
            {!isExpenseFullySettled(expense) && isDebtorActive && (() => {
              if (isDark) {
                // No numbers on the button - that's the whole point.
                return (
                  <button
                    onClick={onSettleClick}
                    className="w-full sm:w-auto px-6 py-2.5 text-xs font-bold text-white bg-natural-primary hover:bg-[#A00E00] rounded-full shadow-md flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                  >
                    <Cherry className="h-4 w-4" /> Dark Cherry Chip In
                  </button>
                );
              }

              const leftToPay = getRemainingSettlementAmount(expense, activeUser, true);

              return leftToPay > 0.01 ? (
                <button
                  onClick={onSettleClick}
                  className="w-full sm:w-auto px-6 py-2.5 text-xs font-bold text-white bg-natural-primary hover:bg-[#A00E00] rounded-full shadow-md flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                >
                  <CreditCard className="h-4 w-4" /> Settle My Share (${leftToPay.toFixed(2)})
                </button>
              ) : null;
            })()}
            
            {!isExpenseFullySettled(expense) && isCreditorActive && (
              <button
                onClick={onSettleClick}
                className="w-full sm:w-auto px-6 py-2.5 text-xs font-bold text-natural-primary bg-natural-sage border border-natural-primary/20 hover:bg-natural-primary hover:text-white rounded-full shadow-sm flex items-center justify-center gap-1.5 transition-all cursor-pointer"
              >
                <CreditCard className="h-4 w-4" /> Log Received Payment
              </button>
            )}

            {isExpenseFullySettled(expense) && (
              <div className="text-xs font-bold text-natural-primary bg-natural-sage px-3 py-2 rounded-xl flex items-center gap-1.5 border border-natural-primary/20">
                <ShieldCheck className="h-4 w-4" /> Settle Completed
              </div>
            )}
          </div>
        </div>
      </div>

      {showDarkIntro && (
        <DarkCherryInfoModal
          onClose={() => {
            markDarkCherryIntroSeen(activeUser);
            setShowDarkIntro(false);
          }}
        />
      )}
    </div>
  );
}
