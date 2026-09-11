import express from 'express';
import { rateLimit, requireAuth } from '../middleware';
import { isValidEmail } from '../shared';
import { sendInviteEmail } from '../resend';

const router = express.Router();

router.post('/api/send-invite', requireAuth, rateLimit('invite'), async (req, res) => {
  try {
    const { email, groupName, inviteCode, recipientName, fromName, split } = req.body || {};
    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'A valid recipient email is required.' });
    }
    // The template escapes HTML; the caps bound size, not markup.
    const cap = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '');
    if (split && JSON.stringify(split).length > 4000) {
      return res.status(400).json({ error: 'Split details are too large.' });
    }

    const data = await sendInviteEmail(
      email,
      cap(groupName, 80),
      cap(inviteCode, 64),
      cap(recipientName, 80),
      cap(fromName, 80),
      split
    );
    res.status(200).json({ success: true, data });
  } catch (err: any) {
    console.error('Server Invite Error:', err);
    res.status(500).json({ error: 'Could not send the invite. Please try again.' });
  }
});

export default router;
