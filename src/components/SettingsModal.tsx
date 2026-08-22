import React, { useState } from 'react';
import { Settings, LogOut, Copy, Cloud, Shield, Check, X, Edit2 } from 'lucide-react';
import { Group } from '../types';
import { getFullDefaultSplit } from '../lib/members';
import Modal from './Modal';

interface SettingsModalProps {
  onClose: () => void;
  userProfile: any;
  currentUser: any;
  group: Group;
  groupUsers: Record<string, any>;
  onSaveName: (name: string) => void;
  onRetakeQuiz: () => void;
  onRecalculateSplit: () => void;
  onResendInvite: (memberName: string) => void;
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
  onSaveName, onRetakeQuiz, onRecalculateSplit, onResendInvite,
  onLeaveGroup, onOpenBackup, onOpenPrivacy, onSignOut,
  extraSection,
}: SettingsModalProps) {
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');

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
                    <span key={i} className="text-[10px] font-semibold text-natural-primary bg-natural-sage/40 border border-natural-primary/20 px-2 py-0.5 rounded-full">{t}</span>
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
                          <button onClick={() => onResendInvite(memberName)} className="text-[10px] uppercase font-bold text-natural-primary hover:underline">Resend Invite</button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            {Object.keys(groupUsers).length === 2 && (
              <button
                className="mt-3 w-full text-xs font-bold bg-white text-natural-primary py-2 rounded-lg border border-natural-border shadow-sm hover:border-natural-primary transition-colors"
                onClick={onRecalculateSplit}
              >
                Recalculate Using Reported Incomes
              </button>
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
              className="w-full py-2 flex items-center justify-center gap-2 text-xs font-bold text-natural-muted hover:text-natural-primary bg-white border border-natural-border rounded-lg transition-colors shadow-sm"
            >
              <LogOut size={14} /> Leave This Group
            </button>
            <p className="text-[11px] text-natural-muted mt-1.5 text-center">Removes you from this group but keeps your account.</p>
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
