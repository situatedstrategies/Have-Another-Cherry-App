import React, { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface ModalProps {
  onClose: () => void;
  title?: React.ReactNode;
  icon?: React.ReactNode;
  size?: 'md' | 'lg';
  footer?: React.ReactNode;
  children: React.ReactNode;
  /** Set to '' to control body padding yourself; defaults to p-6. */
  bodyClassName?: string;
}

/**
 * Shared modal shell: full-screen sheet on phones, centered card on larger
 * screens. Handles the overlay, header/close, scrollable body, and footer so
 * individual modals don't repeat the boilerplate (or the responsive rules).
 */
export default function Modal({
  onClose,
  title,
  icon,
  size = 'md',
  footer,
  children,
  bodyClassName,
}: ModalProps) {
  const { t } = useTranslation();
  const maxW = size === 'lg' ? 'sm:max-w-lg' : 'sm:max-w-md';
  const titleId = useId();
  const sheetRef = useRef<HTMLDivElement>(null);

  // Focus moves into the sheet when it opens, Tab stays inside it, and focus
  // goes back to whatever opened it when it closes.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const sheet = sheetRef.current;
    const focusable = () =>
      Array.from(
        sheet?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        ) || []
      ).filter((el) => el.offsetParent !== null);
    if (sheet && !sheet.contains(document.activeElement)) {
      const field = sheet.querySelector<HTMLElement>(
        'input:not([disabled]), select:not([disabled]), textarea:not([disabled])'
      );
      (field || sheet).focus();
    }
    const onTab = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const els = focusable();
      if (!els.length) {
        e.preventDefault();
        return;
      }
      const first = els[0];
      const last = els[els.length - 1];
      const active = document.activeElement;
      if (!sheet?.contains(active)) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onTab);
    return () => {
      document.removeEventListener('keydown', onTab);
      if (opener && document.contains(opener)) opener.focus();
    };
  }, []);

  // Escape to close, and freeze the page underneath while open. Without the
  // lock, scrolling past the end of a full-screen sheet on a phone scrolls the
  // dashboard behind it, so closing the sheet drops you somewhere you never
  // navigated to. Both effects are undone on unmount.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 bg-natural-dark/50 backdrop-blur-sm flex items-stretch sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby={title !== undefined ? titleId : undefined}
    >
      <div
        ref={sheetRef}
        tabIndex={-1}
        className={`outline-none sheet-safe bg-white w-full h-full sm:h-auto sm:max-h-[90vh] ${maxW} rounded-none sm:rounded-3xl sm:border border-natural-border shadow-xl flex flex-col overflow-hidden sm:animate-in sm:zoom-in-95 sm:duration-200`}
      >
        {title !== undefined && (
          <div className="flex items-center justify-between gap-2 px-4 sm:px-6 py-3 sm:py-4 border-b border-natural-border shrink-0">
            <h2
              id={titleId}
              className="text-lg font-display font-semibold text-natural-text flex items-center gap-2 min-w-0"
            >
              {icon}
              <span className="truncate">{title}</span>
            </h2>
            <button
              onClick={onClose}
              className="tap-target shrink-0 flex items-center justify-center text-natural-muted hover:text-natural-text bg-white rounded-full border border-natural-border shadow-sm"
              aria-label={t('common.close')}
            >
              <X size={18} />
            </button>
          </div>
        )}
        <div
          className={`overflow-y-auto overscroll-contain flex-1 ${bodyClassName ?? 'p-4 sm:p-6'}`}
        >
          {children}
        </div>
        {footer && (
          <div className="p-4 border-t border-natural-border bg-natural-bg/30 shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
