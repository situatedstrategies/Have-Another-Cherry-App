// Mirror marketing leads into the Notion "App Waitlist" database.
//
// Best-effort by design: the caller must never fail a signup because Notion is
// down or unconfigured. The email to poolside@ is the system of record; Notion
// is the working surface on top of it. If NOTION_TOKEN is unset this is a no-op,
// so the form keeps working before the integration is wired up.
const NOTION_VERSION = "2022-06-28";

export type WaitlistLead = {
  email: string;
  name?: string;
  platform?: string;   // "iOS" | "Android" | "Either"
  source?: string;
  referrer?: string;
  consent?: boolean;
  notes?: string;
  formType?: string;   // "Waitlist" | "Beta"
  device?: string;     // "iPhone" | "iPad" | "Android" | "Mac" | "Windows" | "Other"
};

// Derived from request headers rather than sent by the client: a
// client-supplied value is trivially spoofed and would mean another field on
// the form for no benefit. Coarse on purpose — we only want to know whether
// someone asking for Android is browsing on an iPhone.
//
// User-Agent is the primary signal but it is not guaranteed. Chrome's UA
// reduction strips the platform on some surfaces, privacy browsers send a
// generic string, and anything that is not a browser sends none at all, which
// silently recorded every such lead as "Other". So client hints are consulted
// as a fallback: Chromium sends Sec-CH-UA-Platform and Sec-CH-UA-Mobile by
// default on secure origins, and between them they answer the same question.
export function deviceFromUserAgent(ua?: string, hints?: DeviceHints): string {
  const s = (ua || "").toLowerCase();

  if (s) {
    if (/iphone|ipod/.test(s)) return "iPhone";
    if (/ipad/.test(s)) return "iPad";
    // iPadOS reports as desktop Safari; the touch-capable Mac signature is an iPad.
    if (/macintosh/.test(s) && /mobile/.test(s)) return "iPad";
    if (/android/.test(s)) return "Android";
    if (/macintosh|mac os x/.test(s)) return "Mac";
    if (/windows/.test(s)) return "Windows";
  }

  // Values arrive quoted, e.g. Sec-CH-UA-Platform: "macOS", and mobile is the
  // literal "?1" / "?0".
  const platform = (hints?.platform || "").toLowerCase().replace(/"/g, "").trim();
  const mobile = (hints?.mobile || "").includes("1");
  if (platform === "ios") return mobile ? "iPhone" : "iPad";
  if (platform === "android") return "Android";
  if (platform === "macos") return "Mac";
  if (platform === "windows") return "Windows";

  return "Other";
}

/** Chromium client hints, read from the request headers. */
export type DeviceHints = {
  /** `Sec-CH-UA-Platform`, e.g. `"macOS"`. */
  platform?: string;
  /** `Sec-CH-UA-Mobile`, `?1` or `?0`. */
  mobile?: string;
};

const PLATFORMS = new Set(["iOS", "Android", "Either"]);
const FORM_TYPES = new Set(["Waitlist", "Beta"]);
const DEVICES = new Set(["iPhone", "iPad", "Android", "Mac", "Windows", "Other"]);

export async function addWaitlistLeadToNotion(lead: WaitlistLead): Promise<void> {
  const token = process.env.NOTION_TOKEN;
  const databaseId = process.env.NOTION_WAITLIST_DB_ID;

  // "disabled" turns the mirror off explicitly. apphosting.yaml is shared by
  // both backends, so a secret declared there has to resolve in beta too, and
  // App Hosting rejects an empty string as a value. A named sentinel is how
  // beta opts out without needing its own copy of the production token, and it
  // beats letting a placeholder through to fail one API call per signup.
  if (!token || !databaseId || token.toLowerCase() === "disabled") return;

  const text = (v?: string) =>
    v && v.trim() ? { rich_text: [{ text: { content: v.trim().slice(0, 1900) } }] } : undefined;

  const properties: Record<string, unknown> = {
    Email: { title: [{ text: { content: lead.email.slice(0, 254) } }] },
    Consent: { checkbox: lead.consent === true },
    Status: { status: { name: "Not started" } },
  };
  const name = text(lead.name);
  if (name) properties.Name = name;
  const source = text(lead.source);
  if (source) properties.Source = source;
  const notes = text(lead.notes);
  if (notes) properties.Notes = notes;
  if (lead.platform && PLATFORMS.has(lead.platform)) {
    properties.Platform = { multi_select: [{ name: lead.platform }] };
  }
  if (lead.formType && FORM_TYPES.has(lead.formType)) {
    properties.Form = { select: { name: lead.formType } };
  }
  if (lead.device && DEVICES.has(lead.device)) {
    properties.Device = { select: { name: lead.device } };
  }
  // Notion rejects a malformed URL outright, which would drop an otherwise
  // good lead, so only send it when it parses.
  if (lead.referrer) {
    try {
      properties.Referrer = { url: new URL(lead.referrer).toString() };
    } catch { /* not a URL; omit */ }
  }

  const res = await fetch("https://api.notion.com/v1/pages", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ parent: { database_id: databaseId }, properties }),
  });

  if (!res.ok) {
    // Log the status only. The body can echo submitted values back, and this
    // is marketing PII we have no reason to put in logs.
    throw new Error(`Notion responded ${res.status}`);
  }
}
