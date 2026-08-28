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
};

const PLATFORMS = new Set(["iOS", "Android", "Either"]);

export async function addWaitlistLeadToNotion(lead: WaitlistLead): Promise<void> {
  const token = process.env.NOTION_TOKEN;
  const databaseId = process.env.NOTION_WAITLIST_DB_ID;
  if (!token || !databaseId) return;

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
