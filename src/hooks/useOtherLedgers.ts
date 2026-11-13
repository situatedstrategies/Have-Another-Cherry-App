import { useEffect, useState } from 'react';
import { collection, doc, getDoc, getDocs, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { decryptData } from '../lib/crypto';
import { mergeExpenseLists } from '../lib/merge';
import { Expense } from '../types';

export interface OtherLedgers {
  /** Each other group's full ledger (live document plus the archive months). */
  ledgers: Record<string, Expense[]>;
  /** Member names across those groups, for the by-person charts. */
  names: Record<string, string>;
  /** Member ids per group. */
  memberIds: Record<string, string[]>;
  loading: boolean;
}

const EMPTY: OtherLedgers = { ledgers: {}, names: {}, memberIds: {}, loading: false };

/**
 * The other groups' ledgers for the "All my groups" view, loaded only while
 * [enabled]. Each group's ledger is decrypted with its own key (the group id,
 * as everywhere in lib/crypto's callers), read-only: nothing here is ever
 * written back or cached. The live document is a snapshot listener so a line
 * logged in the other household shows up; the archive months are read once.
 * Every listener is dropped the moment [enabled] turns false or the ids
 * change, and the state is cleared with them.
 */
export function useOtherLedgers(groupIds: string[], enabled: boolean): OtherLedgers {
  const key = groupIds.slice().sort().join(',');
  const [state, setState] = useState<OtherLedgers>(EMPTY);

  useEffect(() => {
    if (!enabled || !key) {
      setState(EMPTY);
      return;
    }
    const ids = key.split(',');
    let cancelled = false;
    const live: Record<string, Expense[]> = {};
    const archived: Record<string, Expense[]> = {};
    const names: Record<string, string> = {};
    const memberIds: Record<string, string[]> = {};
    let pending = ids.length * 2;
    setState({ ledgers: {}, names: {}, memberIds: {}, loading: true });

    const publish = () => {
      if (cancelled) return;
      const ledgers: Record<string, Expense[]> = {};
      for (const gid of ids) {
        ledgers[gid] = mergeExpenseLists(archived[gid] || [], live[gid] || []);
      }
      setState({ ledgers, names: { ...names }, memberIds: { ...memberIds }, loading: pending > 0 });
    };
    const settle = () => {
      pending = Math.max(0, pending - 1);
      publish();
    };

    const unsubs = ids.map((gid) => {
      // Who is in it, for the names on the charts. Any member may `get` a group.
      getDoc(doc(db, 'groups', gid))
        .then((snap) => {
          const data = snap.data() as { members?: { uid?: string; name?: string }[] } | undefined;
          const uids: string[] = [];
          for (const m of data?.members || []) {
            if (m?.uid) {
              uids.push(m.uid);
              if (m.name) names[m.uid] = m.name;
            }
          }
          memberIds[gid] = uids;
        })
        .catch(() => {});
      // Cold storage, once.
      getDocs(collection(db, 'group_ledgers', gid, 'archive'))
        .then(async (months) => {
          let all: Expense[] = [];
          for (const month of months.docs) {
            const payload = month.data()?.payload;
            if (!payload) continue;
            const decrypted = await decryptData(payload, gid);
            if (Array.isArray(decrypted)) all = all.concat(decrypted as Expense[]);
          }
          archived[gid] = all;
        })
        .catch((e) => console.error('Other ledger archive read failed', e))
        .finally(settle);
      // The recent half, live.
      let first = true;
      return onSnapshot(
        doc(db, 'group_ledgers', gid),
        async (snap) => {
          try {
            const payload = snap.exists() ? snap.data()?.payload : null;
            const decrypted = payload ? await decryptData(payload, gid) : null;
            live[gid] = Array.isArray(decrypted) ? (decrypted as Expense[]) : [];
          } catch (e) {
            console.error('Other ledger read failed', e);
          }
          if (first) {
            first = false;
            settle();
          } else {
            publish();
          }
        },
        (error) => {
          if (error.code === 'permission-denied' && !auth.currentUser) return;
          console.error('Other ledger listener error for ' + gid + ':', error);
          if (first) {
            first = false;
            settle();
          }
        }
      );
    });

    return () => {
      cancelled = true;
      unsubs.forEach((u) => u());
      setState(EMPTY);
    };
  }, [enabled, key]);

  return state;
}
