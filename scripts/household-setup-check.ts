// The household setup helpers (lib/householdSetup) against the contract in
// docs/REBUILD_PLAN.md section 11 of the mobile repo. Run with `npm run test:parity`.
import assert from 'node:assert/strict';
import '../src/i18n';
import {
  GROUP_KINDS,
  GROUP_PAYING,
  GROUP_RECURRING,
  GROUP_SETTLE,
  GROUP_SPLITS,
  completeSetup,
  draftFrom,
  emptyDraft,
  evenSplit,
  recurringStubs,
  reminderCadenceDays,
  setupOwner,
  stepsFor,
} from '../src/lib/householdSetup';

assert.deepEqual(GROUP_KINDS, ['partners', 'housemates', 'family', 'friends', 'trip', 'team', 'other']);
assert.deepEqual(GROUP_PAYING, ['one_fronts', 'whoever', 'shared_account', 'varies']);
assert.deepEqual(GROUP_SETTLE, ['as_you_go', 'weekly', 'monthly', 'when_big']);
assert.deepEqual(GROUP_SPLITS, ['even', 'income', 'shares', 'each_time']);
assert.deepEqual(GROUP_RECURRING, ['rent', 'utilities', 'subscriptions', 'groceries', 'childcare']);

assert.deepEqual(stepsFor({ kind: 'housemates' }), ['kind', 'paying', 'settle', 'split', 'handoffs', 'recurring', 'note']);
assert.deepEqual(stepsFor({ kind: 'partners' }), ['kind', 'paying', 'settle', 'split', 'handoffs', 'recurring', 'thresholds', 'note']);
assert.deepEqual(stepsFor({ kind: 'family' }).includes('thresholds'), true);
assert.deepEqual(stepsFor({ kind: 'trip' }), ['kind', 'paying', 'settle', 'split', 'handoffs', 'recurring', 'trip', 'note']);

assert.deepEqual(evenSplit(2), [50, 50]);
assert.deepEqual(evenSplit(3), [33.4, 33.3, 33.3]);
assert.ok(Math.abs(evenSplit(3).reduce((a, b) => a + b, 0) - 100) < 0.001);
assert.deepEqual(evenSplit(1), [100]);
assert.deepEqual(evenSplit(0), [100], 'never fewer than one seat');

assert.equal(reminderCadenceDays('weekly'), 7);
assert.equal(reminderCadenceDays('when_big'), null);

const draft = emptyDraft(['venmo']);
draft.kind = 'trip';
draft.trip = { start: '2026-12-01', end: '2026-12-10', currency: 'EUR' };
draft.note = ' keep it light ';
const done = completeSetup(draft, 'uid1', new Date('2026-11-08T12:00:00Z'));
assert.equal(done.version, 1);
assert.equal(done.completedBy, 'uid1');
assert.equal(done.completedAt, '2026-11-08T12:00:00.000Z');
assert.deepEqual(done.trip, { start: '2026-12-01', end: '2026-12-10', currency: 'EUR' });
assert.equal(done.note, 'keep it light');

const notTrip = completeSetup({ ...draft, kind: 'friends' }, 'uid1');
assert.equal(notTrip.trip, null, 'trip dates are dropped when the kind is not a trip');

const back = draftFrom(done, ['zelle']);
assert.deepEqual(back.handoffs, ['venmo'], 'a stored setup keeps its own handoffs');
assert.deepEqual(draftFrom(undefined, ['zelle']).handoffs, ['zelle']);

const stubs = recurringStubs(['rent', 'groceries'], [{ id: 'x', name: 'Rent or mortgage', dueDay: 5 }]);
assert.equal(stubs.length, 1, 'a bill already in the vault is not duplicated');
assert.equal(stubs[0].id, 'setup_groceries');
assert.equal(stubs[0].dueDay, 1);

assert.equal(setupOwner({ createdBy: 'a', members: [{ uid: 'b' }] }), 'a');
assert.equal(setupOwner({ members: [{ uid: 'b' }] }), 'b', 'pre-2.0 groups fall back to the first member');
assert.equal(setupOwner({}), null);

console.log('household-setup-check: ok');
