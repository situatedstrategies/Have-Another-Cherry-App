import { useEffect, useRef } from 'react';
import { collection, query, onSnapshot, deleteDoc, doc, setDoc, where } from 'firebase/firestore';
import { db } from '../firebase';
import { claimSeats } from '../lib/seatClaims';
import { mergeExpense } from '../lib/merge';
import { advanceIntervalStr, parseLocalDate, todayLocal, toLocalIso } from '../lib/recurring';
import { encryptData, decryptData } from '../lib/crypto';
import { useGroupLedgerSnapshot } from './useGroupLedgerSnapshot';
import type { Dispatch, SetStateAction } from 'react';
import { Expense, Group } from '../types';

type AddToast = (title: string, message: string, type?: 'info' | 'success' | 'error') => void;
type Setter<T> = Dispatch<SetStateAction<T>>;

export function useLedgerSync({
  activeUser,
  group,
  memberIdsKey,
  expenses,
  setExpenses,
  addToast,
}: {
  activeUser: any;
  group: Group | null;
  memberIdsKey: string;
  expenses: Expense[];
  setExpenses: Setter<Expense[]>;
  addToast: AddToast;
}) {
  // Keyed on the group id, not the group object, so unrelated field updates
  // do not reload the ledger.
  useEffect(() => {
    if (!activeUser || !group) return;
    const stored = localStorage.getItem('expenses_' + group.id);
    if (stored) {
      try {
        setExpenses(JSON.parse(stored));
      } catch (e) {
        console.error('Failed to parse cached expenses', e);
      }
    } else {
      setExpenses([]);
    }
  }, [activeUser, group?.id]);

  // Historical backfill from the shared encrypted snapshot.
  useGroupLedgerSnapshot({
    activeUser,
    groupId: group?.id,
    expenses,
    setExpenses,
  });

  // Claim placeholder seats (lib/seatClaims) whenever the ledger or roster
  // changes, so an open tab heals the moment a join lands; the persist
  // effect then writes the claimed ledger back.
  useEffect(() => {
    if (!group?.id || !memberIdsKey || expenses.length === 0) return;
    const claimed = claimSeats(expenses, memberIdsKey.split(','));
    if (!claimed.changed) return;
    setExpenses(claimed.expenses);
    try {
      localStorage.setItem('expenses_' + group.id, JSON.stringify(claimed.expenses));
    } catch {}
  }, [expenses, memberIdsKey, group?.id]);

  // Transfer queue: encrypted expense upserts and deletes from other members.
  useEffect(() => {
    if (!activeUser || !group) return;

    const groupId = group.id;
    const q = query(collection(db, 'transfer_queue'), where('to', '==', activeUser));

    const unsubscribe = onSnapshot(
      q,
      async (snapshot) => {
        const newExps: Expense[] = [];
        const deletedIds: string[] = [];

        for (const change of snapshot.docChanges()) {
          if (change.type !== 'added') continue;

          const data = change.doc.data();

          // Leftovers from a group the user previously belonged to.
          if (data.groupId && data.groupId !== groupId) continue;

          try {
            const decrypted = await decryptData(data.payload, groupId);

            // Never delete a queue item we could not decrypt.
            if (!decrypted) continue;

            if (data.action === 'DELETE') {
              deletedIds.push(decrypted.id);
            } else {
              newExps.push(decrypted as Expense);
            }

            deleteDoc(doc(db, 'transfer_queue', change.doc.id)).catch(console.error);
          } catch (e) {
            console.error('Transfer queue decrypt failed', e);
          }
        }

        if (newExps.length === 0 && deletedIds.length === 0) return;

        setExpenses((prev) => {
          const updated = prev.filter((expense) => !deletedIds.includes(expense.id));

          for (const incoming of newExps) {
            const idx = updated.findIndex((expense) => expense.id === incoming.id);

            if (idx >= 0) {
              updated[idx] = mergeExpense(updated[idx], incoming);
            } else {
              updated.push(incoming);
            }
          }

          updated.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

          try {
            localStorage.setItem(`expenses_${groupId}`, JSON.stringify(updated));
          } catch (e) {
            console.error('Failed to persist synced ledger', e);
          }

          return updated;
        });
      },
      (error) => {
        console.error('transfer_queue listener error:', error);
      }
    );

    return () => unsubscribe();
  }, [activeUser, group?.id]);

  // Recurring autopilot. Only the payer's own account spawns instances, so two
  // members cannot double-log, and copies carry recurringSourceId + date as a
  // duplicate guard. Runs at most once per group per day per session.
  const recurringAutopilotRef = useRef('');

  useEffect(() => {
    if (!activeUser || !group || expenses.length === 0) return;
    const groupId = group.id;
    const memberIds = group.memberIds || [];
    const runKey = `${groupId}:${todayLocal()}`;
    if (recurringAutopilotRef.current === runKey) return;

    const today = todayLocal();
    // Materialise a cycle two weeks early, keeping its real future date.
    const horizon = (() => {
      const d = new Date(today + 'T00:00:00');
      d.setDate(d.getDate() + 14);
      return toLocalIso(d);
    })();
    const spawned: Expense[] = [];
    const sourceUpdates = new Map<string, string>(); // source id -> new nextRecurringDate

    for (const exp of expenses) {
      if (!exp.isRecurring || !exp.nextRecurringDate || exp.paidBy !== activeUser) continue;
      let next: string = exp.nextRecurringDate;
      let guard = 0;
      while (next && next <= horizon && guard < 24) {
        guard++;
        const dueDate = next;
        const dupe =
          expenses.some((x) => x.recurringSourceId === exp.id && x.date === dueDate) ||
          spawned.some((x) => x.recurringSourceId === exp.id && x.date === dueDate);
        if (!dupe) {
          spawned.push({
            ...exp,
            id: crypto.randomUUID(),
            date: dueDate,
            // Unclaimed: the definition's payer is a claim about last year,
            // not this month. Someone claims it when it is actually paid.
            paidBy: '',
            createdAt: new Date().toISOString(),
            editedAt: new Date().toISOString(),
            status: 'OPEN',
            settlements: [],
            comments: [],
            isRecurring: false,
            recurringInterval: undefined,
            nextRecurringDate: undefined,
            recurringSourceId: exp.id,
          });
        }
        // Anchored on the definition's own day, so the 31st stays the 31st.
        next = advanceIntervalStr(
          dueDate,
          exp.recurringInterval,
          parseLocalDate(exp.date).getDate()
        );
      }
      if (next !== exp.nextRecurringDate) sourceUpdates.set(exp.id, next);
    }

    recurringAutopilotRef.current = runKey;
    if (spawned.length === 0 && sourceUpdates.size === 0) return;

    setExpenses((prev) => {
      const updated = prev.map((e) =>
        sourceUpdates.has(e.id)
          ? {
              ...e,
              nextRecurringDate: sourceUpdates.get(e.id)!,
              editedAt: new Date().toISOString(),
            }
          : e
      );
      const merged = [...spawned, ...updated].sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      );
      try {
        localStorage.setItem('expenses_' + groupId, JSON.stringify(merged));
      } catch (e) {
        console.error('Failed to persist autopilot ledger', e);
      }
      return merged;
    });

    (async () => {
      try {
        const others = memberIds.filter((id) => id !== activeUser);
        const toSend: Expense[] = [
          ...spawned,
          ...expenses
            .filter((e) => sourceUpdates.has(e.id))
            .map((e) => ({
              ...e,
              nextRecurringDate: sourceUpdates.get(e.id)!,
              editedAt: new Date().toISOString(),
            })),
        ];
        for (const expensePayload of toSend) {
          const encrypted = await encryptData(expensePayload, groupId);
          await Promise.allSettled(
            others.map((memberId) =>
              setDoc(doc(collection(db, 'transfer_queue')), {
                to: memberId,
                from: activeUser,
                groupId,
                action: 'UPSERT',
                payload: encrypted,
                createdAt: new Date().toISOString(),
              })
            )
          );
        }
      } catch (e) {
        console.error('Recurring autopilot sync failed', e);
      }
    })();

    if (spawned.length > 0) {
      addToast(
        'Recurring Logged',
        spawned.length === 1
          ? `"${spawned[0].title}" was auto-logged from your recurring schedule.`
          : `${spawned.length} recurring expenses were auto-logged.`,
        'success'
      );
    }
  }, [activeUser, group?.id, expenses]);
}
