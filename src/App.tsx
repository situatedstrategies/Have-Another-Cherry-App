import { lazy, Suspense, useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { useTranslation } from 'react-i18next';
import { auth, sessionLikelyRestoring } from './firebase';
import AuthScreen from './components/AuthScreen';
import LoadingScreen from './components/LoadingScreen';

// The signed-in app (SignedInApp.tsx: the household, the ledger, reports, the
// plan, every modal and the hooks that feed them) is loaded only once someone
// is signed in. A visitor on the sign-in screen downloads the sign-in screen,
// not the whole app: before this split the entry chunk was 3.3 MB (720 KB
// over the wire) and the form could not appear until all of it had arrived.
const loadSignedInApp = () => import('./SignedInApp');
const SignedInApp = lazy(loadSignedInApp);

// A session that is about to be restored will need that code in a moment, so
// its download starts now and overlaps Auth reading the stored session.
if (sessionLikelyRestoring()) void loadSignedInApp();

export default function App() {
  const { t } = useTranslation();
  const [signedIn, setSignedIn] = useState(() => auth.currentUser !== null);
  useEffect(() => onAuthStateChanged(auth, (user) => setSignedIn(user !== null)), []);

  if (!signedIn) return <AuthScreen />;
  return (
    <Suspense fallback={<LoadingScreen label={t('common.loadingLedger')} />}>
      <SignedInApp />
    </Suspense>
  );
}
