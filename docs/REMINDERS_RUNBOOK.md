# Bill reminders and the month close: runbook

The daily job behind `POST /api/send-bill-reminders` (`server/routes/notifications.ts`).
Once a day it reads `reminder_schedules/{groupId}` (the contentless index every Cherry +
client with push permission publishes: a date, an opaque id and a target screen, nothing
else), pushes "Due tomorrow" to the members of each household with a bill due, and on the
1st of the month also pushes "The month is closed" to every household that has an index.
Pushes carry no amounts, titles, categories or names; the data payload is
`{type, groupId, dueDate, id?, target?}` or `{type: 'month_close', groupId}`
(`server/reminders.ts`, checked by `scripts/reminder-parity.ts`).

The endpoint is written and deployed but answers `503 Reminders are not configured.`
until `REMINDER_CRON_SECRET` exists. Turning it on is the owner's job, in this order.
Nothing below is run by the app or by CI.

Project `gen-lang-client-0987674990`, region `us-east4`, live host
`app.haveanothercherry.com`. Replace `<SECRET>` with one long random string, for example
the output of `openssl rand -base64 32`.

## 1. The secret

```bash
firebase apphosting:secrets:set REMINDER_CRON_SECRET --project gen-lang-client-0987674990
# paste <SECRET> when asked; grant access to the backend when asked
```

Only then add the block to `apphosting.yaml` (declaring a secret that does not exist yet
fails the whole rollout, as the comment there explains) and push to `main`:

```yaml
  - variable: REMINDER_CRON_SECRET
    secret: REMINDER_CRON_SECRET
    availability:
      - RUNTIME
```

Check the rollout the way CLAUDE.md says to, by querying it, not by assuming:

```bash
firebase apphosting:backends:get have-another-cherry --project gen-lang-client-0987674990
firebase apphosting:secrets:describe REMINDER_CRON_SECRET --project gen-lang-client-0987674990
```

## 2. The Cloud Scheduler job

Daily at 18:00 New York time. `REMINDER_TZ_OFFSET_HOURS` is `-4` in `apphosting.yaml`, so
"tomorrow" is reckoned in US Eastern; an 18:00 run lands on the right day in summer and in
winter (23:00 UTC shifted by -4 is still the same calendar day).

```bash
gcloud scheduler jobs create http hac-bill-reminders \
  --project gen-lang-client-0987674990 \
  --location us-east4 \
  --schedule "0 18 * * *" \
  --time-zone "America/New_York" \
  --uri "https://app.haveanothercherry.com/api/send-bill-reminders" \
  --http-method POST \
  --headers "Content-Type=application/json,x-cherry-cron=<SECRET>" \
  --message-body '{}' \
  --attempt-deadline 300s \
  --max-retry-attempts 3 \
  --min-backoff 60s
```

The header value is stored in the job's configuration in plain text and shows in
`gcloud scheduler jobs describe hac-bill-reminders --location us-east4`, so keep Cloud
Scheduler viewer access to the people who may know the secret. To rotate: set a new
secret version (step 1), then
`gcloud scheduler jobs update http hac-bill-reminders --location us-east4 --update-headers x-cherry-cron=<NEW>`.

Retries are safe: a household is reminded once per target day (`lastRemindedFor` on its
index document) and nudged once per closed month (`lastMonthClosedFor`), whatever the
number of runs. Both clients write the index with merge so those marks survive a
republish.

Fire it by hand: `gcloud scheduler jobs run hac-bill-reminders --location us-east4 --project gen-lang-client-0987674990`.

## 3. Test it with curl

```bash
SECRET=$(gcloud secrets versions access latest --secret REMINDER_CRON_SECRET --project gen-lang-client-0987674990)
curl -sS -X POST https://app.haveanothercherry.com/api/send-bill-reminders \
  -H "Content-Type: application/json" \
  -H "x-cherry-cron: $SECRET" \
  -d '{}'
```

Expected answers:

- `{"success":true,"date":"YYYY-MM-DD","groups":N,"sent":M}` on an ordinary day: `date` is
  tomorrow in the reminder zone, `groups` the households reminded on this run, `sent` the
  device tokens FCM accepted. A second run the same day answers `groups: 0`.
- On the 1st the object also carries `monthClose: "YYYY-MM"`, `closeGroups` and `closeSent`.
- `503 {"error":"Reminders are not configured."}`: the secret is not in the runtime yet
  (step 1 not finished, or the rollout has not happened).
- `401 {"error":"Unauthorized."}`: wrong header value.

## 4. Read the log line

Every run writes one line to the Cloud Run log, whether or not anything was sent:

```
Bill reminders: run=2026-11-13 due=2026-11-14 groups=2 sent=3
Bill reminders: run=2026-12-01 due=2026-12-02 groups=0 sent=0 monthClose=2026-11 closeGroups=4 closeSent=7
```

```bash
gcloud logging read \
  'resource.type="cloud_run_revision" AND textPayload:"Bill reminders:"' \
  --project gen-lang-client-0987674990 --limit 14 \
  --format "value(timestamp,textPayload)"
```

A line with `Bill reminders: REMINDER_CRON_SECRET is not set.` means the job is hitting a
runtime without the secret (step 1). `Bill reminder error:` lines carry the Firestore or
FCM error message. No line at all on a scheduled day means the job did not reach the
service: check `gcloud scheduler jobs describe hac-bill-reminders --location us-east4`
for `lastAttemptTime` and `status`.

The Firebase console shows the same logs under App Hosting, backend
`have-another-cherry`, Logs.
