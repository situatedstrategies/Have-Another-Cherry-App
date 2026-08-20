import firebaseConfig from '../../firebase-applet-config.json';

declare global {
  interface Window {
    grecaptcha?: {
      enterprise: {
        ready: (cb: () => void) => void;
        execute: (siteKey: string, options: { action: string }) => Promise<string>;
      };
    };
  }
}

export const RECAPTCHA_SITE_KEY = firebaseConfig.recaptchaSiteKey;

let scriptPromise: Promise<void> | null = null;

function loadRecaptchaScript(): Promise<void> {
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      if (window.grecaptcha?.enterprise) {
        resolve();
        return;
      }
      const script = document.createElement('script');
      script.src = `https://www.google.com/recaptcha/enterprise.js?render=${RECAPTCHA_SITE_KEY}`;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => {
        scriptPromise = null;
        reject(new Error('Failed to load reCAPTCHA script'));
      };
      document.head.appendChild(script);
    });
  }
  return scriptPromise;
}

// Mint a reCAPTCHA Enterprise token for a user action (e.g. "LOGIN", "SIGNUP").
// Returns null when reCAPTCHA is unavailable (no site key, blocked script) so
// callers can decide how to degrade.
export async function getRecaptchaToken(action: string): Promise<string | null> {
  if (!RECAPTCHA_SITE_KEY) return null;
  try {
    await loadRecaptchaScript();
    const grecaptcha = window.grecaptcha!;
    await new Promise<void>((resolve) => grecaptcha.enterprise.ready(resolve));
    return await grecaptcha.enterprise.execute(RECAPTCHA_SITE_KEY, { action });
  } catch (err) {
    console.warn('reCAPTCHA token unavailable:', err);
    return null;
  }
}

// Verify a user action against the server-side assessment endpoint.
// Fails open (returns true) when reCAPTCHA never produced a token or the
// verification endpoint is unreachable, and closed when Google scores the
// interaction as risky.
export async function verifyRecaptcha(action: string): Promise<boolean> {
  const token = await getRecaptchaToken(action);
  if (!token) return true;
  try {
    const res = await fetch('/api/verify-recaptcha', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, action }),
    });
    if (!res.ok) return true;
    const data = await res.json();
    return data.allowed !== false;
  } catch (err) {
    console.warn('reCAPTCHA verification unavailable:', err);
    return true;
  }
}
