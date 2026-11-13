// The decisions the scheduled job and the plan alerts make, kept pure so they
// can be tested without an emulator. All of them are contracts with the
// Flutter app's routeForPush; scripts/reminder-parity.ts checks that the two
// sides agree.

/** Today's date in the one zone every reminder is reckoned in. Per-household
 *  zones would mean the server learning where people live. */
export function reminderRunDate(now: Date, offsetHours = 0): string {
  const shifted = new Date(now.getTime() + offsetHours * 3600000);
  return new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()))
    .toISOString()
    .slice(0, 10);
}

/** Tomorrow in the reminder zone: the day a run reminds for. */
export function reminderTargetDate(now: Date, offsetHours = 0): string {
  const shifted = new Date(now.getTime() + offsetHours * 3600000);
  const tomorrow = new Date(
    Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate() + 1)
  );
  return tomorrow.toISOString().slice(0, 10);
}

/** The month a run on the 1st closes ('YYYY-MM', the month before), else null. */
export function monthClosedBy(runDate: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(runDate);
  if (!m || m[3] !== '01') return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  return month === 1 ? `${year - 1}-12` : `${year}-${String(month - 1).padStart(2, '0')}`;
}

/** The push data payload: strings only (FCM rejects anything else), and never
 *  an amount or a title. With more than one bill due the id and target are
 *  omitted and the app opens the day instead. */
export function reminderPayload(
  groupId: string,
  dueDate: string,
  entries: { id?: unknown; target?: unknown }[]
): Record<string, string> {
  const only = entries.length === 1 ? entries[0] : null;
  return {
    type: 'bill_reminder',
    groupId,
    dueDate,
    ...(only ? { id: String(only.id ?? ''), target: String(only.target ?? '') } : {}),
  };
}

/** The four plan alert kinds a client may post to /api/notify-ledger-event.
 *  Same list as src/lib/alerts PLAN_ALERT_KINDS; spelled here too so the
 *  server bundle does not pull the plan arithmetic in. */
export const PLAN_ALERT_TYPES = [
  'budget_near',
  'budget_over',
  'goal_milestone',
  'goal_off_track',
] as const;
export type PlanAlertType = (typeof PLAN_ALERT_TYPES)[number];

export const isPlanAlertType = (v: unknown): v is PlanAlertType =>
  typeof v === 'string' && (PLAN_ALERT_TYPES as readonly string[]).includes(v);

/** A budget or goal alert: the kind, the group and the budget or goal id.
 *  Nothing about what the budget is for or how far over it is. The apps
 *  route every one of these to the Plan tab. */
export function planAlertPayload(
  type: PlanAlertType,
  groupId: string,
  id: unknown
): Record<string, string> {
  return { type, groupId, id: String(id ?? '') };
}

/** The first-of-the-month nudge: the type and the group, nothing else. The
 *  apps route it to Home, where the month close card is. */
export function monthClosePayload(groupId: string): Record<string, string> {
  return { type: 'month_close', groupId };
}
