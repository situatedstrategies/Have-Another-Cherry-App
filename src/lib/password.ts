// Password policy for account passwords. This MIRRORS the Firebase project's
// own policy (Authentication -> Settings -> Password policy, enforced server
// side), read from GET identitytoolkit.googleapis.com/v2/passwordPolicy:
//
//   8 to 15 characters, with a lowercase letter, an uppercase letter, a
//   number, and one of the allowed special characters below.
//
// The two have to agree exactly. When this checker was looser than the server
// (up to 128 characters, no uppercase required) a user could satisfy every
// item on the on-screen checklist and still be refused with a server error.
// If the policy in the console changes, change this file the same day.
//
// It lives here rather than inline in a component because two separate flows
// have to agree on it: signup (AuthScreen) and the password-reset form
// (AuthActionHandler). If they drift, a user can be handed a reset form that
// accepts a password their account could never have been created with.
//
// Mirrored in the Flutter app's `lib/core/password_policy.dart`.

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 15;

// Exactly the set Firebase reports as allowedNonAlphanumericCharacters. Note
// that + and = are NOT in it, so "Pass1+" style passwords are refused.
export const PASSWORD_SPECIAL_CHARS = '^$*.[]{}()?"!@#%&/\\,><\':;|_~`-';
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

// Rendered as the live checklist under the password input.
export const PASSWORD_REQUIREMENTS: { key: keyof PasswordChecks; label: string }[] = [
  { key: 'length', label: `${PASSWORD_MIN_LENGTH} to ${PASSWORD_MAX_LENGTH} characters` },
  { key: 'lowercase', label: 'A lowercase letter (a-z)' },
  { key: 'uppercase', label: 'An uppercase letter (A-Z)' },
  { key: 'number', label: 'A number (0-9)' },
  { key: 'special', label: 'A special character (e.g. ! ? @ # $ %)' },
];

export const PASSWORD_POLICY_MESSAGE =
  `Password must be ${PASSWORD_MIN_LENGTH} to ${PASSWORD_MAX_LENGTH} characters and include a lowercase letter, an uppercase letter, a number, and a special character.`;
