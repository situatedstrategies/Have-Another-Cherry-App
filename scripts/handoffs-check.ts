// The payment handoff registry (lib/handoffs) against the shared contract in
// docs/REBUILD_PLAN.md section 11 of the mobile repo: the ids, their regions,
// the bank picker ids, and how a settlement records each one. Run with
// `npm run test:parity`; the Flutter repo has the same checks.
import assert from 'node:assert/strict';
import {
  BANKS,
  BANK_IDS,
  HANDOFFS,
  HANDOFF_IDS,
  banksFor,
  buildHandoffTarget,
  displayHandle,
  handoffForInstrument,
  handoffsForRegion,
  instrumentForHandoff,
  isImmediateHandoffCode,
  normalizeRegion,
} from '../src/lib/handoffs';

assert.deepEqual(
  [...HANDOFF_IDS],
  [
    'venmo',
    'zelle',
    'cashapp',
    'paypal',
    'sbp',
    'bizum',
    'spei',
    'mercadopago',
    'modo',
    'nequi',
    'daviplata',
    'bancolombia',
    'yape',
    'plin',
    'mach',
    'tenpo',
    'bank_transfer',
    'cash',
    'other',
  ],
  'handoff ids match the contract, in order'
);
assert.equal(BANK_IDS.length, 24, 'twenty three banks plus other_bank');

for (const id of HANDOFF_IDS) {
  assert.equal(HANDOFFS[id].id, id);
  assert.ok(HANDOFFS[id].regions.length > 0, `${id} has regions`);
  assert.equal(handoffForInstrument(instrumentForHandoff(id)), id, `${id} round-trips`);
}
assert.equal(instrumentForHandoff('venmo'), 'VENMO', 'venmo keeps the ledger code');
assert.equal(instrumentForHandoff('zelle'), 'ZELLE');
assert.equal(instrumentForHandoff('cash'), 'CASH');
assert.equal(instrumentForHandoff('bank_transfer'), 'TRANSFER');
assert.equal(instrumentForHandoff('other'), 'OTHER');
assert.equal(
  instrumentForHandoff('bizum'),
  'BIZUM',
  'other handoffs are stored as their id, upper case'
);
assert.equal(instrumentForHandoff('mercadopago'), 'MERCADOPAGO');
assert.equal(handoffForInstrument('bizum'), 'bizum', 'reading is case-insensitive');
assert.equal(handoffForInstrument('Sbp'), 'sbp');
assert.equal(handoffForInstrument('TRANSFER'), 'bank_transfer');
assert.equal(handoffForInstrument('CREDIT'), 'other', 'a card reads as other');
assert.equal(handoffForInstrument('DEBIT'), 'other');
assert.equal(handoffForInstrument('nonsense'), 'other', 'an unknown code reads as other');
assert.equal(handoffForInstrument(undefined), 'other');
assert.equal(isImmediateHandoffCode('SBP'), true);
assert.equal(isImmediateHandoffCode('paypal'), true);
assert.equal(isImmediateHandoffCode('CASH'), false);
assert.equal(isImmediateHandoffCode('OTHER'), false);
assert.equal(isImmediateHandoffCode('CREDIT'), false);

assert.deepEqual(handoffsForRegion('us').slice(0, 4), ['venmo', 'zelle', 'cashapp', 'paypal']);
assert.deepEqual(handoffsForRegion('RU'), ['sbp', 'bank_transfer', 'cash', 'other']);
assert.deepEqual(handoffsForRegion('ES'), ['paypal', 'bizum', 'bank_transfer', 'cash', 'other']);
assert.deepEqual(handoffsForRegion('MX'), [
  'paypal',
  'spei',
  'mercadopago',
  'bank_transfer',
  'cash',
  'other',
]);
assert.deepEqual(handoffsForRegion('AR'), [
  'paypal',
  'mercadopago',
  'modo',
  'bank_transfer',
  'cash',
  'other',
]);
assert.deepEqual(handoffsForRegion('CO'), [
  'paypal',
  'mercadopago',
  'nequi',
  'daviplata',
  'bancolombia',
  'bank_transfer',
  'cash',
  'other',
]);
assert.deepEqual(handoffsForRegion('PE'), [
  'paypal',
  'mercadopago',
  'yape',
  'plin',
  'bank_transfer',
  'cash',
  'other',
]);
assert.deepEqual(handoffsForRegion('CL'), [
  'paypal',
  'mercadopago',
  'mach',
  'tenpo',
  'bank_transfer',
  'cash',
  'other',
]);
assert.deepEqual(
  handoffsForRegion('FR'),
  ['bank_transfer', 'cash', 'other'],
  'an unknown region gets the universal three'
);
assert.equal(normalizeRegion('mx'), 'MX');
assert.equal(normalizeRegion('Mexico'), 'US', 'a non alpha-2 value falls back');

assert.deepEqual(banksFor('zelle'), [
  'chase',
  'bofa',
  'wellsfargo',
  'capitalone',
  'citi',
  'usbank',
  'pnc',
  'truist',
  'other_bank',
]);
assert.deepEqual(banksFor('sbp'), ['sber', 'tbank', 'alfa', 'vtb', 'raiffeisen', 'other_bank']);
assert.deepEqual(banksFor('bizum'), [
  'caixabank',
  'bbva',
  'santander',
  'sabadell',
  'ing',
  'openbank',
  'other_bank',
]);
assert.deepEqual(banksFor('spei'), ['bbva_mx', 'banorte', 'santander_mx', 'banamex', 'other_bank']);
assert.deepEqual(banksFor('venmo'), [], 'no bank picker for an app of its own');
for (const b of BANK_IDS) assert.equal(BANKS[b].id, b);

const venmo = buildHandoffTarget('venmo', '@robert', 12.5, 'Have Another Cherry: groceries');
assert.ok(venmo.prefilled);
assert.ok(
  venmo.fallbackUrl.includes('recipients=robert') && venmo.fallbackUrl.includes('amount=12.50')
);
assert.equal(venmo.handle, '@robert');

const cashapp = buildHandoffTarget('cashapp', '$robert', 7, 'note');
assert.equal(cashapp.fallbackUrl, 'https://cash.app/$robert/7.00');
assert.equal(displayHandle('cashapp', 'robert'), '$robert');

const paypal = buildHandoffTarget('paypal', 'robert', 20, 'note');
assert.equal(paypal.fallbackUrl, 'https://paypal.me/robert/20.00');

const zelleNoBank = buildHandoffTarget('zelle', '555 0100', 10, 'note', null);
assert.equal(zelleNoBank.prefilled, false);
assert.deepEqual(zelleNoBank.appUrls, [], 'no bank chosen, nothing to try');
assert.equal(zelleNoBank.fallbackUrl, 'https://www.zellepay.com/');
assert.equal(zelleNoBank.copyText, '555 0100', 'the handle goes on the clipboard');

const zelleChase = buildHandoffTarget('zelle', '555 0100', 10, 'note', 'chase');
assert.deepEqual(zelleChase.appUrls, ['chase://']);
assert.equal(zelleChase.fallbackUrl, 'https://www.chase.com/');
assert.equal(zelleChase.bank, 'chase');

const sbpWrongBank = buildHandoffTarget('sbp', '+7 900 000 00 00', 10, 'note', 'chase');
assert.deepEqual(sbpWrongBank.appUrls, [], "a bank from another handoff's list is ignored");

const sber = buildHandoffTarget('sbp', '+7 900 000 00 00', 10, 'note', 'sber');
assert.deepEqual(sber.appUrls, ['sberbankonline://', 'sbolonline://']);

const mp = buildHandoffTarget('mercadopago', 'robert.mp', 10, 'note');
assert.deepEqual(
  mp.appUrls,
  ['mercadopago://home'],
  "the network's own scheme when there is no bank"
);

const cash = buildHandoffTarget('cash', undefined, 10, 'note');
assert.equal(cash.handle, '');
assert.equal(cash.fallbackUrl, '');

console.log('handoffs-check: ok');
