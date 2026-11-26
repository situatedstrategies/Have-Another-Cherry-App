// The app's languages: English, Russian and Spanish (owner, November 8th
// 2026). Strings live in src/locales/<lang>/translation.json; components read
// them through react-i18next's useTranslation, helpers through `t` below.
//
// The language follows the browser (navigator.languages) unless the person
// has picked one in Settings or on the sign-in screen, which is remembered in
// localStorage under `hac_locale`. English is the fallback for anything a
// translation is missing, so a gap shows English rather than a key.
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import en from './locales/en/translation.json';

export const SUPPORTED_LOCALES = ['en', 'ru', 'es'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const LOCALE_NAMES: Record<Locale, string> = {
  en: 'English',
  ru: 'Русский',
  es: 'Español',
};

export const LOCALE_STORAGE_KEY = 'hac_locale';

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    // English is inline, so init finishes synchronously and `t` works on
    // first use. Russian and Spanish arrive through loadLocale below: only
    // the language in use is downloaded, not all three (the other two were
    // 250 KB of the entry chunk for every visitor).
    resources: { en: { translation: en } },
    partialBundledLanguages: true,
    initAsync: false,
    fallbackLng: 'en',
    supportedLngs: [...SUPPORTED_LOCALES],
    // "es-MX" and "ru-RU" fold onto "es" and "ru".
    nonExplicitSupportedLngs: true,
    load: 'languageOnly',
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: LOCALE_STORAGE_KEY,
      caches: ['localStorage'],
    },
    interpolation: { escapeValue: false },
    returnNull: false,
  });

function applyDocumentLang(lng: string) {
  if (typeof document !== 'undefined') document.documentElement.lang = lng;
}
applyDocumentLang(i18n.resolvedLanguage ?? 'en');
i18n.on('languageChanged', applyDocumentLang);

/** The active language, always one of SUPPORTED_LOCALES. */
export function currentLocale(): Locale {
  const lng = i18n.resolvedLanguage ?? i18n.language ?? 'en';
  const base = lng.split('-')[0];
  return isLocale(base) ? base : 'en';
}

/** The BCP 47 tag Intl should format with for the active language. */
export function intlLocale(): string {
  return currentLocale() === 'en' ? 'en-US' : currentLocale();
}

// The two languages that are not inline, each its own chunk, fetched the
// first time it is needed.
const localeLoaders: Record<Exclude<Locale, 'en'>, () => Promise<{ default: object }>> = {
  ru: () => import('./locales/ru/translation.json'),
  es: () => import('./locales/es/translation.json'),
};

/** Make sure a language's strings are loaded; resolves at once for English. */
async function loadLocale(locale: Locale): Promise<void> {
  if (locale === 'en' || i18n.hasResourceBundle(locale, 'translation')) return;
  const bundle = await localeLoaders[locale]();
  i18n.addResourceBundle(locale, 'translation', bundle.default, true, true);
}

/**
 * Settled once the detected language's strings are in place. main.tsx waits
 * on this before the first render so a Russian or Spanish visitor never sees
 * an English frame first. If the chunk fails to load the app still renders,
 * in English (the fallback), rather than not at all.
 */
export const i18nReady: Promise<void> = (async () => {
  // The detected language, not currentLocale(): resolvedLanguage falls back
  // to English until the detected language's bundle is in place.
  const detected = (i18n.language ?? 'en').split('-')[0];
  const locale: Locale = isLocale(detected) ? detected : 'en';
  if (locale === 'en') return;
  await loadLocale(locale);
  await i18n.changeLanguage(locale);
})().catch((err) => {
  console.warn('Language bundle unavailable, falling back to English:', err);
});

/** Switch language; remembered for the next visit. */
export async function setLocale(locale: Locale): Promise<void> {
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // Private mode: the choice lasts for this visit.
  }
  await loadLocale(locale);
  await i18n.changeLanguage(locale);
}

/** Plain-function access for helpers outside React (errors, labels). */
export const t = i18n.t.bind(i18n);

export default i18n;
