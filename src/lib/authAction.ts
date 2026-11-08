// Pure helpers for the Firebase Auth email action handler (/auth/action).
//
// These live outside the component so they can be exercised on their own - the
// continueUrl check in particular is a security control, and a security control
// that cannot be tested without a browser tends not to get tested.

import { t } from '../i18n';
import { passwordPolicyMessage } from './password';

export const SUPPORT_EMAIL = 'support@haveanothercherry.com';

// Hosts we are willing to bounce to via continueUrl, on top of same-origin.
// continueUrl arrives in a URL anyone can craft, and it hangs off a link users
// are trained to trust, so anything not on this list is dropped rather than
// followed. Without this check the handler would be an open redirect.
const ALLOWED_CONTINUE_HOSTS = new Set(['app.haveanothercherry.com', 'haveanothercherry.com']);

export function sanitizeContinueUrl(raw: string | null | undefined, origin: string): string | null {
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw, origin);
  } catch {
    return null;
  }
  // Blocks javascript:, data:, and friends.
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  if (url.origin === origin) return url.toString();
  if (ALLOWED_CONTINUE_HOSTS.has(url.hostname)) return url.toString();
  return null;
}

// Firebase error codes are useful to us and meaningless to a user. Map the ones
// that actually happen to plain language; everything else falls back to a
// generic message rather than leaking a raw code onto the screen.
export function describeCodeError(err: unknown): string {
  const code =
    typeof err === 'object' && err !== null && 'code' in err
      ? String((err as { code: unknown }).code)
      : '';

  switch (code) {
    case 'auth/expired-action-code':
      return t('authAction.err.expired');
    case 'auth/invalid-action-code':
      return t('authAction.err.invalid');
    case 'auth/user-disabled':
      return t('authAction.err.userDisabled', { email: SUPPORT_EMAIL });
    case 'auth/user-not-found':
      return t('authAction.err.userNotFound');
    case 'auth/weak-password':
      return passwordPolicyMessage();
    case 'auth/network-request-failed':
      return t('authAction.err.network');
    case 'auth/too-many-requests':
      return t('authAction.err.tooMany');
    default:
      return t('authAction.err.generic');
  }
}
