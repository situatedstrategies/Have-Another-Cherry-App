// Recurring interval arithmetic, ported from the Flutter client's
// `lib/domain/ledger/recurring.dart`.
//
// This exists because the same arithmetic was written three times on the web
// (App.tsx's autopilot, ExpenseForm's next-date, HouseholdVault's calendar
// projection) and all three had the same two bugs:
//
//   1. `d.setMonth(d.getMonth() + 1)` on 31 January gives 3 March, so a bill
//      due on the 31st skipped February entirely and drifted later every year.
//   2. Even clamped, a bill that lands on 28 February has forgotten it was
//      ever the 31st, so it sticks at 28 for good.
//
// Both clients write the same ledger, so they have to agree about which day a
// cycle falls on. `scripts/recurring-parity.ts` runs the Dart suite's own
// cases against this file.

// Weeks and months are offered as two separate choices, matching the Flutter
// form, because they are two different questions. A delivery every 4 weeks is
// not the same as one on the 1st of each month, and a single merged list makes
// that difference invisible at the moment someone picks.
export const RECURRING_WEEKS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;
export const RECURRING_MONTHS = [1, 2, 3, 6, 12] as const;

/** Every cadence offered, flattened. Used by the parity suite. */
export const RECURRING_INTERVALS: { value: string; label: string }[] = [
  ...RECURRING_WEEKS.map((n) => ({ value: `${n}_weeks`, label: intervalLabel(`${n}_weeks`) })),
  ...RECURRING_MONTHS.map((n) => ({ value: `${n}_months`, label: intervalLabel(`${n}_months`) })),
];

/**
 * The canonical spelling of an interval, for seeding a picker.
 *
 * Records written before the list grew say `weekly` / `monthly` / `yearly`.
 * Those keep working everywhere else, but a picker needs the value it actually
 * offers or it renders with nothing selected.
 */
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

/** Weeks for a week-based interval, or null. Accepts `1_week`..`12_weeks`
 *  plus the two legacy names, so records written before the list grew still
 *  work. */
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
  // An anchor read off an unparseable date is NaN, and NaN would propagate all
  // the way to an Invalid Date and a "NaN-NaN-NaN" written into the ledger.
  // Dart's tryParse returns null here; falling back to the current day is the
  // same degradation.
  const want = Number.isInteger(anchorDay) ? (anchorDay as number) : from.getDate();
  const day = Math.min(Math.max(want, 1), lastDayOf(target.getFullYear(), target.getMonth()));
  return new Date(target.getFullYear(), target.getMonth(), day);
}

/**
 * Advances [from] by one [interval].
 *
 * [anchorDay] is the day of the month the bill was originally set for, and it
 * is what makes month intervals sticky: without it a bill anchored on the 31st
 * becomes the 28th in February and then stays the 28th forever. With it,
 * February is the 28th and March is the 31st again.
 */
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

/**
 * Whether a recurring definition lands on [day].
 *
 * The calendar shows every recurring expense, and it has to agree with the
 * autopilot about when a cycle falls. So this walks the same [advanceInterval]
 * from the definition's own date, with the same anchor, rather than stepping
 * forward from `nextRecurringDate`: that field moves as the autopilot advances,
 * so a past month would lose the occurrence it definitely had.
 */
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

/**
 * Every day in the given month that a recurring definition falls on.
 *
 * Same walk as [recurringOccursOn], done once for the month instead of once
 * per day: a calendar asking about all 31 days would otherwise re-walk the
 * whole schedule from the anchor 31 times.
 */
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
