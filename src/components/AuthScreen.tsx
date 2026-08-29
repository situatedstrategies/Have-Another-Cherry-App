import React, { useEffect, useState } from 'react';
import { signInWithPopup, signInWithRedirect, getRedirectResult, GoogleAuthProvider, createUserWithEmailAndPassword, signInWithEmailAndPassword, updateProfile, getAdditionalUserInfo, type User as FirebaseUser } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { preloadRecaptcha, verifyRecaptcha } from '../lib/recaptcha';
import { Mail, Lock, User } from 'lucide-react';
import LegalModal, { LegalDoc } from './LegalModal';
import {
  PASSWORD_POLICY_MESSAGE,
  PASSWORD_REQUIREMENTS,
  checkPassword,
  isPasswordValid,
} from '../lib/password';

const TERMS_VERSION = '2026-08-08';

// Turn Firebase's internal auth error codes into friendly, non-enumerating text.
function friendlyAuthError(err: any): string {
  switch (err?.code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return "That email or password doesn't match. Please try again.";
    case 'auth/invalid-email':
      return 'Please enter a valid email address.';
    case 'auth/email-already-in-use':
      return 'An account already exists for this email. Try logging in instead.';
    case 'auth/weak-password':
      return 'Please choose a stronger password.';
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return 'Sign-in was cancelled.';
    case 'auth/account-exists-with-different-credential':
      return 'You already have an account with this email using a different sign-in method. Try that one.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Please wait a moment and try again.';
    case 'auth/network-request-failed':
      return 'Couldn’t reach the sign-in service. Check your connection — VPNs, ad blockers, or strict privacy settings can block it — and try again.';
    case 'auth/popup-blocked':
      return 'Your browser blocked the Google sign-in window. Allow popups for this site and try again.';
    case 'auth/unauthorized-domain':
      return 'Sign-in isn’t authorized on this domain. Please use the official app link.';
    case 'auth/ui-timeout':
      return 'Sign-in is taking too long. If a Google window opened and closed without signing you in, your browser may be blocking cross-site sign-in — try email and password, or a different browser.';
    default:
      return 'Something went wrong. Please try again.';
  }
}

// Rejects if the auth call neither resolves nor rejects within `ms`, so the UI
// can recover instead of sitting on "Please wait..." forever. If the underlying
// sign-in still completes later, onAuthStateChanged picks it up regardless.
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      const err: any = new Error('Sign-in timed out');
      err.code = 'auth/ui-timeout';
      reject(err);
    }, ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); }
    );
  });
}

// Record proof-of-consent on the user's doc (merge so it doesn't disturb other fields).
async function recordTermsAcceptance(uid: string) {
  try {
    await setDoc(doc(db, 'users', uid), { termsAcceptedAt: new Date().toISOString(), termsVersion: TERMS_VERSION }, { merge: true });
  } catch (e) {
    console.error('Failed to record terms acceptance', e);
  }
}

// Brand logo (public/logo.svg, mirrored from the marketing site), used across
// the app; the email templates keep the PNG mark for email-client support.
function CherryLogo({ className = "h-10 w-10" }: { className?: string }) {
  return (
    <img src="/logo.svg" alt="Have Another Cherry logo" className={className} style={{ objectFit: 'contain' }} />
  );
}

// Which view to open on. The marketing site sends people here from two very
// different buttons: "Create an account" and "Log in". Landing a would-be
// signup on the login form and making them find a small text link at the bottom
// is where that funnel leaked, so the intent travels in the URL.
//
// Accepts ?signup / ?signup=1 / #signup, and the login equivalents, so the site
// can link either way without this having to know which form it used.
function initialIsLogin(): boolean {
  if (typeof window === 'undefined') return true;
  const { search, hash } = window.location;
  const q = new URLSearchParams(search);
  const wantsSignup = q.has('signup') || q.get('mode') === 'signup' || hash === '#signup';
  const wantsLogin = q.has('login') || q.get('mode') === 'login' || hash === '#login';
  if (wantsSignup) return false;
  if (wantsLogin) return true;
  return true;
}

export default function AuthScreen() {
  const [isLogin, setIsLogin] = useState(initialIsLogin);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  // Separate loading flags so a hung Google popup can never wedge the email
  // form (or vice versa); both buttons still disable during any attempt.
  const [emailLoading, setEmailLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const loading = emailLoading || googleLoading;
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [legalDoc, setLegalDoc] = useState<LegalDoc | null>(null);
  const [isReset, setIsReset] = useState(false);
  const [info, setInfo] = useState('');

  // Load the reCAPTCHA script up front so the badge is visible on the auth
  // screen and the first submit does not pay the script download cost.
  useEffect(() => {
    preloadRecaptcha();
  }, []);

  // Complete a Google sign-in that came back via the redirect flow (mobile).
  // Success swaps this screen out through onAuthStateChanged; this hook only
  // needs to record consent for brand-new accounts and surface failures.
  useEffect(() => {
    getRedirectResult(auth)
      .then((result) => {
        if (result && getAdditionalUserInfo(result)?.isNewUser) {
          return recordTermsAcceptance(result.user.uid);
        }
      })
      .catch((err) => {
        // This check runs on every load, usually with no redirect pending, so a
        // network hiccup here is not worth alarming the user over. Real sign-in
        // attempts report their own network failures.
        if (err?.code !== 'auth/network-request-failed') {
          setError(friendlyAuthError(err));
        }
      });
  }, []);

  // Switch between Log in / Sign up / Reset views, clearing any messages.
  const switchMode = (next: 'login' | 'signup' | 'reset') => {
    setError('');
    setInfo('');
    setIsReset(next === 'reset');
    if (next !== 'reset') setIsLogin(next === 'login');
  };

  // Password policy for new accounts, shared with the reset form in
  // AuthActionHandler so the two cannot drift apart.
  const passwordChecks = checkPassword(password);
  const passwordValid = isPasswordValid(password);

  
  // Mobile integration placeholders
  // const handleAppleAuth = async () => { ... }
  // const handleGoogleAuthMobile = async () => { ... }

  const handleGoogleAuth = async () => {
    // New (sign-up) accounts must accept the terms first - matches the email flow.
    if (!isLogin && !agreeTerms) {
      setError('Please agree to the Terms of Service and Privacy Policy to create an account.');
      return;
    }
    setError('');
    const provider = new GoogleAuthProvider();
    // Mobile browsers (and home-screen installs) handle popups poorly or not at
    // all; the full-page redirect flow is the reliable path there. The popup
    // stays for desktop, where redirect would lose in-page state unnecessarily.
    const preferRedirect = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    try {
      setGoogleLoading(true);
      if (preferRedirect) {
        // Navigates away from the app; the watchdog only matters if the
        // pre-redirect handshake stalls, so the button can't stick forever.
        await withTimeout(signInWithRedirect(auth, provider), 30_000);
        return;
      }
      // Long timeout: the user may legitimately spend time in the popup. If the
      // popup completes but can never message back (blocked cross-site storage),
      // this unfreezes the UI with an actionable error instead of hanging.
      const result = await withTimeout(signInWithPopup(auth, provider), 90_000);
      // Record consent for brand-new accounts (Google already verifies the email).
      if (getAdditionalUserInfo(result)?.isNewUser) {
        await recordTermsAcceptance(result.user.uid);
      }
    } catch (err: any) {
      // A blocked or unsupported popup still has a way forward: the redirect flow.
      if (err?.code === 'auth/popup-blocked' || err?.code === 'auth/operation-not-supported-in-this-environment') {
        try {
          await signInWithRedirect(auth, provider);
          return;
        } catch (redirectErr: any) {
          err = redirectErr;
        }
      }
      setError(friendlyAuthError(err));
      setGoogleLoading(false);
    }
  };

  // Request a password reset email. This hits our server endpoint, which mints a
  // Firebase reset link and delivers it via Resend from reset@haveanothercherry.com.
  // Uses a generic confirmation so we don't reveal whether an email is registered.
  const handleResetPassword = async () => {
    setError('');
    setInfo('');
    if (!email) {
      setError('Enter your email address to reset your password.');
      return;
    }
    setEmailLoading(true);
    try {
      const res = await fetch('/api/send-password-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Unable to send reset email. Please try again later.');
      }
      setInfo(`If an account exists for ${email}, a password reset link is on its way. Check your inbox (and your spam folder).`);
    } catch (err: any) {
      setError(err.message || 'Unable to send reset email. Please try again later.');
    } finally {
      setEmailLoading(false);
    }
  };

  // Ask the server to mail a confirmation link. Failures are logged and dropped:
  // the account is already created by this point, and the user can be sent
  // another link later. Never surface this as a signup error.
  const sendVerificationEmail = async (user: FirebaseUser, displayName: string) => {
    try {
      const token = await user.getIdToken();
      await fetch('/api/send-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(displayName ? { name: displayName } : {}),
      });
    } catch (err) {
      console.error('Could not send the verification email', err);
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (isReset) {
      await handleResetPassword();
      return;
    }

    if (!isLogin) {
      if (!passwordValid) {
        setError(PASSWORD_POLICY_MESSAGE);
        return;
      }
      if (!agreeTerms) {
        setError('Please agree to the Terms of Service and Privacy Policy to create an account.');
        return;
      }
    }

    setEmailLoading(true);
    try {
      // Firebase App Check already protects the application.
      // Keep the custom reCAPTCHA assessment as telemetry only; it must not
      // prevent legitimate users from reaching Firebase Authentication.
      void verifyRecaptcha(isLogin ? 'LOGIN' : 'SIGNUP');
      if (isLogin) {
        await withTimeout(signInWithEmailAndPassword(auth, email, password), 30_000);
      } else {
        const userCred = await withTimeout(createUserWithEmailAndPassword(auth, email, password), 30_000);
        if (name.trim()) {
          await updateProfile(userCred.user, { displayName: name.trim() });
        }
        await recordTermsAcceptance(userCred.user.uid);

        // Confirm the address for password signups. Google accounts skip this:
        // Google has already verified the address, and Firebase marks them
        // verified on creation, so the endpoint would no-op anyway.
        //
        // Deliberately not awaited into the UI. The auth listener swaps this
        // screen out the moment the account exists, so there is nothing left to
        // show a result on, and a slow or failed email must never be what stops
        // someone getting into the app they just signed up for.
        void sendVerificationEmail(userCred.user, name.trim());
      }
    } catch (err: any) {
      setError(friendlyAuthError(err));
      setEmailLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-natural-sidebar flex flex-col font-sans">
      <nav className="w-full flex items-center justify-between px-6 py-4">
        <a href="https://haveanothercherry.com" className="flex items-center gap-2">
          <CherryLogo className="h-6 w-6" />
          <span className="font-display font-semibold text-natural-text tracking-tight">Have Another Cherry</span>
        </a>
        <a
          href="https://haveanothercherry.com/blog"
          className="text-sm font-medium text-natural-muted hover:text-natural-text transition-colors"
        >
          Blog
        </a>
      </nav>

      <div className="flex-1 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-sm border border-natural-border w-full max-w-sm overflow-hidden relative">
        <div className="p-8">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center mb-4">
              <CherryLogo className="h-10 w-10" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-semibold font-display text-natural-text mb-1 tracking-tight">
              Have Another Cherry
            </h1>
          </div>

          {/* Both ways in, side by side, in the same shape the marketing site
              uses. The old version put "Sign up" in a small text link below the
              fold of a phone screen, so arriving from a "Create an account"
              button meant hunting for the form you had already asked for. */}
          {isReset ? (
            <div className="text-center mb-6">
              <h2 className="text-sm font-medium text-natural-muted">Reset your password</h2>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-1 p-1 mb-6 bg-natural-sidebar border border-natural-border rounded-full" role="tablist">
              {([['login', 'Log in'], ['signup', 'Sign up']] as const).map(([mode, label]) => {
                const active = isLogin === (mode === 'login');
                return (
                  <button
                    key={mode}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => switchMode(mode)}
                    className={`min-h-11 px-3 rounded-full font-mono text-xs transition-all cursor-pointer ${
                      active
                        ? 'bg-white text-natural-text font-medium shadow-sm'
                        : 'text-natural-muted hover:text-natural-text'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          )}

          {error && (
            <div className="bg-natural-primary/5 text-natural-primary p-3 rounded-md mb-6 text-sm font-medium border border-natural-primary/15 flex items-start gap-2">
              <span className="shrink-0">⚠️</span>
              <span>{error}</span>
            </div>
          )}

          {info && (
            <div className="bg-natural-sidebar text-natural-text p-3 rounded-md mb-6 text-sm font-medium border border-natural-border flex items-start gap-2">
              <span className="shrink-0">✅</span>
              <span>{info}</span>
            </div>
          )}

          <form onSubmit={handleEmailAuth} className="space-y-4 mb-6">
            {isReset && (
              <p className="text-sm text-natural-muted -mt-1">
                Enter the email address for your account and we'll send you a link to create a new password.
              </p>
            )}

            {!isLogin && !isReset && (
              <div>
                <label className="block text-xs font-semibold text-natural-text uppercase tracking-wide mb-1.5">Name</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 text-natural-accent h-4 w-4" />
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 bg-white border border-natural-border focus:border-natural-muted focus:ring-1 focus:ring-natural-muted rounded-md text-natural-text placeholder-natural-accent font-sans text-sm outline-none transition-all"
                    placeholder="Your Name"
                  />
                </div>
              </div>
            )}
            
            <div>
              <label className="block text-xs font-semibold text-natural-text uppercase tracking-wide mb-1.5">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-natural-accent h-4 w-4" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-white border border-natural-border focus:border-natural-muted focus:ring-1 focus:ring-natural-muted rounded-md text-natural-text placeholder-natural-accent font-sans text-sm outline-none transition-all"
                  placeholder="you@example.com"
                />
              </div>
            </div>

            {!isReset && (
            <div>
              <label className="block text-xs font-semibold text-natural-text uppercase tracking-wide mb-1.5">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-natural-accent h-4 w-4" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-white border border-natural-border focus:border-natural-muted focus:ring-1 focus:ring-natural-muted rounded-md text-natural-text placeholder-natural-accent font-sans text-sm outline-none transition-all"
                  placeholder="••••••••"
                  minLength={isLogin ? undefined : 8}
                />
              </div>
              {!isLogin && (
                <div className="mt-2">
                  <p className="text-xs font-semibold text-natural-text mb-1">Create a password with:</p>
                  <ul className="space-y-1">
                    {PASSWORD_REQUIREMENTS.map((req) => (
                      <li key={req.key} className={`flex items-center gap-1.5 text-xs ${passwordChecks[req.key] ? 'text-natural-text' : 'text-natural-muted'}`}>
                        <span>{passwordChecks[req.key] ? '✓' : '○'}</span> {req.label}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {isLogin && (
                <div className="text-right mt-1.5">
                  <button
                    type="button"
                    onClick={() => switchMode('reset')}
                    className="text-xs font-medium text-natural-primary hover:underline"
                  >
                    Forgot password?
                  </button>
                </div>
              )}
            </div>
            )}

            {!isLogin && !isReset && (
              <label className="flex items-start gap-2 text-xs text-natural-muted cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={agreeTerms}
                  onChange={(e) => setAgreeTerms(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-natural-border text-natural-primary focus:ring-natural-primary"
                />
                <span>
                  I agree to the{' '}
                  <button type="button" onClick={() => setLegalDoc('terms')} className="font-semibold text-natural-primary hover:underline">Terms of Service</button>
                  {' '}and{' '}
                  <button type="button" onClick={() => setLegalDoc('privacy')} className="font-semibold text-natural-primary hover:underline">Privacy Policy</button>.
                </span>
              </label>
            )}

            <button
              type="submit"
              disabled={loading || (!isReset && !isLogin && (!passwordValid || !agreeTerms))}
              className="w-full bg-natural-primary text-white font-medium py-2 px-4 rounded-md hover:bg-natural-primary/90 transition-colors shadow-sm disabled:opacity-70 disabled:cursor-not-allowed mt-2"
            >
              {emailLoading ? 'Please wait...' : (isReset ? 'Send reset link' : (isLogin ? 'Log In' : 'Sign Up'))}
            </button>
          </form>

          {!isReset && (
          <>
          <div className="relative mb-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-natural-border"></div>
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="px-2 bg-white text-natural-muted">or</span>
            </div>
          </div>

          <button
            onClick={handleGoogleAuth}
            type="button"
            disabled={loading}
            className="w-full bg-white border border-natural-border text-natural-text font-medium py-2 px-4 rounded-md hover:bg-natural-sidebar transition-colors flex items-center justify-center gap-2 shadow-sm disabled:opacity-70 disabled:cursor-not-allowed text-sm"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path
                fill="currentColor"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="currentColor"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="currentColor"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="currentColor"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            {googleLoading ? 'Waiting for Google...' : 'Continue with Google'}
          </button>
          </>
          )}

          {isReset ? (
            <p className="text-center text-sm text-natural-muted mt-6">
              Remembered your password?{' '}
              <button
                onClick={() => switchMode('login')}
                className="text-natural-text hover:underline font-medium transition-colors"
              >
                Back to log in
              </button>
            </p>
          ) : !isLogin && (
            /* The same promise the marketing site makes at the moment of the
               click, repeated where the hesitation actually lands. */
            <p className="text-center font-mono text-xs leading-relaxed text-natural-accent mt-6">
              Everything you need is free. No credit card required.
            </p>
          )}
        </div>
      </div>
      </div>

      {legalDoc && <LegalModal doc={legalDoc} onClose={() => setLegalDoc(null)} />}
    </div>
  );
}
