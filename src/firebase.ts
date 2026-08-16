import { initializeApp } from 'firebase/app';
import { initializeFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';
import prodConfig from '../firebase-applet-config.json';
import betaConfig from '../firebase-applet-config.beta.json';

// Which Firebase project this build talks to. Beta runs in a separate project so
// testers get their own Firestore and their own Auth user pool — a beta account
// is never a production account, and a beta bug can never touch a real ledger.
//
// Selected two ways, because the two deploy paths differ. `VITE_APP_ENV=beta` is
// the explicit switch (set it for local beta work or a build-time override). The
// hostname check is the fallback, so a single build artifact serves whichever
// backend it lands on without needing per-backend build config.
const isBetaEnv =
  import.meta.env.VITE_APP_ENV === 'beta' ||
  (typeof window !== 'undefined' && /^beta[.-]/.test(window.location.hostname));

const firebaseConfig = isBetaEnv ? betaConfig : prodConfig;

// Fail loudly rather than fall back to production. Silently pointing beta
// testers at the real database is the one outcome this whole split exists to
// prevent, so an unconfigured beta build must not start at all.
if (isBetaEnv && firebaseConfig.projectId.startsWith('REPLACE_ME')) {
  throw new Error(
    'Beta environment selected but firebase-applet-config.beta.json still contains ' +
    'placeholder values. Fill it in from the beta Firebase project before deploying.'
  );
}

export const APP_ENV: 'beta' | 'production' = isBetaEnv ? 'beta' : 'production';

const app = initializeApp(firebaseConfig);

// App Check must be initialized before any Firestore/Auth traffic so requests carry an attestation token.
if (import.meta.env.DEV) (self as any).FIREBASE_APPCHECK_DEBUG_TOKEN = true;
if (firebaseConfig.recaptchaSiteKey) initializeAppCheck(app, { provider: new ReCaptchaV3Provider(firebaseConfig.recaptchaSiteKey), isTokenAutoRefreshEnabled: true });

// Initialize Firestore with the custom database ID as the third argument
export const db = initializeFirestore(app, {}, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);

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

// Mobile integration placeholders
// export const appleProvider = new OAuthProvider('apple.com');


export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid || null,
      email: auth.currentUser?.email || null,
      emailVerified: auth.currentUser?.emailVerified || null,
      isAnonymous: auth.currentUser?.isAnonymous || null,
      tenantId: auth.currentUser?.tenantId || null,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

