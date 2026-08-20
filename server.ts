import "dotenv/config";
import express from "express";
import path from "path";
import cors from "cors";
import { createServer as createViteServer } from "vite";
import { sendInviteEmail } from "./src/lib/resend";

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(cors());
  app.use(express.json());

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

  // 5. reCAPTCHA verification. Prefers the classic siteverify API when
  // RECAPTCHA_SECRET_KEY is set (Secret Manager via apphosting.yaml);
  // otherwise falls back to an Enterprise assessment via ADC (no API key — org policy).
  app.post("/api/verify-recaptcha", async (req, res) => {
    try {
      const { token, action } = req.body;
      if (!token) {
        return res.status(400).json({ error: "Missing token" });
      }

      const secretKey = process.env.RECAPTCHA_SECRET_KEY;
      if (secretKey) {
        const verifyRes = await fetch("https://www.google.com/recaptcha/api/siteverify", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ secret: secretKey, response: token }),
        });
        const result: any = await verifyRes.json();
        const score = result.score;
        const actionMatches = !action || !result.action || result.action === action;
        const allowed = result.success === true && actionMatches && (score === undefined || score >= 0.5);

        if (!allowed) {
          console.warn("[reCAPTCHA] Blocked (siteverify):", {
            success: result.success,
            errorCodes: result["error-codes"],
            expectedAction: action,
            tokenAction: result.action,
            score,
          });
        }
        return res.status(200).json({ success: true, allowed, score });
      }

      const { GoogleAuth } = await import("google-auth-library");
      const auth = new GoogleAuth({
        scopes: ["https://www.googleapis.com/auth/cloud-platform"],
      });
      const client = await auth.getClient();
      const project = process.env.GOOGLE_CLOUD_PROJECT || "gen-lang-client-0987674990";

      const assessment: any = await client.request({
        url: `https://recaptchaenterprise.googleapis.com/v1/projects/${project}/assessments`,
        method: "POST",
        data: {
          event: {
            token,
            expectedAction: action || undefined,
            siteKey: "6LcvAYktAAAAAKG2B1e85ceC0ExEy1iIVSeUCcpB",
          },
        },
      });

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

  // 6. Resend Invite Endpoint
  app.post("/api/send-invite", async (req, res) => {
    try {
      const { email, groupName, inviteCode, recipientName, fromName, split } = req.body;

      const data = await sendInviteEmail(email, groupName, inviteCode, recipientName, fromName, split);
      res.status(200).json({ success: true, data });
    } catch (err: any) {
      console.error("Server Invite Error:", err);
      res.status(500).json({ error: err.message });
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

  // 8. Financial Profile Generation API
  app.post("/api/generate-profile", async (req, res) => {
    try {
      const { FINANCIAL_PROFILES } = await import("./src/lib/profiles.js");
      const { GoogleGenAI, Type } = await import("@google/genai");
      const ai = new GoogleGenAI({
        vertexai: true,
        project: process.env.GOOGLE_CLOUD_PROJECT || "gen-lang-client-0987674990",
        location: process.env.GOOGLE_CLOUD_LOCATION || "us-central1",
      });

      const { answers } = req.body;

      const prompt =
        "Analyze the following user quiz responses regarding financial habits:\n" +
        JSON.stringify(answers, null, 2) +
        "\n\nMatch the user to the most appropriate financial profile from this list:\n" +
        JSON.stringify(FINANCIAL_PROFILES, null, 2) +
        "\n\nReturn ONLY the exact profile object you selected from the list (with 'type', 'description', and 'quote' fields).";

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              type: { type: Type.STRING },
              description: { type: Type.STRING },
              quote: { type: Type.STRING }
            },
            required: ["type", "description", "quote"]
          }
        }
      });

      if (response.text) {
        const parsed = JSON.parse(response.text.trim());
        return res.status(200).json({ success: true, data: parsed });
      }

      throw new Error("Failed to generate profile");
    } catch (err: any) {
      console.error("Profile Gen Error:", err);
      const { FINANCIAL_PROFILES } = await import("./src/lib/profiles.js");
      return res.status(200).json({
        success: true,
        data: FINANCIAL_PROFILES[Math.floor(Math.random() * FINANCIAL_PROFILES.length)]
      });
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
