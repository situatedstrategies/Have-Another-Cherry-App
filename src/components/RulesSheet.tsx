import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2, ArrowRight } from 'lucide-react';
import Modal from './Modal';
import CategoryChip from './CategoryChip';
import { CategoryRule, ruleFrom } from '../lib/rules';
import { normalizeTitle } from '../lib/smartDefaults';

interface Props {
  rules: CategoryRule[];
  /** Every category to offer in the add row's list. */
  categories: string[];
  onSave: (rules: CategoryRule[]) => Promise<boolean>;
  onClose: () => void;
}

/**
 * The household's category rules as a list: "when the title contains X, use
 * Y", each with a delete, and an add row. Saves the whole list to the
 * household plan on every change (lib/rules; the payload is encrypted with
 * the group key like the budgets).
 */
export default function RulesSheet({ rules, categories, onSave, onClose }: Props) {
  const { t } = useTranslation();
  const [contains, setContains] = useState('');
  const [category, setCategory] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const field =
    'bg-natural-bg/50 hover:bg-natural-bg focus:bg-white border border-natural-border focus:border-natural-primary rounded-xl text-natural-text text-sm outline-none transition-all px-3 py-2';

  const add = async () => {
    const key = normalizeTitle(contains);
    const cat = category.trim();
    if (!key || !cat) {
      setError(t('rules.err.both'));
      return;
    }
    if (rules.some((r) => normalizeTitle(r.contains) === key)) {
      setError(t('rules.err.duplicate'));
      return;
    }
    setError(null);
    setBusy(true);
    const ok = await onSave([...rules, ruleFrom({ contains: key, category: cat })]);
    setBusy(false);
    if (ok) {
      setContains('');
      setCategory('');
    }
  };

  const remove = async (id: string) => {
    setBusy(true);
    await onSave(rules.filter((r) => r.id !== id));
    setBusy(false);
  };

  const options = [...new Set(categories.map((c) => c.trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b)
  );

  return (
    <Modal onClose={onClose} title={t('rules.title')} bodyClassName="p-4 sm:p-5">
      <p className="text-xs text-natural-muted mb-3">{t('rules.subtitle')}</p>
      {rules.length === 0 ? (
        <p className="text-sm text-natural-muted py-3" id="rules-empty">
          {t('rules.empty')}
        </p>
      ) : (
        <ul
          className="divide-y divide-natural-sidebar border-y border-natural-sidebar"
          id="rules-list"
        >
          {rules.map((r) => (
            <li key={r.id} className="py-2.5 flex items-center gap-3" id={`rule-${r.id}`}>
              <span className="flex-1 min-w-0 flex items-center gap-2 text-sm">
                <span className="font-mono truncate">"{r.contains}"</span>
                <ArrowRight className="h-3.5 w-3.5 text-natural-muted shrink-0" />
                <CategoryChip name={r.category} />
              </span>
              <button
                type="button"
                onClick={() => remove(r.id)}
                disabled={busy}
                aria-label={t('rules.deleteAria', { contains: r.contains })}
                title={t('rules.delete')}
                className="tap-target shrink-0 flex items-center justify-center text-natural-muted hover:text-natural-primary cursor-pointer disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void add();
        }}
        className="mt-4 flex flex-col gap-2"
        id="rules-add"
      >
        <span className="text-xs font-bold text-natural-dark-cherry uppercase tracking-widest">
          {t('rules.addTitle')}
        </span>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={contains}
            onChange={(e) => setContains(e.target.value)}
            placeholder={t('rules.containsPlaceholder')}
            aria-label={t('rules.contains')}
            className={`${field} flex-1 min-w-[10rem]`}
            autoComplete="off"
          />
          <input
            type="text"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder={t('rules.category')}
            aria-label={t('rules.category')}
            list="rule-category-options"
            className={`${field} w-40`}
            autoComplete="off"
          />
          <datalist id="rule-category-options">
            {options.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
          <button
            type="submit"
            disabled={busy}
            className="h-9 px-3 rounded-full border border-natural-border bg-white text-[13px] font-semibold flex items-center gap-1 hover:border-natural-muted cursor-pointer disabled:opacity-50"
            id="rules-add-btn"
          >
            <Plus className="h-3.5 w-3.5" /> {t('rules.add')}
          </button>
        </div>
        {error && <p className="text-xs text-natural-primary">{error}</p>}
      </form>
    </Modal>
  );
}
