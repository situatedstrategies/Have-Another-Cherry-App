// The invite link and message, pure so they can be checked in Node; the
// Firestore record and the URL capture live in invites.ts.
import { t } from '../i18n';

// The link an invite carries (the shared contract): path based, so the
// Android App Links filter on /open/ catches it and the installed apps open
// on the join step. When no app is installed the site forwards it to
// app.haveanothercherry.com/?invite=CODE&signup=1, where captureInviteFromUrl
// picks the code up. Only this shared text uses the path form.
export const INVITE_LINK_BASE = 'https://haveanothercherry.com/open/invite/';
export const PENDING_INVITE_KEY = 'hac_pending_invite';
export const CODE_RE = /^[A-Z0-9-]{4,24}$/;

/** The link an invite carries; opens the app on the join step with the code filled. */
export function inviteLink(inviteCode: string): string {
  return `${INVITE_LINK_BASE}${encodeURIComponent(inviteCode)}`;
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
