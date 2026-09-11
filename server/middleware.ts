import express from 'express';
import { ensureAdminApp, safeEqual } from './shared';

// In-memory per-instance rate limiting. App Hosting instances do not share
// it, so this is abuse protection rather than a hard quota.
const requestBuckets = new Map<string, { count: number; resetAt: number }>();
let lastSweep = 0;

// Drop expired buckets occasionally so the map can't grow without bound.
const sweepBuckets = (now: number) => {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [k, b] of requestBuckets) if (now >= b.resetAt) requestBuckets.delete(k);
};

// Per-endpoint limiter keyed on client IP, so one abuser is isolated.
export const rateLimit =
  (name: string, maxRequests = 5, windowMs = 15 * 60 * 1000) =>
  (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const now = Date.now();
    sweepBuckets(now);
    const key = `${name}:${req.ip || req.socket.remoteAddress || 'unknown'}`;
    const bucket = requestBuckets.get(key);
    if (!bucket || now >= bucket.resetAt) {
      requestBuckets.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }
    if (bucket.count >= maxRequests) {
      return res.status(429).json({ error: 'Too many requests. Please wait before trying again.' });
    }
    bucket.count += 1;
    next();
  };

// Requires a valid Firebase ID token; guards the billed AI and email routes.
export const requireAuth = async (
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) => {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!token) return res.status(401).json({ error: 'Authentication required.' });
    await ensureAdminApp();
    const { getAuth } = await import('firebase-admin/auth');
    const decoded = await getAuth().verifyIdToken(token);
    (req as any).uid = decoded.uid;
    (req as any).firebaseUser = decoded;
    next();
  } catch (e: any) {
    console.error('Auth verification failed:', e?.message || e);
    return res.status(401).json({ error: 'Authentication required.' });
  }
};

// A shared-secret check for machine callers (cron, webhooks). Fails closed:
// an unset secret is a 503, never an open endpoint. `disabledSentinel` treats
// the literal value "disabled" as unset, because App Hosting rejects an empty
// value and a named sentinel is how a webhook is switched off in config.
export const requireSecret =
  (opts: {
    env: string;
    header: string;
    notConfigured: string;
    unauthorized: string;
    disabledSentinel?: boolean;
    logUnset?: string;
  }) =>
  (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const expected = process.env[opts.env];
    if (!expected || (opts.disabledSentinel && expected === 'disabled')) {
      if (opts.logUnset) console.error(opts.logUnset);
      return res.status(503).json({ error: opts.notConfigured });
    }
    const offered = String(req.header(opts.header) || '');
    if (!safeEqual(offered, expected)) {
      return res.status(401).json({ error: opts.unauthorized });
    }
    next();
  };

export type GroupInfo = { memberIds: string[]; callerName: string; groupName: string };
export type GroupLoader = (groupId: string, callerUid: string) => Promise<GroupInfo | null>;

// Loads req.body.groupId through `loader` and confirms the authenticated
// caller belongs to it, attaching the result as req.groupInfo. Membership is
// enforced here, not trusted from the client. The route validates groupId
// before this runs; a loader failure answers with the route's own 500 copy.
export const requireGroupMember =
  (loader: GroupLoader, failure: { log: string; message: string }) =>
  async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    try {
      const groupInfo = await loader(String(req.body?.groupId), (req as any).uid as string);
      if (!groupInfo) return res.status(403).json({ error: 'Not a member of this group.' });
      (req as any).groupInfo = groupInfo;
      next();
    } catch (err: any) {
      console.error(failure.log, err?.message || err);
      return res.status(500).json({ error: failure.message });
    }
  };
