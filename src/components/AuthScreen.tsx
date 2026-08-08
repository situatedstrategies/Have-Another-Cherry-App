import React, { useState } from 'react';
import { signInWithPopup, GoogleAuthProvider, createUserWithEmailAndPassword, signInWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { auth } from '../firebase';
import { Mail, Lock, User } from 'lucide-react';

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

  // Password policy for new accounts: at least 8 chars, a letter, a number, and a special character.
  const passwordChecks = {
    length: password.length >= 8,
    letter: /[A-Za-z]/.test(password),
    number: /[0-9]/.test(password),
    special: /[^A-Za-z0-9]/.test(password),
  };
  const passwordValid = Object.values(passwordChecks).every(Boolean);

  
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

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!isLogin) {
      if (!passwordValid) {
        setError('Password must be at least 8 characters and include a letter, a number, and a special character.');
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
              {isLogin ? 'Log in to your account' : 'Create a new account'}
            </h2>
          </div>

          {error && (
            <div className="bg-red-50 text-red-600 p-3 rounded-md mb-6 text-sm font-medium border border-red-100 flex items-start gap-2">
              <span className="shrink-0">⚠️</span>
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleEmailAuth} className="space-y-4 mb-6">
            {!isLogin && (
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
              {!isLogin && password.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {[
                    { ok: passwordChecks.length, label: 'At least 8 characters' },
                    { ok: passwordChecks.letter, label: 'Contains a letter' },
                    { ok: passwordChecks.number, label: 'Contains a number' },
                    { ok: passwordChecks.special, label: 'Contains a special character' },
                  ].map((req) => (
                    <li key={req.label} className={`flex items-center gap-1.5 text-xs ${req.ok ? 'text-green-600' : 'text-natural-muted'}`}>
                      <span>{req.ok ? '✓' : '○'}</span> {req.label}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {!isLogin && (
              <label className="flex items-start gap-2 text-xs text-natural-muted cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={agreeTerms}
                  onChange={(e) => setAgreeTerms(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-natural-primary focus:ring-natural-primary"
                />
                <span>
                  I agree to the <span className="font-semibold text-natural-text">Terms of Service</span> and{' '}
                  <span className="font-semibold text-natural-text">Privacy Policy</span>.
                </span>
              </label>
            )}

            <button
              type="submit"
              disabled={loading || (!isLogin && (!passwordValid || !agreeTerms))}
              className="w-full bg-natural-primary text-white font-medium py-2 px-4 rounded-md hover:bg-natural-primary/90 transition-colors shadow-sm disabled:opacity-70 disabled:cursor-not-allowed mt-2"
            >
              {loading ? 'Please wait...' : (isLogin ? 'Log In' : 'Sign Up')}
            </button>
          </form>

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

          <p className="text-center text-sm text-natural-muted mt-6">
            {isLogin ? "Don't have an account? " : "Already have an account? "}
            <button
              onClick={() => setIsLogin(!isLogin)}
              className="text-natural-text hover:underline font-medium transition-colors"
            >
              {isLogin ? 'Sign up' : 'Log in'}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
