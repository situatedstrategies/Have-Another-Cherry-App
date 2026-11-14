import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { doc, onSnapshot, setDoc, DocumentReference } from 'firebase/firestore';
import { db } from '../firebase';
import { encryptData, decryptData } from '../lib/crypto';
import { Budget, Goal, PlanPayload, PlanScope, monthOf, thresholdsAsBudgets } from '../lib/plan';
import type { CategoryRule } from '../lib/rules';
import { Group } from '../types';
import { todayLocal } from '../lib/recurring';

const EMPTY: PlanPayload = { budgets: [], goals: [], rules: [] };

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

/** A stored payload is whatever a client wrote, so every line is checked
 *  before the arithmetic sees it: a budget without a real 'YYYY-MM' start
 *  month starts counting this month (a blank one used to hang the rollover
 *  loop), and lines without an id or a category are dropped. */
export const parsePayload = (raw: unknown, month: string): PlanPayload | null => {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Partial<PlanPayload>;
  const budgets = (Array.isArray(o.budgets) ? (o.budgets as Budget[]) : [])
    .filter((b) => b && typeof b.id === 'string' && typeof b.category === 'string')
    .map((b) => ({
      ...b,
      limit: Number.isFinite(Number(b.limit)) ? Number(b.limit) : 0,
      startMonth: MONTH.test(String(b.startMonth || '')) ? b.startMonth : month,
    }));
  const goals = (Array.isArray(o.goals) ? (o.goals as Goal[]) : []).filter(
    (g) => g && typeof g.id === 'string'
  );
  const rules = (Array.isArray(o.rules) ? (o.rules as CategoryRule[]) : []).filter(
    (r) => r && typeof r.contains === 'string' && typeof r.category === 'string'
  );
  return { budgets, goals, rules };
};

/** Where one scope's document stands. Only 'ready' may be written over:
 *  'loading' has not heard from the server yet (an empty answer from the
 *  offline cache proves nothing), and 'failed' could not be read or
 *  decrypted, so a save from either would replace a plan nobody has seen. */
type Stored = { status: 'loading' | 'ready' | 'failed'; value: PlanPayload | null; key: string };
const LOADING: Stored = { status: 'loading', value: null, key: '' };

export interface PlanState {
  household: PlanPayload;
  personal: PlanPayload;
  loading: boolean;
  error: boolean;
  /** Whether the stored plan for this scope has been read, so a save is safe. */
  canSave: (scope: PlanScope) => boolean;
  /** Optimistic; resolves to whether the write stuck. [change] is applied to
   *  the latest stored plan at the moment of the write, never to what a
   *  screen captured earlier, and nothing is written until the stored plan
   *  has been read. */
  save: (scope: PlanScope, change: (current: PlanPayload) => PlanPayload) => Promise<boolean>;
}

/**
 * The plan documents: `group_plans/{gid}` for the household (one encrypted
 * payload under the group key, exactly like `group_vault`) and
 * `users/{uid}/private/plan` for the member (uid key). Both are live
 * snapshots. A household with no plan document yet reads its spending
 * thresholds as budget lines (lib/plan.thresholdsAsBudgets); that migration
 * is on read only and is written back the first time someone saves.
 */
export function usePlan(group: Group | null, uid: string | undefined, enabled: boolean): PlanState {
  const groupId = group?.id;
  const [householdState, setHouseholdState] = useState<Stored>(LOADING);
  const [personalState, setPersonalState] = useState<Stored>(LOADING);
  const householdRef = useRef<Stored>(LOADING);
  const personalRef = useRef<Stored>(LOADING);
  const putHousehold = useCallback((next: Stored) => {
    householdRef.current = next;
    setHouseholdState(next);
  }, []);
  const putPersonal = useCallback((next: Stored) => {
    personalRef.current = next;
    setPersonalState(next);
  }, []);

  useEffect(() => {
    // Another group's plan must never be shown, or saved, under this one.
    putHousehold({ ...LOADING, key: groupId || '' });
    if (!enabled || !groupId) return;
    return subscribe(doc(db, 'group_plans', groupId), groupId, putHousehold);
  }, [enabled, groupId, putHousehold]);

  useEffect(() => {
    putPersonal({ ...LOADING, key: uid || '' });
    if (!enabled || !uid) return;
    return subscribe(doc(db, 'users', uid, 'private', 'plan'), uid, putPersonal);
  }, [enabled, uid, putPersonal]);

  const thresholds = group?.spendingThresholds;
  const migrated = useMemo<PlanPayload>(() => {
    const budgets = thresholdsAsBudgets({ spendingThresholds: thresholds }, monthOf(todayLocal()));
    return budgets.length ? { budgets, goals: [], rules: [] } : EMPTY;
  }, [thresholds]);
  const migratedRef = useRef(migrated);
  migratedRef.current = migrated;

  const household = householdState.key === (groupId || '') ? householdState : LOADING;
  const personal = personalState.key === (uid || '') ? personalState : LOADING;

  const canSave = useCallback(
    (scope: PlanScope) => (scope === 'household' ? household : personal).status === 'ready',
    [household, personal]
  );

  const save = useCallback(
    async (scope: PlanScope, change: (current: PlanPayload) => PlanPayload): Promise<boolean> => {
      const key = scope === 'household' ? groupId : uid;
      if (!key || !uid) return false;
      const ref = scope === 'household' ? householdRef : personalRef;
      const put = scope === 'household' ? putHousehold : putPersonal;
      const previous = ref.current;
      if (previous.status !== 'ready' || previous.key !== key) return false;
      const current = previous.value ?? (scope === 'household' ? migratedRef.current : EMPTY);
      const next = change(current);
      put({ status: 'ready', value: next, key });
      try {
        const payload = await encryptData(next, key);
        await setDoc(
          scope === 'household'
            ? doc(db, 'group_plans', key)
            : doc(db, 'users', key, 'private', 'plan'),
          {
            ...(scope === 'household' ? { groupId: key } : { uid: key }),
            payload,
            updatedAt: new Date().toISOString(),
            updatedBy: uid,
          },
          { merge: true }
        );
        return true;
      } catch (e) {
        console.error('Plan save failed', e);
        // A snapshot may have landed while the write was in flight; only
        // roll back when the optimistic value is still the one on screen.
        if (ref.current.value === next) put(previous);
        return false;
      }
    },
    [groupId, uid, putHousehold, putPersonal]
  );

  return {
    household: household.value ?? migrated,
    personal: personal.value ?? EMPTY,
    loading: enabled && (household.status === 'loading' || personal.status === 'loading'),
    error: household.status === 'failed' || personal.status === 'failed',
    canSave,
    save,
  };
}

/** One live plan document. 'ready' needs either a document that decrypted,
 *  or the server's word that there is none. */
function subscribe(ref: DocumentReference, key: string, put: (next: Stored) => void): () => void {
  let live = true;
  const unsub = onSnapshot(
    ref,
    async (snap) => {
      const payload = snap.exists() ? snap.data()?.payload : null;
      if (!payload) {
        // Nothing in the offline cache is not the same as nothing saved.
        if (snap.exists() || !snap.metadata.fromCache) {
          put({ status: 'ready', value: null, key });
        }
        return;
      }
      // decryptData answers null rather than throwing when it cannot read it.
      const parsed = parsePayload(await decryptData(payload, key), monthOf(todayLocal()));
      if (!live) return;
      if (parsed) put({ status: 'ready', value: parsed, key });
      else {
        console.error('Plan could not be decrypted');
        put({ status: 'failed', value: null, key });
      }
    },
    (e) => {
      console.error('Plan subscription failed', e);
      if (live) put({ status: 'failed', value: null, key });
    }
  );
  return () => {
    live = false;
    unsub();
  };
}
