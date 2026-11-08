// One error catalog for the web app: when something fails to save, load, or
// send, the user sees the same kind of dialog - what happened in plain words,
// what they can do, and a working path to a human at help@haveanothercherry.com
// with the details already filled in. Mirrored in the Flutter app's
// `lib/core/errors/support.dart`; keep the codes in sync.

import { t } from '../i18n';

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

// The texts live in src/locales under errors.<name>.{title,message,hint}
// and are resolved in the app language when the catalog entry is read, so a
// dialog opened after a language switch is in the new language.
const ERROR_CODES = {
  expenseSave: 'EXPENSE_SAVE_FAILED',
  settlementSave: 'SETTLEMENT_SAVE_FAILED',
  backupExport: 'BACKUP_EXPORT_FAILED',
  inviteSend: 'INVITE_SEND_FAILED',
  settingsSave: 'SETTINGS_SAVE_FAILED',
  receiptScan: 'RECEIPT_SCAN_FAILED',
  amountTooLarge: 'AMOUNT_TOO_LARGE',
  percentTooHigh: 'PERCENT_TOO_HIGH',
} as const;

type ErrorName = keyof typeof ERROR_CODES;

function makeError(name: ErrorName): CherryError {
  const code = ERROR_CODES[name];
  return {
    code,
    get title() {
      return t(`errors.${name}.title`);
    },
    get message() {
      return t(`errors.${name}.message`);
    },
    get hint() {
      return t(`errors.${name}.hint`);
    },
  };
}

export const CHERRY_ERRORS: Record<ErrorName, CherryError> = {
  expenseSave: makeError('expenseSave'),
  settlementSave: makeError('settlementSave'),
  backupExport: makeError('backupExport'),
  inviteSend: makeError('inviteSend'),
  settingsSave: makeError('settingsSave'),
  receiptScan: makeError('receiptScan'),
  amountTooLarge: makeError('amountTooLarge'),
  percentTooHigh: makeError('percentTooHigh'),
};

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
    subject: `[Have Another Cherry] ${error?.code ?? t('errors.supportSubject')}`,
    body: lines.join('\n'),
  });
  return `mailto:${SUPPORT_EMAIL}?${params.toString().replace(/\+/g, '%20')}`;
}

// What the support dialog is shown: the error, where it happened, and
// technical detail that travels only in the support email.
export interface SupportError {
  error: CherryError;
  screen?: string;
  detail?: string;
}
