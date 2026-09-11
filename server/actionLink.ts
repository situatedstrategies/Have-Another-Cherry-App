// Firebase mints auth action links pointing at <project>.firebaseapp.com's
// generic page. We generate and send these links ourselves, so we retarget
// them to our own handler at /auth/action rather than depending on a console
// setting that has to be kept in sync by hand.

// Every emailed link points at the public origin whatever host the request
// came in on: a link in someone's inbox has to outlive the host that minted
// it. Local dev keeps its own origin; AUTH_ACTION_URL overrides everything.
const PUBLIC_APP_ORIGIN = 'https://app.haveanothercherry.com';

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

// Moves a Firebase-minted link onto our handler, preserving the query string
// exactly (mode, oobCode, apiKey, lang). Returns the link unchanged if
// anything looks wrong: a working ugly link beats a mangled one.
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
