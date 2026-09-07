// The two decisions the scheduled bill reminder makes, pulled out of the
// request handler so they can be tested without an emulator and a cron.
//
// Both are contracts with the mobile client rather than internal details: the
// date decides which households get a push at all, and the payload keys are
// read by `routeForPush` in the Flutter app (test/push_route_test.dart).
// Nothing type-checks across that gap, so scripts/reminder-parity.ts does.

/**
 * The date a run should remind for: tomorrow, in the zone the reminder is
 * reckoned in.
 *
 * Due dates carry no time of day by design, so a reminder has to pick an hour,
 * and picking one per household would mean the server learning where people
 * live. One offset for everyone is the smaller disclosure, at the cost of a
 * reminder landing a few hours off for someone several zones away.
 */
export function reminderTargetDate(now: Date, offsetHours = 0): string {
  const shifted = new Date(now.getTime() + offsetHours * 3600000);
  const tomorrow = new Date(Date.UTC(
    shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate() + 1));
  return tomorrow.toISOString().slice(0, 10);
}

/**
 * The data payload for a bill reminder push.
 *
 * FCM requires every value to be a string and rejects the whole send if one is
 * not, so this returns strings only. It carries a date, an opaque id and which
 * screen to open, and never an amount, a title or a category: it travels
 * through FCM and lands on a lock screen.
 *
 * With more than one bill due the id and target are omitted, because one push
 * per household per day cannot point at one of three bills without being wrong
 * about the other two. The app opens the day instead.
 */
export function reminderPayload(
  groupId: string,
  dueDate: string,
  entries: { id?: unknown; target?: unknown }[],
): Record<string, string> {
  const only = entries.length === 1 ? entries[0] : null;
  return {
    type: 'bill_reminder',
    groupId,
    dueDate,
    ...(only ? { id: String(only.id ?? ''), target: String(only.target ?? '') } : {}),
  };
}
