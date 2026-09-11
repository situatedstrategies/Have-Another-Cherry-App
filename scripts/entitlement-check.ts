import { hasPlus } from '../src/lib/entitlements';

const far = new Date(Date.now() + 86400000 * 30).toISOString();
const past = new Date(Date.now() - 86400000).toISOString();
let bad = 0;
const check = (name: string, got: unknown, want: unknown) => {
  const ok = got === want;
  if (!ok) bad++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name} (got ${got})`);
};

// Lifetime: the webhook omits expiresAt entirely for a non-renewing purchase,
// because RevenueCat sends no expiration_at_ms for one.
check(
  'lifetime unlocks, with no expiry recorded',
  hasPlus({
    isPlus: true,
    plusEntitlement: { source: 'revenuecat_ios', productId: 'hac_lifetime00', updatedAt: past },
  } as any),
  true
);
check(
  'lifetime still unlocks a decade on',
  hasPlus({
    isPlus: true,
    plusEntitlement: {
      source: 'revenuecat_ios',
      productId: 'hac_lifetime00',
      updatedAt: '2016-01-01T00:00:00.000Z',
    },
  } as any),
  true
);
check(
  'lifetime bought on the web unlocks the same way',
  hasPlus({
    isPlus: true,
    plusEntitlement: { source: 'revenuecat_stripe', productId: 'hac_lifetime00', updatedAt: past },
  } as any),
  true
);

// Subscriptions.
check(
  'an active subscription unlocks',
  hasPlus({
    isPlus: true,
    plusEntitlement: { source: 'revenuecat_ios', expiresAt: far, updatedAt: past },
  } as any),
  true
);
check(
  'cancelled but not yet expired still unlocks (they paid for the period)',
  hasPlus({
    isPlus: true,
    plusEntitlement: { source: 'revenuecat_ios', expiresAt: far, updatedAt: past },
  } as any),
  true
);
check(
  'past the expiry it locks, even if the webhook never landed',
  hasPlus({
    isPlus: true,
    plusEntitlement: { source: 'revenuecat_ios', expiresAt: past, updatedAt: past },
  } as any),
  false
);
check(
  'EXPIRATION webhook having cleared the flag locks it',
  hasPlus({ isPlus: false } as any),
  false
);
check('no entitlement at all locks it', hasPlus({} as any), false);

console.log(bad ? `\n${bad} FAILURES` : '\nall entitlement rules hold');
