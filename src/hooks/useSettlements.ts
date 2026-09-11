import { doc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { getFullMembers } from '../lib/members';
import { computeMismatchForSettlement } from '../lib/mismatch';
import {
  getRemainingSettlementAmount,
  getNormalizedExpenseStatus,
  roundCurrency,
  isDarkCherry,
  getDarkCherryRemaining,
} from '../lib/money';
import { todayLocal } from '../lib/recurring';
import { CHERRY_ERRORS } from '../lib/errors';
import type { Dispatch, SetStateAction } from 'react';
import { Expense, Group } from '../types';
import { SupportError } from '../lib/errors';

type AddToast = (title: string, message: string, type?: 'info' | 'success' | 'error') => void;
type Setter<T> = Dispatch<SetStateAction<T>>;

export function useSettlements({
  activeUser,
  group,
  expenses,
  selectedExpense,
  setShowSettleModal,
  syncExpenseUpdate,
  notifyLedgerEvent,
  addToast,
  setSupportError,
}: {
  activeUser: any;
  group: Group | null;
  expenses: Expense[];
  selectedExpense: Expense | null;
  setShowSettleModal: Setter<boolean>;
  syncExpenseUpdate: (updatedExpense: Expense) => Promise<void>;
  notifyLedgerEvent: (kind: 'expense_logged' | 'payment_logged') => void;
  addToast: AddToast;
  setSupportError: Setter<SupportError | null>;
}) {
  const handleSettleUpProposal = async (
    instrumentType: import('../types').PaymentInstrument,
    amount: number,
    label: string,
    debtorId: string,
    paymentDate?: string
  ) => {
    if (!selectedExpense || !group) return;

    // Validate against the freshest copy, not the one the modal opened with.
    const expense = expenses.find((e) => e.id === selectedExpense.id) || selectedExpense;

    const normalizedAmount = roundCurrency(amount);
    // A pending seat (ghost_N) is a valid debtor; the claim pass rewrites the
    // settlement to their real uid when they join.
    const baseValid =
      getFullMembers(group).some((m) => m.uid === debtorId) &&
      Number.isFinite(normalizedAmount) &&
      normalizedAmount > 0;

    if (isDarkCherry(expense)) {
      // Contributors are bound by the creator's per-payment range; the creator
      // is bound by what is left in the pot.
      const isCreatorLogging = expense.paidBy === activeUser;
      if (isCreatorLogging) {
        const potRemaining = getDarkCherryRemaining(expense, true);
        if (!baseValid || normalizedAmount > potRemaining) {
          addToast(
            'Invalid Payment',
            `Payment must be between $0.01 and $${potRemaining.toFixed(2)}.`,
            'info'
          );
          return;
        }
      } else {
        const min = expense.blindMin || 0.01;
        const max = expense.blindMax || Number.MAX_SAFE_INTEGER;
        if (!baseValid || normalizedAmount < min || normalizedAmount > max) {
          addToast(
            'Invalid Payment',
            `Payments on this Dark Cherry are between $${min.toFixed(2)} and $${max.toFixed(2)}.`,
            'info'
          );
          return;
        }
      }
    } else {
      const remainingAmount = getRemainingSettlementAmount(expense, debtorId, true);
      if (!baseValid || normalizedAmount > remainingAmount) {
        addToast(
          'Invalid Payment',
          `Payment must be between $0.01 and $${remainingAmount.toFixed(2)}.`,
          'info'
        );
        return;
      }
    }

    const isCreditor = expense.paidBy === activeUser;

    // A received payment that exactly matches a pending one is a confirmation
    // of it, not a second payment.
    if (isCreditor) {
      const matchingPending = (expense.settlements || []).find(
        (s) =>
          s.status === 'pending' &&
          s.paidBy === debtorId &&
          Math.abs(s.amount - normalizedAmount) < 0.005
      );
      if (matchingPending) {
        setShowSettleModal(false);
        await handleConfirmSettleReceipt(matchingPending.id);
        return;
      }
    }

    const newSettlement: import('../types').Settlement = {
      id: crypto.randomUUID(),
      expenseId: expense.id,
      paidBy: debtorId,
      receivedBy: expense.paidBy,
      amount: normalizedAmount,
      instrumentType: instrumentType,
      label: label,
      timestamp: new Date().toISOString(),
      paymentDate: paymentDate || todayLocal(),
      status: isCreditor ? 'confirmed' : 'pending',
      mismatchType: computeMismatchForSettlement(expense, instrumentType),
    };

    const settlements = [...(expense.settlements || []), newSettlement];

    // Per-debtor status, so one overpaid debtor cannot mask another's shortfall.
    const updatedExp: Expense = { ...expense, settlements };
    updatedExp.status = getNormalizedExpenseStatus(updatedExp);
    try {
      setShowSettleModal(false);
      await syncExpenseUpdate(updatedExp);
      // Toast only after the write: "logged" over a failed save gets a payment sent twice.
      addToast(
        isCreditor ? 'Payment Logged' : 'Settlement Logged',
        isCreditor ? 'The received payment was recorded.' : 'Your payment is pending confirmation.',
        'success'
      );
      notifyLedgerEvent('payment_logged');

      const computedMismatch = computeMismatchForSettlement(expense, instrumentType);
      if (computedMismatch !== 'NOT_CLASSIFIABLE' && computedMismatch !== 'NO_MISMATCH') {
        const mismatchRef = doc(db, 'group_mismatches', group.id, 'events', newSettlement.id);
        await setDoc(mismatchRef, {
          expenseId: expense.id,
          settlementId: newSettlement.id,
          mismatchType: computedMismatch,
          paidBy: debtorId,
          receivedBy: expense.paidBy,
          amount: normalizedAmount,
          timestamp: newSettlement.timestamp,
        }).catch((e) => console.error('Data write failed', e));
      }
    } catch (e: any) {
      console.error(e);
      setSupportError({
        error: CHERRY_ERRORS.settlementSave,
        screen: 'Settle up',
        detail: String(e?.message || e),
      });
    }
  };

  const handleConfirmSettleReceipt = async (settlementId: string) => {
    if (!group || !selectedExpense) return;
    const expense = expenses.find((e) => e.id === selectedExpense.id);
    if (!expense) return;

    const settlements = (expense.settlements || []).map((s) =>
      s.id === settlementId ? { ...s, status: 'confirmed' as const } : s
    );

    const updatedExp: Expense = { ...expense, settlements };
    updatedExp.status = getNormalizedExpenseStatus(updatedExp);
    try {
      await syncExpenseUpdate(updatedExp);
      addToast('Receipt Confirmed', 'The payment has been confirmed.', 'success');
    } catch (e: any) {
      console.error('Confirm receipt failed', e);
      setSupportError({
        error: CHERRY_ERRORS.settlementSave,
        screen: 'Confirm receipt',
        detail: String(e?.message || e),
      });
    }
  };

  // Voids rather than deletes: the tombstone stops a merge from another
  // device resurrecting the entry.
  const handleVoidSettlement = async (settlementId: string) => {
    if (!group || !selectedExpense) return;
    const expense = expenses.find((e) => e.id === selectedExpense.id);
    if (!expense) return;

    const target = (expense.settlements || []).find((s) => s.id === settlementId);
    if (!target || target.status === 'voided') return;

    const settlements = (expense.settlements || []).map((s) =>
      s.id === settlementId
        ? {
            ...s,
            status: 'voided' as const,
            voidedAt: new Date().toISOString(),
            voidedBy: activeUser,
          }
        : s
    );

    const updatedExp: Expense = { ...expense, settlements };
    updatedExp.status = getNormalizedExpenseStatus(updatedExp);
    try {
      await syncExpenseUpdate(updatedExp);
      addToast(
        'Payment Removed',
        'The payment entry was removed and the balance updated.',
        'success'
      );
    } catch (e: any) {
      console.error('Void settlement failed', e);
      setSupportError({
        error: CHERRY_ERRORS.settlementSave,
        screen: 'Remove payment entry',
        detail: String(e?.message || e),
      });
    }
  };

  return { handleSettleUpProposal, handleConfirmSettleReceipt, handleVoidSettlement };
}
