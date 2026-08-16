import { useEffect, useRef } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { encryptData, decryptData } from '../lib/crypto';
import { Expense } from '../types';

interface Props {
  activeUser?: string;
  groupId?: string;
  expenses: Expense[];
  setExpenses: React.Dispatch<React.SetStateAction<Expense[]>>;
}

function mergeById<T extends { id: string }>(
  local: T[] = [],
  remote: T[] = []
): T[] {
  const merged = new Map<string, T>();

  for (const item of local) merged.set(item.id, item);
  for (const item of remote) merged.set(item.id, item);

  return Array.from(merged.values());
}

function mergeExpenses(local: Expense[], remote: Expense[]): Expense[] {
  const byId = new Map<string, Expense>();

  for (const expense of local) {
    byId.set(expense.id, expense);
  }

  for (const incoming of remote) {
    const existing = byId.get(incoming.id);

    if (!existing) {
      byId.set(incoming.id, incoming);
      continue;
    }

    byId.set(incoming.id, {
      ...existing,
      ...incoming,
      settlements: mergeById(
        existing.settlements || [],
        incoming.settlements || []
      ),
      comments: mergeById(
        existing.comments || [],
        incoming.comments || []
      ),
    });
  }

  return Array.from(byId.values()).sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );
}

export function useGroupLedgerSnapshot({
  activeUser,
  groupId,
  expenses,
  setExpenses,
}: Props) {
  const hydratedRef = useRef(false);
  const groupRef = useRef<string | undefined>(undefined);

  // Bootstrap the ledger when a user/device enters a group.
  useEffect(() => {
    if (!activeUser || !groupId) return;

    let cancelled = false;
    hydratedRef.current = false;
    groupRef.current = groupId;

    const hydrate = async () => {
      let localExpenses: Expense[] = [];

      try {
        const cached = localStorage.getItem(`expenses_${groupId}`);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed)) localExpenses = parsed;
        }
      } catch (error) {
        console.error('Failed to read local ledger cache', error);
      }

      try {
        const snapshot = await getDoc(doc(db, 'group_ledgers', groupId));

        let remoteExpenses: Expense[] = [];

        if (snapshot.exists() && snapshot.data()?.payload) {
          const decrypted = await decryptData(
            snapshot.data().payload,
            groupId
          );

          if (Array.isArray(decrypted)) {
            remoteExpenses = decrypted as Expense[];
          }
        }

        const merged = mergeExpenses(localExpenses, remoteExpenses);

        if (!cancelled && groupRef.current === groupId) {
          setExpenses(merged);

          try {
            localStorage.setItem(
              `expenses_${groupId}`,
              JSON.stringify(merged)
            );
          } catch (error) {
            console.error('Failed to persist hydrated ledger', error);
          }

          hydratedRef.current = true;
        }
      } catch (error) {
        console.error('Group ledger hydration failed', error);

        // Don't destroy a valid local ledger if cloud hydration fails.
        if (!cancelled && groupRef.current === groupId) {
          setExpenses(localExpenses);
          hydratedRef.current = true;
        }
      }
    };

    hydrate();

    return () => {
      cancelled = true;
    };
  }, [activeUser, groupId, setExpenses]);

  // Keep an encrypted group snapshot current after hydration.
  useEffect(() => {
    if (
      !activeUser ||
      !groupId ||
      !hydratedRef.current ||
      groupRef.current !== groupId
    ) {
      return;
    }

    let cancelled = false;

    const persist = async () => {
      try {
        const payload = await encryptData(expenses, groupId);

        if (cancelled) return;

        await setDoc(
          doc(db, 'group_ledgers', groupId),
          {
            groupId,
            payload,
            updatedAt: new Date().toISOString(),
            updatedBy: activeUser,
          },
          { merge: true }
        );
      } catch (error) {
        console.error('Group ledger snapshot write failed', error);
      }
    };

    persist();

    return () => {
      cancelled = true;
    };
  }, [activeUser, groupId, expenses]);
}
