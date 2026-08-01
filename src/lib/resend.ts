import { Resend } from "resend";
import fs from "fs/promises";
import path from "path";

// Emails are now enabled by default
const EMAIL_INVITES_ACTIVE = true;

export async function sendInviteEmail(email: string, groupName: string, inviteCode: string) {
  if (!EMAIL_INVITES_ACTIVE) {
    console.log(`[PRIVACY MODE] Suppressed email invite to ${email} for group ${groupName}`);
    // Return a mocked success to the frontend without processing the email
    return { id: "mocked_privacy_id_12345" };
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not configured");
  }

  const resend = new Resend(apiKey);

  // Load the branded HTML template
  const templatePath = path.join(process.cwd(), "src/templates/inviteEmail.html");
  let htmlTemplate = "";
  try {
    htmlTemplate = await fs.readFile(templatePath, "utf-8");
  } catch (error) {
    console.error("Failed to load email template:", error);
    throw new Error("Could not load email template.");
  }

  // Replace placeholders
  const htmlContent = htmlTemplate
    .replace(/{{groupName}}/g, groupName)
    .replace(/{{inviteCode}}/g, inviteCode);

  const { data, error } = await resend.emails.send({
    from: 'Have Another Cherry <notifications@haveanothercherry.com>',
    to: [email],
    subject: `You've been invited to ${groupName} on Have Another Cherry`,
    html: htmlContent,
  });

  if (error) {
    throw new Error(error.message);
  }

  return data;
}
