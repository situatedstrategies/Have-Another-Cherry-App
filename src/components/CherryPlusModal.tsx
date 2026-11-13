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
import { useTranslation } from 'react-i18next';

// The Cherry + page. Three plans, monthly, yearly and lifetime, all from the
// current RevenueCat offering so no price is ever typed here. Web selling
// runs through lib/billing.ts and RevenueCat's hosted checkout when
// VITE_RC_WEB_KEY is set; with no key the page explains where else to buy
// and offers the launch-news list instead.
export default function CherryPlusModal({
  onClose,
  customerEmail,
  onPurchased,
  intro,
}: {
  onClose: () => void;
  customerEmail?: string;
  onPurchased?: () => void;
  /** The tab that opened the page (Reports, Plan) and its one-line pitch,
   *  shown at the top so the page says why it is here. */
  intro?: { title: string; pitch: string } | null;
}) {
  const { t } = useTranslation();
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
        // Every package of the current offering, monthly first and lifetime
        // last (lib/billing.ts orders them). An empty list means the offering
        // is not set up yet and the page says so.
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

  // Monthly and yearly carry a 14-day free trial; lifetime is one payment.
  const PLAN_BLURB: Record<string, string> = {
    monthly: t('plus.monthlyBlurb'),
    yearly: t('plus.yearlyBlurb'),
    lifetime: t('plus.lifetimeBlurb'),
  };
  const PLAN_LABEL: Record<string, string> = {
    monthly: t('plus.monthly'),
    yearly: t('plus.yearly'),
    lifetime: t('plus.lifetime'),
  };

  const storeReady = (plans?.length ?? 0) > 0;

  return (
    <Modal
      onClose={onClose}
      title={t('plus.title')}
      icon={<Cherry className="h-5 w-5 text-natural-primary" />}
    >
      <div className="space-y-5 text-center">
        {intro && purchaseState !== 'purchased' && (
          <div
            className="text-left bg-natural-bg border border-natural-border rounded-2xl px-4 py-3"
            id="plus-intro"
          >
            <p className="flex items-center gap-2 font-display text-lg font-semibold text-natural-text">
              {intro.title}
              <span className="text-[10px] font-sans font-bold tracking-wider text-white bg-natural-dark px-1.5 py-0.5 rounded-md">
                Cherry +
              </span>
            </p>
            <p className="mt-0.5 text-sm text-natural-muted">{intro.pitch}</p>
          </div>
        )}
        <div className="inline-flex items-center justify-center p-4 bg-natural-sage rounded-full">
          <Cherry className="h-10 w-10 text-natural-primary" />
        </div>

        {purchaseState === 'purchased' ? (
          <div className="space-y-3">
            <h3 className="text-xl font-display font-semibold text-natural-text">
              {t('plus.welcome')}
            </h3>
            <div className="bg-natural-sage/40 border border-natural-primary/20 rounded-xl p-4 flex items-center justify-center gap-2 text-sm font-bold text-natural-primary">
              <Check className="h-4 w-4" /> {t('plus.unlocked')}
            </div>
            <button
              onClick={onClose}
              className="bg-natural-primary hover:bg-natural-primary-ink text-white text-sm font-bold px-6 py-2.5 rounded-xl transition-colors"
            >
              {t('plus.backToLedger')}
            </button>
          </div>
        ) : storeReady ? (
          <div className="space-y-4">
            <div>
              <h3 className="text-xl font-display font-semibold text-natural-text">
                {t('plus.headline')}
              </h3>
              <p className="text-sm text-natural-muted mt-2 leading-relaxed max-w-sm mx-auto">
                {t('plus.body')}
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
                {t('plus.manage')} <ExternalLink className="h-3 w-3" />
              </a>
            )}
            {isSandboxBilling && (
              <p className="text-[10px] text-natural-muted">{t('plus.sandbox')}</p>
            )}
            <p className="text-[10px] text-natural-muted max-w-sm mx-auto">{t('plus.fineprint')}</p>
          </div>
        ) : plans === null ? (
          <p className="text-sm text-natural-muted">{t('common.loading')}</p>
        ) : (
          <>
            <div>
              <h3 className="text-xl font-display font-semibold text-natural-text">
                {t('plus.notOpenYet')}
              </h3>
              <p className="text-sm text-natural-muted mt-2 leading-relaxed max-w-sm mx-auto">
                {t('plus.notOpenBody')}
              </p>
            </div>

            {status === 'done' ? (
              <div className="bg-natural-sage/40 border border-natural-primary/20 rounded-xl p-4 flex items-center justify-center gap-2 text-sm font-bold text-natural-primary">
                <Check className="h-4 w-4" /> {t('plus.onTheList')}
              </div>
            ) : (
              <form onSubmit={handleWaitlist} className="max-w-sm mx-auto space-y-2">
                <label className={`${labelClass} block`}>{t('plus.getNote')}</label>
                <div className="flex gap-2">
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={t('auth.emailPlaceholder')}
                    className="flex-1 px-3 py-2.5 bg-natural-bg/50 border border-natural-border focus:border-natural-primary rounded-xl text-sm outline-none transition-all"
                  />
                  <button
                    type="submit"
                    disabled={status === 'sending'}
                    className="bg-natural-primary hover:bg-natural-primary-ink text-white px-4 py-2.5 rounded-xl transition-colors disabled:opacity-50"
                    aria-label={t('plus.signUpForUpdates')}
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
                    {t('plus.couldNotSave')}
                  </p>
                )}
                <p className="text-xs text-natural-muted">{t('plus.justLaunchNews')}</p>
              </form>
            )}

            <div className="flex items-start gap-3 text-left bg-natural-pebble/60 border border-natural-border rounded-xl p-3.5 max-w-sm mx-auto">
              <Smartphone className="h-4 w-4 text-natural-primary shrink-0 mt-0.5" />
              <p className="text-xs text-natural-muted leading-relaxed">{t('plus.buyInApps')}</p>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
