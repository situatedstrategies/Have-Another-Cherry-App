// Yearly income input: parsing and the bounds the profile quiz enforces
// (a finite number, at least 0, under a billion). Mirror of the Flutter
// app's domain/profile/income.dart - change them together: both clients
// write the same users/{uid}.income string, and the income-based split
// recommendation divides by the group total.

/** Parse what someone typed (or what an old profile stored): `$65,000`,
 *  `65000`, `65,000.50` all read. Null when it is not a number at all. */
export function parseIncome(raw: string): number | null {
  const cleaned = raw.replace(/[$,\s]/g, '');
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** Why the typed income cannot be saved, or null when it can. */
export function incomeInputError(raw: string): string | null {
  const n = parseIncome(raw);
  if (n === null) return 'Enter a yearly amount, like 65000.';
  if (n < 0) return "Income can't be negative.";
  if (n >= 1_000_000_000) return 'Enter a yearly amount under $1,000,000,000.';
  return null;
}

/** The string that goes on the profile: a plain number, matching what the
 *  quiz writes, so either client can read it back. (JS renders 65000.0 as
 *  "65000" on its own; the Dart mirror rounds explicitly for the same
 *  result.) */
export function normalizeIncome(n: number): string {
  return String(n);
}

/** Whole-dollar display for a stored income string; the raw text when it
 *  cannot be parsed (showing it beats hiding it), null when absent. */
export function formatIncome(raw: string | undefined | null): string | null {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return null;
  const n = parseIncome(trimmed);
  if (n === null) return trimmed;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(n);
}
