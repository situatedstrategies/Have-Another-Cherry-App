// The web and Flutter clients have to agree about which day a recurring cycle
// falls on, because they write the same ledger. These are the Dart suite's own
// recurring cases (test/ledger_logic_test.dart) run against src/lib/recurring.ts.
//
// Run with: npm run test:parity

import {
  advanceInterval,
  advanceIntervalStr,
  parseLocalDate,
  recurringOccursOn,
  recurringDaysInMonth,
  intervalLabel,
  RECURRING_INTERVALS,
  normalizeInterval,
} from '../src/lib/recurring';

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
const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const rec = (date: string, recurringInterval: string) => ({
  isRecurring: true,
  recurringInterval,
  date,
});

console.log('--- short months -------------------------------------------------');

// setMonth(+1) on 31 January gives 3 March in JavaScript, exactly as
// DateTime(2026, 2, 31) gave March 3 in Dart. A bill due on the 31st skipped
// February and drifted later every year.
check(
  '31 Jan + 1 month clamps to 28 Feb',
  iso(advanceInterval(new Date(2026, 0, 31), 'monthly', 31)),
  '2026-02-28'
);
check(
  '31 Mar + 1 month clamps to 30 Apr',
  iso(advanceInterval(new Date(2026, 2, 31), 'monthly', 31)),
  '2026-04-30'
);
check(
  'and the 31st comes back: February does not capture it forever',
  iso(advanceInterval(new Date(2026, 1, 28), 'monthly', 31)),
  '2026-03-31'
);
check(
  'a leap February takes the 29th',
  iso(advanceInterval(new Date(2028, 0, 31), 'monthly', 31)),
  '2028-02-29'
);
check(
  'the 30th clamps in February too',
  iso(advanceInterval(new Date(2026, 0, 30), 'monthly', 30)),
  '2026-02-28'
);
check(
  'without an anchor it still clamps rather than overflowing',
  iso(advanceInterval(new Date(2026, 0, 31), 'monthly')),
  '2026-02-28'
);
// An anchor read off an unparseable date is NaN. Left alone it reaches the
// ledger as the string "NaN-NaN-NaN".
check(
  'a NaN anchor degrades to the current day rather than poisoning the date',
  advanceIntervalStr('2026-01-15', 'monthly', parseLocalDate('nonsense').getDate()),
  '2026-02-15'
);

console.log('--- cadences -----------------------------------------------------');

for (const n of [1, 3, 6, 12]) {
  const d = advanceInterval(new Date(2026, 8, 1), `${n}_weeks`);
  check(`${n} week(s) steps ${7 * n} days`, iso(d), iso(new Date(2026, 8, 1 + 7 * n)));
}
check(
  'legacy weekly is one week',
  iso(advanceInterval(new Date(2026, 8, 1), 'weekly')),
  '2026-09-08'
);
check(
  'legacy biweekly is two weeks',
  iso(advanceInterval(new Date(2026, 8, 1), 'biweekly')),
  '2026-09-15'
);
check(
  'legacy monthly is one month',
  iso(advanceInterval(new Date(2026, 8, 1), 'monthly')),
  '2026-10-01'
);
check(
  'legacy yearly is twelve months',
  iso(advanceInterval(new Date(2026, 8, 1), 'yearly')),
  '2027-09-01'
);
check(
  '12_months equals yearly',
  iso(advanceInterval(new Date(2026, 8, 1), '12_months')),
  '2027-09-01'
);
check(
  '6_months crosses the year boundary',
  iso(advanceInterval(new Date(2026, 8, 1), '6_months')),
  '2027-03-01'
);
check(
  'an unknown interval falls back to one month',
  iso(advanceInterval(new Date(2026, 8, 1), 'fortnightly-ish')),
  '2026-10-01'
);

console.log('--- string form (what the ledger stores) -------------------------');

check(
  'advanceIntervalStr round-trips YYYY-MM-DD',
  advanceIntervalStr('2026-01-31', 'monthly', 31),
  '2026-02-28'
);
check(
  'a DST spring-forward month does not lose a day',
  advanceIntervalStr('2026-03-01', 'monthly', 1),
  '2026-04-01'
);
check(
  'a DST fall-back month does not gain one',
  advanceIntervalStr('2026-10-01', 'monthly', 1),
  '2026-11-01'
);

console.log('--- calendar occurrences -----------------------------------------');

check(
  'lands on its own anchor date',
  recurringOccursOn(rec('2026-09-01', 'monthly'), new Date(2026, 8, 1)),
  true
);
check(
  'never lands before the anchor',
  recurringOccursOn(rec('2026-09-01', 'monthly'), new Date(2026, 7, 1)),
  false
);

for (const m of [2, 5, 9, 12]) {
  const r = rec('2026-01-15', 'monthly');
  check(
    `monthly lands on the 15th in month ${m}`,
    recurringOccursOn(r, new Date(2026, m - 1, 15)),
    true
  );
  check(
    `monthly does not land on the 16th in month ${m}`,
    recurringOccursOn(r, new Date(2026, m - 1, 16)),
    false
  );
}

check(
  'weekly lands a week later',
  recurringOccursOn(rec('2026-09-01', 'weekly'), new Date(2026, 8, 8)),
  true
);
check(
  'weekly does not land eight days later',
  recurringOccursOn(rec('2026-09-01', 'weekly'), new Date(2026, 8, 9)),
  false
);
check(
  'biweekly lands a fortnight later',
  recurringOccursOn(rec('2026-09-01', 'biweekly'), new Date(2026, 8, 15)),
  true
);
check(
  'biweekly skips the week between',
  recurringOccursOn(rec('2026-09-01', 'biweekly'), new Date(2026, 8, 8)),
  false
);
check(
  'quarterly lands three months on',
  recurringOccursOn(rec('2026-01-10', '3_months'), new Date(2026, 3, 10)),
  true
);
check(
  'quarterly skips the months between',
  recurringOccursOn(rec('2026-01-10', '3_months'), new Date(2026, 1, 10)),
  false
);
check(
  'yearly lands a year on',
  recurringOccursOn(rec('2026-03-02', 'yearly'), new Date(2027, 2, 2)),
  true
);
check(
  'yearly does not land a month on',
  recurringOccursOn(rec('2026-03-02', 'yearly'), new Date(2026, 3, 2)),
  false
);
check(
  'a non-recurring expense never occurs',
  recurringOccursOn(
    { isRecurring: false, recurringInterval: 'monthly', date: '2026-09-01' },
    new Date(2026, 9, 1)
  ),
  false
);
check(
  'a recurring expense with no interval never occurs',
  recurringOccursOn({ isRecurring: true, date: '2026-09-01' }, new Date(2026, 9, 1)),
  false
);

// Whatever advanceInterval does with a short month, the calendar has to do the
// same, or a bill shows on a day the ledger never spawns.
{
  const r = rec('2026-01-31', 'monthly');
  let at = new Date(2026, 0, 31);
  let agree = true;
  const landed: string[] = [];
  for (let i = 0; i < 6; i++) {
    at = advanceInterval(at, 'monthly', 31);
    landed.push(iso(at));
    if (!recurringOccursOn(r, at)) agree = false;
  }
  check('the calendar agrees with the autopilot about where a 31st lands', agree, true);
  check('and those days are the ones a human would name', landed, [
    '2026-02-28',
    '2026-03-31',
    '2026-04-30',
    '2026-05-31',
    '2026-06-30',
    '2026-07-31',
  ]);
}

// The old calendar stepped forward from nextRecurringDate, which the autopilot
// keeps advancing, so a month already past lost its occurrence.
check(
  'an occurrence in a past month is still shown',
  recurringOccursOn(rec('2026-01-15', 'monthly'), new Date(2026, 2, 15)),
  true
);

console.log('--- a month at a time --------------------------------------------');

// The calendar asks for a whole month at once. It has to answer exactly what
// asking day by day would, or the two views of the same bill disagree.
{
  const cases = [
    rec('2026-01-31', 'monthly'),
    rec('2026-09-01', 'weekly'),
    rec('2026-01-10', '3_months'),
    rec('2026-03-02', 'yearly'),
    rec('2026-02-14', '5_weeks'),
  ];
  let disagreements = 0;
  for (const c of cases) {
    for (let mi = 0; mi < 24; mi++) {
      const y = 2026 + Math.floor(mi / 12);
      const m = mi % 12;
      const byMonth = recurringDaysInMonth(c, y, m).join(',');
      const daysIn = new Date(y, m + 1, 0).getDate();
      const byDay: number[] = [];
      for (let d = 1; d <= daysIn; d++) if (recurringOccursOn(c, new Date(y, m, d))) byDay.push(d);
      if (byMonth !== byDay.join(',')) disagreements++;
    }
  }
  check('a month asked at once matches the same month asked day by day', disagreements, 0);
}

check(
  'a 31st bill lands on the 28th in February',
  recurringDaysInMonth(rec('2026-01-31', 'monthly'), 2026, 1),
  [28]
);
check(
  'a 31st bill is back on the 31st in March',
  recurringDaysInMonth(rec('2026-01-31', 'monthly'), 2026, 2),
  [31]
);
check(
  'a weekly bill lands four or five times a month',
  recurringDaysInMonth(rec('2026-09-01', 'weekly'), 2026, 8),
  [1, 8, 15, 22, 29]
);
check(
  'a month before the anchor is empty',
  recurringDaysInMonth(rec('2026-09-01', 'monthly'), 2026, 7),
  []
);
check(
  'a quarterly bill is absent from the months between',
  recurringDaysInMonth(rec('2026-01-10', '3_months'), 2026, 1),
  []
);

console.log('--- labels and the picker ----------------------------------------');

check(
  'intervalLabel names the legacy spellings',
  [
    intervalLabel('weekly'),
    intervalLabel('biweekly'),
    intervalLabel('monthly'),
    intervalLabel('yearly'),
  ],
  ['Weekly', 'Every 2 weeks', 'Monthly', 'Yearly']
);
check(
  'intervalLabel names the new spellings',
  [
    intervalLabel('1_weeks'),
    intervalLabel('7_weeks'),
    intervalLabel('1_months'),
    intervalLabel('12_months'),
  ],
  ['Weekly', 'Every 7 weeks', 'Monthly', 'Yearly']
);
check('the picker offers 1 to 12 weeks and 1/2/3/6/12 months', RECURRING_INTERVALS.length, 17);

// A bill saved before the list grew says 'monthly'. The picker offers
// '1_months'. Without this the chip would render with nothing selected and a
// save would silently rewrite the cadence.
check(
  'legacy spellings map onto a value the picker offers',
  ['weekly', 'biweekly', 'monthly', 'yearly'].map(normalizeInterval),
  ['1_weeks', '2_weeks', '1_months', '12_months']
);
check('a canonical value is left alone', ['7_weeks', '6_months'].map(normalizeInterval), [
  '7_weeks',
  '6_months',
]);
check(
  'a missing or unrecognised interval falls back to monthly',
  [normalizeInterval(undefined), normalizeInterval(''), normalizeInterval('whenever')],
  ['1_months', '1_months', '1_months']
);
check(
  'everything normalizeInterval returns is offered by the picker',
  ['weekly', 'biweekly', 'monthly', 'yearly', '3_weeks', '6_months', 'whenever']
    .map(normalizeInterval)
    .filter((v) => !RECURRING_INTERVALS.some((o) => o.value === v)),
  []
);
// Every value the picker can write must be one advanceInterval recognises.
// An unrecognised value silently falls through to the one-month default, so a
// typo in the picker would look like a working "every 5 weeks" that is not.
{
  const wrong = RECURRING_INTERVALS.filter((o) => {
    const w = /^(\d+)_weeks$/.exec(o.value);
    const m = /^(\d+)_months$/.exec(o.value);
    const got = iso(advanceInterval(new Date(2026, 8, 1), o.value));
    const want = w
      ? iso(new Date(2026, 8, 1 + 7 * Number(w[1])))
      : iso(new Date(2026, 8 + Number(m![1]), 1));
    return got !== want;
  }).map((o) => o.value);
  check('every offered value advances by exactly what its name says', wrong, []);
}

console.log(failures === 0 ? '\nALL RECURRING PARITY CHECKS PASSED' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
