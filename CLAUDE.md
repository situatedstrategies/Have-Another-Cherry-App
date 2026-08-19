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
- Deploy: Firebase App Hosting (Cloud Run under the hood), auto-deploys from GitHub `development/web-production` (NOT `main`).

## Repo layout
- `index.html` -> `src/main.tsx` -> `src/App.tsx` (SPA entry).
- `src/components/*.tsx` - screens (GroupSetup, ExpenseForm, ExpenseList, ExpenseDetail, SettleUpModal, ProfileSetup, StatsSection, AuthScreen, etc.).
- `src/lib/*.ts` - helpers (resend, crypto, members, profiles, accounting, mismatch).
- `src/types.ts` - data model (Group, User, Expense, Settlement, etc.).
- `src/templates/inviteEmail.html` - Resend invite email template.
- `src/firebase.ts` - Firebase init; picks `firebase-applet-config.json` or `...beta.json`.
- `server.ts` - Express API + static serving.
- `public/` - static assets served at site root (e.g. `/cherry2transparent.png`).
- `apphosting.yaml` - Firebase App Hosting runtime config (secrets).

## Commands
- Install: `bun install` (repo uses Bun; `npm install` also works).
- Dev: `npm run dev` (starts `tsx server.ts`; open http://localhost:3000).
- Build: `npm run build` (`vite build` + esbuild bundles the server to `dist/server.cjs`).
- Start built app: `npm run start`.
- Typecheck: `npm run lint` (`tsc --noEmit`).

## Google Cloud / Firebase project
- Project: "Have Another Cherry SSLLC" = `gen-lang-client-0987674990`.
- Firestore: `(default)` database (nam5). Security rules in `firestore.rules`.
- App Hosting backend: `have-another-cherry`, region `us-east4`.
- Live URL: https://have-another-cherry--gen-lang-client-0987674990.us-east4.hosted.app/
- Custom domain (finishing DNS): app.haveanothercherry.com. Marketing site: haveanothercherry.com (Squarespace).

## Beta environment
Beta runs in a **separate Firebase project** so testers get their own Firestore and
their own Auth user pool - a beta account is never a production account, and a beta
bug can never reach a real ledger.
- Client config lives in `firebase-applet-config.beta.json` (public identifiers, not
  secrets), filled in from the `have-another-cherry-beta` Firebase project.
  `src/firebase.ts` throws on startup if a beta build still has `REPLACE_ME_*`
  placeholders, rather than falling back to production.
- The environment is picked in `src/firebase.ts`: `VITE_APP_ENV=beta` is the explicit
  switch, and a `beta.`/`beta-` hostname prefix is the fallback, so one build artifact
  can serve either backend. `APP_ENV` is exported if code ever needs to branch.
- Beta needs its **own reCAPTCHA v3 site key** (App Check is bound to a domain), its
  **own OAuth client**, and its domain added to Auth -> Settings -> Authorized domains.
- `firestore.rules` auto-deploys to **both projects** via
  `.github/workflows/deploy-firestore-rules.yml`: beta through Workload Identity
  Federation, production through WIF (`GCP_WIF_PROVIDER_PROD` + `GCP_SERVICE_ACCOUNT_PROD`
  repo variables) or the `FIREBASE_SERVICE_ACCOUNT` secret as a fallback. A project
  whose credentials are missing is skipped with a warning.

## AI (Gemini via Vertex) - important
This project's Google Cloud org blocks standalone Gemini API keys (they must be service-account-bound and don't work with the Developer API). So the app uses **Vertex AI + ADC** and needs **no API key**.
- Code pattern: `new GoogleGenAI({ vertexai: true, project: process.env.GOOGLE_CLOUD_PROJECT || "gen-lang-client-0987674990", location: "us-central1" })`.
- Prod auth: the App Hosting compute service account (`firebase-app-hosting-compute@gen-lang-client-0987674990.iam.gserviceaccount.com`) has role `Vertex AI User` (roles/aiplatform.user).
- Local dev auth: run `gcloud auth application-default login` and `gcloud config set project gen-lang-client-0987674990`.
- DO NOT reintroduce a `GEMINI_API_KEY` - it will not work in this org.

## Email (Resend) - important
- `RESEND_API_KEY` lives in **Cloud Secret Manager**, referenced in `apphosting.yaml` (env var backed by `secret:`), not as a plaintext env var.
- The App Hosting compute SA has both `Secret Manager Secret Accessor` and `Secret Manager Viewer` on that secret (Viewer is needed so the build can resolve the `latest` version).
- ALL email sends from `poolside@haveanothercherry.com` (verified Resend domain). It is the only mailbox that exists: never send from notifications@, verify@, reset@, tartcherry@, help@, or any other address.
- Template `src/templates/inviteEmail.html` uses placeholders `{{recipientName}}`, `{{fromName}}`, `{{groupName}}`, `{{inviteCode}}`, `{{splitRows}}`. `src/lib/resend.ts` builds the split rows and fills the placeholders, then sends.
- Invite flow: `GroupSetup.tsx` (collects recipient name + email, computes fromName and split) -> `POST /api/send-invite` -> `sendInviteEmail(...)`.

## Data model note (the "split")
- `Group.defaultSplit: Record<uid, number>` (percentages). `Group.availableSplits: {name, split}[]` holds the non-creator members' names + percentages. Together these are the configured split shown in the invite email.

## Design system (match this for UI work)
- Fonts: Inter (body), Lora (serif, used for display/headings via `font-display`), JetBrains Mono (numbers/code).
- Palette (Tailwind `natural-*` tokens defined in `src/index.css`): cherry red `#C41200` (primary accent), text `#18181B`, background `#F4F4F5`, borders `#D4D4D8`, muted `#52525B`. Aesthetic: minimal, high-contrast.
- Logo: `/cherry2transparent.png` (in `public/`). The old Squarespace logo URL is dead - do not use it.

## Deploy flow
- Push to `development/web-production` -> Firebase App Hosting builds and deploys automatically (~4-5 min).
- Watch rollouts: Firebase Console -> App Hosting -> Backend `have-another-cherry` -> Rollouts.
- Runtime env/secrets are controlled by `apphosting.yaml` (availability: RUNTIME). Cloud Run injects `PORT` (server uses `Number(process.env.PORT) || 3000`).
- **Firestore rules deploy separately from the app.** App Hosting never reads
  `firestore.rules`. `.github/workflows/deploy-firestore-rules.yml` publishes them to
  **production and beta** on any push to `development/web-production` that touches the
  file (see the Beta section for the credentials each leg needs; an unconfigured leg is
  skipped with a warning, so check the Actions run after changing rules). Manual
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
- Source of truth is GitHub `development/web-production` - that is what deploys. Prefer: edit locally, `npm run dev` to verify, then commit/push.
- Never commit secrets. Secrets go in Secret Manager and are referenced from `apphosting.yaml`.
- Don't hardcode a Gemini API key. Use Vertex + ADC.
- Keep `PORT` as `Number(process.env.PORT) || 3000` in `server.ts`.
- AI Studio's GitHub import is one-way (snapshot). Changes made in AI Studio must be pushed back to `development/web-production` to deploy.
