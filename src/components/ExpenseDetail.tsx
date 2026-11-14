import React, { useState, useMemo, useEffect } from 'react';
import { useTranslation, Trans } from 'react-i18next';
import { getFullMembers } from '../lib/members';
import { Expense, Group } from '../types';
import {
  isUnclaimed,
  getRemainingSettlementAmount,
  isExpenseFullySettled,
  getNormalizedExpenseStatus,
  getExpenseStatusLabel,
  isDarkCherry,
  getDarkCherryRemaining,
  getDarkCherryPotTotal,
} from '../lib/money';
import {
  X,
  Calendar,
  Tag,
  ShieldCheck,
  CreditCard,
  Clock,
  User,
  Trash2,
  Edit2,
  AlertCircle,
  Repeat,
  Send,
  EyeOff,
  Cherry,
  Ban,
  BellRing,
} from 'lucide-react';
import DarkCherryInfoModal, {
  hasSeenDarkCherryIntro,
  markDarkCherryIntroSeen,
} from './DarkCherryInfoModal';
import ReflectionsSection from './ReflectionsSection';
import { intervalLabel } from '../lib/recurring';
import { formatCurrency, formatDate, formatDateTime } from '../lib/format';
import { instrumentLabel } from '../lib/instruments';
import { labelClass } from '../lib/ui';

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
  onGentleRemind?: () => Promise<void> | void;
  /** Sets the payer on an expense nobody has claimed yet. */
  onClaim?: (payerUid: string) => void;
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
  onAddComment,
  onClaim,
  onGentleRemind,
}: ExpenseDetailProps) {
  const { t } = useTranslation();
  const [isDeleting, setIsDeleting] = useState(false);
  const [nudging, setNudging] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [expandedSettlement, setExpandedSettlement] = useState<string | null>(null);
  // Settlement id awaiting inline "remove entry" confirmation.
  const [voidingSettlement, setVoidingSettlement] = useState<string | null>(null);

  const handleCommentSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentText.trim()) return;
    onAddComment(commentText.trim());
    setCommentText('');
  };

  const members = useMemo(() => getFullMembers(group), [group]);
  const payerMember = members.find((m) => m.uid === expense.paidBy);
  const payerName = payerMember?.name || t('common.someone');
  const isPayerActive = expense.paidBy === activeUser;
  // A nudge is a push to a real account. A pending seat (ghost_N) has no
  // device to reach, so the button only shows when someone who has actually
  // joined still owes on this expense.
  const joinedIds = group.memberIds || [];
  const hasRemindableDebtor = Object.keys(expense.shares || {}).some(
    (uid) =>
      uid !== expense.paidBy &&
      joinedIds.includes(uid) &&
      getRemainingSettlementAmount(expense, uid, false) > 0.01
  );

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
    <div
      className="fixed inset-0 bg-natural-dark/60 backdrop-blur-sm flex items-stretch sm:items-center justify-center z-50 p-0 sm:p-4 animate-in fade-in duration-200"
      id="detail-overlay"
    >
      <div
        className="bg-white rounded-none sm:rounded-3xl w-full h-full sm:h-auto sm:max-w-lg shadow-2xl sm:border border-natural-border flex flex-col max-h-full sm:max-h-[90vh]"
        id="detail-container"
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4 border-b border-natural-border shrink-0"
          id="detail-header"
        >
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-widest text-natural-muted">
              {t('detail.title')}
            </span>
            <span
              className={`px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-md border ${
                getNormalizedExpenseStatus(expense) === 'CLOSED'
                  ? 'bg-natural-pebble text-natural-muted border-natural-border'
                  : ['PENDING', 'PARTIALLY_SETTLED'].includes(getNormalizedExpenseStatus(expense))
                    ? 'bg-natural-pebble text-natural-primary border-natural-primary/25'
                    : 'bg-natural-primary-wash text-natural-primary border-natural-primary/30'
              }`}
              id="detail-status-badge"
            >
              {getExpenseStatusLabel(expense)}
            </span>
          </div>
          <button
            onClick={onClose}
            aria-label={t('common.close')}
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
                <span className="flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5" /> {formatDate(expense.date)}
                </span>
                <span className="flex items-center gap-1.5 uppercase tracking-wider">
                  <Tag className="h-3.5 w-3.5" /> {expense.category}
                </span>
                {expense.isRecurring && (
                  <span className="flex items-center gap-1 text-natural-primary bg-natural-primary/10 px-1.5 py-0.5 rounded-md border border-natural-primary/20">
                    <Repeat className="h-3 w-3" /> {intervalLabel(expense.recurringInterval || '')}
                  </span>
                )}
              </div>
            </div>
            <div className="text-right shrink-0">
              <span className="block text-3xl font-display font-semibold text-natural-text">
                {maskNumbers ? (
                  <span className="inline-flex items-center gap-1.5">
                    <Cherry className="h-7 w-7 text-natural-primary" /> •••
                  </span>
                ) : (
                  formatCurrency(expense.amount)
                )}
              </span>
              <span className="block text-xs font-semibold text-natural-muted mt-1">
                <Trans
                  i18nKey="detail.paidBy"
                  values={{ name: payerName }}
                  components={{ 1: <span className="capitalize text-natural-text" /> }}
                />
              </span>
            </div>
          </div>

          {/* Pending Confirmations Alert */}
          {isCreditorActive && expense.settlements?.some((s) => s.status === 'pending') && (
            <div
              className="p-4 rounded-xl flex flex-col gap-3 bg-natural-sidebar border border-natural-border/20"
              id="detail-pending-settlements"
            >
              {expense.settlements
                .filter((s) => s.status === 'pending')
                .map((s) => (
                  <div
                    key={s.id}
                    className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-white p-3 rounded-lg border border-natural-border/20 shadow-sm"
                  >
                    <div className="flex items-start gap-2">
                      <AlertCircle className="h-4 w-4 text-natural-text mt-0.5 shrink-0" />
                      <div className="text-xs">
                        <p className="font-bold text-natural-text capitalize">
                          {t('detail.someonePaid', {
                            name: members.find((m) => m.uid === s.paidBy)?.name || t('common.someone'),
                            amount: formatCurrency(s.amount),
                          })}
                        </p>
                        <p className="text-natural-muted mt-0.5">
                          {t('detail.via', { method: instrumentLabel(s.instrumentType) })}
                          {s.paymentDate ? ` · ${formatDate(s.paymentDate)}` : ''}
                        </p>
                        {s.label && <p className="text-natural-muted mt-0.5 italic">"{s.label}"</p>}
                      </div>
                    </div>
                    <button
                      onClick={() => onConfirmReceipt(s.id)}
                      className="w-full sm:w-auto px-4 py-2 text-xs font-bold text-white bg-natural-primary hover:bg-natural-primary-ink rounded-xl shadow-sm flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                    >
                      <ShieldCheck className="h-4 w-4" /> {t('detail.confirmReceipt')}
                    </button>
                  </div>
                ))}
            </div>
          )}

          {/* Awaiting Payments Notice for Debtor */}
          {!isCreditorActive &&
            expense.settlements?.some((s) => s.status === 'pending' && s.paidBy === activeUser) && (
              <div className="text-xs font-bold text-natural-text bg-natural-sidebar px-4 py-3 rounded-xl flex items-center gap-1.5 border border-natural-border/20">
                <Clock className="h-5 w-5 animate-pulse shrink-0" />
                <span>{t('detail.waitingConfirm', { name: payerName })}</span>
              </div>
            )}

          {/* Dark Cherry: no cost breakdown - the pot is the whole point. */}
          {isDark ? (
            <div className="space-y-3">
              <h3 className="text-xs font-bold text-natural-dark-cherry uppercase tracking-widest flex items-center gap-1.5">
                <EyeOff className="h-3.5 w-3.5" /> {t('detail.darkHeading')}
              </h3>
              {isPayerActive ? (
                <div className="bg-natural-dark/5 border border-natural-dark/20 rounded-2xl p-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-natural-muted">{t('detail.potTarget')}</span>
                    <span className="font-bold font-mono text-natural-text">
                      {formatCurrency(expense.amount)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-natural-muted">{t('detail.collected')}</span>
                    <span className="font-bold font-mono text-natural-primary">
                      {formatCurrency(getDarkCherryPotTotal(expense, false))}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-natural-muted">{t('detail.stillToGo')}</span>
                    <span className="font-bold font-mono text-natural-text">
                      {formatCurrency(getDarkCherryRemaining(expense, false))}
                    </span>
                  </div>
                  <p className="text-xs text-natural-muted pt-2 border-t border-natural-border/50">
                    <Trans
                      i18nKey="detail.membersCanLog"
                      values={{
                        min: formatCurrency(expense.blindMin || 0),
                        max: formatCurrency(expense.blindMax || 0),
                      }}
                      components={{
                        1: <span className="font-mono font-semibold" />,
                        3: <span className="font-mono font-semibold" />,
                      }}
                    />
                  </p>
                </div>
              ) : (
                <div className="bg-natural-dark/5 border border-natural-dark/20 rounded-2xl p-4">
                  <p className="text-sm text-natural-text leading-relaxed">{t('detail.blindBody')}</p>
                  <button
                    type="button"
                    onClick={() => setShowDarkIntro(true)}
                    className="mt-2 text-xs font-bold text-natural-primary hover:underline"
                  >
                    {t('detail.whatsDark')}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <h3 className="text-xs font-bold text-natural-dark-cherry uppercase tracking-widest">
                {t('detail.costBreakdown')}
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {Object.entries(expense.shares || {}).map(([uid, shareAmt]) => {
                  const isMe = uid === activeUser;
                  const m = members.find((x) => x.uid === uid);
                  return (
                    <div
                      key={uid}
                      className={`p-3 rounded-xl border ${isMe ? 'bg-natural-sidebar border-natural-border shadow-sm' : 'bg-transparent border-natural-border/50'}`}
                    >
                      <span className="block text-[10px] font-bold text-natural-muted uppercase tracking-wider truncate">
                        {isMe ? t('detail.myShare') : m?.name || t('common.someone')}
                      </span>
                      <span
                        className={`text-lg font-semibold font-display mt-1 block ${isMe ? 'text-natural-primary' : 'text-natural-text'}`}
                      >
                        {formatCurrency(shareAmt)}
                      </span>
                    </div>
                  );
                })}
                {expense.splitType === 'third_party' && (
                  <div className="p-3 rounded-xl border bg-transparent border-natural-border/50 text-center">
                    <span className="block text-[10px] font-bold text-natural-muted uppercase tracking-wider truncate">
                      {t('detail.personShare', { name: expense.thirdPersonName })}
                    </span>
                    <span className="text-lg font-semibold font-display text-natural-text mt-1 block">
                      {formatCurrency(expense.thirdPersonShare || 0)}
                    </span>
                  </div>
                )}
                {expense.extraParticipants?.map((g, i) => (
                  <div
                    key={`extra-${i}`}
                    className="p-3 rounded-xl border bg-transparent border-natural-border/50"
                  >
                    <span className="block text-[10px] font-bold text-natural-muted uppercase tracking-wider truncate">
                      {t('detail.guestTag', { name: g.name })}
                    </span>
                    <span className="text-lg font-semibold font-display text-natural-text mt-1 block">
                      {formatCurrency(g.share)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Audit Trail Section */}
          <div className="space-y-4 pt-4 border-t border-natural-border">
            <h3 className="text-xs font-bold text-natural-dark-cherry uppercase tracking-widest">
              {t('detail.auditTrail')}
            </h3>

            <div className="relative border-l-2 border-natural-border pl-5 ml-2.5 space-y-6">
              {/* Created */}
              <div className="relative">
                <div className="absolute -left-[27px] top-0 bg-white border-2 border-natural-border p-1 rounded-full text-natural-muted flex items-center justify-center">
                  <Tag className="h-3.5 w-3.5" />
                </div>
                <div>
                  <span className="block text-xs font-bold text-natural-text">
                    {t('detail.expenseLogged')}
                  </span>
                  <p className="text-xs text-natural-muted mt-0.5">
                    <Trans
                      i18nKey="detail.loggedBy"
                      values={{ name: payerName }}
                      components={{ 1: <span className="font-semibold capitalize text-natural-text" /> }}
                    />
                  </p>
                  <span className="text-xs text-natural-muted font-mono mt-1 block">
                    {formatDateTime(expense.createdAt)}
                  </span>
                </div>
              </div>

              {/* Settlements */}
              {expense.settlements?.map((s) => {
                const isExpanded = expandedSettlement === s.id;
                const isVoided = s.status === 'voided';
                // Either party to the payment can remove an entry logged in error.
                const canVoid =
                  !isVoided && (activeUser === s.paidBy || activeUser === s.receivedBy);
                const voidedByName = s.voidedBy
                  ? members.find((m) => m.uid === s.voidedBy)?.name || t('common.someone')
                  : null;
                return (
                  <div key={s.id} className="relative">
                    <div
                      className={`absolute -left-[27px] top-0 bg-white border-2 ${isVoided ? 'border-natural-border/50 text-natural-muted' : s.status === 'confirmed' ? 'border-natural-primary text-natural-primary' : 'border-natural-border/50 text-natural-text'} p-1 rounded-full flex items-center justify-center`}
                    >
                      {isVoided ? (
                        <Ban className="h-3.5 w-3.5" />
                      ) : s.status === 'confirmed' ? (
                        <ShieldCheck className="h-3.5 w-3.5" />
                      ) : (
                        <Clock className="h-3.5 w-3.5" />
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => setExpandedSettlement(isExpanded ? null : s.id)}
                      className="text-left w-full group"
                    >
                      <span
                        className={`block text-xs font-bold flex items-center gap-1 ${isVoided ? 'text-natural-muted' : 'text-natural-text'}`}
                      >
                        {isVoided
                          ? t('detail.paymentRemoved')
                          : s.status === 'confirmed'
                            ? t('detail.paymentConfirmed')
                            : t('detail.paymentPending')}
                        <span className="text-xs font-normal text-natural-primary group-hover:underline">
                          {isExpanded ? t('detail.hide') : t('detail.details')}
                        </span>
                      </span>
                      <p
                        className={`text-xs text-natural-muted mt-0.5 ${isVoided ? 'line-through' : ''}`}
                      >
                        <Trans
                          i18nKey="detail.paidTo"
                          values={{
                            payer: members.find((m) => m.uid === s.paidBy)?.name || t('common.someone'),
                            amount:
                              maskNumbers && s.paidBy !== activeUser
                                ? t('detail.aContribution')
                                : formatCurrency(s.amount),
                            receiver: members.find((m) => m.uid === s.receivedBy)?.name || payerName,
                            method: instrumentLabel(s.instrumentType),
                          }}
                          components={{
                            1: <strong className={`capitalize ${isVoided ? '' : 'text-natural-text'}`} />,
                            3: <strong />,
                            5: <strong className={`capitalize ${isVoided ? '' : 'text-natural-text'}`} />,
                          }}
                        />
                      </p>
                      {isVoided && (
                        <p className="text-xs text-natural-muted mt-0.5">
                          {voidedByName ? (
                            <Trans
                              i18nKey="detail.removedBy"
                              values={{ name: voidedByName }}
                              components={{ 1: <span className="font-semibold capitalize" /> }}
                            />
                          ) : (
                            t('detail.removed')
                          )}
                          {s.voidedAt ? t('detail.onDate', { date: formatDateTime(s.voidedAt) }) : ''}.{' '}
                          {t('detail.noLongerCounts')}
                        </p>
                      )}
                      <span className="text-xs text-natural-muted font-mono mt-1 block">
                        {formatDateTime(s.timestamp)}
                      </span>
                    </button>

                    {isExpanded && (
                      <div className="mt-2 bg-natural-sidebar/40 border border-natural-border/60 rounded-lg p-3 text-xs space-y-1.5">
                        <div className="flex justify-between">
                          <span className="text-natural-muted">{t('detail.amount')}</span>
                          <span className="font-bold text-natural-text">
                            {maskNumbers && s.paidBy !== activeUser ? (
                              <span className="inline-flex items-center gap-1">
                                <Cherry className="h-3.5 w-3.5 text-natural-primary" /> •••
                              </span>
                            ) : (
                              formatCurrency(s.amount)
                            )}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-natural-muted">{t('detail.method')}</span>
                          <span className="font-semibold text-natural-text">
                            {instrumentLabel(s.instrumentType)}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-natural-muted">{t('detail.paymentDate')}</span>
                          <span className="font-semibold text-natural-text">
                            {s.paymentDate ? formatDate(s.paymentDate) : ' - '}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-natural-muted">{t('detail.logged')}</span>
                          <span className="font-semibold text-natural-text">
                            {formatDateTime(s.timestamp)}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-natural-muted">{t('detail.status')}</span>
                          <span
                            className={`font-bold ${isVoided ? 'text-natural-muted' : s.status === 'confirmed' ? 'text-natural-primary' : 'text-natural-text'}`}
                          >
                            {isVoided
                              ? t('detail.statusRemoved')
                              : s.status === 'confirmed'
                                ? t('detail.statusConfirmed')
                                : t('detail.statusPending')}
                          </span>
                        </div>
                        <div className="pt-1.5 border-t border-natural-border/50">
                          <span className="text-natural-muted block mb-0.5">{t('detail.note')}</span>
                          <span className="text-natural-text">
                            {s.label ? (
                              s.label
                            ) : (
                              <span className="italic text-natural-muted">{t('detail.noNote')}</span>
                            )}
                          </span>
                        </div>
                        {canVoid && (
                          <div className="pt-1.5 border-t border-natural-border/50">
                            {voidingSettlement === s.id ? (
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-xs font-bold text-natural-primary uppercase">
                                  {t('detail.removeEntryQ')}
                                </span>
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => setVoidingSettlement(null)}
                                    className="text-xs font-bold text-natural-muted hover:text-natural-text cursor-pointer"
                                  >
                                    {t('common.cancel')}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setVoidingSettlement(null);
                                      onVoidSettlement(s.id);
                                    }}
                                    className="text-xs font-bold text-white bg-natural-primary hover:bg-natural-primary-ink px-2 py-1 rounded-md cursor-pointer"
                                  >
                                    {t('detail.yesRemove')}
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setVoidingSettlement(s.id)}
                                className="text-xs font-bold text-natural-primary hover:text-natural-dark flex items-center gap-1 cursor-pointer"
                              >
                                <Ban className="h-3 w-3" /> {t('detail.removeEntry')}
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
            <h3 className="text-xs font-bold text-natural-dark-cherry uppercase tracking-widest">
              {t('detail.discussion')}
            </h3>

            <form onSubmit={handleCommentSubmit} className="relative flex items-center">
              <input
                type="text"
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                placeholder={t('detail.commentPlaceholder')}
                aria-label={t('detail.addComment')}
                className="w-full text-xs px-3.5 py-2.5 bg-natural-sidebar/50 border border-natural-border rounded-xl focus:outline-none focus:border-natural-primary pr-10"
              />
              <button
                type="submit"
                disabled={!commentText.trim()}
                aria-label={t('detail.sendComment')}
                className="absolute right-2 text-natural-primary hover:text-natural-dark disabled:opacity-50 disabled:cursor-not-allowed p-1 cursor-pointer"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>

            {expense.comments && expense.comments.length > 0 && (
              <div className="space-y-3 mt-4" id="detail-comments-list">
                {expense.comments.map((c) => (
                  <div key={c.id} className="flex gap-2.5">
                    <div className="h-7 w-7 rounded-full bg-natural-sidebar flex items-center justify-center shrink-0 border border-natural-border">
                      <User className="h-3.5 w-3.5 text-natural-muted" />
                    </div>
                    <div className="bg-natural-sidebar/30 p-3 rounded-xl rounded-tl-none border border-natural-border/50 flex-1">
                      <div className="flex justify-between items-baseline mb-1">
                        <span className="text-xs font-bold text-natural-text capitalize">
                          {members.find((m) => m.uid === c.userId)?.name || t('common.someone')}
                        </span>
                        <span className="text-xs text-natural-muted">
                          {formatDateTime(c.timestamp)}
                        </span>
                      </div>
                      <p className="text-xs text-natural-text">{c.text}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Reflections: how this one felt. Private by default. */}
          <ReflectionsSection expenseId={expense.id} group={group} activeUser={activeUser} />
        </div>

        {/* Footer (Quick Actions) */}
        <div
          className="p-4 bg-natural-sidebar/30 border-t border-natural-border flex flex-col sm:flex-row justify-between items-center gap-3 shrink-0"
          id="detail-footer"
        >
          <div className="flex items-center gap-2 w-full sm:w-auto order-2 sm:order-1">
            {/* A Dark Cherry belongs to its creator: nobody else can edit or
                delete it - the edit form would reveal the hidden numbers. */}
            {!maskNumbers && (
              <>
                <button
                  onClick={onEdit}
                  className="px-3 py-2 text-xs font-semibold text-natural-text hover:bg-natural-sidebar border border-transparent hover:border-natural-border rounded-xl flex items-center gap-1.5 transition-all cursor-pointer"
                >
                  <Edit2 className="h-3.5 w-3.5" /> {t('common.edit')}
                </button>

                {isDeleting ? (
                  <div className="flex items-center gap-2 border border-natural-primary/25 bg-natural-primary/5 px-3 py-1.5 rounded-xl">
                    <span className="text-xs font-bold text-natural-primary uppercase">
                      {t('detail.confirmDelete')}
                    </span>
                    <button
                      onClick={() => setIsDeleting(false)}
                      className="text-xs font-bold text-natural-muted hover:text-natural-text"
                    >
                      {t('common.cancel')}
                    </button>
                    <button
                      onClick={onDelete}
                      className="text-xs font-bold text-white bg-natural-primary hover:bg-natural-primary-ink px-2 py-1 rounded-md"
                    >
                      {t('detail.yesDelete')}
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setIsDeleting(true)}
                    className="px-3 py-2 text-xs font-semibold text-natural-primary hover:text-natural-dark bg-white hover:bg-natural-sidebar/30 border border-natural-primary/15 rounded-xl flex items-center gap-1.5 transition-all cursor-pointer"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> {t('common.delete')}
                  </button>
                )}
              </>
            )}
          </div>

          {/* Nobody has claimed this yet. Recurring bills arrive unattached,
              because who paid this month is not something the definition can
              know. The split stays visible below so the choice is made with
              its consequences on screen, and nothing can be settled until it
              is made: there is nobody to pay. */}
          {isUnclaimed(expense) && (
            <div className="bg-natural-sidebar/60 border border-natural-border rounded-2xl p-4 mb-4">
              <p className={labelClass}>{t('detail.nobodyPaid')}</p>
              <p className="text-sm text-natural-muted mt-1.5 leading-relaxed">
                {t('detail.nobodyPaidBody')}
              </p>
              <div className="mt-3 flex flex-col gap-2">
                {members.map((m) => (
                  <button
                    key={m.uid}
                    onClick={() => onClaim?.(m.uid)}
                    className="w-full px-4 py-2.5 text-sm font-bold text-natural-text bg-white border border-natural-border hover:border-natural-primary hover:text-natural-primary rounded-xl transition-colors cursor-pointer"
                  >
                    {m.uid === activeUser ? t('detail.iPaid') : t('detail.theyPaid', { name: m.name })}
                  </button>
                ))}
              </div>
            </div>
          )}
          {/* State changes (Pay/Confirm) */}
          <div className="flex flex-col sm:flex-row justify-end gap-2 order-1 sm:order-2 w-full sm:w-auto">
            {!isUnclaimed(expense) &&
              !isExpenseFullySettled(expense) &&
              isDebtorActive &&
              (() => {
                if (isDark) {
                  // No numbers on the button - that's the whole point.
                  return (
                    <button
                      onClick={onSettleClick}
                      className="w-full sm:w-auto px-6 py-2.5 text-sm font-bold text-white bg-natural-primary hover:bg-natural-primary-ink rounded-full shadow-md flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                    >
                      <Cherry className="h-4 w-4" /> {t('settle.titleDark')}
                    </button>
                  );
                }

                const leftToPay = getRemainingSettlementAmount(expense, activeUser, true);

                return leftToPay > 0.01 ? (
                  <button
                    onClick={onSettleClick}
                    className="w-full sm:w-auto px-6 py-2.5 text-sm font-bold text-white bg-natural-primary hover:bg-natural-primary-ink rounded-full shadow-md flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                  >
                    <CreditCard className="h-4 w-4" />{' '}
                    {t('detail.settleMyShare', { amount: formatCurrency(leftToPay) })}
                  </button>
                ) : null;
              })()}

            {!isExpenseFullySettled(expense) && isCreditorActive && (
              <>
                {onGentleRemind && hasRemindableDebtor && (
                  <button
                    onClick={async () => {
                      if (nudging) return;
                      setNudging(true);
                      try {
                        await onGentleRemind();
                      } finally {
                        setNudging(false);
                      }
                    }}
                    disabled={nudging}
                    title={t('detail.remindTitle')}
                    className="w-full sm:w-auto px-5 py-2.5 text-sm font-bold text-natural-text bg-white border border-natural-border hover:border-natural-primary hover:text-natural-primary rounded-full shadow-sm flex items-center justify-center gap-1.5 transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    <BellRing className="h-4 w-4" /> {nudging ? t('detail.nudging') : t('detail.gentlyRemind')}
                  </button>
                )}
                <button
                  onClick={onSettleClick}
                  className="w-full sm:w-auto px-6 py-2.5 text-sm font-bold text-natural-primary bg-natural-sage border border-natural-primary/20 hover:bg-natural-primary hover:text-white rounded-full shadow-sm flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                >
                  <CreditCard className="h-4 w-4" /> {t('settle.titleReceived')}
                </button>
              </>
            )}

            {isExpenseFullySettled(expense) && (
              <div className="text-xs font-bold text-natural-primary bg-natural-sage px-3 py-2 rounded-xl flex items-center gap-1.5 border border-natural-primary/20">
                <ShieldCheck className="h-4 w-4" /> {t('detail.settleCompleted')}
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
