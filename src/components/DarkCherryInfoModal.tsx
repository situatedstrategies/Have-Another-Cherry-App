import { EyeOff, HandCoins, ShieldCheck, Cherry } from 'lucide-react';
import { Trans, useTranslation } from 'react-i18next';
import Modal from './Modal';

// First-use explainer for the Dark Cherry blind split. The "seen" flag is
// per-user and per-device - the point is that nobody meets a Dark Cherry cold.
const seenKey = (uid?: string) => `dark_cherry_intro_seen_${uid || 'anon'}`;

export const hasSeenDarkCherryIntro = (uid?: string): boolean => {
  try {
    return localStorage.getItem(seenKey(uid)) === '1';
  } catch {
    return true; // storage unavailable - don't nag every time
  }
};

export const markDarkCherryIntroSeen = (uid?: string) => {
  try {
    localStorage.setItem(seenKey(uid), '1');
  } catch {
    // best-effort
  }
};

export default function DarkCherryInfoModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  return (
    <Modal
      onClose={onClose}
      title={t('darkCherry.whatIs')}
      icon={<Cherry className="h-5 w-5 text-natural-primary" />}
      footer={
        <button
          onClick={onClose}
          className="w-full py-2.5 text-sm font-bold text-white bg-natural-primary hover:bg-natural-primary-ink rounded-full shadow-md transition-all cursor-pointer"
        >
          {t('common.gotIt')}
        </button>
      }
    >
      <div className="space-y-5">
        <p className="text-sm text-natural-text leading-relaxed">
          <Trans i18nKey="darkCherry.intro" components={{ 1: <strong /> }} />
        </p>

        <div className="space-y-3">
          <div className="flex gap-3 items-start bg-natural-bg/50 border border-natural-border rounded-xl p-3.5">
            <EyeOff className="h-5 w-5 text-natural-primary shrink-0 mt-0.5" />
            <p className="text-xs text-natural-text leading-relaxed">
              <Trans i18nKey="darkCherry.noTotals" components={{ 1: <strong /> }} />
            </p>
          </div>
          <div className="flex gap-3 items-start bg-natural-bg/50 border border-natural-border rounded-xl p-3.5">
            <HandCoins className="h-5 w-5 text-natural-primary shrink-0 mt-0.5" />
            <p className="text-xs text-natural-text leading-relaxed">
              <Trans i18nKey="darkCherry.giveWhatYouCan" components={{ 1: <strong /> }} />
            </p>
          </div>
          <div className="flex gap-3 items-start bg-natural-bg/50 border border-natural-border rounded-xl p-3.5">
            <ShieldCheck className="h-5 w-5 text-natural-primary shrink-0 mt-0.5" />
            <p className="text-xs text-natural-text leading-relaxed">
              <Trans i18nKey="darkCherry.closesItself" components={{ 1: <strong /> }} />
            </p>
          </div>
        </div>

        <p className="text-xs text-natural-muted leading-relaxed italic border-t border-natural-border/60 pt-3">
          {t('darkCherry.footer')}
        </p>
      </div>
    </Modal>
  );
}
