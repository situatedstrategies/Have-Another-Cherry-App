import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Bell } from 'lucide-react';

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

function ToastItem({ toast, removeToast }: { toast: ToastMessage, removeToast: (id: string) => void }) {
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
      className="bg-white rounded-xl shadow-lg border border-natural-border p-4 pr-10 relative overflow-hidden"
    >
      <div className="absolute top-0 left-0 bottom-0 w-1 bg-natural-primary" />
      <div className="flex items-start gap-3">
        <div className="bg-natural-sage/30 p-2 rounded-full text-natural-primary mt-0.5">
          <Bell size={16} />
        </div>
        <div>
          <h4 className="text-sm font-bold text-natural-text">{toast.title}</h4>
          <p className="text-xs text-natural-muted mt-1">{toast.message}</p>
        </div>
      </div>
      <button 
        onClick={() => removeToast(toast.id)}
        className="absolute top-3 right-3 text-natural-muted hover:text-natural-text transition-colors"
      >
        <X size={16} />
      </button>
    </motion.div>
  );
}
