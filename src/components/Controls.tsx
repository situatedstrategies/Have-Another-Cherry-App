// The small controls every new view shares: a capsule chip, a two or three
// way segmented switch, and the section panel idiom. One spelling here so the
// ledger, reports and house account look like one app. Selection is always
// ink (natural-dark), never red: red is for the one action on a page.
import type { ReactNode } from 'react';

export const panel = 'bg-white border border-natural-border rounded-3xl shadow-sm';
export const label = 'text-xs font-bold text-natural-dark-cherry uppercase tracking-widest';

/** A capsule chip: ink when selected, white with a border when not. 44px tall
 *  on touch, 34px with a pointer, like the mockups. */
export function Chip({
  selected,
  onClick,
  children,
  small,
  title,
}: {
  selected?: boolean;
  onClick: () => void;
  children: ReactNode;
  /** 30px tall, for a row of filters inside a card. */
  small?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={selected}
      className={`${small ? 'h-[30px] px-3 text-xs' : 'h-[34px] px-3.5 text-[13px]'} rounded-full font-semibold whitespace-nowrap transition-colors cursor-pointer chip ${
        selected
          ? 'bg-natural-dark text-white border border-natural-dark'
          : 'bg-white text-natural-muted border border-natural-border hover:text-natural-text hover:border-natural-muted'
      }`}
    >
      {children}
    </button>
  );
}

/** A segmented switch on a grey track: the chosen option is a white pill. */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  ariaLabel: string;
}) {
  return (
    <div
      className="inline-flex bg-natural-sidebar rounded-full p-[3px]"
      role="tablist"
      aria-label={ariaLabel}
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={`h-8 px-3.5 rounded-full text-[13px] font-semibold transition-colors cursor-pointer ${
            value === o.value
              ? 'bg-white text-natural-text border border-natural-border shadow-sm'
              : 'text-natural-muted hover:text-natural-text'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** A white capsule button for a secondary action (Export, Scan a receipt). */
export function GhostButton({
  onClick,
  children,
  title,
  id,
}: {
  onClick: () => void;
  children: ReactNode;
  title?: string;
  id?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      id={id}
      className="h-[38px] px-3.5 rounded-full border border-natural-border bg-white text-natural-text text-[13px] font-semibold flex items-center gap-2 hover:border-natural-muted transition-colors cursor-pointer whitespace-nowrap"
    >
      {children}
    </button>
  );
}

/** The one red button on a page. */
export function PrimaryButton({
  onClick,
  children,
  id,
  className = '',
}: {
  onClick: () => void;
  children: ReactNode;
  id?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      id={id}
      className={`h-11 px-[18px] rounded-full bg-natural-primary hover:bg-natural-primary-ink text-white text-sm font-semibold flex items-center justify-center gap-2 shadow-md hover:shadow-lg transition-all cursor-pointer whitespace-nowrap ${className}`}
    >
      {children}
    </button>
  );
}

/** A status pill: red wash for open, grey for settled. */
export function StatusPill({ open, children }: { open: boolean; children: ReactNode }) {
  return (
    <span
      className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${
        open
          ? 'text-natural-primary bg-natural-primary-wash'
          : 'text-natural-muted bg-natural-sidebar'
      }`}
    >
      {children}
    </span>
  );
}

/** The page title row: a serif title, a one line subtitle, and the actions. */
export function PageHeader({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-col gap-0.5 min-w-0">
        <h1 className="font-display text-[28px] leading-[34px] font-semibold text-natural-text tracking-tight">
          {title}
        </h1>
        {subtitle && <p className="text-sm text-natural-muted">{subtitle}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}
