// Reflections: short journal entries about how a shared expense felt.
//
// Privacy model, same key discipline as the rest of the app:
// - Private entries live in user_reflections/{uid}/entries and are encrypted
//   with the author's uid (the paymentHandlesEnc pattern). Rules only let the
//   author read them; the encryption keeps them sealed even from a leaked doc.
// - Shared entries live in group_reflections/{groupId}/entries and are
//   encrypted with the group id (the ledger/vault pattern), readable by group
//   members only.
// - Sharing is an explicit, per-entry act: the entry is re-encrypted with the
//   group key, written to the group collection, and the private copy removed.
//   Private is the default everywhere.
//
// Only ids and timestamps are stored in the clear; the feeling itself (text
// and mood) always travels inside the encrypted payload.

import { collection, doc, getDocs, query, where, setDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { encryptData, decryptData } from './crypto';

export type ReflectionMood = 'sweet' | 'ripe' | 'mixed' | 'tart' | 'pit';

// The cherry scale. Plain words, no scores: this is a journal, not a rating.
export const REFLECTION_MOODS: { key: ReflectionMood; label: string; hint: string }[] = [
  { key: 'sweet', label: 'Sweet', hint: 'Felt good' },
  { key: 'ripe', label: 'Ripe', hint: 'Fair and easy' },
  { key: 'mixed', label: 'Mixed', hint: 'A bit of both' },
  { key: 'tart', label: 'Tart', hint: 'A little sore' },
  { key: 'pit', label: 'Pit', hint: 'That one was hard' },
];

export interface Reflection {
  id: string;
  authorUid: string;
  groupId: string;
  expenseId: string;
  createdAt: string; // ISO
  shared: boolean;
  mood?: ReflectionMood;
  text: string;
}

const privateCol = (uid: string) => collection(db, 'user_reflections', uid, 'entries');
const sharedCol = (groupId: string) => collection(db, 'group_reflections', groupId, 'entries');

// Everything the current user may see about one expense: their own private
// entries plus every shared entry from the group. Undecryptable payloads are
// skipped rather than surfaced as errors (same contract as the ledger).
export async function loadReflectionsForExpense(
  uid: string,
  groupId: string,
  expenseId: string,
): Promise<Reflection[]> {
  const [mine, shared] = await Promise.all([
    getDocs(query(privateCol(uid), where('expenseId', '==', expenseId))),
    getDocs(query(sharedCol(groupId), where('expenseId', '==', expenseId))),
  ]);

  const out: Reflection[] = [];
  for (const snap of mine.docs) {
    const d = snap.data() as any;
    const body = await decryptData(d.payload, uid);
    if (body) {
      out.push({
        id: snap.id,
        authorUid: d.authorUid,
        groupId: d.groupId,
        expenseId: d.expenseId,
        createdAt: d.createdAt,
        shared: false,
        mood: body.mood,
        text: String(body.text || ''),
      });
    }
  }
  for (const snap of shared.docs) {
    const d = snap.data() as any;
    const body = await decryptData(d.payload, groupId);
    if (body) {
      out.push({
        id: snap.id,
        authorUid: d.authorUid,
        groupId: d.groupId,
        expenseId: d.expenseId,
        createdAt: d.createdAt,
        shared: true,
        mood: body.mood,
        text: String(body.text || ''),
      });
    }
  }
  // Newest first; client-side so the queries stay single-field (no composite
  // index needed).
  out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return out;
}

export async function saveReflection(opts: {
  uid: string;
  groupId: string;
  expenseId: string;
  text: string;
  mood?: ReflectionMood;
  shared: boolean;
}): Promise<Reflection> {
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const payload = await encryptData(
    { text: opts.text, mood: opts.mood },
    opts.shared ? opts.groupId : opts.uid,
  );
  const target = opts.shared
    ? doc(sharedCol(opts.groupId), id)
    : doc(privateCol(opts.uid), id);
  await setDoc(target, {
    authorUid: opts.uid,
    groupId: opts.groupId,
    expenseId: opts.expenseId,
    createdAt,
    payload,
  });
  return {
    id,
    authorUid: opts.uid,
    groupId: opts.groupId,
    expenseId: opts.expenseId,
    createdAt,
    shared: opts.shared,
    mood: opts.mood,
    text: opts.text,
  };
}

// Move a private entry to the group: re-encrypt with the group key, write the
// group copy, then remove the private one. Order matters - the copy lands
// before the original goes, so a failure can duplicate but never lose.
export async function shareReflection(r: Reflection): Promise<void> {
  const payload = await encryptData({ text: r.text, mood: r.mood }, r.groupId);
  await setDoc(doc(sharedCol(r.groupId), r.id), {
    authorUid: r.authorUid,
    groupId: r.groupId,
    expenseId: r.expenseId,
    createdAt: r.createdAt,
    payload,
  });
  await deleteDoc(doc(privateCol(r.authorUid), r.id));
}

export async function deleteReflection(r: Reflection): Promise<void> {
  await deleteDoc(
    r.shared
      ? doc(sharedCol(r.groupId), r.id)
      : doc(privateCol(r.authorUid), r.id),
  );
}
