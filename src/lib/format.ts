// Display formatting shared by the ledger screens; en-US on purpose, like the mobile client.

// A date-only string (YYYY-MM-DD) parsed as UTC midnight shows the previous
// day anywhere west of Greenwich, so those are parsed as local midnight.
const parseDateInput = (dateStr: string): Date =>
  /^\d{4}-\d{2}-\d{2}$/.test(dateStr) ? new Date(dateStr + 'T00:00:00') : new Date(dateStr);

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
  return parseDateInput(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

/** "Mar 3". */
export const formatShortDate = (dateStr: string): string =>
  parseDateInput(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

/** "Mar 3, 02:15 PM". Empty string for a missing timestamp. */
export const formatDateTime = (dateStr?: string): string => {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
};
