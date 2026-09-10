// Firebase mints auth action links pointing at
// <project>.firebaseapp.com/__/auth/action, which is Google's own generic page.
// We serve our own handler at /auth/action, so we retarget the link before
// emailing it.
//
// Doing it here rather than through the console's "custom action URL" setting is
// deliberate: we generate these links ourselves and send them ourselves, so the
// host is ours to choose, and the app stops depending on a console setting that
// has to be kept in sync by hand for every project.

// The one public address of the app. Every link we put in an email points
// here, whatever host the request that triggered it came in on.
//
// It used to be derived from the incoming request, so the same build answered
// correctly on the custom domain, on the raw App Hosting URL, and in local dev.
// That also meant a reset requested through the raw App Hosting URL mailed a
// raw App Hosting link, and one requested through the old beta host mailed a
// beta link that stopped resolving the day beta was retired. A link in
// someone's inbox has to outlive whichever host minted it, so it is pinned.
// Local dev keeps its own origin so the handler can be exercised offline, and
// AUTH_ACTION_URL still overrides everything if a backend ever needs to.
export const PUBLIC_APP_ORIGIN = 'https://app.haveanothercherry.com';

export function actionHandlerBase(
  headers: Record<string, string | string[] | undefined>,
  override?: string
): string {
  if (override) return override;

  const first = (v: string | string[] | undefined): string | undefined => {
    const raw = Array.isArray(v) ? v[0] : v;
    return raw ? raw.split(',')[0]!.trim() : undefined;
  };

  const host = first(headers['x-forwarded-host']) || first(headers.host);
  if (host && /^(localhost|127\.0\.0\.1|\[::1\])(:|$)/.test(host)) {
    return `http://${host}/auth/action`;
  }
  return `${PUBLIC_APP_ORIGIN}/auth/action`;
}

// Move a Firebase-minted link onto our handler, preserving the query string
// exactly - mode, oobCode, apiKey and lang all have to survive untouched.
//
// Returns the original link unchanged if anything looks wrong. A cosmetically
// imperfect link that still works beats an email that never arrives, or one
// carrying a link we mangled.
export function retargetActionLink(link: string, base: string | null): string {
  if (!base) return link;
  try {
    const original = new URL(link);
    const target = new URL(base);
    if (!original.search) return link;
    target.search = original.search;
    return target.toString();
  } catch {
    return link;
  }
}
