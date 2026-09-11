import { actionHandlerBase, retargetActionLink } from '../server/actionLink';

let fails = 0;
function eq(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) fails++;
  console.log(
    `${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : `\n        got=${JSON.stringify(actual)}\n       want=${JSON.stringify(expected)}`}`
  );
}

const PROD_LINK =
  'https://gen-lang-client-0987674990.firebaseapp.com/__/auth/action?mode=resetPassword&oobCode=ABC123_xyz-code&apiKey=AIzaFAKE&lang=en';
const VERIFY_LINK =
  'https://gen-lang-client-0987674990.firebaseapp.com/__/auth/action?mode=verifyEmail&oobCode=VERIFY_code_99&apiKey=AIzaFAKE&lang=en';

console.log('--- which host does a request map to? ---');
eq(
  'production host',
  actionHandlerBase({ host: 'app.haveanothercherry.com' }),
  'https://app.haveanothercherry.com/auth/action'
);
eq(
  'raw App Hosting host is pinned to the public domain',
  actionHandlerBase({
    host: 'have-another-cherry--gen-lang-client-0987674990.us-east4.hosted.app',
  }),
  'https://app.haveanothercherry.com/auth/action'
);
eq(
  'a retired host is pinned to the public domain too',
  actionHandlerBase({ host: 'beta.haveanothercherry.com' }),
  'https://app.haveanothercherry.com/auth/action'
);
eq(
  'behind a proxy, still the public domain',
  actionHandlerBase({
    host: 'internal-run.a.run.app',
    'x-forwarded-host': 'have-another-cherry--gen-lang-client-0987674990.us-east4.hosted.app',
    'x-forwarded-proto': 'https',
  }),
  'https://app.haveanothercherry.com/auth/action'
);
eq(
  'comma-joined forwarded headers take the first',
  actionHandlerBase({
    'x-forwarded-host': 'app.haveanothercherry.com, internal',
    'x-forwarded-proto': 'https,http',
  }),
  'https://app.haveanothercherry.com/auth/action'
);
eq(
  'localhost stays http',
  actionHandlerBase({ host: 'localhost:3000' }),
  'http://localhost:3000/auth/action'
);
eq(
  'explicit override wins',
  actionHandlerBase({ host: 'anything' }, 'https://pinned.example.com/auth/action'),
  'https://pinned.example.com/auth/action'
);
eq(
  'no host at all -> the public domain',
  actionHandlerBase({}),
  'https://app.haveanothercherry.com/auth/action'
);

console.log('\n--- retargeting keeps every parameter ---');
const prodOut = retargetActionLink(PROD_LINK, 'https://app.haveanothercherry.com/auth/action');
eq(
  'prod link moves to our page',
  prodOut,
  'https://app.haveanothercherry.com/auth/action?mode=resetPassword&oobCode=ABC123_xyz-code&apiKey=AIzaFAKE&lang=en'
);
eq('  mode survived', new URL(prodOut).searchParams.get('mode'), 'resetPassword');
eq('  oobCode survived intact', new URL(prodOut).searchParams.get('oobCode'), 'ABC123_xyz-code');

const verifyOut = retargetActionLink(
  VERIFY_LINK,
  'https://have-another-cherry--gen-lang-client-0987674990.us-east4.hosted.app/auth/action'
);
eq(
  'a link answered on the raw host stays on that host',
  new URL(verifyOut).host,
  'have-another-cherry--gen-lang-client-0987674990.us-east4.hosted.app'
);
eq('  verifyEmail mode survived', new URL(verifyOut).searchParams.get('mode'), 'verifyEmail');

console.log('\n--- the mistake this exists to prevent: a link that dies with its host ---');
eq(
  'a link minted through the raw host still lands on the public domain',
  new URL(
    retargetActionLink(
      VERIFY_LINK,
      actionHandlerBase({
        host: 'have-another-cherry--gen-lang-client-0987674990.us-east4.hosted.app',
      })
    )
  ).host,
  'app.haveanothercherry.com'
);
eq(
  'a link minted through a retired host still lands on the public domain',
  new URL(retargetActionLink(PROD_LINK, actionHandlerBase({ host: 'beta.haveanothercherry.com' })))
    .host,
  'app.haveanothercherry.com'
);

console.log('\n--- never break the email ---');
eq('no base -> original untouched', retargetActionLink(PROD_LINK, null), PROD_LINK);
eq('malformed base -> original untouched', retargetActionLink(PROD_LINK, 'not a url'), PROD_LINK);
eq(
  'malformed link -> returned as-is',
  retargetActionLink('not a url', 'https://app.haveanothercherry.com/auth/action'),
  'not a url'
);
eq(
  'link with no query -> left alone',
  retargetActionLink(
    'https://x.firebaseapp.com/__/auth/action',
    'https://app.haveanothercherry.com/auth/action'
  ),
  'https://x.firebaseapp.com/__/auth/action'
);

console.log(fails === 0 ? '\nALL PASSED' : `\n${fails} FAILURES`);
process.exit(fails ? 1 : 0);
