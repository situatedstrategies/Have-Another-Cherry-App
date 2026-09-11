import express from 'express';
import { rateLimit, requireAuth } from '../middleware';
import { isValidEmail } from '../shared';
import {
  sendBetaSignupNotification,
  sendSupportRequest,
  sendWaitlistNotification,
} from '../resend';
import { addWaitlistLeadToNotion, deviceFromUserAgent } from '../notion';

const router = express.Router();

// ---- Support ----
// Mails a human inbox with replyTo set to the sender, so it is signed-in
// only, rate limited and capped.
router.post('/api/support-request', requireAuth, rateLimit('support', 5), async (req, res) => {
  const { message, context, email, name } = req.body || {};

  if (typeof message !== 'string' || message.trim().length < 5) {
    return res.status(400).json({ error: 'Please describe what happened.' });
  }
  if (message.length > 5000) {
    return res.status(400).json({ error: 'That message is too long to send.' });
  }

  // The verified token address wins, so a reply cannot be aimed elsewhere.
  const fromEmail =
    (req as any).firebaseUser?.email || (typeof email === 'string' ? email.trim() : '');
  if (!isValidEmail(fromEmail)) {
    return res.status(400).json({ error: 'A valid email address is required.' });
  }

  try {
    await sendSupportRequest({
      fromEmail,
      fromName: typeof name === 'string' ? name.slice(0, 120) : undefined,
      message,
      context: typeof context === 'string' ? context.slice(0, 2000) : undefined,
    });
    return res.json({ success: true });
  } catch (err: any) {
    console.error('Support request error:', err?.message || err);
    return res.status(500).json({ error: 'Could not send that just now.' });
  }
});

// ---- Waitlist and beta signup ----

router.post('/api/plus-waitlist', requireAuth, rateLimit('waitlist', 5), async (req, res) => {
  const { email } = req.body || {};
  if (!isValidEmail(email)) {
    return res.status(400).json({ error: 'A valid email address is required.' });
  }

  let subscribed = false;
  // Optional: MAILCHIMP_API_KEY, MAILCHIMP_SERVER_PREFIX and MAILCHIMP_AUDIENCE_ID.
  const mcKey = process.env.MAILCHIMP_API_KEY;
  const mcServer = process.env.MAILCHIMP_SERVER_PREFIX;
  const mcAudience = process.env.MAILCHIMP_AUDIENCE_ID;
  if (mcKey && mcServer && mcAudience) {
    try {
      const mcRes = await fetch(
        `https://${mcServer}.api.mailchimp.com/3.0/lists/${mcAudience}/members`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${mcKey}`,
          },
          body: JSON.stringify({
            email_address: email,
            status: 'pending',
            tags: ['cherry-plus-waitlist'],
          }),
        }
      );
      // "Member Exists" (400) still counts as on the list.
      subscribed = mcRes.ok || mcRes.status === 400;
      if (!mcRes.ok && mcRes.status !== 400) {
        console.error(
          'Mailchimp subscribe failed:',
          mcRes.status,
          await mcRes.text().catch(() => '')
        );
      }
    } catch (e: any) {
      console.error('Mailchimp subscribe error:', e?.message || e);
    }
  }

  // Same Notion database as the site form. Best effort; the email is the record.
  try {
    await addWaitlistLeadToNotion({
      email,
      formType: 'Waitlist',
      source: 'cherry-plus (web app)',
      notes: 'Asked for a Cherry + feature in the web app',
      consent: true,
      device: deviceFromUserAgent(req.get('user-agent'), {
        platform: req.get('sec-ch-ua-platform'),
        mobile: req.get('sec-ch-ua-mobile'),
      }),
    });
  } catch (e: any) {
    console.error('Notion mirror failed for plus-waitlist:', e?.message || e);
  }

  try {
    await sendWaitlistNotification(email);
    return res.status(200).json({ success: true, subscribed });
  } catch (err: any) {
    console.error('Waitlist Error:', err?.message || err);
    // Mailchimp having them still counts as a signup.
    if (subscribed) return res.status(200).json({ success: true, subscribed });
    return res.status(500).json({ error: 'Could not save your signup. Please try again.' });
  }
});

// Public: the marketing site posts here cross-origin, so no auth, but rate limited.
router.post('/api/beta-signup', rateLimit('beta-signup', 5), async (req, res) => {
  const body = req.body || {};
  const clean = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

  const email = clean(body.email, 254);
  if (!isValidEmail(email)) {
    return res.status(400).json({ error: 'A valid email address is required.' });
  }
  if (body.consent !== 'yes') {
    return res.status(400).json({ error: 'Consent is required so we know we can email you.' });
  }

  // Bot filters answer 200 rather than 4xx: a bot that gets an error learns
  // which field betrayed it. The visitor sees the normal confirmation and
  // no lead is written.
  const honeypot = typeof body.company === 'string' ? body.company.trim() : '';
  if (honeypot) {
    console.warn('[signup] honeypot filled, dropped');
    return res.status(200).json({ success: true });
  }

  // Missing or unparseable timing is let through: an older cached page, not a bot.
  const elapsedMs = Number(body.elapsedMs);
  if (Number.isFinite(elapsedMs) && elapsedMs >= 0 && elapsedMs < 2000) {
    console.warn('[signup] submitted in ' + elapsedMs + 'ms, dropped');
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
    console.error('Beta signup error:', err?.message || err);
    return res.status(500).json({ error: 'Could not save your signup. Please try again.' });
  }

  // After the email has gone; a Notion outage must not cost the lead.
  try {
    await addWaitlistLeadToNotion({
      email,
      name: clean(body.name, 100),
      platform,
      source,
      referrer: clean(body.referrer, 500),
      consent: true,
      notes,
      formType: clean(body.formType, 20) === 'Beta' ? 'Beta' : 'Waitlist',
      device: deviceFromUserAgent(req.get('user-agent'), {
        platform: req.get('sec-ch-ua-platform'),
        mobile: req.get('sec-ch-ua-mobile'),
      }),
    });
  } catch (err: any) {
    console.error('Notion waitlist mirror failed:', err?.message || err);
  }

  return res.status(200).json({ success: true });
});

export default router;
