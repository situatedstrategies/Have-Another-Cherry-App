// Tracks the work AuthScreen does around a sign-in: the sign-in attempt
// itself and what follows a new account (the terms and age record, the
// verification email, the signup event).
//
// Inside the app nothing needs this. The auth listener swaps AuthScreen out
// and those promises finish in the background. The funnel sign-in page
// (FunnelLogin) is different: it navigates away to another site the moment
// someone is signed in, and a navigation cancels whatever is still in flight.
// So it waits here first, or a new account would leave with no consent record.

let pending = 0;
let waiters: Array<() => void> = [];

/** Count a piece of sign-in work as in flight until it settles either way. */
export function trackAuthFollowUp<T>(work: Promise<T>): Promise<T> {
  pending += 1;
  const done = () => {
    pending -= 1;
    if (pending === 0) {
      const ready = waiters;
      waiters = [];
      ready.forEach((resolve) => resolve());
    }
  };
  work.then(done, done);
  return work;
}

/**
 * Resolves when no tracked work is in flight, or after timeoutMs, whichever
 * comes first. Never rejects: the caller is about to leave the page and only
 * needs to know when it is reasonable to go.
 */
export function authFollowUpsSettled(timeoutMs: number): Promise<void> {
  if (pending === 0) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, timeoutMs);
    waiters.push(() => {
      clearTimeout(timer);
      resolve();
    });
  });
}
