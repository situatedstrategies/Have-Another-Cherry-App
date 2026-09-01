import React, { useEffect, useState } from 'react';
import { Cherry, Send, Check, Smartphone, ExternalLink } from 'lucide-react';
import Modal from './Modal';
import { authHeader } from '../firebase';
import {
  billingAvailable,
  isSandboxBilling,
  plusOfferings,
  purchasePlus,
  manageSubscriptionUrl,
  type PlusPlan,
} from '../lib/billing';

// The Cherry + page. Today Cherry + is bought in the iOS/Android apps and the
// web only reads the entitlement (see the note rendered below) - that keeps
// the app clear of Apple's and Google's rules on outside payment, and nothing
// is sold here. Web selling exists behind lib/billing.ts and switches on only
// when VITE_RC_WEB_KEY is set: then this page offers the plans directly
// through RevenueCat's hosted checkout. With no key, behavior is unchanged:
// the waitlist card plus the where-to-buy note.
export default function CherryPlusModal({
  onClose,
  customerEmail,
  onPurchased,
}: {
  onClose: () => void;
  customerEmail?: string;
  onPurchased?: () => void;
}) {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'done' | 'error'>('idle');
  const [plans, setPlans] = useState<PlusPlan[] | null>(billingAvailable() ? null : []);
  const [buying, setBuying] = useState(false);
  const [purchaseState, setPurchaseState] = useState<'idle' | 'purchased' | 'error'>('idle');
  const [purchaseError, setPurchaseError] = useState('');
  const [manageUrl, setManageUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!billingAvailable()) return;
    let cancelled = false;
    (async () => {
      const [offerings, portal] = await Promise.all([
        plusOfferings(),
        manageSubscriptionUrl(),
      ]);
      if (!cancelled) {
        setPlans(offerings);
        setManageUrl(portal);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleBuy = async (plan: PlusPlan) => {
    if (buying) return;
    setBuying(true);
    setPurchaseState('idle');
    const outcome = await purchasePlus(plan, customerEmail);
    setBuying(false);
    if (outcome.status === 'purchased') {
      setPurchaseState('purchased');
      onPurchased?.();
    } else if (outcome.status === 'error') {
      setPurchaseState('error');
      setPurchaseError(outcome.message);
    }
    // cancelled: stay on the page quietly.
  };

  const handleWaitlist = async (e: React.FormEvent) => {
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

  const PLAN_BLURB: Record<string, string> = {
    monthly: 'Billed monthly. Cancel anytime.',
    yearly: 'Billed yearly - save ~37%.',
    lifetime: 'One payment. Cherries forever.',
  };

  const storeReady = (plans?.length ?? 0) > 0;

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

        {purchaseState === 'purchased' ? (
          <div className="space-y-3">
            <h3 className="text-xl font-display font-semibold text-natural-text">Welcome to Cherry +</h3>
            <div className="bg-natural-sage/40 border border-natural-primary/20 rounded-xl p-4 flex items-center justify-center gap-2 text-sm font-bold text-natural-primary">
              <Check className="h-4 w-4" /> Everything is unlocked - the vault, blind splits, insights, and more.
            </div>
            <button
              onClick={onClose}
              className="bg-natural-primary hover:bg-natural-primary-ink text-white text-sm font-bold px-6 py-2.5 rounded-xl transition-colors"
            >
              Enjoy your cherries
            </button>
          </div>
        ) : storeReady ? (
          <div className="space-y-4">
            <div>
              <h3 className="text-xl font-display font-semibold text-natural-text">The vault, blind splits and deeper insight.</h3>
              <p className="text-sm text-natural-muted mt-2 leading-relaxed max-w-sm mx-auto">
                Everything in Free, plus the Household Vault, Dark Cherry blind splits,
                spending thresholds, rhythm streaks, insights, and backups.
              </p>
            </div>
            <div className="space-y-2 max-w-sm mx-auto">
              {plans!.map((plan) => (
                <button
                  key={plan.key}
                  onClick={() => handleBuy(plan)}
                  disabled={buying}
                  className="w-full flex items-center justify-between bg-white border border-natural-border hover:border-natural-primary rounded-xl px-4 py-3 transition-colors disabled:opacity-50 text-left"
                >
                  <span>
                    <span className="block text-sm font-bold text-natural-text capitalize">{plan.key}</span>
                    <span className="block text-xs text-natural-muted">{PLAN_BLURB[plan.key] || plan.title}</span>
                  </span>
                  <span className="text-sm font-bold text-natural-primary shrink-0">{plan.price}</span>
                </button>
              ))}
            </div>
            {purchaseState === 'error' && (
              <p className="text-xs text-natural-primary font-medium max-w-sm mx-auto">{purchaseError}</p>
            )}
            {manageUrl && (
              <a
                href={manageUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs font-bold text-natural-muted hover:text-natural-text"
              >
                Manage existing subscription <ExternalLink className="h-3 w-3" />
              </a>
            )}
            {isSandboxBilling && (
              <p className="text-[10px] text-natural-muted">
                Sandbox billing - test cards only, no real charges.
              </p>
            )}
            <p className="text-[10px] text-natural-muted max-w-sm mx-auto">
              Prices subject to change with notice. Taxes may apply. Payments are
              processed by RevenueCat; we never see your card. Cherry + follows
              your account everywhere, apps included.
            </p>
          </div>
        ) : plans === null ? (
          <p className="text-sm text-natural-muted">Loading plans…</p>
        ) : (
          <>
            <div>
              <h3 className="text-xl font-display font-semibold text-natural-text">This tree is still growing.</h3>
              <p className="text-sm text-natural-muted mt-2 leading-relaxed max-w-sm mx-auto">
                Cherry + will bring deeper budgeting tools and more ways to keep money
                conversations kind. Keep in touch - and always stay sweet.
              </p>
            </div>

            {status === 'done' ? (
              <div className="bg-natural-sage/40 border border-natural-primary/20 rounded-xl p-4 flex items-center justify-center gap-2 text-sm font-bold text-natural-primary">
                <Check className="h-4 w-4" /> You're on the list - we'll write when it's ready.
              </div>
            ) : (
              <form onSubmit={handleWaitlist} className="max-w-sm mx-auto space-y-2">
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
                    className="bg-natural-primary hover:bg-natural-primary-ink text-white px-4 py-2.5 rounded-xl transition-colors disabled:opacity-50"
                    aria-label="Sign up for updates"
                  >
                    {status === 'sending' ? <span className="animate-spin inline-block text-xs">◌</span> : <Send size={16} />}
                  </button>
                </div>
                {status === 'error' && (
                  <p className="text-xs text-natural-primary font-medium">Couldn't save that - please try again.</p>
                )}
                <p className="text-xs text-natural-muted">
                  Just launch news - no spam, and never your ledger.
                </p>
              </form>
            )}

            {/* Where Cherry + is actually bought, stated once and in both states.
                Purchases happen in the iOS and Android apps through the store's own
                billing; the web reads the same entitlement, so premium bought there
                works here. Nothing is ever sold on this page, which is what keeps
                the app clear of Apple's and Google's rules on outside payment. */}
            <div className="flex items-start gap-3 text-left bg-natural-pebble/60 border border-natural-border rounded-xl p-3.5 max-w-sm mx-auto">
              <Smartphone className="h-4 w-4 text-natural-primary shrink-0 mt-0.5" />
              <p className="text-xs text-natural-muted leading-relaxed">
                Cherry + lives in the iPhone and Android apps. Subscribe there once
                and it unlocks here too, on the same account. There is nothing to
                buy on the web.
              </p>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
