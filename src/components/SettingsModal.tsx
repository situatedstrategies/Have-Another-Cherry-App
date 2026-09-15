import React, { useState, useEffect } from 'react';
import {
  Settings,
  LogOut,
  Copy,
  Cloud,
  Shield,
  Check,
  X,
  Edit2,
  Bell,
  UserPlus,
  Mail,
  ChevronDown,
} from 'lucide-react';
import { Group } from '../types';
import {
  getFullDefaultSplit,
  joinedUids,
  seatAddBlocker,
  suggestedSeatPercent,
  withAddedSeat,
  MAX_ADDED_SEATS,
} from '../lib/members';
import { PushStatus, pushPermission, webPushSupported, enableWebPush } from '../lib/push';
import Modal from './Modal';
import { labelClass } from '../lib/ui';
import { formatIncome } from '../lib/income';

interface SettingsModalProps {
  onClose: () => void;
  userProfile: any;
  currentUser: any;
  group: Group;
  groupUsers: Record<string, any>;
  onSaveName: (name: string) => void;
  /** Save the signed-in member's yearly income (validated; stored as the
   *  plain number string both clients read). Resolves true when it saved. */
  onSaveIncome: (raw: string) => Promise<boolean>;
  /** Newsletters and offers. Off by default; this switch is the only place it is asked. */
  onSaveMarketingOptIn: (optIn: boolean) => Promise<void>;
  onRetakeQuiz: () => void;
  onRecalculateSplit: () => Promise<void> | void;
  /** Every member's decrypted Venmo/Zelle handles, keyed by uid, so the
   *  roster shows how to pay each person. */
  paymentHandlesByUid?: Record<string, { venmo?: string; zelle?: string }>;
  /** Save an edited standing split (joined uid -> %, plus pending-seat %s in
   *  availableSplits order). Resolves true when it saved. */
  onSaveDefaultSplit: (joined: Record<string, number>, ghostSplits: number[]) => Promise<boolean>;
  /** Email the invite code to the person holding a pending seat. */
  onResendInvite: (memberName: string, email: string) => Promise<void> | void;
  /** Add a pending seat (name + percentage); everyone else is rescaled. With
   *  an email, the invite is sent right away. */
  onAddSeat: (name: string, percent: number, email?: string) => Promise<void>;
  /** Remove the pending seat at this index in availableSplits. */
  onRemoveSeat: (index: number) => Promise<void>;
  onLeaveGroup: () => void;
  onOpenBackup: () => void;
  onOpenPrivacy: () => void;
  onSignOut: () => void;
  /** Optional extra block (thresholds, payment handles, and so on) rendered up top. */
  extraSection?: React.ReactNode;
}

const RESERVED_NAMES = ['Anonymous', 'Unknown'];

export default function SettingsModal({
  onClose,
  userProfile,
  currentUser,
  group,
  groupUsers,
  onSaveName,
  onSaveIncome,
  onSaveMarketingOptIn,
  onRetakeQuiz,
  onRecalculateSplit,
  paymentHandlesByUid,
  onSaveDefaultSplit,
  onResendInvite,
  onAddSeat,
  onRemoveSeat,
  onLeaveGroup,
  onOpenBackup,
  onOpenPrivacy,
  onSignOut,
  extraSection,
}: SettingsModalProps) {
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');

  // The roster: each joined member's row opens into a detail card with their
  // income and financial style, matching the mobile Settings roster. One row
  // at a time on purpose - the section stays a roster, not an accordion of
  // five open dossiers. Your own income is editable (from the card or the
  // User Profile row - one editor, two doorways); everyone else's is theirs
  // to set, which is also all the security rules allow.
  const [expandedUid, setExpandedUid] = useState<string | null>(null);
  const [incomeEditorAt, setIncomeEditorAt] = useState<'profile' | 'roster' | null>(null);
  const [incomeInput, setIncomeInput] = useState('');
  const [incomeBusy, setIncomeBusy] = useState(false);
  const openIncomeEditor = (at: 'profile' | 'roster') => {
    setIncomeInput(userProfile?.income || '');
    setIncomeEditorAt(at);
  };
  const submitIncome = async (e: React.FormEvent) => {
    e.preventDefault();
    if (incomeBusy) return;
    setIncomeBusy(true);
    try {
      if (await onSaveIncome(incomeInput)) setIncomeEditorAt(null);
    } finally {
      setIncomeBusy(false);
    }
  };
  const [marketingBusy, setMarketingBusy] = useState(false);
  const handleMarketingChange = async (optIn: boolean) => {
    if (marketingBusy) return;
    setMarketingBusy(true);
    try {
      await onSaveMarketingOptIn(optIn);
    } finally {
      setMarketingBusy(false);
    }
  };

  // Growing the group: a couple can bring in up to two more people without
  // starting a new group. The form takes a name and the newcomer's share and
  // previews how everyone else's share shrinks to make room.
  const [addingSeat, setAddingSeat] = useState(false);
  const [seatName, setSeatName] = useState('');
  const [seatPercent, setSeatPercent] = useState('');
  const [seatEmail, setSeatEmail] = useState('');
  const [seatBusy, setSeatBusy] = useState(false);
  const [seatError, setSeatError] = useState('');
  const [removingSeat, setRemovingSeat] = useState<number | null>(null);
  const seatBlocker = seatAddBlocker(group);
  const growthLeft = MAX_ADDED_SEATS - Math.max(0, Number(group?.addedSeats) || 0);

  // Re-sending an invite for a pending seat: an inline email field on the
  // roster row rather than a browser prompt.
  const [resendFor, setResendFor] = useState<string | null>(null);
  const [resendEmail, setResendEmail] = useState('');
  const [resendBusy, setResendBusy] = useState(false);

  // Copy feedback for the invite code button.
  const [copied, setCopied] = useState(false);
  const copyInviteCode = () => {
    navigator.clipboard
      .writeText(group?.inviteCode || '')
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {});
  };

  const [copiedHandle, setCopiedHandle] = useState<string | null>(null);
  const copyHandle = (text: string) => {
    navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopiedHandle(text);
        setTimeout(() => setCopiedHandle(null), 2000);
      })
      .catch(() => {});
  };

  const [recalcBusy, setRecalcBusy] = useState(false);
  const recalculate = async () => {
    if (recalcBusy) return;
    setRecalcBusy(true);
    try {
      await onRecalculateSplit();
    } finally {
      setRecalcBusy(false);
    }
  };

  // Direct split editing: percentage inputs per roster row, saved as the new
  // standing ratio. Other members learn about it from the dashboard banner.
  const [editingSplit, setEditingSplit] = useState(false);
  const [splitDraft, setSplitDraft] = useState<Record<string, string>>({});
  const [splitBusy, setSplitBusy] = useState(false);

  const openSplitEditor = () => {
    const draft: Record<string, string> = {};
    if (group) {
      for (const [uid, pct] of Object.entries(getFullDefaultSplit(group))) {
        draft[uid] = String(pct);
      }
    }
    setSplitDraft(draft);
    setEditingSplit(true);
  };

  const splitDraftTotal = Object.values(splitDraft).reduce((t, v) => t + (parseFloat(v) || 0), 0);

  const saveSplit = async () => {
    if (splitBusy || !group) return;
    const joined: Record<string, number> = {};
    const ghostSplits: number[] = [];
    for (const uid of Object.keys(getFullDefaultSplit(group))) {
      const value = parseFloat(splitDraft[uid]) || 0;
      if (uid.startsWith('ghost_')) {
        ghostSplits[Number(uid.slice('ghost_'.length))] = value;
      } else {
        joined[uid] = value;
      }
    }
    setSplitBusy(true);
    try {
      const saved = await onSaveDefaultSplit(joined, ghostSplits);
      if (saved) setEditingSplit(false);
    } finally {
      setSplitBusy(false);
    }
  };

  const openSeatForm = () => {
    setSeatName('');
    setSeatPercent(String(suggestedSeatPercent(group)));
    setSeatEmail('');
    setSeatError('');
    setAddingSeat(true);
  };

  const submitResend = async (e: React.FormEvent, memberName: string) => {
    e.preventDefault();
    const email = resendEmail.trim();
    if (!email || resendBusy) return;
    setResendBusy(true);
    try {
      await onResendInvite(memberName, email);
      setResendFor(null);
      setResendEmail('');
    } finally {
      setResendBusy(false);
    }
  };

  let seatPreview: { name: string; pct: number }[] | null = null;
  if (addingSeat && group) {
    try {
      const next = withAddedSeat(group, seatName || 'New person', parseFloat(seatPercent));
      seatPreview = [
        ...joinedUids(group).map((uid) => ({
          name:
            groupUsers[uid]?.name || group.members?.find((m) => m.uid === uid)?.name || 'Member',
          pct: next.defaultSplit[uid],
        })),
        ...next.availableSplits.map((p) => ({ name: p.name, pct: p.split })),
      ];
    } catch {
      seatPreview = null;
    }
  }

  const submitSeat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (seatBusy) return;
    setSeatError('');
    try {
      withAddedSeat(group, seatName, parseFloat(seatPercent));
    } catch (err: any) {
      setSeatError(err.message);
      return;
    }
    setSeatBusy(true);
    try {
      await onAddSeat(seatName, parseFloat(seatPercent), seatEmail.trim() || undefined);
      setAddingSeat(false);
    } catch (err: any) {
      setSeatError(err?.message || 'Could not add that person. Please try again.');
    } finally {
      setSeatBusy(false);
    }
  };

  const removeSeat = async (index: number) => {
    if (removingSeat !== null) return;
    setRemovingSeat(index);
    try {
      await onRemoveSeat(index);
    } finally {
      setRemovingSeat(null);
    }
  };

  // Web push state. 'unavailable' hides the section (no VAPID key configured,
  // or a browser without push); the first permission ask lives behind this
  // button so the browser dialog is never unprompted.
  const [pushState, setPushState] = useState<PushStatus>('unavailable');
  const [enablingPush, setEnablingPush] = useState(false);
  useEffect(() => {
    (async () => {
      setPushState((await webPushSupported()) ? pushPermission() : 'unavailable');
    })();
  }, []);

  const handleEnablePush = async () => {
    if (!currentUser?.uid || enablingPush) return;
    setEnablingPush(true);
    try {
      setPushState(await enableWebPush(currentUser.uid));
    } finally {
      setEnablingPush(false);
    }
  };

  const hasRealName = userProfile?.name && !RESERVED_NAMES.includes(userProfile.name);
  const displayName = hasRealName ? userProfile.name : currentUser?.displayName || 'Add your name';
  const fp = userProfile?.financialProfile;

  const saveName = () => {
    onSaveName(nameInput.trim());
    setEditingName(false);
  };

  return (
    <Modal
      onClose={onClose}
      icon={<Settings className="h-5 w-5 text-natural-primary" />}
      title="Account Settings"
      bodyClassName="p-6 space-y-6"
      footer={
        <button
          onClick={onSignOut}
          className="w-full flex items-center justify-center gap-2 text-sm font-bold text-natural-primary hover:text-natural-dark bg-white hover:bg-natural-primary/5 border border-natural-primary/25 py-2.5 rounded-xl transition-colors shadow-sm"
        >
          <LogOut size={16} /> Sign Out
        </button>
      }
    >
      {extraSection}

      {/* Notifications (web push) */}
      {pushState !== 'unavailable' && (
        <div>
          <h3 className={`${labelClass} mb-2`}>Notifications</h3>
          <div className="bg-natural-bg/50 p-4 rounded-xl border border-natural-border flex items-center justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <Bell className="h-4 w-4 text-natural-primary mt-0.5 shrink-0" />
              <p className="text-xs text-natural-muted leading-relaxed">
                Get an alert in this browser when someone adds to the ledger or sends a gentle
                reminder. Never any amounts, just who and which group.
              </p>
            </div>
            {pushState === 'granted' ? (
              <span className="shrink-0 text-xs font-bold text-natural-primary flex items-center gap-1">
                <Check className="h-3.5 w-3.5" /> On
              </span>
            ) : pushState === 'denied' ? (
              <span className="shrink-0 text-xs font-semibold text-natural-muted text-right">
                Blocked in browser settings
              </span>
            ) : (
              <button
                onClick={handleEnablePush}
                disabled={enablingPush}
                className="shrink-0 text-xs font-bold text-white bg-natural-primary hover:bg-natural-primary-ink px-3 py-1.5 rounded-full shadow-sm transition-colors disabled:opacity-60"
              >
                {enablingPush ? 'Asking...' : 'Turn on'}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Email. Marketing email is opt-in and this is the only place it is
          asked: signup carries no pre-ticked box, because agreeing to the
          terms is not agreeing to a newsletter. The privacy policy points
          people here to change their mind. */}
      <div>
        <h3 className={`${labelClass} mb-2`}>Email</h3>
        <div className="bg-natural-bg/50 p-4 rounded-xl border border-natural-border">
          <label className="flex items-start gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={!!userProfile?.marketingOptIn}
              disabled={marketingBusy || !userProfile}
              onChange={(e) => handleMarketingChange(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-natural-border text-natural-primary focus:ring-natural-primary"
            />
            <span className="text-xs text-natural-muted leading-relaxed">
              <span className="font-semibold text-natural-text flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5 text-natural-primary" /> Newsletters and offers
              </span>
              Off unless you turn it on. Change it here any time. Emails the app has to send, such
              as invites and password resets, are not affected.
            </span>
          </label>
        </div>
      </div>

      {/* User profile */}
      <div>
        <h3 className={`${labelClass} mb-2`}>User Profile</h3>
        <div className="bg-natural-bg/50 p-4 rounded-xl border border-natural-border space-y-2">
          <div className="flex justify-between items-center gap-2">
            <span className="text-sm text-natural-muted">Name</span>
            {editingName ? (
              <div className="flex items-center gap-1.5">
                <input
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') saveName();
                    if (e.key === 'Escape') setEditingName(false);
                  }}
                  autoFocus
                  placeholder="Your name"
                  className="w-36 px-2 py-1 text-sm text-right border border-natural-border focus:border-natural-primary rounded-md outline-none"
                />
                <button
                  onClick={saveName}
                  className="text-natural-primary hover:text-natural-dark p-1"
                  title="Save"
                  aria-label="Save name"
                >
                  <Check size={16} />
                </button>
                <button
                  onClick={() => setEditingName(false)}
                  className="text-natural-muted hover:text-natural-text p-1"
                  title="Cancel"
                  aria-label="Cancel editing name"
                >
                  <X size={16} />
                </button>
              </div>
            ) : (
              <button
                onClick={() => {
                  setNameInput(hasRealName ? userProfile.name : currentUser?.displayName || '');
                  setEditingName(true);
                }}
                className="flex items-center gap-1.5 group"
                title="Edit your name"
              >
                <span className="text-sm font-semibold text-natural-text capitalize">
                  {displayName}
                </span>
                <Edit2 size={13} className="text-natural-muted group-hover:text-natural-primary" />
              </button>
            )}
          </div>
          <div className="flex justify-between items-center gap-2">
            <span className="text-sm text-natural-muted">Annual Income</span>
            {incomeEditorAt === 'profile' ? (
              <form onSubmit={submitIncome} className="flex items-center gap-1.5">
                <div className="relative">
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-natural-muted">
                    $
                  </span>
                  <input
                    autoFocus
                    inputMode="decimal"
                    value={incomeInput}
                    onChange={(e) => setIncomeInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') setIncomeEditorAt(null);
                    }}
                    placeholder="Yearly income"
                    aria-label="Your yearly income"
                    className="w-32 pl-5 pr-2 py-1 text-sm text-right font-mono border border-natural-border focus:border-natural-primary rounded-md outline-none"
                  />
                </div>
                <button
                  type="submit"
                  disabled={incomeBusy}
                  className="text-natural-primary hover:text-natural-dark p-1"
                  title="Save"
                  aria-label="Save income"
                >
                  <Check size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => setIncomeEditorAt(null)}
                  className="text-natural-muted hover:text-natural-text p-1"
                  title="Cancel"
                  aria-label="Cancel editing income"
                >
                  <X size={16} />
                </button>
              </form>
            ) : (
              <button
                onClick={() => openIncomeEditor('profile')}
                className="flex items-center gap-1.5 group"
                title="Edit your income"
              >
                <span className="text-sm font-semibold text-natural-text">
                  {formatIncome(userProfile?.income) || 'Not set yet'}
                </span>
                <Edit2 size={13} className="text-natural-muted group-hover:text-natural-primary" />
              </button>
            )}
          </div>
          {fp && (
            <div className="pt-2 mt-2 border-t border-natural-border">
              <span className="text-xs text-natural-muted block mb-1">Financial Style</span>
              <span className="text-sm font-semibold text-natural-primary block">{fp.type}</span>
              <p className="text-xs text-natural-text mt-1 leading-relaxed">{fp.description}</p>
              {Array.isArray(fp.traits) && fp.traits.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {fp.traits.map((t: string, i: number) => (
                    <span
                      key={i}
                      className="text-xs font-semibold text-natural-primary bg-natural-sage/40 border border-natural-primary/20 px-2 py-0.5 rounded-full"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              )}
              {fp.strengths && (
                <p className="text-xs text-natural-text mt-2">
                  <strong className="text-natural-muted">Strength:</strong> {fp.strengths}
                </p>
              )}
              {fp.watchouts && (
                <p className="text-xs text-natural-text mt-1">
                  <strong className="text-natural-muted">Watch-out:</strong> {fp.watchouts}
                </p>
              )}
              {fp.communicationStyle && (
                <p className="text-xs text-natural-text mt-1">
                  <strong className="text-natural-muted">Money talk:</strong>{' '}
                  {fp.communicationStyle}
                </p>
              )}
              {fp.quote && (
                <blockquote className="mt-3 text-xs italic text-natural-muted border-l-2 border-natural-primary/30 pl-2">
                  {fp.quote}
                </blockquote>
              )}
              <button
                onClick={onRetakeQuiz}
                className="mt-4 text-xs font-semibold text-natural-primary hover:underline"
              >
                Retake Profile Quiz
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Group details */}
      <div>
        <h3 className={`${labelClass} mb-2`}>Group Details</h3>
        <div className="bg-natural-sage/20 p-4 rounded-xl border border-natural-primary/20 space-y-4">
          <div className="flex justify-between items-center">
            <span className="text-sm text-natural-muted">Group Name</span>
            <span className="text-sm font-semibold text-natural-text">
              {group?.name || 'Unnamed Group'}
            </span>
          </div>

          <div className="border-t border-natural-border/50 pt-3">
            <span className="text-sm text-natural-muted block mb-2">Group Members</span>
            <div className="space-y-3">
              {group &&
                Object.entries(getFullDefaultSplit(group)).map(([uid, pct]) => {
                  const isGhost = uid.startsWith('ghost_');
                  const memberName = isGhost
                    ? (group.availableSplits?.find((_, i) => `ghost_${i}` === uid) as any)?.name ||
                      'Someone'
                    : groupUsers[uid]?.name || 'Someone';
                  return (
                    <div
                      key={uid}
                      className="text-sm border-b border-natural-border/30 pb-2 last:border-0 last:pb-0"
                    >
                      <div
                        className={`flex justify-between items-center${
                          !isGhost && !editingSplit ? ' cursor-pointer select-none' : ''
                        }`}
                        onClick={
                          !isGhost && !editingSplit
                            ? () => {
                                setExpandedUid(expandedUid === uid ? null : uid);
                                if (incomeEditorAt === 'roster') setIncomeEditorAt(null);
                              }
                            : undefined
                        }
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-natural-text font-semibold">
                            {memberName}
                            {!isGhost && uid === currentUser?.uid && (
                              <span className="text-natural-muted font-normal"> (you)</span>
                            )}
                          </span>
                          {editingSplit ? (
                            <span className="inline-flex items-center gap-1">
                              <input
                                type="number"
                                min="0"
                                max="100"
                                step="1"
                                value={splitDraft[uid] ?? ''}
                                onChange={(e) =>
                                  setSplitDraft((prev) => ({ ...prev, [uid]: e.target.value }))
                                }
                                aria-label={`${memberName}'s share of the split`}
                                className="w-16 px-2 py-1 bg-white border border-natural-border focus:border-natural-primary rounded-lg text-xs font-mono text-right outline-none"
                              />
                              <span className="text-xs font-mono text-natural-muted">%</span>
                            </span>
                          ) : (
                            <span className="text-xs font-mono text-natural-muted">
                              {Number(pct)}% split
                            </span>
                          )}
                        </div>
                        <div>
                          {!isGhost ? (
                            <span className="flex items-center gap-1.5">
                              <span className="text-xs bg-natural-sidebar text-natural-text px-2 py-0.5 rounded-full font-medium">
                                Joined
                              </span>
                              {!editingSplit && (
                                <ChevronDown
                                  size={14}
                                  aria-hidden
                                  className={`text-natural-muted transition-transform${
                                    expandedUid === uid ? ' rotate-180' : ''
                                  }`}
                                />
                              )}
                            </span>
                          ) : (
                            <div className="flex items-center gap-2">
                              <span className="text-xs bg-natural-primary/10 text-natural-primary px-2 py-0.5 rounded-full font-medium">
                                Pending
                              </span>
                              <button
                                onClick={() => {
                                  setResendFor(resendFor === uid ? null : uid);
                                  setResendEmail('');
                                }}
                                className="text-xs uppercase font-bold text-natural-primary hover:underline"
                              >
                                {resendFor === uid ? 'Cancel' : 'Resend Invite'}
                              </button>
                              <button
                                onClick={() => removeSeat(Number(uid.slice('ghost_'.length)))}
                                disabled={removingSeat !== null}
                                className="text-xs uppercase font-bold text-natural-muted hover:text-natural-primary hover:underline disabled:opacity-50"
                                title="Remove this pending seat and give its share back to everyone else"
                              >
                                {removingSeat === Number(uid.slice('ghost_'.length))
                                  ? 'Removing...'
                                  : 'Remove'}
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                      {isGhost && resendFor === uid && (
                        <form
                          onSubmit={(e) => submitResend(e, memberName)}
                          className="mt-2 flex gap-2"
                        >
                          <input
                            type="email"
                            required
                            autoFocus
                            value={resendEmail}
                            onChange={(e) => setResendEmail(e.target.value)}
                            placeholder="Email"
                            aria-label={`Email address for ${memberName}`}
                            className="flex-1 px-3 py-1.5 bg-white border border-natural-border focus:border-natural-primary rounded-lg text-xs outline-none"
                          />
                          <button
                            type="submit"
                            disabled={resendBusy || !resendEmail.trim()}
                            className="text-xs font-bold text-white bg-natural-primary hover:bg-natural-primary-ink px-3 py-1.5 rounded-lg disabled:opacity-60"
                          >
                            {resendBusy ? 'Sending...' : 'Send'}
                          </button>
                        </form>
                      )}
                      {/* The opened card under a member's row: income on top,
                          style below - the same card the mobile roster shows.
                          groupUsers holds each member's live profile (the
                          rules give group members read access for exactly
                          this); your own row uses userProfile, which is
                          fresher. */}
                      {!isGhost &&
                        !editingSplit &&
                        expandedUid === uid &&
                        (() => {
                          const isSelf = uid === currentUser?.uid;
                          const member = isSelf ? userProfile : groupUsers[uid];
                          const mfp = member?.financialProfile;
                          const income = formatIncome(member?.income);
                          return (
                            <div className="mt-2 mb-1 bg-white/70 border border-natural-border rounded-xl p-3 space-y-3">
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <span className="block text-[10px] font-mono font-semibold uppercase tracking-widest text-natural-muted mb-0.5">
                                    Annual income
                                  </span>
                                  {isSelf && incomeEditorAt === 'roster' ? null : income ? (
                                    <span className="text-base font-bold text-natural-text">
                                      {income}
                                    </span>
                                  ) : (
                                    <span className="text-xs text-natural-muted">
                                      {isSelf ? 'Not set yet' : 'Not shared yet'}
                                    </span>
                                  )}
                                </div>
                                {isSelf && incomeEditorAt !== 'roster' && (
                                  <button
                                    onClick={() => openIncomeEditor('roster')}
                                    className="flex items-center gap-1 text-xs font-bold text-natural-primary hover:underline shrink-0"
                                  >
                                    <Edit2 size={12} /> {income ? 'Edit' : 'Add'}
                                  </button>
                                )}
                              </div>
                              {isSelf && incomeEditorAt === 'roster' && (
                                <div className="space-y-1.5">
                                  <form onSubmit={submitIncome} className="flex items-center gap-2">
                                    <div className="relative flex-1">
                                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-natural-muted">
                                        $
                                      </span>
                                      <input
                                        autoFocus
                                        inputMode="decimal"
                                        value={incomeInput}
                                        onChange={(e) => setIncomeInput(e.target.value)}
                                        onKeyDown={(e) => {
                                          if (e.key === 'Escape') setIncomeEditorAt(null);
                                        }}
                                        placeholder="Yearly income"
                                        aria-label="Your yearly income"
                                        className="w-full pl-6 pr-3 py-1.5 bg-white border border-natural-border focus:border-natural-primary rounded-lg text-sm font-mono outline-none"
                                      />
                                    </div>
                                    <button
                                      type="submit"
                                      disabled={incomeBusy}
                                      className="text-xs font-bold text-white bg-natural-primary hover:bg-natural-primary-ink px-3 py-1.5 rounded-lg disabled:opacity-60"
                                    >
                                      {incomeBusy ? 'Saving...' : 'Save'}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setIncomeEditorAt(null)}
                                      className="text-xs font-semibold text-natural-muted hover:text-natural-text"
                                    >
                                      Cancel
                                    </button>
                                  </form>
                                  <p className="text-[11px] text-natural-muted">
                                    Approximate is fine. Your household can see it, and it powers
                                    the income-based split suggestion.
                                  </p>
                                </div>
                              )}
                              {/* How to pay this person. Stored encrypted on
                                  their own profile; readable here because the
                                  rules let group members read each other. */}
                              <div>
                                <span className="block text-[10px] font-mono font-semibold uppercase tracking-widest text-natural-muted mb-1">
                                  Payment handles
                                </span>
                                {(() => {
                                  const h = paymentHandlesByUid?.[uid];
                                  const rows = [
                                    h?.venmo
                                      ? { label: 'Venmo', text: `@${h.venmo.replace(/^@/, '')}` }
                                      : null,
                                    h?.zelle ? { label: 'Zelle', text: h.zelle } : null,
                                  ].filter(Boolean) as { label: string; text: string }[];
                                  if (rows.length === 0) {
                                    return (
                                      <span className="text-xs text-natural-muted">
                                        {isSelf
                                          ? 'Add yours under How people pay you.'
                                          : `${memberName} hasn't added any yet.`}
                                      </span>
                                    );
                                  }
                                  return (
                                    <div className="flex flex-wrap gap-x-4 gap-y-1">
                                      {rows.map((r) => (
                                        <button
                                          key={r.label}
                                          type="button"
                                          onClick={() => copyHandle(r.text)}
                                          title={`Copy ${memberName}'s ${r.label} handle`}
                                          className="text-xs text-natural-muted flex items-center gap-1 hover:text-natural-primary"
                                        >
                                          <span className="font-semibold">{r.label}</span>
                                          <span className="font-mono text-natural-text break-all">
                                            {r.text}
                                          </span>
                                          {copiedHandle === r.text ? (
                                            <Check size={11} />
                                          ) : (
                                            <Copy size={11} />
                                          )}
                                        </button>
                                      ))}
                                    </div>
                                  );
                                })()}
                              </div>
                              <div>
                                <span className="block text-[10px] font-mono font-semibold uppercase tracking-widest text-natural-muted mb-1">
                                  Financial style
                                </span>
                                {mfp ? (
                                  <div>
                                    <span className="text-sm font-semibold text-natural-primary block">
                                      {mfp.type}
                                    </span>
                                    {mfp.description && (
                                      <p className="text-xs text-natural-text mt-1 leading-relaxed">
                                        {mfp.description}
                                      </p>
                                    )}
                                    {Array.isArray(mfp.traits) && mfp.traits.length > 0 && (
                                      <div className="flex flex-wrap gap-1.5 mt-2">
                                        {mfp.traits.map((t: string, i: number) => (
                                          <span
                                            key={i}
                                            className="text-xs font-semibold text-natural-primary bg-natural-sage/40 border border-natural-primary/20 px-2 py-0.5 rounded-full"
                                          >
                                            {t}
                                          </span>
                                        ))}
                                      </div>
                                    )}
                                    {mfp.strengths && (
                                      <p className="text-xs text-natural-text mt-2">
                                        <strong className="text-natural-muted">Strengths:</strong>{' '}
                                        {mfp.strengths}
                                      </p>
                                    )}
                                    {mfp.watchouts && (
                                      <p className="text-xs text-natural-text mt-1">
                                        <strong className="text-natural-muted">
                                          Watch out for:
                                        </strong>{' '}
                                        {mfp.watchouts}
                                      </p>
                                    )}
                                    {mfp.communicationStyle && (
                                      <p className="text-xs text-natural-text mt-1">
                                        <strong className="text-natural-muted">
                                          Talking money with {isSelf ? 'you' : memberName}:
                                        </strong>{' '}
                                        {mfp.communicationStyle}
                                      </p>
                                    )}
                                    {mfp.quote && (
                                      <blockquote className="mt-2 text-xs italic text-natural-muted border-l-2 border-natural-primary/30 pl-2">
                                        {mfp.quote}
                                      </blockquote>
                                    )}
                                    {isSelf && (
                                      <button
                                        onClick={onRetakeQuiz}
                                        className="mt-3 text-xs font-semibold text-natural-primary hover:underline"
                                      >
                                        Retake Profile Quiz
                                      </button>
                                    )}
                                  </div>
                                ) : isSelf ? (
                                  <button
                                    onClick={onRetakeQuiz}
                                    className="text-xs font-bold text-natural-primary hover:underline"
                                  >
                                    Find your style
                                  </button>
                                ) : (
                                  <span className="text-xs text-natural-muted">
                                    {memberName} hasn&apos;t taken the style quiz yet.
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })()}
                    </div>
                  );
                })}
            </div>
            {/* Adjust the standing split directly. In edit mode the roster rows
                above become inputs; the total must land on exactly 100%. */}
            {!editingSplit ? (
              <button
                className="mt-3 w-full text-sm font-bold bg-white text-natural-primary py-2 rounded-lg border border-natural-border shadow-sm hover:border-natural-primary transition-colors"
                onClick={openSplitEditor}
              >
                Adjust Split
              </button>
            ) : (
              <div className="mt-3 space-y-2">
                <p
                  className={`text-xs font-mono text-center ${
                    Math.abs(splitDraftTotal - 100) <= 0.05
                      ? 'text-natural-muted'
                      : 'text-natural-primary font-bold'
                  }`}
                >
                  Total: {splitDraftTotal.toFixed(0)}%{' '}
                  {Math.abs(splitDraftTotal - 100) <= 0.05 ? '' : '— needs to be 100%'}
                </p>
                <div className="flex gap-2">
                  <button
                    className="flex-1 text-sm font-bold bg-white text-natural-muted py-2 rounded-lg border border-natural-border hover:text-natural-text transition-colors"
                    onClick={() => setEditingSplit(false)}
                    disabled={splitBusy}
                  >
                    Cancel
                  </button>
                  <button
                    className="flex-1 text-sm font-bold text-white bg-natural-primary hover:bg-natural-primary-ink py-2 rounded-lg transition-colors disabled:opacity-60"
                    onClick={saveSplit}
                    disabled={splitBusy || Math.abs(splitDraftTotal - 100) > 0.05}
                  >
                    {splitBusy ? 'Saving...' : 'Save New Split'}
                  </button>
                </div>
                <p className="text-[11px] text-natural-muted text-center">
                  Everyone in the group will see a note that the split changed.
                </p>
              </div>
            )}
            {/* Any roster of two or more. Pending seats keep their share; the
                incomes divide the rest. Old expenses are untouched: each one
                stores its own dollar shares. */}
            {joinedUids(group).length >= 2 && !editingSplit && (
              <>
                <button
                  className="mt-3 w-full text-sm font-bold bg-white text-natural-primary py-2 rounded-lg border border-natural-border shadow-sm hover:border-natural-primary transition-colors disabled:opacity-60"
                  onClick={recalculate}
                  disabled={recalcBusy}
                >
                  {recalcBusy ? 'Recalculating...' : 'Recalculate Using Reported Incomes'}
                </button>
                <p className="mt-1.5 text-xs text-natural-muted">
                  Applies to what you log from now on. Past expenses keep the shares they were
                  logged with.
                </p>
              </>
            )}

            {/* Grow the group. Every member may add a seat; the split is rescaled
                so the newcomer's share comes out of everyone proportionally. */}
            {!addingSeat ? (
              <div className="mt-3">
                <button
                  className="w-full flex items-center justify-center gap-2 text-sm font-bold bg-white text-natural-primary py-2 rounded-lg border border-natural-border shadow-sm hover:border-natural-primary transition-colors disabled:opacity-50 disabled:hover:border-natural-border"
                  onClick={openSeatForm}
                  disabled={!!seatBlocker}
                >
                  <UserPlus size={14} /> Add a Person
                </button>
                <p className="text-xs text-natural-muted mt-1.5 text-center">
                  {seatBlocker
                    ? seatBlocker
                    : `Bring in up to ${growthLeft === 1 ? 'one more person' : 'two more people'}. Everyone's share is rescaled to make room.`}
                </p>
              </div>
            ) : (
              <form
                onSubmit={submitSeat}
                className="mt-3 bg-white border border-natural-border rounded-lg p-3 space-y-3"
              >
                <div className="grid grid-cols-[1fr_5.5rem] gap-2">
                  <input
                    autoFocus
                    value={seatName}
                    onChange={(e) => setSeatName(e.target.value)}
                    placeholder="Their name"
                    maxLength={40}
                    className="px-3 py-2 bg-natural-bg/50 border border-natural-border focus:border-natural-primary rounded-lg text-sm outline-none"
                  />
                  <div className="relative">
                    <input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      max={100}
                      step={0.1}
                      value={seatPercent}
                      onChange={(e) => setSeatPercent(e.target.value)}
                      className="w-full pl-3 pr-7 py-2 bg-natural-bg/50 border border-natural-border focus:border-natural-primary rounded-lg text-sm font-mono outline-none"
                      aria-label="Their share of the split"
                    />
                    <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-natural-muted">
                      %
                    </span>
                  </div>
                </div>
                <div>
                  <input
                    type="email"
                    value={seatEmail}
                    onChange={(e) => setSeatEmail(e.target.value)}
                    placeholder="Email"
                    aria-label="Their email address (optional)"
                    className="w-full px-3 py-2 bg-natural-bg/50 border border-natural-border focus:border-natural-primary rounded-lg text-sm outline-none"
                  />
                  <p className="text-xs text-natural-muted mt-1">
                    Optional. With an email, the invite goes out as soon as the seat is added.
                  </p>
                </div>
                {seatPreview && (
                  <div className="text-xs text-natural-muted space-y-1">
                    <p className="font-bold uppercase tracking-wider text-[10px]">New split</p>
                    {seatPreview.map((row, i) => (
                      <div key={i} className="flex justify-between font-mono">
                        <span className="font-sans">{row.name}</span>
                        <span>{row.pct}%</span>
                      </div>
                    ))}
                  </div>
                )}
                {seatError && (
                  <p className="text-xs text-natural-primary font-medium">{seatError}</p>
                )}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setAddingSeat(false)}
                    className="flex-1 text-sm font-bold text-natural-muted py-2 rounded-lg border border-natural-border hover:text-natural-text"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={seatBusy}
                    className="flex-1 text-sm font-bold text-white bg-natural-primary hover:bg-natural-primary-ink py-2 rounded-lg disabled:opacity-60"
                  >
                    {seatBusy ? 'Adding...' : seatEmail.trim() ? 'Add & Invite' : 'Add'}
                  </button>
                </div>
              </form>
            )}
          </div>

          <div className="border-t border-natural-border/50 pt-3">
            <span className="text-sm text-natural-muted block mb-2">Invite Code</span>
            <div className="flex items-center gap-2">
              <div className="flex-1 bg-white border border-natural-border rounded-lg px-3 py-2 text-center font-mono font-bold tracking-widest text-lg text-natural-text shadow-inner">
                {group?.inviteCode}
              </div>
              <button
                onClick={copyInviteCode}
                className="p-2.5 bg-white text-natural-muted hover:text-natural-primary border border-natural-border rounded-lg shadow-sm transition-colors"
                title={copied ? 'Copied' : 'Copy to clipboard'}
                aria-label={copied ? 'Invite code copied' : 'Copy invite code'}
              >
                {copied ? <Check size={18} className="text-natural-primary" /> : <Copy size={18} />}
              </button>
            </div>
            {copied && (
              <p className="text-xs text-natural-primary font-medium mt-1.5 text-right">Copied</p>
            )}
          </div>

          <div className="border-t border-natural-border/50 pt-3">
            <button
              onClick={onLeaveGroup}
              className="w-full py-2 flex items-center justify-center gap-2 text-sm font-bold text-natural-muted hover:text-natural-primary bg-white border border-natural-border rounded-lg transition-colors shadow-sm"
            >
              <LogOut size={14} /> Leave This Group
            </button>
            <p className="text-xs text-natural-muted mt-1.5 text-center">
              Removes you from this group but keeps your account.
            </p>
          </div>
        </div>
      </div>

      {/* Local ledger + legal */}
      <div>
        <h3 className={`${labelClass} mb-2`}>Local Ledger</h3>
        <div className="bg-natural-bg/50 p-4 rounded-xl border border-natural-border space-y-3 mb-4">
          <button
            onClick={onOpenBackup}
            className="w-full py-2 px-3 flex items-center justify-between text-sm font-semibold text-natural-text hover:bg-white border border-transparent hover:border-natural-border rounded-lg transition-colors"
          >
            <span className="flex items-center gap-2">
              <Cloud size={16} className="text-natural-primary" /> Backup & Sync Options
            </span>
          </button>
        </div>
        <h3 className={`${labelClass} mb-2`}>Legal & Privacy</h3>
        <div className="bg-natural-bg/50 p-4 rounded-xl border border-natural-border space-y-3">
          <button
            onClick={onOpenPrivacy}
            className="w-full py-2 px-3 flex items-center justify-between text-sm font-semibold text-natural-text hover:bg-white border border-transparent hover:border-natural-border rounded-lg transition-colors"
          >
            <span className="flex items-center gap-2">
              <Shield size={16} className="text-natural-primary" /> Data, Privacy & Security
            </span>
          </button>
        </div>
      </div>
    </Modal>
  );
}
