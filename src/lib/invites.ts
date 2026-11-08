// Invites that reach people: one link that opens the app on the join step,
// and the share sheet, mail and text handoffs that carry it. Nothing is sent
// from here; the person's own messaging app does the sending after they tap
// Send in it. The server email (POST /api/send-invite) is the one channel
// the app sends itself, on request.
import { arrayUnion, doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import type { GroupInvite } from '../types';
import { track } from './analytics';
export {
  INVITE_LINK_BASE,
  inviteLink,
  inviteMessage,
  inviteSubject,
  mailtoHref,
  smsHref,
} from './inviteLinks';
import { PENDING_INVITE_KEY, CODE_RE } from './inviteLinks';
export { PENDING_INVITE_KEY } from './inviteLinks';

export function canShare(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.share === 'function';
}

/** True when a share sheet opened and completed; false when cancelled or unsupported. */
export async function shareInvite(title: string, text: string, url: string): Promise<boolean> {
  if (!canShare()) return false;
  try {
    await navigator.share({ title, text, url });
    return true;
  } catch {
    return false;
  }
}

/** Appends to groups/{id}.invites so the invite screen shows who was asked. */
export async function recordInvite(
  groupId: string,
  invite: Omit<GroupInvite, 'at'>
): Promise<void> {
  const entry: GroupInvite = {
    ...invite,
    to: invite.to.slice(0, 120),
    at: new Date().toISOString(),
  };
  try {
    await updateDoc(doc(db, 'groups', groupId), { invites: arrayUnion(entry) });
  } catch (e) {
    console.error('Could not record the invite', e);
  }
  track({ name: 'invite_sent', channel: invite.channel });
}

/** A code arriving as `?invite=CODE` (the site's forward of an /open/invite/
 *  link, or a direct app link) is kept until the person is signed in and on
 *  the join step. */
export function captureInviteFromUrl(): void {
  if (typeof window === 'undefined') return;
  try {
    const params = new URLSearchParams(window.location.search);
    const raw = (params.get('invite') || '').trim().toUpperCase();
    if (!raw || !CODE_RE.test(raw)) return;
    localStorage.setItem(PENDING_INVITE_KEY, raw);
    params.delete('invite');
    const rest = params.toString();
    const clean = `${window.location.pathname}${rest ? `?${rest}` : ''}${window.location.hash}`;
    window.history.replaceState(null, '', clean);
  } catch {
    // Storage can be unavailable; the person can still type the code.
  }
}

export function pendingInvite(): string | null {
  try {
    const v = localStorage.getItem(PENDING_INVITE_KEY);
    return v && CODE_RE.test(v) ? v : null;
  } catch {
    return null;
  }
}

export function clearPendingInvite(): void {
  try {
    localStorage.removeItem(PENDING_INVITE_KEY);
  } catch {
    // nothing to clear
  }
}
