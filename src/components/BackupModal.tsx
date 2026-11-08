import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { t as tr } from '../i18n';
import { formatDateTime } from '../lib/format';
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
  'cherry',
  'maple',
  'orbit',
  'river',
  'ember',
  'willow',
  'cobalt',
  'harbor',
  'meadow',
  'saffron',
  'lantern',
  'pebble',
  'thistle',
  'comet',
  'juniper',
  'marble',
  'sparrow',
  'velvet',
  'pinecone',
  'copper',
  'dune',
  'lagoon',
  'quartz',
  'basil',
];

// Normalize a key the same way for hashing AND encryption so a "matching" key
// always decrypts. (hashString also lowercases/trims - keep them consistent.)
const normalizeKey = (k: string) => k.trim().toLowerCase();

function generateKey(): string {
  const rand = crypto.getRandomValues(new Uint32Array(4));
  const parts = Array.from(rand).map((n) => WORDS[n % WORDS.length]);
  return parts.join('-');
}

function formatDate(iso?: string | null): string {
  if (!iso) return tr('backup.never');
  try {
    return formatDateTime(iso);
  } catch {
    return tr('backup.never');
  }
}

type Msg = { text: string; type: 'success' | 'error' | 'info' } | null;

export default function BackupModal({
  onClose,
  activeUser,
  groupId,
  groupKeyHash,
  localExpenses,
  setLocalExpenses,
  groupSecret,
  setGroupSecret,
}: BackupModalProps) {
  const { t } = useTranslation();
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
      } catch (e) {
        console.error(e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeUser]);

  // Does the entered key match the group's saved key hash?
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!groupKeyHash || !keyInput.trim()) {
        setKeyMatches(null);
        return;
      }
      const h = await hashString(normalizeKey(keyInput));
      if (!cancelled) setKeyMatches(h === groupKeyHash);
    })();
    return () => {
      cancelled = true;
    };
  }, [keyInput, groupKeyHash]);

  const handleGenerate = () => {
    setKeyInput(generateKey());
    show(t('backup.generated'), 'info');
  };

  const handleSaveKey = async () => {
    const key = normalizeKey(keyInput);
    if (key.length < 8) {
      show(t('backup.keyTooShort'), 'error');
      return;
    }
    setLoading(true);
    try {
      setGroupSecret(key);
      localStorage.setItem(`group_secret_${activeUser}`, key);
      const h = await hashString(key);
      await updateDoc(doc(db, 'groups', groupId), { keyHash: h });
      show(t('backup.keySaved'), 'success');
    } catch (e) {
      console.error(e);
      show(t('backup.keySaveFailed'), 'error');
    }
    setLoading(false);
  };

  const handleResetKey = async () => {
    if (!window.confirm(t('backup.resetConfirm'))) return;
    setLoading(true);
    try {
      setGroupSecret('');
      localStorage.removeItem(`group_secret_${activeUser}`);
      setKeyInput('');
      await updateDoc(doc(db, 'groups', groupId), { keyHash: deleteField() });
      show(t('backup.keyReset'), 'success');
    } catch (e) {
      console.error(e);
      show(t('backup.resetFailed'), 'error');
    }
    setLoading(false);
  };

  const handleBackup = async () => {
    const key = normalizeKey(groupSecret || keyInput);
    if (key.length < 8) {
      show(t('backup.saveKeyFirst'), 'error');
      return;
    }
    // Guard against overwriting a good backup with an empty ledger.
    if (localExpenses.length === 0 && !window.confirm(t('backup.emptyConfirm'))) return;
    setLoading(true);
    try {
      const encrypted = CryptoJS.AES.encrypt(JSON.stringify(localExpenses), key).toString();

      // Firestore caps a document at ~1MB and the backup shares the user doc,
      // so refuse clearly instead of failing with an opaque write error.
      if (encrypted.length > 900_000) {
        show(t('backup.tooLarge', { size: Math.round(encrypted.length / 1024) }), 'error');
        setLoading(false);
        return;
      }

      const date = new Date().toISOString();
      await updateDoc(doc(db, 'users', activeUser), { backup: encrypted, backupDate: date });

      // Trust, then verify: read the document back from the server and prove
      // the backup is there and decrypts to the same number of items.
      const verifySnap = await getDoc(doc(db, 'users', activeUser));
      const stored = verifySnap.exists() ? verifySnap.data().backup : null;
      let verified = false;
      if (stored) {
        try {
          const roundTrip = JSON.parse(
            CryptoJS.AES.decrypt(stored, key).toString(CryptoJS.enc.Utf8)
          );
          verified = Array.isArray(roundTrip) && roundTrip.length === localExpenses.length;
        } catch {
          verified = false;
        }
      }

      if (!verified) {
        show(t('backup.notVerified'), 'error');
        setLoading(false);
        return;
      }

      setLastBackup(date);
      show(
        t('backup.done', {
          count: localExpenses.length,
          size: Math.round(encrypted.length / 1024),
        }),
        'success'
      );
    } catch (e) {
      console.error(e);
      show(t('backup.failed'), 'error');
    }
    setLoading(false);
  };

  const handleRestore = async () => {
    const key = normalizeKey(groupSecret || keyInput);
    if (key.length < 8) {
      show(t('backup.enterKeyFirst'), 'error');
      return;
    }
    if (!window.confirm(t('backup.restoreConfirm'))) return;
    setLoading(true);
    try {
      const snap = await getDoc(doc(db, 'users', activeUser));
      const encrypted = snap.exists() ? snap.data().backup : null;
      if (!encrypted) {
        show(t('backup.noBackup'), 'error');
        setLoading(false);
        return;
      }
      const bytes = CryptoJS.AES.decrypt(encrypted, key);
      const str = bytes.toString(CryptoJS.enc.Utf8);
      if (!str) {
        show(t('backup.decryptFailed'), 'error');
        setLoading(false);
        return;
      }
      const parsed = JSON.parse(str);
      if (!Array.isArray(parsed)) {
        show(t('backup.corrupted'), 'error');
        setLoading(false);
        return;
      }
      setLocalExpenses(parsed);
      localStorage.setItem(`expenses_${groupId}`, JSON.stringify(parsed));
      show(t('backup.restored', { count: parsed.length }), 'success');
    } catch (e) {
      console.error(e);
      show(t('backup.restoreFailed'), 'error');
    }
    setLoading(false);
  };

  const hasKey = !!groupSecret && groupSecret.length >= 8;

  return (
    <Modal onClose={onClose} title={t('backup.title')}>
      <div className="space-y-6">
        {msg && (
          <div
            className={`p-3 text-sm rounded-xl border ${
              msg.type === 'success'
                ? 'bg-natural-sidebar text-natural-text border-natural-border'
                : msg.type === 'error'
                  ? 'bg-natural-primary/5 text-natural-primary border-natural-primary/25'
                  : 'bg-natural-sidebar text-natural-text border-natural-border'
            }`}
          >
            {msg.text}
          </div>
        )}

        {/* Group key */}
        <div className="space-y-3">
          <h3 className="font-bold text-sm text-natural-text flex items-center gap-2">
            <Key className="h-4 w-4 text-natural-primary" /> {t('backup.secretKey')}
          </h3>
          <p className="text-xs text-natural-muted">{t('backup.secretKeyBody')}</p>

          <div className="flex items-center gap-2">
            <span
              className={`text-xs font-bold px-2 py-1 rounded-full ${hasKey ? 'bg-natural-sidebar text-natural-text' : 'bg-natural-primary/10 text-natural-primary'}`}
            >
              {hasKey ? t('backup.keySet') : t('backup.noKey')}
            </span>
            {keyMatches === true && (
              <span className="text-xs font-bold text-natural-text flex items-center gap-1">
                <Check className="h-3 w-3" /> {t('backup.matches')}
              </span>
            )}
            {keyMatches === false && (
              <span className="text-xs font-bold text-natural-primary">{t('backup.noMatch')}</span>
            )}
          </div>

          <div>
            <label className="block text-xs font-bold text-natural-text uppercase tracking-wider mb-2">
              {t('backup.groupKey')}
            </label>
            <input
              type="text"
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              placeholder={t('backup.groupKey')}
              autoComplete="off"
              spellCheck={false}
              className="w-full px-4 py-3 bg-natural-bg/50 border border-natural-border rounded-xl text-natural-text text-sm outline-none focus:border-natural-primary font-mono"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={handleGenerate}
              disabled={loading}
              className="flex-1 min-w-[120px] py-2.5 bg-white border border-natural-border text-natural-text hover:bg-natural-sidebar rounded-xl text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Sparkles className="h-4 w-4 text-natural-primary" /> {t('backup.generate')}
            </button>
            <button
              onClick={handleSaveKey}
              disabled={loading}
              className="flex-1 min-w-[120px] py-2.5 bg-natural-primary text-white hover:bg-natural-primary-ink rounded-xl text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Check className="h-4 w-4" /> {t('backup.saveKey')}
            </button>
          </div>
          <button
            onClick={handleResetKey}
            disabled={loading}
            className="w-full py-2 text-sm font-bold text-natural-muted hover:text-natural-primary bg-white border border-natural-border rounded-lg flex items-center justify-center gap-1.5 disabled:opacity-50"
          >
            <RefreshCw className="h-3.5 w-3.5" /> {t('backup.resetKey')}
          </button>
        </div>

        {/* Backup / restore */}
        <div className="pt-4 border-t border-natural-border space-y-3">
          <h3 className="font-bold text-sm text-natural-text flex items-center gap-2">
            <Cloud className="h-4 w-4 text-natural-primary" /> {t('backup.cloudBackup')}
          </h3>
          <p className="text-xs text-natural-muted">{t('backup.cloudBody')}</p>
          <div className="flex items-center justify-between text-xs bg-natural-bg/50 border border-natural-border rounded-lg px-3 py-2">
            <span className="text-natural-muted">{t('backup.lastBackup')}</span>
            <span className="font-semibold text-natural-text">{formatDate(lastBackup)}</span>
          </div>
          <div className="flex gap-3 pt-1">
            <button
              onClick={handleBackup}
              disabled={loading}
              className="flex-1 py-2.5 bg-natural-primary text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Cloud className="h-4 w-4" /> {t('backup.backUpNow')}
            </button>
            <button
              onClick={handleRestore}
              disabled={loading}
              className="flex-1 py-2.5 bg-white border border-natural-border text-natural-text hover:bg-natural-sidebar rounded-xl text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Download className="h-4 w-4" /> {t('backup.restore')}
            </button>
          </div>
          <p className="text-xs text-natural-muted flex items-start gap-1.5">
            <Shield className="h-3.5 w-3.5 text-natural-primary shrink-0 mt-0.5" />
            {t('backup.restoreNote')}
          </p>
        </div>
      </div>
    </Modal>
  );
}
