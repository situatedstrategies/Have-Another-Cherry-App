import React from 'react';
import { Shield, FileText } from 'lucide-react';
import Modal from './Modal';

export type LegalDoc = 'terms' | 'privacy';

const EFFECTIVE_DATE = 'August 19, 2026';
const CONTACT_EMAIL = 'help@haveanothercherry.com';
const PRIVACY_CONTACT = 'olivia@situatedstrategies.org';
const SITE = 'https://www.haveanothercherry.com';

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
          Have Another Cherry is provided by Situated Strategies LLC ("we", "us"). This is a plain-language summary
          of our Privacy Policy: what we collect, how we use it, and the choices you have. The complete policy,
          including GDPR and US state privacy rights, lives at{' '}
          <a href={`${SITE}/privacy`} target="_blank" rel="noopener noreferrer" className="font-semibold text-natural-primary hover:underline">{SITE.replace('https://', '')}/privacy</a>{' '}
          and is the authoritative version. We built the app to keep your financial details private by default.
        </p>
      </Section>

      <Section title="Information We Collect">
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Account information:</strong> your name and email address. We save your email: it is how you sign in and how we reach you. It is the only contact information we keep, and only a hashed (SHA-256) version sits alongside your ledger data.</li>
          <li><strong>Financial profile:</strong> your responses to the profile quiz and the income figures you enter, used to tailor split recommendations and insights.</li>
          <li><strong>Expense &amp; ledger data:</strong> the expenses, settlements, and comments you log. These are end-to-end encrypted on your device before being sent to our database.</li>
          <li><strong>Receipt images</strong> you choose to scan, which are processed to extract expense details.</li>
          <li><strong>Household Vault content</strong> you ask us to organise &mdash; notes, bills, statements, photos. Unlike your ledger, this is readable during processing so a model can extract a title, amount, due date and category; the endpoint is stateless and retains nothing, and the result is encrypted on your device before it is saved. Vault entries you save without requesting AI organisation are never sent.</li>
        </ul>
      </Section>

      <Section title="How We Protect Your Data">
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>End-to-end encryption:</strong> expense details and ledgers are encrypted on your device (AES) and can only be decrypted with your group's invite code.</li>
          <li><strong>The one exception:</strong> content you explicitly submit for AI processing (receipt scans, Vault organisation) is readable while it is processed. Nothing else leaves your device unencrypted.</li>
          <li><strong>Hashed identifiers:</strong> your email is hashed before storage; we do not store raw emails alongside your ledger data.</li>
          <li><strong>Group isolation:</strong> security rules restrict data access to members of your own group.</li>
        </ul>
      </Section>

      <Section title="How We Use Your Information">
        <p>To provide and operate the app: creating your group, splitting expenses, generating your financial profile and split recommendations, sending invite emails you request, and scanning receipts you submit. We do not sell your personal information.</p>
      </Section>

      <Section title="Email">
        <p>
          We save your email address and use it to service you: signing in, verification, password resets,
          invites, payment reminders a group member chooses to send, and product updates only if you opt in.
          We never sell it or share it beyond the providers that deliver the service. Our emails are written
          so they never contain your amounts, balances, or expense details, and every email includes a way
          to unsubscribe. Essential account emails, like a password reset you request, are the only exception.
        </p>
      </Section>

      <Section title="Service Providers">
        <p>
          We rely on trusted providers to run the app, including Google Firebase (authentication and database),
          Google Cloud / Vertex AI (receipt scanning and profile generation), and Resend (delivering our emails; our messages are written so its delivery logs never contain your ledger details).
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

      <Section title="Age Suitability">
        <p>
          Have Another Cherry is for anyone 13 and up. We built it for households, roommates, friends, and
          young people who are learning to manage shared money and to have honest, low-drama conversations
          about it. If you are between 13 and 17, use the app with a parent or guardian's permission.
          Inviting them into your group is a fine way to practice.
        </p>
        <p>
          The app is not directed to children under 13, and we do not knowingly collect their information.
          If you believe a child under 13 has created an account, email help@haveanothercherry.com and we
          will delete it.
        </p>
      </Section>

      <Section title="Changes to This Policy">
        <p>We may update this policy from time to time. When we do, we will revise the effective date above.</p>
      </Section>

      <Section title="Contact">
        <p>Support: <span className="font-semibold text-natural-text">{CONTACT_EMAIL}</span>. Privacy questions or rights requests: <span className="font-semibold text-natural-text">{PRIVACY_CONTACT}</span>.</p>
      </Section>
    </div>
  );
}

function TermsOfService() {
  return (
    <div className="space-y-6">
      <p className="text-xs text-natural-muted">Effective {EFFECTIVE_DATE}</p>

      <Section title="Acceptance of Terms">
        <p>
          By creating an account or using Have Another Cherry (the "Service", provided by Situated Strategies LLC),
          you agree to these Terms of Service. This is a plain-language summary; the complete Terms live at{' '}
          <a href={`${SITE}/terms`} target="_blank" rel="noopener noreferrer" className="font-semibold text-natural-primary hover:underline">{SITE.replace('https://', '')}/terms</a>{' '}
          and are the authoritative version. If you do not agree, please do not use the Service.
        </p>
      </Section>

      <Section title="The Service">
        <p>Have Another Cherry helps households and groups split shared expenses, track settlements, and understand their spending. Features include expense logging, income-based split recommendations, a financial-profile quiz, and AI-assisted receipt scanning.</p>
      </Section>

      <Section title="Eligibility &amp; Accounts">
        <p>You must be at least 13 years old to use the Service. If you are under 18, you may use it only with the permission of a parent or legal guardian, who agrees to these Terms on your behalf. You are responsible for keeping your login credentials secure and for all activity under your account. Your group's invite code is what keeps your ledger private - share it only with people you trust.</p>
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

      <Section title="Communications">
        <p>
          By creating an account you agree to receive essential service emails: verification, password resets you
          request, invitations, and payment reminders a member of your group chooses to send. Optional product
          updates are sent only if you opt in. Every email includes a way to unsubscribe, and none of our emails
          ever contain your amounts, balances, or expense details.
        </p>
      </Section>

      <Section title="Plans & Billing">
        <p>
          The free plan is genuinely free: unlimited expenses, no ads, no daily limits. Cherry + is our optional
          premium tier; it will be billed per user through the App Store and Google Play when our mobile apps
          launch, under those stores' terms.
        </p>
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
        <p>Questions about these Terms? Contact Situated Strategies LLC at <span className="font-semibold text-natural-text">{PRIVACY_CONTACT}</span>. Support: <span className="font-semibold text-natural-text">{CONTACT_EMAIL}</span>.</p>
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
