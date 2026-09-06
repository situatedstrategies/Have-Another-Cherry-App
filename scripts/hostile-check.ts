// Feed the dashboard's pure logic the shapes real data actually takes.
import { computeRhythm } from '../src/components/RhythmCard';
import { splitForArchive, archiveMonthKey } from '../src/lib/archive';
import { getExpenseStatusLabel, isUnclaimed, getDarkCherryRemaining } from '../src/lib/money';
import { advanceIntervalStr, parseLocalDate, recurringDaysInMonth } from '../src/lib/recurring';

const base: any = { id: 'x', groupId: 'g', title: 'T', amount: 10, date: '2026-09-01',
  category: 'C', paidBy: 'a', splitType: 'equal', shares: { a: 10 }, status: 'OPEN',
  createdAt: '2026-09-01T00:00:00.000Z', settlements: [], comments: [] };

const hostile: any[] = [
  { ...base, date: undefined },
  { ...base, createdAt: undefined },
  { ...base, createdAt: 'not a date' },
  { ...base, shares: undefined },
  { ...base, settlements: undefined },
  { ...base, amount: undefined },
  { ...base, paidBy: undefined },
  { ...base, isRecurring: true, recurringInterval: undefined, nextRecurringDate: '2026-09-01' },
  { ...base, isRecurring: true, recurringInterval: 'monthly', date: undefined },
  { ...base, splitType: 'dark_cherry', shares: {}, blindMin: undefined, blindMax: undefined },
];

let failures = 0;
const attempt = (name: string, fn: () => unknown) => {
  try { fn(); console.log(`ok   ${name}`); }
  catch (e: any) { failures++; console.log(`THROW ${name}\n      ${e?.message || e}`); }
};

hostile.forEach((h, i) => {
  attempt(`computeRhythm  [${i}]`, () => computeRhythm(Array(6).fill(h)));
  attempt(`splitForArchive[${i}]`, () => splitForArchive([h]));
  attempt(`statusLabel    [${i}]`, () => getExpenseStatusLabel(h));
  attempt(`unclaimed      [${i}]`, () => isUnclaimed(h));
  attempt(`darkCherry     [${i}]`, () => getDarkCherryRemaining(h, false));
  attempt(`recurringDays  [${i}]`, () => recurringDaysInMonth(h, 2026, 8));
  attempt(`advanceStr     [${i}]`, () => advanceIntervalStr(h.date ?? '', h.recurringInterval, parseLocalDate(h.date ?? '').getDate()));
});
console.log(failures ? `\n${failures} THROWS` : '\nnothing threw');
