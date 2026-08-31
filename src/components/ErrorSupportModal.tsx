import React from 'react';
import { AlertTriangle, LifeBuoy } from 'lucide-react';
import Modal from './Modal';
import { CherryError, supportMailto, SUPPORT_EMAIL } from '../lib/errors';

// The one error dialog: what failed in plain words, what stands, what to do -
// and a Contact Support button that opens a pre-filled email to
// help@haveanothercherry.com carrying the error code, screen, time and
// browser, plus a describe-what-happened prompt. `detail` is technical
// context that travels only in that email, never in the user's face.
export default function ErrorSupportModal({
  error,
  screen,
  detail,
  onClose,
}: {
  error: CherryError;
  screen?: string;
  detail?: string;
  onClose: () => void;
}) {
  return (
    <Modal
      onClose={onClose}
      title={error.title}
      icon={<AlertTriangle className="h-5 w-5 text-natural-primary" />}
    >
      <div className="space-y-4">
        <p className="text-sm text-natural-text leading-relaxed">{error.message}</p>
        <p className="text-xs text-natural-muted leading-relaxed">{error.hint}</p>
        <div className="flex flex-col sm:flex-row gap-2 pt-1">
          <a
            href={supportMailto(error, screen, detail)}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-natural-border text-sm font-bold text-natural-text hover:border-natural-primary/50 transition-colors"
          >
            <LifeBuoy className="h-4 w-4" /> Contact Support
          </a>
          <button
            onClick={onClose}
            className="flex-1 bg-natural-primary hover:bg-natural-primary-ink text-white text-sm font-bold px-4 py-2.5 rounded-xl transition-colors"
          >
            OK
          </button>
        </div>
        <p className="text-[10px] text-natural-muted">
          No mail app? Write to {SUPPORT_EMAIL} and mention what happened.
        </p>
      </div>
    </Modal>
  );
}
