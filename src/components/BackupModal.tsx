import React, { useState, useEffect } from 'react';
import { Cloud, Download, Shield, Key, RefreshCw, Check, Sparkles } from 'lucide-react';
import { doc, getDoc, updateDoc, deleteField } from 'firebase/firestore';
import { db } from '../firebase';
import Modal from './Modal';
import { hashString } from '../lib/crypto';
import CryptoJS from 'crypto-js';

interface BackupModalProps {
  onClose: () => void;
  activeUser: string;
  groupId: string;
  groupKeyHash?: string;
  localExpenses: any[];
  setLocalExpenses: (expenses: any[]) => void;
  groupSecret: string;
  setGroupSecret: (secret: string) => void;
}

const WORDS = [
  'cherry', 'maple', 'orbit', 'river', 'ember', 'willow', 'cobalt', 'harbor',
  'meadow', 'saffron', 'lantern', 'pebble', 'thistle', 'comet', 'juniper', 'marble',
  'sparrow', 'velvet', 'pinecone', 'copper', 'dune', 'lagoon', 'quartz', 'basil',
];

// Normalize a key the same way for hashing AND encryption so a "matching" key
// always decrypts. (hashString also lowercases/trims - keep them consistent.)
const normalizeKey = (k: string) => k.trim().toLowerCase();

function generateKey(): string {
  const rand = crypto.getRandomValues(new Uint32Array(4));
  const parts = Array.from(rand).map(n => WORDS[n % WORDS.length]);
  return parts.join('-');
}

function formatDate(iso?: string | null): string {
  if (!iso) return 'Never';
  try {
    return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return 'Never';
  }
}

type Msg = { text: string; type: 'success' | 'error' | 'info' } | null;

export default function BackupModal({ onClose, activeUser, groupId, groupKeyHash, localExpenses, setLocalExpenses, groupSecret, setGroupSecret }: BackupModalProps) {
  const [keyInput, setKeyInput] = useState(groupSecret || '');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const [lastBackup, setLastBackup] = useState<string | null>(null);
  const [keyMatches, setKeyMatches] = useState<boolean | null>(null);

  const show = (text: string, type: 'success' | 'error' | 'info') => setMsg({ text, type });

  // Load the last backup timestamp.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'users', activeUser));
        if (!cancelled && snap.exists()) setLastBackup(snap.data().backupDate || null);
      } catch (e) { console.error(e); }
    })();
    return () => { cancelled = true; };
  }, [activeUser]);

  // Does the entered key match the group's saved key hash?
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!groupKeyHash || !keyInput.trim()) { setKeyMatches(null); return; }
      const h = await hashString(normalizeKey(keyInput));
      if (!cancelled) setKeyMatches(h === groupKeyHash);
    })();
    return () => { cancelled = true; };
  }, [keyInput, groupKeyHash]);

  const handleGenerate = () => {
    setKeyInput(generateKey());
    show('Generated a strong key. Click "Save Key" to store it.', 'info');
  };

  const handleSaveKey = async () => {
    const key = normalizeKey(keyInput);
    if (key.length < 8) { show('Your group key must be at least 8 characters.', 'error'); return; }
    setLoading(true);
    try {
      setGroupSecret(key);
      localStorage.setItem(`group_secret_${activeUser}`, key);
      const h = await hashString(key);
      await updateDoc(doc(db, 'groups', groupId), { keyHash: h });
      show('Group key saved - stored hashed in the cloud so it can be verified and reset. Share the exact phrase with your group.', 'success');
    } catch (e) {
      console.error(e);
      show('Could not save the key. Please check your connection and try again.', 'error');
    }
    setLoading(false);
  };

  const handleResetKey = async () => {
    if (!window.confirm(
      "Reset your group key? This clears the key on this device and its cloud reference. Anything already backed up or synced with the OLD key will still need the old key to read. You'll then set a new shared key with your group and back up again."
    )) return;
    setLoading(true);
    try {
      setGroupSecret('');
      localStorage.removeItem(`group_secret_${activeUser}`);
      setKeyInput('');
      await updateDoc(doc(db, 'groups', groupId), { keyHash: deleteField() });
      show('Group key reset. Set a new shared key, then back up your ledger again.', 'success');
    } catch (e) {
      console.error(e);
      show('Could not reset the key. Please try again.', 'error');
    }
    setLoading(false);
  };

  const handleBackup = async () => {
    const key = normalizeKey(groupSecret || keyInput);
    if (key.length < 8) { show('Save a group key first, then back up.', 'error'); return; }
    // Guard against overwriting a good backup with an empty ledger.
    if (localExpenses.length === 0 && !window.confirm(
      'Your ledger is currently empty. Backing up now will overwrite any previous cloud backup with an empty one. Continue?'
    )) return;
    setLoading(true);
    try {
      const encrypted = CryptoJS.AES.encrypt(JSON.stringify(localExpenses), key).toString();
      const date = new Date().toISOString();
      await updateDoc(doc(db, 'users', activeUser), { backup: encrypted, backupDate: date });
      setLastBackup(date);
      show(`Ledger backed up to the cloud - ${localExpenses.length} item${localExpenses.length === 1 ? '' : 's'}, encrypted with your group key.`, 'success');
    } catch (e) {
      console.error(e);
      show('Backup failed. Check your connection and try again.', 'error');
    }
    setLoading(false);
  };

  const handleRestore = async () => {
    const key = normalizeKey(groupSecret || keyInput);
    if (key.length < 8) { show('Enter or save your group key first, then restore.', 'error'); return; }
    if (!window.confirm(
      'Restore will REPLACE your current local ledger with the cloud backup. Any local changes since the last backup will be lost. Continue?'
    )) return;
    setLoading(true);
    try {
      const snap = await getDoc(doc(db, 'users', activeUser));
      const encrypted = snap.exists() ? snap.data().backup : null;
      if (!encrypted) { show('No cloud backup found for this account yet.', 'error'); setLoading(false); return; }
      const bytes = CryptoJS.AES.decrypt(encrypted, key);
      const str = bytes.toString(CryptoJS.enc.Utf8);
      if (!str) { show('Could not decrypt the backup - is the group key correct?', 'error'); setLoading(false); return; }
      const parsed = JSON.parse(str);
      if (!Array.isArray(parsed)) { show('The backup looks corrupted, so restore was cancelled to protect your ledger.', 'error'); setLoading(false); return; }
      setLocalExpenses(parsed);
      localStorage.setItem(`expenses_${groupId}`, JSON.stringify(parsed));
      show(`Ledger restored - ${parsed.length} item${parsed.length === 1 ? '' : 's'} loaded from your backup.`, 'success');
    } catch (e) {
      console.error(e);
      show('Restore failed. Double-check your group key and try again.', 'error');
    }
    setLoading(false);
  };

  const hasKey = !!groupSecret && groupSecret.length >= 8;

  return (
    <Modal onClose={onClose} title="Backup & Recovery">
        <div className="space-y-6">
          {msg && (
            <div className={`p-3 text-sm rounded-xl border ${
              msg.type === 'success' ? 'bg-green-50 text-green-700 border-green-200'
              : msg.type === 'error' ? 'bg-red-50 text-red-600 border-red-200'
              : 'bg-natural-sidebar text-natural-text border-natural-border'
            }`}>
              {msg.text}
            </div>
          )}

          {/* Group key */}
          <div className="space-y-3">
            <h3 className="font-bold text-sm text-natural-text flex items-center gap-2">
              <Key className="h-4 w-4 text-natural-primary" /> Secret Group Key
            </h3>
            <p className="text-xs text-natural-muted">
              Your ledger is encrypted with this key before it ever leaves your device. Save it, share the exact phrase with your group, and keep it somewhere safe - it's the only way to restore a backup.
            </p>

            <div className="flex items-center gap-2">
              <span className={`text-[11px] font-bold px-2 py-1 rounded-full ${hasKey ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                {hasKey ? 'Key set on this device' : 'No key yet'}
              </span>
              {keyMatches === true && <span className="text-[11px] font-bold text-green-700 flex items-center gap-1"><Check className="h-3 w-3" /> Matches your group</span>}
              {keyMatches === false && <span className="text-[11px] font-bold text-amber-700">Doesn't match your group's saved key</span>}
            </div>

            <div>
              <label className="block text-xs font-bold text-natural-text uppercase tracking-wider mb-2">Group Key</label>
              <input
                type="text"
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                placeholder="e.g. cherry-orbit-willow-quartz"
                autoComplete="off"
                spellCheck={false}
                className="w-full px-4 py-3 bg-natural-bg/50 border border-natural-border rounded-xl text-natural-text text-sm outline-none focus:border-natural-primary font-mono"
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <button onClick={handleGenerate} disabled={loading} className="flex-1 min-w-[120px] py-2.5 bg-white border border-natural-border text-natural-text hover:bg-natural-sidebar rounded-xl text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50">
                <Sparkles className="h-4 w-4 text-natural-primary" /> Generate
              </button>
              <button onClick={handleSaveKey} disabled={loading} className="flex-1 min-w-[120px] py-2.5 bg-natural-primary text-white hover:bg-natural-dark rounded-xl text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50">
                <Check className="h-4 w-4" /> Save Key
              </button>
            </div>
            <button onClick={handleResetKey} disabled={loading} className="w-full py-2 text-xs font-bold text-natural-muted hover:text-red-500 bg-white border border-natural-border rounded-lg flex items-center justify-center gap-1.5 disabled:opacity-50">
              <RefreshCw className="h-3.5 w-3.5" /> Reset key (lost or forgotten)
            </button>
          </div>

          {/* Backup / restore */}
          <div className="pt-4 border-t border-natural-border space-y-3">
            <h3 className="font-bold text-sm text-natural-text flex items-center gap-2">
              <Cloud className="h-4 w-4 text-natural-primary" /> Encrypted Cloud Backup
            </h3>
            <p className="text-xs text-natural-muted">
              Back up your local ledger to the cloud, encrypted with your group key. Only someone with the key can read it - not other members, not us.
            </p>
            <div className="flex items-center justify-between text-xs bg-natural-bg/50 border border-natural-border rounded-lg px-3 py-2">
              <span className="text-natural-muted">Last backup</span>
              <span className="font-semibold text-natural-text">{formatDate(lastBackup)}</span>
            </div>
            <div className="flex gap-3 pt-1">
              <button onClick={handleBackup} disabled={loading} className="flex-1 py-2.5 bg-natural-primary text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50">
                <Cloud className="h-4 w-4" /> Back up now
              </button>
              <button onClick={handleRestore} disabled={loading} className="flex-1 py-2.5 bg-white border border-natural-border text-natural-text hover:bg-natural-sidebar rounded-xl text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50">
                <Download className="h-4 w-4" /> Restore
              </button>
            </div>
            <p className="text-[11px] text-natural-muted flex items-start gap-1.5">
              <Shield className="h-3.5 w-3.5 text-natural-primary shrink-0 mt-0.5" />
              Restoring replaces your current ledger - you'll be asked to confirm first.
            </p>
          </div>
        </div>
    </Modal>
  );
}
