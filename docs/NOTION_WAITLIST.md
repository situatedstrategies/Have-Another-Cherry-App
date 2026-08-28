# Waitlist → Notion

Signups from the homepage form land in two places: an email to
`poolside@haveanothercherry.com` (via Resend) and a row in the Notion **App
Waitlist** database.

The email is the system of record. Notion is the working surface on top of it —
if Notion is down or unconfigured the signup still succeeds and the email still
sends. That is deliberate: a CRM outage must never cost a lead.

## Where things are

| | |
|---|---|
| Form | `have-another-cherry-site/index.html` + `waitlist.js` |
| Endpoint | `POST /api/beta-signup` in `server.ts` |
| Email | `sendBetaSignupNotification` → `poolside@haveanothercherry.com` |
| Notion mirror | `src/lib/notion.ts` → `addWaitlistLeadToNotion` |
| Database | [App Waitlist](https://app.notion.com/p/bf32909ee162429ea854165cb86158ac) |

Database id: `bf32909e-e162-429e-a854-165cb86158ac`

## Turning the Notion mirror on

Until both variables below are set, `addWaitlistLeadToNotion` returns
immediately and nothing is written. The form works either way.

**1. Create an internal integration**

https://www.notion.so/profile/integrations → **New integration**

- Type: **Internal**
- Associated workspace: the one holding *Have Another Cherry*
- Capabilities: **Insert content** only. It does not need to read or update
  content, and it should not have user information access.

Copy the **Internal Integration Secret** (starts `ntn_`).

**2. Share the database with it**

Open [App Waitlist](https://app.notion.com/p/bf32909ee162429ea854165cb86158ac) →
`···` → **Connections** → add the integration.

This step is the one people miss. A valid token with no connection returns
`404 object_not_found`, which reads like a wrong database id.

**3. Store the secret**

```sh
firebase apphosting:secrets:set NOTION_TOKEN --project gen-lang-client-0987674990
```

Then grant the backend access when prompted, and add both variables to
`apphosting.yaml`:

```yaml
  - variable: NOTION_TOKEN
    secret: NOTION_TOKEN
    availability:
      - RUNTIME
  - variable: NOTION_WAITLIST_DB_ID
    value: bf32909e-e162-429e-a854-165cb86158ac
    availability:
      - RUNTIME
```

`NOTION_WAITLIST_DB_ID` is a plain value, not a secret — a database id is not
sensitive on its own.

**4. Verify**

Submit the form, then check the database. On failure the server logs
`Notion waitlist mirror failed: <status>` and nothing else — the response body
is deliberately not logged, because it echoes the submitted values back and
that is marketing PII.

## Fields written

| Notion property | Source |
|---|---|
| Email | form `email` (the title property) |
| Name | form `name` |
| Platform | `iOS` / `Android` / `Either` from the select |
| Consent | always true — the endpoint rejects submissions without it |
| Source | `location.pathname + location.search`, so utm tags survive |
| Referrer | `document.referrer`, only when it parses as a URL |
| Form | `Waitlist` or `Beta`, so the two forms are separable |
| Device | derived server-side from the User-Agent header |
| Status | set to `Not started` |
| Signed Up | Notion's created time |
| Lead ID | Notion auto-increment, `WL-` prefix |

## Platform vs Device

Two different questions, both worth having:

- **Platform** is what they *asked for* — the select on the form.
- **Device** is what they were *browsing on*, derived from the User-Agent
  header server-side.

Detection is deliberately server-side. A client-supplied value is trivially
spoofed and would mean another field on the form for nothing. It is also
deliberately coarse — iPhone / iPad / Android / Mac / Windows / Other — because
the only question worth answering is whether someone asking for Android is
signing up on an iPhone.

One quirk it handles: iPadOS reports itself as desktop Safari, so a Macintosh
UA that also says `Mobile` is treated as an iPad.

## Note on the beta form

`beta.html` posts to the same endpoint, so beta signups appear in Notion too.
They are tagged `Form = Beta` where the homepage sends `Form = Waitlist`, so
filter or group on that to keep the two lists apart.
