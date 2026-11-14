import { useTranslation } from 'react-i18next';
import { categoryColor, tintOf } from '../lib/ui';
import { DEPOSIT_CATEGORY, GOAL_CATEGORY } from '../lib/money';

/**
 * The category bubble on every ledger row: the name in its category colour on
 * a 10% tint of the same colour. The colour comes from lib/ui.categoryColor,
 * which hashes the name the same way the Flutter app does, so both clients
 * paint "Groceries" the same green.
 */
export default function CategoryChip({
  name,
  className = '',
}: {
  name: string;
  className?: string;
}) {
  const { t } = useTranslation();
  const color = categoryColor(name);
  // Deposits and goal contributions are stored under fixed words (and, before
  // that, under the translated deposit label); the chip shows the reader's own.
  const stored = name.trim();
  const text =
    stored === DEPOSIT_CATEGORY || stored === 'Cuenta de la casa' || stored === 'Общий счёт'
      ? t('house.depositCategory')
      : stored === GOAL_CATEGORY
        ? t('category.goal')
        : stored || t('category.none');
  return (
    <span
      className={`inline-block text-[11px] leading-4 font-semibold px-2 py-0.5 rounded-full whitespace-nowrap max-w-[12rem] truncate align-middle ${className}`}
      style={{ color, background: tintOf(color) }}
      title={text}
    >
      {text}
    </span>
  );
}
