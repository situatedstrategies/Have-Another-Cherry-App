import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Plus, Trash2 } from 'lucide-react';
import Modal from './Modal';
import { Goal, PlanScope } from '../lib/plan';
import { formatCurrency } from '../lib/format';

interface Props {
  /** null: a new goal. */
  goal: Goal | null;
  scope: PlanScope;
  funded: number;
  locale: string;
  onSave: (goal: Goal) => Promise<void>;
  onDelete: (goal: Goal) => Promise<void>;
  onContribute: (goal: Goal) => void;
  onClose: () => void;
}

const newId = () => `g_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

/**
 * The goal sheet: name, target and due date, then Contribute (opens the Log
 * form in goal mode), Mark done and Delete for an existing goal.
 */
export default function GoalSheet({
  goal,
  scope,
  funded,
  onSave,
  onDelete,
  onContribute,
  onClose,
}: Props) {
  const { t } = useTranslation();
  const [name, setName] = useState(goal?.name || '');
  const [target, setTarget] = useState(goal && goal.target > 0 ? String(goal.target) : '');
  const [dueDate, setDueDate] = useState(goal?.dueDate || '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const build = (): Goal | null => {
    const n = name.trim();
    const tgt = Math.round((parseFloat(target) || 0) * 100) / 100;
    if (!n) {
      setError(t('planTab.err.name'));
      return null;
    }
    if (tgt <= 0) {
      setError(t('planTab.err.target'));
      return null;
    }
    return {
      id: goal?.id || newId(),
      name: n,
      target: tgt,
      ...(dueDate ? { dueDate } : {}),
      scope,
      createdAt: goal?.createdAt || new Date().toISOString(),
      ...(goal?.doneAt ? { doneAt: goal.doneAt } : {}),
    };
  };

  const run = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  const handleSave = () =>
    run(async () => {
      const g = build();
      if (g) await onSave(g);
    });

  const handleDone = () =>
    run(async () => {
      const g = build();
      if (!g) return;
      await onSave(
        g.doneAt ? { ...g, doneAt: undefined } : { ...g, doneAt: new Date().toISOString() }
      );
    });

  const handleDelete = () =>
    run(async () => {
      if (!goal) return;
      if (!window.confirm(t('planTab.deleteConfirm', { name: goal.name }))) return;
      await onDelete(goal);
    });

  const field =
    'w-full px-3.5 py-2.5 bg-natural-bg/50 hover:bg-natural-bg focus:bg-white border border-natural-border focus:border-natural-primary rounded-xl text-natural-text text-sm outline-none transition-all';
  const fieldLabel = 'block text-xs font-bold text-natural-text uppercase tracking-wider mb-2';

  return (
    <Modal
      onClose={onClose}
      title={goal ? goal.name : t('planTab.newGoal')}
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2">
          {goal ? (
            <button
              type="button"
              onClick={handleDelete}
              disabled={busy}
              className="text-xs font-semibold text-natural-muted hover:text-natural-primary inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
              id="goal-delete"
            >
              <Trash2 className="h-3.5 w-3.5" /> {t('common.delete')}
            </button>
          ) : (
            <span />
          )}
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
              disabled={busy}
              className="px-6 py-2.5 text-xs font-semibold text-white bg-natural-primary hover:bg-natural-primary-ink rounded-full shadow-md transition-all cursor-pointer disabled:opacity-50"
              id="goal-save"
            >
              {busy ? t('common.saving') : goal ? t('common.save') : t('planTab.createGoal')}
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-5">
        {error && (
          <div className="p-3 bg-natural-sidebar border border-natural-border/20 rounded-xl text-natural-text text-sm font-semibold">
            {error}
          </div>
        )}
        {goal && (
          <div className="flex items-baseline justify-between gap-3">
            <span className="font-mono text-[28px] leading-8 font-medium tracking-tight">
              {formatCurrency(funded, 0)}
            </span>
            <span className="text-[13px] text-natural-muted">
              {t('planTab.fundedOf', { target: formatCurrency(goal.target, 0) })}
            </span>
          </div>
        )}
        <div>
          <label className={fieldLabel} htmlFor="goal-name">
            {t('planTab.goalName')}
          </label>
          <input
            id="goal-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('planTab.goalNamePlaceholder')}
            className={field}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={fieldLabel} htmlFor="goal-target">
              {t('planTab.target')}
            </label>
            <input
              id="goal-target"
              type="number"
              inputMode="decimal"
              min="0"
              step="1"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              placeholder="0"
              className={`${field} font-mono`}
            />
          </div>
          <div>
            <label className={fieldLabel} htmlFor="goal-due">
              {t('planTab.dueDate')}
            </label>
            <input
              id="goal-due"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className={field}
            />
          </div>
        </div>
        {goal && (
          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="button"
              onClick={() => onContribute(goal)}
              className="h-10 px-4 rounded-full bg-natural-dark hover:bg-black text-white text-sm font-semibold inline-flex items-center gap-1.5 cursor-pointer transition-colors"
              id="goal-contribute"
            >
              <Plus className="h-4 w-4" /> {t('planTab.contribute')}
            </button>
            <button
              type="button"
              onClick={handleDone}
              disabled={busy}
              className="h-10 px-4 rounded-full border border-natural-border bg-white text-sm font-semibold inline-flex items-center gap-1.5 hover:border-natural-muted cursor-pointer disabled:opacity-50"
              id="goal-done"
            >
              <Check className="h-4 w-4" />{' '}
              {goal.doneAt ? t('planTab.reopen') : t('planTab.markDone')}
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}
