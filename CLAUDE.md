# CLAUDE.md - Have Another Cherry

Project context for Claude Code. Read this first before making changes.

## What this is
A household expense-splitter web app ("Have Another Cherry"). Users create a group, set a percentage split between members, log shared expenses, and settle up. There's also AI receipt scanning and a financial-profile quiz.

## Stack
- Frontend: React 19 + Vite 6 + TypeScript, Tailwind CSS v4 (`@tailwindcss/vite`).
- Backend: Express server in `server.ts` (run with `tsx`). In dev it uses Vite middleware; in prod it serves the built SPA from `dist/`.
- Data/auth: Firebase (Auth + Firestore, client SDK). `firebase-admin` is a dependency but the server currently uses ADC, not the Admin SDK.
- AI: Google Gemini via **Vertex AI** (`@google/genai`), authenticated with Application Default Credentials (ADC) - no API key.
- Email: Resend (`resend`), sending from a verified domain.
- Deploy: Firebase App Hosting (Cloud Run under the hood), auto-deploys from GitHub `main`.

## Repo layout
- `index.html` -> `src/main.tsx` -> `src/App.tsx` (SPA entry).
- `src/components/*.tsx` - screens (GroupSetup, ExpenseForm, ExpenseList, ExpenseDetail, SettleUpModal, ProfileSetup, StatsSection, AuthScreen, etc.).
- `src/lib/*.ts` - helpers (resend, crypto, members, profiles, accounting, mismatch).
- `src/types.ts` - data model (Group, User, Expense, Settlement, etc.).
- `src/templates/inviteEmail.html` - Resend invite email template.
- `src/firebase.ts` - Firebase init from `firebase-applet-config.json`.
- `server.ts` - Express API + static serving.
- `public/` - static assets served at site root (e.g. `/cherry2transparent.png`).
- `apphosting.yaml` - Firebase App Hosting runtime config (secrets).

## Commands
- Install: `bun install` (repo uses Bun; `npm install` also works).
- Dev: `npm run dev` (starts `tsx server.ts`; open http://localhost:3000).
- Build: `npm run build` (`vite build` + esbuild bundles the server to `dist/server.cjs`).
- Start built app: `npm run start`.
- Typecheck: `npm run lint` (`tsc --noEmit`).

## Check live backend state before assuming it (hard rule)

**Never reason about deploy state from this file, from git, or from what was
true earlier in the session. Query it.** Backends get renamed, reconnected,
disabled and re-secreted outside the repo, and every one of those changes is
invisible to the code.

Run these first, every time, before diagnosing anything about a deploy:

```bash
firebase apphosting:backends:get <backend> --project <project>   # repo link, ABIU, runtime
firebase apphosting:secrets:describe <NAME> --project <project>  # per project, not per repo
gh api repos/<owner>/<repo>/commits/<sha>/check-runs             # what actually ran
```

Things this rule exists to stop, all of which have already happened here:

- Diagnosing a build failure from a stale `backends:list` read taken an hour
  earlier, after the owner had already fixed the repository link.
- Assuming a secret exists in both projects because it is declared once in the
  shared `apphosting.yaml`. Secrets are per project.
- Reading a green "App Hosting - Rollout" check as proof the new code is
  serving. A rollout can succeed while `ABIU: Disabled` means nothing was
  triggered by the push at all.
- Comparing local build hashes to live ones to confirm a deploy. A local
  `npm ci` resolves differently from the server's, so the hashes never match
  and the comparison proves nothing. Compare a static asset instead.

When a deploy looks wrong, get the real error rather than inferring one:
`firebase apphosting:rollouts:create <backend> --project <p> --git-branch <b>`
returns the actual build failure, including a Cloud Build log link.

## Google Cloud / Firebase project
- Project: "Have Another Cherry SSLLC" = `gen-lang-client-0987674990`.
- Firestore: `(default)` database (nam5). Security rules in `firestore.rules`.
- App Hosting backend: `have-another-cherry`, region `us-east4`.
- Live URL: https://have-another-cherry--gen-lang-client-0987674990.us-east4.hosted.app/
- Custom domain: app.haveanothercherry.com. Marketing site: haveanothercherry.com (Squarespace).
- The site password wall in `server.ts` is OFF by default (the app is public). `SITE_GATE_ENABLED=1` in `apphosting.yaml` turns it back on.

## Retired beta environment
There is no beta any more. It was a second App Hosting backend on its own Firebase
project (`have-another-cherry-beta`) at beta.haveanothercherry.com, and it split the
user base in two. `server.ts` now 301-redirects any `beta.*` host to
app.haveanothercherry.com. Do not reintroduce `firebase-applet-config.beta.json`,
`apphosting.beta.yaml`, or a `VITE_APP_ENV` switch; one project, one backend.

## AI (Gemini via Vertex) - important
This project's Google Cloud org blocks standalone Gemini API keys (they must be service-account-bound and don't work with the Developer API). So the app uses **Vertex AI + ADC** and needs **no API key**.
- Code pattern: `new GoogleGenAI({ vertexai: true, project: process.env.GOOGLE_CLOUD_PROJECT || "gen-lang-client-0987674990", location: "us-central1" })`.
- Prod auth: the App Hosting compute service account (`firebase-app-hosting-compute@gen-lang-client-0987674990.iam.gserviceaccount.com`) has role `Vertex AI User` (roles/aiplatform.user).
- Local dev auth: run `gcloud auth application-default login` and `gcloud config set project gen-lang-client-0987674990`.
- DO NOT reintroduce a `GEMINI_API_KEY` - it will not work in this org.

## Email (Resend) - important
- `RESEND_API_KEY` lives in **Cloud Secret Manager**, referenced in `apphosting.yaml` (env var backed by `secret:`), not as a plaintext env var.
- The App Hosting compute SA has both `Secret Manager Secret Accessor` and `Secret Manager Viewer` on that secret (Viewer is needed so the build can resolve the `latest` version).
- Senders (hard rule, all verified on Resend): `poolside@haveanothercherry.com` for human-flavored email (invites, waitlist replies). `tartcherry@haveanothercherry.com` for payment reminders. `notifications@haveanothercherry.com` for system notifications (e.g. waitlist signups forwarded to the poolside inbox). `reset@haveanothercherry.com` for password resets and `verify@haveanothercherry.com` for email verification. `help@haveanothercherry.com` reaches a real person: it is the support/unsubscribe contact, never a sender.
- Template `src/templates/inviteEmail.html` uses placeholders `{{recipientName}}`, `{{fromName}}`, `{{groupName}}`, `{{inviteCode}}`, `{{splitRows}}`. `src/lib/resend.ts` builds the split rows and fills the placeholders, then sends.
- Invite flow: `GroupSetup.tsx` (collects recipient name + email, computes fromName and split) -> `POST /api/send-invite` -> `sendInviteEmail(...)`.

## Data model note (the "split")
- `Group.defaultSplit: Record<uid, number>` (percentages). `Group.availableSplits: {name, split}[]` holds the non-creator members' names + percentages. Together these are the configured split shown in the invite email.
- Seats: `Group.targetNumPeople` is the join capacity. A group can be created with up to 5 people and grown by up to 2 more from Settings ("Add a Person"), tracked in `Group.addedSeats`. All of that math lives in `src/lib/members.ts` (checked by `scripts/seats-check.ts`) and is mirrored in the Flutter app's `lib/domain/group/seats.dart`; change them together.

## Design system (match this for UI work)
- Fonts: Inter (body), Lora (serif, used for display/headings via `font-display`), JetBrains Mono (numbers/code).
- Palette (Tailwind `natural-*` tokens defined in `src/index.css`): cherry red `#C41200` (primary accent), text `#18181B`, background `#F4F4F5`, borders `#D4D4D8`, muted `#52525B`. Aesthetic: minimal, high-contrast.
- Logo: `/cherry2transparent.png` (in `public/`). The old Squarespace logo URL is dead - do not use it.

## Deploy flow
- **`main` is the deployed branch.** Push (or merge) to `main` -> Firebase App Hosting builds and deploys automatically (~4-5 min). `development/web-production` is retired; do not push there.
- The backend's live branch is set in the Firebase console (App Hosting -> backend -> settings). If a push to `main` does not roll out, check that setting first (see the hard rule above about querying live state).
- Watch rollouts: Firebase Console -> App Hosting -> Backend `have-another-cherry` -> Rollouts.
- Runtime env/secrets are controlled by `apphosting.yaml` (availability: RUNTIME). Cloud Run injects `PORT` (server uses `Number(process.env.PORT) || 3000`).
- **Firestore rules deploy separately from the app.** App Hosting never reads
  `firestore.rules`. `.github/workflows/deploy-firestore-rules.yml` publishes them on
  any push to `main` that touches the file, through Workload
  Identity Federation (`GCP_WIF_PROVIDER_PROD` + `GCP_SERVICE_ACCOUNT_PROD` repo
  variables) or the `FIREBASE_SERVICE_ACCOUNT` secret as a fallback; if neither is
  configured the job skips with a warning, so check the Actions run after changing
  rules. Manual
  fallback: `npm run rules:deploy` (needs `npx firebase-tools login` once). If rules and
  app ever disagree, users hit "Missing or insufficient permissions".

## Email privacy (hard rule)
- Everything sent through Resend is stored in the Resend dashboard and visible to
  the account operator. The operator must NOT be able to read users' financial
  data, so transactional emails must never contain amounts, balances, expense
  names, or any ledger detail. Say that something exists and link into the app;
  the details stay behind the E2E-encrypted ledger.
- Known residual content in Resend logs today: invite emails include the group's
  split percentages (a designed onboarding feature), and verification/reset
  emails necessarily contain their auth action links. Mitigate operator
  visibility by minimizing Resend's data retention in the dashboard settings.

## Writing style (hard rule)
- **NO EM DASHES. EVER.** No em dash and no en dash anywhere in this codebase or its
  output: not in UI copy, error messages, emails, comments, commit messages, AI
  prompts, or AI-generated text. Use periods, hyphens (-), and colons only.
- AI endpoints must (a) instruct the model not to use em dashes and (b) scrub
  responses with `stripEmDashes` in `server.ts` before returning them. Keep both
  in place when adding new AI endpoints.

## Conventions / gotchas
- Source of truth is GitHub `main` - that is what deploys. Prefer: edit locally, `npm run dev` to verify, then commit/push.
- Never commit secrets. Secrets go in Secret Manager and are referenced from `apphosting.yaml`.
- Don't hardcode a Gemini API key. Use Vertex + ADC.
- Keep `PORT` as `Number(process.env.PORT) || 3000` in `server.ts`.