// Display formatting shared by the ledger screens. Amounts stay in US dollars
// (the only currency the ledger holds); number and date formatting follow the
// app language (src/i18n.ts), so a Russian or Spanish reader sees their own
// separators and month names.

import { intlLocale } from '../i18n';
import { parseLocalDate } from './recurring';

/** "$1,234.50" via Intl currency formatting (negatives render as "-$5.00"). */
export const formatCurrency = (value: number, fractionDigits?: number): string =>
  value.toLocaleString(intlLocale(), {
    style: 'currency',
    currency: 'USD',
    ...(fractionDigits === undefined
      ? {}
      : { minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits }),
  });

/** "$1,234.50" with a literal dollar prefix (negatives render as "$-5.00").
 *  Kept apart from formatCurrency because the two differ on negative input. */
export const formatAmount = (value: number): string =>
  `$${value.toLocaleString(intlLocale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** A plain number with the locale's separators. */
export const formatNumber = (value: number, options?: Intl.NumberFormatOptions): string =>
  value.toLocaleString(intlLocale(), options);

/** "Mar 3, 2026". Empty string for a missing date. */
export const formatDate = (dateStr?: string): string => {
  if (!dateStr) return '';
  return parseLocalDate(dateStr).toLocaleDateString(intlLocale(), {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

/** "Mar 3". */
export const formatShortDate = (dateStr: string): string =>
  parseLocalDate(dateStr).toLocaleDateString(intlLocale(), { month: 'short', day: 'numeric' });

/** "Mar 3, 02:15 PM". Empty string for a missing timestamp. */
export const formatDateTime = (dateStr?: string): string => {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleString(intlLocale(), {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

/** Any Date with the given options, in the app language. */
export const formatDateWith = (date: Date, options: Intl.DateTimeFormatOptions): string =>
  date.toLocaleDateString(intlLocale(), options);
