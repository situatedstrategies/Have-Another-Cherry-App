// Claiming a pending seat's history.
//
// An expense logged while a seat is still pending splits against the seat's
// placeholder id (`ghost_<index>`, see lib/members.getFullMembers). When the
// person then redeems the invite code they get a real uid, but every expense
// written before that moment still names the placeholder: they show as owing
// 0% and the placeholder shows as "Unknown". Nothing else rewrites history,
// so this does.
//
// The mapping is by order: placeholder seats are taken lowest index first, and
// members join in memberIds order (creator first, then each joiner), so the
// members who have no share on an expense line up, in join order, with the
// placeholder ids that expense still carries, in index order. A placeholder
// with nobody to take it is left alone: that seat is genuinely still pending.
//
// Pure and deterministic, so every client converges on the same ledger without
// coordinating: the web applies it whenever the ledger or the roster changes,
// and the Flutter client runs the same function (domain/ledger/seat_claims).
// editedAt is deliberately not bumped: two devices applying this to the same
// entry produce the same bytes, and a bump would make them fight.

import { Expense } from '../types';

const GHOST = /^ghost_(\d+)$/;

/** Placeholder ids referenced anywhere on an expense, lowest index first. */
function ghostIdsOn(expense: Expense): string[] {
  const ids = new Set<string>();
  const add = (v: unknown) => { if (typeof v === 'string' && GHOST.test(v)) ids.add(v); };
  Object.keys(expense.shares || {}).forEach(add);
  add(expense.paidBy);
  (expense.contributions || []).forEach(c => add(c.userId));
  (expense.settlements || []).forEach(s => { add(s.paidBy); add(s.receivedBy); add(s.voidedBy); });
  (expense.comments || []).forEach(c => add(c.userId));
  return Array.from(ids).sort((a, b) => Number(a.match(GHOST)![1]) - Number(b.match(GHOST)![1]));
}

/** Which real uid each placeholder on this expense now belongs to. */
export function seatClaimMap(expense: Expense, memberIds: string[]): Record<string, string> {
  const ghosts = ghostIdsOn(expense);
  if (ghosts.length === 0) return {};
  const shares = expense.shares || {};
  const unseated = memberIds.filter(uid => uid && !(uid in shares));
  const map: Record<string, string> = {};
  ghosts.forEach((g, i) => { if (unseated[i]) map[g] = unseated[i]; });
  return map;
}

/** The expense with every mapped placeholder replaced. Same object when nothing maps. */
export function claimSeatsOnExpense(expense: Expense, memberIds: string[]): Expense {
  const map = seatClaimMap(expense, memberIds);
  if (Object.keys(map).length === 0) return expense;
  const re = (v: string | undefined) => (v && map[v]) || v;

  const shares: Record<string, number> = {};
  Object.entries(expense.shares || {}).forEach(([uid, amt]) => {
    const to = re(uid)!;
    shares[to] = (shares[to] || 0) + Number(amt || 0);
  });

  return {
    ...expense,
    shares,
    paidBy: re(expense.paidBy)!,
    ...(expense.contributions ? { contributions: expense.contributions.map(c => ({ ...c, userId: re(c.userId)! })) } : {}),
    ...(expense.settlements ? {
      settlements: expense.settlements.map(s => ({
        ...s,
        paidBy: re(s.paidBy)!,
        receivedBy: re(s.receivedBy)!,
        ...(s.voidedBy ? { voidedBy: re(s.voidedBy) } : {}),
      })),
    } : {}),
    ...(expense.comments ? { comments: expense.comments.map(c => ({ ...c, userId: re(c.userId)! })) } : {}),
  };
}

/** Whole-ledger pass. `changed` is false when every entry came back as-is. */
export function claimSeats(expenses: Expense[], memberIds: string[] | undefined): { expenses: Expense[]; changed: boolean } {
  if (!memberIds || memberIds.length === 0 || expenses.length === 0) return { expenses, changed: false };
  let changed = false;
  const out = expenses.map(e => {
    const next = claimSeatsOnExpense(e, memberIds);
    if (next !== e) changed = true;
    return next;
  });
  return changed ? { expenses: out, changed } : { expenses, changed: false };
}
