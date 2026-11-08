import { Shield, Lock, FileText, Download, Trash2 } from 'lucide-react';
import { Trans, useTranslation } from 'react-i18next';
import Modal from './Modal';
import { LegalDoc } from './LegalModal';

interface PrivacyModalProps {
  onClose: () => void;
  onOpenLegal: (doc: LegalDoc) => void;
  onExportData: () => void;
  onDeleteAccount: () => void;
}

const strong = { 1: <strong /> };

export default function PrivacyModal({
  onClose,
  onOpenLegal,
  onExportData,
  onDeleteAccount,
}: PrivacyModalProps) {
  const { t } = useTranslation();
  return (
    <Modal
      onClose={onClose}
      size="lg"
      icon={<Shield className="h-5 w-5 text-natural-primary" />}
      title={t('privacyModal.title')}
      bodyClassName="p-6 space-y-8"
    >
      <section>
        <h3 className="text-sm font-bold text-natural-text mb-3 flex items-center gap-2">
          <Lock size={16} className="text-natural-muted" /> {t('privacyModal.howProtected')}
        </h3>
        <div className="bg-natural-sage/20 p-5 rounded-2xl border border-natural-sage/30 text-sm text-natural-text leading-relaxed space-y-4">
          <p>{t('privacyModal.intro')}</p>
          <ul className="list-disc pl-5 space-y-2 text-natural-muted">
            <li>
              <Trans i18nKey="privacyModal.encrypted" components={strong} />
            </li>
            <li>
              <Trans i18nKey="privacyModal.minimalContact" components={strong} />
            </li>
            <li>
              <Trans i18nKey="privacyModal.isolation" components={strong} />
            </li>
            <li>
              <Trans i18nKey="privacyModal.notifications" components={strong} />
            </li>
            <li>
              <Trans i18nKey="privacyModal.noAds" components={strong} />
            </li>
            <li>
              <Trans i18nKey="privacyModal.deleteAll" components={strong} />
            </li>
          </ul>
          <div className="bg-white/60 p-4 rounded-xl border border-natural-border/60 text-sm text-natural-dark italic mt-4 shadow-sm">
            {t('privacyModal.quote')}
          </div>
          <p className="text-xs text-natural-muted mt-2 border-t border-natural-border pt-3">
            <em>{t('privacyModal.trademarks')}</em>
          </p>
        </div>
      </section>

      <section>
        <h3 className="text-sm font-bold text-natural-text mb-3 flex items-center gap-2">
          <FileText size={16} className="text-natural-muted" /> {t('privacyModal.legalDocs')}
        </h3>
        <div className="space-y-3">
          <button
            onClick={() => onOpenLegal('terms')}
            className="w-full text-left p-4 rounded-xl border border-natural-border bg-natural-bg/50 hover:bg-white hover:border-natural-primary/40 transition-colors flex items-center justify-between gap-2"
          >
            <span className="flex flex-col gap-0.5">
              <span className="font-semibold text-natural-text text-sm">{t('legal.terms')}</span>
              <span className="text-xs text-natural-muted">{t('privacyModal.readTerms')}</span>
            </span>
            <FileText size={16} className="text-natural-primary shrink-0" />
          </button>
          <button
            onClick={() => onOpenLegal('privacy')}
            className="w-full text-left p-4 rounded-xl border border-natural-border bg-natural-bg/50 hover:bg-white hover:border-natural-primary/40 transition-colors flex items-center justify-between gap-2"
          >
            <span className="flex flex-col gap-0.5">
              <span className="font-semibold text-natural-text text-sm">{t('legal.privacy')}</span>
              <span className="text-xs text-natural-muted">{t('privacyModal.readPrivacy')}</span>
            </span>
            <Shield size={16} className="text-natural-primary shrink-0" />
          </button>
        </div>
      </section>

      <section>
        <h3 className="text-sm font-bold text-natural-text mb-3">{t('privacyModal.dataControls')}</h3>
        <div className="bg-white p-4 rounded-2xl border border-natural-border space-y-3">
          <button
            onClick={onExportData}
            className="w-full py-3 px-4 flex items-center justify-between text-sm font-bold text-natural-text hover:bg-natural-bg/50 border border-natural-border rounded-xl transition-all shadow-sm"
          >
            <span className="flex items-center gap-2">
              <Download size={18} className="text-natural-primary" /> {t('privacyModal.exportCsv')}
            </span>
          </button>

          <div className="border-t border-natural-border/50"></div>

          <button
            onClick={onDeleteAccount}
            className="w-full py-3 px-4 flex items-center justify-between text-sm font-bold text-natural-primary hover:bg-natural-primary/5 border border-natural-primary/15 hover:border-natural-primary/25 rounded-xl transition-all shadow-sm"
          >
            <span className="flex items-center gap-2">
              <Trash2 size={18} /> {t('privacyModal.deleteAccount')}
            </span>
          </button>
          <p className="text-xs text-natural-muted px-1 leading-relaxed">
            {t('privacyModal.deleteWarning')}
          </p>
        </div>
      </section>
    </Modal>
  );
}
