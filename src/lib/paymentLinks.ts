// Direct-payment integration layer.
//
// Neither Venmo nor Zelle offers a public server API for third-party payment
// initiation, so "integration" today means: store each member's handles on
// their own user doc, and hand the payer a prefilled path into the app they
// already have. Venmo supports a documented deep link that opens the payment
// screen with recipient/amount/note filled in. Zelle lives inside each bank's
// app with no universal deep link, so the best possible flow is surfacing the
// recipient's enrolled email/phone with one-tap copy.
//
// If either network ever ships a real API, this module is the seam: callers
// only know about PaymentTarget, not about URLs.

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

// Every way the payer can send money to this recipient, given the recipient's
// stored handles. Order = preference (deep link first).
export function paymentTargetsFor(
  handles: { venmo?: string; zelle?: string } | undefined,
  amount: number,
  note: string
): PaymentTarget[] {
  const targets: PaymentTarget[] = [];
  if (handles?.venmo?.trim()) targets.push(venmoTarget(handles.venmo, amount, note));
  if (handles?.zelle?.trim()) targets.push(zelleTarget(handles.zelle));
  return targets;
}
