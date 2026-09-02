import React, { useEffect, useState } from 'react';
import { NotebookPen, Lock, Users, Trash2, Share2 } from 'lucide-react';
import { Group } from '../types';
import { getFullMembers } from '../lib/members';
import {
  REFLECTION_MOODS,
  Reflection,
  ReflectionMood,
  loadReflectionsForExpense,
  saveReflection,
  shareReflection,
  deleteReflection,
} from '../lib/reflections';

interface ReflectionsSectionProps {
  expenseId: string;
  group: Group;
  activeUser: string;
}

// A quiet journal corner on the expense: how did this one feel? Entries are
// private to their author by default; sharing with the group is an explicit
// per-entry choice, and signing that choice is the author's alone.
export default function ReflectionsSection({ expenseId, group, activeUser }: ReflectionsSectionProps) {
  const [entries, setEntries] = useState<Reflection[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [text, setText] = useState('');
  const [mood, setMood] = useState<ReflectionMood | undefined>(undefined);
  const [shareWithGroup, setShareWithGroup] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);
  const [sharingId, setSharingId] = useState<string | null>(null);

  const members = getFullMembers(group);
  const nameOf = (uid: string) =>
    uid === activeUser ? 'You' : members.find(m => m.uid === uid)?.name || 'A member';

  useEffect(() => {
    let cancelled = false;
    loadReflectionsForExpense(activeUser, group.id, expenseId)
      .then(list => { if (!cancelled) { setEntries(list); setLoaded(true); } })
      .catch(err => { console.error('Reflections load failed', err); if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, [activeUser, group.id, expenseId]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || saving) return;
    setSaving(true);
    try {
      const entry = await saveReflection({
        uid: activeUser,
        groupId: group.id,
        expenseId,
        text: text.trim(),
        mood,
        shared: shareWithGroup,
      });
      setEntries(prev => [entry, ...prev]);
      setText('');
      setMood(undefined);
      setShareWithGroup(false);
    } catch (err) {
      console.error('Reflection save failed', err);
    } finally {
      setSaving(false);
    }
  };

  const handleShare = async (r: Reflection) => {
    setSharingId(r.id);
    try {
      await shareReflection(r);
      setEntries(prev => prev.map(x => (x.id === r.id ? { ...x, shared: true } : x)));
    } catch (err) {
      console.error('Reflection share failed', err);
    } finally {
      setSharingId(null);
    }
  };

  const handleDelete = async (r: Reflection) => {
    setConfirmingDelete(null);
    try {
      await deleteReflection(r);
      setEntries(prev => prev.filter(x => x.id !== r.id));
    } catch (err) {
      console.error('Reflection delete failed', err);
    }
  };

  const fmt = (iso: string) =>
    new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  return (
    <div className="space-y-4 pt-4 border-t border-natural-border" id="reflections-section">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-bold text-natural-muted uppercase tracking-widest flex items-center gap-1.5">
          <NotebookPen className="h-3.5 w-3.5" /> Reflections
        </h3>
        <span className="text-[10px] text-natural-muted flex items-center gap-1">
          <Lock className="h-3 w-3" /> Private to you unless you share
        </span>
      </div>

      <form onSubmit={handleSave} className="bg-natural-sidebar/30 border border-natural-border/60 rounded-2xl p-3.5 space-y-3">
        <p className="text-xs font-semibold text-natural-text">How did splitting this one feel?</p>

        <div className="flex flex-wrap gap-1.5">
          {REFLECTION_MOODS.map(m => (
            <button
              key={m.key}
              type="button"
              onClick={() => setMood(mood === m.key ? undefined : m.key)}
              title={m.hint}
              className={`px-2.5 py-1 text-[11px] font-semibold rounded-full border transition-all cursor-pointer ${
                mood === m.key
                  ? 'bg-natural-primary text-white border-natural-primary shadow-sm'
                  : 'bg-white text-natural-muted border-natural-border hover:text-natural-text hover:border-natural-muted'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>

        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          rows={2}
          maxLength={2000}
          placeholder="A sentence or two, just for you..."
          className="w-full text-xs px-3.5 py-2.5 bg-white border border-natural-border rounded-xl focus:outline-none focus:border-natural-primary resize-y"
        />

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <label className="flex items-center gap-2 text-[11px] text-natural-muted cursor-pointer select-none">
            <input
              type="checkbox"
              checked={shareWithGroup}
              onChange={e => setShareWithGroup(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-natural-border text-natural-primary focus:ring-natural-primary"
            />
            <span>Share with the group. Unchecked, it stays only yours.</span>
          </label>
          <button
            type="submit"
            disabled={!text.trim() || saving}
            className="px-4 py-1.5 text-xs font-bold text-white bg-natural-primary hover:bg-natural-primary-ink rounded-full shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer self-end sm:self-auto"
          >
            {saving ? 'Saving...' : 'Save reflection'}
          </button>
        </div>
      </form>

      {loaded && entries.length > 0 && (
        <div className="space-y-2.5">
          {entries.map(r => {
            const mine = r.authorUid === activeUser;
            const moodMeta = REFLECTION_MOODS.find(m => m.key === r.mood);
            return (
              <div key={r.id} className="bg-white border border-natural-border/60 rounded-xl p-3 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-[11px] font-bold text-natural-text">
                    {r.shared
                      ? <span className="flex items-center gap-1 text-natural-muted"><Users className="h-3 w-3" /> {nameOf(r.authorUid)}</span>
                      : <span className="flex items-center gap-1 text-natural-primary"><Lock className="h-3 w-3" /> Only you</span>}
                    {moodMeta && (
                      <span className="px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-md bg-natural-sidebar border border-natural-border text-natural-muted">
                        {moodMeta.label}
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-natural-muted font-mono">{fmt(r.createdAt)}</span>
                </div>
                <p className="text-xs text-natural-text leading-relaxed whitespace-pre-wrap">{r.text}</p>
                {mine && (
                  <div className="flex items-center gap-3 pt-1">
                    {!r.shared && (
                      <button
                        type="button"
                        onClick={() => handleShare(r)}
                        disabled={sharingId === r.id}
                        className="text-[11px] font-bold text-natural-primary hover:text-natural-dark flex items-center gap-1 disabled:opacity-50 cursor-pointer"
                      >
                        <Share2 className="h-3 w-3" /> {sharingId === r.id ? 'Sharing...' : 'Share with group'}
                      </button>
                    )}
                    {confirmingDelete === r.id ? (
                      <span className="flex items-center gap-2 text-[11px]">
                        <span className="font-bold text-natural-primary uppercase">Delete?</span>
                        <button type="button" onClick={() => setConfirmingDelete(null)} className="font-bold text-natural-muted hover:text-natural-text cursor-pointer">Cancel</button>
                        <button type="button" onClick={() => handleDelete(r)} className="font-bold text-white bg-natural-primary hover:bg-natural-primary-ink px-2 py-0.5 rounded-md cursor-pointer">Yes</button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmingDelete(r.id)}
                        className="text-[11px] font-bold text-natural-muted hover:text-natural-primary flex items-center gap-1 cursor-pointer"
                      >
                        <Trash2 className="h-3 w-3" /> Delete
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
