// The Home next action (lib/nextAction): one thing to do per group, in the
// order the plan names. Run with `npm run test:parity`.
import assert from 'node:assert/strict';
import { nextAction } from '../src/lib/nextAction';
import type { Expense, GroupSetup } from '../src/types';

const me = 'me';
const them = 'them';
const setup: GroupSetup = {
  version: 1,
  completedBy: me,
  completedAt: '',
  kind: 'partners',
  paying: 'one_fronts',
  settle: 'monthly',
  split: 'even',
  handoffs: [],
  recurring: [],
  thresholdsWanted: false,
  trip: null,
  note: '',
};
const expense = (over: Partial<Expense>): Expense =>
  ({
    id: 'e',
    groupId: 'g',
    title: 'x',
    amount: 10,
    date: '2026-11-01',
    category: 'c',
    paidBy: them,
    splitType: 'equal',
    shares: { [me]: 5, [them]: 5 },
    status: 'OPEN',
    createdAt: '2026-11-01',
    ...over,
  }) as Expense;

assert.deepEqual(
  nextAction(
    { memberIds: [me], members: [{ uid: me }] as never, createdBy: me, targetNumPeople: 2 },
    [],
    me
  ),
  { kind: 'invite' },
  'alone: invite'
);
assert.deepEqual(
  nextAction({ memberIds: [me, them], members: [] as never, createdBy: me }, [], me),
  { kind: 'setup' },
  'creator without setup: set up'
);
assert.deepEqual(
  nextAction({ memberIds: [me, them], members: [] as never, createdBy: them }, [], me),
  { kind: 'first_expense' },
  'a member who is not the creator is not asked to set up'
);
assert.deepEqual(
  nextAction({ memberIds: [me, them], members: [] as never, createdBy: me, setup }, [], me),
  { kind: 'first_expense' }
);
assert.deepEqual(
  nextAction(
    { memberIds: [me, them], members: [] as never, createdBy: me, setup },
    [expense({}), expense({ id: 'f' })],
    me
  ),
  { kind: 'settle', count: 2 }
);
assert.equal(
  nextAction(
    { memberIds: [me, them], members: [] as never, createdBy: me, setup },
    [expense({ paidBy: me })],
    me
  ),
  null,
  'nothing owed, something logged: nothing to push'
);
assert.equal(
  nextAction(
    { memberIds: [me, them], members: [] as never, createdBy: me, setup },
    [expense({ splitType: 'dark_cherry', blindMin: 1, blindMax: 5 })],
    me
  ),
  null,
  'a Dark Cherry never shows as a debt'
);
console.log('next-action-check: ok');
