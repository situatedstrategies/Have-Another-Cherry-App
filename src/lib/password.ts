// Mirrors the Firebase project's password policy (Authentication -> Settings),
// which is enforced server side: 8 to 15 characters with a lowercase letter,
// an uppercase letter, a number and one allowed special character. The two
// have to agree exactly or the on-screen checklist passes a password the
// server refuses. Shared by signup and the reset form so they cannot drift.
// Mirrored in the Flutter app's lib/core/password_policy.dart.

import { t } from '../i18n';

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 15;

// Exactly Firebase's allowedNonAlphanumericCharacters; + and = are not in it.
const SPECIAL_RE = /[\^$*.[\]{}()?"!@#%&/\\,><':;|_~`-]/;

export interface PasswordChecks {
  length: boolean;
  lowercase: boolean;
  uppercase: boolean;
  number: boolean;
  special: boolean;
}

export function checkPassword(password: string): PasswordChecks {
  return {
    length: password.length >= PASSWORD_MIN_LENGTH && password.length <= PASSWORD_MAX_LENGTH,
    lowercase: /[a-z]/.test(password),
    uppercase: /[A-Z]/.test(password),
    number: /[0-9]/.test(password),
    special: SPECIAL_RE.test(password),
  };
}

export function isPasswordValid(password: string): boolean {
  return Object.values(checkPassword(password)).every(Boolean);
}

// Rendered as the live checklist under the password input. The labels are
// translation keys (src/locales), resolved with passwordRequirementLabel.
export const PASSWORD_REQUIREMENTS: { key: keyof PasswordChecks; labelKey: string }[] = [
  { key: 'length', labelKey: 'password.lengthRule' },
  { key: 'lowercase', labelKey: 'password.lowercase' },
  { key: 'uppercase', labelKey: 'password.uppercase' },
  { key: 'number', labelKey: 'password.number' },
  { key: 'special', labelKey: 'password.special' },
];

export function passwordRequirementLabel(labelKey: string): string {
  return t(labelKey, { min: PASSWORD_MIN_LENGTH, max: PASSWORD_MAX_LENGTH });
}

export function passwordPolicyMessage(): string {
  return t('password.policy', { min: PASSWORD_MIN_LENGTH, max: PASSWORD_MAX_LENGTH });
}
