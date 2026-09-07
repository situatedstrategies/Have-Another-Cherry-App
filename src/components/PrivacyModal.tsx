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
            Here is what actually protects your ledger, described as plainly as we can manage. The full detail is in the Privacy Policy below.
          </p>
          <ul className="list-disc pl-5 space-y-2 text-natural-muted">
            <li><strong>Encrypted before it is stored:</strong> Sensitive expense details are encrypted on your device with AES-GCM before they are sent to our database, and the database encrypts everything at rest as well. Your ledger is not sitting in a table anyone can read at a glance.</li>
            <li><strong>Minimal contact data:</strong> We save your email address to sign you in and send you service emails - it's the only contact information we keep, and we never sell it or share it beyond the service providers listed in our Privacy Policy. It is stored with your account so you can sign in, and it appears in your household's member list so the people you share with can tell each other apart. Our emails never contain your amounts or expense details.</li>
            <li><strong>Group isolation:</strong> Firestore security rules restrict every group's data to the members of that group, and we run an automated test suite against those rules so a change cannot quietly loosen them.</li>
            <li><strong>Notifications say very little:</strong> A notification tells you that something happened or that a bill is due tomorrow. It never carries an amount, a balance, or the name of an expense, because it passes through Apple's and Google's delivery services and lands on your lock screen.</li>
            <li><strong>You can delete all of it:</strong> deleting your account removes you from your households, hands your share of each split to whoever is left, and deletes your profile and your sign-in. A household you share with other people keeps its ledger, because it is theirs too; a household where you were the last member is deleted with you.</li>
          </ul>
          <div className="bg-white/60 p-4 rounded-xl border border-natural-border/60 text-sm text-natural-dark italic mt-4 shadow-sm">
            We made the math take care of itself, so all that's left is the conversation. And money talk, had gently and honestly, can be the start of something sweet.
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
            className="w-full py-3 px-4 flex items-center justify-between text-sm font-bold text-natural-primary hover:bg-natural-primary/5 border border-natural-primary/15 hover:border-natural-primary/25 rounded-xl transition-all shadow-sm"
          >
            <span className="flex items-center gap-2"><Trash2 size={18} /> Delete Account &amp; All Data</span>
          </button>
          <p className="text-xs text-natural-muted px-1 leading-relaxed">
            Permanently deletes your profile, financial data, group membership, and your sign-in account. This cannot be undone.
          </p>
        </div>
      </section>
    </Modal>
  );
}
