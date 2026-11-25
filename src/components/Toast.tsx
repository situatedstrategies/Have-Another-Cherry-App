import { useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Bell, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export type ToastMessage = {
  id: string;
  title: string;
  message: string;
  type?: 'info' | 'success' | 'error';
};

interface ToastContainerProps {
  toasts: ToastMessage[];
  removeToast: (id: string) => void;
}

export function ToastContainer({ toasts, removeToast }: ToastContainerProps) {
  return (
    /* w-full with only a right anchor made the stack 384px wide starting 16px
       from the right edge, so on any phone narrower than 400px it ran off the
       left of the screen. Anchoring both sides on phones and releasing the left
       anchor from sm up keeps the desktop position identical. */
    <div className="fixed top-4 left-4 right-4 sm:left-auto z-50 flex flex-col gap-2 w-auto sm:w-full sm:max-w-sm">
      <AnimatePresence>
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} removeToast={removeToast} />
        ))}
      </AnimatePresence>
    </div>
  );
}

function ToastItem({
  toast,
  removeToast,
}: {
  toast: ToastMessage;
  removeToast: (id: string) => void;
}) {
  const { t } = useTranslation();
  useEffect(() => {
    const timer = setTimeout(() => {
      removeToast(toast.id);
    }, 5000);
    return () => clearTimeout(timer);
  }, [toast.id, removeToast]);

  return (
    <motion.div
      initial={{ opacity: 0, y: -20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.2 } }}
      className="bg-white rounded-2xl shadow-lg border border-natural-border p-4 pr-12 relative overflow-hidden"
    >
      {/* The kind of news shows in the glyph: a check for success, an alert
          for an error, the bell for everything else. */}
      <div className="flex items-start gap-3">
        <div
          className={`p-2 rounded-full mt-0.5 shrink-0 ${
            toast.type === 'error'
              ? 'bg-natural-primary-wash text-natural-primary'
              : toast.type === 'success'
                ? 'bg-natural-teal/10 text-natural-teal'
                : 'bg-natural-pebble text-natural-primary'
          }`}
        >
          {toast.type === 'error' ? (
            <AlertCircle size={16} />
          ) : toast.type === 'success' ? (
            <CheckCircle2 size={16} />
          ) : (
            <Bell size={16} />
          )}
        </div>
        <div>
          <h4 className="text-sm font-semibold text-natural-text leading-snug">{toast.title}</h4>
          <p className="text-xs text-natural-muted mt-1 leading-relaxed">{toast.message}</p>
        </div>
      </div>
      <button
        onClick={() => removeToast(toast.id)}
        aria-label={t('common.dismissNotification')}
        className="absolute top-1 right-1 tap-target flex items-center justify-center rounded-full text-natural-muted hover:text-natural-text transition-colors cursor-pointer"
      >
        <X size={16} />
      </button>
    </motion.div>
  );
}
