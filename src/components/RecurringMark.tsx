import { useTranslation } from 'react-i18next';
import { intervalLabel } from '../lib/recurring';
import { colors } from '../lib/ui';

/**
 * The recurring mark: a red disc inside a circular arrow, 16px, next to the
 * name of any expense that repeats. Replaces the word "monthly" on rows and
 * lists; the expense detail keeps the word in its meta line. The interval is
 * in the accessible label. Same glyph as CherryRecurringMark in the Flutter app.
 */
export default function RecurringMark({
  interval,
  className = '',
}: {
  /** The recurring interval string, for the label; optional. */
  interval?: string;
  className?: string;
}) {
  const { t } = useTranslation();
  const label = interval
    ? t('list.recurringLabel', { label: intervalLabel(interval) })
    : t('list.repeats');
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      role="img"
      aria-label={label}
      className={`inline-block shrink-0 align-[-3px] ${className}`}
    >
      <title>{label}</title>
      <path
        d="M21 12a9 9 0 1 1-9-9c2.5 0 4.9 1 6.7 2.7L21 8"
        fill="none"
        stroke={colors.muted}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M21 3v5h-5"
        fill="none"
        stroke={colors.muted}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="4" fill={colors.primary} />
    </svg>
  );
}
