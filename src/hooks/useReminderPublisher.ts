import { useEffect, useRef } from 'react';
import { deleteDoc, doc, getDoc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { decryptData } from '../lib/crypto';
import { pushPermission } from '../lib/push';
import { buildReminderIndex, reminderIndexSignature } from '../lib/reminderIndex';
import { Expense, VaultData } from '../types';

/**
 * Keeps `reminder_schedules/{groupId}` in step with what is actually due,
 * so the daily server job can send "due tomorrow" pushes to a household
 * that only uses the web. Port of the iOS reminder publisher.
 *
 * Reminders are a Cherry+ feature and the index is the one thing that
 * crosses out of the encrypted side, so without the entitlement, or without
 * push permission in this browser, the stored index is deleted rather than
 * left behind.
 */
export function useReminderPublisher({
  uid,
  groupId,
  expenses,
  isPlus,
}: {
  uid: string | null;
  groupId: string | null;
  expenses: Expense[];
  isPlus: boolean;
}) {
  const published = useRef<Record<string, string>>({});
  const vaultRef = useRef<VaultData | null>(null);
  const tick = useRef(0);

  // The vault is loaded here rather than borrowed from the modal, because
  // the index has to stay current whether or not the vault is open.
  useEffect(() => {
    if (!groupId || !isPlus) return;
    const unsub = onSnapshot(doc(db, 'group_vault', groupId), async (snap) => {
      try {
        const payload = snap.data()?.payload;
        const decrypted = payload ? await decryptData(payload, groupId) : null;
        vaultRef.current =
          decrypted && typeof decrypted === 'object'
            ? {
                bills: Array.isArray(decrypted.bills) ? decrypted.bills : [],
                docs: [],
                notes: Array.isArray(decrypted.notes) ? decrypted.notes : [],
              }
            : { bills: [], docs: [] };
      } catch {
        vaultRef.current = { bills: [], docs: [] };
      }
      tick.current++;
      void publish();
    });
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId, isPlus]);

  const publish = async () => {
    if (!uid || !groupId) return;
    const authorized = pushPermission() === 'granted';
    const ref = doc(db, 'reminder_schedules', groupId);
    if (!isPlus || !authorized) {
      if (published.current[groupId] !== '__cleared__') {
        await deleteDoc(ref).catch(() => {});
        published.current[groupId] = '__cleared__';
      }
      return;
    }
    const entries = buildReminderIndex(expenses, vaultRef.current);
    const signature = reminderIndexSignature(entries);
    if (!(groupId in published.current)) {
      // One read per group per session, to avoid a pointless write on load.
      try {
        const snap = await getDoc(ref);
        const stored = snap.data()?.signature;
        if (typeof stored === 'string') published.current[groupId] = stored;
      } catch {
        // Unreadable is not a reason to skip publishing.
      }
    }
    if (published.current[groupId] === signature) return;
    // Sorted unique due dates, denormalised so the daily job can ask
    // where('dueDates', array-contains, tomorrow).
    const dueDates = Array.from(new Set(entries.map((e) => e.dueDate))).sort();
    await setDoc(ref, {
      groupId,
      entries,
      dueDates,
      signature,
      updatedAt: new Date().toISOString(),
      updatedBy: uid,
    }).catch(() => {});
    published.current[groupId] = signature;
  };

  useEffect(() => {
    void publish();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, groupId, expenses, isPlus]);
}
