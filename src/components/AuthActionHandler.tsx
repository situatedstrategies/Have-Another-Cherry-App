import React, { useEffect, useRef, useState } from 'react';
import { applyActionCode, confirmPasswordReset, verifyPasswordResetCode } from 'firebase/auth';
import { auth } from '../firebase';
import { Lock, Mail } from 'lucide-react';
import {
  PASSWORD_POLICY_MESSAGE,
  PASSWORD_REQUIREMENTS,
  checkPassword,
  isPasswordValid,
} from '../lib/password';
import { SUPPORT_EMAIL, describeCodeError, sanitizeContinueUrl } from '../lib/authAction';

// Handles the Firebase Auth email action links that used to land on
// <project>.firebaseapp.com/__/auth/action. App Hosting is Cloud Run based and
// does not serve Firebase's built-in handler, so we implement it ourselves and
// point Authentication -> Templates -> "Customize action URL" here.
//
// That console setting is global across every email template, so this page has
// to cope with every mode Firebase might send, not just password resets.
//
// The oobCode in the query string is a single-use credential. It is never
// logged, never put in an error message, and never forwarded anywhere.

type Phase =
  | { kind: 'loading' }
  | { kind: 'resetForm'; email: string }
  | { kind: 'success'; heading: string; message: string }
  | { kind: 'error'; message: string; offerNewLink: boolean }
  | { kind: 'unsupported' };

function CherryLogo({ className = 'h-10 w-10' }: { className?: string }) {
  return (
    <img src="/cherry2transparent.png" alt="Cherry Logo" className={className} style={{ objectFit: 'contain' }} />
  );
}

export default function AuthActionHandler() {
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // "Request a new link" mini-form, shown when a code turns out to be expired
  // or already used. Reuses the same endpoint as the login screen.
  const [newLinkEmail, setNewLinkEmail] = useState('');
  const [newLinkInfo, setNewLinkInfo] = useState('');
  const [newLinkError, setNewLinkError] = useState('');
  const [sendingNewLink, setSendingNewLink] = useState(false);

  const params = new URLSearchParams(window.location.search);
  const mode = params.get('mode') || '';
  const oobCode = params.get('oobCode') || '';
  const continueUrl = sanitizeContinueUrl(params.get('continueUrl'), window.location.origin);

  // StrictMode runs effects twice in dev. verifyPasswordResetCode is a harmless
  // read, but applyActionCode consumes the code - a second call would fail with
  // invalid-action-code and show a bogus error during local testing.
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    if (!mode) {
      setPhase({
        kind: 'error',
        message: 'This link is incomplete. Please open the most recent email we sent you, or request a new link.',
        offerNewLink: true,
      });
      return;
    }

    if (!oobCode) {
      setPhase({
        kind: 'error',
        message: 'This link is missing the code it needs to work. It may have been cut off by your email client - try opening it from the original email, or request a new link.',
        offerNewLink: mode === 'resetPassword',
      });
      return;
    }

    let cancelled = false;

    const run = async () => {
      try {
        switch (mode) {
          case 'resetPassword': {
            const email = await verifyPasswordResetCode(auth, oobCode);
            if (!cancelled) setPhase({ kind: 'resetForm', email });
            break;
          }
          case 'verifyEmail': {
            await applyActionCode(auth, oobCode);
            // The signed-in user's emailVerified flag is stale until refreshed.
            await auth.currentUser?.reload().catch(() => undefined);
            if (!cancelled) {
              setPhase({
                kind: 'success',
                heading: 'Email verified',
                message: 'Your email address is confirmed. You can head back to Have Another Cherry.',
              });
            }
            break;
          }
          case 'recoverEmail': {
            await applyActionCode(auth, oobCode);
            if (!cancelled) {
              setPhase({
                kind: 'success',
                heading: 'Email address restored',
                message:
                  'Your account is back on its previous email address. If you did not expect this change, reset your password now to secure the account.',
              });
            }
            break;
          }
          default:
            if (!cancelled) setPhase({ kind: 'unsupported' });
        }
      } catch (err) {
        if (!cancelled) {
          setPhase({
            kind: 'error',
            message: describeCodeError(err),
            offerNewLink: mode === 'resetPassword',
          });
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [mode, oobCode]);

  const checks = checkPassword(password);
  const valid = isPasswordValid(password);

  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!valid) {
      setFormError(PASSWORD_POLICY_MESSAGE);
      return;
    }
    if (password !== confirm) {
      setFormError('Those passwords do not match.');
      return;
    }

    setSubmitting(true);
    try {
      await confirmPasswordReset(auth, oobCode, password);
      setPhase({
        kind: 'success',
        heading: 'Password updated',
        message: 'Your new password is set. You can log in with it now.',
      });
    } catch (err) {
      // The code is consumed on success and can also expire mid-form, so a
      // failure here is usually terminal for this link rather than retryable.
      setPhase({ kind: 'error', message: describeCodeError(err), offerNewLink: true });
    } finally {
      setSubmitting(false);
    }
  };

  const handleRequestNewLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setNewLinkError('');
    setNewLinkInfo('');

    if (!newLinkEmail) {
      setNewLinkError('Enter your email address.');
      return;
    }

    setSendingNewLink(true);
    try {
      const res = await fetch('/api/send-password-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: newLinkEmail }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Unable to send reset email. Please try again later.');
      }
      setNewLinkInfo(
        `If an account exists for ${newLinkEmail}, a new reset link is on its way. Check your inbox (and your spam folder).`
      );
    } catch (err: any) {
      setNewLinkError(err?.message || 'Unable to send reset email. Please try again later.');
    } finally {
      setSendingNewLink(false);
    }
  };

  const continueHref = continueUrl || '/';
  const continueLabel = continueUrl ? 'Continue' : 'Back to Have Another Cherry';

  return (
    <div className="min-h-screen bg-natural-sidebar flex items-center justify-center p-4 font-sans">
      <div className="bg-white rounded-lg shadow-sm border border-natural-border w-full max-w-sm overflow-hidden relative">
        <div className="p-8">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center mb-4">
              <CherryLogo className="h-10 w-10" />
            </div>
            <h1 className="text-3xl font-semibold font-display text-natural-text mb-1 tracking-tight">
              Have Another Cherry
            </h1>
          </div>

          {phase.kind === 'loading' && (
            <p className="text-center text-sm text-natural-muted py-4">Checking your link...</p>
          )}

          {phase.kind === 'unsupported' && (
            <>
              <div className="text-center mb-6">
                <h2 className="text-sm font-medium text-natural-muted">Unsupported link</h2>
              </div>
              <div className="bg-natural-primary/5 text-natural-primary p-3 rounded-md mb-6 text-sm font-medium border border-natural-primary/15 flex items-start gap-2">
                <span className="shrink-0">⚠️</span>
                <span>
                  We do not recognise this type of link. If you were sent here from one of our emails, contact{' '}
                  {SUPPORT_EMAIL} and we will sort it out.
                </span>
              </div>
              <a
                href="/"
                className="block w-full text-center bg-natural-primary text-white font-medium py-2 px-4 rounded-md hover:bg-natural-primary/90 transition-colors shadow-sm"
              >
                Back to Have Another Cherry
              </a>
            </>
          )}

          {phase.kind === 'error' && (
            <>
              <div className="text-center mb-6">
                <h2 className="text-sm font-medium text-natural-muted">This link did not work</h2>
              </div>
              <div className="bg-natural-primary/5 text-natural-primary p-3 rounded-md mb-6 text-sm font-medium border border-natural-primary/15 flex items-start gap-2">
                <span className="shrink-0">⚠️</span>
                <span>{phase.message}</span>
              </div>

              {phase.offerNewLink ? (
                <>
                  {newLinkInfo && (
                    <div className="bg-natural-sidebar text-natural-text p-3 rounded-md mb-6 text-sm font-medium border border-natural-border flex items-start gap-2">
                      <span className="shrink-0">✅</span>
                      <span>{newLinkInfo}</span>
                    </div>
                  )}
                  {newLinkError && (
                    <div className="bg-natural-primary/5 text-natural-primary p-3 rounded-md mb-6 text-sm font-medium border border-natural-primary/15 flex items-start gap-2">
                      <span className="shrink-0">⚠️</span>
                      <span>{newLinkError}</span>
                    </div>
                  )}
                  {!newLinkInfo && (
                    <form onSubmit={handleRequestNewLink} className="space-y-4 mb-6">
                      <p className="text-sm text-natural-muted">
                        Enter your email address and we will send you a fresh reset link.
                      </p>
                      <div>
                        <label className="block text-xs font-semibold text-natural-text uppercase tracking-wide mb-1.5">
                          Email
                        </label>
                        <div className="relative">
                          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-natural-accent h-4 w-4" />
                          <input
                            type="email"
                            required
                            value={newLinkEmail}
                            onChange={(e) => setNewLinkEmail(e.target.value)}
                            className="w-full pl-9 pr-3 py-2 bg-white border border-natural-border focus:border-natural-muted focus:ring-1 focus:ring-natural-muted rounded-md text-natural-text placeholder-natural-accent font-sans text-sm outline-none transition-all"
                            placeholder="you@example.com"
                          />
                        </div>
                      </div>
                      <button
                        type="submit"
                        disabled={sendingNewLink}
                        className="w-full bg-natural-primary text-white font-medium py-2 px-4 rounded-md hover:bg-natural-primary/90 transition-colors shadow-sm disabled:opacity-70 disabled:cursor-not-allowed"
                      >
                        {sendingNewLink ? 'Please wait...' : 'Send a new link'}
                      </button>
                    </form>
                  )}
                </>
              ) : null}

              <p className="text-center text-sm text-natural-muted mt-6">
                <a href="/" className="text-natural-text hover:underline font-medium transition-colors">
                  Back to Have Another Cherry
                </a>
              </p>
            </>
          )}

          {phase.kind === 'success' && (
            <>
              <div className="text-center mb-6">
                <h2 className="text-sm font-medium text-natural-muted">{phase.heading}</h2>
              </div>
              <div className="bg-natural-sidebar text-natural-text p-3 rounded-md mb-6 text-sm font-medium border border-natural-border flex items-start gap-2">
                <span className="shrink-0">✅</span>
                <span>{phase.message}</span>
              </div>
              <a
                href={continueHref}
                className="block w-full text-center bg-natural-primary text-white font-medium py-2 px-4 rounded-md hover:bg-natural-primary/90 transition-colors shadow-sm"
              >
                {continueLabel}
              </a>
            </>
          )}

          {phase.kind === 'resetForm' && (
            <>
              <div className="text-center mb-6">
                <h2 className="text-sm font-medium text-natural-muted">Choose a new password</h2>
              </div>

              <p className="text-sm text-natural-muted mb-4">
                Setting a new password for <span className="font-medium text-natural-text">{phase.email}</span>.
              </p>

              {formError && (
                <div className="bg-natural-primary/5 text-natural-primary p-3 rounded-md mb-6 text-sm font-medium border border-natural-primary/15 flex items-start gap-2">
                  <span className="shrink-0">⚠️</span>
                  <span>{formError}</span>
                </div>
              )}

              <form onSubmit={handleSetPassword} className="space-y-4 mb-6">
                <div>
                  <label className="block text-xs font-semibold text-natural-text uppercase tracking-wide mb-1.5">
                    New password
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-natural-accent h-4 w-4" />
                    <input
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 bg-white border border-natural-border focus:border-natural-muted focus:ring-1 focus:ring-natural-muted rounded-md text-natural-text placeholder-natural-accent font-sans text-sm outline-none transition-all"
                      placeholder="••••••••"
                      minLength={8}
                      autoComplete="new-password"
                    />
                  </div>
                  <div className="mt-2">
                    <p className="text-xs font-semibold text-natural-text mb-1">Create a password with:</p>
                    <ul className="space-y-1">
                      {PASSWORD_REQUIREMENTS.map((req) => (
                        <li
                          key={req.key}
                          className={`flex items-center gap-1.5 text-xs ${
                            checks[req.key] ? 'text-natural-text' : 'text-natural-muted'
                          }`}
                        >
                          <span>{checks[req.key] ? '✓' : '○'}</span> {req.label}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-natural-text uppercase tracking-wide mb-1.5">
                    Confirm new password
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-natural-accent h-4 w-4" />
                    <input
                      type="password"
                      required
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 bg-white border border-natural-border focus:border-natural-muted focus:ring-1 focus:ring-natural-muted rounded-md text-natural-text placeholder-natural-accent font-sans text-sm outline-none transition-all"
                      placeholder="••••••••"
                      minLength={8}
                      autoComplete="new-password"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={submitting || !valid || password !== confirm}
                  className="w-full bg-natural-primary text-white font-medium py-2 px-4 rounded-md hover:bg-natural-primary/90 transition-colors shadow-sm disabled:opacity-70 disabled:cursor-not-allowed mt-2"
                >
                  {submitting ? 'Please wait...' : 'Set new password'}
                </button>
              </form>

              <p className="text-center text-sm text-natural-muted mt-6">
                <a href="/" className="text-natural-text hover:underline font-medium transition-colors">
                  Back to log in
                </a>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
