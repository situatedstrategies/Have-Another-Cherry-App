// End-to-end test of /auth/action against the Firebase Auth emulator, driving
// the REAL built bundle. No app code is modified: the browser's calls to
// identitytoolkit.googleapis.com are rerouted to the emulator at the network
// layer, so what runs is exactly what ships.
//
// It uses genuine oobCodes minted by the emulator, so the reset, verify and
// recover flows are exercised for real - including asserting against Firebase
// afterwards that the password actually changed and emailVerified actually
// flipped, rather than trusting the success screen.
//
// Running it (needs Java for the emulator, and playwright installed):
//
//   npx firebase-tools emulators:start --only auth \
//     --project have-another-cherry-beta --config test/emulator.firebase.json
//   VITE_APP_ENV=beta npm run build
//   NODE_ENV=production PORT=3111 node dist/server.cjs
//   node test/auth-action.e2e.mjs
//
// Pure-logic assertions (open-redirect defence, error mapping, password policy)
// need none of that scaffolding: npx tsx test/auth-action.logic.ts
import { chromium } from 'playwright';

const APP = 'http://localhost:3111';
const EMU = 'http://127.0.0.1:9099';
const PROJ = 'have-another-cherry-beta';
const KEY = 'fake-api-key';

let fails = 0;
const check = (label, ok, detail = '') => {
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok || !detail ? '' : `\n        ${detail}`}`);
};

const api = async (path, body) => {
  const r = await fetch(`${EMU}/identitytoolkit.googleapis.com/v1/${path}?key=${KEY}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  return { status: r.status, json: await r.json().catch(() => ({})) };
};
const oobCodes = async () => (await (await fetch(`${EMU}/emulator/v1/projects/${PROJ}/oobCodes`)).json()).oobCodes;
const getUser = async (email) => {
  const r = await fetch(`${EMU}/identitytoolkit.googleapis.com/v1/projects/${PROJ}/accounts:query`, {
    method: 'POST', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' }, body: '{}',
  });
  const j = await r.json().catch(() => ({}));
  return (j.userInfo || []).find((u) => u.email === email);
};

// CHROMIUM_PATH lets a sandboxed environment point at a preinstalled browser;
// otherwise Playwright picks its own.
const browser = await chromium.launch({
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
  args: ['--no-sandbox'],
});
const ctx = await browser.newContext();

// Reroute Google Identity traffic to the emulator.
for (const host of ['identitytoolkit.googleapis.com', 'securetoken.googleapis.com']) {
  await ctx.route(`https://${host}/**`, async (route) => {
    const req = route.request();
    const cors = {
      'access-control-allow-origin': '*',
      'access-control-allow-headers': '*',
      'access-control-allow-methods': 'POST,GET,OPTIONS',
    };
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors, body: '' });
    const u = new URL(req.url());
    const res = await fetch(`${EMU}/${host}${u.pathname}${u.search}`, {
      method: req.method(),
      headers: { 'Content-Type': 'application/json' },
      body: req.postData() || undefined,
    });
    await route.fulfill({
      status: res.status, headers: { ...cors, 'content-type': 'application/json' },
      body: await res.text(),
    });
  });
}

const open = async (query) => {
  const page = await ctx.newPage();
  const logs = [];
  page.on('console', (m) => logs.push(m.text()));
  page.on('pageerror', (e) => logs.push('PAGEERROR: ' + e.message));
  await page.goto(`${APP}/auth/action?${query}`, { waitUntil: 'domcontentloaded' });
  return { page, logs, text: async () => (await page.locator('#root').innerText()).replace(/\s+/g, ' ').trim() };
};

const EMAIL = 'tester@example.com';
const OLD_PW = 'OldPassw0rd!';
const NEW_PW = 'BrandNewPw9$';

// Clean slate so the run is repeatable and assertions are not vacuous.
await fetch(`${EMU}/emulator/v1/projects/${PROJ}/accounts`, { method: 'DELETE' });
await api('accounts:signUp', { email: EMAIL, password: OLD_PW, returnSecureToken: true });

// ---------------------------------------------------------------- reset flow
console.log('=== 1. valid resetPassword: real code, real form ===');
await api('accounts:sendOobCode', { requestType: 'PASSWORD_RESET', email: EMAIL });
let code = (await oobCodes()).filter((c) => c.requestType === 'PASSWORD_RESET').pop().oobCode;

let { page, logs, text } = await open(`mode=resetPassword&oobCode=${code}`);
await page.waitForSelector('input[type=password]', { timeout: 15000 });
let t = await text();
check('form renders and shows the account email', t.includes(EMAIL), t.slice(0, 200));
check('oobCode never printed to console', !logs.some((l) => l.includes(code)));

console.log('\n=== 2. weak password rejected ===');
const pw = page.locator('input[type=password]').first();
const cf = page.locator('input[type=password]').nth(1);
const submit = page.getByRole('button', { name: /set new password/i });
await pw.fill('abc');
await cf.fill('abc');
check('submit disabled for weak password', await submit.isDisabled());
t = await text();
check('checklist shows unmet requirements', t.includes('At least 8 characters'));

console.log('\n=== 3. mismatched confirmation rejected ===');
await pw.fill(NEW_PW);
await cf.fill(NEW_PW + 'x');
check('submit disabled on mismatch', await submit.isDisabled());

console.log('\n=== 4. valid password accepted ===');
await cf.fill(NEW_PW);
check('submit enabled for valid matching password', await submit.isEnabled());
await submit.click();
await page.waitForTimeout(2500);
t = await text();
check('success screen shown', /password updated/i.test(t), t.slice(0, 200));
check('no raw firebase code on screen', !/auth\/[a-z-]+/.test(t));

console.log('\n=== 5. the password actually changed in Firebase ===');
const withNew = await api('accounts:signInWithPassword', { email: EMAIL, password: NEW_PW, returnSecureToken: true });
check('sign-in with NEW password succeeds', withNew.status === 200 && !!withNew.json.idToken,
  JSON.stringify(withNew.json).slice(0, 160));
const withOld = await api('accounts:signInWithPassword', { email: EMAIL, password: OLD_PW, returnSecureToken: true });
check('sign-in with OLD password now fails', withOld.status !== 200,
  JSON.stringify(withOld.json).slice(0, 160));

console.log('\n=== 6. reusing the same code is refused ===');
({ page, logs, text } = await open(`mode=resetPassword&oobCode=${code}`));
await page.waitForTimeout(2500);
t = await text();
check('friendly "no longer valid" message', /no longer valid|already been used/i.test(t), t.slice(0, 220));
check('no raw firebase code on screen', !/auth\/[a-z-]+/.test(t));
check('offers a way to request a new link', /send a new link/i.test(t));

console.log('\n=== 7. verifyEmail with a real code ===');
// A fresh user: completing a password reset marks an address verified (the user
// proved inbox control), so EMAIL is already verified by this point.
const VEMAIL = 'verifyme@example.com';
const vSignUp = await api('accounts:signUp', { email: VEMAIL, password: OLD_PW, returnSecureToken: true });
await api('accounts:sendOobCode', { requestType: 'VERIFY_EMAIL', idToken: vSignUp.json.idToken });
const vcode = (await oobCodes()).filter((c) => c.requestType === 'VERIFY_EMAIL').pop().oobCode;
check('user starts unverified', (await getUser(VEMAIL))?.emailVerified !== true,
  JSON.stringify(await getUser(VEMAIL)));
({ page, logs, text } = await open(`mode=verifyEmail&oobCode=${vcode}`));
await page.waitForTimeout(2500);
t = await text();
check('verify success screen', /email verified/i.test(t), t.slice(0, 200));
check('emailVerified is now true in Firebase', (await getUser(VEMAIL))?.emailVerified === true);

console.log('\n=== 8. reusing a verifyEmail code is refused ===');
({ page, logs, text } = await open(`mode=verifyEmail&oobCode=${vcode}`));
await page.waitForTimeout(2500);
t = await text();
check('friendly failure, no raw code', /no longer valid|already been used|did not work/i.test(t) && !/auth\/[a-z-]+/.test(t), t.slice(0, 200));

console.log('\n=== 9. recoverEmail with a real code ===');
const si2 = await api('accounts:signInWithPassword', { email: EMAIL, password: NEW_PW, returnSecureToken: true });
const changed = await api('accounts:update', { idToken: si2.json.idToken, email: 'changed@example.com', returnSecureToken: true });
const rcodes = (await oobCodes()).filter((c) => c.requestType === 'RECOVER_EMAIL');
if (!rcodes.length) {
  console.log('SKIP  emulator produced no RECOVER_EMAIL code (update status ' + changed.status + ')');
} else {
  const rcode = rcodes.pop().oobCode;
  ({ page, logs, text } = await open(`mode=recoverEmail&oobCode=${rcode}`));
  await page.waitForTimeout(2500);
  t = await text();
  check('recover success screen', /restored/i.test(t), t.slice(0, 200));
  check('email rolled back in Firebase', !!(await getUser(EMAIL)), 'expected ' + EMAIL + ' to exist again');
}

console.log('\n=== 10. continueUrl is honoured only when safe ===');
await api('accounts:sendOobCode', { requestType: 'PASSWORD_RESET', email: (await getUser(EMAIL)) ? EMAIL : 'changed@example.com' });
const c2 = (await oobCodes()).filter((c) => c.requestType === 'PASSWORD_RESET').pop().oobCode;
({ page, logs, text } = await open(`mode=resetPassword&oobCode=${c2}&continueUrl=${encodeURIComponent('https://evil.example.com/pwn')}`));
await page.waitForSelector('input[type=password]', { timeout: 15000 });
await page.locator('input[type=password]').first().fill('AnotherPw7#');
await page.locator('input[type=password]').nth(1).fill('AnotherPw7#');
await page.getByRole('button', { name: /set new password/i }).click();
await page.waitForTimeout(2500);
const hrefs = await page.locator('#root a').evaluateAll((els) => els.map((e) => e.getAttribute('href')));
check('hostile continueUrl not rendered as a link', !hrefs.some((h) => (h || '').includes('evil.example.com')), JSON.stringify(hrefs));

console.log('\n=== 11. expired code (fault-injected: real SDK, forced EXPIRED_OOB_CODE) ===');
// Codes expire on a clock the emulator will not fast-forward, so force the
// server response Firebase sends for a stale code and let the real SDK map it.
const expiredCtx = await browser.newContext();
await expiredCtx.route('https://identitytoolkit.googleapis.com/**', async (route) => {
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST,GET,OPTIONS' };
  if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors, body: '' });
  await route.fulfill({
    status: 400, headers: { ...cors, 'content-type': 'application/json' },
    body: JSON.stringify({ error: { code: 400, message: 'EXPIRED_OOB_CODE', errors: [{ message: 'EXPIRED_OOB_CODE', domain: 'global', reason: 'invalid' }] } }),
  });
});
const ep = await expiredCtx.newPage();
const eLogs = [];
ep.on('console', (m) => eLogs.push(m.text()));
await ep.goto(`${APP}/auth/action?mode=resetPassword&oobCode=SOME_STALE_CODE`, { waitUntil: 'domcontentloaded' });
await ep.waitForTimeout(2500);
const et = (await ep.locator('#root').innerText()).replace(/\s+/g, ' ').trim();
check('expired code shows the "expired" wording', /expired/i.test(et), et.slice(0, 220));
check('no raw firebase code on screen', !/auth\/[a-z-]+/.test(et));
check('offers a way to request a new link', /send a new link/i.test(et));
check('stale code never printed to console', !eLogs.some((l) => l.includes('SOME_STALE_CODE')));

await browser.close();
console.log(fails === 0 ? '\nALL PASSED' : `\n${fails} FAILURES`);
process.exit(fails ? 1 : 0);
