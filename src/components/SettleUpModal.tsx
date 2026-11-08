import React, { useState } from 'react';
import { useTranslation, Trans } from 'react-i18next';
import { todayLocal } from '../lib/recurring';
import { Expense, Group, PaymentInstrument } from '../types';
import { Check, Cherry, ExternalLink, Copy } from 'lucide-react';
import { getFullMembers } from '../lib/members';
import {
  getRemainingSettlementAmount,
  roundCurrency,
  isDarkCherry,
  getDarkCherryRemaining,
} from '../lib/money';
import { venmoTarget, zelleTarget } from '../lib/paymentLinks';
import Modal from './Modal';
import { labelClass } from '../lib/ui';
import { formatCurrency } from '../lib/format';
import { PAYMENT_INSTRUMENTS, instrumentLabel } from '../lib/instruments';

interface SettleUpModalProps {
  expense: Expense;
  group: Group;
  activeUser: string;
  /** Decrypted Venmo/Zelle handles per member uid (decrypted in App). */
  paymentHandlesByUid?: Record<string, { venmo?: string; zelle?: string }>;
  onClose: () => void;
  onSubmit: (
    paymentInstrument: PaymentInstrument,
    amount: number,
    label: string,
    debtorId: string,
    paymentDate: string
  ) => void;
}

export default function SettleUpModal({
  expense,
  group,
  activeUser,
  paymentHandlesByUid,
  onClose,
  onSubmit,
}: SettleUpModalProps) {
  const { t } = useTranslation();
  const [paymentMethod, setPaymentMethod] = useState<PaymentInstrument>('TRANSFER');
  const [notes, setNotes] = useState('');
  const [paymentDate, setPaymentDate] = useState(todayLocal());
  const [error, setError] = useState('');

  const isCreditor = expense.paidBy === activeUser;
  const isDark = isDarkCherry(expense);
  // Contributors to a Dark Cherry only ever see the allowed payment range.
  const blindContributor = isDark && !isCreditor;

  // Find out who owes money on this expense. On a Dark Cherry every other
  // member may contribute (there are no per-person shares).
  const members = getFullMembers(group);
  const debtors = isDark
    ? members.map((m) => m.uid).filter((uid) => uid !== expense.paidBy)
    : Object.keys(expense.shares || {}).filter(
        (uid) => uid !== expense.paidBy && (expense.shares?.[uid] || 0) > 0
      );

  const [selectedDebtor, setSelectedDebtor] = useState(isCreditor ? debtors[0] || '' : activeUser);

  // Pending payments reserve part of the balance so the same debt
  // cannot be submitted repeatedly while awaiting confirmation.
  const getRemainingAmount = (uid: string) =>
    isDark
      ? getDarkCherryRemaining(expense, true)
      : getRemainingSettlementAmount(expense, uid, true);

  // Default to empty ($0) - the user enters how much they're settling.
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
      setError(t('settle.selectPerson'));
      return;
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      setError(t('settle.validAmount'));
      return;
    }

    if (blindContributor) {
      // Only the creator's chosen range is enforced - never the (hidden) pot.
      const min = expense.blindMin || 0.01;
      const max = expense.blindMax || Number.MAX_SAFE_INTEGER;
      if (amount < min || amount > max) {
        setError(
          t('settle.darkRange', { min: formatCurrency(min), max: formatCurrency(max) })
        );
        return;
      }
    } else {
      if (remaining <= 0) {
        setError(t('settle.noRemaining'));
        return;
      }

      if (amount > remaining) {
        setError(t('settle.exceeds', { amount: formatCurrency(remaining) }));
        return;
      }
    }

    onSubmit(paymentMethod, amount, notes.trim(), selectedDebtor, paymentDate);
  };

  const methods: { label: string; value: PaymentInstrument }[] = PAYMENT_INSTRUMENTS.map(
    (value) => ({ label: instrumentLabel(value), value })
  );

  // Deep-link-lite: hand the payer straight into Venmo/Zelle. With a stored
  // handle, Venmo opens prefilled; otherwise the button still gets them there.
  const recipientHandles = paymentHandlesByUid?.[expense.paidBy] || {};
  const payAmount = roundCurrency(Number(amountToPay) || 0);
  const payNote = `Have Another Cherry: ${expense.title}`.slice(0, 140);
  const venmo = recipientHandles.venmo
    ? venmoTarget(recipientHandles.venmo, payAmount, payNote)
    : null;
  const zelle = recipientHandles.zelle ? zelleTarget(recipientHandles.zelle) : null;
  const [copiedZelle, setCopiedZelle] = useState(false);

  const copyZelleHandle = () => {
    if (!zelle) return;
    navigator.clipboard.writeText(zelle.copyText || zelle.handle).catch(() => {});
    setCopiedZelle(true);
    setTimeout(() => setCopiedZelle(false), 2000);
  };

  return (
    <Modal
      onClose={onClose}
      title={
        isCreditor
          ? t('settle.titleReceived')
          : blindContributor
            ? t('settle.titleDark')
            : t('settle.titleShare')
      }
      icon={blindContributor ? <Cherry className="h-5 w-5 text-natural-primary" /> : undefined}
      bodyClassName=""
    >
      <form onSubmit={handleSettleSubmit} className="p-6 space-y-5">
        {error && (
          <div className="p-3 bg-natural-primary/5 border border-natural-primary/25 rounded-xl text-natural-primary text-sm font-semibold">
            {error}
          </div>
        )}
        <div className="bg-natural-sidebar/30 p-4 rounded-2xl border border-natural-border space-y-2">
          <span className="text-[10px] font-bold text-natural-muted uppercase tracking-widest">
            {t('settle.expenseDetails')}
          </span>
          <span className="block text-sm font-bold text-natural-text">{expense.title}</span>

          {isCreditor ? (
            <div className="pt-2 border-t border-natural-border/60">
              <label className={`${labelClass} block mb-1.5`}>{t('settle.receivedFrom')}</label>
              <select
                value={selectedDebtor}
                onChange={(e) => handleDebtorChange(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-natural-border rounded-xl text-natural-text text-sm font-semibold outline-none"
              >
                {debtors.map((uid) => (
                  <option key={uid} value={uid}>
                    {members.find((m) => m.uid === uid)?.name || t('common.someone')}
                  </option>
                ))}
              </select>
              {/* Logging a payment the debtor already logged creates a duplicate,
                    those are waiting on a Confirm Receipt instead. */}
              {(expense.settlements || [])
                .filter((s) => s.status === 'pending' && s.paidBy === selectedDebtor)
                .map((s) => (
                  <p
                    key={s.id}
                    className="mt-2 text-xs text-natural-muted bg-natural-primary/5 border border-natural-primary/25 rounded-lg px-2.5 py-1.5"
                  >
                    <Trans
                      i18nKey="settle.alreadyLogged"
                      values={{
                        amount: formatCurrency(s.amount),
                        method: instrumentLabel(s.instrumentType),
                      }}
                      components={{
                        1: <span className="font-bold text-natural-text" />,
                        3: <span className="font-semibold" />,
                      }}
                    />
                  </p>
                ))}
            </div>
          ) : (
            <div className="flex justify-between items-center pt-2 border-t border-natural-border/60">
              <span className="text-xs text-natural-muted font-medium">{t('settle.payingTo')}</span>
              <span className="text-xs font-bold text-natural-text bg-natural-sidebar px-2 py-0.5 rounded-lg capitalize tracking-wider">
                {members.find((m) => m.uid === expense.paidBy)?.name || t('common.someone')}
              </span>
            </div>
          )}
        </div>

        <div className="flex flex-col items-center justify-center py-4 bg-natural-sage/20 rounded-2xl border border-dashed border-natural-primary/50">
          <span className="text-[10px] font-bold text-natural-primary uppercase tracking-wider">
            {blindContributor ? t('settle.titleDark') : t('settle.settleAmount')}
          </span>
          <div className="flex items-center text-3xl sm:text-4xl font-display font-semibold text-natural-text mt-1">
            $
            <input
              type="number"
              step="0.01"
              min={blindContributor ? expense.blindMin || 0 : 0}
              max={
                blindContributor
                  ? expense.blindMax || undefined
                  : getRemainingAmount(selectedDebtor)
              }
              value={amountToPay}
              onChange={(e) => setAmountToPay(e.target.value)}
              placeholder="0.00"
              className="bg-transparent border-none outline-none w-32 text-center placeholder-natural-muted/40"
            />
          </div>
          {blindContributor ? (
            <span className="text-xs font-medium text-natural-muted mt-1">
              <Trans
                i18nKey="settle.anythingBetween"
                values={{
                  min: formatCurrency(expense.blindMin || 0),
                  max: formatCurrency(expense.blindMax || 0),
                }}
                components={{
                  1: <span className="font-bold text-natural-text" />,
                  3: <span className="font-bold text-natural-text" />,
                }}
              />
            </span>
          ) : (
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs font-medium text-natural-muted">
                <Trans
                  i18nKey="settle.remainingOwed"
                  values={{ amount: formatCurrency(getRemainingAmount(selectedDebtor)) }}
                  components={{ 1: <span className="font-bold text-natural-text" /> }}
                />
              </span>
              <button
                type="button"
                onClick={() => setAmountToPay(getRemainingAmount(selectedDebtor).toFixed(2))}
                className="text-xs font-bold text-natural-primary hover:underline"
              >
                {t('settle.settleFull')}
              </button>
            </div>
          )}
        </div>

        <div>
          <label className="block text-xs font-bold text-natural-text uppercase tracking-wider mb-2">
            {t('settle.paymentDate')}
          </label>
          <input
            type="date"
            value={paymentDate}
            max={todayLocal()}
            onChange={(e) => setPaymentDate(e.target.value)}
            className="w-full px-3.5 py-2.5 bg-natural-bg/50 hover:bg-natural-bg focus:bg-white border border-natural-border focus:border-natural-primary rounded-xl text-natural-text text-sm outline-none transition-all"
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-natural-text uppercase tracking-wider mb-2">
            {t('settle.paymentType')}
          </label>
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

          {/* Deep-link-lite: jump out of the app into Venmo/Zelle. */}
          {!isCreditor && paymentMethod === 'VENMO' && (
            <div className="mt-3 bg-natural-sidebar/40 border border-natural-border rounded-xl p-3 space-y-2">
              <p className="text-xs text-natural-muted">
                {venmo ? (
                  <>
                    <Trans
                      i18nKey="settle.venmoPrefilled"
                      values={{ handle: venmo.handle }}
                      components={{ 1: <span className="font-bold text-natural-text" /> }}
                    />
                  </>
                ) : (
                  <>
                    {t('settle.venmoNoHandle')}
                  </>
                )}
              </p>
              <a
                href={venmo?.url || 'https://venmo.com/'}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-2 text-xs font-bold text-white bg-[#008CFF] hover:opacity-90 rounded-xl flex items-center justify-center gap-1.5 transition-opacity"
              >
                <ExternalLink size={14} /> {t('settle.openVenmo')}
              </a>
              <p className="text-xs text-natural-muted">{t('settle.comeBack')}</p>
            </div>
          )}

          {!isCreditor && paymentMethod === 'ZELLE' && (
            <div className="mt-3 bg-natural-sidebar/40 border border-natural-border rounded-xl p-3 space-y-2">
              {zelle ? (
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs text-natural-muted min-w-0">
                    <Trans
                      i18nKey="settle.theirZelle"
                      values={{ handle: zelle.handle }}
                      components={{ 1: <span className="font-bold text-natural-text break-all" /> }}
                    />
                  </p>
                  <button
                    type="button"
                    onClick={copyZelleHandle}
                    className="shrink-0 text-xs font-bold text-natural-primary flex items-center gap-1 hover:underline"
                  >
                    <Copy size={12} /> {copiedZelle ? t('common.copied') : t('common.copy')}
                  </button>
                </div>
              ) : (
                <p className="text-xs text-natural-muted">
                  {t('settle.zelleNoHandle')}
                </p>
              )}
              <a
                href="https://www.zellepay.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-2 text-xs font-bold text-white bg-[#6D1ED4] hover:opacity-90 rounded-xl flex items-center justify-center gap-1.5 transition-opacity"
              >
                <ExternalLink size={14} /> {t('settle.openZelle')}
              </a>
              <p className="text-xs text-natural-muted">{t('settle.comeBack')}</p>
            </div>
          )}
        </div>

        <div>
          <label className="block text-xs font-bold text-natural-text uppercase tracking-wider mb-2">
            {t('settle.notesLabel')}
          </label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={t('settle.notePlaceholder')}
            className="w-full px-3.5 py-2.5 bg-natural-bg/50 hover:bg-natural-bg focus:bg-white border border-natural-border focus:border-natural-primary rounded-xl text-natural-text text-sm outline-none transition-all"
          />
        </div>

        <div className="flex items-center gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="w-full py-2.5 text-sm font-semibold text-natural-muted hover:text-natural-text bg-natural-sidebar hover:bg-natural-sidebar/80 rounded-xl transition-all cursor-pointer"
          >
            {t('common.cancel')}
          </button>
          <button
            type="submit"
            disabled={
              !selectedDebtor || (!blindContributor && getRemainingAmount(selectedDebtor) <= 0)
            }
            className="w-full py-2.5 text-sm font-semibold text-white bg-natural-primary hover:bg-natural-primary-ink rounded-full shadow-md flex items-center justify-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
          >
            <Check className="h-4 w-4" /> {t('settle.logPayment')}
          </button>
        </div>
      </form>
    </Modal>
  );
}
