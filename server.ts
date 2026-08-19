import "dotenv/config";
import express from "express";
import path from "path";
import cors from "cors";
import { createServer as createViteServer } from "vite";
import { sendInviteEmail, sendResetEmail, sendVerificationEmail } from "./src/lib/resend";
import { actionHandlerBase, retargetActionLink } from "./src/lib/actionLink";

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  // Behind App Hosting / Cloud Run every request arrives via Google's front-end
  // proxy; trust it so req.ip reflects the real client (X-Forwarded-For) and the
  // rate limiter buckets per user instead of collapsing to one global bucket.
  app.set("trust proxy", true);

  // Restrict cross-origin browser access to our own app origins (the SPA is
  // same-origin, so this doesn't affect it — it just blocks other sites).
  const allowedOrigins = (
    process.env.ALLOWED_ORIGINS ||
    "https://app.haveanothercherry.com,https://have-another-cherry--gen-lang-client-0987674990.us-east4.hosted.app,http://localhost:3000"
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

  // Lightweight Alpha Lite abuse protection for public email endpoints.
  // App Hosting instances may have separate memory, so production launch
  // should eventually use managed rate limiting.
  const requestBuckets = new Map<string, { count: number; resetAt: number }>();
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
            "Extract the total amount, date, and description from this receipt. Return ONLY valid JSON."
          ],
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                amount: { type: Type.NUMBER, description: "Total amount on the receipt" },
                description: { type: Type.STRING, description: "Short descriptive name of the merchant/store" },
                date: { type: Type.STRING, description: "Date in YYYY-MM-DD format if available" }
              },
              required: ["amount", "description"]
            }
          }
        });

        if (response.text) {
          const parsed = JSON.parse(response.text.trim());
          return res.status(200).json({
            success: true,
            data: {
              amount: Math.max(0, Number(parsed.amount) || 0),
              description: parsed.description || "Receipt Scan",
              date: parsed.date || new Date().toISOString().split('T')[0]
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

  // 8. Financial Profile Generation API — generates a UNIQUE, bespoke profile
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
        "Analyze these quiz answers HOLISTICALLY and as an INTERCONNECTED whole — for example, how the person's " +
        "credit-card and cash habits relate to how they feel about money, and to how they prefer to talk about it. " +
        "Look for tension or harmony between answers (e.g., a spender who avoids money talk, or a saver who loves it).\n\n" +
        "Quiz answers (JSON):\n" + JSON.stringify(answers, null, 2) + "\n\n" +
        "Generate ONE unique, bespoke financial-personality profile that feels tailor-made for THIS combination of answers. " +
        "Invent a distinctive, evocative 'type' name of 2-4 words (do not reuse generic textbook labels). " +
        "Write in warm, encouraging second person. Be specific to their answers, insightful, and never judgmental.\n\n" +
        "Return JSON with fields: " +
        "type (2-4 word name), " +
        "description (2-3 sentences, second person), " +
        "quote (a real, correctly-attributed quote about money, sharing, or relationships, formatted as: \"<quote>\" — <Author>), " +
        "traits (an array of 3-5 short descriptive phrases), " +
        "strengths (one encouraging sentence), " +
        "watchouts (one gentle, constructive sentence), " +
        "communicationStyle (one sentence about how this person likely prefers to discuss money with a partner/housemate), " +
        "greetingTone (exactly ONE lowercase word chosen from: playful, pragmatic, nurturing, analytical, adventurous, harmonious, thrifty, generous).";

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
        const parsed = JSON.parse(response.text.trim());
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

  // 9. Weekly Dashboard Greeting — a short, warm, cherry-themed, relationship-
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
      solo: "A cherry's sweeter shared — but savoring your own bowl today is just as ripe. 🍒",
      pair: "Two cherries on one stem: share the sweet, split the pits, and keep it fair. 🍒",
      group: "A bowl of cherries is best passed around — here's to sharing every sweet bite together. 🍒",
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
        const parsed = JSON.parse(response.text.trim());
        const greeting = (parsed.greeting || "").trim();
        if (greeting) return res.status(200).json({ success: true, greeting });
      }
      throw new Error("Empty greeting");
    } catch (err: any) {
      console.error("Greeting Gen Error:", err?.message || err);
      return res.status(200).json({ success: true, greeting: fallbackBySize[sizeKey] });
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
        } else {
          res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
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
