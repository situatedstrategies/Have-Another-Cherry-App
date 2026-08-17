import { sanitizeContinueUrl, describeCodeError } from '../src/lib/authAction';
import { isPasswordValid, checkPassword } from '../src/lib/password';

const ORIGIN = 'https://app.haveanothercherry.com';
let fails = 0;

function eq(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : `\n        got=${JSON.stringify(actual)} want=${JSON.stringify(expected)}`}`);
}

console.log('--- continueUrl sanitizer (open-redirect defence) ---');
eq('absent', sanitizeContinueUrl(null, ORIGIN), null);
eq('empty', sanitizeContinueUrl('', ORIGIN), null);
eq('same-origin absolute', sanitizeContinueUrl(`${ORIGIN}/dashboard`, ORIGIN), `${ORIGIN}/dashboard`);
eq('relative path', sanitizeContinueUrl('/dashboard?x=1', ORIGIN), `${ORIGIN}/dashboard?x=1`);
eq('allowlisted apex', sanitizeContinueUrl('https://haveanothercherry.com/welcome', ORIGIN), 'https://haveanothercherry.com/welcome');
eq('foreign host BLOCKED', sanitizeContinueUrl('https://evil.example.com/pwn', ORIGIN), null);
eq('javascript: BLOCKED', sanitizeContinueUrl('javascript:alert(1)', ORIGIN), null);
eq('data: BLOCKED', sanitizeContinueUrl('data:text/html,<script>alert(1)</script>', ORIGIN), null);
eq('protocol-relative BLOCKED', sanitizeContinueUrl('//evil.example.com/pwn', ORIGIN), null);
eq('userinfo spoof BLOCKED', sanitizeContinueUrl('https://app.haveanothercherry.com@evil.example.com/', ORIGIN), null);
eq('suffix spoof BLOCKED', sanitizeContinueUrl('https://haveanothercherry.com.evil.example.com/', ORIGIN), null);
eq('subdomain not allowlisted BLOCKED', sanitizeContinueUrl('https://beta.haveanothercherry.com/x', ORIGIN), null);
// Garbage resolves as a relative path against our own origin, so it stays
// same-origin. Harmless, and not a redirect off the site.
eq('garbage stays same-origin', sanitizeContinueUrl('ht!tp://[[[', ORIGIN)?.startsWith(ORIGIN + '/'), true);

console.log('\n--- firebase error mapping (never leak a raw code) ---');
const codes = [
  'auth/expired-action-code',
  'auth/invalid-action-code',
  'auth/user-disabled',
  'auth/user-not-found',
  'auth/weak-password',
  'auth/network-request-failed',
  'auth/too-many-requests',
  'auth/some-code-we-never-saw',
];
for (const code of codes) {
  const msg = describeCodeError({ code });
  const leaks = /auth\//.test(msg);
  if (leaks) fails++;
  console.log(`${leaks ? 'FAIL' : 'PASS'}  ${code.padEnd(32)} -> ${msg.slice(0, 68)}`);
}
eq('non-error input still friendly', /auth\//.test(describeCodeError('boom')), false);
eq('undefined input still friendly', /auth\//.test(describeCodeError(undefined)), false);

console.log('\n--- password policy parity with signup ---');
eq('too short', isPasswordValid('Ab1!'), false);
eq('no special', isPasswordValid('Abcdefg1'), false);
eq('no number', isPasswordValid('Abcdefg!'), false);
eq('no letter', isPasswordValid('12345678!'), false);
eq('valid', isPasswordValid('Abcdefg1!'), true);
eq('checks shape', checkPassword('Abcdefg1!'), { length: true, letter: true, number: true, special: true });

console.log(fails === 0 ? '\nALL PASSED' : `\n${fails} FAILURES`);
process.exit(fails === 0 ? 0 : 1);
