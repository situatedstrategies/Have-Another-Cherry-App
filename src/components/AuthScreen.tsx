import React, { useState } from 'react';
import { signInWithPopup, GoogleAuthProvider, createUserWithEmailAndPassword, signInWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { auth } from '../firebase';
import { Mail, Lock, User } from 'lucide-react';
import LegalModal, { LegalDoc } from './LegalModal';
import {
  PASSWORD_POLICY_MESSAGE,
  PASSWORD_REQUIREMENTS,
  checkPassword,
  isPasswordValid,
} from '../lib/password';

function CherryLogo({ className = "h-10 w-10" }: { className?: string }) {
  return (
    <img src="/cherry2transparent.png" alt="Cherry Logo" className={className} style={{ objectFit: 'contain' }} />
  );
}

export default function AuthScreen() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [legalDoc, setLegalDoc] = useState<LegalDoc | null>(null);
  const [isReset, setIsReset] = useState(false);
  const [info, setInfo] = useState('');

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
    try {
      setLoading(true);
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
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
    setLoading(true);
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
      setLoading(false);
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

    setLoading(true);
    try {
      if (isLogin) {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        const userCred = await createUserWithEmailAndPassword(auth, email, password);
        if (name.trim()) {
          await updateProfile(userCred.user, { displayName: name.trim() });
        }
      }
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

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

          <div className="text-center mb-6">
            <h2 className="text-sm font-medium text-natural-muted">
              {isReset ? 'Reset your password' : (isLogin ? 'Log in to your account' : 'Create a new account')}
            </h2>
          </div>

          {error && (
            <div className="bg-red-50 text-red-600 p-3 rounded-md mb-6 text-sm font-medium border border-red-100 flex items-start gap-2">
              <span className="shrink-0">⚠️</span>
              <span>{error}</span>
            </div>
          )}

          {info && (
            <div className="bg-green-50 text-green-700 p-3 rounded-md mb-6 text-sm font-medium border border-green-100 flex items-start gap-2">
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
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 h-4 w-4" />
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 bg-white border border-slate-300 focus:border-slate-500 focus:ring-1 focus:ring-slate-500 rounded-md text-natural-text placeholder-slate-400 font-sans text-sm outline-none transition-all"
                    placeholder="Your Name"
                  />
                </div>
              </div>
            )}
            
            <div>
              <label className="block text-xs font-semibold text-natural-text uppercase tracking-wide mb-1.5">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 h-4 w-4" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-white border border-slate-300 focus:border-slate-500 focus:ring-1 focus:ring-slate-500 rounded-md text-natural-text placeholder-slate-400 font-sans text-sm outline-none transition-all"
                  placeholder="you@example.com"
                />
              </div>
            </div>

            {!isReset && (
            <div>
              <label className="block text-xs font-semibold text-natural-text uppercase tracking-wide mb-1.5">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 h-4 w-4" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-white border border-slate-300 focus:border-slate-500 focus:ring-1 focus:ring-slate-500 rounded-md text-natural-text placeholder-slate-400 font-sans text-sm outline-none transition-all"
                  placeholder="••••••••"
                  minLength={isLogin ? undefined : 8}
                />
              </div>
              {!isLogin && (
                <div className="mt-2">
                  <p className="text-xs font-semibold text-natural-text mb-1">Create a password with:</p>
                  <ul className="space-y-1">
                    {PASSWORD_REQUIREMENTS.map((req) => (
                      <li key={req.key} className={`flex items-center gap-1.5 text-xs ${passwordChecks[req.key] ? 'text-green-600' : 'text-natural-muted'}`}>
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
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-natural-primary focus:ring-natural-primary"
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
              {loading ? 'Please wait...' : (isReset ? 'Send reset link' : (isLogin ? 'Log In' : 'Sign Up'))}
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
            className="w-full bg-white border border-slate-300 text-natural-text font-medium py-2 px-4 rounded-md hover:bg-natural-sidebar transition-colors flex items-center justify-center gap-2 shadow-sm disabled:opacity-70 disabled:cursor-not-allowed text-sm"
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
            Continue with Google
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
          ) : (
            <p className="text-center text-sm text-natural-muted mt-6">
              {isLogin ? "Don't have an account? " : "Already have an account? "}
              <button
                onClick={() => switchMode(isLogin ? 'signup' : 'login')}
                className="text-natural-text hover:underline font-medium transition-colors"
              >
                {isLogin ? 'Sign up' : 'Log in'}
              </button>
            </p>
          )}
        </div>
      </div>

      {legalDoc && <LegalModal doc={legalDoc} onClose={() => setLegalDoc(null)} />}
    </div>
  );
}
