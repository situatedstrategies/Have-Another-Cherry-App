// One error catalog for the web app: when something fails to save, load, or
// send, the user sees the same kind of dialog - what happened in plain words,
// what they can do, and a working path to a human at help@haveanothercherry.com
// with the details already filled in. Mirrored in the Flutter app's
// `lib/core/errors/support.dart`; keep the codes in sync.

export const SUPPORT_EMAIL = 'help@haveanothercherry.com';

export interface CherryError {
  /** Stable code that appears in the support email. */
  code: string;
  title: string;
  /** Why it failed, in the user's language. */
  message: string;
  /** What they can do right now. */
  hint: string;
}

export const CHERRY_ERRORS = {
  expenseSave: {
    code: 'EXPENSE_SAVE_FAILED',
    title: "That expense didn't save",
    message:
      'The expense could not be written to your ledger, so nothing was changed and nothing was lost.',
    hint: 'Check your connection and try saving again. If it keeps failing, tell us - the details are pre-filled for you.',
  },
  settlementSave: {
    code: 'SETTLEMENT_SAVE_FAILED',
    title: "That payment didn't record",
    message:
      'The payment could not be added to the expense, so the balance is unchanged. If you already sent money in Venmo or Zelle, that transfer is fine - only the record here is missing.',
    hint: "Try recording it again in a moment. If it keeps failing, contact us and we'll make sure the ledger ends up right.",
  },
  backupExport: {
    code: 'BACKUP_EXPORT_FAILED',
    title: "The backup didn't export",
    message: 'The backup file could not be created. Your ledger itself is untouched.',
    hint: 'Try again in a moment. Still stuck? Contact us.',
  },
  inviteSend: {
    code: 'INVITE_SEND_FAILED',
    title: "The invite didn't send",
    message: 'The invite email could not be sent right now.',
    hint: 'You can also share your group code directly - it works the same. If email invites keep failing, contact us.',
  },
  settingsSave: {
    code: 'SETTINGS_SAVE_FAILED',
    title: "That setting didn't save",
    message: 'Your change could not be stored, so the previous value still applies.',
    hint: 'Try again in a moment. If it keeps failing, contact us.',
  },
  receiptScan: {
    code: 'RECEIPT_SCAN_FAILED',
    title: "Couldn't read that receipt",
    message: 'The photo reached us but could not be turned into an expense.',
    hint: 'Try a straighter, brighter photo - or enter it by hand; the split still does itself. If scanning never works for you, contact us.',
  },
  amountTooLarge: {
    code: 'AMOUNT_TOO_LARGE',
    title: "That amount can't be saved",
    message:
      'That number is past what a single expense can hold, which usually means an extra digit slipped in.',
    hint: "Double-check the amount. If you genuinely need a number this large, contact us - we'd love to hear the story.",
  },
  percentTooHigh: {
    code: 'PERCENT_TOO_HIGH',
    title: "That percentage can't be saved",
    message: 'That share is past what a split can hold, which usually means a typo.',
    hint: 'Double-check the number. If this is a real arrangement you need, contact us and tell us about it.',
  },
} satisfies Record<string, CherryError>;

/** mailto: link with the report pre-filled - error code, screen, time,
 *  browser - plus a describe-what-happened prompt. */
export function supportMailto(error?: CherryError, screen?: string, detail?: string): string {
  const lines = [
    'Hi Have Another Cherry team,',
    '',
    "Something went wrong and I'd like help.",
    '',
    'What I was doing when it happened:',
    '  (please describe)',
    '',
    '--- filled in automatically ---',
    `Error: ${error?.code ?? 'GENERAL'}${error ? ` (${error.title})` : ''}`,
    `Screen: ${screen ?? 'web app'}`,
    `Time: ${new Date().toISOString()}`,
    `Browser: ${typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown'}`,
  ];
  if (detail) lines.push(`Detail: ${detail}`);
  const params = new URLSearchParams({
    subject: `[Have Another Cherry] ${error?.code ?? 'Support request'}`,
    body: lines.join('\n'),
  });
  return `mailto:${SUPPORT_EMAIL}?${params.toString().replace(/\+/g, '%20')}`;
}
