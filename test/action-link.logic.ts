import { actionHandlerBase, retargetActionLink } from '../src/lib/actionLink';

let fails = 0;
function eq(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : `\n        got=${JSON.stringify(actual)}\n       want=${JSON.stringify(expected)}`}`);
}

const PROD_LINK =
  'https://gen-lang-client-0987674990.firebaseapp.com/__/auth/action?mode=resetPassword&oobCode=ABC123_xyz-code&apiKey=AIzaFAKE&lang=en';
const BETA_LINK =
  'https://have-another-cherry-beta.firebaseapp.com/__/auth/action?mode=verifyEmail&oobCode=BETA_code_99&apiKey=AIzaFAKE&lang=en';

console.log('--- which host does a request map to? ---');
eq('production host', actionHandlerBase({ host: 'app.haveanothercherry.com' }),
  'https://app.haveanothercherry.com/auth/action');
eq('beta host', actionHandlerBase({ host: 'beta.haveanothercherry.com' }),
  'https://beta.haveanothercherry.com/auth/action');
eq('behind a proxy (x-forwarded-host wins)',
  actionHandlerBase({ host: 'internal-run.a.run.app', 'x-forwarded-host': 'beta.haveanothercherry.com', 'x-forwarded-proto': 'https' }),
  'https://beta.haveanothercherry.com/auth/action');
eq('comma-joined forwarded headers take the first',
  actionHandlerBase({ 'x-forwarded-host': 'app.haveanothercherry.com, internal', 'x-forwarded-proto': 'https,http' }),
  'https://app.haveanothercherry.com/auth/action');
eq('localhost stays http', actionHandlerBase({ host: 'localhost:3000' }),
  'http://localhost:3000/auth/action');
eq('explicit override wins', actionHandlerBase({ host: 'anything' }, 'https://pinned.example.com/auth/action'),
  'https://pinned.example.com/auth/action');
eq('no host at all -> null', actionHandlerBase({}), null);

console.log('\n--- retargeting keeps every parameter ---');
const prodOut = retargetActionLink(PROD_LINK, 'https://app.haveanothercherry.com/auth/action');
eq('prod link moves to our page',
  prodOut,
  'https://app.haveanothercherry.com/auth/action?mode=resetPassword&oobCode=ABC123_xyz-code&apiKey=AIzaFAKE&lang=en');
eq('  mode survived', new URL(prodOut).searchParams.get('mode'), 'resetPassword');
eq('  oobCode survived intact', new URL(prodOut).searchParams.get('oobCode'), 'ABC123_xyz-code');

const betaOut = retargetActionLink(BETA_LINK, 'https://beta.haveanothercherry.com/auth/action');
eq('beta link stays on beta', new URL(betaOut).host, 'beta.haveanothercherry.com');
eq('  verifyEmail mode survived', new URL(betaOut).searchParams.get('mode'), 'verifyEmail');

console.log('\n--- the cross-environment mistake this exists to prevent ---');
eq('a beta link must never be retargeted onto the prod host by default',
  new URL(retargetActionLink(BETA_LINK, actionHandlerBase({ host: 'beta.haveanothercherry.com' }))).host,
  'beta.haveanothercherry.com');

console.log('\n--- never break the email ---');
eq('no base -> original untouched', retargetActionLink(PROD_LINK, null), PROD_LINK);
eq('malformed base -> original untouched', retargetActionLink(PROD_LINK, 'not a url'), PROD_LINK);
eq('malformed link -> returned as-is', retargetActionLink('not a url', 'https://app.haveanothercherry.com/auth/action'), 'not a url');
eq('link with no query -> left alone', retargetActionLink('https://x.firebaseapp.com/__/auth/action', 'https://app.haveanothercherry.com/auth/action'), 'https://x.firebaseapp.com/__/auth/action');

console.log(fails === 0 ? '\nALL PASSED' : `\n${fails} FAILURES`);
process.exit(fails ? 1 : 0);
