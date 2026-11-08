import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { analytics } from '@heycatch/sdk';
import App from './App.tsx';
import AuthActionHandler from './components/AuthActionHandler.tsx';
import './index.css';

// HeyCatch product analytics (https://heycatch.ai/agents.md). Module scope, in
// the entry file, before anything renders: pageviews, clicks and view changes
// are captured from here on; identity lives in useAuthSession and the business
// events (signup_completed, ad_free_purchased, the latter meaning a Cherry +
// purchase; the name is kept for continuity) in AuthScreen and the server's
// RevenueCat webhook. The key is publishable, so it is inlined on purpose.
analytics.init({
  projectKey: 'hck_pk_X3i5WmitT5F42yX_weMf1PIith45MDeK',
  install: {
    framework: 'vite-react',
    frameworkVersion: '6',
    agent: 'claude-code',
  },
});

// There is no router in this app - App.tsx switches views with local state. The
// Firebase Auth action handler needs a real URL though, because Firebase puts it
// in emails, so it gets picked here by pathname before App mounts.
//
// Mounting it instead of <App/> rather than inside it is deliberate: someone
// clicking a reset link is signed out, so App would render the landing page,
// and App's Firestore subscriptions have no business running on this page.
const isAuthAction = window.location.pathname.replace(/\/+$/, '') === '/auth/action';

createRoot(document.getElementById('root')!).render(
  <StrictMode>{isAuthAction ? <AuthActionHandler /> : <App />}</StrictMode>
);
