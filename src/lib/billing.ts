// Cherry + web billing via RevenueCat Web Billing (@revenuecat/purchases-js).
//
// DORMANT BY DEFAULT. Production's stated position (see CherryPlusModal) is
// that Cherry + is bought in the iOS/Android apps and the web only reads the
// entitlement. This module exists so that selling on the web is a merge away,
// not a rebuild: nothing here runs unless a Web Billing key is present, and
// with no key every caller falls back to today's behavior.
//
// This module is the only place the app touches the purchases SDK - callers
// know about `plusOfferings`, `purchasePlus`, and `manageSubscriptionUrl`,
// never about RevenueCat types (same discipline as lib/entitlements.ts).
//
// How it fits the existing entitlement plumbing:
// - configure() keys the SDK to the FIREBASE UID (same rule as the mobile
//   apps), so RevenueCat's webhook -> /api/revenuecat-webhook -> writes
//   users/{uid}.isPlus, and hasPlus() unlocks every client.
// - purchase() opens RevenueCat's hosted checkout UI; on success the fresh
//   entitlement state comes back so the UI can unlock instantly instead of
//   waiting the webhook round-trip.
// - The "Customer Center" equivalent on web is the Web Billing customer
//   portal, reachable via CustomerInfo.managementURL.

import {
  Purchases,
  PurchasesError,
  ErrorCode,
  type Package,
  type CustomerInfo,
} from '@revenuecat/purchases-js';

// Must match the entitlement identifier in the RevenueCat dashboard. The
// server webhook is id-agnostic (it reacts to purchase/expiry events), but
// every client that reads CustomerInfo checks this exact id.
export const PLUS_ENTITLEMENT_ID = 'have_another_cherry';

// Public (publishable) Web Billing API key - safe to ship in the bundle by
// design, like the Firebase client config. Deliberately EMPTY by default:
// set VITE_RC_WEB_KEY (test_ for sandbox, the live key at launch) to turn
// web selling on.
const RAW_KEY: string = ((import.meta as any).env?.VITE_RC_WEB_KEY || '').trim();

// Only a key that looks like a key counts. RevenueCat issues `strp_` for a
// Stripe app, `rcb_` for Web Billing, and `test_` for sandbox; anything else
// is a placeholder, a typo, or a deliberate "off" switch.
//
// The deliberate case is why this is a prefix check rather than a truthiness
// check. App Hosting rejects `value: ""` outright and fails the rollout, so a
// backend that must not sell has to be switched off with a real string, and
// `off` has to mean off rather than "a key I do not recognise, configure with
// it anyway".
const VALID_KEY_PREFIXES = ['strp_', 'rcb_', 'test_'];
const API_KEY: string = VALID_KEY_PREFIXES.some((p) => RAW_KEY.startsWith(p))
  ? RAW_KEY
  : '';

export const isSandboxBilling = API_KEY.startsWith('test_');

/** Whether web billing is enabled for this build. */
export function billingAvailable(): boolean {
  return API_KEY.length > 0;
}

/**
 * Configure (or re-key) the SDK for the signed-in user. Call after Firebase
 * auth resolves. Never configure anonymously on purpose: an anonymous
 * purchase can't be mapped to users/{uid} by the webhook.
 */
export async function configureBilling(firebaseUid: string): Promise<void> {
  if (!billingAvailable() || !firebaseUid) return;
  if (Purchases.isConfigured()) {
    const shared = Purchases.getSharedInstance();
    if (shared.getAppUserId() !== firebaseUid) {
      await shared.changeUser(firebaseUid);
    }
    return;
  }
  Purchases.configure(API_KEY, firebaseUid);
}

export interface PlusPlan {
  /** RevenueCat package - pass back to purchasePlus. */
  pkg: Package;
  /** 'monthly' | 'yearly' | 'lifetime' | package identifier fallback. */
  key: string;
  title: string;
  /** Localized price string, e.g. "$3.99". */
  price: string;
}

const PLAN_ORDER = ['monthly', 'yearly', 'lifetime'];

function planKey(pkg: Package): string {
  const id = pkg.identifier.replace(/^\$rc_/, '').toLowerCase();
  if (id.includes('life')) return 'lifetime';
  if (id.includes('annual') || id.includes('year')) return 'yearly';
  if (id.includes('month')) return 'monthly';
  return id;
}

/** The current offering's plans, cheapest cadence first. Empty = not set up. */
export async function plusOfferings(): Promise<PlusPlan[]> {
  if (!Purchases.isConfigured()) return [];
  try {
    const offerings = await Purchases.getSharedInstance().getOfferings();
    const packages = offerings.current?.availablePackages ?? [];
    return packages
      .map((pkg) => ({
        pkg,
        key: planKey(pkg),
        title: pkg.webBillingProduct?.title || pkg.identifier,
        price: pkg.webBillingProduct?.currentPrice?.formattedPrice ?? '',
      }))
      .sort((a, b) => PLAN_ORDER.indexOf(a.key) - PLAN_ORDER.indexOf(b.key));
  } catch (e) {
    console.error('Could not load Cherry + offerings', e);
    return [];
  }
}

export type PurchaseOutcome =
  | { status: 'purchased'; customerInfo: CustomerInfo }
  | { status: 'cancelled' }
  | { status: 'error'; message: string };

/**
 * Open RevenueCat's hosted checkout for one plan. Resolves when the flow
 * closes. 'purchased' means the entitlement is already active on the
 * returned CustomerInfo - unlock the UI immediately; the webhook write to
 * users/{uid}.isPlus follows and makes it durable everywhere.
 */
export async function purchasePlus(
  plan: PlusPlan,
  customerEmail?: string
): Promise<PurchaseOutcome> {
  try {
    const { customerInfo } = await Purchases.getSharedInstance().purchase({
      rcPackage: plan.pkg,
      ...(customerEmail ? { customerEmail } : {}),
    });
    return { status: 'purchased', customerInfo };
  } catch (e) {
    if (e instanceof PurchasesError && e.errorCode === ErrorCode.UserCancelledError) {
      return { status: 'cancelled' };
    }
    console.error('Cherry + purchase failed', e);
    return {
      status: 'error',
      message:
        e instanceof PurchasesError && e.message
          ? e.message
          : 'The purchase did not go through - you have not been charged.',
    };
  }
}

/**
 * Web Billing's customer portal (the Customer Center equivalent on web):
 * update payment method, view invoices, cancel. Null when the user has no
 * web subscription to manage.
 */
/// Stripe's hosted customer portal for this account.
///
/// The fallback, not the first choice. RevenueCat returns a managementURL
/// scoped to the specific subscriber, which lands them on their own
/// subscription; this one asks for an email and sends a login link. Used only
/// when RevenueCat gives us nothing AND the subscription could actually be a
/// Stripe one.
///
/// Public by design: it is a login page, and it identifies nobody until an
/// address is entered and verified by Stripe.
const STRIPE_PORTAL_URL =
  'https://billing.stripe.com/p/login/bJe8wR3Xt08M1Ce889d7q00';

/// Stores that manage their own subscriptions. Sending one of their customers
/// to Stripe's portal is a dead end: their subscription is not there, and the
/// portal will simply not recognise them.
const SELF_MANAGED_STORES = ['app_store', 'mac_app_store', 'play_store', 'amazon'];

export async function manageSubscriptionUrl(): Promise<string | null> {
  if (!Purchases.isConfigured()) return null;
  try {
    const info = await Purchases.getSharedInstance().getCustomerInfo();
    if (info.managementURL) return info.managementURL;

    // No managementURL. Only offer the Stripe portal to someone who could
    // plausibly be in it: an entitlement unlocked by the App Store or Play is
    // managed there, and returning the portal to them would be a link that
    // cannot help. Better a disabled button than a confident wrong answer.
    const active = Object.values(info.entitlements.active);
    const boughtElsewhere = active.some((e) =>
      SELF_MANAGED_STORES.includes((e as { store?: string }).store ?? ''));
    return boughtElsewhere ? null : STRIPE_PORTAL_URL;
  } catch {
    return null;
  }
}
