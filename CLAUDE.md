# CLAUDE.md — Have Another Cherry

Project context for Claude Code. Read this first before making changes.

## What this is
A household expense-splitter web app ("Have Another Cherry"). Users create a group, set a percentage split between members, log shared expenses, and settle up. There's also AI receipt scanning and a financial-profile quiz.

## Stack
- Frontend: React 19 + Vite 6 + TypeScript, Tailwind CSS v4 (`@tailwindcss/vite`).
- Backend: Express server in `server.ts` (run with `tsx`). In dev it uses Vite middleware; in prod it serves the built SPA from `dist/`.
- Data/auth: Firebase (Auth + Firestore, client SDK). `firebase-admin` is a dependency but the server currently uses ADC, not the Admin SDK.
- AI: Google Gemini via **Vertex AI** (`@google/genai`), authenticated with Application Default Credentials (ADC) — no API key.
- Email: Resend (`resend`), sending from a verified domain.
- Deploy: Firebase App Hosting (Cloud Run under the hood), auto-deploys from GitHub `main`.

## Repo layout
- `index.html` -> `src/main.tsx` -> `src/App.tsx` (SPA entry).
- `src/components/*.tsx` — screens (GroupSetup, ExpenseForm, ExpenseList, ExpenseDetail, SettleUpModal, ProfileSetup, StatsSection, AuthScreen, etc.).
- `src/lib/*.ts` — helpers (resend, crypto, members, profiles, accounting, mismatch).
- `src/types.ts` — data model (Group, User, Expense, Settlement, etc.).
- `src/templates/inviteEmail.html` — Resend invite email template.
- `src/firebase.ts` — Firebase init; reads `firebase-applet-config.json`.
- `server.ts` — Express API + static serving.
- `public/` — static assets served at site root (e.g. `/cherry2transparent.png`).
- `apphosting.yaml` — Firebase App Hosting runtime config (secrets).

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

## AI (Gemini via Vertex) — important
This project's Google Cloud org blocks standalone Gemini API keys (they must be service-account-bound and don't work with the Developer API). So the app uses **Vertex AI + ADC** and needs **no API key**.
- Code pattern: `new GoogleGenAI({ vertexai: true, project: process.env.GOOGLE_CLOUD_PROJECT || "gen-lang-client-0987674990", location: "us-central1" })`.
- Prod auth: the App Hosting compute service account (`firebase-app-hosting-compute@gen-lang-client-0987674990.iam.gserviceaccount.com`) has role `Vertex AI User` (roles/aiplatform.user).
- Local dev auth: run `gcloud auth application-default login` and `gcloud config set project gen-lang-client-0987674990`.
- DO NOT reintroduce a `GEMINI_API_KEY` — it will not work in this org.

## Email (Resend) — important
- `RESEND_API_KEY` lives in **Cloud Secret Manager**, referenced in `apphosting.yaml` (env var backed by `secret:`), not as a plaintext env var.
- The App Hosting compute SA has both `Secret Manager Secret Accessor` and `Secret Manager Viewer` on that secret (Viewer is needed so the build can resolve the `latest` version).
- Sends from `notifications@haveanothercherry.com` (verified Resend domain).
- Template `src/templates/inviteEmail.html` uses placeholders `{{recipientName}}`, `{{fromName}}`, `{{groupName}}`, `{{inviteCode}}`, `{{splitRows}}`. `src/lib/resend.ts` builds the split rows and fills the placeholders, then sends.
- Invite flow: `GroupSetup.tsx` (collects recipient name + email, computes fromName and split) -> `POST /api/send-invite` -> `sendInviteEmail(...)`.

## Data model note (the "split")
- `Group.defaultSplit: Record<uid, number>` (percentages). `Group.availableSplits: {name, split}[]` holds the non-creator members' names + percentages. Together these are the configured split shown in the invite email.

## Design system (match this for UI work)
- Fonts: Inter (body), Lora (serif, used for display/headings via `font-display`), JetBrains Mono (numbers/code).
- Palette (Tailwind `natural-*` tokens defined in `src/index.css`): cherry red `#C41200` (primary accent), text `#18181B`, background `#F4F4F5`, borders `#D4D4D8`, muted `#52525B`. Aesthetic: minimal, high-contrast.
- Logo: `/cherry2transparent.png` (in `public/`). The old Squarespace logo URL is dead — do not use it.

## Deploy flow
- Push to `main` -> Firebase App Hosting builds and deploys automatically (~4-5 min).
- Watch rollouts: Firebase Console -> App Hosting -> Backend `have-another-cherry` -> Rollouts.
- Runtime env/secrets are controlled by `apphosting.yaml` (availability: RUNTIME). Cloud Run injects `PORT` (server uses `Number(process.env.PORT) || 3000`).

## Conventions / gotchas
- Source of truth is GitHub `main` — that is what deploys. Prefer: edit locally, `npm run dev` to verify, then commit/push.
- Never commit secrets. Secrets go in Secret Manager and are referenced from `apphosting.yaml`.
- Don't hardcode a Gemini API key. Use Vertex + ADC.
- Keep `PORT` as `Number(process.env.PORT) || 3000` in `server.ts`.
- AI Studio's GitHub import is one-way (snapshot). Changes made in AI Studio must be pushed back to `main` to deploy.
