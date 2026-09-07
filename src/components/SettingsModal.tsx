import React, { useState, useEffect } from 'react';
import { Settings, LogOut, Copy, Cloud, Shield, Check, X, Edit2, Bell, UserPlus, Mail } from 'lucide-react';
import { Group } from '../types';
import {
  getFullDefaultSplit,
  joinedUids,
  pendingSeats,
  seatAddBlocker,
  suggestedSeatPercent,
  withAddedSeat,
  MAX_ADDED_SEATS,
} from '../lib/members';
import { PushStatus, pushPermission, webPushSupported, enableWebPush } from '../lib/push';
import Modal from './Modal';

interface SettingsModalProps {
  onClose: () => void;
  userProfile: any;
  currentUser: any;
  group: Group;
  groupUsers: Record<string, any>;
  onSaveName: (name: string) => void;
  /** Newsletters and offers. Off by default; this switch is the only place it is asked. */
  onSaveMarketingOptIn: (optIn: boolean) => Promise<void>;
  onRetakeQuiz: () => void;
  onRecalculateSplit: () => void;
  onResendInvite: (memberName: string) => void;
  /** Add a pending seat (name + percentage); everyone else is rescaled. */
  onAddSeat: (name: string, percent: number) => Promise<void>;
  /** Remove the pending seat at this index in availableSplits. */
  onRemoveSeat: (index: number) => Promise<void>;
  onLeaveGroup: () => void;
  onOpenBackup: () => void;
  onOpenPrivacy: () => void;
  onSignOut: () => void;
  /** Optional extra block (thresholds, payment handles, …) rendered up top. */
  extraSection?: React.ReactNode;
}

const RESERVED_NAMES = ['Anonymous', 'Unknown'];

export default function SettingsModal({
  onClose, userProfile, currentUser, group, groupUsers,
  onSaveName, onSaveMarketingOptIn, onRetakeQuiz, onRecalculateSplit, onResendInvite,
  onAddSeat, onRemoveSeat,
  onLeaveGroup, onOpenBackup, onOpenPrivacy, onSignOut,
  extraSection,
}: SettingsModalProps) {
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [marketingBusy, setMarketingBusy] = useState(false);
  const handleMarketingChange = async (optIn: boolean) => {
    if (marketingBusy) return;
    setMarketingBusy(true);
    try { await onSaveMarketingOptIn(optIn); } finally { setMarketingBusy(false); }
  };

  // Growing the group: a couple can bring in up to two more people without
  // starting a new group. The form takes a name and the newcomer's share and
  // previews how everyone else's share shrinks to make room.
  const [addingSeat, setAddingSeat] = useState(false);
  const [seatName, setSeatName] = useState('');
  const [seatPercent, setSeatPercent] = useState('');
  const [seatBusy, setSeatBusy] = useState(false);
  const [seatError, setSeatError] = useState('');
  const [removingSeat, setRemovingSeat] = useState<number | null>(null);
  const seatBlocker = seatAddBlocker(group);
  const growthLeft = MAX_ADDED_SEATS - Math.max(0, Number(group?.addedSeats) || 0);

  const openSeatForm = () => {
    setSeatName('');
    setSeatPercent(String(suggestedSeatPercent(group)));
    setSeatError('');
    setAddingSeat(true);
  };

  let seatPreview: { name: string; pct: number }[] | null = null;
  if (addingSeat && group) {
    try {
      const next = withAddedSeat(group, seatName || 'New person', parseFloat(seatPercent));
      seatPreview = [
        ...joinedUids(group).map(uid => ({
          name: groupUsers[uid]?.name || group.members?.find(m => m.uid === uid)?.name || 'Member',
          pct: next.defaultSplit[uid],
        })),
        ...next.availableSplits.map(p => ({ name: p.name, pct: p.split })),
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
      await onAddSeat(seatName, parseFloat(seatPercent));
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
  const displayName = hasRealName ? userProfile.name : (currentUser?.displayName || 'Add your name');
  const fp = userProfile?.financialProfile;
  const multiPerson = (group?.targetNumPeople || 0) > 2;

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
          <h3 className="text-xs font-bold text-natural-muted uppercase tracking-wider mb-2">Notifications</h3>
          <div className="bg-natural-bg/50 p-4 rounded-xl border border-natural-border flex items-center justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <Bell className="h-4 w-4 text-natural-primary mt-0.5 shrink-0" />
              <p className="text-xs text-natural-muted leading-relaxed">
                Get an alert in this browser when someone adds to the ledger or sends a
                gentle reminder. Never any amounts, just who and which group.
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
        <h3 className="text-xs font-bold text-natural-muted uppercase tracking-wider mb-2">Email</h3>
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
              Off unless you turn it on. Change it here any time. Emails the app has to
              send, such as invites and password resets, are not affected.
            </span>
          </label>
        </div>
      </div>

      {/* User profile */}
      <div>
        <h3 className="text-xs font-bold text-natural-muted uppercase tracking-wider mb-2">User Profile</h3>
        <div className="bg-natural-bg/50 p-4 rounded-xl border border-natural-border space-y-2">
          <div className="flex justify-between items-center gap-2">
            <span className="text-sm text-natural-muted">Name</span>
            {editingName ? (
              <div className="flex items-center gap-1.5">
                <input
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') setEditingName(false); }}
                  autoFocus
                  placeholder="Your name"
                  className="w-36 px-2 py-1 text-sm text-right border border-natural-border focus:border-natural-primary rounded-md outline-none"
                />
                <button onClick={saveName} className="text-natural-primary hover:text-natural-dark p-1" title="Save"><Check size={16} /></button>
                <button onClick={() => setEditingName(false)} className="text-natural-muted hover:text-natural-text p-1" title="Cancel"><X size={16} /></button>
              </div>
            ) : (
              <button
                onClick={() => { setNameInput(hasRealName ? userProfile.name : (currentUser?.displayName || '')); setEditingName(true); }}
                className="flex items-center gap-1.5 group"
                title="Edit your name"
              >
                <span className="text-sm font-semibold text-natural-text capitalize">{displayName}</span>
                <Edit2 size={13} className="text-natural-muted group-hover:text-natural-primary" />
              </button>
            )}
          </div>
          <div className="flex justify-between">
            <span className="text-sm text-natural-muted">Annual Income</span>
            <span className="text-sm font-semibold text-natural-text">
              {userProfile?.income ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(Number(userProfile.income)) : 'N/A'}
            </span>
          </div>
          {fp && (
            <div className="pt-2 mt-2 border-t border-natural-border">
              <span className="text-xs text-natural-muted block mb-1">Financial Style</span>
              <span className="text-sm font-semibold text-natural-primary block">{fp.type}</span>
              <p className="text-xs text-natural-text mt-1 leading-relaxed">{fp.description}</p>
              {Array.isArray(fp.traits) && fp.traits.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {fp.traits.map((t: string, i: number) => (
                    <span key={i} className="text-xs font-semibold text-natural-primary bg-natural-sage/40 border border-natural-primary/20 px-2 py-0.5 rounded-full">{t}</span>
                  ))}
                </div>
              )}
              {fp.strengths && <p className="text-xs text-natural-text mt-2"><strong className="text-natural-muted">Strength:</strong> {fp.strengths}</p>}
              {fp.watchouts && <p className="text-xs text-natural-text mt-1"><strong className="text-natural-muted">Watch-out:</strong> {fp.watchouts}</p>}
              {fp.communicationStyle && <p className="text-xs text-natural-text mt-1"><strong className="text-natural-muted">Money talk:</strong> {fp.communicationStyle}</p>}
              {fp.quote && (
                <blockquote className="mt-3 text-xs italic text-natural-muted border-l-2 border-natural-primary/30 pl-2">{fp.quote}</blockquote>
              )}
              <button onClick={onRetakeQuiz} className="mt-4 text-xs font-semibold text-natural-primary hover:underline">Retake Profile Quiz</button>
            </div>
          )}
        </div>
      </div>

      {/* Group details */}
      <div>
        <h3 className="text-xs font-bold text-natural-muted uppercase tracking-wider mb-2">Group Details</h3>
        <div className="bg-natural-sage/20 p-4 rounded-xl border border-natural-primary/20 space-y-4">
          <div className="flex justify-between items-center">
            <span className="text-sm text-natural-muted">Group Name</span>
            <span className="text-sm font-semibold text-natural-text">{group?.name || 'Unnamed Group'}</span>
          </div>

          <div className="border-t border-natural-border/50 pt-3">
            <span className="text-sm text-natural-muted block mb-2">Group Members</span>
            <div className="space-y-3">
              {group && Object.entries(getFullDefaultSplit(group)).map(([uid, pct]) => {
                const isGhost = uid.startsWith('ghost_');
                const memberName = isGhost
                  ? (group.availableSplits?.find((_, i) => `ghost_${i}` === uid) as any)?.name || 'Unknown'
                  : groupUsers[uid]?.name || 'Unknown';
                return (
                  <div key={uid} className="flex justify-between items-center text-sm border-b border-natural-border/30 pb-2 last:border-0 last:pb-0">
                    <div>
                      <span className="text-natural-text font-semibold">{memberName}</span>
                      <span className="ml-2 text-xs font-mono text-natural-muted">{Number(pct)}% split</span>
                    </div>
                    <div>
                      {!isGhost ? (
                        <span className="text-xs bg-natural-sidebar text-natural-text px-2 py-0.5 rounded-full font-medium">Joined</span>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="text-xs bg-natural-primary/10 text-natural-primary px-2 py-0.5 rounded-full font-medium">Pending</span>
                          <button onClick={() => onResendInvite(memberName)} className="text-xs uppercase font-bold text-natural-primary hover:underline">Resend Invite</button>
                          <button
                            onClick={() => removeSeat(Number(uid.slice('ghost_'.length)))}
                            disabled={removingSeat !== null}
                            className="text-xs uppercase font-bold text-natural-muted hover:text-natural-primary hover:underline disabled:opacity-50"
                            title="Remove this pending seat and give its share back to everyone else"
                          >
                            {removingSeat === Number(uid.slice('ghost_'.length)) ? 'Removing...' : 'Remove'}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            {Object.keys(groupUsers).length === 2 && pendingSeats(group).length === 0 && (
              <button
                className="mt-3 w-full text-sm font-bold bg-white text-natural-primary py-2 rounded-lg border border-natural-border shadow-sm hover:border-natural-primary transition-colors"
                onClick={onRecalculateSplit}
              >
                Recalculate Using Reported Incomes
              </button>
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
              <form onSubmit={submitSeat} className="mt-3 bg-white border border-natural-border rounded-lg p-3 space-y-3">
                <div className="grid grid-cols-[1fr_5.5rem] gap-2">
                  <input
                    autoFocus
                    value={seatName}
                    onChange={e => setSeatName(e.target.value)}
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
                      onChange={e => setSeatPercent(e.target.value)}
                      className="w-full pl-3 pr-7 py-2 bg-natural-bg/50 border border-natural-border focus:border-natural-primary rounded-lg text-sm font-mono outline-none"
                      aria-label="Their share of the split"
                    />
                    <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-natural-muted">%</span>
                  </div>
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
                {seatError && <p className="text-xs text-natural-primary font-medium">{seatError}</p>}
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
                    {seatBusy ? 'Adding...' : 'Add & Invite'}
                  </button>
                </div>
              </form>
            )}
          </div>

          <div className="border-t border-natural-border/50 pt-3">
            <span className="text-sm text-natural-muted block mb-2">Invite Code{multiPerson ? 's' : ''}</span>
            <div className="flex items-center gap-2">
              <div className="flex-1 bg-white border border-natural-border rounded-lg px-3 py-2 text-center font-mono font-bold tracking-widest text-lg text-natural-text shadow-inner">
                {group?.inviteCode}
              </div>
              <button
                onClick={() => navigator.clipboard.writeText(group?.inviteCode || '')}
                className="p-2.5 bg-white text-natural-muted hover:text-natural-primary border border-natural-border rounded-lg shadow-sm transition-colors"
                title="Copy to clipboard"
              >
                <Copy size={18} />
              </button>
            </div>
          </div>

          <div className="border-t border-natural-border/50 pt-3">
            <button
              onClick={onLeaveGroup}
              className="w-full py-2 flex items-center justify-center gap-2 text-sm font-bold text-natural-muted hover:text-natural-primary bg-white border border-natural-border rounded-lg transition-colors shadow-sm"
            >
              <LogOut size={14} /> Leave This Group
            </button>
            <p className="text-xs text-natural-muted mt-1.5 text-center">Removes you from this group but keeps your account.</p>
          </div>
        </div>
      </div>

      {/* Local ledger + legal */}
      <div>
        <h3 className="text-xs font-bold text-natural-muted uppercase tracking-wider mb-2">Local Ledger</h3>
        <div className="bg-natural-bg/50 p-4 rounded-xl border border-natural-border space-y-3 mb-4">
          <button
            onClick={onOpenBackup}
            className="w-full py-2 px-3 flex items-center justify-between text-sm font-semibold text-natural-text hover:bg-white border border-transparent hover:border-natural-border rounded-lg transition-colors"
          >
            <span className="flex items-center gap-2"><Cloud size={16} className="text-natural-primary" /> Backup & Sync Options</span>
          </button>
        </div>
        <h3 className="text-xs font-bold text-natural-muted uppercase tracking-wider mb-2">Legal & Privacy</h3>
        <div className="bg-natural-bg/50 p-4 rounded-xl border border-natural-border space-y-3">
          <button
            onClick={onOpenPrivacy}
            className="w-full py-2 px-3 flex items-center justify-between text-sm font-semibold text-natural-text hover:bg-white border border-transparent hover:border-natural-border rounded-lg transition-colors"
          >
            <span className="flex items-center gap-2"><Shield size={16} className="text-natural-primary" /> Data, Privacy & Security</span>
          </button>
        </div>
      </div>
    </Modal>
  );
}
