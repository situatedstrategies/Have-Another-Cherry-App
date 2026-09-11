import { updateDoc, doc } from 'firebase/firestore';
import { db } from '../firebase';
import { getNormalizedExpenseStatus, roundCurrency } from '../lib/money';
import { mergeExpense } from '../lib/merge';
import { normalizeAmount } from '../lib/limits';
import { CHERRY_ERRORS } from '../lib/errors';
import type { Dispatch, SetStateAction } from 'react';
import { Expense, Group } from '../types';
import { SupportError } from '../lib/errors';

type AddToast = (title: string, message: string, type?: 'info' | 'success' | 'error') => void;
type Setter<T> = Dispatch<SetStateAction<T>>;

export function useExpenseMutations({
  activeUser,
  group,
  expenses,
  setExpenses,
  editingExpense,
  setEditingExpense,
  setShowForm,
  setSelectedExpense,
  broadcastToMembers,
  notifyLedgerEvent,
  addToast,
  setSupportError,
}: {
  activeUser: any;
  group: Group | null;
  expenses: Expense[];
  setExpenses: Setter<Expense[]>;
  editingExpense: Expense | null;
  setEditingExpense: Setter<Expense | null>;
  setShowForm: Setter<boolean>;
  setSelectedExpense: Setter<Expense | null>;
  broadcastToMembers: (action: 'UPSERT' | 'DELETE', payloadObject: unknown) => Promise<void>;
  notifyLedgerEvent: (kind: 'expense_logged' | 'payment_logged') => void;
  addToast: AddToast;
  setSupportError: Setter<SupportError | null>;
}) {
  const handleAddComment = async (expenseId: string, text: string) => {
    if (!group) return;
    const expense = expenses.find((e) => e.id === expenseId);
    if (!expense) return;

    const newComment = {
      id: crypto.randomUUID(),
      userId: activeUser,
      text,
      timestamp: new Date().toISOString(),
    };
    const updatedExp = { ...expense, comments: [...(expense.comments || []), newComment] };
    try {
      await syncExpenseUpdate(updatedExp);
    } catch (e: any) {
      console.error('Comment sync failed', e);
      setSupportError({
        error: CHERRY_ERRORS.expenseSave,
        screen: 'Expense comment',
        detail: String(e?.message || e),
      });
    }
  };

  const handleAddOrEditExpense = async (
    formData: Omit<Expense, 'id' | 'createdAt' | 'status' | 'groupId'>
  ) => {
    if (!group) return;
    const normalizedAmount = normalizeAmount(Number(formData.amount));
    if (!normalizedAmount) {
      setSupportError({ error: CHERRY_ERRORS.amountTooLarge, screen: 'Log expense' });
      return;
    }
    if (normalizedAmount.wasRounded) {
      // Scale the shares by the same factor so they still cover the saved total.
      const scale = normalizedAmount.value / Number(formData.amount);
      const scaled = (v: number) => Math.round(v * scale * 100) / 100;
      formData = {
        ...formData,
        amount: normalizedAmount.value,
        shares: Object.fromEntries(
          Object.entries(formData.shares || {}).map(([uid, s]) => [uid, scaled(Number(s))])
        ),
        ...(formData.thirdPersonShare != null
          ? { thirdPersonShare: scaled(Number(formData.thirdPersonShare)) }
          : {}),
        ...(formData.extraParticipants
          ? {
              extraParticipants: formData.extraParticipants.map((g) => ({
                ...g,
                share: scaled(g.share),
              })),
            }
          : {}),
      };
      addToast(
        'Rounded',
        `Saved as $${normalizedAmount.value.toLocaleString()} - amounts this large round to the nearest $100,000.`,
        'info'
      );
    }
    try {
      if (!group.categories?.includes(formData.category)) {
        const groupRef = doc(db, 'groups', group.id);
        const newCategories = [...(group.categories || []), formData.category];
        await updateDoc(groupRef, { categories: newCategories });
      }

      // Quick settle: an expense already paid back lands closed.
      const quickSettle = (formData as any).quickSettle === true;
      const { quickSettle: _omitQuickSettle, ...cleanForm } = formData as any;

      let finalExpense: Expense;
      if (editingExpense) {
        // Build on the freshest copy, so a settlement logged while the form was
        // open survives the save. `editedAt` marks this content revision.
        const latest = expenses.find((ex) => ex.id === editingExpense.id) || editingExpense;
        finalExpense = { ...latest, ...cleanForm, editedAt: new Date().toISOString() };
        // Re-derive status from the new shares against existing settlements.
        finalExpense.status = getNormalizedExpenseStatus(finalExpense);
        setExpenses((prev) => {
          const updated = prev.map((ex) =>
            ex.id === finalExpense.id ? mergeExpense(ex, finalExpense) : ex
          );
          localStorage.setItem('expenses_' + group.id, JSON.stringify(updated));
          return updated;
        });
        setEditingExpense(null);
        setShowForm(false);
        setSelectedExpense(finalExpense);
      } else {
        const newId = crypto.randomUUID();
        let status: Expense['status'] = 'OPEN';
        let settlements = cleanForm.settlements || [];

        if (quickSettle) {
          const debtors = Object.entries(cleanForm.shares || {}).filter(
            ([uid, share]) => uid !== cleanForm.paidBy && Number(share) > 0
          );
          if (debtors.length > 0) {
            settlements = debtors.map(([uid, share]) => ({
              id: crypto.randomUUID(),
              expenseId: newId,
              paidBy: uid,
              receivedBy: cleanForm.paidBy,
              amount: roundCurrency(Number(share)),
              instrumentType: cleanForm.contributions?.[0]?.instrumentType || 'OTHER',
              label: 'Logged as already settled',
              timestamp: new Date().toISOString(),
              paymentDate: cleanForm.date,
              status: 'confirmed' as const,
            }));
            status = 'CLOSED';
          }
        }

        const createdAt = new Date().toISOString();
        finalExpense = {
          ...cleanForm,
          settlements,
          id: newId,
          groupId: group.id,
          status,
          createdAt,
          editedAt: createdAt,
        };
        setExpenses((prev) => {
          const updated = [finalExpense, ...prev];
          localStorage.setItem('expenses_' + group.id, JSON.stringify(updated));
          return updated;
        });
        setShowForm(false);
      }

      await broadcastToMembers('UPSERT', finalExpense);

      // New expenses only: edits would be noisy.
      if (!editingExpense) notifyLedgerEvent('expense_logged');
    } catch (e: any) {
      console.error(e);
      setSupportError({
        error: CHERRY_ERRORS.expenseSave,
        screen: 'Log expense',
        detail: String(e?.message || e),
      });
    }
  };

  // Recurring bills arrive unclaimed; until claimed an expense owes nobody.
  const handleClaimExpense = async (expenseId: string, payerUid: string) => {
    if (!group) return;
    const groupId = group.id;
    const target = expenses.find((e) => e.id === expenseId);
    if (!target) return;
    const claimed: Expense = { ...target, paidBy: payerUid, editedAt: new Date().toISOString() };
    setExpenses((prev) => {
      const updated = prev.map((e) => (e.id === expenseId ? claimed : e));
      try {
        localStorage.setItem('expenses_' + groupId, JSON.stringify(updated));
      } catch (err) {
        console.error('Failed to persist expenses', err);
      }
      return updated;
    });
    setSelectedExpense(claimed);
    try {
      await broadcastToMembers('UPSERT', claimed);
    } catch (err) {
      console.error('Claim broadcast failed', err);
    }
  };

  const handleDeleteExpense = async (id: string) => {
    // ExpenseDetail already confirms inline.
    if (!group) return;
    const groupId = group.id;
    try {
      const expenseToDelete = expenses.find((e) => e.id === id);
      setExpenses((prev) => {
        const updated = prev.filter((e) => e.id !== id);
        try {
          localStorage.setItem('expenses_' + groupId, JSON.stringify(updated));
        } catch (e) {
          console.error('Failed to persist expenses', e);
        }
        return updated;
      });
      setSelectedExpense(null);

      if (expenseToDelete) {
        await broadcastToMembers('DELETE', { id });
      }
    } catch (e: any) {
      console.error('Delete error:', e);
      setSupportError({
        error: {
          code: 'EXPENSE_DELETE_FAILED',
          title: "That expense didn't delete",
          message: 'The expense could not be removed, so it still stands in the ledger.',
          hint: 'Try again in a moment. If it keeps failing, contact us.',
        },
        screen: 'Ledger',
        detail: String(e?.message || e),
      });
    }
  };

  const syncExpenseUpdate = async (updatedExpense: Expense) => {
    if (!group) return;
    const groupId = group.id;
    // Merge, do not replace: a stale snapshot must not drop a settlement or
    // comment that arrived from another member.
    const current = expenses.find((e) => e.id === updatedExpense.id);
    const merged = current ? mergeExpense(current, updatedExpense) : updatedExpense;
    setExpenses((prev) => {
      const updated = prev.map((e) => (e.id === merged.id ? mergeExpense(e, merged) : e));
      try {
        localStorage.setItem('expenses_' + groupId, JSON.stringify(updated));
      } catch (e) {
        console.error('Failed to persist expenses to localStorage', e);
      }
      return updated;
    });
    setSelectedExpense(merged);
    await broadcastToMembers('UPSERT', merged);
  };

  return {
    handleAddComment,
    handleAddOrEditExpense,
    handleClaimExpense,
    handleDeleteExpense,
    syncExpenseUpdate,
  };
}
