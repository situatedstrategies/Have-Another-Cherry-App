// Cross-group personal view: the member's own share across every group they
// belong to, as one list the existing reports and plan arithmetic can run
// over in Personal view. Nothing is written; the other ledgers are read-only
// here. Pure; mirrored in the Flutter app's domain/ledger/cross_group.dart and
// checked by scripts/cross-group-check.ts (`npm run test:parity`).
import { Expense } from '../types';

export interface DateRange {
  /** Inclusive local YYYY-MM-DD dates. */
  start: string;
  end: string;
}

/**
 * One expense list from several ledgers: each line keeps its own `groupId`
 * (the key it came under) and has its `shares` reduced to the member's own,
 * so `reportAmount` in Personal view reads it unchanged. Lines where the
 * member has no share (deposits, other people's Dark Cherry pots, splits they
 * are not on) are left out, as are lines outside [filter] when one is given.
 * Groups are visited in key order; the result is newest first (date, then
 * createdAt), ties broken by id.
 */
export const mergePersonalAcrossGroups = (
  ledgersByGroup: Record<string, Expense[]>,
  uid: string,
  filter?: DateRange
): Expense[] => {
  const out: Expense[] = [];
  for (const groupId of Object.keys(ledgersByGroup).sort()) {
    for (const e of ledgersByGroup[groupId] || []) {
      if (!e || !e.date) continue;
      const share = Number(e.shares?.[uid]) || 0;
      if (share <= 0) continue;
      if (filter && (e.date < filter.start || e.date > filter.end)) continue;
      out.push({ ...e, groupId, shares: { [uid]: share } });
    }
  }
  return out.sort(
    (a, b) =>
      b.date.localeCompare(a.date) ||
      (b.createdAt || '').localeCompare(a.createdAt || '') ||
      a.id.localeCompare(b.id)
  );
};

/** Distinct group ids with at least one line in a merged list, in order of
 *  first appearance. */
export const groupsIn = (merged: Expense[]): string[] => {
  const seen: string[] = [];
  for (const e of merged) if (!seen.includes(e.groupId)) seen.push(e.groupId);
  return seen;
};
