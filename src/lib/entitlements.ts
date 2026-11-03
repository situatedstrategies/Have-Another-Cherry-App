// Cherry + entitlements. Since November 2026 every feature is free and the
// entitlement means one thing: no ads. The apps and the web sell it through
// RevenueCat with appUserID = Firebase uid; the webhook (/api/revenuecat-webhook)
// mirrors it onto users/{uid} as { isPlus, plusEntitlement }, and every client
// reads it through hasPlus(). Nothing else may check isPlus directly.

// Historical list of what Cherry + used to gate; nothing checks it any more.
export const PLUS_FEATURES = [
  'dark_cherry',
  'vault',
  'thresholds',
  'rhythm',
  'insights', // Insights & monthly trends
  'backup', // Backups & export (BackupModal)
  'mismatch', // Payment-mismatch detection surfaces
  'forecast', // My month ahead (MonthAheadCard, lib/forecast)
  'carrying', // Who's carrying what (CarryingCard, lib/carrying)
] as const;
export type PlusFeature = (typeof PLUS_FEATURES)[number];

export interface PlusEntitlement {
  source: 'revenuecat_ios' | 'revenuecat_android' | 'revenuecat_web' | 'promo';
  productId?: string;
  /** ISO datetime; absent = non-expiring (e.g. promo). */
  expiresAt?: string;
  updatedAt: string;
}

// Expiry is enforced here too, so a lapsed subscription degrades even if a webhook was missed.
export function hasPlus(profile: any): boolean {
  if (!profile?.isPlus) return false;
  const expiresAt = profile?.plusEntitlement?.expiresAt;
  if (expiresAt && new Date(expiresAt).getTime() < Date.now()) return false;
  return true;
}
