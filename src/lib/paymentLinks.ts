// Direct-payment handoff. Neither Venmo nor Zelle has a public API for
// third-party payment initiation, so the payer gets a prefilled path into the
// app they already have: Venmo's documented deep link, or the recipient's
// enrolled Zelle handle to copy. Callers only know about PaymentTarget.

export interface PaymentTarget {
  method: 'venmo' | 'zelle';
  /** The handle to show the payer (username / email / phone). */
  handle: string;
  /** A URL that opens the payment prefilled, when the network supports one. */
  url?: string;
  /** Text worth copying when there is no deep link (Zelle). */
  copyText?: string;
}

const sanitizeAmount = (amount: number): string =>
  (Math.round(Math.max(0, amount) * 100) / 100).toFixed(2);

// Venmo deep link. The https:// form works on desktop and falls through to the
// app on mobile; venmo:// would break where the app isn't installed.
export function venmoTarget(username: string, amount: number, note: string): PaymentTarget {
  const handle = username.trim().replace(/^@/, '');
  const params = new URLSearchParams({
    txn: 'pay',
    audience: 'private',
    recipients: handle,
    amount: sanitizeAmount(amount),
    note: note.slice(0, 140) || 'Have Another Cherry settle-up',
  });
  return {
    method: 'venmo',
    handle: `@${handle}`,
    url: `https://venmo.com/?${params.toString()}`,
  };
}

export function zelleTarget(enrolledHandle: string): PaymentTarget {
  const handle = enrolledHandle.trim();
  return {
    method: 'zelle',
    handle,
    copyText: handle,
  };
}
