import React from 'react';
import { Shield, FileText } from 'lucide-react';
import { Trans, useTranslation } from 'react-i18next';
import Modal from './Modal';

export type LegalDoc = 'terms' | 'privacy';

const CONTACT_EMAIL = 'help@haveanothercherry.com';
const PRIVACY_CONTACT = 'olivia@situatedstrategies.org';
const SITE = 'https://www.haveanothercherry.com';
const SITE_HOST = SITE.replace('https://', '');

// The texts live in src/locales under legalDoc.*; English is the
// authoritative summary and the Russian and Spanish versions translate it
// completely. The full documents stay on the marketing site.

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-bold text-natural-text">{title}</h3>
      <div className="text-sm text-natural-muted leading-relaxed space-y-2">{children}</div>
    </section>
  );
}

const strong = { 1: <strong /> };

function SiteLink({ path }: { path: string }) {
  return (
    <a
      href={`${SITE}${path}`}
      target="_blank"
      rel="noopener noreferrer"
      className="font-semibold text-natural-primary hover:underline"
    />
  );
}

function PrivacyPolicy() {
  const { t } = useTranslation();
  return (
    <div className="space-y-6">
      <p className="text-xs text-natural-muted">
        {t('legalDoc.effective', { date: t('legalDoc.effectiveDate') })}
      </p>

      <Section title={t('legalDoc.privacy.overview')}>
        <p>
          <Trans
            i18nKey="legalDoc.privacy.overviewBody"
            values={{ site: SITE_HOST }}
            components={{ 1: <SiteLink path="/privacy" /> }}
          />
        </p>
      </Section>

      <Section title={t('legalDoc.privacy.collect')}>
        <ul className="list-disc pl-5 space-y-1">
          <li>
            <Trans i18nKey="legalDoc.privacy.collectAccount" components={strong} />
          </li>
          <li>
            <Trans i18nKey="legalDoc.privacy.collectProfile" components={strong} />
          </li>
          <li>
            <Trans i18nKey="legalDoc.privacy.collectLedger" components={strong} />
          </li>
          <li>
            <Trans i18nKey="legalDoc.privacy.collectReceipts" components={strong} />
          </li>
          <li>
            <Trans i18nKey="legalDoc.privacy.collectVault" components={strong} />
          </li>
        </ul>
      </Section>

      <Section title={t('legalDoc.privacy.protect')}>
        <ul className="list-disc pl-5 space-y-1">
          <li>
            <Trans i18nKey="legalDoc.privacy.protectEncrypted" components={strong} />
          </li>
          <li>
            <Trans i18nKey="legalDoc.privacy.protectAi" components={strong} />
          </li>
          <li>
            <Trans i18nKey="legalDoc.privacy.protectNotEncrypted" components={strong} />
          </li>
          <li>
            <Trans i18nKey="legalDoc.privacy.protectIsolation" components={strong} />
          </li>
        </ul>
      </Section>

      <Section title={t('legalDoc.privacy.use')}>
        <p>{t('legalDoc.privacy.useBody')}</p>
      </Section>

      <Section title={t('legalDoc.privacy.email')}>
        <p>{t('legalDoc.privacy.emailBody')}</p>
      </Section>

      <Section title={t('legalDoc.privacy.providers')}>
        <p>{t('legalDoc.privacy.providersBody')}</p>
      </Section>

      <Section title={t('legalDoc.privacy.choices')}>
        <ul className="list-disc pl-5 space-y-1">
          <li>
            <Trans i18nKey="legalDoc.privacy.choicesExport" components={strong} />
          </li>
          <li>
            <Trans i18nKey="legalDoc.privacy.choicesLeave" components={strong} />
          </li>
          <li>
            <Trans i18nKey="legalDoc.privacy.choicesDelete" components={strong} />
          </li>
        </ul>
      </Section>

      <Section title={t('legalDoc.privacy.retention')}>
        <p>{t('legalDoc.privacy.retentionBody')}</p>
      </Section>

      <Section title={t('legalDoc.privacy.age')}>
        <p>{t('legalDoc.privacy.ageBody1')}</p>
        <p>{t('legalDoc.privacy.ageBody2', { email: CONTACT_EMAIL })}</p>
      </Section>

      <Section title={t('legalDoc.privacy.changes')}>
        <p>{t('legalDoc.privacy.changesBody')}</p>
      </Section>

      <Section title={t('legalDoc.contact')}>
        <p>
          <Trans
            i18nKey="legalDoc.privacy.contactBody"
            values={{ support: CONTACT_EMAIL, privacy: PRIVACY_CONTACT }}
            components={{
              1: <span className="font-semibold text-natural-text" />,
              3: <span className="font-semibold text-natural-text" />,
            }}
          />
        </p>
      </Section>
    </div>
  );
}

function TermsOfService() {
  const { t } = useTranslation();
  return (
    <div className="space-y-6">
      <p className="text-xs text-natural-muted">
        {t('legalDoc.effective', { date: t('legalDoc.effectiveDate') })}
      </p>

      <Section title={t('legalDoc.terms.acceptance')}>
        <p>
          <Trans
            i18nKey="legalDoc.terms.acceptanceBody"
            values={{ site: SITE_HOST }}
            components={{ 1: <SiteLink path="/terms" /> }}
          />
        </p>
      </Section>

      <Section title={t('legalDoc.terms.service')}>
        <p>{t('legalDoc.terms.serviceBody')}</p>
      </Section>

      <Section title={t('legalDoc.terms.eligibility')}>
        <p>{t('legalDoc.terms.eligibilityBody')}</p>
      </Section>

      <Section title={t('legalDoc.terms.notAdvice')}>
        <p>{t('legalDoc.terms.notAdviceBody')}</p>
      </Section>

      <Section title={t('legalDoc.terms.ai')}>
        <p>{t('legalDoc.terms.aiBody')}</p>
      </Section>

      <Section title={t('legalDoc.terms.communications')}>
        <p>{t('legalDoc.terms.communicationsBody')}</p>
      </Section>

      <Section title={t('legalDoc.terms.plans')}>
        <p>{t('legalDoc.terms.plansBody')}</p>
      </Section>

      <Section title={t('legalDoc.terms.acceptableUse')}>
        <p>{t('legalDoc.terms.acceptableUseBody')}</p>
      </Section>

      <Section title={t('legalDoc.terms.yourData')}>
        <p>{t('legalDoc.terms.yourDataBody')}</p>
      </Section>

      <Section title={t('legalDoc.terms.termination')}>
        <p>{t('legalDoc.terms.terminationBody')}</p>
      </Section>

      <Section title={t('legalDoc.terms.disclaimers')}>
        <p>{t('legalDoc.terms.disclaimersBody')}</p>
      </Section>

      <Section title={t('legalDoc.terms.changes')}>
        <p>{t('legalDoc.terms.changesBody')}</p>
      </Section>

      <Section title={t('legalDoc.contact')}>
        <p>
          <Trans
            i18nKey="legalDoc.terms.contactBody"
            values={{ support: CONTACT_EMAIL, privacy: PRIVACY_CONTACT }}
            components={{
              1: <span className="font-semibold text-natural-text" />,
              3: <span className="font-semibold text-natural-text" />,
            }}
          />
        </p>
      </Section>
    </div>
  );
}

export default function LegalModal({ doc, onClose }: { doc: LegalDoc; onClose: () => void }) {
  const { t } = useTranslation();
  const isTerms = doc === 'terms';
  return (
    <Modal
      onClose={onClose}
      size="lg"
      icon={
        isTerms ? (
          <FileText className="h-5 w-5 text-natural-primary" />
        ) : (
          <Shield className="h-5 w-5 text-natural-primary" />
        )
      }
      title={isTerms ? t('legal.terms') : t('legal.privacy')}
    >
      {isTerms ? <TermsOfService /> : <PrivacyPolicy />}
    </Modal>
  );
}
