// Checks the assessment normalizer against the shared contract
// (docs/REBUILD_PLAN.md section 11 in the mobile repo): every field present,
// bounded and typed, off-contract values replaced, nothing invented.
import assert from 'node:assert/strict';
import { normalizeAssessment, ASSESSMENT_VERSION } from '../server/routes/assessment';

const full = normalizeAssessment(
  {
    style: 'Steady Planner',
    summary: 'You like the detail. You settle quickly. You avoid the talk until it is late.',
    strengths: ['clear records', 'quick to settle', 'extra', 'more', 'too many'],
    watchFor: ['waits too long to raise a worry'],
    suggestedSplit: { kind: 'income', why: 'Incomes differ and you both said so.' },
    thresholds: [
      { category: 'groceries', monthly: 250.4 },
      { category: '', monthly: 10 },
      { category: 'rent', monthly: 0 },
    ],
    reminderCadence: 'biweekly',
    conversationOpeners: ['Can we look at this together this week?'],
  },
  'es'
);
assert.equal(full.version, ASSESSMENT_VERSION);
assert.equal(full.language, 'es');
assert.equal(full.style, 'Steady Planner');
assert.equal(full.strengths.length, 4, 'strengths capped at four');
assert.deepEqual(full.thresholds, [{ category: 'groceries', monthly: 250 }]);
assert.equal(full.suggestedSplit.kind, 'income');
assert.equal(full.reminderCadence, 'biweekly');

const sparse = normalizeAssessment(
  { summary: 'Short — with a dash', suggestedSplit: { kind: 'weird' }, reminderCadence: 'daily' },
  'en'
);
assert.equal(sparse.suggestedSplit.kind, 'even', 'unknown split kind falls back to even');
assert.equal(sparse.reminderCadence, 'monthly', 'unknown cadence falls back to monthly');
assert.ok(!sparse.summary.includes('—'), 'em dashes are stripped');
assert.deepEqual(sparse.strengths, []);
assert.deepEqual(sparse.thresholds, []);
assert.ok(sparse.style.length > 0, 'style always has a value');

const empty = normalizeAssessment(null, 'ru');
assert.equal(empty.summary, '', 'an empty summary is left empty so the route can refuse it');

console.log('assessment-check: ok');
