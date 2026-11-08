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
import ru from './locales/ru/translation.json';
import es from './locales/es/translation.json';

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
    resources: {
      en: { translation: en },
      ru: { translation: ru },
      es: { translation: es },
    },
    // Inline resources: finish init synchronously so `t` works on first use.
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

/** Switch language; remembered for the next visit. */
export async function setLocale(locale: Locale): Promise<void> {
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // Private mode: the choice lasts for this visit.
  }
  await i18n.changeLanguage(locale);
}

/** Plain-function access for helpers outside React (errors, labels). */
export const t = i18n.t.bind(i18n);

export default i18n;
