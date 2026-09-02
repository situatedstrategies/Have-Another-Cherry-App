// Security rules, run against the real Firestore emulator.
//
// This exists because of a bug the unit tests could never have caught. The
// mobile client joined a group by querying where('inviteCode', '==', code).
// That is a *list* operation, and the rules only allow a list to existing
// members, so the one person the join flow was written for, a non-member
// holding an invite, was exactly the person Firestore denied. Nothing in the
// app's own test suite could see that: only the rules engine knows.
//
// So these assert the contract both clients depend on, from the outside.
//
// Run with: npm run test:rules

import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, getDocs, setDoc, updateDoc, collection, query, where } from 'firebase/firestore';
import { readFileSync } from 'fs';

const CODE = 'ABC123';          // a group id, which is also its invite code
const OWNER = 'owner-uid';
const INVITEE = 'invitee-uid';
const STRANGER = 'stranger-uid';

let env: RulesTestEnvironment;
let failures = 0;

const check = async (name: string, run: () => Promise<unknown>) => {
  try {
    await run();
    console.log(`ok   ${name}`);
  } catch (e: any) {
    failures++;
    console.log(`FAIL ${name}\n     ${e?.message || e}`);
  }
};

async function seed() {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'groups', CODE), {
      name: 'Test household',
      inviteCode: CODE,
      members: [{ uid: OWNER, name: 'Owner', email: 'o@x.com' }],
      memberIds: [OWNER],
      defaultSplit: { [OWNER]: 50 },
      targetNumPeople: 2,
      availableSplits: [{ name: 'Two', split: 50 }],
      categories: ['Rent'],
    });
    await setDoc(doc(db, 'group_ledgers', CODE), { groupId: CODE, payload: 'x' });
    await setDoc(doc(db, 'group_ledgers', CODE, 'archive', '2025-01'), {
      groupId: CODE, month: '2025-01', payload: 'x',
    });
  });
}

async function main() {
  env = await initializeTestEnvironment({
    projectId: 'hac-rules-test',
    firestore: {
      rules: readFileSync('firestore.rules', 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  });

  await env.clearFirestore();
  await seed();

  const invitee = env.authenticatedContext(INVITEE).firestore();
  const owner = env.authenticatedContext(OWNER).firestore();
  const anon = env.unauthenticatedContext().firestore();

  // --- the invite path, which is the whole point ------------------------
  await check('a signed-in non-member CAN get a group by its invite code', () =>
    assertSucceeds(getDoc(doc(invitee, 'groups', CODE))));

  await check('a signed-out visitor CANNOT get a group', () =>
    assertFails(getDoc(doc(anon, 'groups', CODE))));

  // The exact operation the old mobile join used.
  await check('a non-member CANNOT query groups by inviteCode (this was the bug)', () =>
    assertFails(getDocs(query(collection(invitee, 'groups'), where('inviteCode', '==', CODE)))));

  // A list is only allowed when the query itself guarantees every result
  // belongs to the caller. Firestore evaluates `allow list` against each
  // candidate but will not let a query through that it cannot prove safe, so
  // even a member must ask by membership, not by invite code.
  await check('a member CAN list groups they belong to', () =>
    assertSucceeds(getDocs(query(
      collection(owner, 'groups'), where('memberIds', 'array-contains', OWNER)))));

  await check('a member still CANNOT list groups by invite code', () =>
    assertFails(getDocs(query(
      collection(owner, 'groups'), where('inviteCode', '==', CODE)))));

  // --- self join ---------------------------------------------------------
  await check('an invitee CAN add only themselves', () =>
    assertSucceeds(updateDoc(doc(invitee, 'groups', CODE), {
      members: [
        { uid: OWNER, name: 'Owner', email: 'o@x.com' },
        { uid: INVITEE, name: 'Invitee', email: 'i@x.com' },
      ],
      memberIds: [OWNER, INVITEE],
    })));

  await env.clearFirestore();
  await seed();
  const invitee2 = env.authenticatedContext(INVITEE).firestore();

  await check('an invitee CANNOT add somebody else', () =>
    assertFails(updateDoc(doc(invitee2, 'groups', CODE), {
      members: [
        { uid: OWNER, name: 'Owner', email: 'o@x.com' },
        { uid: STRANGER, name: 'Stranger', email: 's@x.com' },
      ],
      memberIds: [OWNER, STRANGER],
    })));

  await check('an invitee CANNOT drop an existing member while joining', () =>
    assertFails(updateDoc(doc(invitee2, 'groups', CODE), {
      members: [{ uid: INVITEE, name: 'Invitee', email: 'i@x.com' }],
      memberIds: [INVITEE],
    })));

  // --- the ledger and its archive ---------------------------------------
  await check('a member CAN read the ledger', () =>
    assertSucceeds(getDoc(doc(owner, 'group_ledgers', CODE))));

  await check('a non-member CANNOT read the ledger', () =>
    assertFails(getDoc(doc(invitee2, 'group_ledgers', CODE))));

  await check('a member CAN read an archive month', () =>
    assertSucceeds(getDoc(doc(owner, 'group_ledgers', CODE, 'archive', '2025-01'))));

  await check('a non-member CANNOT read an archive month', () =>
    assertFails(getDoc(doc(invitee2, 'group_ledgers', CODE, 'archive', '2025-01'))));

  await check('a member CAN write an archive month', () =>
    assertSucceeds(setDoc(doc(owner, 'group_ledgers', CODE, 'archive', '2025-02'), {
      groupId: CODE, month: '2025-02', payload: 'x',
    })));

  await env.cleanup();
  console.log(failures === 0 ? '\nALL RULES CHECKS PASSED' : `\n${failures} FAILURE(S)`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
