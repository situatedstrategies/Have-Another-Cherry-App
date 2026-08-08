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

  // 6b. Password Reset Endpoint (Resend + Firebase Admin SDK)
  // Generates a Firebase password-reset link server-side (Admin SDK via ADC) and
  // delivers it via Resend from reset@haveanothercherry.com. Responds generically
  // so we never reveal whether an email is registered.
  app.post("/api/send-password-reset", async (req, res) => {
    const { email } = req.body || {};
    if (!email || typeof email !== "string") {
      return res.status(400).json({ error: "Email is required" });
    }

    try {
      const { getApps, initializeApp, applicationDefault } = await import("firebase-admin/app");
      const { getAuth } = await import("firebase-admin/auth");

      if (!getApps().length) {
        initializeApp({
          credential: applicationDefault(),
          projectId: process.env.GOOGLE_CLOUD_PROJECT || "gen-lang-client-0987674990",
        });
      }

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
