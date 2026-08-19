// Password policy for account passwords: at least 8 characters, including a
// letter, a number, and a special character.
//
// This lives here rather than inline in a component because two separate flows
// have to agree on it: signup (AuthScreen) and the password-reset form
// (AuthActionHandler). If they drift, a user can be handed a reset form that
// accepts a password their account could never have been created with.

export interface PasswordChecks {
  length: boolean;
  letter: boolean;
  number: boolean;
  special: boolean;
}

export function checkPassword(password: string): PasswordChecks {
  return {
    length: password.length >= 8 && password.length <= 128,
    letter: /[A-Za-z]/.test(password),
    number: /[0-9]/.test(password),
    // A defined special-character set — whitespace doesn't count.
    special: /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?~`]/.test(password),
  };
}

export function isPasswordValid(password: string): boolean {
  return Object.values(checkPassword(password)).every(Boolean);
}

// Rendered as the live checklist under the password input.
export const PASSWORD_REQUIREMENTS: { key: keyof PasswordChecks; label: string }[] = [
  { key: 'length', label: 'At least 8 characters' },
  { key: 'letter', label: 'A letter (a–z or A–Z)' },
  { key: 'number', label: 'A number (0–9)' },
  { key: 'special', label: 'A special character (e.g. ! ? @ # $ %)' },
];

export const PASSWORD_POLICY_MESSAGE =
  'Password must be at least 8 characters and include a letter, a number, and a special character.';
