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
import {
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
} from 'firebase/firestore';
import { readFileSync } from 'fs';

const CODE = 'ABC123'; // a group id, which is also its invite code
const SHARED = 'SHARED1';
const OWNER = 'owner-uid';
const INVITEE = 'invitee-uid';
const STRANGER = 'stranger-uid';
const MEMBER = 'member-uid';
const PEER = 'peer-uid';
const ATTACKER = 'attacker-uid';

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
    await setDoc(doc(db, 'groups', SHARED), {
      name: 'Shared household',
      inviteCode: SHARED,
      members: [
        { uid: MEMBER, name: 'Member', email: 'member@x.com' },
        { uid: PEER, name: 'Peer', email: 'peer@x.com' },
      ],
      memberIds: [MEMBER, PEER],
      defaultSplit: { [MEMBER]: 50, [PEER]: 50 },
      targetNumPeople: 2,
      availableSplits: [],
      categories: ['Rent'],
    });
    await setDoc(doc(db, 'group_ledgers', CODE), { groupId: CODE, payload: 'x' });
    await setDoc(doc(db, 'group_ledgers', CODE, 'archive', '2025-01'), {
      groupId: CODE,
      month: '2025-01',
      payload: 'x',
    });
    await setDoc(doc(db, 'reminder_schedules', CODE), {
      groupId: CODE,
      entries: [{ id: 'bill1', dueDate: '2026-09-10', target: 'bill' }],
      signature: 'x',
      updatedAt: '2026-09-05T00:00:00.000Z',
      updatedBy: OWNER,
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
    assertSucceeds(getDoc(doc(invitee, 'groups', CODE)))
  );

  await check('a signed-out visitor CANNOT get a group', () =>
    assertFails(getDoc(doc(anon, 'groups', CODE)))
  );

  // The exact operation the old mobile join used.
  await check('a non-member CANNOT query groups by inviteCode (this was the bug)', () =>
    assertFails(getDocs(query(collection(invitee, 'groups'), where('inviteCode', '==', CODE))))
  );

  // A list is only allowed when the query itself guarantees every result
  // belongs to the caller. Firestore evaluates `allow list` against each
  // candidate but will not let a query through that it cannot prove safe, so
  // even a member must ask by membership, not by invite code.
  await check('a member CAN list groups they belong to', () =>
    assertSucceeds(
      getDocs(query(collection(owner, 'groups'), where('memberIds', 'array-contains', OWNER)))
    )
  );

  await check('a member still CANNOT list groups by invite code', () =>
    assertFails(getDocs(query(collection(owner, 'groups'), where('inviteCode', '==', CODE))))
  );

  // --- self join ---------------------------------------------------------
  await check('an invitee CAN add only themselves', () =>
    assertSucceeds(
      updateDoc(doc(invitee, 'groups', CODE), {
        members: [
          { uid: OWNER, name: 'Owner', email: 'o@x.com' },
          { uid: INVITEE, name: 'Invitee', email: 'i@x.com' },
        ],
        memberIds: [OWNER, INVITEE],
      })
    )
  );

  await env.clearFirestore();
  await seed();
  const invitee2 = env.authenticatedContext(INVITEE).firestore();

  await check('an invitee CANNOT add somebody else', () =>
    assertFails(
      updateDoc(doc(invitee2, 'groups', CODE), {
        members: [
          { uid: OWNER, name: 'Owner', email: 'o@x.com' },
          { uid: STRANGER, name: 'Stranger', email: 's@x.com' },
        ],
        memberIds: [OWNER, STRANGER],
      })
    )
  );

  await check('an invitee CANNOT drop an existing member while joining', () =>
    assertFails(
      updateDoc(doc(invitee2, 'groups', CODE), {
        members: [{ uid: INVITEE, name: 'Invitee', email: 'i@x.com' }],
        memberIds: [INVITEE],
      })
    )
  );

  // --- the ledger and its archive ---------------------------------------
  await check('a member CAN read the ledger', () =>
    assertSucceeds(getDoc(doc(owner, 'group_ledgers', CODE)))
  );

  await check('a non-member CANNOT read the ledger', () =>
    assertFails(getDoc(doc(invitee2, 'group_ledgers', CODE)))
  );

  await check('a member CAN read an archive month', () =>
    assertSucceeds(getDoc(doc(owner, 'group_ledgers', CODE, 'archive', '2025-01')))
  );

  await check('a non-member CANNOT read an archive month', () =>
    assertFails(getDoc(doc(invitee2, 'group_ledgers', CODE, 'archive', '2025-01')))
  );

  // --- the reminder schedule -------------------------------------------
  // Unencrypted by necessity, so who can read it matters more here than
  // anywhere else in this file.
  await check('a member CAN read the reminder schedule', () =>
    assertSucceeds(getDoc(doc(owner, 'reminder_schedules', CODE)))
  );

  await check('a non-member CANNOT read the reminder schedule', () =>
    assertFails(getDoc(doc(invitee2, 'reminder_schedules', CODE)))
  );

  await check('a signed-out visitor CANNOT read the reminder schedule', () =>
    assertFails(getDoc(doc(anon, 'reminder_schedules', CODE)))
  );

  await check('a member CAN publish the reminder schedule', () =>
    assertSucceeds(
      setDoc(doc(owner, 'reminder_schedules', CODE), {
        groupId: CODE,
        entries: [],
        signature: 'y',
        updatedAt: '2026-09-05T00:00:00.000Z',
        updatedBy: OWNER,
      })
    )
  );

  await check('a non-member CANNOT publish a reminder schedule', () =>
    assertFails(
      setDoc(doc(invitee2, 'reminder_schedules', CODE), {
        groupId: CODE,
        entries: [],
        signature: 'z',
        updatedAt: '2026-09-05T00:00:00.000Z',
        updatedBy: INVITEE,
      })
    )
  );

  await check('a member CAN write an archive month', () =>
    assertSucceeds(
      setDoc(doc(owner, 'group_ledgers', CODE, 'archive', '2025-02'), {
        groupId: CODE,
        month: '2025-02',
        payload: 'x',
      })
    )
  );

  // --- plans: members only, the envelope and nothing else --------------------
  const stranger = env.authenticatedContext(STRANGER).firestore();
  const planDoc = (uid: string, extra: Record<string, unknown> = {}) => ({
    groupId: CODE,
    payload: 'iv:cipher',
    updatedAt: '2026-11-14T00:00:00.000Z',
    updatedBy: uid,
    ...extra,
  });
  await check('a member CAN create the household plan', () =>
    assertSucceeds(setDoc(doc(owner, 'group_plans', CODE), planDoc(OWNER), { merge: true }))
  );
  await check('a member CAN read the household plan', () =>
    assertSucceeds(getDoc(doc(owner, 'group_plans', CODE)))
  );
  await check('a member CAN update the household plan', () =>
    assertSucceeds(
      setDoc(doc(owner, 'group_plans', CODE), planDoc(OWNER, { payload: 'iv:next' }), {
        merge: true,
      })
    )
  );
  await check('a non-member CANNOT read the household plan', () =>
    assertFails(getDoc(doc(stranger, 'group_plans', CODE)))
  );
  await check('a non-member CANNOT write the household plan', () =>
    assertFails(setDoc(doc(stranger, 'group_plans', CODE), planDoc(STRANGER)))
  );
  await check('a signed-out visitor CANNOT read the household plan', () =>
    assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'group_plans', CODE)))
  );
  await check('nobody CAN list plans', () =>
    assertFails(getDocs(collection(owner, 'group_plans')))
  );
  await check('a plan CANNOT be written without a payload', () =>
    assertFails(
      setDoc(doc(owner, 'group_plans', CODE), {
        groupId: CODE,
        updatedAt: 'x',
        updatedBy: OWNER,
      })
    )
  );
  await check('a plan CANNOT carry any other field', () =>
    assertFails(setDoc(doc(owner, 'group_plans', CODE), planDoc(OWNER, { junk: 'x' })))
  );
  await check('a plan payload CANNOT be oversized', () =>
    assertFails(
      setDoc(doc(owner, 'group_plans', CODE), planDoc(OWNER, { payload: 'a'.repeat(400001) }))
    )
  );
  await check('a plan CANNOT be signed with somebody else', () =>
    assertFails(setDoc(doc(owner, 'group_plans', CODE), planDoc(STRANGER)))
  );
  await check('a plan CANNOT be filed under another group id', () =>
    assertFails(setDoc(doc(owner, 'group_plans', CODE), planDoc(OWNER, { groupId: SHARED })))
  );
  await check('a member CANNOT delete the household plan', () =>
    assertFails(deleteDoc(doc(owner, 'group_plans', CODE)))
  );
  const personalPlan = (uid: string, extra: Record<string, unknown> = {}) => ({
    uid,
    payload: 'iv:cipher',
    updatedAt: '2026-11-14T00:00:00.000Z',
    updatedBy: uid,
    ...extra,
  });
  await check('a member CAN write their own personal plan', () =>
    assertSucceeds(
      setDoc(doc(owner, 'users', OWNER, 'private', 'plan'), personalPlan(OWNER), { merge: true })
    )
  );
  await check('a personal plan without the uid field is accepted (mobile writes it so)', () =>
    assertSucceeds(
      setDoc(doc(owner, 'users', OWNER, 'private', 'plan'), {
        payload: 'iv:mobile',
        updatedAt: '2026-11-14T00:00:00.000Z',
        updatedBy: OWNER,
      })
    )
  );
  await check('a member CAN read their own personal plan', () =>
    assertSucceeds(getDoc(doc(owner, 'users', OWNER, 'private', 'plan')))
  );
  await check('nobody else CAN read a personal plan', () =>
    assertFails(getDoc(doc(stranger, 'users', OWNER, 'private', 'plan')))
  );
  await check('nobody else CAN write a personal plan', () =>
    assertFails(setDoc(doc(stranger, 'users', OWNER, 'private', 'plan'), personalPlan(OWNER)))
  );
  await check('a personal plan CANNOT carry any other field', () =>
    assertFails(
      setDoc(doc(owner, 'users', OWNER, 'private', 'plan'), personalPlan(OWNER, { junk: 1 }))
    )
  );
  await check("the other private documents are still the owner's to write", () =>
    assertSucceeds(setDoc(doc(owner, 'users', OWNER, 'private', 'prefs'), { bankApp: 'x' }))
  );
  await check('a member CAN delete their own personal plan (account deletion)', () =>
    assertSucceeds(deleteDoc(doc(owner, 'users', OWNER, 'private', 'plan')))
  );

  // --- profile reads must be backed by authoritative group membership ----
  const member = env.authenticatedContext(MEMBER).firestore();
  const peer = env.authenticatedContext(PEER).firestore();
  const attacker = env.authenticatedContext(ATTACKER).firestore();

  await check('a user CAN create a profile that names their active group', () =>
    assertSucceeds(
      setDoc(doc(member, 'users', MEMBER), {
        name: 'Member',
        groupIds: [SHARED],
        activeGroupId: SHARED,
        groupId: SHARED,
      })
    )
  );
  await check('a peer CAN create their profile in the same group', () =>
    assertSucceeds(
      setDoc(doc(peer, 'users', PEER), {
        name: 'Peer',
        income: '75000',
        groupIds: [SHARED],
        activeGroupId: SHARED,
        groupId: SHARED,
      })
    )
  );
  await check('a verified group member CAN read another member profile', () =>
    assertSucceeds(getDoc(doc(member, 'users', PEER)))
  );

  // This is the regression: user profiles are client-writable. Merely claiming
  // a group id must never grant access to another member's income/profile data.
  await check('an attacker CAN forge groupIds only on their own profile', () =>
    assertSucceeds(
      setDoc(doc(attacker, 'users', ATTACKER), {
        name: 'Attacker',
        groupIds: [SHARED],
        activeGroupId: SHARED,
        groupId: SHARED,
      })
    )
  );
  await check('forged groupIds DO NOT grant another member profile access', () =>
    assertFails(getDoc(doc(attacker, 'users', PEER)))
  );

  // --- the Cherry + entitlement is server-owned --------------------------
  const self = env.authenticatedContext(OWNER).firestore();
  await check('a user CAN create their own profile', () =>
    assertSucceeds(setDoc(doc(self, 'users', OWNER), { name: 'Owner' }))
  );

  await check('a user CANNOT create a profile that already has Cherry +', () =>
    assertFails(
      setDoc(doc(env.authenticatedContext(INVITEE).firestore(), 'users', INVITEE), {
        name: 'Invitee',
        isPlus: true,
      })
    )
  );

  await check('a user CAN update their own name', () =>
    assertSucceeds(updateDoc(doc(self, 'users', OWNER), { name: 'Renamed' }))
  );

  await check('a user CANNOT grant themselves Cherry + (this was possible)', () =>
    assertFails(updateDoc(doc(self, 'users', OWNER), { isPlus: true }))
  );

  await check('a user CANNOT write a plusEntitlement either', () =>
    assertFails(
      updateDoc(doc(self, 'users', OWNER), {
        plusEntitlement: { source: 'promo', updatedAt: 'now' },
      })
    )
  );

  await check('a signed-in client CANNOT seed the AI profile catalog', () =>
    assertFails(
      setDoc(doc(self, 'profile_log', 'poison-attempt'), {
        type: 'Injected',
        description: 'This must never enter the trusted catalog.',
        createdAt: 'now',
      })
    )
  );

  // --- marketing email is opt-in, and the flag has to be a real boolean ----
  await check('a user CAN opt in to marketing email with a boolean', () =>
    assertSucceeds(
      updateDoc(doc(self, 'users', OWNER), {
        marketingOptIn: true,
        marketingOptInAt: '2026-09-07T12:00:00.000Z',
      })
    )
  );

  await check('a user CAN opt out again', () =>
    assertSucceeds(
      updateDoc(doc(self, 'users', OWNER), {
        marketingOptIn: false,
        marketingOptOutAt: '2026-09-08T12:00:00.000Z',
      })
    )
  );

  await check('a user CAN opt out of app notices with a boolean', () =>
    assertSucceeds(
      updateDoc(doc(self, 'users', OWNER), {
        noticesOptOut: true,
        noticesOptOutAt: '2026-11-14T00:00:00.000Z',
      })
    )
  );
  await check('a user CAN turn app notices back on', () =>
    assertSucceeds(
      updateDoc(doc(self, 'users', OWNER), {
        noticesOptOut: false,
        noticesOptInAt: '2026-11-14T00:01:00.000Z',
      })
    )
  );
  await check('a user CANNOT write noticesOptOut as a string', () =>
    assertFails(updateDoc(doc(self, 'users', OWNER), { noticesOptOut: 'false' }))
  );

  await check('a user CANNOT write marketingOptIn as a string', () =>
    assertFails(updateDoc(doc(self, 'users', OWNER), { marketingOptIn: 'true' }))
  );

  await check('a user CANNOT write marketingOptIn as a number', () =>
    assertFails(updateDoc(doc(self, 'users', OWNER), { marketingOptIn: 1 }))
  );

  await check('a user CANNOT write a non-string opt-in timestamp', () =>
    assertFails(
      updateDoc(doc(self, 'users', OWNER), {
        marketingOptIn: true,
        marketingOptInAt: 1757246400,
      })
    )
  );

  await env.cleanup();
  console.log(failures === 0 ? '\nALL RULES CHECKS PASSED' : `\n${failures} FAILURE(S)`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
