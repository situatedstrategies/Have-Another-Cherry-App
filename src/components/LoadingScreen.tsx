import { RefreshCcw } from 'lucide-react';

// Same background as every other screen, so switching never flashes white.
export default function LoadingScreen({ label = 'Loading...' }: { label?: string }) {
  return (
    <div className="min-h-screen bg-natural-bg flex flex-col items-center justify-center animate-in fade-in duration-300">
      <RefreshCcw className="h-8 w-8 text-natural-primary animate-spin mb-3" />
      <p className="text-natural-muted text-xs font-mono">{label}</p>
    </div>
  );
}
