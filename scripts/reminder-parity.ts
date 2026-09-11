// The scheduled bill reminder is a contract between two codebases: server.ts
// writes the push payload, and the Flutter app's `routeForPush` reads it
// (Have-Another-Cherry-iOS/test/push_route_test.dart). Nothing type-checks
// across that gap, so these cases assert both halves agree.
//
// Run with: npm run test:parity

import { reminderTargetDate, reminderPayload } from '../src/lib/reminders';

let failures = 0;
const check = (name: string, actual: unknown, expected: unknown) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) console.log(`ok   ${name}`);
  else {
    failures++;
    console.log(`FAIL ${name}\n     expected ${e}\n     got      ${a}`);
  }
};

console.log('--- which day a run reminds for ----------------------------------');

check(
  'a run reminds for tomorrow',
  reminderTargetDate(new Date('2026-09-05T21:00:00Z')),
  '2026-09-06'
);
check(
  'it crosses a month boundary',
  reminderTargetDate(new Date('2026-09-30T21:00:00Z')),
  '2026-10-01'
);
check(
  'it crosses a year boundary',
  reminderTargetDate(new Date('2026-12-31T21:00:00Z')),
  '2027-01-01'
);
check('it handles a leap day', reminderTargetDate(new Date('2028-02-28T21:00:00Z')), '2028-02-29');

// The offset is what makes an evening run mean "tomorrow" locally rather than
// already-tomorrow in UTC. At 21:00 Eastern it is 01:00 UTC the next day, so
// without the offset the job would remind for the day after tomorrow.
check(
  'an evening run in a western zone still means tomorrow there',
  reminderTargetDate(new Date('2026-09-06T01:00:00Z'), -4),
  '2026-09-06'
);
check(
  'the same instant with no offset is a day further out',
  reminderTargetDate(new Date('2026-09-06T01:00:00Z'), 0),
  '2026-09-07'
);
check(
  'a positive offset works too',
  reminderTargetDate(new Date('2026-09-05T22:00:00Z'), 9),
  '2026-09-07'
);

console.log('--- the payload the app has to understand ------------------------');

// These keys are read by routeForPush in the Flutter client. Renaming one here
// silently stops every tapped reminder from opening the right day.
check(
  'one bill due carries its id and target',
  reminderPayload('ABC123', '2026-09-10', [{ id: 'bill-1', target: 'bill' }]),
  { type: 'bill_reminder', groupId: 'ABC123', dueDate: '2026-09-10', id: 'bill-1', target: 'bill' }
);

check(
  'several bills due omit the id, since one push cannot point at three',
  reminderPayload('ABC123', '2026-09-10', [
    { id: 'bill-1', target: 'bill' },
    { id: 'exp-9', target: 'recurring' },
  ]),
  { type: 'bill_reminder', groupId: 'ABC123', dueDate: '2026-09-10' }
);

check(
  'a recurring expense carries its own target',
  reminderPayload('ABC123', '2026-09-10', [{ id: 'exp-9', target: 'recurring' }]).target,
  'recurring'
);

// FCM rejects the whole send if any value is not a string, so a malformed
// entry must degrade rather than take the reminder down with it.
check(
  'every value is a string, whatever the entry held',
  Object.values(reminderPayload('ABC123', '2026-09-10', [{ id: 42, target: null }])).every(
    (v) => typeof v === 'string'
  ),
  true
);

// The payload lands on a lock screen and travels through FCM. The privacy
// claim is that it says nothing about what the bill is or what it costs.
{
  const payload = reminderPayload('ABC123', '2026-09-10', [
    { id: 'bill-1', target: 'bill', title: 'Rent', amount: 2100, category: 'Housing' } as any,
  ]);
  const serialised = JSON.stringify(payload).toLowerCase();
  const leaked = ['rent', '2100', 'housing'].filter((s) => serialised.includes(s));
  check('nothing about the bill itself reaches the payload', leaked, []);
  check(
    'and it carries only the four agreed keys',
    Object.keys(payload).sort(),
    ['dueDate', 'groupId', 'id', 'target', 'type'].sort()
  );
}

console.log(failures === 0 ? '\nALL REMINDER PARITY CHECKS PASSED' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
