// Pure helpers for the web funnel sign-in page (/funnel/login).
//
// The RevenueCat web funnel (hosted on signup.cat) sends a visitor here through
// its "External authentication" step so they can sign in with any provider the
// app supports (Apple, Google, email). When they are signed in we send them
// back to the funnel's callback with two things: the `state` value exactly as
// it arrived, and their Firebase uid as `app_user_id`. The uid is the same id
// lib/billing.ts and the mobile apps give RevenueCat, so a purchase made in
// the funnel lands on the same customer.
//
// These live outside the component for the same reason authAction.ts does: the
// redirect check is a security control, and it has to be testable without a
// browser. See test/funnel-login.logic.ts.

export const FUNNEL_LOGIN_PATH = '/funnel/login';

// Hosts we are willing to send a signed-in visitor's uid back to. redirect_uri
// arrives in a URL anyone can craft, so anything not on this list is refused
// rather than followed. signup.cat is RevenueCat's hosted funnel domain. If a
// custom funnel domain is ever configured in RevenueCat (Project settings ->
// Domains), add it here in the same change.
const ALLOWED_CALLBACK_HOSTS = new Set(['signup.cat']);

// RevenueCat's callback endpoint is always this path on the funnel domain.
const CALLBACK_PATH = '/funnel/callback';

// Generous, but bounded: state is opaque to us and gets echoed into a URL.
const MAX_STATE_LENGTH = 4096;

// RevenueCat hands us an anonymous id on the way in. It must never be what we
// hand back: returning it would attach the purchase to nobody.
const ANONYMOUS_PREFIX = '$RCAnonymousID:';

export interface FunnelRequest {
  /** Validated callback URL: origin, path and any query it already carried. */
  callbackBase: string;
  /** The state value exactly as it appeared in the query string, never decoded. */
  rawState: string;
}

export function isFunnelLoginPath(pathname: string): boolean {
  return pathname.replace(/\/+$/, '') === FUNNEL_LOGIN_PATH;
}

// Pull one parameter's value out of a query string without decoding it.
// Returns null when the parameter is absent or appears more than once.
//
// URLSearchParams is deliberately not used for state: it turns "+" into a
// space and normalises percent-encoding, and RevenueCat rejects a state that
// comes back changed in any way.
function rawParam(search: string, name: string): string | null {
  const query = search.startsWith('?') ? search.slice(1) : search;
  const matches = query
    .split('&')
    .filter((pair) => pair === name || pair.startsWith(`${name}=`))
    .map((pair) => pair.slice(name.length + 1));
  return matches.length === 1 ? matches[0] : null;
}

/**
 * Validate the query string RevenueCat sent the visitor in with. Null means
 * the link is not one we will act on, and the page shows an error instead.
 */
export function parseFunnelRequest(search: string): FunnelRequest | null {
  const rawState = rawParam(search, 'state');
  if (!rawState || rawState.length > MAX_STATE_LENGTH) return null;
  // Printable ASCII only, no spaces. "&" and "#" cannot be present (they would
  // have ended the parameter), so the value cannot smuggle in another one.
  if (!/^[\x21-\x7E]+$/.test(rawState)) return null;

  const rawRedirect = rawParam(search, 'redirect_uri');
  if (!rawRedirect) return null;

  let url: URL;
  try {
    // No base on purpose: a relative or protocol-relative value must fail.
    url = new URL(decodeURIComponent(rawRedirect));
  } catch {
    return null;
  }
  if (url.protocol !== 'https:') return null;
  if (url.username || url.password || url.port) return null;
  if (!ALLOWED_CALLBACK_HOSTS.has(url.hostname)) return null;
  if (url.pathname.replace(/\/+$/, '') !== CALLBACK_PATH) return null;
  if (url.hash) return null;
  // The two parameters we add must not already be there to collide with.
  if (url.searchParams.has('state') || url.searchParams.has('app_user_id')) return null;

  return { callbackBase: `${url.origin}${url.pathname}${url.search}`, rawState };
}

/**
 * The URL to send a signed-in visitor back to. Null when there is no real
 * account to report. Only state and app_user_id are added: no email, no name.
 */
export function buildFunnelCallback(request: FunnelRequest, uid: string): string | null {
  if (!uid || uid.startsWith(ANONYMOUS_PREFIX)) return null;
  const separator = request.callbackBase.includes('?') ? '&' : '?';
  return `${request.callbackBase}${separator}state=${request.rawState}&app_user_id=${encodeURIComponent(uid)}`;
}
