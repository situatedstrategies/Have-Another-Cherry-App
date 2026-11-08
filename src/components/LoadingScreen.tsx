import { RefreshCcw } from 'lucide-react';
import { useTranslation } from 'react-i18next';

// Same background as every other screen, so switching never flashes white.
export default function LoadingScreen({ label }: { label?: string }) {
  const { t } = useTranslation();
  return (
    <div className="min-h-screen bg-natural-bg flex flex-col items-center justify-center animate-in fade-in duration-300">
      <RefreshCcw className="h-8 w-8 text-natural-primary animate-spin mb-3" />
      <p className="text-natural-muted text-xs font-mono">{label ?? t('common.loading')}</p>
    </div>
  );
}
