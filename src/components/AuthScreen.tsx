import React, { useState } from 'react';
import { signInWithPopup, GoogleAuthProvider, createUserWithEmailAndPassword, signInWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { auth, appleProvider } from '../firebase';
import { Mail, Lock, User } from 'lucide-react';

function CherryLogo({ className = "h-10 w-10" }: { className?: string }) {
  return (
    <img src="https://static1.squarespace.com/static/6a53ee56387dd65e26655a70/t/6a681089fdfc105a22ca099d/1785204873461/cherry2transparent.png" alt="Cherry Logo" className={className} style={{ objectFit: 'contain' }} />
  );
}

export default function AuthScreen() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  
  const handleAppleAuth = async () => {
    try {
      setLoading(true);
      await signInWithPopup(auth, appleProvider);
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

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
                  minLength={6}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
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
            onClick={handleAppleAuth}
            type="button"
            disabled={loading}
            className="w-full bg-black text-white font-medium py-2 px-4 rounded-md hover:bg-gray-900 transition-colors flex items-center justify-center gap-2 shadow-sm disabled:opacity-70 disabled:cursor-not-allowed mb-3 text-sm"
          >
            <svg className="w-4 h-4" viewBox="0 0 384 512">
              <path fill="currentColor" d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z"/>
            </svg>
            Continue with Apple
          </button>
          
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
