import express from 'express';
import { rateLimit, requireAuth } from '../middleware';
import { ensureAdminApp, isValidEmail } from '../shared';
import { sendResetEmail, sendVerificationEmail } from '../resend';
import { actionHandlerBase, retargetActionLink } from '../actionLink';
import firebaseConfig from '../../firebase-applet-config.json';

const router = express.Router();

// ---- reCAPTCHA (Enterprise, via ADC) ----
const createRecaptchaAssessment = async (token: string, action?: string) => {
  const { GoogleAuth } = await import('google-auth-library');
  const auth = new GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
  });
  const client = await auth.getClient();
  const project = process.env.GOOGLE_CLOUD_PROJECT || firebaseConfig.projectId;
  const rcConfig = firebaseConfig;

  return client.request({
    url: `https://recaptchaenterprise.googleapis.com/v1/projects/${project}/assessments`,
    method: 'POST',
    data: {
      event: {
        token,
        expectedAction: action || undefined,
        siteKey: rcConfig.recaptchaSiteKey,
      },
    },
  }) as Promise<any>;
};

// Pre-auth by nature and every call is billed, so the per-IP quota is all there is.
router.post('/api/verify-recaptcha', rateLimit('recaptcha', 30), async (req, res) => {
  try {
    const { token, action } = req.body;
    if (!token) {
      return res.status(400).json({ error: 'Missing token' });
    }

    const assessment = await createRecaptchaAssessment(token, action);

    const props = assessment.data?.tokenProperties;
    const score = assessment.data?.riskAnalysis?.score;
    const valid = props?.valid === true;
    const actionMatches = !action || props?.action === action;
    // Only token validity and action are enforced. The score is returned for
    // monitoring while the Enterprise key builds a baseline.
    const allowed = valid && actionMatches;

    if (!allowed) {
      console.warn('[reCAPTCHA] Blocked:', {
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
    console.error('reCAPTCHA Assessment Error:', err.message);
    // Fail open: an assessment outage should not lock users out of auth.
    res.status(200).json({ success: true, allowed: true, error: err.message });
  }
});

// Runs a dummy assessment so operators can confirm the API, IAM role and site key. Status only, never user data.
router.get('/api/recaptcha-health', rateLimit('recaptcha-health', 10), async (_req, res) => {
  const healthProject = process.env.GOOGLE_CLOUD_PROJECT || firebaseConfig.projectId;
  const healthConfig = firebaseConfig;
  try {
    const assessment = await createRecaptchaAssessment('health-check-dummy-token', 'HEALTH');
    const props = assessment.data?.tokenProperties;
    // A dummy token is expected to be invalid; reaching here means auth and IAM work.
    res.status(200).json({
      ok: true,
      assessmentApi: 'reachable',
      project: healthProject,
      siteKey: healthConfig.recaptchaSiteKey,
      dummyTokenValid: props?.valid === true,
      invalidReason: props?.invalidReason || null,
    });
  } catch (err: any) {
    res.status(200).json({
      ok: false,
      assessmentApi: 'error',
      project: healthProject,
      siteKey: healthConfig.recaptchaSiteKey,
      error: err.message,
    });
  }
});

// Saying that an address has no account is a deliberate trade against
// enumeration, so the endpoint is rate limited like the other anonymous ones.
const NO_ACCOUNT_MESSAGE =
  'We could not find an account for that email. Check the spelling, or create one.';

router.post('/api/account-lookup', rateLimit('lookup', 20), async (req, res) => {
  const { email } = req.body || {};
  if (!email || typeof email !== 'string') {
    return res.status(400).json({ error: 'Email is required' });
  }
  try {
    await ensureAdminApp();
    const { getAuth } = await import('firebase-admin/auth');
    const user = await getAuth().getUserByEmail(email.trim());
    return res.status(200).json({
      exists: true,
      providers: (user.providerData || []).map((p) => p.providerId),
    });
  } catch (err: any) {
    if (err?.code === 'auth/user-not-found' || err?.code === 'auth/email-not-found') {
      return res.status(200).json({ exists: false });
    }
    console.error('Account lookup error:', err?.message || err);
    return res.status(500).json({ error: 'Could not check that address right now.' });
  }
});

// An address with no account gets a 404 that says so (see account-lookup).
router.post('/api/send-password-reset', rateLimit('reset'), async (req, res) => {
  const rawEmail = req.body?.email;
  const email = typeof rawEmail === 'string' ? rawEmail.trim() : '';
  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }
  if (!isValidEmail(email)) {
    return res.status(400).json({ error: 'Please enter a valid email address.' });
  }

  try {
    await ensureAdminApp();
    const { getAuth } = await import('firebase-admin/auth');

    let resetLink: string;
    try {
      resetLink = retargetActionLink(
        await getAuth().generatePasswordResetLink(email),
        actionHandlerBase(req.headers, process.env.AUTH_ACTION_URL)
      );
    } catch (linkErr: any) {
      if (linkErr?.code === 'auth/user-not-found' || linkErr?.code === 'auth/email-not-found') {
        return res.status(404).json({ error: NO_ACCOUNT_MESSAGE, code: 'no-account' });
      }
      throw linkErr;
    }

    await sendResetEmail(email, resetLink);
    return res.status(200).json({ success: true });
  } catch (err: any) {
    console.error('Password Reset Error:', err?.message || err);
    return res.status(500).json({ error: 'Unable to send reset email. Please try again later.' });
  }
});

// Authenticated on purpose: the address comes from the caller's ID token,
// never the body, so this cannot mail arbitrary strangers. Reset can be
// anonymous because it only ever mails an address that has an account.
router.post('/api/send-verification', requireAuth, rateLimit('verify'), async (req, res) => {
  try {
    const decoded = (req as any).firebaseUser;
    const email = decoded?.email;

    if (!email) {
      return res.status(400).json({ error: 'This account has no email address to confirm.' });
    }

    // Nothing to do for Google accounts, or anyone who already confirmed.
    if (decoded?.email_verified) {
      return res.status(200).json({ success: true, alreadyVerified: true });
    }

    const { getAuth } = await import('firebase-admin/auth');
    const verifyLink = retargetActionLink(
      await getAuth().generateEmailVerificationLink(email),
      actionHandlerBase(req.headers, process.env.AUTH_ACTION_URL)
    );

    const name = typeof req.body?.name === 'string' ? req.body.name : undefined;
    await sendVerificationEmail(email, verifyLink, name);

    return res.status(200).json({ success: true });
  } catch (err: any) {
    console.error('Verification Email Error:', err?.message || err);
    return res
      .status(500)
      .json({ error: 'Unable to send verification email. Please try again later.' });
  }
});

// ---- Apple: Sign in with Apple notifications, associated domains ----
// Apple POSTs { payload: <JWT> } when a user revokes consent, deletes their
// Apple ID or toggles Hide My Email. Nothing is trusted until the JWT
// verifies against Apple's JWKS with our client ids as audience. If Apple
// was the only sign-in method the account is wiped (Auth user and profile
// doc); otherwise only the Apple link is removed and sessions are revoked.
// Shared group data and the encrypted ledger are never touched from here.
const APPLE_NOTIFICATION_AUDIENCES = (
  process.env.APPLE_CLIENT_IDS ||
  'com.situatedstrategies.haveAnotherCherry,com.situatedstrategies.haveAnotherCherry.web'
)
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

router.post('/api/apple-notifications', async (req, res) => {
  const token = typeof req.body?.payload === 'string' ? req.body.payload : '';
  if (!token) return res.status(400).json({ error: 'Missing payload' });

  let event: any;
  try {
    const { createRemoteJWKSet, jwtVerify } = await import('jose');
    const jwks = createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys'));
    const { payload } = await jwtVerify(token, jwks, {
      issuer: 'https://appleid.apple.com',
      audience: APPLE_NOTIFICATION_AUDIENCES,
    });
    const rawEvents = (payload as any).events;
    event = typeof rawEvents === 'string' ? JSON.parse(rawEvents) : rawEvents;
  } catch (err: any) {
    console.warn('Apple notification rejected:', err?.message || err);
    return res.status(401).json({ error: 'Invalid notification' });
  }

  const type = String(event?.type || '');
  const appleSub = String(event?.sub || '');
  // email-disabled and email-enabled need no action.
  if (!appleSub || (type !== 'consent-revoked' && type !== 'account-delete')) {
    return res.status(200).json({ received: true, ignored: type || 'no event' });
  }

  try {
    await ensureAdminApp();
    const { getAuth } = await import('firebase-admin/auth');
    const { getFirestore } = await import('firebase-admin/firestore');
    const adminAuth = getAuth();

    const found = await adminAuth.getUsers([{ providerId: 'apple.com', providerUid: appleSub }]);
    const user = found.users[0];
    if (!user) {
      return res.status(200).json({ received: true, ignored: 'no matching account' });
    }

    const hasOtherSignIn = user.providerData.some((p) => p.providerId !== 'apple.com');
    if (hasOtherSignIn) {
      await adminAuth.updateUser(user.uid, { providersToUnlink: ['apple.com'] });
      await adminAuth.revokeRefreshTokens(user.uid);
    } else {
      await getFirestore().collection('users').doc(user.uid).delete();
      await adminAuth.deleteUser(user.uid);
    }
    return res.status(200).json({ received: true });
  } catch (err: any) {
    console.error('Apple notification error:', err?.message || err);
    // Non-2xx so Apple retries; a deletion request must not be lost silently.
    return res.status(500).json({ error: 'Processing failed' });
  }
});

export default router;
