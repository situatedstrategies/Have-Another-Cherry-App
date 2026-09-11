// Display formatting shared by the ledger screens; en-US on purpose, like the mobile client.

import { parseLocalDate } from './recurring';

/** "$1,234.50" via Intl currency formatting (negatives render as "-$5.00"). */
export const formatCurrency = (value: number): string =>
  value.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

/** "$1,234.50" with a literal dollar prefix (negatives render as "$-5.00").
 *  Kept apart from formatCurrency because the two differ on negative input. */
export const formatAmount = (value: number): string =>
  `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** "Mar 3, 2026". Empty string for a missing date. */
export const formatDate = (dateStr?: string): string => {
  if (!dateStr) return '';
  return parseLocalDate(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

/** "Mar 3". */
export const formatShortDate = (dateStr: string): string =>
  parseLocalDate(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

/** "Mar 3, 02:15 PM". Empty string for a missing timestamp. */
export const formatDateTime = (dateStr?: string): string => {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};
