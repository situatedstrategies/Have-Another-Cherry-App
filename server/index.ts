import 'dotenv/config';
import { createHash } from 'crypto';
import express from 'express';
import path from 'path';
import cors from 'cors';
import firebaseConfig from '../firebase-applet-config.json';
import { PROJECT_ID, safeEqual } from './shared';
import authRoutes from './routes/auth';
import invitesRoutes from './routes/invites';
import aiRoutes from './routes/ai';
import billingRoutes from './routes/billing';
import notificationsRoutes from './routes/notifications';
import supportRoutes from './routes/support';

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  // Behind App Hosting every request arrives through Google's proxy. Trust
  // exactly one hop: that reads the client IP Google appends to
  // X-Forwarded-For. Trusting every hop would read the first entry, which the
  // client writes itself and could use to dodge the per-IP rate limits.
  app.set('trust proxy', 1);

  // ---- Middleware ----
  // No Content-Security-Policy yet: the SPA pulls Firebase, reCAPTCHA and
  // Google Fonts, so a CSP has to be introduced deliberately and tested.
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // The Firebase auth helper pages under /__/ render inside our own iframe.
    if (!req.path.startsWith('/__/')) {
      res.setHeader('X-Frame-Options', 'DENY');
    }
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    res.setHeader('Permissions-Policy', 'camera=(self), microphone=(), geolocation=(), payment=()');
    next();
  });

  // Cross-origin browser access is limited to our own origins plus the
  // marketing site, whose beta form posts to /api/beta-signup.
  const allowedOrigins = (
    process.env.ALLOWED_ORIGINS ||
    `https://app.haveanothercherry.com,https://have-another-cherry--${PROJECT_ID}.us-east4.hosted.app,http://localhost:3000,` +
      'https://haveanothercherry.com,https://www.haveanothercherry.com,https://have-another-cherry-marketing.pages.dev'
  )
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  app.use(
    cors({
      origin: (origin, cb) => {
        // No Origin header means same-origin or a non-browser client.
        if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
        return cb(null, false);
      },
    })
  );

  // Receipt images are sent as base64, so allow a generous body size.
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: false }));

  // beta.haveanothercherry.com was a second deployment. Old links, bookmarks
  // and invite emails that name it land on the real app.
  app.use((req, res, next) => {
    const host = String(req.headers.host || '')
      .split(':')[0]
      .toLowerCase();
    if (/^beta[.-]/.test(host)) {
      return res.redirect(301, 'https://app.haveanothercherry.com' + req.originalUrl);
    }
    return next();
  });

  // ---- Site gate ----
  // Optional password wall, off by default. SITE_GATE_ENABLED=1 turns it on
  // and SITE_GATE_PASSWORD_HASH is the SHA-256 of the password. Local dev is
  // never gated; webhooks and Apple's CDN are exempt because they arrive
  // without cookies.
  const GATE_COOKIE = 'hac_gate';
  const gateHash =
    process.env.SITE_GATE_PASSWORD_HASH ||
    '7d93884ca2bb3700085c9ba2892bd9fce9c119ac7a9d7555f4e44230137d6c38';
  const GATE_HOSTS = new Set([
    'app.haveanothercherry.com',
    `have-another-cherry--${PROJECT_ID}.us-east4.hosted.app`,
  ]);
  const GATE_EXEMPT_PATHS = new Set([
    '/api/revenuecat-webhook',
    '/api/apple-notifications',
    '/.well-known/apple-app-site-association',
    '/apple-app-site-association',
    '/firebase-messaging-sw.js',
    '/api/apple-purchase-notifications',
    '/api/recaptcha-health',
    '/api/beta-signup',
    '/cherry2transparent.png',
    '/icon.svg',
    '/favicon.ico',
  ]);
  const sha256Hex = (value: string) => createHash('sha256').update(value).digest('hex');

  const gatePage = (wrongPassword: boolean) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Have Another Cherry</title>
<meta name="robots" content="noindex">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&family=Lora:wght@600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
  * { box-sizing: border-box; margin: 0; }
  body { min-height: 100vh; display: flex; align-items: center; justify-content: center;
    background:
      radial-gradient(60% 45% at 78% 0%, rgba(196,18,0,.08), transparent 60%),
      radial-gradient(45% 35% at 2% 22%, rgba(196,18,0,.04), transparent 60%),
      #F4F4F5;
    background-repeat: no-repeat;
    color: #18181B; font-family: Inter, Helvetica, Arial, sans-serif; padding: 24px; }
  .card { background: #FFFFFF; border: 1px solid #D4D4D8; border-radius: 22px; padding: 40px 36px;
    max-width: 400px; width: 100%; text-align: center; box-shadow: 0 10px 30px -12px rgba(24,24,27,.18); }
  img { width: 64px; height: 64px; object-fit: contain; margin: 0 auto 16px; display: block; }
  h1 { font-family: Lora, Georgia, serif; font-weight: 600; font-size: 24px; margin-bottom: 8px; }
  p { color: #52525B; font-size: 14px; line-height: 1.6; margin-bottom: 20px; }
  input { width: 100%; padding: 12px 14px; border: 1px solid #D4D4D8; border-radius: 12px;
    font-size: 15px; font-family: inherit; outline: none; margin-bottom: 12px; }
  input:focus { border-color: #C41200; }
  button { width: 100%; padding: 12px 22px; background: #C41200; color: #FFFFFF; border: 0;
    border-radius: 999px; font-size: 14px; font-weight: 500; letter-spacing: -0.01em;
    font-family: 'JetBrains Mono', ui-monospace, monospace; cursor: pointer;
    box-shadow: 0 6px 16px -8px rgba(196,18,0,.7); }
  button:hover { background: #A00E00; }
  .err { color: #C41200; font-size: 13px; font-weight: 600; margin-bottom: 12px; }
  .foot { margin-top: 18px; font-size: 12px; color: #A1A1AA; }
  .foot a { color: #C41200; }
</style>
</head>
<body>
  <div class="card">
    <img src="/cherry2transparent.png" alt="Have Another Cherry">
    <h1>You're early. Sweet.</h1>
    <p>Have Another Cherry isn't open to everyone just yet. If you have the site password, come on in.</p>
    ${wrongPassword ? '<p class="err">That password is not correct. Try again.</p>' : ''}
    <form method="POST" action="/gate/unlock">
      <input type="password" name="password" placeholder="Site password" autofocus required autocomplete="current-password">
      <button type="submit">Come on in</button>
    </form>
    <p class="foot">Don't have a password yet? We'd love to have you: <a href="https://www.haveanothercherry.com">get on the list</a>.</p>
  </div>
</body>
</html>`;

  app.use((req, res, next) => {
    if (process.env.SITE_GATE_ENABLED !== '1') return next();
    const host = String(req.headers.host || '')
      .split(':')[0]
      .toLowerCase();
    if (!GATE_HOSTS.has(host)) return next();
    if (GATE_EXEMPT_PATHS.has(req.path)) return next();
    // The Firebase sign-in popup and iframe load /__/auth/* on our domain.
    if (req.path.startsWith('/__/')) return next();

    const cookieHeader = req.headers.cookie || '';
    const cookie = cookieHeader
      .split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${GATE_COOKIE}=`));
    const cookieValue = cookie ? decodeURIComponent(cookie.slice(GATE_COOKIE.length + 1)) : '';
    if (safeEqual(cookieValue, gateHash)) return next();

    if (req.method === 'POST' && req.path === '/gate/unlock') {
      const password = String((req.body as any)?.password ?? '');
      if (password && safeEqual(sha256Hex(password), gateHash)) {
        res.setHeader(
          'Set-Cookie',
          `${GATE_COOKIE}=${gateHash}; Path=/; Max-Age=31536000; HttpOnly; Secure; SameSite=Lax`
        );
        return res.redirect(303, '/');
      }
      return res.status(401).send(gatePage(true));
    }

    return res.status(401).send(gatePage(false));
  });

  // ---- Firebase auth helper proxy ----
  // With authDomain set to our own domain the sign-in popup opens
  // /__/auth/handler here. Firebase Hosting serves those pages itself; App
  // Hosting does not, so proxy the reserved namespace to the project domain.
  app.use('/__/auth', async (req, res) => {
    try {
      const upstreamOrigin = `https://${PROJECT_ID}.firebaseapp.com`;
      const upstream = await fetch(upstreamOrigin + req.originalUrl, {
        method: req.method,
        headers: { accept: String(req.headers.accept || '*/*') },
      });
      res.status(upstream.status);
      upstream.headers.forEach((value, key) => {
        if (
          !['content-encoding', 'transfer-encoding', 'content-length', 'connection'].includes(key)
        ) {
          res.setHeader(key, value);
        }
      });
      res.send(Buffer.from(await upstream.arrayBuffer()));
    } catch (err: any) {
      console.error('Auth handler proxy error:', err.message);
      res.status(502).send('Auth handler unavailable. Please try again.');
    }
  });

  // ---- Routes ----
  app.use(authRoutes);
  app.use(invitesRoutes);
  app.use(aiRoutes);
  app.use(billingRoutes);
  app.use(notificationsRoutes);
  app.use(supportRoutes);

  // ---- Well-known files, service worker, favicon ----
  // Apple fetches this to verify the domain and app belong together, which
  // unlocks universal links and shared password autofill. APPLE_TEAM_ID is a
  // plain env var; until it is set the route 404s, which Apple reads as "not
  // associated". Universal links cover only /expense/* so auth action links
  // keep opening in the browser, where the handler pages live.
  app.get(
    ['/.well-known/apple-app-site-association', '/apple-app-site-association'],
    (_req, res) => {
      const teamId = process.env.APPLE_TEAM_ID;
      if (!teamId) return res.status(404).json({ error: 'Not configured yet' });
      const appId = `${teamId}.com.situatedstrategies.haveAnotherCherry`;
      res.setHeader('Content-Type', 'application/json');
      return res.status(200).json({
        applinks: {
          details: [{ appIDs: [appId], components: [{ '/': '/expense/*' }] }],
        },
        webcredentials: { apps: [appId] },
      });
    }
  );

  // ---- Service worker and favicon ----
  // Browsers request /favicon.ico unasked; without this the SPA catch-all
  // answers with index.html.
  app.get('/favicon.ico', (_req, res) => {
    res.redirect(301, '/favicon-32.png');
  });

  // Registered by FCM's web SDK to show notifications while the tab is in
  // the background. Served dynamically so the Firebase config lives in one
  // place; only public identifiers are embedded.
  app.get('/firebase-messaging-sw.js', (_req, res) => {
    const cfg = firebaseConfig;
    res.setHeader('Content-Type', 'application/javascript');
    res.setHeader('Cache-Control', 'no-cache');
    res.send(
      `importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js");\n` +
        `importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js");\n` +
        `firebase.initializeApp(${JSON.stringify({
          apiKey: cfg.apiKey,
          authDomain: cfg.authDomain,
          projectId: cfg.projectId,
          messagingSenderId: cfg.messagingSenderId,
          appId: cfg.appId,
        })});\n` +
        // Instantiating messaging wires the background handler.
        `firebase.messaging();\n`
    );
  });

  // ---- Static serving ----
  // Unknown API routes get a JSON 404 rather than the SPA HTML.
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(
      express.static(distPath, {
        setHeaders: (res, filePath) => {
          if (filePath.endsWith('index.html')) {
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
          } else if (filePath.includes(`${path.sep}assets${path.sep}`)) {
            // Only Vite's content-hashed bundles are safe to cache forever.
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          } else {
            // Un-hashed public/ files keep their names across deploys.
            res.setHeader('Cache-Control', 'public, max-age=3600, must-revalidate');
          }
        },
      })
    );
    app.get('*', (_req, res) => {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Anything thrown outside a route's own try/catch. Client errors raised by
  // the body parser (malformed JSON, a payload over the limit) keep their
  // 4xx status; everything else is a 500. Always JSON, never a stack page.
  app.use((err: any, _req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (res.headersSent) return next(err);
    console.error('Unhandled error:', err?.message || err);
    const status =
      typeof err?.status === 'number' && err.status >= 400 && err.status < 600 ? err.status : 500;
    res.status(status).json({ error: 'Something went wrong' });
  });

  app.listen(PORT, '0.0.0.0', () => {
    console.log('Server running on http://localhost:' + PORT);
  });
}

startServer().catch((e) => {
  console.error('Fatal startup error:', e);
  process.exit(1);
});
