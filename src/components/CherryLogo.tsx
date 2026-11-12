// Brand logo: the Two Cherries mark (public/logo.svg wraps the transparent PNG). The email
// templates keep the PNG mark for email-client support.
import { useTranslation } from 'react-i18next';

export default function CherryLogo({ className = 'h-10 w-10' }: { className?: string }) {
  const { t } = useTranslation();
  return (
    <img src="/logo.svg" alt={t('common.logoAlt')} className={`object-contain ${className}`} />
  );
}
