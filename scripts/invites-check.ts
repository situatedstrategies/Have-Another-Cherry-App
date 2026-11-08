// The invite link and message helpers (lib/invites) against the shared
// contract. Run with `npm run test:parity`.
import assert from 'node:assert/strict';
import '../src/i18n';
import { inviteLink, inviteMessage, mailtoHref, smsHref } from '../src/lib/inviteLinks';

assert.equal(inviteLink('AB12-CD34'), 'https://haveanothercherry.com/open/invite/AB12-CD34');
const msg = inviteMessage('Olivia', 'Our place', 'AB12CD');
assert.ok(
  msg.includes('https://haveanothercherry.com/open/invite/AB12CD'),
  'the message carries the link'
);
assert.ok(msg.includes('AB12CD'), 'and the code');
assert.ok(
  mailtoHref('Subject', 'Body text').startsWith('mailto:?subject=Subject&body=Body%20text')
);
assert.equal(smsHref('Hi there'), 'sms:?&body=Hi%20there');
console.log('invites-check: ok');
