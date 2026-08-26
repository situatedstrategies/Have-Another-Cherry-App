# Have Another Cherry

The app that makes sharing expenses sweeter. A household expense-splitter: create a group, set a percentage split, log shared expenses, settle up. Includes AI receipt scanning and a financial-profile quiz.

See `CLAUDE.md` for the full project reference (stack, deploy flow, environments, hard rules).

## Run locally

**Prerequisites:** Node.js (or Bun) and the gcloud CLI.

1. Install dependencies:
   `bun install` (or `npm install`)
2. Copy `.env.example` to `.env.local` and set `RESEND_API_KEY` (only needed for email flows).
3. Authenticate for Gemini via Vertex AI (there is deliberately no `GEMINI_API_KEY`; this org blocks standalone keys):
   ```
   gcloud auth application-default login
   gcloud config set project gen-lang-client-0987674990
   ```
4. Run the app:
   `npm run dev` then open http://localhost:3000

## Deploy

Push to `development/web-production`. Firebase App Hosting builds and deploys automatically (about 4-5 minutes). Firestore rules deploy separately via `.github/workflows/deploy-firestore-rules.yml`.
