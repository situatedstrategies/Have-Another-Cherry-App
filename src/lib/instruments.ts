// Display names for payment instruments. The stored codes (CASH, VENMO, ...)
// never change; only what the screen shows does.
import { t } from '../i18n';
import { PaymentInstrument } from '../types';

export const PAYMENT_INSTRUMENTS: PaymentInstrument[] = [
  'CASH',
  'CREDIT',
  'DEBIT',
  'TRANSFER',
  'VENMO',
  'ZELLE',
  'OTHER',
];

/** "Bank Transfer", or the stored code when it is not one we know. */
export function instrumentLabel(code: string | undefined | null): string {
  if (!code) return '';
  return t(`method.${code}`, { defaultValue: code });
}

/** The one-word chip label ("Bank"). */
export function instrumentShortLabel(code: string): string {
  return t(`method.short.${code}`, { defaultValue: code });
}
