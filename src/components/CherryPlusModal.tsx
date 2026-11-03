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
import { labelClass } from '../lib/ui';

// The ad-free page. Every feature is free; ads pay for the app, and this is
// the one thing for sale: a single payment that turns them off on every
// device you sign in to. Web selling runs through lib/billing.ts and
// RevenueCat's hosted checkout when VITE_RC_WEB_KEY is set; with no key the
// page explains where else to buy and offers the launch-news list instead.
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
      const [offerings, portal] = await Promise.all([plusOfferings(), manageSubscriptionUrl()]);
      if (!cancelled) {
        // The one-time plan is the only thing for sale. The monthly and
        // yearly packages stay in the shared offering for subscribers who
        // already have them and are never offered to a new buyer; if the
        // one-time plan is missing, the page says it is not open yet rather
        // than selling a subscription the site no longer describes.
        setPlans(offerings.filter((p) => p.key === 'lifetime'));
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
    lifetime: 'One payment. No ads, forever.',
  };
  const PLAN_LABEL: Record<string, string> = {
    lifetime: 'Remove ads',
  };

  const storeReady = (plans?.length ?? 0) > 0;

  return (
    <Modal
      onClose={onClose}
      title="Remove ads"
      icon={<Cherry className="h-5 w-5 text-natural-primary" />}
    >
      <div className="space-y-5 text-center">
        <div className="inline-flex items-center justify-center p-4 bg-natural-sage rounded-full">
          <Cherry className="h-10 w-10 text-natural-primary" />
        </div>

        {purchaseState === 'purchased' ? (
          <div className="space-y-3">
            <h3 className="text-xl font-display font-semibold text-natural-text">
              Ads are off. Thank you.
            </h3>
            <div className="bg-natural-sage/40 border border-natural-primary/20 rounded-xl p-4 flex items-center justify-center gap-2 text-sm font-bold text-natural-primary">
              <Check className="h-4 w-4" /> Ad-free follows your account to every device, apps
              included.
            </div>
            <button
              onClick={onClose}
              className="bg-natural-primary hover:bg-natural-primary-ink text-white text-sm font-bold px-6 py-2.5 rounded-xl transition-colors"
            >
              Back to the ledger
            </button>
          </div>
        ) : storeReady ? (
          <div className="space-y-4">
            <div>
              <h3 className="text-xl font-display font-semibold text-natural-text">
                Everything is free. The ads pay for it.
              </h3>
              <p className="text-sm text-natural-muted mt-2 leading-relaxed max-w-sm mx-auto">
                One payment turns them off for good, on every device you sign in to. Nothing else
                changes: every feature is already yours.
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
                    <span className="block text-sm font-bold text-natural-text">
                      {PLAN_LABEL[plan.key] || plan.title}
                    </span>
                    <span className="block text-xs text-natural-muted">
                      {PLAN_BLURB[plan.key] || plan.title}
                    </span>
                  </span>
                  <span className="text-sm font-bold text-natural-primary shrink-0">
                    {plan.price}
                  </span>
                </button>
              ))}
            </div>
            {purchaseState === 'error' && (
              <p className="text-xs text-natural-primary font-medium max-w-sm mx-auto">
                {purchaseError}
              </p>
            )}
            {manageUrl && (
              <a
                href={manageUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs font-bold text-natural-muted hover:text-natural-text"
              >
                Manage an existing purchase <ExternalLink className="h-3 w-3" />
              </a>
            )}
            {isSandboxBilling && (
              <p className="text-[10px] text-natural-muted">
                Sandbox billing - test cards only, no real charges.
              </p>
            )}
            <p className="text-[10px] text-natural-muted max-w-sm mx-auto">
              Prices subject to change with notice. Taxes may apply. Payments are processed by
              RevenueCat; we never see your card. Bought ad-free in the iPhone or Android app? It
              applies here too, on the same account.
            </p>
          </div>
        ) : plans === null ? (
          <p className="text-sm text-natural-muted">Loading...</p>
        ) : (
          <>
            <div>
              <h3 className="text-xl font-display font-semibold text-natural-text">
                Not open for purchase on the web just yet.
              </h3>
              <p className="text-sm text-natural-muted mt-2 leading-relaxed max-w-sm mx-auto">
                Every feature is free. Removing the ads will be a single small payment; leave your
                email and we will write when it opens here.
              </p>
            </div>

            {status === 'done' ? (
              <div className="bg-natural-sage/40 border border-natural-primary/20 rounded-xl p-4 flex items-center justify-center gap-2 text-sm font-bold text-natural-primary">
                <Check className="h-4 w-4" /> You're on the list - we'll write when it's ready.
              </div>
            ) : (
              <form onSubmit={handleWaitlist} className="max-w-sm mx-auto space-y-2">
                <label className={`${labelClass} block`}>Get a note when it opens</label>
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
                    {status === 'sending' ? (
                      <span className="animate-spin inline-block text-xs">◌</span>
                    ) : (
                      <Send size={16} />
                    )}
                  </button>
                </div>
                {status === 'error' && (
                  <p className="text-xs text-natural-primary font-medium">
                    Couldn't save that - please try again.
                  </p>
                )}
                <p className="text-xs text-natural-muted">
                  Just launch news - no spam, and never your ledger.
                </p>
              </form>
            )}

            <div className="flex items-start gap-3 text-left bg-natural-pebble/60 border border-natural-border rounded-xl p-3.5 max-w-sm mx-auto">
              <Smartphone className="h-4 w-4 text-natural-primary shrink-0 mt-0.5" />
              <p className="text-xs text-natural-muted leading-relaxed">
                Ad-free can be bought in the iPhone and Android apps. Buy it there once and it
                applies here too, on the same account.
              </p>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
