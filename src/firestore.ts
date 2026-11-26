import {
  initializeFirestore,
  memoryLocalCache,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import { app, offlineCacheEnabled } from './firebase';

// Firestore lives in its own module so the sign-in screen does not load it:
// firebase.ts (the app, Auth, App Check) is on every visitor's critical path,
// while the database is only read once someone is signed in. The sign-in
// screen's one write, the consent record for a new account, imports this
// module on demand. Everything else imports `db` from here statically.
//
// Offline cache: see offlineCacheEnabled in firebase.ts. With "keep me signed
// in" on, Firestore keeps a copy of the documents this browser has read in
// IndexedDB, so a repeat visit shows the profile and the household straight
// from disk while the server confirms in the background. Without it the
// cache stays in memory: someone who did not ask to be remembered on this
// browser leaves nothing behind on its disk.
export const db = initializeFirestore(
  app,
  {
    localCache: offlineCacheEnabled
      ? persistentLocalCache({ tabManager: persistentMultipleTabManager() })
      : memoryLocalCache(),
  },
  firebaseConfig.firestoreDatabaseId
);
