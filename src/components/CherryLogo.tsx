// Brand logo: the full Two Cherries icon tile (owner, November 12th 2026), the
// same rounded tile the App Store icon export is cut from. Three WebP sizes
// cover the 28 to 56px it is drawn at on 1x, 2x and 3x screens, a few KB
// each; the 400px tile wrapped in logo.svg that preceded them was 244 KB on
// every page. Imported, so Vite hashes the files and the server caches them
// for a year. The email templates keep cherry2transparent.png for email
// client support.
import { useTranslation } from 'react-i18next';
import logo56 from '../assets/logo-56.webp';
import logo112 from '../assets/logo-112.webp';
import logo168 from '../assets/logo-168.webp';

export default function CherryLogo({ className = 'h-10 w-10' }: { className?: string }) {
  const { t } = useTranslation();
  return (
    <img
      src={logo56}
      srcSet={`${logo56} 56w, ${logo112} 112w, ${logo168} 168w`}
      sizes="56px"
      width={56}
      height={56}
      alt={t('common.logoAlt')}
      className={`object-contain ${className}`}
    />
  );
}
