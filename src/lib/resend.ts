import { Resend } from "resend";
import fs from "fs/promises";
import path from "path";

const EMAIL_INVITES_ACTIVE = true;

function escapeHtml(input: string): string {
  return String(input == null ? "" : input)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

interface SplitEntry { name: string; split: number; }

export async function sendInviteEmail(
  email: string,
  groupName: string,
  inviteCode: string,
  recipientName?: string,
  fromName?: string,
  split?: SplitEntry[]
) {
  if (!EMAIL_INVITES_ACTIVE) {
    console.log("[PRIVACY MODE] Suppressed email invite to " + email + " for group " + groupName);
    return { id: "mocked_privacy_id_12345" };
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not configured");
  }

  const resend = new Resend(apiKey);

  const templatePath = path.join(process.cwd(), "src/templates/inviteEmail.html");
  let htmlTemplate = "";
  try {
    htmlTemplate = await fs.readFile(templatePath, "utf-8");
  } catch (error) {
    console.error("Failed to load email template:", error);
    throw new Error("Could not load email template.");
  }

  const safeRecipient = recipientName && recipientName.trim() ? recipientName.trim() : "there";
  const safeFrom = fromName && fromName.trim() ? fromName.trim() : "A friend";

  const rowStyleName = "padding:11px 0;border-bottom:1px solid #E4E4E7;font-family:'Inter',Helvetica,Arial,sans-serif;font-size:15px;color:#18181B;font-weight:500;";
  const rowStylePct = "padding:11px 0;border-bottom:1px solid #E4E4E7;text-align:right;font-family:'JetBrains Mono',ui-monospace,monospace;font-size:15px;color:#C41200;font-weight:700;";

  const entries = Array.isArray(split) ? split.filter((s) => s && s.name) : [];
  let splitRows: string;
  if (entries.length) {
    splitRows = entries.map((s) => {
      const pct = Math.round((Number(s.split) || 0) * 10) / 10;
      return '<tr><td style="' + rowStyleName + '">' + escapeHtml(s.name) + '</td><td style="' + rowStylePct + '">' + pct + '%</td></tr>';
    }).join("");
  } else {
    splitRows = '<tr><td style="padding:11px 0;font-family:Inter,Helvetica,Arial,sans-serif;font-size:14px;color:#52525B;">You will set up the split together in the app.</td></tr>';
  }

  const htmlContent = htmlTemplate
    .split("{{recipientName}}").join(escapeHtml(safeRecipient))
    .split("{{fromName}}").join(escapeHtml(safeFrom))
    .split("{{groupName}}").join(escapeHtml(groupName || "your group"))
    .split("{{inviteCode}}").join(escapeHtml(inviteCode || ""))
    .split("{{splitRows}}").join(splitRows);

  const { data, error } = await resend.emails.send({
    from: "Have Another Cherry <notifications@haveanothercherry.com>",
    to: [email],
    subject: safeFrom + " invited you to " + groupName + " on Have Another Cherry",
    html: htmlContent,
  });

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

// Send a password reset email via Resend from reset@haveanothercherry.com.
// The resetLink is generated server-side by the Firebase Admin SDK.
export async function sendResetEmail(
  email: string,
  resetLink: string,
  recipientName?: string
) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not configured");
  }

  const resend = new Resend(apiKey);

  const templatePath = path.join(process.cwd(), "src/templates/resetEmail.html");
  let htmlTemplate = "";
  try {
    htmlTemplate = await fs.readFile(templatePath, "utf-8");
  } catch (error) {
    console.error("Failed to load reset email template:", error);
    throw new Error("Could not load reset email template.");
  }

  const safeRecipient = recipientName && recipientName.trim() ? recipientName.trim() : "there";

  const htmlContent = htmlTemplate
    .split("{{recipientName}}").join(escapeHtml(safeRecipient))
    .split("{{resetLink}}").join(escapeHtml(resetLink));

  const { data, error } = await resend.emails.send({
    from: "Have Another Cherry <reset@haveanothercherry.com>",
    to: [email],
    subject: "Reset your Have Another Cherry password",
    html: htmlContent,
  });

  if (error) {
    throw new Error(error.message);
  }

  return data;
}
