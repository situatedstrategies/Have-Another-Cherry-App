import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
import Modal from './Modal';
import CategoryChip from './CategoryChip';
import { Budget, BudgetGroup, PlanScope, BUDGET_GROUPS } from '../lib/plan';

interface Row {
  category: string;
  limit: string;
  group: BudgetGroup;
  rollover: boolean;
  alerts: boolean;
}

interface Props {
  scope: PlanScope;
  /** 'YYYY-MM': the startMonth of any budget created here. */
  month: string;
  budgets: Budget[];
  /** Every category the row list should offer; duplicates and blanks are dropped. */
  categories: string[];
  onSave: (budgets: Budget[]) => Promise<boolean>;
  onClose: () => void;
}

const newId = () => `b_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

/** A small switch: ink when on, like the segmented control's selection. */
function Switch({
  on,
  onChange,
  label,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      title={label}
      onClick={() => onChange(!on)}
      className={`relative inline-flex h-6 w-10 shrink-0 items-center rounded-full transition-colors cursor-pointer ${
        on ? 'bg-natural-dark' : 'bg-natural-border'
      }`}
    >
      <span
        className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${
          on ? 'translate-x-[18px]' : 'translate-x-0.5'
        }`}
      />
    </button>
  );
}

/**
 * Edit budgets: one row per category with a monthly limit, the group it
 * belongs to, and the rollover and alerts switches. A blank or zero limit
 * means no budget for that category. Saves the whole list for the scope.
 */
export default function BudgetEditor({
  scope,
  month,
  budgets,
  categories,
  onSave,
  onClose,
}: Props) {
  const { t } = useTranslation();
  const initialRows = useMemo<Row[]>(() => {
    const seen = new Set<string>();
    const rows: Row[] = [];
    for (const b of budgets) {
      const c = b.category.trim();
      if (!c || seen.has(c)) continue;
      seen.add(c);
      rows.push({
        category: c,
        limit: b.limit > 0 ? String(b.limit) : '',
        group: b.group,
        rollover: b.rollover,
        alerts: b.alerts,
      });
    }
    for (const raw of categories) {
      const c = raw.trim();
      if (!c || seen.has(c)) continue;
      seen.add(c);
      rows.push({ category: c, limit: '', group: 'flexible', rollover: false, alerts: true });
    }
    return rows;
  }, [budgets, categories]);
  const [rows, setRows] = useState<Row[]>(initialRows);
  const [extra, setExtra] = useState('');
  const [saving, setSaving] = useState(false);

  const update = (i: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const addExtra = () => {
    const c = extra.trim();
    if (!c || rows.some((r) => r.category === c)) {
      setExtra('');
      return;
    }
    setRows((rs) => [
      ...rs,
      { category: c, limit: '', group: 'flexible', rollover: false, alerts: true },
    ]);
    setExtra('');
  };

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    const byCategory = new Map(budgets.map((b) => [b.category.trim(), b]));
    const next: Budget[] = [];
    for (const r of rows) {
      const limit = Math.round((parseFloat(r.limit) || 0) * 100) / 100;
      if (limit <= 0) continue;
      const existing = byCategory.get(r.category);
      next.push({
        id: existing?.id || newId(),
        category: r.category,
        limit,
        group: r.group,
        rollover: r.rollover,
        alerts: r.alerts,
        // The rollover counts from the month the budget was first set; a
        // category whose budget is new, or whose rollover was just switched
        // on, starts counting now.
        startMonth: existing && (existing.rollover || !r.rollover) ? existing.startMonth : month,
        scope,
      });
    }
    // The parent closes the sheet when the save sticks; when it does not, the
    // sheet stays open with every edit intact and the parent says why.
    await onSave(next);
    setSaving(false);
  };

  const field =
    'bg-natural-bg/50 hover:bg-natural-bg focus:bg-white border border-natural-border focus:border-natural-primary rounded-xl text-natural-text text-sm outline-none transition-all';

  return (
    <Modal
      onClose={onClose}
      size="lg"
      title={t('planTab.editBudgets')}
      bodyClassName="p-4 sm:p-5"
      footer={
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-natural-muted">
            {t(scope === 'household' ? 'planTab.savesToHousehold' : 'planTab.savesToPersonal')}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-natural-muted hover:text-natural-text bg-natural-sidebar hover:bg-natural-sidebar/80 rounded-xl transition-all cursor-pointer"
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="px-6 py-2.5 text-xs font-semibold text-white bg-natural-primary hover:bg-natural-primary-ink rounded-full shadow-md transition-all cursor-pointer disabled:opacity-50"
              id="budget-editor-save"
            >
              {saving ? t('common.saving') : t('common.save')}
            </button>
          </div>
        </div>
      }
    >
      <p className="text-xs text-natural-muted mb-3">{t('planTab.editorHint')}</p>
      <div className="divide-y divide-natural-sidebar border-y border-natural-sidebar">
        {rows.map((r, i) => (
          <div key={r.category} className="py-3 flex flex-col gap-2" id={`budget-row-${i}`}>
            <div className="flex items-center justify-between gap-3">
              <CategoryChip name={r.category} />
              <label className="flex items-center gap-1.5 text-sm">
                <span className="text-natural-muted">$</span>
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="1"
                  value={r.limit}
                  onChange={(e) => update(i, { limit: e.target.value })}
                  placeholder={t('planTab.noLimit')}
                  aria-label={t('planTab.limitAria', { category: r.category })}
                  className={`${field} w-28 px-3 py-2 font-mono text-right`}
                />
              </label>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-xs">
              <div
                className="inline-flex bg-natural-sidebar rounded-full p-[2px]"
                role="radiogroup"
              >
                {BUDGET_GROUPS.map((g) => (
                  <button
                    key={g}
                    type="button"
                    role="radio"
                    aria-checked={r.group === g}
                    onClick={() => update(i, { group: g })}
                    className={`h-7 px-2.5 rounded-full font-semibold transition-colors cursor-pointer ${
                      r.group === g
                        ? 'bg-white text-natural-text border border-natural-border shadow-sm'
                        : 'text-natural-muted hover:text-natural-text'
                    }`}
                  >
                    {t(`planTab.group.${g}`)}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-4">
                <span className="flex items-center gap-1.5 text-natural-muted">
                  {t('planTab.rollover')}
                  <Switch
                    on={r.rollover}
                    onChange={(v) => update(i, { rollover: v })}
                    label={t('planTab.rolloverAria', { category: r.category })}
                  />
                </span>
                <span className="flex items-center gap-1.5 text-natural-muted">
                  {t('planTab.alerts')}
                  <Switch
                    on={r.alerts}
                    onChange={(v) => update(i, { alerts: v })}
                    label={t('planTab.alertsAria', { category: r.category })}
                  />
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          addExtra();
        }}
        className="mt-3 flex items-center gap-2"
      >
        <input
          type="text"
          value={extra}
          onChange={(e) => setExtra(e.target.value)}
          placeholder={t('planTab.anotherCategory')}
          aria-label={t('planTab.anotherCategory')}
          className={`${field} flex-1 px-3 py-2`}
        />
        <button
          type="submit"
          className="h-9 px-3 rounded-full border border-natural-border bg-white text-[13px] font-semibold flex items-center gap-1 hover:border-natural-muted cursor-pointer"
        >
          <Plus className="h-3.5 w-3.5" /> {t('planTab.add')}
        </button>
      </form>
    </Modal>
  );
}
