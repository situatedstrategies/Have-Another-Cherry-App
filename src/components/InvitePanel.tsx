import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Copy, Mail, MessageSquare, RefreshCw, Send, Share2 } from 'lucide-react';
import { auth, authHeader } from '../firebase';
import { labelClass } from '../lib/ui';
import {
  canShare,
  inviteLink,
  inviteMessage,
  inviteName as inviteWho,
  inviteSubject,
  mailtoHref,
  recordInvite,
  shareInvite,
  smsHref,
} from '../lib/invites';
import type { Group, GroupInvite } from '../types';
import { intlLocale } from '../i18n';

const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

interface Props {
  groupId: string;
  groupName: string;
  inviteCode: string;
  /** Who is inviting, for the message. */
  inviterName: string;
  /** The split to show in the server email, when the group has one to show. */
  split?: { name: string; split: number }[];
  /** Who has been asked so far and who has joined, when the group is loaded. */
  invites?: GroupInvite[];
  members?: Group['members'];
  /** Smaller type and spacing, for Settings. */
  compact?: boolean;
}

// The invite screen: the code, the link in a share sheet, a prefilled email
// or text, and the server email form, with the people asked so far and the
// people who joined. Everything except the server email goes out through the
// person's own apps after they tap Send there.
export default function InvitePanel({
  groupId,
  groupName,
  inviteCode,
  inviterName,
  split,
  invites,
  members,
  compact,
}: Props) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState<'code' | 'link' | null>(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');
  const [errorText, setErrorText] = useState('');
  const [resending, setResending] = useState<string | null>(null);

  const message = inviteMessage(inviterName, groupName, inviteCode);
  const subject = inviteSubject(inviterName, groupName);
  const link = inviteLink(inviteCode);

  const copy = (what: 'code' | 'link') => {
    navigator.clipboard
      .writeText(what === 'code' ? inviteCode : link)
      .then(() => {
        setCopied(what);
        setTimeout(() => setCopied(null), 2000);
        if (what === 'code') void recordInvite(groupId, { channel: 'code', name: '', by: uid() });
      })
      .catch(() => {});
  };

  const uid = () => auth.currentUser?.uid || '';

  const share = async () => {
    const ok = await shareInvite(subject, message, link);
    if (ok) void recordInvite(groupId, { channel: 'share', name: '', by: uid() });
  };

  const sendEmail = async (email: string, name: string) => {
    const res = await fetch('/api/send-invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify({
        email,
        groupName,
        inviteCode,
        recipientName: name,
        fromName: inviterName,
        split,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || t('group.inviteFallbackError'));
  };

  const handleServerEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setStatus('sending');
    try {
      await sendEmail(inviteEmail.trim(), inviteName.trim());
      // The address stands in as the name when none was typed, which is
      // also what makes a resend possible later.
      await recordInvite(groupId, {
        channel: 'email',
        name: inviteName.trim() || inviteEmail.trim(),
        by: uid(),
      });
      setStatus('success');
      setInviteEmail('');
      setInviteName('');
      setTimeout(() => setStatus('idle'), 3000);
    } catch (err: any) {
      setErrorText(
        err instanceof TypeError
          ? t('group.inviteFallbackError')
          : err?.message || t('group.inviteFallbackError')
      );
      setStatus('error');
      setTimeout(() => setStatus('idle'), 5000);
    }
  };

  // A resend needs an address; only entries whose name is one can be resent.
  const resendable = (inv: GroupInvite) => inv.channel === 'email' && isEmail(inviteWho(inv));
  const resend = async (inv: GroupInvite) => {
    const to = inviteWho(inv);
    if (!resendable(inv) || resending) return;
    setResending(to);
    try {
      await sendEmail(to, '');
      await recordInvite(groupId, { channel: 'email', name: to, by: uid() });
    } catch (e) {
      console.error('Resend failed', e);
    } finally {
      setResending(null);
    }
  };

  const joined = (members || []).filter((m) => m?.uid && !String(m.uid).startsWith('ghost_'));
  const asked = [...(invites || [])].sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, 12);
  const when = (iso: string) =>
    new Date(iso).toLocaleDateString(intlLocale(), { month: 'short', day: 'numeric' });

  const btn =
    'flex-1 min-w-0 py-2 px-2 text-xs font-bold rounded-xl border border-natural-border bg-white text-natural-text hover:border-natural-primary hover:text-natural-primary flex items-center justify-center gap-1.5 transition-colors';

  return (
    <div className={compact ? 'space-y-3' : 'space-y-5'}>
      <div className="bg-natural-bg rounded-xl p-4 text-center border border-natural-border">
        <p className={`${labelClass} mb-2`}>{t('group.inviteCode')}</p>
        <span className="text-2xl sm:text-3xl font-mono font-bold text-natural-text tracking-[0.15em] break-all">
          {inviteCode}
        </span>
        <div className="mt-3 flex items-center justify-center gap-4">
          <button
            type="button"
            onClick={() => copy('code')}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-natural-primary hover:text-natural-dark"
          >
            {copied === 'code' ? <Check size={14} /> : <Copy size={14} />}
            {copied === 'code' ? t('group.copied') : t('invite.copyCode')}
          </button>
          <button
            type="button"
            onClick={() => copy('link')}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-natural-primary hover:text-natural-dark"
          >
            {copied === 'link' ? <Check size={14} /> : <Copy size={14} />}
            {copied === 'link' ? t('group.copied') : t('invite.copyLink')}
          </button>
        </div>
      </div>

      <div>
        <p className="text-xs text-natural-muted mb-2">{t('invite.howToSend')}</p>
        <div className="flex gap-2">
          {canShare() && (
            <button type="button" onClick={share} className={btn}>
              <Share2 size={14} /> {t('invite.share')}
            </button>
          )}
          <a
            href={mailtoHref(subject, message)}
            onClick={() => void recordInvite(groupId, { channel: 'email', name: '', by: uid() })}
            className={btn}
          >
            <Mail size={14} /> {t('invite.email')}
          </a>
          <a
            href={smsHref(message)}
            onClick={() => void recordInvite(groupId, { channel: 'sms', name: '', by: uid() })}
            className={btn}
          >
            <MessageSquare size={14} /> {t('invite.text')}
          </a>
        </div>
        <p className="text-[11px] text-natural-muted mt-2">{t('invite.nothingSentForYou')}</p>
      </div>

      <form
        onSubmit={handleServerEmail}
        className="p-4 bg-natural-sage/20 border border-natural-sage/30 rounded-xl"
      >
        <p className="text-sm font-bold text-natural-text mb-2">{t('invite.weEmailThem')}</p>
        <input
          type="text"
          placeholder={t('group.theirName')}
          value={inviteName}
          onChange={(e) => setInviteName(e.target.value)}
          className="w-full mb-2 px-3 py-2 bg-white border border-natural-border focus:border-natural-primary rounded-lg text-sm outline-none transition-all placeholder-natural-muted/60"
        />
        <div className="flex gap-2">
          <input
            type="email"
            required
            placeholder={t('auth.email')}
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            className="flex-1 px-3 py-2 bg-white border border-natural-border focus:border-natural-primary rounded-lg text-sm outline-none transition-all placeholder-natural-muted/60"
          />
          <button
            type="submit"
            disabled={status === 'sending'}
            aria-label={t('group.sendInvite')}
            className="bg-natural-primary text-white p-2 rounded-lg hover:bg-natural-primary-ink transition-colors disabled:opacity-50"
          >
            {status === 'sending' ? (
              <span className="animate-spin inline-block">◌</span>
            ) : (
              <Send size={18} />
            )}
          </button>
        </div>
        {status === 'success' && (
          <p className="text-xs text-natural-primary font-medium mt-2">{t('group.inviteSent')}</p>
        )}
        {status === 'error' && (
          <p className="text-xs text-natural-primary font-medium mt-2">{errorText}</p>
        )}
      </form>

      {(joined.length > 0 || asked.length > 0) && (
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <p className={`${labelClass} mb-1.5`}>{t('invite.joined')}</p>
            {joined.length === 0 ? (
              <p className="text-xs text-natural-muted">{t('invite.nobodyYet')}</p>
            ) : (
              <ul className="space-y-1">
                {joined.map((m) => (
                  <li key={m.uid} className="text-xs text-natural-text flex items-center gap-1.5">
                    <Check size={12} className="text-natural-primary" /> {m.name}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <p className={`${labelClass} mb-1.5`}>{t('invite.asked')}</p>
            {asked.length === 0 ? (
              <p className="text-xs text-natural-muted">{t('invite.nobodyYet')}</p>
            ) : (
              <ul className="space-y-1">
                {asked.map((inv, i) => (
                  <li
                    key={`${inv.at}-${i}`}
                    className="text-xs text-natural-muted flex items-center justify-between gap-2"
                  >
                    <span className="min-w-0 truncate">
                      {t(`invite.channel.${inv.channel}`)}
                      {inviteWho(inv) ? `: ${inviteWho(inv)}` : ''} · {when(inv.at)}
                    </span>
                    {resendable(inv) && (
                      <button
                        type="button"
                        onClick={() => resend(inv)}
                        disabled={resending === inviteWho(inv)}
                        className="shrink-0 text-natural-primary font-bold inline-flex items-center gap-1 hover:underline disabled:opacity-50"
                      >
                        <RefreshCw
                          size={11}
                          className={resending === inviteWho(inv) ? 'animate-spin' : ''}
                        />
                        {t('invite.resend')}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
