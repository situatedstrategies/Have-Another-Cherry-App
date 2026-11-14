import express from 'express';
import { rateLimit, requireAuth, requireGroupMember, requireSecret } from '../middleware';
import type { GroupInfo, GroupLoader } from '../middleware';
import { ensureAdminApp } from '../shared';
import { sendReminderEmail } from '../resend';
import {
  reminderPayload,
  reminderTargetDate,
  reminderRunDate,
  monthClosedBy,
  monthClosePayload,
  planAlertPayload,
  isPlanAlertType,
} from '../reminders';
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

// Plan alerts (lib/alerts): one fixed line each. The push says a budget or a
// goal in the group moved, never which one or by how much; the data payload
// carries the id so the app can open the right row.
const PLAN_ALERT_COPY: Record<string, (group: string) => { title: string; body: string }> = {
  budget_near: (g) => ({
    title: 'Close to a budget',
    body: `A budget in ${g} is close to its limit for the month.`,
  }),
  budget_over: (g) => ({
    title: 'Over a budget',
    body: `A budget in ${g} went over its limit for the month.`,
  }),
  goal_milestone: (g) => ({
    title: 'Goal milestone',
    body: `A goal in ${g} just passed a milestone. Nice.`,
  }),
  goal_off_track: (g) => ({
    title: 'Goal check-in',
    body: `A goal in ${g} has slipped off track at the current pace.`,
  }),
};

const MONTH_CLOSE_BODY =
  'Last month is closed. Open Two Cherries for the summary and to settle up.';

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
    const { groupId, kind, id } = req.body || {};
    if (typeof groupId !== 'string') {
      return res.status(400).json({ error: 'Missing group or unknown event kind.' });
    }
    if (isPlanAlertType(kind)) {
      // A plan alert points at one budget or goal; the id is opaque to us.
      if (typeof id !== 'string' || !id.trim() || id.length > 64) {
        return res.status(400).json({ error: 'A plan alert needs the budget or goal id.' });
      }
      return next();
    }
    if (!Object.hasOwn(LEDGER_PUSH_COPY, String(kind))) {
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
      const { kind, id, groupId } = req.body || {};
      const groupInfo = (req as any).groupInfo as GroupInfo;

      const recipients = groupInfo.memberIds.filter((uid) => uid !== callerUid);
      if (isPlanAlertType(kind)) {
        // Plan is part of Cherry +, and the apps only raise these for a
        // member who has it; a free member's token must not be able to send
        // "over a budget" to the household.
        await ensureAdminApp();
        const { getFirestore } = await import('firebase-admin/firestore');
        const callerDoc = await getFirestore().collection('users').doc(callerUid).get();
        if (!hasPlus(callerDoc.data())) {
          return res.status(403).json({ error: 'Plan alerts are a Cherry + feature.' });
        }
        const { title, body } = PLAN_ALERT_COPY[kind](groupInfo.groupName);
        const sent = await sendPushToUsers(
          recipients,
          title,
          body,
          planAlertPayload(kind, String(groupId), String(id).trim())
        );
        return res.status(200).json({ success: true, sent });
      }
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
const REMINDER_BODY = 'A household bill is due tomorrow. Open Two Cherries to see the details.';

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

      const now = new Date();
      const offset = Number(process.env.REMINDER_TZ_OFFSET_HOURS || 0);
      const target = reminderTargetDate(now, offset);
      const runDate = reminderRunDate(now, offset);

      const memberIdsOf = async (groupId: string): Promise<string[]> => {
        const groupSnap = await fs.collection('groups').doc(groupId).get();
        const ids = groupSnap.data()?.memberIds;
        return Array.isArray(ids) ? ids.filter((u: unknown) => typeof u === 'string') : [];
      };

      // Single-field, so no composite index to deploy.
      const due = await fs
        .collection('reminder_schedules')
        .where('dueDates', 'array-contains', target)
        .get();

      let groups = 0;
      let sent = 0;
      for (const snap of due.docs) {
        const data = snap.data() || {};
        // Idempotent per group per day, across Cloud Scheduler retries and a
        // second manual run. The mark lives on the index document the client
        // writes with merge, so a republished index keeps it.
        if (data.lastRemindedFor === target) continue;

        const memberIds = await memberIdsOf(snap.id);
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

        await snap.ref.set(
          { lastRemindedFor: target, lastRemindedAt: now.toISOString() },
          { merge: true }
        );
        groups++;
        sent += count;
      }

      // The first of the month also closes the month before: a contentless
      // nudge to every household that publishes a reminder index (the one
      // sign that someone there has the app's push permission), once per
      // month per group.
      const closed = monthClosedBy(runDate);
      let closeGroups = 0;
      let closeSent = 0;
      if (closed) {
        const all = await fs.collection('reminder_schedules').get();
        for (const snap of all.docs) {
          const data = snap.data() || {};
          if (data.lastMonthClosedFor === closed) continue;
          const memberIds = await memberIdsOf(snap.id);
          if (!memberIds.length) continue;
          const count = await sendPushToUsers(
            memberIds,
            'The month is closed',
            MONTH_CLOSE_BODY,
            monthClosePayload(snap.id)
          );
          await snap.ref.set(
            { lastMonthClosedFor: closed, lastMonthClosedAt: now.toISOString() },
            { merge: true }
          );
          closeGroups++;
          closeSent += count;
        }
      }

      // The one line to look for in the Cloud Run logs (docs/REMINDERS_RUNBOOK.md).
      console.log(
        `Bill reminders: run=${runDate} due=${target} groups=${groups} sent=${sent}` +
          (closed ? ` monthClose=${closed} closeGroups=${closeGroups} closeSent=${closeSent}` : '')
      );

      return res.status(200).json({
        success: true,
        date: target,
        groups,
        sent,
        ...(closed ? { monthClose: closed, closeGroups, closeSent } : {}),
      });
    } catch (err: any) {
      console.error('Bill reminder error:', err?.message || err);
      return res.status(500).json({ error: 'Could not send reminders.' });
    }
  }
);

export default router;
