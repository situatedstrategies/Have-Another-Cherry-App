import React from 'react';
import { Shield, Lock, FileText, Download, Trash2 } from 'lucide-react';
import Modal from './Modal';
import { LegalDoc } from './LegalModal';

interface PrivacyModalProps {
  onClose: () => void;
  onOpenLegal: (doc: LegalDoc) => void;
  onExportData: () => void;
  onDeleteAccount: () => void;
}

export default function PrivacyModal({ onClose, onOpenLegal, onExportData, onDeleteAccount }: PrivacyModalProps) {
  return (
    <Modal
      onClose={onClose}
      size="lg"
      icon={<Shield className="h-5 w-5 text-natural-primary" />}
      title="Data, Privacy & Security"
      bodyClassName="p-6 space-y-8"
    >
      <section>
        <h3 className="text-sm font-bold text-natural-text mb-3 flex items-center gap-2">
          <Lock size={16} className="text-natural-muted" /> How Your Data Is Protected
        </h3>
        <div className="bg-natural-sage/20 p-5 rounded-2xl border border-natural-sage/30 text-sm text-natural-text leading-relaxed space-y-4">
          <p>
            Your privacy is our top priority. We have implemented robust technical controls to ensure your financial ledgers and personal information are completely confidential and unreadable by anyone outside your group, including our own developers.
          </p>
          <ul className="list-disc pl-5 space-y-2 text-natural-muted">
            <li><strong>End-to-End Encryption (E2EE):</strong> All expense details and ledgers are fully encrypted on your device (using AES-GCM) before being sent to our database. They can only be decrypted using your group's invite code. Even if our backend developers try to view your database records, they will only see unreadable ciphertext.</li>
            <li><strong>Minimal contact data:</strong> We save your email address to sign you in and send you service emails - it's the only contact information we keep, and we never sell it or share it. Only a hashed (SHA-256) version sits alongside your ledger data, and our emails never contain your amounts or expense details.</li>
            <li><strong>Strict Cloud Isolation:</strong> We use strict Firestore backend security rules that physically block cross-group data queries. Groups are completely isolated from one another.</li>
            <li><strong>Profile Controls:</strong> You can leave your current group and clear the profile information stored by the app. Full sign-in account deletion is not yet available in Alpha Lite and will be implemented before public release.</li>
          </ul>
          <div className="bg-white/60 p-4 rounded-xl border border-natural-border/60 text-sm text-natural-dark italic mt-4 shadow-sm">
            Have Another Cherry was made to make sharing expenses sweet (or sweeter). We built the boring parts well so money stays a detail, not a conversation.
          </div>
          <p className="text-xs text-natural-muted mt-2 border-t border-natural-border pt-3">
            <em>Google Cloud and Firebase are trademarks of Google LLC.</em>
          </p>
        </div>
      </section>

      <section>
        <h3 className="text-sm font-bold text-natural-text mb-3 flex items-center gap-2">
          <FileText size={16} className="text-natural-muted" /> Legal Documents
        </h3>
        <div className="space-y-3">
          <button
            onClick={() => onOpenLegal('terms')}
            className="w-full text-left p-4 rounded-xl border border-natural-border bg-natural-bg/50 hover:bg-white hover:border-natural-primary/40 transition-colors flex items-center justify-between gap-2"
          >
            <span className="flex flex-col gap-0.5">
              <span className="font-semibold text-natural-text text-sm">Terms of Service</span>
              <span className="text-xs text-natural-muted">Read our terms of service.</span>
            </span>
            <FileText size={16} className="text-natural-primary shrink-0" />
          </button>
          <button
            onClick={() => onOpenLegal('privacy')}
            className="w-full text-left p-4 rounded-xl border border-natural-border bg-natural-bg/50 hover:bg-white hover:border-natural-primary/40 transition-colors flex items-center justify-between gap-2"
          >
            <span className="flex flex-col gap-0.5">
              <span className="font-semibold text-natural-text text-sm">Privacy Policy</span>
              <span className="text-xs text-natural-muted">Read how we handle your data.</span>
            </span>
            <Shield size={16} className="text-natural-primary shrink-0" />
          </button>
        </div>
      </section>

      <section>
        <h3 className="text-sm font-bold text-natural-text mb-3">Your Data Controls</h3>
        <div className="bg-white p-4 rounded-2xl border border-natural-border space-y-3">
          <button
            onClick={onExportData}
            className="w-full py-3 px-4 flex items-center justify-between text-sm font-bold text-natural-text hover:bg-natural-bg/50 border border-natural-border rounded-xl transition-all shadow-sm"
          >
            <span className="flex items-center gap-2"><Download size={18} className="text-natural-primary" /> Export Data (CSV)</span>
          </button>

          <div className="border-t border-natural-border/50"></div>

          <button
            onClick={onDeleteAccount}
            className="w-full py-3 px-4 flex items-center justify-between text-sm font-bold text-red-500 hover:bg-red-50 border border-red-100 hover:border-red-200 rounded-xl transition-all shadow-sm"
          >
            <span className="flex items-center gap-2"><Trash2 size={18} /> Delete Account &amp; All Data</span>
          </button>
          <p className="text-[11px] text-natural-muted px-1 leading-relaxed">
            Permanently deletes your profile, financial data, group membership, and your sign-in account. This cannot be undone.
          </p>
        </div>
      </section>
    </Modal>
  );
}
