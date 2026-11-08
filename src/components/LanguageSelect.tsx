import { useTranslation } from 'react-i18next';
import { Globe } from 'lucide-react';
import { LOCALE_NAMES, SUPPORTED_LOCALES, currentLocale, isLocale, setLocale } from '../i18n';

// The language switcher, on the sign-in screen and in Settings. The choice is
// remembered in localStorage by src/i18n.ts; `onChange` lets Settings also
// store it on the profile so emails can follow it later.
export default function LanguageSelect({
  onChange,
  className = '',
  compact = false,
}: {
  onChange?: (locale: string) => void;
  className?: string;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const value = currentLocale();
  return (
    <label className={`inline-flex items-center gap-1.5 text-xs text-natural-muted ${className}`}>
      <Globe className="h-3.5 w-3.5" aria-hidden="true" />
      {!compact && <span className="sr-only">{t('common.language')}</span>}
      <select
        aria-label={t('common.language')}
        value={value}
        onChange={async (e) => {
          const next = e.target.value;
          if (!isLocale(next)) return;
          await setLocale(next);
          onChange?.(next);
        }}
        className="bg-transparent border border-natural-border rounded-md px-2 py-1 text-xs text-natural-text outline-none focus:border-natural-primary"
      >
        {SUPPORTED_LOCALES.map((code) => (
          <option key={code} value={code}>
            {LOCALE_NAMES[code]}
          </option>
        ))}
      </select>
    </label>
  );
}
