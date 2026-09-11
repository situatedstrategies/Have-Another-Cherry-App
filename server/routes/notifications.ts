import express from 'express';
import { rateLimit, requireAuth, requireGroupMember, requireSecret } from '../middleware';
import type { GroupInfo, GroupLoader } from '../middleware';
import { ensureAdminApp } from '../shared';
import { sendReminderEmail } from '../resend';
import { reminderPayload, reminderTargetDate } from '../reminders';
import { hasPlus } from '../../src/lib/entitlements';

const router = express.Router();

// ---- Payment reminder email (Cherry +) ----
// Server-enforced: the caller must hold Cherry + and both people must be
// members of the group.
router.post('/api/send-reminder', requireAuth, rateLimit('remind', 10), async (req, res) => {
  try {
    const callerUid = (req as any).uid as string;
    const { debtorUid, groupId } = req.body || {};

    if (!debtorUid || typeof debtorUid !== 'string' || !groupId || typeof groupId !== 'string') {
      return res.status(400).json({ error: 'Missing debtor or group.' });
    }
    if (debtorUid === callerUid) {
      return res.status(400).json({ error: "You can't remind yourself." });
    }
    await ensureAdminApp();
    const { getFirestore } = await import('firebase-admin/firestore');
    const { getAuth } = await import('firebase-admin/auth');
    const fs = getFirestore();

    const callerDoc = await fs.collection('users').doc(callerUid).get();
    if (!hasPlus(callerDoc.data())) {
      return res.status(403).json({ error: 'Payment reminders are a Cherry + feature.' });
    }

    const groupDoc = await fs.collection('groups').doc(groupId).get();
    const groupData = groupDoc.data() || {};
    const memberIds: string[] = Array.isArray(groupData.memberIds) ? groupData.memberIds : [];
    if (!memberIds.includes(callerUid) || !memberIds.includes(debtorUid)) {
      return res.status(403).json({ error: 'Both people must be members of this group.' });
    }

    // The debtor's real email lives in Firebase Auth (Firestore only stores a hash).
    const debtorAuth = await getAuth()
      .getUser(debtorUid)
      .catch(() => null);
    if (!debtorAuth?.email) {
      return res.status(404).json({ error: 'That member has no email on file.' });
    }

    const nameOf = (uid: string) =>
      (Array.isArray(groupData.members) ? groupData.members : []).find((m: any) => m?.uid === uid)
        ?.name || 'A member';

    // No amounts or item details: the email only says an open balance exists.
    await sendReminderEmail(
      debtorAuth.email,
      nameOf(debtorUid),
      nameOf(callerUid),
      groupData.name || 'your group'
    );

    return res.status(200).json({ success: true });
  } catch (err: any) {
    console.error('Reminder Error:', err?.message || err);
    return res.status(500).json({ error: 'Could not send the reminder. Please try again.' });
  }
});

// ---- Push notifications ----
// Same privacy rule as email: a push lands on a lock screen, so it never
// carries amounts, balances or expense titles. Clients register FCM tokens
// on their user doc as fcmTokens: { [token]: updatedAtIso }; dead tokens
// are pruned on send.
const sendPushToUsers = async (
  uids: string[],
  title: string,
  body: string,
  // Routing hints for a tapped notification. FCM rejects any non-string
  // value, and nothing here may carry an amount or a name.
  data?: Record<string, string>
): Promise<number> => {
  if (!uids.length) return 0;
  await ensureAdminApp();
  const { getFirestore, FieldValue } = await import('firebase-admin/firestore');
  const { getMessaging } = await import('firebase-admin/messaging');
  const fs = getFirestore();

  const tokenOwners: { token: string; uid: string }[] = [];
  await Promise.all(
    uids.map(async (uid) => {
      const snap = await fs.collection('users').doc(uid).get();
      const tokens = snap.data()?.fcmTokens;
      if (tokens && typeof tokens === 'object') {
        for (const token of Object.keys(tokens)) tokenOwners.push({ token, uid });
      }
    })
  );
  if (!tokenOwners.length) return 0;

  const res = await getMessaging().sendEachForMulticast({
    tokens: tokenOwners.map((t) => t.token),
    notification: { title, body },
    ...(data ? { data } : {}),
    apns: { payload: { aps: { sound: 'default' } } },
  });

  // Prune tokens FCM says are gone (uninstalled app, rotated token).
  const dead = res.responses
    .map((r, i) => ({ r, t: tokenOwners[i] }))
    .filter(({ r }) => {
      const code = (r.error as any)?.code || '';
      return (
        code.includes('registration-token-not-registered') || code.includes('invalid-argument')
      );
    });
  await Promise.allSettled(
    dead.map(({ t }) =>
      fs
        .collection('users')
        .doc(t.uid)
        .update({ [`fcmTokens.${t.token}`]: FieldValue.delete() })
    )
  );

  return res.successCount;
};

// A small fixed pool of copy, so the voice stays consistent.
const LEDGER_PUSH_COPY: Record<
  string,
  ((name: string, group: string) => { title: string; body: string })[]
> = {
  expense_logged: [
    (n, g) => ({ title: 'New on the ledger', body: `${n} logged a shared expense in ${g}.` }),
    (n, g) => ({
      title: 'Fresh cherry',
      body: `${n} added something to the ${g} ledger. Peek when you have a sec.`,
    }),
    (n, g) => ({ title: 'New shared expense', body: `${n} just logged one for ${g}.` }),
  ],
  payment_logged: [
    (n, g) => ({
      title: 'Payment logged',
      body: `${n} paid something back in ${g}. One step closer to settled.`,
    }),
    (n, g) => ({ title: 'Cherry progress', body: `${n} logged a payment in ${g}.` }),
    (n, g) => ({ title: 'Money moved', body: `${n} recorded a payment in ${g}. Sweet.` }),
  ],
};

const NUDGE_PUSH_COPY: ((name: string, group: string) => { title: string; body: string })[] = [
  (n, g) => ({
    title: 'A gentle nudge',
    body: `${n} sent a gentle reminder: the ${g} ledger could use a look.`,
  }),
  (n, g) => ({
    title: 'Gentle reminder',
    body: `A friendly poke from ${n}: there is an open balance in ${g}.`,
  }),
  (n, g) => ({
    title: 'When you have a moment',
    body: `${n} would love to settle up in ${g}. No rush, just a nudge.`,
  }),
];

const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

// Membership is enforced here, not trusted from the client.
const loadGroupForNotify: GroupLoader = async (groupId, callerUid) => {
  await ensureAdminApp();
  const { getFirestore } = await import('firebase-admin/firestore');
  const snap = await getFirestore().collection('groups').doc(groupId).get();
  const data = snap.data();
  const memberIds: string[] = Array.isArray(data?.memberIds) ? data!.memberIds : [];
  if (!data || !memberIds.includes(callerUid)) return null;
  const members: any[] = Array.isArray(data.members) ? data.members : [];
  const callerName = members.find((m: any) => m?.uid === callerUid)?.name || 'A member';
  return { memberIds, callerName, groupName: String(data.name || 'your group') };
};

// Called by a client after it logs an expense or payment. The event kind is all the server learns.
router.post(
  '/api/notify-ledger-event',
  requireAuth,
  rateLimit('notify', 60),
  (req, res, next) => {
    const { groupId, kind } = req.body || {};
    if (typeof groupId !== 'string' || !Object.hasOwn(LEDGER_PUSH_COPY, String(kind))) {
      return res.status(400).json({ error: 'Missing group or unknown event kind.' });
    }
    next();
  },
  requireGroupMember(loadGroupForNotify, {
    log: 'Ledger notify error:',
    message: 'Could not send notifications.',
  }),
  async (req, res) => {
    try {
      const callerUid = (req as any).uid as string;
      const { kind } = req.body || {};
      const groupInfo = (req as any).groupInfo as GroupInfo;

      const recipients = groupInfo.memberIds.filter((id) => id !== callerUid);
      const { title, body } = pick(LEDGER_PUSH_COPY[kind])(
        groupInfo.callerName,
        groupInfo.groupName
      );
      const sent = await sendPushToUsers(recipients, title, body);
      return res.status(200).json({ success: true, sent });
    } catch (err: any) {
      console.error('Ledger notify error:', err?.message || err);
      return res.status(500).json({ error: 'Could not send notifications.' });
    }
  }
);

// Tightly rate limited: a nudge that can be spammed stops being gentle.
router.post(
  '/api/send-nudge',
  requireAuth,
  rateLimit('nudge', 10),
  (req, res, next) => {
    if (typeof req.body?.groupId !== 'string') {
      return res.status(400).json({ error: 'Missing group.' });
    }
    next();
  },
  requireGroupMember(loadGroupForNotify, {
    log: 'Nudge error:',
    message: 'Could not send the reminder.',
  }),
  async (req, res) => {
    try {
      const callerUid = (req as any).uid as string;
      const toUids: string[] = Array.isArray(req.body?.toUids)
        ? req.body.toUids.filter((u: any) => typeof u === 'string').slice(0, 10)
        : [];
      const groupInfo = (req as any).groupInfo as GroupInfo;

      // Only fellow members can be nudged; an empty list means everyone else.
      const recipients = (toUids.length ? toUids : groupInfo.memberIds).filter(
        (id) => id !== callerUid && groupInfo.memberIds.includes(id)
      );
      if (!recipients.length) {
        return res.status(400).json({ error: 'Nobody to remind.' });
      }

      const { title, body } = pick(NUDGE_PUSH_COPY)(groupInfo.callerName, groupInfo.groupName);
      const sent = await sendPushToUsers(recipients, title, body);
      return res.status(200).json({ success: true, sent });
    } catch (err: any) {
      console.error('Nudge error:', err?.message || err);
      return res.status(500).json({ error: 'Could not send the reminder.' });
    }
  }
);

// ---- Scheduled bill reminders ----
// Hit once a day by Cloud Scheduler on a shared secret. The ledger and the
// Vault are encrypted client-side, so clients publish a minimal index to
// reminder_schedules/{groupId} (a date, an opaque id, a target screen) and
// the push body is fixed. "Tomorrow" is computed in REMINDER_TZ_OFFSET_HOURS
// for everyone: per-household zones would mean the server learning where
// people live.
const REMINDER_BODY =
  'A household bill is due tomorrow. Open Have Another Cherry to see the details.';

router.post(
  '/api/send-bill-reminders',
  requireSecret({
    env: 'REMINDER_CRON_SECRET',
    header: 'x-cherry-cron',
    notConfigured: 'Reminders are not configured.',
    unauthorized: 'Unauthorized.',
    logUnset: 'Bill reminders: REMINDER_CRON_SECRET is not set.',
  }),
  async (_req, res) => {
    try {
      await ensureAdminApp();
      const { getFirestore } = await import('firebase-admin/firestore');
      const fs = getFirestore();

      const target = reminderTargetDate(
        new Date(),
        Number(process.env.REMINDER_TZ_OFFSET_HOURS || 0)
      );

      // Single-field, so no composite index to deploy.
      const due = await fs
        .collection('reminder_schedules')
        .where('dueDates', 'array-contains', target)
        .get();

      let groups = 0;
      let sent = 0;
      for (const snap of due.docs) {
        const data = snap.data() || {};
        // Idempotent across Cloud Scheduler retries.
        if (data.lastRemindedFor === target) continue;

        const groupSnap = await fs.collection('groups').doc(snap.id).get();
        const memberIds: string[] = Array.isArray(groupSnap.data()?.memberIds)
          ? groupSnap.data()!.memberIds
          : [];
        if (!memberIds.length) continue;

        const entries: any[] = Array.isArray(data.entries) ? data.entries : [];
        const dueTomorrow = entries.filter((e) => e?.dueDate === target);
        if (!dueTomorrow.length) continue;

        // One push per household per day, not one per bill.
        const count = await sendPushToUsers(
          memberIds,
          'Due tomorrow',
          REMINDER_BODY,
          reminderPayload(snap.id, target, dueTomorrow)
        );

        await snap.ref.update({ lastRemindedFor: target });
        groups++;
        sent += count;
      }

      return res.status(200).json({ success: true, date: target, groups, sent });
    } catch (err: any) {
      console.error('Bill reminder error:', err?.message || err);
      return res.status(500).json({ error: 'Could not send reminders.' });
    }
  }
);

export default router;
