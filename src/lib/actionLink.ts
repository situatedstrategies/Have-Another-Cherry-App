// Firebase mints auth action links pointing at
// <project>.firebaseapp.com/__/auth/action, which is Google's own generic page.
// We serve our own handler at /auth/action, so we retarget the link before
// emailing it.
//
// Doing it here rather than through the console's "custom action URL" setting is
// deliberate: we generate these links ourselves and send them ourselves, so the
// host is ours to choose, and the app stops depending on a console setting that
// has to be kept in sync by hand for every project.

// Where our handler lives for the request that came in.
//
// Derived from the incoming request rather than hardcoded, because the same
// build serves both environments. A reset started on beta.haveanothercherry.com
// has to stay on beta: its oobCode belongs to the beta Firebase project, and the
// production app would validate it against the production project and reject it
// as invalid. AUTH_ACTION_URL overrides this if a backend ever needs to pin it.
export function actionHandlerBase(
  headers: Record<string, string | string[] | undefined>,
  override?: string
): string | null {
  if (override) return override;

  const first = (v: string | string[] | undefined): string | undefined => {
    const raw = Array.isArray(v) ? v[0] : v;
    return raw ? raw.split(',')[0]!.trim() : undefined;
  };

  const host = first(headers['x-forwarded-host']) || first(headers.host);
  if (!host) return null;

  const proto =
    first(headers['x-forwarded-proto']) ||
    (/^(localhost|127\.0\.0\.1|\[::1\])(:|$)/.test(host) ? 'http' : 'https');

  return `${proto}://${host}/auth/action`;
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
