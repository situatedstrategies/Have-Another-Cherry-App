import React from 'react';
import { Shield, FileText } from 'lucide-react';
import Modal from './Modal';

export type LegalDoc = 'terms' | 'privacy';

const EFFECTIVE_DATE = 'August 8, 2026';
const CONTACT_EMAIL = 'support@haveanothercherry.com';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-bold text-natural-text">{title}</h3>
      <div className="text-sm text-natural-muted leading-relaxed space-y-2">{children}</div>
    </section>
  );
}

function PrivacyPolicy() {
  return (
    <div className="space-y-6">
      <p className="text-xs text-natural-muted">Effective {EFFECTIVE_DATE}</p>

      <Section title="Overview">
        <p>
          Have Another Cherry ("we", "us") is a household expense-splitting app. This Privacy Policy explains what
          information we collect, how we use it, and the choices you have. We built the app to keep your financial
          details private by default.
        </p>
      </Section>

      <Section title="Information We Collect">
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Account information:</strong> your name and email address. Your email is hashed (SHA-256) before it is stored alongside your data.</li>
          <li><strong>Financial profile:</strong> your responses to the profile quiz and the income figures you enter, used to tailor split recommendations and insights.</li>
          <li><strong>Expense &amp; ledger data:</strong> the expenses, settlements, and comments you log. These are end-to-end encrypted on your device before being sent to our database.</li>
          <li><strong>Receipt images</strong> you choose to scan, which are processed to extract expense details.</li>
        </ul>
      </Section>

      <Section title="How We Protect Your Data">
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>End-to-end encryption:</strong> expense details and ledgers are encrypted on your device (AES) and can only be decrypted with your group's invite code.</li>
          <li><strong>Hashed identifiers:</strong> your email is hashed before storage; we do not store raw emails alongside your ledger data.</li>
          <li><strong>Group isolation:</strong> security rules restrict data access to members of your own group.</li>
        </ul>
      </Section>

      <Section title="How We Use Your Information">
        <p>To provide and operate the app: creating your group, splitting expenses, generating your financial profile and split recommendations, sending invite emails you request, and scanning receipts you submit. We do not sell your personal information.</p>
      </Section>

      <Section title="Service Providers">
        <p>
          We rely on trusted providers to run the app, including Google Firebase (authentication and database),
          Google Cloud / Vertex AI (receipt scanning and profile generation), and Resend (sending invite emails).
          These providers process data on our behalf under their own terms.
        </p>
      </Section>

      <Section title="Your Choices &amp; Rights">
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Export:</strong> download your ledger as a CSV at any time from Settings.</li>
          <li><strong>Leave a group:</strong> remove yourself from a group while keeping your account.</li>
          <li><strong>Delete your account:</strong> permanently deletes your profile, financial data, group membership, and sign-in account. This cannot be undone.</li>
        </ul>
      </Section>

      <Section title="Data Retention">
        <p>We keep your information for as long as your account is active. When you delete your account, your profile and personal data are removed and you are scrubbed from your group's member list.</p>
      </Section>

      <Section title="Children">
        <p>The app is not directed to individuals under 18, and we do not knowingly collect their information.</p>
      </Section>

      <Section title="Changes to This Policy">
        <p>We may update this policy from time to time. When we do, we will revise the effective date above.</p>
      </Section>

      <Section title="Contact">
        <p>Questions about privacy? Contact us at <span className="font-semibold text-natural-text">{CONTACT_EMAIL}</span>.</p>
      </Section>
    </div>
  );
}

function TermsOfService() {
  return (
    <div className="space-y-6">
      <p className="text-xs text-natural-muted">Effective {EFFECTIVE_DATE}</p>

      <Section title="Acceptance of Terms">
        <p>By creating an account or using Have Another Cherry (the "Service"), you agree to these Terms of Service. If you do not agree, please do not use the Service.</p>
      </Section>

      <Section title="The Service">
        <p>Have Another Cherry helps households and groups split shared expenses, track settlements, and understand their spending. Features include expense logging, income-based split recommendations, a financial-profile quiz, and AI-assisted receipt scanning.</p>
      </Section>

      <Section title="Eligibility &amp; Accounts">
        <p>You must be at least 18 years old to use the Service. You are responsible for keeping your login credentials secure and for all activity under your account. Your group's invite code is what keeps your ledger private — share it only with people you trust.</p>
      </Section>

      <Section title="Not Financial or Legal Advice">
        <p>
          Split recommendations, financial profiles, and any insights are provided for informational purposes only and
          are not financial, tax, or legal advice. The Service records what you and your group members enter; it does not
          move money. You are solely responsible for actual payments and settlements between members.
        </p>
      </Section>

      <Section title="AI Features">
        <p>Receipt scanning and profile generation use automated AI systems and may be inaccurate or incomplete. Always review scanned amounts and details before relying on them.</p>
      </Section>

      <Section title="Acceptable Use">
        <p>You agree not to misuse the Service, including attempting to access other groups' data, disrupting the Service, or using it for unlawful purposes.</p>
      </Section>

      <Section title="Your Data">
        <p>You retain ownership of the content you enter. Our handling of your data is described in the Privacy Policy. You may export or delete your data as described there.</p>
      </Section>

      <Section title="Termination">
        <p>You may stop using the Service and delete your account at any time. We may suspend or terminate access if these Terms are violated.</p>
      </Section>

      <Section title="Disclaimers &amp; Limitation of Liability">
        <p>The Service is provided "as is" without warranties of any kind. To the fullest extent permitted by law, we are not liable for any indirect or consequential damages, or for disputes between group members regarding shared expenses.</p>
      </Section>

      <Section title="Changes to These Terms">
        <p>We may update these Terms from time to time. Continued use of the Service after changes take effect constitutes acceptance of the updated Terms.</p>
      </Section>

      <Section title="Contact">
        <p>Questions about these Terms? Contact us at <span className="font-semibold text-natural-text">{CONTACT_EMAIL}</span>.</p>
      </Section>
    </div>
  );
}

export default function LegalModal({ doc, onClose }: { doc: LegalDoc; onClose: () => void }) {
  const isTerms = doc === 'terms';
  return (
    <Modal
      onClose={onClose}
      size="lg"
      icon={isTerms ? <FileText className="h-5 w-5 text-natural-primary" /> : <Shield className="h-5 w-5 text-natural-primary" />}
      title={isTerms ? 'Terms of Service' : 'Privacy Policy'}
    >
      {isTerms ? <TermsOfService /> : <PrivacyPolicy />}
    </Modal>
  );
}
