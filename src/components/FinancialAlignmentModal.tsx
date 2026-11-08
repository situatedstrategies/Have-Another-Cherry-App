import { useEffect, useState } from 'react';
import { useTranslation, Trans } from 'react-i18next';
import { intlLocale, t as tr } from '../i18n';
import { Sparkles, MessageCircleHeart, RefreshCcw } from 'lucide-react';
import Modal from './Modal';
import { authHeader } from '../firebase';
import { User } from '../types';
import { labelClass } from '../lib/ui';

interface Props {
  members: Pick<User, 'uid' | 'name' | 'income' | 'partnerIncome' | 'financialProfile'>[];
  activeUser: string;
  /** Worst reported-vs-estimated gap across the group, as a percentage. */
  severityPct: number;
  onClose: () => void;
}

const currency = (value: unknown): string | null => {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return new Intl.NumberFormat(intlLocale(), {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(n);
};

// Reasonable openers if the AI call fails - picked by how large the gap is.
const fallbackStarter = (severityPct: number) => {
  if (severityPct >= 50) return tr('align.fallbackHigh');
  if (severityPct >= 25) return tr('align.fallbackMid');
  return tr('align.fallbackLow');
};

/**
 * Opened from the income-discrepancy banner. Shows each member's narrative
 * financial profile, the raw numbers everyone reported, and an AI-written
 * conversation starter tuned to how big the gap is and how each person
 * prefers to talk about money.
 */
export default function FinancialAlignmentModal({
  members,
  activeUser,
  severityPct,
  onClose,
}: Props) {
  const { t } = useTranslation();
  const [starter, setStarter] = useState<string | null>(null);
  const [loadingStarter, setLoadingStarter] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/generate-conversation-starter', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
          body: JSON.stringify({
            severityPct: Math.round(severityPct),
            styles: members.map((m) => ({
              name: m.name || t('common.someone'),
              type: m.financialProfile?.type || '',
              communicationStyle: m.financialProfile?.communicationStyle || '',
            })),
          }),
        });
        const data = res.ok ? await res.json() : null;
        if (!cancelled) setStarter(data?.starter || fallbackStarter(severityPct));
      } catch {
        if (!cancelled) setStarter(fallbackStarter(severityPct));
      } finally {
        if (!cancelled) setLoadingStarter(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Modal
      onClose={onClose}
      title={t('align.title')}
      icon={<Sparkles className="h-5 w-5 text-natural-primary" />}
      size="lg"
    >
      <div className="space-y-6">
        {/* Narrative profiles only - no scores, no quiz answers. */}
        <section>
          <h3 className={`${labelClass} mb-2`}>{t('align.yourStyles')}</h3>
          <div className="space-y-3">
            {members.map((m) => (
              <div
                key={m.uid}
                className="bg-natural-bg/50 border border-natural-border rounded-xl p-4"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-bold text-natural-text capitalize">
                    {m.uid === activeUser ? t('common.you') : m.name || t('common.someone')}
                  </span>
                  {m.financialProfile?.type && (
                    <span className="text-xs font-semibold text-natural-primary text-right">
                      {m.financialProfile.type}
                    </span>
                  )}
                </div>
                {m.financialProfile?.description ? (
                  <p className="text-sm text-natural-text mt-1.5 leading-relaxed">
                    {m.financialProfile.description}
                  </p>
                ) : (
                  <p className="text-sm text-natural-muted mt-1.5 italic">
                    {t('align.notFinished')}
                  </p>
                )}
                {m.financialProfile?.communicationStyle && (
                  <p className="text-xs text-natural-muted mt-2 border-t border-natural-border/50 pt-2">
                    <span className="font-semibold">{t('align.talkingAboutMoney')}</span>{' '}
                    {m.financialProfile.communicationStyle}
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* The raw numbers, side by side. */}
        <section>
          <h3 className={`${labelClass} mb-2`}>{t('align.whatReported')}</h3>
          <div className="bg-natural-sage/20 border border-natural-primary/20 rounded-xl p-4 space-y-3">
            {members.map((m) => {
              const own = currency(m.income);
              const estimate = currency(m.partnerIncome);
              const label = m.uid === activeUser ? t('common.you') : m.name || t('common.someone');
              return (
                <div
                  key={m.uid}
                  className="text-sm border-b border-natural-border/40 pb-2 last:border-0 last:pb-0"
                >
                  <span className="font-semibold text-natural-text capitalize">{label}</span>
                  <div className="mt-0.5 space-y-0.5">
                    <div className="flex justify-between text-natural-muted">
                      <span>{t('align.reportedOwn')}</span>
                      <span className="font-mono font-semibold text-natural-text">
                        {own || t('align.notShared')}
                      </span>
                    </div>
                    <div className="flex justify-between text-natural-muted">
                      <span>
                        {members.length <= 2 ? t('align.estimateOther') : t('align.estimateOthers')}
                      </span>
                      <span className="font-mono font-semibold text-natural-text">
                        {estimate || t('align.noEstimate')}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
            <p className="text-xs text-natural-muted pt-1">
              <Trans
                i18nKey="align.differBy"
                values={{ pct: Math.round(severityPct) }}
                components={{ 1: <span className="font-mono font-bold" /> }}
              />
            </p>
          </div>
        </section>

        {/* AI conversation starter, tuned to severity + styles. */}
        <section>
          <h3 className={`${labelClass} mb-2`}>{t('align.wayToStart')}</h3>
          <div className="bg-white border border-natural-border rounded-xl p-4 flex gap-3 items-start shadow-sm">
            <MessageCircleHeart className="h-5 w-5 text-natural-primary shrink-0 mt-0.5" />
            {loadingStarter ? (
              <div className="flex items-center gap-2 text-sm text-natural-muted">
                <RefreshCcw className="h-4 w-4 animate-spin" /> {t('align.writing')}
              </div>
            ) : (
              <p className="text-sm text-natural-text leading-relaxed italic">{starter}</p>
            )}
          </div>
        </section>
      </div>
    </Modal>
  );
}
