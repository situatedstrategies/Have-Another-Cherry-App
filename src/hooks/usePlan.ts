import { useCallback, useEffect, useMemo, useState } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { encryptData, decryptData } from '../lib/crypto';
import { Budget, Goal, PlanPayload, PlanScope, monthOf, thresholdsAsBudgets } from '../lib/plan';
import { Group } from '../types';
import { todayLocal } from '../lib/recurring';

const EMPTY: PlanPayload = { budgets: [], goals: [] };

const parsePayload = (raw: unknown): PlanPayload | null => {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Partial<PlanPayload>;
  return {
    budgets: Array.isArray(o.budgets) ? (o.budgets as Budget[]) : [],
    goals: Array.isArray(o.goals) ? (o.goals as Goal[]) : [],
  };
};

export interface PlanState {
  household: PlanPayload;
  personal: PlanPayload;
  loading: boolean;
  error: boolean;
  /** Optimistic; resolves to whether the write stuck. */
  save: (scope: PlanScope, next: PlanPayload) => Promise<boolean>;
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
  const [household, setHousehold] = useState<PlanPayload | null>(null);
  const [personal, setPersonal] = useState<PlanPayload | null>(null);
  const [loaded, setLoaded] = useState({ household: false, personal: false });
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!enabled || !groupId) return;
    const unsub = onSnapshot(
      doc(db, 'group_plans', groupId),
      async (snap) => {
        try {
          const payload = snap.exists() ? snap.data()?.payload : null;
          const parsed = payload ? parsePayload(await decryptData(payload, groupId)) : null;
          setHousehold(parsed);
        } catch (e) {
          console.error('Plan load failed', e);
          setError(true);
        } finally {
          setLoaded((l) => ({ ...l, household: true }));
        }
      },
      (e) => {
        console.error('Plan subscription failed', e);
        setError(true);
        setLoaded((l) => ({ ...l, household: true }));
      }
    );
    return unsub;
  }, [enabled, groupId]);

  useEffect(() => {
    if (!enabled || !uid) return;
    const unsub = onSnapshot(
      doc(db, 'users', uid, 'private', 'plan'),
      async (snap) => {
        try {
          const payload = snap.exists() ? snap.data()?.payload : null;
          const parsed = payload ? parsePayload(await decryptData(payload, uid)) : null;
          setPersonal(parsed);
        } catch (e) {
          console.error('Personal plan load failed', e);
          setError(true);
        } finally {
          setLoaded((l) => ({ ...l, personal: true }));
        }
      },
      (e) => {
        console.error('Personal plan subscription failed', e);
        setError(true);
        setLoaded((l) => ({ ...l, personal: true }));
      }
    );
    return unsub;
  }, [enabled, uid]);

  const thresholds = group?.spendingThresholds;
  const householdView = useMemo<PlanPayload>(() => {
    if (household) return household;
    const migrated = thresholdsAsBudgets({ spendingThresholds: thresholds }, monthOf(todayLocal()));
    return migrated.length ? { budgets: migrated, goals: [] } : EMPTY;
  }, [household, thresholds]);

  const save = useCallback(
    async (scope: PlanScope, next: PlanPayload): Promise<boolean> => {
      const key = scope === 'household' ? groupId : uid;
      if (!key || !uid) return false;
      const previous = scope === 'household' ? household : personal;
      (scope === 'household' ? setHousehold : setPersonal)(next);
      try {
        const payload = await encryptData(next, key);
        const ref =
          scope === 'household'
            ? doc(db, 'group_plans', key)
            : doc(db, 'users', key, 'private', 'plan');
        await setDoc(
          ref,
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
        (scope === 'household' ? setHousehold : setPersonal)(previous);
        setError(true);
        return false;
      }
    },
    [groupId, uid, household, personal]
  );

  return {
    household: householdView,
    personal: personal ?? EMPTY,
    loading: enabled && !(loaded.household && loaded.personal),
    error,
    save,
  };
}
