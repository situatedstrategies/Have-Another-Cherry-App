// Seeds the group's encrypted vault from the household setup answers.
// Separate from householdSetup.ts because it touches Firestore.
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { decryptData, encryptData } from './crypto';
import { recurringStubs } from './householdSetup';
import type { GroupRecurring, VaultData } from '../types';

/**
 * Writes the recurring stubs into the group's encrypted vault when Cherry +
 * is on. Without it the answer stays on `setup.recurring` for the day it is.
 */
export async function seedRecurringStubs(
  groupId: string,
  recurring: GroupRecurring[],
  uid: string,
  isPlus: boolean
): Promise<void> {
  if (!isPlus || recurring.length === 0) return;
  try {
    const snap = await getDoc(doc(db, 'group_vault', groupId));
    const payload = snap.data()?.payload;
    const current: VaultData = payload
      ? await decryptData(payload, groupId)
      : { bills: [], docs: [], notes: [] };
    const bills = Array.isArray(current.bills) ? current.bills : [];
    const stubs = recurringStubs(recurring, bills);
    if (stubs.length === 0) return;
    const next: VaultData = { ...current, bills: [...bills, ...stubs], docs: current.docs || [] };
    await setDoc(
      doc(db, 'group_vault', groupId),
      {
        groupId,
        payload: await encryptData(next, groupId),
        updatedAt: new Date().toISOString(),
        updatedBy: uid,
      },
      { merge: true }
    );
  } catch (e) {
    console.error('Could not seed the vault from the household setup', e);
  }
}
