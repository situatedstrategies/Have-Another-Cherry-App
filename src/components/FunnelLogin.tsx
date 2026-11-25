import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AlertCircle } from 'lucide-react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { useTranslation } from 'react-i18next';
import { auth, forgetKeepSignedIn } from '../firebase';
import { authFollowUpsSettled } from '../lib/authFollowUp';
import { buildFunnelCallback, parseFunnelRequest } from '../lib/funnelLogin';
import AuthScreen from './AuthScreen';
import CherryLogo from './CherryLogo';
import LoadingScreen from './LoadingScreen';

// The sign-in page for the RevenueCat web funnel (/funnel/login).
//
// The funnel on signup.cat sends a visitor here before its paywall. They sign
// in or sign up with the normal AuthScreen, so every provider the app supports
// works, and are then sent back to the funnel with their Firebase uid. See
// lib/funnelLogin.ts for the link checks.
//
// Mounted instead of <App/> (see main.tsx), like the auth action page: none of
// App's Firestore subscriptions, billing setup or profile gates belong here.
// A brand-new account simply meets ProfileSetup the first time it opens the app.

// Set while this visit is waiting on a sign-in, keyed by the funnel's state
// value. sessionStorage rather than component state because the mobile
// sign-in flow leaves the page and comes back.
const PENDING_KEY = 'hac_funnel_pending';

// How long to wait for a new account's follow-up work (consent record,
// verification email) before leaving anyway. Leaving cancels what is still in
// flight, so this is a ceiling for a slow network, not a normal delay.
const FOLLOW_UP_WAIT_MS = 8_000;

function markPending(state: string): void {
  try {
    sessionStorage.setItem(PENDING_KEY, state);
  } catch {
    // Private browsing or blocked storage: the visitor gets the confirm
    // screen after signing in instead of going straight back. Still works.
  }
}

function isPending(state: string): boolean {
  try {
    return sessionStorage.getItem(PENDING_KEY) === state;
  } catch {
    return false;
  }
}

function clearPending(): void {
  try {
    sessionStorage.removeItem(PENDING_KEY);
  } catch {
    // Nothing to clear.
  }
}

export default function FunnelLogin() {
  const { t } = useTranslation();
  const request = useMemo(() => parseFunnelRequest(window.location.search), []);
  // undefined until Firebase has answered, then the user or null.
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => onAuthStateChanged(auth, (u) => setUser(u)), []);

  const goBack = useCallback(
    (u: User) => {
      if (!request) return;
      const url = buildFunnelCallback(request, u.uid);
      if (!url) return;
      setLeaving(true);
      clearPending();
      // replace, not assign: Back from the funnel should not land here again.
      window.location.replace(url);
    },
    [request]
  );

  useEffect(() => {
    if (!request || user === undefined) return;
    if (user === null) {
      markPending(request.rawState);
      return;
    }
    // They signed in on this visit, so that was their yes. Someone who
    // arrived already signed in is asked first (the confirm screen below):
    // a link alone should never be enough to send an account id anywhere.
    if (!isPending(request.rawState)) return;
    let cancelled = false;
    void authFollowUpsSettled(FOLLOW_UP_WAIT_MS).then(() => {
      if (!cancelled) goBack(user);
    });
    return () => {
      cancelled = true;
    };
  }, [request, user, goBack]);

  const switchAccount = () => {
    forgetKeepSignedIn();
    // The auth listener flips to the sign-in screen and marks this visit as
    // waiting, so the next sign-in goes straight back to the funnel.
    void auth.signOut();
  };

  if (!request) {
    return (
      <Shell>
        <div className="text-center mb-6">
          <h2 className="text-sm font-medium text-natural-muted">
            {t('funnelLogin.invalidTitle')}
          </h2>
        </div>
        <div className="notice notice-error mb-6" role="alert">
          <AlertCircle aria-hidden="true" />
          {t('funnelLogin.invalidBody')}
        </div>
        <a href="/" className="btn-primary w-full">
          {t('authAction.backToApp')}
        </a>
      </Shell>
    );
  }

  if (!user) {
    // AuthScreen is mounted from the first render, hidden until Firebase has
    // answered, the way App mounts it. On mobile the provider sign-in leaves
    // this page and comes back already signed in, and it is AuthScreen's own
    // effect that finishes that sign-in and records a new account's consent.
    return (
      <>
        {user === undefined && <LoadingScreen />}
        <div hidden={user === undefined}>
          <AuthScreen />
        </div>
      </>
    );
  }
  if (leaving || isPending(request.rawState)) {
    return <LoadingScreen label={t('funnelLogin.returning')} />;
  }

  return (
    <Shell>
      <div className="text-center mb-6">
        <h2 className="text-sm font-medium text-natural-muted">{t('funnelLogin.confirmTitle')}</h2>
      </div>
      <p className="text-sm text-natural-text text-center mb-6 break-words">
        {user.email
          ? t('funnelLogin.signedInAs', { email: user.email })
          : t('funnelLogin.signedIn')}
      </p>
      <button type="button" onClick={() => goBack(user)} className="btn-primary w-full">
        {t('authAction.continue')}
      </button>
      <button type="button" onClick={switchAccount} className="btn-quiet w-full mt-2">
        {t('funnelLogin.otherAccount')}
      </button>
    </Shell>
  );
}

// Same card as the auth action page, so the two standalone pages match.
function Shell({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  return (
    <div className="min-h-screen bg-natural-sidebar flex items-center justify-center p-4 font-sans">
      <div className="entry-card max-w-sm overflow-hidden relative">
        <div className="p-8">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center mb-4">
              <CherryLogo className="h-10 w-10" />
            </div>
            <h1 className="text-3xl font-semibold font-display text-natural-text mb-1 tracking-tight">
              {t('common.brand')}
            </h1>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
