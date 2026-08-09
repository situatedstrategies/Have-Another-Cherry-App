import "dotenv/config";
import express from "express";
import path from "path";
import cors from "cors";
import { createServer as createViteServer } from "vite";
import { sendInviteEmail, sendResetEmail } from "./src/lib/resend";

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(cors());
  app.use(express.json());

  // Lightweight Alpha Lite abuse protection for public email endpoints.
  // App Hosting instances may have separate memory, so production launch
  // should eventually use managed rate limiting.
  const requestBuckets = new Map<string, { count: number; resetAt: number }>();

  const emailRateLimit = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const key = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    const windowMs = 15 * 60 * 1000;
    const maxRequests = 5;

    const bucket = requestBuckets.get(key);

    if (!bucket || now >= bucket.resetAt) {
      requestBuckets.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    if (bucket.count >= maxRequests) {
      return res.status(429).json({
        error: 'Too many requests. Please wait before trying again.'
      });
    }

    bucket.count += 1;
    next();
  };

  // Lazily initialize the Firebase Admin SDK (ADC) once, shared across endpoints.
  const ensureAdminApp = async () => {
    const { getApps, initializeApp, applicationDefault } = await import("firebase-admin/app");
    if (!getApps().length) {
      initializeApp({
        credential: applicationDefault(),
        projectId: process.env.GOOGLE_CLOUD_PROJECT || "gen-lang-client-0987674990",
      });
    }
  };

  // Once the profile_log has at least this many entries, AI failures fall back
  // to a random logged profile instead of the small curated list.
  const MIN_LOG_FALLBACK = 50;

  // Pick a fallback profile: prefer a random entry from profile_log once it's
  // large enough; otherwise use the curated FINANCIAL_PROFILES list.
  const getFallbackProfile = async () => {
    try {
      await ensureAdminApp();
      const { getFirestore } = await import("firebase-admin/firestore");
      const dbAdmin = getFirestore();
      const snap = await dbAdmin
        .collection("profile_log")
        .orderBy("createdAt", "desc")
        .limit(500)
        .get();
      if (snap.size >= MIN_LOG_FALLBACK) {
        const pick: any = snap.docs[Math.floor(Math.random() * snap.size)].data();
        const { createdAt, source, uid, ...profile } = pick;
        return { ...profile, greetingTone: profile.greetingTone || "harmonious" };
      }
    } catch (e: any) {
      console.error("profile_log fallback read failed:", e?.message || e);
    }
    const { FINANCIAL_PROFILES } = await import("./src/lib/profiles.js");
    const f = FINANCIAL_PROFILES[Math.floor(Math.random() * FINANCIAL_PROFILES.length)];
    return { ...f, greetingTone: "harmonious" };
  };

  // 1. Gemini Multimodal API (Receipt Scanning) via Vertex AI (ADC).
  app.post("/api/scan-receipt", async (req, res) => {
    try {
      const { GoogleGenAI, Type } = await import("@google/genai");
      const ai = new GoogleGenAI({
        vertexai: true,
        project: process.env.GOOGLE_CLOUD_PROJECT || "gen-lang-client-0987674990",
        location: process.env.GOOGLE_CLOUD_LOCATION || "us-central1",
      });

      const base64Image = req.body?.image;
      if (base64Image) {
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
              amount: parsed.amount || 0,
              description: parsed.description || "Receipt Scan",
              date: parsed.date || new Date().toISOString().split('T')[0]
            }
          });
        }
      }

      await new Promise(resolve => setTimeout(resolve, 1200));
      res.status(200).json({
        success: true,
        data: { amount: 84.50, description: "Grocery Store Run (Mocked AI Parse)" }
      });
    } catch (err: any) {
      console.error("Receipt Scan Error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // 6. Resend Invite Endpoint
  app.post("/api/send-invite", emailRateLimit, async (req, res) => {
    try {
      const { email, groupName, inviteCode, recipientName, fromName, split } = req.body;

      const data = await sendInviteEmail(email, groupName, inviteCode, recipientName, fromName, split);
      res.status(200).json({ success: true, data });
    } catch (err: any) {
      console.error("Server Invite Error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // 6b. Password Reset Endpoint (Resend + Firebase Admin SDK)
  // Generates a Firebase password-reset link server-side (Admin SDK via ADC) and
  // delivers it via Resend from reset@haveanothercherry.com. Responds generically
  // so we never reveal whether an email is registered.
  app.post("/api/send-password-reset", emailRateLimit, async (req, res) => {
    const { email } = req.body || {};
    if (!email || typeof email !== "string") {
      return res.status(400).json({ error: "Email is required" });
    }

    try {
      await ensureAdminApp();
      const { getAuth } = await import("firebase-admin/auth");

      let resetLink: string;
      try {
        resetLink = await getAuth().generatePasswordResetLink(email);
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

  // 7. Firebase Cloud Messaging (FCM) API Infrastructure
  app.post("/api/send-notification", async (req, res) => {
    try {
      const { token, title, body, data } = req.body;
      if (!token || !title || !body) {
        return res.status(400).json({ error: "Missing token, title, or body" });
      }

      console.log("[FCM] Constructing notification for token: " + token);
      const payload = { message: { token, notification: { title, body }, data: data || {} } };

      console.log("[FCM] Formatted Message Payload:", JSON.stringify(payload));
      res.status(200).json({ success: true, messageId: "mock-fcm-id-" + Date.now() });
    } catch (err: any) {
      console.error("FCM Delivery Error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // 8. Financial Profile Generation API — generates a UNIQUE, bespoke profile
  //    from the quiz answers, analyzed holistically/interconnected.
  app.post("/api/generate-profile", async (req, res) => {
    try {
      const { GoogleGenAI, Type } = await import("@google/genai");
      const ai = new GoogleGenAI({
        vertexai: true,
        project: process.env.GOOGLE_CLOUD_PROJECT || "gen-lang-client-0987674990",
        location: process.env.GOOGLE_CLOUD_LOCATION || "us-central1",
      });

      const { answers } = req.body;

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
      const data = await getFallbackProfile();
      return res.status(200).json({ success: true, source: "fallback", data });
    }
  });

  // 9. Weekly Dashboard Greeting — a short, warm, cherry-themed, relationship-
  //    focused line tailored to group size and the user's profile tone.
  app.post("/api/generate-greeting", async (req, res) => {
    const { memberCount, profileType, greetingTone } = req.body || {};
    const count = Number(memberCount) || 1;

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

startServer();
