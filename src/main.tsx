import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import AuthActionHandler from './components/AuthActionHandler.tsx';
import './index.css';

// There is no router in this app - App.tsx switches views with local state. The
// Firebase Auth action handler needs a real URL though, because Firebase puts it
// in emails, so it gets picked here by pathname before App mounts.
//
// Mounting it instead of <App/> rather than inside it is deliberate: someone
// clicking a reset link is signed out, so App would render the landing page,
// and App's Firestore subscriptions have no business running on this page.
const isAuthAction = window.location.pathname.replace(/\/+$/, '') === '/auth/action';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isAuthAction ? <AuthActionHandler /> : <App />}
  </StrictMode>,
);
