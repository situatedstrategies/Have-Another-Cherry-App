// One next action per group for the Home screen (docs/REBUILD_PLAN.md
// section 7 in the mobile repo): the single most useful thing to do now,
// instead of a list of tiles. Pure, so it can be checked in Node.
import type { Expense, Group } from '../types';
import { getRemainingSettlementAmount, isDarkCherry } from './money';
import { setupOwner } from './householdSetup';

export type NextAction =
  | { kind: 'invite' }
  | { kind: 'setup' }
  | { kind: 'settle'; count: number }
  | { kind: 'first_expense' }
  | null;

export function nextAction(
  group: Pick<Group, 'memberIds' | 'members' | 'setup' | 'createdBy' | 'targetNumPeople'>,
  expenses: Expense[],
  uid: string
): NextAction {
  const joined = (group.memberIds || []).length;
  const wanted = Math.max(group.targetNumPeople || 0, 2);
  if (joined < 2 && joined < wanted) return { kind: 'invite' };
  if (!group.setup && setupOwner(group) === uid) return { kind: 'setup' };

  // Expenses someone else paid where this person still owes part.
  const owing = expenses.filter(
    (e) =>
      e.paidBy !== uid &&
      !isDarkCherry(e) &&
      (e.shares?.[uid] || 0) > 0 &&
      getRemainingSettlementAmount(e, uid) > 0.009
  );
  if (owing.length > 0) return { kind: 'settle', count: owing.length };
  if (expenses.length === 0) return { kind: 'first_expense' };
  return null;
}
