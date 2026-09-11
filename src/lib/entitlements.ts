// Cherry + entitlements. The mobile apps sell the "plus" entitlement through
// RevenueCat with appUserID = Firebase uid; the webhook (/api/revenuecat-webhook)
// mirrors it onto users/{uid} as { isPlus, plusEntitlement }, and every client
// reads it through hasPlus(). Nothing else may check isPlus directly.

// Keep in sync with the store copy and haveanothercherry.com/features.html.
export const PLUS_FEATURES = [
  'dark_cherry',
  'vault',
  'thresholds',
  'rhythm',
  'insights', // Insights & monthly trends
  'backup', // Backups & export (BackupModal)
  'mismatch', // Payment-mismatch detection surfaces
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
