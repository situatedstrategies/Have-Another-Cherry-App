import { initializeApp } from 'firebase/app';
import {
  initializeFirestore,
  memoryLocalCache,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';
import {
  initializeAuth,
  setPersistence,
  indexedDBLocalPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
  inMemoryPersistence,
  browserPopupRedirectResolver,
} from 'firebase/auth';
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check';
import { onAuthStateChanged } from 'firebase/auth';
import firebaseConfig from '../firebase-applet-config.json';

// One Firebase project, one backend. Do not reintroduce a beta config or a VITE_APP_ENV switch.

export const app = initializeApp(firebaseConfig);

// Web push (FCM). The VAPID key is the public half of the Web Push
// certificate from Firebase console -> Project settings -> Cloud Messaging ->
// Web configuration. Public by design; an empty value disables web push
// cleanly (src/lib/push.ts treats it as unsupported).
export const fcmVapidKey: string = (firebaseConfig as any).fcmVapidKey || '';

// App Check must be initialized before any Firestore/Auth traffic so requests
// carry an attestation token. The site key is a reCAPTCHA *Enterprise* key
// (the server assesses tokens via the Enterprise API), so the provider must be
// ReCaptchaEnterpriseProvider: the V3 provider exchanges tokens against a
// different App Check endpoint and fails with a 403 for Enterprise keys, which
// blocks sign-in whenever App Check enforcement is on.
//
// Quick checks: dev builds always use a debug token (the token prints in the
// browser console on first load; allowlist it in Firebase Console -> App Check
// -> Apps -> Manage debug tokens). For a production-like build you control,
// set VITE_APPCHECK_DEBUG_TOKEN to an allowlisted token at build time to
// bypass reCAPTCHA attestation entirely while debugging.
const appCheckDebugToken = import.meta.env.VITE_APPCHECK_DEBUG_TOKEN;
if (import.meta.env.DEV || appCheckDebugToken) {
  (self as any).FIREBASE_APPCHECK_DEBUG_TOKEN = appCheckDebugToken || true;
}
// Started on demand rather than at module load. Initializing App Check runs a
// reCAPTCHA Enterprise assessment immediately, and when the key's challenge
// setting is on, a low-scoring visitor got an image puzzle over the sign-in
// screen the moment the page opened, before touching anything. So App Check
// starts at the first moment it can matter: right away when a session is
// about to be restored or a sign-in redirect is coming back, on the first
// tap, click or keypress on the signed-out screen (always before any sign-in
// request, since pointerdown and keydown fire ahead of the click or submit
// they lead to), and the moment Auth reports a signed-in user (the listener
// below is registered before any of the app's own, so it runs first).
let appCheckStarted = false;
export function ensureAppCheck(): void {
  if (appCheckStarted || !firebaseConfig.recaptchaSiteKey) return;
  appCheckStarted = true;
  initializeAppCheck(app, {
    provider: new ReCaptchaEnterpriseProvider(firebaseConfig.recaptchaSiteKey),
    isTokenAutoRefreshEnabled: true,
  });
}

function sessionLikelyRestoring(): boolean {
  try {
    if (localStorage.getItem('hac:keepSignedIn') === '1') return true;
    for (const store of [sessionStorage, localStorage]) {
      for (let i = 0; i < store.length; i++) {
        const key = store.key(i) || '';
        if (key.startsWith('firebase:authUser:') || key.startsWith('firebase:pendingRedirect'))
          return true;
      }
    }
  } catch {
    // Blocked storage: no restored session to protect, wait for the visitor.
  }
  return false;
}

if (import.meta.env.DEV || appCheckDebugToken || sessionLikelyRestoring()) {
  ensureAppCheck();
} else if (typeof window !== 'undefined') {
  const start = () => {
    ensureAppCheck();
    for (const type of ['pointerdown', 'keydown', 'focusin'] as const) {
      window.removeEventListener(type, start, true);
    }
  };
  for (const type of ['pointerdown', 'keydown', 'focusin'] as const) {
    window.addEventListener(type, start, { capture: true, passive: true });
  }
}

// Staying signed in across visits is opt-in, not the default. Firebase's
// default (local) persistence silently restored the previous Google or email
// session on every visit, which read as "the app logged me in without asking".
// Now a session only survives the browser tab unless the user ticked "keep me
// signed in" at login; that choice is remembered here and cleared on sign-out.
// Defined above Firestore because the cache choice below depends on it.
const KEEP_SIGNED_IN_KEY = 'hac:keepSignedIn';

export function getKeepSignedIn(): boolean {
  try {
    return localStorage.getItem(KEEP_SIGNED_IN_KEY) === '1';
  } catch {
    return false;
  }
}

// Offline cache. With "keep me signed in" on, Firestore keeps a copy of the
// documents this browser has read in IndexedDB, so a repeat visit shows the
// profile and the household straight from disk while the server confirms in
// the background, instead of waiting on a round trip for each one. Without
// it the cache stays in memory, as before: someone who did not ask to be
// remembered on this browser leaves nothing behind on its disk.
//
// The two must never disagree, so the cache follows the sign-in choice as it
// stood when the page loaded. Ticking the box at sign-in takes effect on the
// next visit; signing out wipes the disk copy (see below).
export const offlineCacheEnabled = getKeepSignedIn() && typeof indexedDB !== 'undefined';

// Initialize Firestore with the custom database ID as the third argument
export const db = initializeFirestore(
  app,
  {
    localCache: offlineCacheEnabled
      ? persistentLocalCache({ tabManager: persistentMultipleTabManager() })
      : memoryLocalCache(),
  },
  firebaseConfig.firestoreDatabaseId
);

// A page that loads without the disk cache deletes any copy a kept session
// left behind (the user signed out, or the session ended). Done directly on
// IndexedDB, not with Firestore's clearIndexedDbPersistence: that runs on
// Firestore's own work queue, so a delete held up by another open tab would
// stall every read behind it. Here a held-up delete just waits on its own.
// Only Firestore's databases are touched (their names start "firestore/"),
// never Auth's, App Check's or anything else's.
async function removeLeftoverFirestoreCache(): Promise<void> {
  try {
    if (typeof indexedDB === 'undefined' || typeof indexedDB.databases !== 'function') return;
    for (const { name } of await indexedDB.databases()) {
      if (name && name.startsWith('firestore/') && name.includes(firebaseConfig.projectId)) {
        indexedDB.deleteDatabase(name);
      }
    }
  } catch {
    // Nothing to clean up, or no access to IndexedDB: either way, carry on.
  }
}
if (!offlineCacheEnabled) void removeLeftoverFirestoreCache();

// Record the user's choice and apply it to future sign-ins in this page load.
// Called right before a sign-in attempt (email or Google), and before the
// Google redirect flow navigates away, so the choice is already stored when
// the app reloads on the way back.
export async function applyKeepSignedIn(keep: boolean): Promise<void> {
  try {
    if (keep) localStorage.setItem(KEEP_SIGNED_IN_KEY, '1');
    else localStorage.removeItem(KEEP_SIGNED_IN_KEY);
  } catch {
    // Storage can be blocked (private mode, strict settings); sign-in still
    // works, it just won't survive the tab.
  }
  try {
    await setPersistence(auth, keep ? indexedDBLocalPersistence : browserSessionPersistence);
  } catch {
    // Unsupported persistence layer; fall through with whatever is active.
  }
}

// Forget the "keep me signed in" choice. Every sign-out path calls this so
// the next visit always lands on the login screen and asks again.
export function forgetKeepSignedIn(): void {
  try {
    localStorage.removeItem(KEEP_SIGNED_IN_KEY);
  } catch {
    // Ignore blocked storage; there is nothing stored to forget then anyway.
  }
}

// initializeAuth instead of getAuth so the persistence layers honor the saved
// choice from the very first read: with the flag set the previous session is
// restored from durable storage, without it only the current tab's session
// (if any) is picked up and a past visit's session is never resurrected.
export const auth = initializeAuth(app, {
  persistence: getKeepSignedIn()
    ? [indexedDBLocalPersistence, browserLocalPersistence]
    : [browserSessionPersistence, inMemoryPersistence],
  popupRedirectResolver: browserPopupRedirectResolver,
});

// A signed-in user means Firestore traffic is next: App Check must be running.
onAuthStateChanged(auth, (user) => {
  if (user) ensureAppCheck();
});

// Leaving a kept session reloads the page. Every way out counts (sign out,
// account deletion, a session that expired, or signing out in another tab,
// which signs this one out too), so the flag is cleared here as well, and the
// reload comes back without the disk cache and deletes the copy (above).
// Reloading also matters for other open tabs: deleting the cache shuts down
// any Firestore client still using it, and a tab left on the login screen
// with a shut-down client could not sign in again until it was reloaded.
if (offlineCacheEnabled && typeof window !== 'undefined') {
  let hadUser = false;
  onAuthStateChanged(auth, (user) => {
    if (user) {
      hadUser = true;
      return;
    }
    if (!hadUser) return;
    forgetKeepSignedIn();
    window.location.reload();
  });
}

// Build the Authorization header for calls to our authenticated API endpoints.
// Returns {} when signed out so callers degrade gracefully.
export async function authHeader(): Promise<Record<string, string>> {
  const user = auth.currentUser;
  if (!user) return {};
  try {
    return { Authorization: `Bearer ${await user.getIdToken()}` };
  } catch {
    return {};
  }
}
