// Quiz retake cooldown (lib/quizRetake): three months from the last result,
// open when there is no result on record. Run with `npm run test:parity`.
import { canRetakeQuiz, quizRetakeOpensAt, quizRetakeBlocker } from '../src/lib/quizRetake';

let bad = 0;
const check = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) bad++;
  console.log(
    `${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ` (got ${JSON.stringify(got)}, want ${JSON.stringify(want)})`}`
  );
};

const taken = new Date(2026, 8, 14, 10, 0, 0); // Sep 14 2026
const iso = taken.toISOString();

check('no timestamp is open', canRetakeQuiz(undefined), true);
check('null timestamp is open', canRetakeQuiz(null), true);
check('garbage timestamp is open', canRetakeQuiz('not a date'), true);
check(
  'opens exactly three months on',
  quizRetakeOpensAt(iso)?.getTime(),
  new Date(2026, 11, 14).getTime()
);
check('closed the next day', canRetakeQuiz(iso, new Date(2026, 8, 15)), false);
check('closed the day before it opens', canRetakeQuiz(iso, new Date(2026, 11, 13, 23, 59)), false);
check('open on the day', canRetakeQuiz(iso, new Date(2026, 11, 14)), true);
check('open long after', canRetakeQuiz(iso, new Date(2027, 0, 1)), true);
check(
  'blocker names the date',
  (quizRetakeBlocker(iso, new Date(2026, 9, 1)) || '').includes('2026'),
  true
);
check('no blocker when open', quizRetakeBlocker(iso, new Date(2027, 0, 1)), null);
check(
  'month overflow rolls forward',
  quizRetakeOpensAt(new Date(2026, 10, 30).toISOString())?.getTime(),
  new Date(2027, 1, 30).getTime()
);

console.log(bad ? `\n${bad} FAILURES` : '\nall quiz retake rules hold');
if (bad) process.exit(1);
