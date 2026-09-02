// Web push (FCM in the browser). The counterpart of the mobile apps'
// PushService: keeps this browser's device token on the signed-in user's doc
// as `fcmTokens: { token: updatedAtIso }`, so the server's ledger-event and
// gentle-reminder sends reach the web too.
//
// Everything degrades cleanly: no VAPID key configured, an unsupported
// browser, or a denied permission all just mean "no web push", never an
// error the user sees.

import { getMessaging, getToken, deleteToken, onMessage, isSupported } from 'firebase/messaging';
import { doc, setDoc, updateDoc, deleteField } from 'firebase/firestore';
import { app, db, fcmVapidKey } from '../firebase';

export type PushStatus = 'granted' | 'denied' | 'default' | 'unavailable';

// Synchronous best guess (no support probe); use webPushSupported() before
// acting on it.
export function pushPermission(): PushStatus {
  if (typeof Notification === 'undefined' || !fcmVapidKey) return 'unavailable';
  return Notification.permission as PushStatus;
}

export async function webPushSupported(): Promise<boolean> {
  if (!fcmVapidKey || typeof Notification === 'undefined') return false;
  try {
    return await isSupported();
  } catch {
    return false;
  }
}

// Ask for permission (a no-op if already granted) and register this browser's
// token. Call from a user gesture for the first ask; safe to call silently
// when permission is already granted.
export async function enableWebPush(uid: string): Promise<PushStatus> {
  if (!(await webPushSupported())) return 'unavailable';
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission as PushStatus;
  try {
    const token = await getToken(getMessaging(app), { vapidKey: fcmVapidKey });
    if (token) {
      await setDoc(
        doc(db, 'users', uid),
        { fcmTokens: { [token]: new Date().toISOString() } },
        { merge: true },
      );
    }
  } catch (e) {
    console.error('Web push registration failed', e);
  }
  return 'granted';
}

// Sign-out hygiene: drop this browser's token from the doc and invalidate it,
// so a shared computer stops receiving someone else's nudges.
export async function disableWebPush(uid: string): Promise<void> {
  try {
    if (!(await webPushSupported()) || Notification.permission !== 'granted') return;
    const messaging = getMessaging(app);
    const token = await getToken(messaging, { vapidKey: fcmVapidKey }).catch(() => null);
    if (token) {
      await updateDoc(doc(db, 'users', uid), { [`fcmTokens.${token}`]: deleteField() }).catch(() => {});
      await deleteToken(messaging).catch(() => {});
    }
  } catch {
    // Best effort; sign-out must never be blocked by push cleanup.
  }
}

// Messages that arrive while the app is open in the foreground are not shown
// by the browser; surface them through the app's own toast instead. Returns
// an unsubscribe function.
export async function listenForegroundPush(
  cb: (title: string, body: string) => void,
): Promise<() => void> {
  if (!(await webPushSupported()) || Notification.permission !== 'granted') return () => {};
  try {
    return onMessage(getMessaging(app), payload => {
      const n = payload.notification;
      if (n?.title || n?.body) cb(n?.title || 'Have Another Cherry', n?.body || '');
    });
  } catch {
    return () => {};
  }
}
