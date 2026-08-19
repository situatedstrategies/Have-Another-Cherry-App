import React from 'react';
import { X } from 'lucide-react';

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
export default function Modal({ onClose, title, icon, size = 'md', footer, children, bodyClassName }: ModalProps) {
  const maxW = size === 'lg' ? 'sm:max-w-lg' : 'sm:max-w-md';
  return (
    <div className="fixed inset-0 z-50 bg-natural-dark/50 backdrop-blur-sm flex items-stretch sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200">
      <div className={`bg-white w-full h-full sm:h-auto sm:max-h-[90vh] ${maxW} rounded-none sm:rounded-3xl sm:border border-natural-border shadow-xl flex flex-col overflow-hidden sm:animate-in sm:zoom-in-95 sm:duration-200`}>
        {title !== undefined && (
          <div className="flex items-center justify-between px-6 py-4 border-b border-natural-border shrink-0">
            <h2 className="text-lg font-display font-semibold text-natural-text flex items-center gap-2 min-w-0">
              {icon}
              <span className="truncate">{title}</span>
            </h2>
            <button
              onClick={onClose}
              className="shrink-0 text-natural-muted hover:text-natural-text bg-white p-1.5 rounded-full border border-natural-border shadow-sm"
              aria-label="Close"
            >
              <X size={16} />
            </button>
          </div>
        )}
        <div className={`overflow-y-auto flex-1 ${bodyClassName ?? 'p-6'}`}>{children}</div>
        {footer && <div className="p-4 border-t border-natural-border bg-natural-bg/30 shrink-0">{footer}</div>}
      </div>
    </div>
  );
}
