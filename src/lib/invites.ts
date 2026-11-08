// Invites that reach people: one link that opens the app on the join step,
// and the share sheet, mail and text handoffs that carry it. Nothing is sent
// from here; the person's own messaging app does the sending after they tap
// Send in it. The server email (POST /api/send-invite) is the one channel
// the app sends itself, on request.
import { arrayUnion, doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { t } from '../i18n';
import type { GroupInvite } from '../types';
import { track } from './analytics';

export const APP_ORIGIN = 'https://app.haveanothercherry.com';
export const PENDING_INVITE_KEY = 'hac_pending_invite';
const CODE_RE = /^[A-Z0-9-]{4,24}$/;

/** The link an invite carries; opens the app on the join step with the code filled. */
export function inviteLink(inviteCode: string): string {
  return `${APP_ORIGIN}/?invite=${encodeURIComponent(inviteCode)}`;
}

/** The one-paragraph message, in the inviter's language. */
export function inviteMessage(inviterName: string, groupName: string, inviteCode: string): string {
  return t('invite.message', {
    name: inviterName,
    group: groupName || t('app.unnamedGroup'),
    code: inviteCode,
    link: inviteLink(inviteCode),
  });
}

export function inviteSubject(inviterName: string, groupName: string): string {
  return t('invite.subject', { name: inviterName, group: groupName || t('app.unnamedGroup') });
}

export function mailtoHref(subject: string, body: string, to = ''): string {
  return `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

// `sms:?&body=` is the form both iOS and Android accept for a prefilled text
// with no recipient; the contacts picker in the messaging app fills the number.
export function smsHref(body: string): string {
  return `sms:?&body=${encodeURIComponent(body)}`;
}

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

/** A code arriving on the URL is kept until the person is signed in and on the join step. */
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
