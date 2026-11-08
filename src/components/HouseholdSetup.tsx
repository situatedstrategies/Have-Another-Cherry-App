import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { track } from '../lib/analytics';
import { HANDOFFS, KNOWN_REGIONS, handoffsForRegion, normalizeRegion, type HandoffId } from '../lib/handoffs';
import {
  GROUP_KINDS,
  GROUP_PAYING,
  GROUP_RECURRING,
  GROUP_SETTLE,
  GROUP_SPLITS,
  completeSetup,
  draftFrom,
  evenSplit,
  stepsFor,
  type SetupDraft,
  type SetupStep,
} from '../lib/householdSetup';
import { instrumentForHandoff, instrumentLabel } from '../lib/instruments';
import { seedRecurringStubs } from '../lib/householdSeed';
import type { Group, GroupSetup } from '../types';

interface Props {
  group: Pick<Group, 'id' | 'setup' | 'region' | 'targetNumPeople' | 'availableSplits' | 'defaultSplit'>;
  uid: string;
  isPlus: boolean;
  /** The region to start from when the group has none yet. */
  initialRegion: string;
  /** Group creation runs the quiz once; Settings opens it to edit. */
  mode: 'create' | 'edit';
  onDone: (setup: GroupSetup) => void;
  onSkip?: () => void;
}

const card =
  'w-full text-left p-3 rounded-xl border transition-colors text-sm font-semibold';
const on = 'border-natural-primary bg-natural-sage/40 text-natural-text';
const off = 'border-natural-border bg-white text-natural-muted hover:border-natural-muted';

// The household setup quiz, one per group: what kind of group, how it pays,
// how it settles, how things split, which payment apps it uses, what recurs,
// and for partners and families whether they want thresholds, for trips the
// dates and currency. Answers go to groups/{id}.setup and seed the defaults
// the plan names; anything behind Cherry + is stored as intent when the gate
// is closed.
export default function HouseholdSetup({ group, uid, isPlus, initialRegion, mode, onDone, onSkip }: Props) {
  const { t } = useTranslation();
  const [region, setRegion] = useState(normalizeRegion(group.region, initialRegion));
  const [draft, setDraft] = useState<SetupDraft>(() =>
    draftFrom(group.setup, handoffsForRegion(normalizeRegion(group.region, initialRegion)).slice(0, 3))
  );
  const [index, setIndex] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const steps = stepsFor(draft);
  const step: SetupStep = steps[Math.min(index, steps.length - 1)];
  const last = index >= steps.length - 1;
  const set = <K extends keyof SetupDraft>(k: K, v: SetupDraft[K]) =>
    setDraft((d) => ({ ...d, [k]: v }));
  const toggle = (k: 'handoffs' | 'recurring', v: string) =>
    setDraft((d) => {
      const list = d[k] as string[];
      return { ...d, [k]: list.includes(v) ? list.filter((x) => x !== v) : [...list, v] } as SetupDraft;
    });

  const regionHandoffs = handoffsForRegion(region);
  const appName = (id: HandoffId) => instrumentLabel(instrumentForHandoff(id));

  const changeRegion = (r: string) => {
    setRegion(r);
    set('handoffs', handoffsForRegion(r).slice(0, 3));
  };

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const setup = completeSetup(draft, uid);
      const patch: Record<string, GroupSetup | string | Record<string, number> | unknown[]> = {
        setup,
        region,
      };
      // An even answer rewrites the standing split across every seat, joined
      // or pending; the other answers leave the split the form set.
      if (mode === 'create' && draft.split === 'even') {
        const seats = Math.max(group.targetNumPeople || 1, Object.keys(group.defaultSplit || {}).length);
        const shares = evenSplit(seats);
        const joined = Object.keys(group.defaultSplit || {});
        const defaultSplit: Record<string, number> = {};
        joined.forEach((u, i) => {
          defaultSplit[u] = shares[i] ?? 0;
        });
        const pending = (group.availableSplits || []) as { name: string; split: number }[] | number[];
        const availableSplits = pending.map((p, i) =>
          typeof p === 'number' ? shares[joined.length + i] ?? 0 : { ...p, split: shares[joined.length + i] ?? 0 }
        );
        patch.defaultSplit = defaultSplit;
        patch.availableSplits = availableSplits;
      }
      await updateDoc(doc(db, 'groups', group.id), patch);
      await seedRecurringStubs(group.id, setup.recurring, uid, isPlus);
      track({ name: 'household_quiz_completed', group_kind: setup.kind });
      onDone(setup);
    } catch (e) {
      console.error('Household setup save failed', e);
      setError(t('household.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const options = <T extends string>(
    list: readonly T[],
    value: T,
    onPick: (v: T) => void,
    key: string
  ) => (
    <div className="grid gap-2">
      {list.map((v) => (
        <button
          key={v}
          type="button"
          onClick={() => onPick(v)}
          className={`${card} ${value === v ? on : off}`}
        >
          {t(`household.${key}.${v}` as never)}
        </button>
      ))}
    </div>
  );

  const body = () => {
    switch (step) {
      case 'kind':
        return options(GROUP_KINDS, draft.kind, (v) => set('kind', v), 'kind');
      case 'paying':
        return options(GROUP_PAYING, draft.paying, (v) => set('paying', v), 'paying');
      case 'settle':
        return options(GROUP_SETTLE, draft.settle, (v) => set('settle', v), 'settle');
      case 'split':
        return (
          <div className="space-y-3">
            {options(GROUP_SPLITS, draft.split, (v) => set('split', v), 'split')}
            {draft.split === 'income' && (
              <p className="text-xs text-natural-muted">{t('household.incomeLater')}</p>
            )}
          </div>
        );
      case 'handoffs':
        return (
          <div className="space-y-3">
            <div>
              <label className="block text-[11px] font-semibold text-natural-muted mb-1">
                {t('household.region')}
              </label>
              <select
                value={KNOWN_REGIONS.includes(region as (typeof KNOWN_REGIONS)[number]) ? region : 'other'}
                onChange={(e) => changeRegion(e.target.value === 'other' ? 'XX' : e.target.value)}
                className="w-full px-3 py-2 bg-white border border-natural-border rounded-lg text-sm outline-none focus:border-natural-primary"
              >
                {KNOWN_REGIONS.map((r) => (
                  <option key={r} value={r}>
                    {t(`household.regionName.${r}`)}
                  </option>
                ))}
                <option value="other">{t('household.regionName.other')}</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {regionHandoffs.map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => toggle('handoffs', id)}
                  className={`${card} ${draft.handoffs.includes(id) ? on : off}`}
                >
                  {appName(id)}
                  {HANDOFFS[id].bankPicker && (
                    <span className="block text-[10px] font-normal text-natural-muted">
                      {t('household.viaBankApp')}
                    </span>
                  )}
                </button>
              ))}
            </div>
            <p className="text-xs text-natural-muted">{t('household.handlesLater')}</p>
          </div>
        );
      case 'recurring':
        return (
          <div className="grid grid-cols-2 gap-2">
            {GROUP_RECURRING.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => toggle('recurring', r)}
                className={`${card} ${draft.recurring.includes(r) ? on : off}`}
              >
                {t(`household.recurring.${r}`)}
              </button>
            ))}
            <button
              type="button"
              onClick={() => set('recurring', [])}
              className={`${card} ${draft.recurring.length === 0 ? on : off}`}
            >
              {t('household.recurring.none')}
            </button>
          </div>
        );
      case 'thresholds':
        return (
          <div className="space-y-3">
            <div className="grid gap-2">
              <button type="button" onClick={() => set('thresholdsWanted', true)} className={`${card} ${draft.thresholdsWanted ? on : off}`}>
                {t('household.thresholds.yes')}
              </button>
              <button type="button" onClick={() => set('thresholdsWanted', false)} className={`${card} ${!draft.thresholdsWanted ? on : off}`}>
                {t('household.thresholds.no')}
              </button>
            </div>
            {!isPlus && draft.thresholdsWanted && (
              <p className="text-xs text-natural-muted">{t('household.thresholdsPlus')}</p>
            )}
          </div>
        );
      case 'trip':
        return (
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs text-natural-muted">
              {t('household.trip.start')}
              <input
                type="date"
                value={draft.trip?.start || ''}
                onChange={(e) => set('trip', { start: e.target.value, end: draft.trip?.end || '', currency: draft.trip?.currency || 'USD' })}
                className="mt-1 w-full px-3 py-2 bg-white border border-natural-border rounded-lg text-sm outline-none focus:border-natural-primary"
              />
            </label>
            <label className="text-xs text-natural-muted">
              {t('household.trip.end')}
              <input
                type="date"
                value={draft.trip?.end || ''}
                onChange={(e) => set('trip', { start: draft.trip?.start || '', end: e.target.value, currency: draft.trip?.currency || 'USD' })}
                className="mt-1 w-full px-3 py-2 bg-white border border-natural-border rounded-lg text-sm outline-none focus:border-natural-primary"
              />
            </label>
            <label className="text-xs text-natural-muted col-span-2">
              {t('household.trip.currency')}
              <input
                type="text"
                maxLength={3}
                value={draft.trip?.currency || ''}
                onChange={(e) => set('trip', { start: draft.trip?.start || '', end: draft.trip?.end || '', currency: e.target.value.toUpperCase() })}
                placeholder="USD"
                className="mt-1 w-full px-3 py-2 bg-white border border-natural-border rounded-lg text-sm font-mono outline-none focus:border-natural-primary"
              />
            </label>
          </div>
        );
      case 'note':
        return (
          <textarea
            value={draft.note}
            onChange={(e) => set('note', e.target.value.slice(0, 500))}
            rows={4}
            placeholder={t('household.notePlaceholder')}
            className="w-full px-3 py-2 bg-white border border-natural-border rounded-lg text-sm outline-none focus:border-natural-primary"
          />
        );
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-natural-border w-full max-w-md p-8">
      <div className="mb-5">
        <h1 className="text-2xl font-display font-semibold text-natural-text mb-1">
          {mode === 'create' ? t('household.title') : t('household.editTitle')}
        </h1>
        <p className="text-sm text-natural-muted">{t('household.subtitle')}</p>
        <div className="flex gap-1.5 mt-4">
          {steps.map((s, i) => (
            <div key={s} className={`h-1.5 flex-1 rounded-full ${i <= index ? 'bg-natural-primary' : 'bg-natural-border'}`} />
          ))}
        </div>
        <p className="text-[11px] font-bold text-natural-muted uppercase tracking-wider mt-3">
          {t('household.stepOf', { step: index + 1, total: steps.length })}
        </p>
      </div>

      <h2 className="text-sm font-semibold text-natural-text mb-3">{t(`household.q.${step}`)}</h2>
      <div className="animate-in fade-in slide-in-from-right-4 duration-300">{body()}</div>

      {error && <p className="mt-3 text-sm text-natural-primary font-medium">{error}</p>}

      <div className="flex gap-3 pt-5">
        {index > 0 ? (
          <button type="button" onClick={() => setIndex((i) => i - 1)} className="w-1/3 bg-natural-border text-natural-text font-medium py-3 px-4 rounded-md hover:bg-natural-border/80">
            {t('common.back')}
          </button>
        ) : onSkip ? (
          <button type="button" onClick={onSkip} className="w-1/3 text-natural-muted font-medium py-3 px-4 rounded-md hover:text-natural-text">
            {t('household.skip')}
          </button>
        ) : null}
        <button
          type="button"
          disabled={saving}
          onClick={() => (last ? void save() : setIndex((i) => i + 1))}
          className="flex-1 bg-natural-primary text-white font-medium py-3 px-4 rounded-md hover:bg-natural-primary-ink disabled:opacity-50"
        >
          {last ? (saving ? t('common.saving') : t('household.finish')) : t('common.next')}
        </button>
      </div>
    </div>
  );
}
