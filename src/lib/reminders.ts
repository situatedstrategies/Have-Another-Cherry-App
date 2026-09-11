// The two decisions the scheduled bill reminder makes, kept pure so they can
// be tested without an emulator. Both are contracts with the Flutter app's
// routeForPush; scripts/reminder-parity.ts checks that they agree.

/** Tomorrow, in the one zone every reminder is reckoned in. Per-household
 *  zones would mean the server learning where people live. */
export function reminderTargetDate(now: Date, offsetHours = 0): string {
  const shifted = new Date(now.getTime() + offsetHours * 3600000);
  const tomorrow = new Date(Date.UTC(
    shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate() + 1));
  return tomorrow.toISOString().slice(0, 10);
}

/** The push data payload: strings only (FCM rejects anything else), and never
 *  an amount or a title. With more than one bill due the id and target are
 *  omitted and the app opens the day instead. */
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
