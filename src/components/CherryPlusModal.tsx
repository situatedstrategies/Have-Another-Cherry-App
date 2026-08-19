import React, { useState } from 'react';
import { Cherry, Send, Check } from 'lucide-react';
import Modal from './Modal';
import { authHeader } from '../firebase';

// The "we're still working on it" page behind every Cherry + mention.
// Professional, on-brand, and it captures interest: signups are forwarded to
// poolside@haveanothercherry.com (and Mailchimp, once configured).
export default function CherryPlusModal({ onClose }: { onClose: () => void }) {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'done' | 'error'>('idle');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || status === 'sending') return;
    setStatus('sending');
    try {
      const res = await fetch('/api/plus-waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
        body: JSON.stringify({ email: email.trim() }),
      });
      setStatus(res.ok ? 'done' : 'error');
    } catch {
      setStatus('error');
    }
  };

  return (
    <Modal
      onClose={onClose}
      title="Cherry +"
      icon={<Cherry className="h-5 w-5 text-natural-primary" />}
    >
      <div className="space-y-5 text-center">
        <div className="inline-flex items-center justify-center p-4 bg-natural-sage rounded-full">
          <Cherry className="h-10 w-10 text-natural-primary" />
        </div>

        <div>
          <h3 className="text-xl font-display font-bold text-natural-text">This cherry tree is still growing.</h3>
          <p className="text-sm text-natural-muted mt-2 leading-relaxed max-w-sm mx-auto">
            Cherry + will bring deeper budgeting tools and more ways to keep money
            conversations kind. Keep in touch — and always stay sweet.
          </p>
        </div>

        {status === 'done' ? (
          <div className="bg-natural-sage/40 border border-natural-primary/20 rounded-xl p-4 flex items-center justify-center gap-2 text-sm font-bold text-natural-primary">
            <Check className="h-4 w-4" /> You're on the list — we'll write when it's ready.
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="max-w-sm mx-auto space-y-2">
            <label className="block text-xs font-bold text-natural-muted uppercase tracking-wider">
              Get updates when Cherry + launches
            </label>
            <div className="flex gap-2">
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="flex-1 px-3 py-2.5 bg-natural-bg/50 border border-natural-border focus:border-natural-primary rounded-xl text-sm outline-none transition-all"
              />
              <button
                type="submit"
                disabled={status === 'sending'}
                className="bg-natural-primary hover:bg-natural-dark text-white px-4 py-2.5 rounded-xl transition-colors disabled:opacity-50"
                aria-label="Sign up for updates"
              >
                {status === 'sending' ? <span className="animate-spin inline-block text-xs">◌</span> : <Send size={16} />}
              </button>
            </div>
            {status === 'error' && (
              <p className="text-xs text-red-500 font-medium">Couldn't save that — please try again.</p>
            )}
            <p className="text-[10px] text-natural-muted">
              Just launch news — no spam, and never your ledger.
            </p>
          </form>
        )}
      </div>
    </Modal>
  );
}
