// Cherry + entitlements.
//
// Cherry + will be sold as a subscription INSIDE the iOS/Android apps (via
// RevenueCat), not on the web. Those apps don't exist yet, so today nobody is
// entitled and every Cherry + surface opens the "this cherry tree is still
// growing" page instead of the feature.
//
// The full activation path, already plumbed end to end:
//   1. Mobile app signs the user into the same Firebase Auth account and
//      configures RevenueCat with `appUserID = firebase uid`.
//   2. User purchases the "plus" entitlement in the store.
//   3. RevenueCat calls our webhook (POST /api/revenuecat-webhook, see
//      server.ts) which writes the entitlement to users/{uid}:
//        { isPlus: true, plusEntitlement: { source, productId, expiresAt, updatedAt } }
//   4. Every client - web included - reads it off the profile through
//      hasPlus() below. Flipping isPlus is the ONLY thing the webhook has to
//      do for the whole app to unlock.
//
// Nothing else in the codebase may check isPlus directly: always go through
// this module so the entitlement source can change without a hunt.

// The features behind Cherry +. Keep in sync with the store product copy.
export const PLUS_FEATURES = ['dark_cherry', 'vault', 'thresholds', 'rhythm'] as const;
export type PlusFeature = (typeof PLUS_FEATURES)[number];

export interface PlusEntitlement {
  source: 'revenuecat_ios' | 'revenuecat_android' | 'promo';
  productId?: string;
  /** ISO datetime; absent = non-expiring (e.g. promo). */
  expiresAt?: string;
  updatedAt: string;
}

// Whether this profile is entitled to Cherry +. Expiry is enforced here too,
// so a lapsed subscription degrades even if a webhook was missed.
export function hasPlus(profile: any): boolean {
  if (!profile?.isPlus) return false;
  const expiresAt = profile?.plusEntitlement?.expiresAt;
  if (expiresAt && new Date(expiresAt).getTime() < Date.now()) return false;
  return true;
}
