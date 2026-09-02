import { useEffect, useRef } from 'react';
import { collection, doc, getDoc, getDocs, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { encryptData, decryptData } from '../lib/crypto';
import { mergeExpenseLists } from '../lib/merge';
import { splitForArchive } from '../lib/archive';
import { Expense } from '../types';

interface Props {
  activeUser?: string;
  groupId?: string;
  expenses: Expense[];
  setExpenses: React.Dispatch<React.SetStateAction<Expense[]>>;
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

        // Cold storage. The Flutter client moves entries older than six months
        // into group_ledgers/{id}/archive/{YYYY-MM} and drops them from the
        // document read above, so without this the web client simply stopped
        // showing anything older than six months once a phone had synced.
        //
        // Read after the main document rather than in parallel: the recent
        // half is what anyone is looking at, and a household with years of
        // history has a document per month to decrypt.
        let archived: Expense[] = [];
        try {
          const months = await getDocs(
            collection(db, 'group_ledgers', groupId, 'archive')
          );
          for (const month of months.docs) {
            const payload = month.data()?.payload;
            if (!payload) continue;
            const decrypted = await decryptData(payload, groupId);
            if (Array.isArray(decrypted)) {
              archived = archived.concat(decrypted as Expense[]);
            }
          }
        } catch (error) {
          // Never fatal. Missing archive means older history is not shown
          // this session; failing the whole hydrate would hide everything.
          console.error('Ledger archive read failed', error);
        }

        const merged = mergeExpenseLists(
          localExpenses,
          remoteExpenses.concat(archived)
        );

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
        // Split before writing, exactly as the Flutter client does. Writing
        // the whole list here would put every archived entry back into the
        // main document on the next keystroke, undoing the archive and growing
        // the blob the archive exists to keep small.
        const split = splitForArchive(expenses);
        const now = new Date().toISOString();

        // Archive months go first. If the process dies in between, the worst
        // case is an entry present in both places, which merges back to
        // itself. The other order loses it outright.
        if (split.hasArchive) {
          for (const [month, entries] of Object.entries(split.byMonth)) {
            const monthRef = doc(db, 'group_ledgers', groupId, 'archive', month);

            // Merge with whatever that month already holds: this write only
            // sees what is currently in memory, which after a previous archive
            // pass is a subset of the month.
            let existing: Expense[] = [];
            try {
              const snap = await getDoc(monthRef);
              const payload = snap.data()?.payload;
              if (payload) {
                const decrypted = await decryptData(payload, groupId);
                if (Array.isArray(decrypted)) existing = decrypted as Expense[];
              }
            } catch (error) {
              console.error(`Archive month ${month} read failed`, error);
            }

            const mergedMonth = mergeExpenseLists(existing, entries);
            const monthPayload = await encryptData(mergedMonth, groupId);
            if (cancelled) return;
            await setDoc(
              monthRef,
              { groupId, month, payload: monthPayload, updatedAt: now, updatedBy: activeUser },
              { merge: true }
            );
          }
        }

        const payload = await encryptData(split.recent, groupId);

        if (cancelled) return;

        await setDoc(
          doc(db, 'group_ledgers', groupId),
          {
            groupId,
            payload,
            updatedAt: now,
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
