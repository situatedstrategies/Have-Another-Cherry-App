// Recurring interval arithmetic, ported from the Flutter client's
// recurring.dart. Both clients write the same ledger, so they have to agree
// about which day a cycle falls on; scripts/recurring-parity.ts runs the Dart
// suite's cases against this file. Month steps are anchored on the original
// day so a bill set for the 31st does not stick at 28 after one February.

// Weeks and months are separate choices: every 4 weeks is not the 1st of each month.
export const RECURRING_WEEKS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;
export const RECURRING_MONTHS = [1, 2, 3, 6, 12] as const;

/** Every cadence offered, flattened. Used by the parity suite. */
export const RECURRING_INTERVALS: { value: string; label: string }[] = [
  ...RECURRING_WEEKS.map((n) => ({ value: `${n}_weeks`, label: intervalLabel(`${n}_weeks`) })),
  ...RECURRING_MONTHS.map((n) => ({ value: `${n}_months`, label: intervalLabel(`${n}_months`) })),
];

/** The canonical spelling of an interval, for seeding a picker. Legacy records
 *  say `weekly` / `monthly` / `yearly`; a picker needs the value it offers. */
export function normalizeInterval(interval?: string | null): string {
  if (!interval) return '1_months';
  const w = weeksIn(interval);
  if (w !== null) return `${w}_weeks`;
  const m = monthsIn(interval);
  if (m !== null && (RECURRING_MONTHS as readonly number[]).includes(m)) return `${m}_months`;
  if (m !== null) return `${m}_months`;
  return '1_months';
}

/** Local date from a YYYY-MM-DD string, without the UTC off-by-one. */
export const parseLocalDate = (s: string): Date =>
  new Date(/^\d{4}-\d{2}-\d{2}$/.test(s) ? s + 'T00:00:00' : s);

/** YYYY-MM-DD in the local zone, which is how every date is stored. */
export const toLocalIso = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Today as a local YYYY-MM-DD. `toISOString()` gives the UTC date, which
 *  is tomorrow's or yesterday's date for part of every day outside UTC. */
export const todayLocal = (): string => toLocalIso(new Date());

/** The last day the month containing [d] actually has. */
const lastDayOf = (year: number, monthIndex: number): number =>
  new Date(year, monthIndex + 1, 0).getDate();

/** Weeks for a week-based interval, or null. Accepts the legacy names too. */
function weeksIn(interval: string): number | null {
  if (interval === 'weekly') return 1;
  if (interval === 'biweekly') return 2;
  const m = /^(\d{1,2})_weeks?$/.exec(interval);
  const n = m ? parseInt(m[1], 10) : NaN;
  return Number.isFinite(n) && n >= 1 && n <= 12 ? n : null;
}

/** Months for a month-based interval, or null. `monthly` and `yearly` are the
 *  legacy spellings of 1 and 12. */
function monthsIn(interval: string): number | null {
  if (interval === 'monthly') return 1;
  if (interval === 'yearly') return 12;
  const m = /^(\d{1,2})_months?$/.exec(interval);
  const n = m ? parseInt(m[1], 10) : NaN;
  return Number.isFinite(n) && n >= 1 && n <= 12 ? n : null;
}

function addMonths(from: Date, months: number, anchorDay?: number): Date {
  const target = new Date(from.getFullYear(), from.getMonth() + months, 1);
  // A NaN anchor (unparseable date) would write "NaN-NaN-NaN" into the ledger.
  const want = Number.isInteger(anchorDay) ? (anchorDay as number) : from.getDate();
  const day = Math.min(Math.max(want, 1), lastDayOf(target.getFullYear(), target.getMonth()));
  return new Date(target.getFullYear(), target.getMonth(), day);
}

/** Advances [from] by one [interval]. [anchorDay] is the day the bill was set
 *  for; it keeps month intervals sticky across short months. */
export function advanceInterval(from: Date, interval?: string, anchorDay?: number): Date {
  const key = interval || '';
  const weeks = weeksIn(key);
  if (weeks !== null) {
    const d = new Date(from);
    d.setDate(d.getDate() + 7 * weeks);
    return d;
  }
  const months = monthsIn(key);
  if (months !== null) return addMonths(from, months, anchorDay);
  // Unknown interval: a month is the least surprising fallback, and it still
  // clamps rather than overflowing.
  return addMonths(from, 1, anchorDay);
}

/** [advanceInterval] over the YYYY-MM-DD strings the ledger actually stores. */
export function advanceIntervalStr(dateStr: string, interval?: string, anchorDay?: number): string {
  return toLocalIso(advanceInterval(parseLocalDate(dateStr), interval, anchorDay));
}

/** Whether a recurring definition lands on [day]. Walks from the definition's
 *  own date with the same anchor as the autopilot, so the two agree. */
export function recurringOccursOn(
  source: { isRecurring?: boolean; recurringInterval?: string | null; date?: string },
  day: Date,
  maxSteps = 600
): boolean {
  if (!source.isRecurring) return false;
  const interval = source.recurringInterval;
  if (!interval || !source.date) return false;

  const anchor = parseLocalDate(source.date);
  if (Number.isNaN(anchor.getTime())) return false;

  const target = new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime();
  let at = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate());
  if (target < at.getTime()) return false;

  for (let i = 0; i < maxSteps; i++) {
    const t = at.getTime();
    if (t === target) return true;
    if (t > target) return false;
    const next = advanceInterval(at, interval, anchor.getDate());
    // A malformed interval that does not move would loop forever.
    if (next.getTime() <= t) return false;
    at = next;
  }
  return false;
}

/** Every day in the given month that a recurring definition falls on. */
export function recurringDaysInMonth(
  source: { isRecurring?: boolean; recurringInterval?: string | null; date?: string },
  year: number,
  monthIndex: number,
  maxSteps = 600
): number[] {
  if (!source.isRecurring) return [];
  const interval = source.recurringInterval;
  if (!interval || !source.date) return [];

  const anchor = parseLocalDate(source.date);
  if (Number.isNaN(anchor.getTime())) return [];

  const monthStart = new Date(year, monthIndex, 1).getTime();
  const monthEnd = new Date(year, monthIndex + 1, 0).getTime();
  const days: number[] = [];
  let at = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate());

  for (let i = 0; i < maxSteps; i++) {
    const t = at.getTime();
    if (t > monthEnd) break;
    if (t >= monthStart) days.push(at.getDate());
    const next = advanceInterval(at, interval, anchor.getDate());
    // A malformed interval that does not move would loop forever.
    if (next.getTime() <= t) break;
    at = next;
  }
  return days;
}

export function intervalLabel(interval: string): string {
  const weeks = weeksIn(interval);
  if (weeks !== null) {
    if (weeks === 1) return 'Weekly';
    if (weeks === 2) return 'Every 2 weeks';
    return `Every ${weeks} weeks`;
  }
  const months = monthsIn(interval);
  if (months !== null) {
    if (months === 1) return 'Monthly';
    if (months === 12) return 'Yearly';
    return `Every ${months} months`;
  }
  return interval;
}
