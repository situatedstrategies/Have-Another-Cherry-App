import React, { useEffect, useRef, useState } from 'react';
import { applyActionCode, confirmPasswordReset, verifyPasswordResetCode } from 'firebase/auth';
import { auth } from '../firebase';
import { Lock, Mail } from 'lucide-react';
import { Trans, useTranslation } from 'react-i18next';
import {
  PASSWORD_REQUIREMENTS,
  checkPassword,
  isPasswordValid,
  passwordPolicyMessage,
  passwordRequirementLabel,
} from '../lib/password';
import { SUPPORT_EMAIL, describeCodeError, sanitizeContinueUrl } from '../lib/authAction';
import CherryLogo from './CherryLogo';

// The Firebase Auth email action handler. App Hosting does not serve
// Firebase's built-in one, so this page is what Authentication -> Templates ->
// "Customize action URL" points at. That setting is global across every email
// template, so this page copes with every mode Firebase might send.

type Phase =
  | { kind: 'loading' }
  | { kind: 'resetForm'; email: string }
  | { kind: 'success'; heading: string; message: string }
  | { kind: 'error'; message: string; offerNewLink: boolean }
  | { kind: 'unsupported' };

export default function AuthActionHandler() {
  const { t } = useTranslation();
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
        message: t('authAction.linkIncomplete'),
        offerNewLink: true,
      });
      return;
    }

    if (!oobCode) {
      setPhase({
        kind: 'error',
        message: t('authAction.linkMissingCode'),
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
                heading: t('authAction.emailVerified'),
                message: t('authAction.emailVerifiedBody'),
              });
            }
            break;
          }
          case 'recoverEmail': {
            await applyActionCode(auth, oobCode);
            if (!cancelled) {
              setPhase({
                kind: 'success',
                heading: t('authAction.emailRestored'),
                message: t('authAction.emailRestoredBody'),
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
    // t is stable for the mounted language; a language switch mid-flow would
    // not re-run this one-shot handler, which is the intended behaviour.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, oobCode]);

  const checks = checkPassword(password);
  const valid = isPasswordValid(password);

  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!valid) {
      setFormError(passwordPolicyMessage());
      return;
    }
    if (password !== confirm) {
      setFormError(t('authAction.passwordsMismatch'));
      return;
    }

    setSubmitting(true);
    try {
      await confirmPasswordReset(auth, oobCode, password);
      setPhase({
        kind: 'success',
        heading: t('authAction.passwordUpdated'),
        message: t('authAction.passwordUpdatedBody'),
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
      setNewLinkError(t('authAction.enterEmail'));
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
        throw new Error(data.error || t('auth.resetSendFailed'));
      }
      setNewLinkInfo(t('auth.resetSent', { email: newLinkEmail }));
    } catch (err: any) {
      // A fetch that never reached the server rejects with a TypeError whose
      // message is written for developers ("Failed to fetch").
      setNewLinkError(
        err instanceof TypeError ? t('auth.offline') : err?.message || t('auth.resetSendFailed')
      );
    } finally {
      setSendingNewLink(false);
    }
  };

  const continueHref = continueUrl || '/';
  const continueLabel = continueUrl ? t('authAction.continue') : t('authAction.backToApp');

  return (
    <div className="min-h-screen bg-natural-sidebar flex items-center justify-center p-4 font-sans">
      <div className="bg-white rounded-lg shadow-sm border border-natural-border w-full max-w-sm overflow-hidden relative">
        <div className="p-8">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center mb-4">
              <CherryLogo className="h-10 w-10" />
            </div>
            <h1 className="text-3xl font-semibold font-display text-natural-text mb-1 tracking-tight">
              {t('common.brand')}
            </h1>
          </div>

          {phase.kind === 'loading' && (
            <p className="text-center text-sm text-natural-muted py-4">{t('authAction.checkingLink')}</p>
          )}

          {phase.kind === 'unsupported' && (
            <>
              <div className="text-center mb-6">
                <h2 className="text-sm font-medium text-natural-muted">{t('authAction.unsupportedLink')}</h2>
              </div>
              <div className="bg-natural-primary/5 text-natural-primary p-3 rounded-md mb-6 text-sm font-medium border border-natural-primary/15 flex items-start gap-2">
                <span className="shrink-0">⚠️</span>
                <span>{t('authAction.unsupportedBody', { email: SUPPORT_EMAIL })}</span>
              </div>
              <a
                href="/"
                className="block w-full text-center bg-natural-primary text-white font-medium py-2 px-4 rounded-md hover:bg-natural-primary/90 transition-colors shadow-sm"
              >
                {t('authAction.backToApp')}
              </a>
            </>
          )}

          {phase.kind === 'error' && (
            <>
              <div className="text-center mb-6">
                <h2 className="text-sm font-medium text-natural-muted">{t('authAction.linkDidNotWork')}</h2>
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
                        {t('authAction.freshLink')}
                      </p>
                      <div>
                        <label className="block text-xs font-semibold text-natural-text uppercase tracking-wide mb-1.5">
                          {t('auth.email')}
                        </label>
                        <div className="relative">
                          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-natural-accent h-4 w-4" />
                          <input
                            type="email"
                            required
                            value={newLinkEmail}
                            onChange={(e) => setNewLinkEmail(e.target.value)}
                            className="w-full pl-9 pr-3 py-2 bg-white border border-natural-border focus:border-natural-muted focus:ring-1 focus:ring-natural-muted rounded-md text-natural-text placeholder-natural-accent font-sans text-sm outline-none transition-all"
                            placeholder={t('auth.emailPlaceholder')}
                          />
                        </div>
                      </div>
                      <button
                        type="submit"
                        disabled={sendingNewLink}
                        className="w-full bg-natural-primary text-white font-medium py-2 px-4 rounded-md hover:bg-natural-primary/90 transition-colors shadow-sm disabled:opacity-70 disabled:cursor-not-allowed"
                      >
                        {sendingNewLink ? t('common.pleaseWait') : t('authAction.sendNewLink')}
                      </button>
                    </form>
                  )}
                </>
              ) : null}

              <p className="text-center text-sm text-natural-muted mt-6">
                <a
                  href="/"
                  className="text-natural-text hover:underline font-medium transition-colors"
                >
                  {t('authAction.backToApp')}
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
                <h2 className="text-sm font-medium text-natural-muted">{t('authAction.chooseNewPassword')}</h2>
              </div>

              <p className="text-sm text-natural-muted mb-4">
                <Trans
                  i18nKey="authAction.settingFor"
                  values={{ email: phase.email }}
                  components={{ 1: <span className="font-medium text-natural-text" /> }}
                />
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
                    {t('authAction.newPassword')}
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
                    <p className="text-xs font-semibold text-natural-text mb-1">
                      {t('auth.createPasswordWith')}
                    </p>
                    <ul className="space-y-1">
                      {PASSWORD_REQUIREMENTS.map((req) => (
                        <li
                          key={req.key}
                          className={`flex items-center gap-1.5 text-xs ${
                            checks[req.key] ? 'text-natural-text' : 'text-natural-muted'
                          }`}
                        >
                          <span>{checks[req.key] ? '✓' : '○'}</span>{' '}
                          {passwordRequirementLabel(req.labelKey)}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-natural-text uppercase tracking-wide mb-1.5">
                    {t('authAction.confirmNewPassword')}
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
                  {submitting ? t('common.pleaseWait') : t('authAction.setNewPassword')}
                </button>
              </form>

              <p className="text-center text-sm text-natural-muted mt-6">
                <a
                  href="/"
                  className="text-natural-text hover:underline font-medium transition-colors"
                >
                  {t('auth.backToLogin')}
                </a>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
