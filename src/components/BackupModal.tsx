import React, { useState } from 'react';
import { X, Lock, Cloud, Download, Shield } from 'lucide-react';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import CryptoJS from 'crypto-js';

interface BackupModalProps {
  onClose: () => void;
  activeUser: string;
  groupId: string;
  localExpenses: any[];
  setLocalExpenses: (expenses: any[]) => void;
  groupSecret: string;
  setGroupSecret: (secret: string) => void;
}

export default function BackupModal({ onClose, activeUser, groupId, localExpenses, setLocalExpenses, groupSecret, setGroupSecret }: BackupModalProps) {
  const [personalSecret, setPersonalSecret] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const handleBackup = async () => {
    if (!personalSecret) {
      setMessage('Please enter a personal secret for backup.');
      return;
    }
    setLoading(true);
    setMessage('');
    try {
      const payload = JSON.stringify(localExpenses);
      const encrypted = CryptoJS.AES.encrypt(payload, personalSecret).toString();
      
      const userRef = doc(db, 'users', activeUser);
      await updateDoc(userRef, {
        backup: encrypted,
        backupDate: new Date().toISOString()
      });
      setMessage('Backup successful! Data securely encrypted.');
    } catch (e) {
      console.error(e);
      setMessage('Backup failed. Check connection.');
    }
    setLoading(false);
  };

  const handleRestore = async () => {
    if (!personalSecret) {
      setMessage('Please enter a personal secret to restore.');
      return;
    }
    setLoading(true);
    setMessage('');
    try {
      const userRef = doc(db, 'users', activeUser);
      const snap = await getDoc(userRef);
      if (snap.exists() && snap.data().backup) {
        const encrypted = snap.data().backup;
        const decryptedBytes = CryptoJS.AES.decrypt(encrypted, personalSecret);
        const decryptedStr = decryptedBytes.toString(CryptoJS.enc.Utf8);
        if (!decryptedStr) {
          setMessage('Incorrect personal secret or corrupted data.');
          setLoading(false);
          return;
        }
        const parsed = JSON.parse(decryptedStr);
        setLocalExpenses(parsed);
        localStorage.setItem(`expenses_${groupId}`, JSON.stringify(parsed));
        setMessage('Restore successful! Local ledger updated.');
      } else {
        setMessage('No backup found in the cloud.');
      }
    } catch (e) {
      console.error(e);
      setMessage('Restore failed. Incorrect secret?');
    }
    setLoading(false);
  };

  const saveGroupSecret = (val: string) => {
    setGroupSecret(val);
    localStorage.setItem(`group_secret_${activeUser}`, val);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-natural-text/40 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl w-full max-w-md shadow-xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between p-6 border-b border-natural-border">
          <h2 className="text-xl font-display font-bold text-natural-text">Security & Sync</h2>
          <button onClick={onClose} className="p-2 hover:bg-natural-sidebar rounded-full transition-colors">
            <X className="h-5 w-5 text-natural-muted" />
          </button>
        </div>
        
        <div className="p-6 overflow-y-auto space-y-6">
          {message && (
            <div className="p-3 bg-natural-sidebar text-natural-text text-sm rounded-xl border border-natural-border">
              {message}
            </div>
          )}

          <div className="space-y-3">
            <h3 className="font-bold text-sm text-natural-text flex items-center gap-2">
              <Shield className="h-4 w-4 text-natural-primary" /> End-to-End Encryption
            </h3>
            <p className="text-xs text-natural-muted">
              Ledgers are strictly stored on your device. To sync expenses securely with your group over the network, set a shared Group Secret.
            </p>
            <div>
              <label className="block text-xs font-bold text-natural-text uppercase tracking-wider mb-2">Group Sync Secret</label>
              <input
                type="password"
                value={groupSecret}
                onChange={(e) => saveGroupSecret(e.target.value)}
                placeholder="Share this exact phrase with members"
                className="w-full px-4 py-3 bg-natural-bg/50 border border-natural-border rounded-xl text-natural-text text-sm outline-none focus:border-natural-primary"
              />
            </div>
          </div>

          <div className="pt-4 border-t border-natural-border space-y-3">
            <h3 className="font-bold text-sm text-natural-text flex items-center gap-2">
              <Cloud className="h-4 w-4 text-natural-primary" /> Encrypted Cloud Backup
            </h3>
            <p className="text-xs text-natural-muted">
              Securely back up your local ledger to the cloud. Your data is encrypted locally and cannot be read by developers or other group members.
            </p>
            <div>
              <label className="block text-xs font-bold text-natural-text uppercase tracking-wider mb-2">Personal Backup Password</label>
              <input
                type="password"
                value={personalSecret}
                onChange={(e) => setPersonalSecret(e.target.value)}
                placeholder="Required for backup and restore"
                className="w-full px-4 py-3 bg-natural-bg/50 border border-natural-border rounded-xl text-natural-text text-sm outline-none focus:border-natural-primary"
              />
            </div>
            <div className="flex gap-3 pt-2">
              <button 
                onClick={handleBackup}
                disabled={loading}
                className="flex-1 py-2.5 bg-natural-primary text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50 transition-colors"
              >
                <Cloud className="h-4 w-4" /> Backup
              </button>
              <button 
                onClick={handleRestore}
                disabled={loading}
                className="flex-1 py-2.5 bg-white border border-natural-border text-natural-text hover:bg-natural-sidebar rounded-xl text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50 transition-colors"
              >
                <Download className="h-4 w-4" /> Restore
              </button>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
