// Recurring detection: when the same title and a similar amount repeat on a
// cadence, offer to make the latest entry the recurring source, one tap.
// Pure over the expenses it is handed; nothing is stored but the per-device
// list of dismissed titles the caller keeps. Mirrored in the Flutter app's
// domain/ledger/recurring_detect.dart and checked by
// scripts/recurring-detect-check.ts (`npm run test:parity`).
import { Expense } from '../types';
import { roundCurrency, isDeposit, isGoalContribution } from './money';
import { normalizeTitle } from './smartDefaults';
import { advanceIntervalStr, parseLocalDate } from './recurring';
import { addMonthsTo, monthOf } from './plan';

export type DetectedInterval = '1_weeks' | '2_weeks' | '1_months';

export interface RecurringCandidate {
  /** The title as last logged. */
  title: string;
  interval: DetectedInterval;
  /** Day of month of the latest entry: the anchor a month cycle sticks to. */
  anchorDay: number;
  latestId: string;
  count: number;
  medianAmount: number;
}

/** How many whole months, ending with today's, the detector looks back. */
export const DETECT_MONTHS = 6;
/** Every amount must sit within this share of the median. */
export const AMOUNT_TOLERANCE = 0.15;

const median = (sorted: number[]): number => {
  const n = sorted.length;
  if (n === 0) return 0;
  const mid = Math.floor(n / 2);
  return n % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

const daysBetween = (a: string, b: string): number =>
  Math.round((parseLocalDate(b).getTime() - parseLocalDate(a).getTime()) / 86400000);

/** The cadence a median gap in days reads as, or null. */
export const intervalForGap = (medianGapDays: number): DetectedInterval | null => {
  if (medianGapDays >= 26 && medianGapDays <= 35) return '1_months';
  if (medianGapDays >= 6 && medianGapDays <= 8) return '1_weeks';
  if (medianGapDays >= 13 && medianGapDays <= 15) return '2_weeks';
  return null;
};

/** Entries that could be made recurring: plain spending lines (not already
 *  recurring, not an autopilot instance, not a deposit or a goal
 *  contribution) dated within the last DETECT_MONTHS whole months and not
 *  after [today]. */
const eligible = (e: Expense, today: string): boolean => {
  if (e.isRecurring || e.recurringSourceId) return false;
  if (isDeposit(e) || isGoalContribution(e)) return false;
  if (!e.date || !/^\d{4}-\d{2}-\d{2}$/.test(e.date) || e.date > today) return false;
  const from = addMonthsTo(monthOf(today), -(DETECT_MONTHS - 1));
  return monthOf(e.date) >= from;
};

/**
 * Candidates for "make it recurring", best first (count desc, then title in
 * plain string order). A group of same-titled entries qualifies with at least
 * 3 entries in 3 different months, every amount within 15% of their median,
 * and a median gap between consecutive dates of 26 to 35 days (monthly), 6 to
 * 8 (weekly) or 13 to 15 (every two weeks). [dismissed] holds titles the
 * person said "not this one" to, compared normalized.
 */
export const detectRecurringCandidates = (
  expenses: Expense[],
  today: string,
  dismissed: string[] = []
): RecurringCandidate[] => {
  const skip = new Set(dismissed.map(normalizeTitle).filter(Boolean));
  const groups = new Map<string, Expense[]>();
  for (const e of expenses) {
    if (!eligible(e, today)) continue;
    const key = normalizeTitle(e.title || '');
    if (!key || skip.has(key)) continue;
    const list = groups.get(key);
    if (list) list.push(e);
    else groups.set(key, [e]);
  }
  const out: RecurringCandidate[] = [];
  for (const list of groups.values()) {
    if (list.length < 3) continue;
    const sorted = list
      .slice()
      .sort(
        (a, b) =>
          a.date.localeCompare(b.date) || (a.createdAt || '').localeCompare(b.createdAt || '')
      );
    const months = new Set(sorted.map((e) => monthOf(e.date)));
    if (months.size < 3) continue;
    const amounts = sorted.map((e) => e.amount).sort((a, b) => a - b);
    const med = median(amounts);
    if (med <= 0) continue;
    if (amounts.some((a) => Math.abs(a - med) > med * AMOUNT_TOLERANCE + 1e-9)) continue;
    const gaps: number[] = [];
    for (let i = 1; i < sorted.length; i++)
      gaps.push(daysBetween(sorted[i - 1].date, sorted[i].date));
    const interval = intervalForGap(median(gaps.slice().sort((a, b) => a - b)));
    if (!interval) continue;
    const latest = sorted[sorted.length - 1];
    out.push({
      title: latest.title,
      interval,
      anchorDay: parseLocalDate(latest.date).getDate(),
      latestId: latest.id,
      count: sorted.length,
      medianAmount: roundCurrency(med),
    });
  }
  return out.sort(
    (a, b) => b.count - a.count || (a.title < b.title ? -1 : a.title > b.title ? 1 : 0)
  );
};

/** The patch that turns [expense] into the recurring source: the next date is
 *  one interval after its own date, anchored on [anchorDay] so a month cycle
 *  survives short months. The caller merges it and writes through the normal
 *  encrypted path. */
export const makeRecurring = (
  expense: Pick<Expense, 'date'>,
  interval: DetectedInterval | string,
  anchorDay: number
): Pick<Expense, 'isRecurring' | 'recurringInterval' | 'nextRecurringDate'> => ({
  isRecurring: true,
  recurringInterval: interval,
  nextRecurringDate: advanceIntervalStr(expense.date, interval, anchorDay),
});
