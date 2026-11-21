import {
  FUNNEL_LOGIN_PATH,
  buildFunnelCallback,
  isFunnelLoginPath,
  parseFunnelRequest,
} from '../src/lib/funnelLogin';

let fails = 0;

function eq(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) fails++;
  console.log(
    `${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : `\n        got=${JSON.stringify(actual)} want=${JSON.stringify(expected)}`}`
  );
}

const CALLBACK = 'https://signup.cat/funnel/callback';
const ENC = encodeURIComponent(CALLBACK);
const STATE = 'eyJub25jZSI6IjEyMyJ9';
const UID = 'aB3dEfGhIjKlMnOpQrStUvWxYz12';

const q = (redirect: string, state = STATE, extra = '') =>
  `?redirect_uri=${redirect}&state=${state}&app_user_id=%24RCAnonymousID%3Aabc${extra}`;

console.log('--- path match ---');
eq('exact path', isFunnelLoginPath(FUNNEL_LOGIN_PATH), true);
eq('trailing slash', isFunnelLoginPath('/funnel/login/'), true);
eq('root is not it', isFunnelLoginPath('/'), false);
eq('auth action is not it', isFunnelLoginPath('/auth/action'), false);
eq('prefix only is not it', isFunnelLoginPath('/funnel/login/extra'), false);

console.log('\n--- redirect_uri allowlist (uid must only go back to RevenueCat) ---');
eq('encoded signup.cat callback', parseFunnelRequest(q(ENC)), {
  callbackBase: CALLBACK,
  rawState: STATE,
});
eq('unencoded signup.cat callback', parseFunnelRequest(q(CALLBACK)), {
  callbackBase: CALLBACK,
  rawState: STATE,
});
eq('missing redirect_uri BLOCKED', parseFunnelRequest(`?state=${STATE}`), null);
eq('missing state BLOCKED', parseFunnelRequest(`?redirect_uri=${ENC}`), null);
eq('empty state BLOCKED', parseFunnelRequest(q(ENC, '')), null);
eq('no query at all BLOCKED', parseFunnelRequest(''), null);
eq(
  'foreign host BLOCKED',
  parseFunnelRequest(q(encodeURIComponent('https://evil.example.com/funnel/callback'))),
  null
);
eq(
  'suffix spoof BLOCKED',
  parseFunnelRequest(q(encodeURIComponent('https://signup.cat.evil.example.com/funnel/callback'))),
  null
);
eq(
  'subdomain BLOCKED',
  parseFunnelRequest(q(encodeURIComponent('https://x.signup.cat/funnel/callback'))),
  null
);
eq(
  'userinfo spoof BLOCKED',
  parseFunnelRequest(q(encodeURIComponent('https://signup.cat@evil.example.com/funnel/callback'))),
  null
);
eq(
  'http BLOCKED',
  parseFunnelRequest(q(encodeURIComponent('http://signup.cat/funnel/callback'))),
  null
);
eq(
  'custom port BLOCKED',
  parseFunnelRequest(q(encodeURIComponent('https://signup.cat:8443/funnel/callback'))),
  null
);
eq(
  'other path on signup.cat BLOCKED',
  parseFunnelRequest(q(encodeURIComponent('https://signup.cat/someone-elses-funnel'))),
  null
);
eq(
  'path traversal BLOCKED',
  parseFunnelRequest(q(encodeURIComponent('https://signup.cat/funnel/callback/../../x'))),
  null
);
eq('javascript: BLOCKED', parseFunnelRequest(q(encodeURIComponent('javascript:alert(1)'))), null);
eq('protocol-relative BLOCKED', parseFunnelRequest(q('//signup.cat/funnel/callback')), null);
eq('relative path BLOCKED', parseFunnelRequest(q('/funnel/callback')), null);
eq('malformed encoding BLOCKED', parseFunnelRequest(q('%E0%A4%A')), null);
eq('fragment BLOCKED', parseFunnelRequest(q(encodeURIComponent(`${CALLBACK}#x`))), null);
eq(
  'redirect already carrying state BLOCKED',
  parseFunnelRequest(q(encodeURIComponent(`${CALLBACK}?state=other`))),
  null
);
eq(
  'redirect already carrying app_user_id BLOCKED',
  parseFunnelRequest(q(encodeURIComponent(`${CALLBACK}?app_user_id=someone`))),
  null
);
eq('duplicate state BLOCKED', parseFunnelRequest(q(ENC, STATE, '&state=second')), null);
eq(
  'duplicate redirect_uri BLOCKED',
  parseFunnelRequest(q(ENC, STATE, `&redirect_uri=${ENC}`)),
  null
);
eq('oversized state BLOCKED', parseFunnelRequest(q(ENC, 'a'.repeat(4097))), null);
eq('state with a space BLOCKED', parseFunnelRequest(q(ENC, 'ab cd')), null);

console.log('\n--- state is echoed byte for byte ---');
// Standard base64 uses "+", "/" and "=". URLSearchParams would turn "+" into a
// space; the raw reader must not.
const B64 = 'ab+cd/ef==';
eq('plus, slash and padding survive', parseFunnelRequest(q(ENC, B64))?.rawState, B64);
const PCT = 'ab%2Bcd%3D';
eq('percent-encoding is not decoded', parseFunnelRequest(q(ENC, PCT))?.rawState, PCT);

console.log('\n--- callback URL ---');
const req = parseFunnelRequest(q(ENC, B64))!;
eq(
  'adds state then app_user_id',
  buildFunnelCallback(req, UID),
  `${CALLBACK}?state=${B64}&app_user_id=${UID}`
);
eq('no email or name is ever added', /email|name/.test(buildFunnelCallback(req, UID) || ''), false);
eq('empty uid gives nothing', buildFunnelCallback(req, ''), null);
eq('anonymous id is never returned', buildFunnelCallback(req, '$RCAnonymousID:abc'), null);
eq(
  'uid is encoded',
  buildFunnelCallback(req, 'a b&c'),
  `${CALLBACK}?state=${B64}&app_user_id=a%20b%26c`
);
const withQuery = parseFunnelRequest(q(encodeURIComponent(`${CALLBACK}?env=sandbox`)))!;
eq(
  'existing callback query is kept',
  buildFunnelCallback(withQuery, UID),
  `${CALLBACK}?env=sandbox&state=${STATE}&app_user_id=${UID}`
);

if (fails) {
  console.error(`\n${fails} FAILED`);
  process.exit(1);
}
console.log('\nAll funnel login checks passed.');
