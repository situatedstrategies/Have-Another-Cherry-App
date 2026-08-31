// Value limits for money and percentage inputs - one place for the rules so
// every surface refuses, rounds, and phrases things the same way. Mirrored in
// the Flutter app's `lib/core/limits.dart`; change them together.
//
// The rules (deliberately not advertised in the UI):
// - A percentage field accepts 0-500. The headroom above 100 exists for
//   lending with interest; anything past 500 is treated as a typo.
// - Dollar amounts save exactly up to $999,999. From $1,000,000 the value is
//   rounded to the nearest $100,000 (a purchase that size is an estimate
//   anyway). Past $999,999,999 is refused as a typo.

export const MAX_PERCENT = 500;
export const MAX_EXACT_AMOUNT = 999_999;
export const AMOUNT_HARD_CAP = 999_999_999;

export interface NormalizedAmount {
  value: number;
  wasRounded: boolean;
}

/** Round-to-nearest-$100k normalization for very large amounts. Returns null
 *  when the value can't be saved at all (negative, NaN, past the hard cap). */
export function normalizeAmount(raw: number): NormalizedAmount | null {
  if (!Number.isFinite(raw) || raw < 0) return null;
  if (raw > AMOUNT_HARD_CAP) return null;
  if (raw <= MAX_EXACT_AMOUNT) return { value: raw, wasRounded: false };
  const rounded = Math.round(raw / 100_000) * 100_000;
  return { value: rounded, wasRounded: rounded !== raw };
}

/** Error message for an unusable dollar amount, or null when acceptable
 *  (possibly after rounding - call normalizeAmount on save). */
export function amountError(raw: number): string | null {
  if (!Number.isFinite(raw)) return 'Enter an amount.';
  if (raw < 0) return "An amount can't be negative.";
  if (raw > AMOUNT_HARD_CAP) {
    return 'That amount looks too large to be right - check for a typo.';
  }
  return null;
}

/** Error message for an unusable percentage, or null when acceptable. The
 *  500 ceiling is quiet headroom for interest and never stated outright. */
export function percentError(raw: number): string | null {
  if (!Number.isFinite(raw)) return 'Enter a percentage.';
  if (raw < 0) return "A percentage can't be negative.";
  if (raw > MAX_PERCENT) {
    return 'That percentage looks too high - check for a typo.';
  }
  return null;
}
