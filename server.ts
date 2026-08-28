import "dotenv/config";
import { createHash } from "crypto";
import express from "express";
import path from "path";
import cors from "cors";
import { createServer as createViteServer } from "vite";
import { sendInviteEmail, sendResetEmail, sendVerificationEmail, sendWaitlistNotification, sendBetaSignupNotification, sendReminderEmail } from "./src/lib/resend";
import { actionHandlerBase, retargetActionLink } from "./src/lib/actionLink";
import { addWaitlistLeadToNotion, deviceFromUserAgent } from "./src/lib/notion";
import firebaseConfig from "./firebase-applet-config.json";
import betaFirebaseConfig from "./firebase-applet-config.beta.json";

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  // Behind App Hosting / Cloud Run every request arrives via Google's front-end
  // proxy; trust it so req.ip reflects the real client (X-Forwarded-For) and the
  // rate limiter buckets per user instead of collapsing to one global bucket.
  app.set("trust proxy", true);

  // Restrict cross-origin browser access to our own app origins (the SPA is
  // same-origin, so this doesn't affect it - it just blocks other sites).
  const allowedOrigins = (
    process.env.ALLOWED_ORIGINS ||
    "https://app.haveanothercherry.com,https://have-another-cherry--gen-lang-client-0987674990.us-east4.hosted.app,http://localhost:3000," +
    // Marketing site origins: the beta signup form on these pages posts to
    // /api/beta-signup cross-origin.
    "https://haveanothercherry.com,https://www.haveanothercherry.com,https://have-another-cherry-marketing.pages.dev"
  ).split(",").map(o => o.trim()).filter(Boolean);
  app.use(cors({
    origin: (origin, cb) => {
      // Allow same-origin / non-browser requests (no Origin header) and our list.
      if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
      return cb(null, false);
    },
  }));

  // Receipt images are sent as base64, so allow a generous body size.
  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ extended: false }));

  // ---- Production view gate ------------------------------------------------
  // app.haveanothercherry.com is not publicly viewable: every request must
  // carry the gate cookie, set by entering the site password. Only the
  // password's SHA-256 hash lives here (never the password itself). Beta and
  // local dev are not gated, and the RevenueCat webhook is exempt because it
  // arrives without cookies. Override the hash with SITE_GATE_PASSWORD_HASH,
  // or set SITE_GATE_DISABLED=1 to drop the wall without a code change.
  const GATE_COOKIE = "hac_gate";
  const gateHash =
    process.env.SITE_GATE_PASSWORD_HASH ||
    "7d93884ca2bb3700085c9ba2892bd9fce9c119ac7a9d7555f4e44230137d6c38";
  const GATE_HOSTS = new Set([
    "app.haveanothercherry.com",
    "have-another-cherry--gen-lang-client-0987674990.us-east4.hosted.app",
  ]);
  const GATE_EXEMPT_PATHS = new Set([
    "/api/revenuecat-webhook",
    "/api/recaptcha-health",
    "/api/beta-signup",
    "/cherry2transparent.png",
    "/icon.svg",
    "/favicon.ico",
  ]);
  const sha256Hex = (value: string) => createHash("sha256").update(value).digest("hex");

  const gatePage = (wrongPassword: boolean) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Have Another Cherry</title>
<meta name="robots" content="noindex">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&family=Lora:wght@600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
  * { box-sizing: border-box; margin: 0; }
  body { min-height: 100vh; display: flex; align-items: center; justify-content: center;
    background:
      radial-gradient(60% 45% at 78% 0%, rgba(196,18,0,.08), transparent 60%),
      radial-gradient(45% 35% at 2% 22%, rgba(196,18,0,.04), transparent 60%),
      #F4F4F5;
    background-repeat: no-repeat;
    color: #18181B; font-family: Inter, Helvetica, Arial, sans-serif; padding: 24px; }
  .card { background: #FFFFFF; border: 1px solid #D4D4D8; border-radius: 22px; padding: 40px 36px;
    max-width: 400px; width: 100%; text-align: center; box-shadow: 0 10px 30px -12px rgba(24,24,27,.18); }
  img { width: 64px; height: 64px; object-fit: contain; margin: 0 auto 16px; display: block; }
  h1 { font-family: Lora, Georgia, serif; font-weight: 600; font-size: 24px; margin-bottom: 8px; }
  p { color: #52525B; font-size: 14px; line-height: 1.6; margin-bottom: 20px; }
  input { width: 100%; padding: 12px 14px; border: 1px solid #D4D4D8; border-radius: 12px;
    font-size: 15px; font-family: inherit; outline: none; margin-bottom: 12px; }
  input:focus { border-color: #C41200; }
  button { width: 100%; padding: 12px 22px; background: #C41200; color: #FFFFFF; border: 0;
    border-radius: 999px; font-size: 14px; font-weight: 500; letter-spacing: -0.01em;
    font-family: 'JetBrains Mono', ui-monospace, monospace; cursor: pointer;
    box-shadow: 0 6px 16px -8px rgba(196,18,0,.7); }
  button:hover { background: #A00E00; }
  .err { color: #C41200; font-size: 13px; font-weight: 600; margin-bottom: 12px; }
  .foot { margin-top: 18px; font-size: 12px; color: #A1A1AA; }
  .foot a { color: #C41200; }
</style>
</head>
<body>
  <div class="card">
    <img src="/cherry2transparent.png" alt="Have Another Cherry">
    <h1>You're early. Sweet.</h1>
    <p>Have Another Cherry is growing in a private beta. If you have the site password, come on in.</p>
    ${wrongPassword ? '<p class="err">That password is not correct. Try again.</p>' : ""}
    <form method="POST" action="/gate/unlock">
      <input type="password" name="password" placeholder="Site password" autofocus required autocomplete="current-password">
      <button type="submit">Come on in</button>
    </form>
    <p class="foot">Don't have a password yet? We'd love to have you: <a href="https://www.haveanothercherry.com/beta">join our beta</a>.</p>
  </div>
</body>
</html>`;

  app.use((req, res, next) => {
    if (process.env.SITE_GATE_DISABLED === "1") return next();
    const host = String(req.headers.host || "").split(":")[0].toLowerCase();
    if (!GATE_HOSTS.has(host)) return next();
    if (GATE_EXEMPT_PATHS.has(req.path)) return next();
    // Firebase reserved namespace: the sign-in popup and iframe load
    // /__/auth/* on our domain (authDomain), which must never see the gate.
    if (req.path.startsWith("/__/")) return next();

    const cookieHeader = req.headers.cookie || "";
    const cookie = cookieHeader
      .split(";")
      .map(part => part.trim())
      .find(part => part.startsWith(`${GATE_COOKIE}=`));
    const cookieValue = cookie ? decodeURIComponent(cookie.slice(GATE_COOKIE.length + 1)) : "";
    if (cookieValue === gateHash) return next();

    if (req.method === "POST" && req.path === "/gate/unlock") {
      const password = String((req.body as any)?.password ?? "");
      if (password && sha256Hex(password) === gateHash) {
        res.setHeader(
          "Set-Cookie",
          `${GATE_COOKIE}=${gateHash}; Path=/; Max-Age=31536000; HttpOnly; Secure; SameSite=Lax`
        );
        return res.redirect(303, "/");
      }
      return res.status(401).send(gatePage(true));
    }

    return res.status(401).send(gatePage(false));
  });
  // ---- end production view gate -------------------------------------------

  // Firebase auth helpers. With authDomain set to our own domain, the Google
  // sign-in popup opens https://<our domain>/__/auth/handler. Firebase Hosting
  // serves those helper pages automatically but App Hosting (Cloud Run) does
  // not, so proxy the reserved /__/auth namespace to the Firebase project's
  // own domain. Host-aware so a beta hostname proxies to the beta project.
  app.use("/__/auth", async (req, res) => {
    try {
      const host = String(req.headers.host || "").split(":")[0].toLowerCase();
      const upstreamOrigin =
        host.startsWith("beta.") || host.startsWith("beta-")
          ? "https://have-another-cherry-beta.firebaseapp.com"
          : "https://gen-lang-client-0987674990.firebaseapp.com";
      const upstream = await fetch(upstreamOrigin + req.originalUrl, {
        method: req.method,
        headers: { accept: String(req.headers.accept || "*/*") },
      });
      res.status(upstream.status);
      upstream.headers.forEach((value, key) => {
        if (!["content-encoding", "transfer-encoding", "content-length", "connection"].includes(key)) {
          res.setHeader(key, value);
        }
      });
      res.send(Buffer.from(await upstream.arrayBuffer()));
    } catch (err: any) {
      console.error("Auth handler proxy error:", err.message);
      res.status(502).send("Auth handler unavailable. Please try again.");
    }
  });


  // Lightweight Alpha Lite abuse protection for public email endpoints.
  // App Hosting instances may have separate memory, so production launch
  // should eventually use managed rate limiting.
  const requestBuckets = new Map<string, { count: number; resetAt: number }>();

  // House style: no em dashes anywhere, including AI-generated copy. The
  // prompts also forbid them, but the model slips sometimes, so every parsed
  // response is scrubbed before it reaches a client.
  const stripEmDashes = (value: string): string => value.replace(/\s*[\u2014\u2013]\s*/g, " - ");
  let lastSweep = 0;

  // Drop expired buckets occasionally so the map can't grow without bound.
  const sweepBuckets = (now: number) => {
    if (now - lastSweep < 60_000) return;
    lastSweep = now;
    for (const [k, b] of requestBuckets) if (now >= b.resetAt) requestBuckets.delete(k);
  };

  // Per-endpoint rate limiter, keyed on the real client IP so one abuser is
  // isolated instead of throttling everyone. Each `name` gets its own quota.
  const rateLimit = (name: string, maxRequests = 5, windowMs = 15 * 60 * 1000) =>
    (req: express.Request, res: express.Response, next: express.NextFunction) => {
      const now = Date.now();
      sweepBuckets(now);
      const key = `${name}:${req.ip || req.socket.remoteAddress || "unknown"}`;
      const bucket = requestBuckets.get(key);
      if (!bucket || now >= bucket.resetAt) {
        requestBuckets.set(key, { count: 1, resetAt: now + windowMs });
        return next();
      }
      if (bucket.count >= maxRequests) {
        return res.status(429).json({ error: "Too many requests. Please wait before trying again." });
      }
      bucket.count += 1;
      next();
    };

  // Lazily initialize the Firebase Admin SDK (ADC) once, shared across endpoints.
  const ensureAdminApp = async () => {
    const { getApps, initializeApp, applicationDefault } = await import("firebase-admin/app");
    if (!getApps().length) {
      // No hardcoded project fallback. This used to default to the production
      // project, so a beta backend that does not set GOOGLE_CLOUD_PROJECT would
      // look beta users up in production, find nothing, and - because the reset
      // endpoint deliberately hides whether an account exists - report success
      // while sending no email at all.
      //
      // With projectId omitted, ADC resolves the project the service is actually
      // running in, which is always the correct one.
      const projectId =
        process.env.GOOGLE_CLOUD_PROJECT ||
        process.env.GCLOUD_PROJECT ||
        undefined;

      initializeApp({
        credential: applicationDefault(),
        ...(projectId ? { projectId } : {}),
      });

      console.log(
        "Firebase Admin initialized for project:",
        projectId || "(resolved from application default credentials)"
      );
    }
  };

  // Require a valid Firebase ID token. Protects the billed AI endpoints and the
  // authenticated email endpoint from anonymous abuse.
  const requireAuth = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    try {
      const header = req.headers.authorization || "";
      const token = header.startsWith("Bearer ") ? header.slice(7) : "";
      if (!token) return res.status(401).json({ error: "Authentication required." });
      await ensureAdminApp();
      const { getAuth } = await import("firebase-admin/auth");
      const decoded = await getAuth().verifyIdToken(token);
      (req as any).uid = decoded.uid;
      (req as any).firebaseUser = decoded;
      next();
    } catch (e: any) {
      console.error("Auth verification failed:", e?.message || e);
      return res.status(401).json({ error: "Authentication required." });
    }
  };

  // Once profile_log reaches CATALOG_TARGET entries, the catalog is "frozen":
  // stop generating new AI profiles and always serve from that finite set.
  // Before then, AI failures fall back to a random logged profile once the log
  // has at least MIN_LOG_FALLBACK entries (else the curated list).
  const CATALOG_TARGET = 250;
  const MIN_LOG_FALLBACK = 20;

  const getLogCount = async (): Promise<number> => {
    try {
      await ensureAdminApp();
      const { getFirestore } = await import("firebase-admin/firestore");
      const snap = await getFirestore().collection("profile_log").count().get();
      return snap.data().count;
    } catch (e: any) {
      console.error("profile_log count failed:", e?.message || e);
      return -1; // unknown -> behave as if not yet full
    }
  };

  const getRandomFromLog = async (): Promise<any | null> => {
    try {
      await ensureAdminApp();
      const { getFirestore } = await import("firebase-admin/firestore");
      const snap = await getFirestore()
        .collection("profile_log")
        .orderBy("createdAt", "desc")
        .limit(500)
        .get();
      if (snap.empty) return null;
      const pick: any = snap.docs[Math.floor(Math.random() * snap.size)].data();
      const { createdAt, source, uid, ...profile } = pick;
      return { ...profile, greetingTone: profile.greetingTone || "harmonious" };
    } catch (e: any) {
      console.error("profile_log read failed:", e?.message || e);
      return null;
    }
  };

  const getCuratedProfile = async () => {
    const { FINANCIAL_PROFILES } = await import("./src/lib/profiles.js");
    const f = FINANCIAL_PROFILES[Math.floor(Math.random() * FINANCIAL_PROFILES.length)];
    return { ...f, greetingTone: "harmonious" };
  };

  // 1. Gemini Multimodal API (Receipt Scanning) via Vertex AI (ADC).
  app.post("/api/scan-receipt", requireAuth, rateLimit("scan", 60), async (req, res) => {
    try {
      const { GoogleGenAI, Type } = await import("@google/genai");
      const ai = new GoogleGenAI({
        vertexai: true,
        project: process.env.GOOGLE_CLOUD_PROJECT || "gen-lang-client-0987674990",
        location: process.env.GOOGLE_CLOUD_LOCATION || "us-central1",
      });

      const base64Image = req.body?.image;
      if (!base64Image || typeof base64Image !== "string") {
        return res.status(400).json({ error: "No receipt image was provided." });
      }
      {
        const base64Data = base64Image.includes(",") ? base64Image.split(",")[1] : base64Image;
        const mimeType = req.body?.mimeType || "image/jpeg";

        console.log("Analyzing uploaded receipt image with Gemini API (Vertex)...");
        const response = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: [
            { inlineData: { data: base64Data, mimeType } },
            "Extract the total amount, date, description, and the individual line items from this receipt. " +
            "Line items are the purchased products/services with their prices (exclude tax, tip, subtotal, and total rows). " +
            "Return ONLY valid JSON."
          ],
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                amount: { type: Type.NUMBER, description: "Total amount on the receipt" },
                description: { type: Type.STRING, description: "Short descriptive name of the merchant/store" },
                date: { type: Type.STRING, description: "Date in YYYY-MM-DD format if available" },
                items: {
                  type: Type.ARRAY,
                  description: "Individual purchased line items (no tax/tip/subtotal/total rows)",
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      name: { type: Type.STRING },
                      price: { type: Type.NUMBER }
                    },
                    required: ["name", "price"]
                  }
                }
              },
              required: ["amount", "description"]
            }
          }
        });

        if (response.text) {
          const parsed = JSON.parse(stripEmDashes(response.text.trim()));
          const items = (Array.isArray(parsed.items) ? parsed.items : [])
            .map((it: any) => ({
              name: String(it?.name || "Item").slice(0, 80),
              price: Math.max(0, Number(it?.price) || 0),
            }))
            .filter((it: any) => it.price > 0)
            .slice(0, 60);
          return res.status(200).json({
            success: true,
            data: {
              amount: Math.max(0, Number(parsed.amount) || 0),
              description: parsed.description || "Receipt Scan",
              date: parsed.date || new Date().toISOString().split('T')[0],
              items
            }
          });
        }
      }

      // The model returned nothing usable.
      return res.status(422).json({ error: "Could not read the receipt. Please enter the details manually." });
    } catch (err: any) {
      console.error("Receipt Scan Error:", err);
      res.status(500).json({ error: "Could not scan the receipt. Please try again." });
    }
  });

  // 4b. Household Vault extraction. Turns a free-form note, or a photo of a
  // bill/statement, into structured fields the client can confirm and save.
  //
  // Privacy contract (see privacy.html section 7): this endpoint is STATELESS.
  // The submitted text/image is used to produce the extraction and is never
  // written to a database, never logged as content, and never used for
  // training. The client encrypts the result before storing it, so nothing
  // readable is persisted anywhere by this request.
  app.post("/api/vault-extract", requireAuth, rateLimit("vault", 30), async (req, res) => {
    try {
      const { GoogleGenAI, Type } = await import("@google/genai");
      const ai = new GoogleGenAI({
        vertexai: true,
        project: process.env.GOOGLE_CLOUD_PROJECT || "gen-lang-client-0987674990",
        location: process.env.GOOGLE_CLOUD_LOCATION || "us-central1",
      });

      const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
      const image = typeof req.body?.image === "string" ? req.body.image : "";
      // What the user said they want kept, e.g. "just the due date and amount".
      const intent = typeof req.body?.intent === "string" ? req.body.intent.trim().slice(0, 400) : "";
      const categories: string[] = Array.isArray(req.body?.categories)
        ? req.body.categories.filter((c: any) => typeof c === "string").slice(0, 40)
        : [];

      if (!text && !image) {
        return res.status(400).json({ error: "Nothing to organise — add a note or a photo." });
      }

      const parts: any[] = [];
      if (image) {
        parts.push({
          inlineData: {
            data: image.includes(",") ? image.split(",")[1] : image,
            mimeType: req.body?.mimeType || "image/jpeg",
          },
        });
      }
      if (text) parts.push(`Here is what the user wrote:\n${text.slice(0, 8000)}`);
      if (intent) parts.push(`The user asked specifically for: ${intent}`);
      if (categories.length) {
        parts.push(`Prefer one of the household's existing categories when it fits: ${categories.join(", ")}.`);
      }
      parts.push(
        "Turn this into one structured household record. Write `body` as clean, readable prose " +
        "— keep every fact, drop filler, do not invent anything. " +
        "Only fill a field if the source actually supports it; leave it out otherwise. " +
        "Set confidence to `high` only when the value is stated outright, `medium` when it is " +
        "strongly implied, and `low` when you are guessing. Dates must be YYYY-MM-DD. " +
        "Return ONLY valid JSON."
      );

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: parts,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING, description: "Short title, e.g. 'Con Ed — August'" },
              body: { type: Type.STRING, description: "The note itself, cleaned up. Never invent facts." },
              vendor: { type: Type.STRING, description: "Who it is with, e.g. 'Con Edison'" },
              amount: { type: Type.NUMBER, description: "Amount due, if stated" },
              dueDate: { type: Type.STRING, description: "YYYY-MM-DD, if stated or clearly implied" },
              recurrence: {
                type: Type.STRING,
                description: "one of: none, weekly, biweekly, monthly, quarterly, yearly",
              },
              accountHint: { type: Type.STRING, description: "Which account pays it, e.g. 'joint Chase'. Never a full account number." },
              category: { type: Type.STRING },
              tags: { type: Type.ARRAY, items: { type: Type.STRING } },
              confidence: {
                type: Type.OBJECT,
                description: "high | medium | low per field that was filled",
                properties: {
                  amount: { type: Type.STRING },
                  dueDate: { type: Type.STRING },
                  vendor: { type: Type.STRING },
                  recurrence: { type: Type.STRING },
                  accountHint: { type: Type.STRING },
                  category: { type: Type.STRING },
                },
              },
            },
            required: ["title", "body"],
          },
        },
      });

      if (!response.text) {
        return res.status(422).json({ error: "Could not make sense of that. Try adding a little more detail." });
      }

      const parsed = JSON.parse(stripEmDashes(response.text.trim()));
      const allowedRecurrence = ["none", "weekly", "biweekly", "monthly", "quarterly", "yearly"];
      const isoDate = (v: any) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);
      const conf = (v: any) => (["high", "medium", "low"].includes(v) ? v : undefined);

      return res.status(200).json({
        success: true,
        data: {
          title: String(parsed.title || "Untitled").slice(0, 120),
          body: String(parsed.body || "").slice(0, 8000),
          vendor: parsed.vendor ? String(parsed.vendor).slice(0, 120) : undefined,
          amount: Number.isFinite(Number(parsed.amount)) && Number(parsed.amount) > 0
            ? Math.round(Number(parsed.amount) * 100) / 100
            : undefined,
          dueDate: isoDate(parsed.dueDate),
          recurrence: allowedRecurrence.includes(parsed.recurrence) && parsed.recurrence !== "none"
            ? parsed.recurrence
            : undefined,
          accountHint: parsed.accountHint ? String(parsed.accountHint).slice(0, 80) : undefined,
          category: parsed.category ? String(parsed.category).slice(0, 60) : undefined,
          tags: (Array.isArray(parsed.tags) ? parsed.tags : [])
            .map((t: any) => String(t).slice(0, 40))
            .filter(Boolean)
            .slice(0, 8),
          confidence: {
            amount: conf(parsed.confidence?.amount),
            dueDate: conf(parsed.confidence?.dueDate),
            vendor: conf(parsed.confidence?.vendor),
            recurrence: conf(parsed.confidence?.recurrence),
            accountHint: conf(parsed.confidence?.accountHint),
            category: conf(parsed.confidence?.category),
          },
        },
      });
    } catch (err: any) {
      // Deliberately does not log the submitted content.
      console.error("Vault extract error:", err?.message || err);
      res.status(500).json({ error: "Could not organise that right now. Please try again." });
    }
  });

  // 5. reCAPTCHA Enterprise assessment via ADC (no API key - org policy).
  const createRecaptchaAssessment = async (token: string, action?: string) => {
    const { GoogleAuth } = await import("google-auth-library");
    const auth = new GoogleAuth({
      scopes: ["https://www.googleapis.com/auth/cloud-platform"],
    });
    const client = await auth.getClient();
    // Each environment assesses with its own project and site key: the beta
    // backend runs in the beta Firebase project (App Hosting sets
    // GOOGLE_CLOUD_PROJECT), whose clients mint tokens with the beta key.
    const project = process.env.GOOGLE_CLOUD_PROJECT || firebaseConfig.projectId;
    const rcConfig = project === betaFirebaseConfig.projectId ? betaFirebaseConfig : firebaseConfig;

    return client.request({
      url: `https://recaptchaenterprise.googleapis.com/v1/projects/${project}/assessments`,
      method: "POST",
      data: {
        event: {
          token,
          expectedAction: action || undefined,
          siteKey: rcConfig.recaptchaSiteKey,
        },
      },
    }) as Promise<any>;
  };

  app.post("/api/verify-recaptcha", async (req, res) => {
    try {
      const { token, action } = req.body;
      if (!token) {
        return res.status(400).json({ error: "Missing token" });
      }

      const assessment = await createRecaptchaAssessment(token, action);

      const props = assessment.data?.tokenProperties;
      const score = assessment.data?.riskAnalysis?.score;
      const valid = props?.valid === true;
      const actionMatches = !action || props?.action === action;
      // Google's recommended default threshold is 0.5.
      const allowed = valid && actionMatches && (score === undefined || score >= 0.5);

      if (!allowed) {
        console.warn("[reCAPTCHA] Blocked:", {
          valid,
          invalidReason: props?.invalidReason,
          expectedAction: action,
          tokenAction: props?.action,
          score,
          reasons: assessment.data?.riskAnalysis?.reasons,
        });
      }

      res.status(200).json({ success: true, allowed, score });
    } catch (err: any) {
      console.error("reCAPTCHA Assessment Error:", err.message);
      // Fail open: an assessment outage should not lock users out of auth.
      res.status(200).json({ success: true, allowed: true, error: err.message });
    }
  });

  // 5b. reCAPTCHA health check: runs a dummy assessment so operators can
  // confirm the Enterprise API, IAM role, and site key are wired up without
  // needing a real browser token. Reports status only, never user data.
  app.get("/api/recaptcha-health", async (_req, res) => {
    // Report the key and project this environment actually uses. Reporting
    // firebaseConfig unconditionally made a beta misconfiguration look like a
    // production key problem.
    const healthProject =
      process.env.GOOGLE_CLOUD_PROJECT || firebaseConfig.projectId;
    const healthConfig =
      healthProject === betaFirebaseConfig.projectId
        ? betaFirebaseConfig
        : firebaseConfig;
    try {
      const assessment = await createRecaptchaAssessment("health-check-dummy-token", "HEALTH");
      const props = assessment.data?.tokenProperties;
      // A dummy token is expected to be invalid. Reaching this line means the
      // assessment API accepted the call, so auth and IAM are working.
      res.status(200).json({
        ok: true,
        assessmentApi: "reachable",
        project: healthProject,
        siteKey: healthConfig.recaptchaSiteKey,
        dummyTokenValid: props?.valid === true,
        invalidReason: props?.invalidReason || null,
      });
    } catch (err: any) {
      res.status(200).json({
        ok: false,
        assessmentApi: "error",
        project: healthProject,
        siteKey: healthConfig.recaptchaSiteKey,
        error: err.message,
      });
    }
  });

  // 6. Resend Invite Endpoint
  app.post("/api/send-invite", requireAuth, rateLimit("invite"), async (req, res) => {
    try {
      const { email, groupName, inviteCode, recipientName, fromName, split } = req.body || {};
      if (!email || typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ error: "A valid recipient email is required." });
      }

      const data = await sendInviteEmail(email, groupName, inviteCode, recipientName, fromName, split);
      res.status(200).json({ success: true, data });
    } catch (err: any) {
      console.error("Server Invite Error:", err);
      res.status(500).json({ error: "Could not send the invite. Please try again." });
    }
  });

  // 6b. Password Reset Endpoint (Resend + Firebase Admin SDK)
  // Generates a Firebase password-reset link server-side (Admin SDK via ADC) and
  // delivers it via Resend from reset@haveanothercherry.com. Responds generically
  // so we never reveal whether an email is registered.
  app.post("/api/send-password-reset", rateLimit("reset"), async (req, res) => {
    const { email } = req.body || {};
    if (!email || typeof email !== "string") {
      return res.status(400).json({ error: "Email is required" });
    }

    try {
      await ensureAdminApp();
      const { getAuth } = await import("firebase-admin/auth");

      let resetLink: string;
      try {
        resetLink = retargetActionLink(
          await getAuth().generatePasswordResetLink(email),
          actionHandlerBase(req.headers, process.env.AUTH_ACTION_URL)
        );
      } catch (linkErr: any) {
        // Don't reveal whether the account exists.
        if (linkErr?.code === "auth/user-not-found" || linkErr?.code === "auth/email-not-found") {
          return res.status(200).json({ success: true });
        }
        throw linkErr;
      }

      await sendResetEmail(email, resetLink);
      return res.status(200).json({ success: true });
    } catch (err: any) {
      console.error("Password Reset Error:", err?.message || err);
      return res.status(500).json({ error: "Unable to send reset email. Please try again later." });
    }
  });

  // 6c. Email Verification Endpoint (Resend + Firebase Admin SDK)
  // Generates a Firebase verification link server-side and delivers it via Resend
  // from verify@haveanothercherry.com, so Firebase never sends its own copy.
  //
  // Authenticated on purpose, and the address comes from the caller's own ID
  // token rather than the request body. Taking it from the body would turn this
  // into an open relay for mailing arbitrary strangers a Have Another Cherry
  // email. Password reset can be anonymous because it only ever mails an address
  // that already has an account; this one cannot.
  app.post("/api/send-verification", requireAuth, rateLimit("verify"), async (req, res) => {
    try {
      const decoded = (req as any).firebaseUser;
      const email = decoded?.email;

      if (!email) {
        return res.status(400).json({ error: "This account has no email address to confirm." });
      }

      // Nothing to do for Google accounts, or anyone who already confirmed.
      if (decoded?.email_verified) {
        return res.status(200).json({ success: true, alreadyVerified: true });
      }

      const { getAuth } = await import("firebase-admin/auth");
      const verifyLink = retargetActionLink(
        await getAuth().generateEmailVerificationLink(email),
        actionHandlerBase(req.headers, process.env.AUTH_ACTION_URL)
      );

      const name = typeof req.body?.name === "string" ? req.body.name : undefined;
      await sendVerificationEmail(email, verifyLink, name);

      return res.status(200).json({ success: true });
    } catch (err: any) {
      console.error("Verification Email Error:", err?.message || err);
      return res
        .status(500)
        .json({ error: "Unable to send verification email. Please try again later." });
    }
  });

  // 8. Financial Profile Generation API - generates a UNIQUE, bespoke profile
  //    from the quiz answers, analyzed holistically/interconnected.
  app.post("/api/generate-profile", requireAuth, rateLimit("profile", 30), async (req, res) => {
    const { answers } = req.body || {};
    // Cap the user-supplied answers that get embedded in the AI prompt, to bound
    // token usage and limit prompt-injection surface.
    if (answers && JSON.stringify(answers).length > 4000) {
      return res.status(400).json({ error: "Quiz answers are too large." });
    }
    const logCount = await getLogCount();

    // Catalog frozen at CATALOG_TARGET entries: stop generating and always
    // serve a random profile from the finite log.
    if (logCount >= CATALOG_TARGET) {
      const catalogProfile = await getRandomFromLog();
      if (catalogProfile) {
        return res.status(200).json({ success: true, source: "catalog", data: catalogProfile });
      }
      // If the read unexpectedly failed, fall through to generation below.
    }

    try {
      const { GoogleGenAI, Type } = await import("@google/genai");
      const ai = new GoogleGenAI({
        vertexai: true,
        project: process.env.GOOGLE_CLOUD_PROJECT || "gen-lang-client-0987674990",
        location: process.env.GOOGLE_CLOUD_LOCATION || "us-central1",
      });

      const prompt =
        "You are a behavioral-economics-informed relationship finance analyst for \"Have Another Cherry\", " +
        "a warm, non-judgmental household expense-splitting app.\n\n" +
        "Analyze these quiz answers HOLISTICALLY and as an INTERCONNECTED whole - for example, how the person's " +
        "credit-card and cash habits relate to how they feel about money, and to how they prefer to talk about it. " +
        "Look for tension or harmony between answers (e.g., a spender who avoids money talk, or a saver who loves it).\n\n" +
        "Quiz answers (JSON):\n" + JSON.stringify(answers, null, 2) + "\n\n" +
        "Generate ONE unique, bespoke financial-personality profile that feels tailor-made for THIS combination of answers. " +
        "Invent a distinctive, evocative 'type' name of 2-4 words (do not reuse generic textbook labels). " +
        "Write in warm, encouraging second person. Be specific to their answers, insightful, and never judgmental.\n\n" +
        "Return JSON with fields: " +
        "type (2-4 word name), " +
        "description (2-3 sentences, second person), " +
        "quote (a real, correctly-attributed quote about money, sharing, or relationships, formatted as: \"<quote>\" - <Author>), " +
        "traits (an array of 3-5 short descriptive phrases), " +
        "strengths (one encouraging sentence), " +
        "watchouts (one gentle, constructive sentence), " +
        "communicationStyle (one sentence about how this person likely prefers to discuss money with a partner/housemate), " +
        "greetingTone (exactly ONE lowercase word chosen from: playful, pragmatic, nurturing, analytical, adventurous, harmonious, thrifty, generous). " +
        "Never use em dashes in any field; use commas, periods, or hyphens instead.";

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: {
          temperature: 1.0,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              type: { type: Type.STRING },
              description: { type: Type.STRING },
              quote: { type: Type.STRING },
              traits: { type: Type.ARRAY, items: { type: Type.STRING } },
              strengths: { type: Type.STRING },
              watchouts: { type: Type.STRING },
              communicationStyle: { type: Type.STRING },
              greetingTone: { type: Type.STRING }
            },
            required: ["type", "description", "quote", "greetingTone"]
          }
        }
      });

      if (response.text) {
        const parsed = JSON.parse(stripEmDashes(response.text.trim()));
        return res.status(200).json({ success: true, source: "ai", data: parsed });
      }

      throw new Error("Failed to generate profile");
    } catch (err: any) {
      console.error("Profile Gen Error:", err);
      const data =
        (logCount >= MIN_LOG_FALLBACK ? await getRandomFromLog() : null) ||
        (await getCuratedProfile());
      return res.status(200).json({ success: true, source: "fallback", data });
    }
  });

  // 9. Weekly Dashboard Greeting - a short, warm, cherry-themed, relationship-
  //    focused line tailored to group size and the user's profile tone.
  app.post("/api/generate-greeting", requireAuth, rateLimit("greeting", 60), async (req, res) => {
    const { memberCount, profileType: rawProfileType, greetingTone: rawTone } = req.body || {};
    const count = Number(memberCount) || 1;
    // Validate/sanitize the user-influenced fields before they enter the prompt.
    const ALLOWED_TONES = ["playful", "pragmatic", "nurturing", "analytical", "adventurous", "harmonious", "thrifty", "generous"];
    const greetingTone = ALLOWED_TONES.includes(rawTone) ? rawTone : "harmonious";
    const profileType = typeof rawProfileType === "string" ? rawProfileType.slice(0, 60) : "";

    // Curated fallback lines (used if the AI call fails).
    const fallbackBySize: Record<string, string> = {
      solo: "A cherry's sweeter shared - but savoring your own bowl today is just as ripe. 🍒",
      pair: "Two cherries on one stem: share the sweet, split the pits, and keep it fair. 🍒",
      group: "A bowl of cherries is best passed around - here's to sharing every sweet bite together. 🍒",
    };
    const sizeKey = count <= 1 ? "solo" : count === 2 ? "pair" : "group";

    try {
      const { GoogleGenAI, Type } = await import("@google/genai");
      const ai = new GoogleGenAI({
        vertexai: true,
        project: process.env.GOOGLE_CLOUD_PROJECT || "gen-lang-client-0987674990",
        location: process.env.GOOGLE_CLOUD_LOCATION || "us-central1",
      });

      const audience =
        count <= 1 ? "one person managing their own bowl"
        : count === 2 ? "a pair sharing everything"
        : `a household of ${count} people sharing together`;

      const prompt =
        "Write a VERY short greeting for the home screen of \"Have Another Cherry\", a warm household " +
        "expense-sharing app. Requirements:\n" +
        "- 1 to 2 lines, roughly 20 words maximum.\n" +
        "- Positive and relationship-focused, about sharing/fairness/togetherness.\n" +
        "- Must charmingly reference cherries (sharing cherries). A tiny rhyme or limerick feel is welcome.\n" +
        `- Written for ${audience}.\n` +
        `- Match this tone: ${greetingTone || "harmonious"}.\n` +
        (profileType ? `- Subtly fit someone whose money style is "${profileType}".\n` : "") +
        "- At most one 🍒 emoji. No hashtags, no surrounding quotes.\n" +
        "- Never use an em dash; use commas, periods, or hyphens instead.\n" +
        "Output ONLY the greeting text.";

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: {
          temperature: 1.1,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: { greeting: { type: Type.STRING } },
            required: ["greeting"]
          }
        }
      });

      if (response.text) {
        const parsed = JSON.parse(stripEmDashes(response.text.trim()));
        const greeting = (parsed.greeting || "").trim();
        if (greeting) return res.status(200).json({ success: true, greeting });
      }
      throw new Error("Empty greeting");
    } catch (err: any) {
      console.error("Greeting Gen Error:", err?.message || err);
      return res.status(200).json({ success: true, greeting: fallbackBySize[sizeKey] });
    }
  });

  // 10. Financial-Alignment Conversation Starter - a short, warm opener for the
  //     "your reported income and your partner's estimate disagree" check-in,
  //     tuned to how large the gap is and to each person's money-talk style.
  app.post("/api/generate-conversation-starter", requireAuth, rateLimit("starter", 30), async (req, res) => {
    const { severityPct: rawSeverity, styles: rawStyles } = req.body || {};

    // Sanitize user-influenced fields before they enter the prompt.
    const severityPct = Math.min(500, Math.max(0, Math.round(Number(rawSeverity) || 0)));
    const styles = (Array.isArray(rawStyles) ? rawStyles : [])
      .slice(0, 5)
      .map((s: any) => ({
        name: typeof s?.name === "string" ? s.name.slice(0, 40) : "A member",
        type: typeof s?.type === "string" ? s.type.slice(0, 60) : "",
        communicationStyle: typeof s?.communicationStyle === "string" ? s.communicationStyle.slice(0, 200) : "",
      }));

    // Curated fallbacks by severity, used if the AI call fails.
    const fallback =
      severityPct >= 50
        ? "It looks like the numbers you each had in mind are pretty far apart - that usually just means you haven't had the full conversation yet. Maybe start with: \"What does a fair split feel like to you, and what would you want me to know about your situation?\""
        : severityPct >= 25
        ? "Your pictures of each other's income don't quite line up. A gentle way in: \"I realized I might be guessing wrong about your numbers - want to swap real ones so our split feels fair to both of us?\""
        : "You're close, but not quite in sync on the numbers. Try: \"Quick money check-in - want to make sure our split still matches reality?\"";

    try {
      const { GoogleGenAI, Type } = await import("@google/genai");
      const ai = new GoogleGenAI({
        vertexai: true,
        project: process.env.GOOGLE_CLOUD_PROJECT || "gen-lang-client-0987674990",
        location: process.env.GOOGLE_CLOUD_LOCATION || "us-central1",
      });

      const severityBand =
        severityPct >= 50 ? "large (over 50% apart) - be extra gentle, acknowledge it may feel loaded, suggest a structured, unhurried conversation"
        : severityPct >= 25 ? "moderate (25-50% apart) - warm and direct, normalize the mismatch, invite swapping real numbers"
        : "small (10-25% apart) - light and easy, frame it as a quick sync-up";

      const styleLines = styles
        .map(s => `- ${s.name}: money style "${s.type || "unknown"}"${s.communicationStyle ? `; prefers to talk about money like this: ${s.communicationStyle}` : ""}`)
        .join("\n");

      const prompt =
        "You write conversation starters for \"Have Another Cherry\", a warm, non-judgmental household " +
        "expense-splitting app. A household's members reported their own incomes and estimated each " +
        "other's, and the numbers disagree.\n\n" +
        `Gap severity: ${severityPct}% - ${severityBand}.\n\n` +
        "The people, and how they each prefer to talk about money:\n" + (styleLines || "- (no profiles available)") + "\n\n" +
        "Write ONE conversation starter (2-4 sentences) they could actually say to each other to open a " +
        "kind, blame-free talk about getting their real numbers in sync so their expense split feels fair. " +
        "Adapt the tone to the severity band and bridge their communication styles. Include one concrete " +
        "opening line in quotes they can borrow. Never scold, never assume anyone lied, never mention " +
        "specific dollar amounts, and don't use the word \"discrepancy\".\n\n" +
        "Never use em dashes; use commas, periods, or hyphens instead. " +
        "Return JSON with a single field: starter.";

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: {
          temperature: 0.9,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: { starter: { type: Type.STRING } },
            required: ["starter"]
          }
        }
      });

      if (response.text) {
        const parsed = JSON.parse(stripEmDashes(response.text.trim()));
        const starter = (parsed.starter || "").trim();
        if (starter) return res.status(200).json({ success: true, starter });
      }
      throw new Error("Empty starter");
    } catch (err: any) {
      console.error("Conversation Starter Gen Error:", err?.message || err);
      return res.status(200).json({ success: true, starter: fallback });
    }
  });

  // 11. Cherry + Waitlist - signups from the coming-soon page. Every signup is
  //     forwarded to poolside@haveanothercherry.com via Resend; if Mailchimp
  //     env vars are configured, the address is also subscribed to that
  //     audience directly.
  app.post("/api/plus-waitlist", requireAuth, rateLimit("waitlist", 5), async (req, res) => {
    const { email } = req.body || {};
    if (!email || typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: "A valid email address is required." });
    }

    let subscribed = false;
    // Optional Mailchimp subscribe (set MAILCHIMP_API_KEY, MAILCHIMP_SERVER_PREFIX
    // e.g. "us21", and MAILCHIMP_AUDIENCE_ID in Secret Manager / apphosting.yaml).
    const mcKey = process.env.MAILCHIMP_API_KEY;
    const mcServer = process.env.MAILCHIMP_SERVER_PREFIX;
    const mcAudience = process.env.MAILCHIMP_AUDIENCE_ID;
    if (mcKey && mcServer && mcAudience) {
      try {
        const mcRes = await fetch(
          `https://${mcServer}.api.mailchimp.com/3.0/lists/${mcAudience}/members`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${mcKey}`,
            },
            body: JSON.stringify({ email_address: email, status: "pending", tags: ["cherry-plus-waitlist"] }),
          }
        );
        // "Member Exists" (400) still counts as on the list.
        subscribed = mcRes.ok || mcRes.status === 400;
        if (!mcRes.ok && mcRes.status !== 400) {
          console.error("Mailchimp subscribe failed:", mcRes.status, await mcRes.text().catch(() => ""));
        }
      } catch (e: any) {
        console.error("Mailchimp subscribe error:", e?.message || e);
      }
    }

    try {
      await sendWaitlistNotification(email);
      return res.status(200).json({ success: true, subscribed });
    } catch (err: any) {
      console.error("Waitlist Error:", err?.message || err);
      // If Mailchimp got them, the signup still succeeded.
      if (subscribed) return res.status(200).json({ success: true, subscribed });
      return res.status(500).json({ error: "Could not save your signup. Please try again." });
    }
  });

  // 11a2. Beta signup (public). The marketing site's beta form posts here
  //      cross-origin (see the marketing origins in ALLOWED_ORIGINS and the
  //      gate exemption above). No auth: visitors are anonymous. Each signup
  //      is forwarded to the poolside@ inbox via Resend. Rate limited per IP
  //      to keep the public endpoint from being abused.
  app.post("/api/beta-signup", rateLimit("beta-signup", 5), async (req, res) => {
    const body = req.body || {};
    const clean = (v: unknown, max: number) =>
      typeof v === "string" ? v.trim().slice(0, max) : "";

    const email = clean(body.email, 254);
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: "A valid email address is required." });
    }
    if (body.consent !== "yes") {
      return res.status(400).json({ error: "Consent is required so we know we can email you." });
    }

    // Bot filters. Both must run here, not in the browser: a scripted post
    // never executes our JS, so a client-side check catches nothing that
    // matters.
    //
    // Answer 200 rather than 4xx. A bot that gets an error learns which field
    // betrayed it and retries without it; one that gets a success moves on. The
    // visitor sees the normal confirmation either way, and no lead is written.
    const honeypot = typeof body.company === "string" ? body.company.trim() : "";
    if (honeypot) {
      console.warn("[signup] honeypot filled, dropped");
      return res.status(200).json({ success: true });
    }

    // Humans do not read, type and submit in under two seconds. Missing or
    // unparseable elapsed time is allowed through: it means an older cached
    // page, not necessarily a bot, and silently dropping real people is worse
    // than letting a few through.
    const elapsedMs = Number(body.elapsedMs);
    if (Number.isFinite(elapsedMs) && elapsedMs >= 0 && elapsedMs < 2000) {
      console.warn("[signup] submitted in " + elapsedMs + "ms, dropped");
      return res.status(200).json({ success: true });
    }

    const platform = clean(body.platform, 20);
    const notes = clean(body.notes, 1000);
    const source = clean(body.source, 300);

    try {
      await sendBetaSignupNotification({
        name: clean(body.name, 100),
        email,
        household: clean(body.household, 100),
        interests: clean(body.interests, 300),
        notes,
        source,
      });
    } catch (err: any) {
      console.error("Beta signup error:", err?.message || err);
      return res.status(500).json({ error: "Could not save your signup. Please try again." });
    }

    // Mirror into Notion after the email has gone. The email is the system of
    // record; a Notion outage must not cost us the lead or show the visitor an
    // error for something already saved.
    try {
      await addWaitlistLeadToNotion({
        email,
        name: clean(body.name, 100),
        platform,
        source,
        referrer: clean(body.referrer, 500),
        consent: true,
        notes,
        formType: clean(body.formType, 20) === "Beta" ? "Beta" : "Waitlist",
        device: deviceFromUserAgent(req.get("user-agent")),
      });
    } catch (err: any) {
      console.error("Notion waitlist mirror failed:", err?.message || err);
    }

    return res.status(200).json({ success: true });
  });

  // 11b. Payment Reminder (Cherry +). Sends a gentle nudge email from
  //     tartcherry@haveanothercherry.com to a group member who still owes the
  //     caller money. Server-enforced: the caller must hold the Cherry +
  //     entitlement and both parties must be members of the same group. The
  //     amount and item titles come from the caller's own (E2E-encrypted)
  //     ledger: sending them in a reminder is the sender's deliberate choice.
  app.post("/api/send-reminder", requireAuth, rateLimit("remind", 10), async (req, res) => {
    try {
      const callerUid = (req as any).uid as string;
      const { debtorUid, groupId } = req.body || {};

      if (!debtorUid || typeof debtorUid !== "string" || !groupId || typeof groupId !== "string") {
        return res.status(400).json({ error: "Missing debtor or group." });
      }
      if (debtorUid === callerUid) {
        return res.status(400).json({ error: "You can't remind yourself." });
      }
      await ensureAdminApp();
      const { getFirestore } = await import("firebase-admin/firestore");
      const { getAuth } = await import("firebase-admin/auth");
      const fs = getFirestore();

      // Cherry + enforcement: reminders are a premium feature.
      const callerDoc = await fs.collection("users").doc(callerUid).get();
      const caller = callerDoc.data() || {};
      const entExpiry = caller?.plusEntitlement?.expiresAt;
      const callerHasPlus = !!caller.isPlus && (!entExpiry || new Date(entExpiry).getTime() > Date.now());
      if (!callerHasPlus) {
        return res.status(403).json({ error: "Payment reminders are a Cherry + feature." });
      }

      // Both people must belong to the group.
      const groupDoc = await fs.collection("groups").doc(groupId).get();
      const groupData = groupDoc.data() || {};
      const memberIds: string[] = Array.isArray(groupData.memberIds) ? groupData.memberIds : [];
      if (!memberIds.includes(callerUid) || !memberIds.includes(debtorUid)) {
        return res.status(403).json({ error: "Both people must be members of this group." });
      }

      // The debtor's real email lives in Firebase Auth (Firestore only stores a hash).
      const debtorAuth = await getAuth().getUser(debtorUid).catch(() => null);
      if (!debtorAuth?.email) {
        return res.status(404).json({ error: "That member has no email on file." });
      }

      const nameOf = (uid: string) =>
        (Array.isArray(groupData.members) ? groupData.members : []).find((m: any) => m?.uid === uid)?.name || "A member";

      // PRIVACY: no amounts or item details are accepted or emailed. The
      // ledger is E2E-encrypted and Resend's logs are operator-visible, so
      // the reminder only says an open balance exists.
      await sendReminderEmail(
        debtorAuth.email,
        nameOf(debtorUid),
        nameOf(callerUid),
        groupData.name || "your group"
      );

      return res.status(200).json({ success: true });
    } catch (err: any) {
      console.error("Reminder Error:", err?.message || err);
      return res.status(500).json({ error: "Could not send the reminder. Please try again." });
    }
  });

  // 12. Cherry + entitlement webhook (RevenueCat) - THE activation point for
  //     paid subscriptions. The iOS/Android apps (not yet built) will sell the
  //     "plus" entitlement through RevenueCat with appUserID = Firebase uid;
  //     RevenueCat then calls this endpoint on every subscription event and we
  //     mirror the entitlement onto users/{uid}, which every client reads via
  //     lib/entitlements.hasPlus().
  //
  //     Dormant until REVENUECAT_WEBHOOK_AUTH is set (Secret Manager +
  //     apphosting.yaml, same pattern as RESEND_API_KEY). Configure the same
  //     value under Authorization in RevenueCat's webhook settings.
  app.post("/api/revenuecat-webhook", async (req, res) => {
    const expectedAuth = process.env.REVENUECAT_WEBHOOK_AUTH;
    if (!expectedAuth) {
      return res.status(503).json({ error: "Cherry + billing is not configured yet." });
    }
    if ((req.headers.authorization || "") !== expectedAuth) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    try {
      const event = req.body?.event;
      const uid = event?.app_user_id;
      if (!uid || typeof uid !== "string" || uid.startsWith("$RCAnonymousID")) {
        // Anonymous purchasers can't be mapped to an account; RevenueCat will
        // resend once the app aliases the user. Acknowledge so it doesn't retry forever.
        return res.status(200).json({ received: true, ignored: "no mappable app_user_id" });
      }

      const type = String(event?.type || "");
      const ACTIVATING = ["INITIAL_PURCHASE", "RENEWAL", "UNCANCELLATION", "PRODUCT_CHANGE", "NON_RENEWING_PURCHASE"];
      const DEACTIVATING = ["EXPIRATION"];
      if (!ACTIVATING.includes(type) && !DEACTIVATING.includes(type)) {
        // CANCELLATION etc. leave the entitlement active until EXPIRATION fires.
        return res.status(200).json({ received: true, ignored: type });
      }

      await ensureAdminApp();
      const { getFirestore, FieldValue } = await import("firebase-admin/firestore");
      const userRef = getFirestore().collection("users").doc(uid);

      if (DEACTIVATING.includes(type)) {
        await userRef.set(
          { isPlus: false, plusEntitlement: FieldValue.delete() },
          { merge: true }
        );
      } else {
        await userRef.set(
          {
            isPlus: true,
            plusEntitlement: {
              source: event?.store === "PLAY_STORE" ? "revenuecat_android" : "revenuecat_ios",
              productId: event?.product_id || "",
              ...(event?.expiration_at_ms
                ? { expiresAt: new Date(Number(event.expiration_at_ms)).toISOString() }
                : {}),
              updatedAt: new Date().toISOString(),
            },
          },
          { merge: true }
        );
      }

      return res.status(200).json({ received: true });
    } catch (err: any) {
      console.error("RevenueCat webhook error:", err?.message || err);
      return res.status(500).json({ error: "Webhook processing failed" });
    }
  });

  // Unknown API routes should return JSON 404, not fall through to the SPA HTML.
  app.use("/api", (_req, res) => res.status(404).json({ error: "Not found" }));

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath, {
      setHeaders: (res, filePath) => {
        if (filePath.endsWith("index.html")) {
          res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
        } else if (filePath.includes(`${path.sep}assets${path.sep}`)) {
          // Only Vite's content-hashed bundles are safe to cache forever.
          res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        } else {
          // Un-hashed public/ files (logo.svg, icons, manifest) keep their
          // names when their content changes, so cap how long a stale copy
          // can outlive a deploy.
          res.setHeader("Cache-Control", "public, max-age=3600, must-revalidate");
        }
      },
    }));
    app.get("*", (req, res) => {
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log("Server running on http://localhost:" + PORT);
  });
}

startServer().catch((e) => {
  console.error("Fatal startup error:", e);
  process.exit(1);
});
