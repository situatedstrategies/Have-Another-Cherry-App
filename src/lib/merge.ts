import { Expense, Settlement, Comment } from '../types';
import { getNormalizedExpenseStatus } from './money';

// Every device keeps its own copy of the ledger (localStorage) and copies meet
// in two places: the transfer_queue (member-to-member UPSERTs) and the shared
// group_ledgers snapshot (whole-ledger backfill). Both MUST merge with the same
// rules, or a stale copy from one path can rewind what the other path already
// applied — e.g. a snapshot written before an edit reverting the split, which
// then makes a paid-up debt look open again and invites a duplicate payment.
// This module is that single set of rules.

// A settlement's status only ever moves forward: pending -> confirmed -> voided.
// A stale copy can therefore never un-confirm a payment or resurrect one that
// was removed.
const SETTLEMENT_STATUS_RANK: Record<string, number> = {
  pending: 0,
  confirmed: 1,
  voided: 2,
};

const settlementRank = (s: Settlement): number =>
  SETTLEMENT_STATUS_RANK[s.status] ?? 0;

export function mergeSettlements(
  local: Settlement[] = [],
  incoming: Settlement[] = []
): Settlement[] {
  const byId = new Map<string, Settlement>();
  for (const s of local) byId.set(s.id, s);
  for (const s of incoming) {
    const existing = byId.get(s.id);
    if (!existing) {
      byId.set(s.id, s);
      continue;
    }
    // The side whose status is further along wins field-by-field, so the
    // confirmation/void metadata travels with the status that produced it.
    const [winner, loser] =
      settlementRank(s) >= settlementRank(existing) ? [s, existing] : [existing, s];
    byId.set(s.id, { ...loser, ...winner });
  }
  return Array.from(byId.values());
}

export function mergeComments(
  local: Comment[] = [],
  incoming: Comment[] = []
): Comment[] {
  const byId = new Map<string, Comment>();
  for (const c of local) byId.set(c.id, c);
  for (const c of incoming) {
    const existing = byId.get(c.id);
    byId.set(c.id, existing ? { ...existing, ...c } : c);
  }
  return Array.from(byId.values());
}

// When the expense content (title/amount/shares/...) was last changed. Records
// from before `editedAt` existed fall back to createdAt; a tie keeps the
// incoming side, matching the old always-take-incoming behavior.
const contentVersion = (e: Expense): number => {
  const stamp = e.editedAt || e.createdAt;
  const parsed = stamp ? Date.parse(stamp) : NaN;
  return Number.isFinite(parsed) ? parsed : 0;
};

// Merge two copies of the same expense. Content fields come from whichever
// side was edited most recently (so a confirmation broadcast from a device
// that hasn't seen the latest edit can't revert the split), while settlements
// and comments are unioned by id with forward-only settlement status.
export function mergeExpense(local: Expense, incoming: Expense): Expense {
  const [base, other] =
    contentVersion(incoming) >= contentVersion(local)
      ? [incoming, local]
      : [local, incoming];

  const merged: Expense = {
    ...other,
    ...base,
    settlements: mergeSettlements(local.settlements, incoming.settlements),
    comments: mergeComments(local.comments, incoming.comments),
  };
  merged.status = getNormalizedExpenseStatus(merged);
  return merged;
}

// Merge two whole ledgers (used by the group snapshot backfill), newest-dated
// expense first — same ordering the app keeps everywhere else.
export function mergeExpenseLists(
  local: Expense[] = [],
  remote: Expense[] = []
): Expense[] {
  const byId = new Map<string, Expense>();
  for (const e of local) byId.set(e.id, e);
  for (const e of remote) {
    const existing = byId.get(e.id);
    byId.set(e.id, existing ? mergeExpense(existing, e) : e);
  }
  return Array.from(byId.values()).sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );
}
