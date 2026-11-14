// Reports: where the money went, for any period, in two views. Household is
// the whole ledger at full amounts; Personal is one member's share of each
// line, which is what the itemized ledger makes possible and a bank feed
// cannot. Nothing here is stored; every function is pure over the expenses it
// is handed. Mirrored in the Flutter app's domain/ledger/reports.dart and
// checked by scripts/reports-check.ts (`npm run test:parity`).
//
// Dates are the ledger's local YYYY-MM-DD strings, compared as strings. Weeks
// start on Monday, like the spending thresholds.
import { Expense } from '../types';
import {
  roundCurrency,
  isDarkCherry,
  isDeposit,
  isGoalContribution,
  getNormalizedExpenseStatus,
} from './money';
import { getInstrumentClass } from './mismatch';
import { instrumentOf } from './insights';
import { parseLocalDate, settlementDay, toLocalIso } from './recurring';

export type ReportView = 'household' | 'personal';
export type Granularity = 'day' | 'week' | 'month';
export type RecurringFilter = 'all' | 'recurring' | 'oneoff';
export type StatusFilter = 'all' | 'open' | 'settled';
export type PeriodKey = 'this_month' | 'last_month' | 'this_week' | '3m' | '6m' | '1y';

export interface ReportFilter {
  /** Inclusive local dates. */
  start: string;
  end: string;
  view: ReportView;
  /** The viewer. Personal view reads their share; both views hide other
   *  people's Dark Cherry pots, like the stats screens do. */
  uid: string;
  categories?: string[];
  payers?: string[];
  recurring?: RecurringFilter;
  status?: StatusFilter;
}

export interface Period {
  start: string;
  end: string;
}

const pad = (n: number): string => String(n).padStart(2, '0');

const lastDayOfMonth = (year: number, monthIndex: number): number =>
  new Date(year, monthIndex + 1, 0).getDate();

const addMonths = (
  year: number,
  monthIndex: number,
  delta: number
): { year: number; monthIndex: number } => {
  const total = year * 12 + monthIndex + delta;
  return { year: Math.floor(total / 12), monthIndex: ((total % 12) + 12) % 12 };
};

/** The Monday on or before [iso]. */
export const weekStart = (iso: string): string => {
  const d = parseLocalDate(iso);
  const back = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - back);
  return toLocalIso(d);
};

export const monthKey = (iso: string): string => iso.slice(0, 7);

/** The bounds of a named period, relative to [today]. Month periods are
 *  whole calendar months; 3m, 6m and 1y are that many whole months ending
 *  with the current one, so "6M" is the same window the trends chart uses. */
export const periodBounds = (key: PeriodKey, today: string): Period => {
  const t = parseLocalDate(today);
  const y = t.getFullYear();
  const m = t.getMonth();
  const monthRange = (fromDelta: number): Period => {
    const from = addMonths(y, m, fromDelta);
    return {
      start: `${from.year}-${pad(from.monthIndex + 1)}-01`,
      end: `${y}-${pad(m + 1)}-${pad(lastDayOfMonth(y, m))}`,
    };
  };
  switch (key) {
    case 'this_month':
      return monthRange(0);
    case 'last_month': {
      const prev = addMonths(y, m, -1);
      return {
        start: `${prev.year}-${pad(prev.monthIndex + 1)}-01`,
        end: `${prev.year}-${pad(prev.monthIndex + 1)}-${pad(lastDayOfMonth(prev.year, prev.monthIndex))}`,
      };
    }
    case 'this_week': {
      const start = weekStart(today);
      const e = parseLocalDate(start);
      e.setDate(e.getDate() + 6);
      return { start, end: toLocalIso(e) };
    }
    case '3m':
      return monthRange(-2);
    case '6m':
      return monthRange(-5);
    case '1y':
      return monthRange(-11);
  }
};

/** The period of the same length ending the day before [p] starts. Whole
 *  months stay whole months, so last month's comparison is the month before
 *  it rather than 30 days before it. */
export const previousPeriod = (p: Period): Period => {
  const s = parseLocalDate(p.start);
  const e = parseLocalDate(p.end);
  const wholeMonths =
    s.getDate() === 1 && e.getDate() === lastDayOfMonth(e.getFullYear(), e.getMonth());
  if (wholeMonths) {
    const months = (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth()) + 1;
    const from = addMonths(s.getFullYear(), s.getMonth(), -months);
    const to = addMonths(s.getFullYear(), s.getMonth(), -1);
    return {
      start: `${from.year}-${pad(from.monthIndex + 1)}-01`,
      end: `${to.year}-${pad(to.monthIndex + 1)}-${pad(lastDayOfMonth(to.year, to.monthIndex))}`,
    };
  }
  const days = Math.round((e.getTime() - s.getTime()) / 86400000) + 1;
  const prevEnd = new Date(s);
  prevEnd.setDate(prevEnd.getDate() - 1);
  const prevStart = new Date(prevEnd);
  prevStart.setDate(prevStart.getDate() - days + 1);
  return { start: toLocalIso(prevStart), end: toLocalIso(prevEnd) };
};

export const isRecurringLine = (e: Expense): boolean => !!e.isRecurring || !!e.recurringSourceId;

/** What one line counts for in the chosen view. */
export const reportAmount = (e: Expense, filter: Pick<ReportFilter, 'view' | 'uid'>): number =>
  filter.view === 'household' ? e.amount : (e.shares?.[filter.uid] ?? 0);

/** The lines a report runs over: in the period, visible to the viewer, and
 *  matching every optional filter. The date range is the only required one.
 *  House account deposits and goal contributions are never spending, so they
 *  are left out here and therefore out of every report built on this. */
export const applyFilter = (expenses: Expense[], filter: ReportFilter): Expense[] => {
  const cats = filter.categories && filter.categories.length ? new Set(filter.categories) : null;
  const payers = filter.payers && filter.payers.length ? new Set(filter.payers) : null;
  return expenses.filter((e) => {
    if (!e.date || e.date < filter.start || e.date > filter.end) return false;
    if (isDeposit(e) || isGoalContribution(e)) return false;
    if (isDarkCherry(e) && e.paidBy !== filter.uid) return false;
    if (cats && !cats.has(e.category)) return false;
    if (payers && !payers.has(e.paidBy)) return false;
    const rec = isRecurringLine(e);
    if (filter.recurring === 'recurring' && !rec) return false;
    if (filter.recurring === 'oneoff' && rec) return false;
    if (filter.status && filter.status !== 'all') {
      const closed = getNormalizedExpenseStatus(e) === 'CLOSED';
      if (filter.status === 'settled' && !closed) return false;
      if (filter.status === 'open' && closed) return false;
    }
    return true;
  });
};

const sumOf = (expenses: Expense[], filter: Pick<ReportFilter, 'view' | 'uid'>): number =>
  roundCurrency(expenses.reduce((t, e) => t + reportAmount(e, filter), 0));

export interface Totals {
  total: number;
  count: number;
  /** Days of the period that have happened, so the average is honest mid-month. */
  daysElapsed: number;
  perDay: number;
  previousTotal: number;
  change: number;
  /** Percent, rounded to a whole number; null when there was nothing before. */
  changePct: number | null;
}

/** Totals for the filtered period, against the same filter run over the
 *  previous period of the same length. [today] clamps the day count. */
export const totals = (expenses: Expense[], filter: ReportFilter, today: string): Totals => {
  const current = applyFilter(expenses, filter);
  const prev = previousPeriod({ start: filter.start, end: filter.end });
  const previous = applyFilter(expenses, { ...filter, start: prev.start, end: prev.end });
  const total = sumOf(current, filter);
  const previousTotal = sumOf(previous, filter);
  const endForDays = filter.end < today ? filter.end : today;
  const daysElapsed = Math.max(
    1,
    Math.round(
      (parseLocalDate(endForDays).getTime() - parseLocalDate(filter.start).getTime()) / 86400000
    ) + 1
  );
  const change = roundCurrency(total - previousTotal);
  return {
    total,
    count: current.length,
    daysElapsed,
    perDay: roundCurrency(total / daysElapsed),
    previousTotal,
    change,
    changePct: previousTotal > 0 ? Math.round((change / previousTotal) * 100) : null,
  };
};

export interface CategoryRow {
  category: string;
  total: number;
  /** 0..1 of the grand total. */
  share: number;
  previousTotal: number;
  change: number;
}

const groupBy = (
  expenses: Expense[],
  filter: Pick<ReportFilter, 'view' | 'uid'>,
  keyOf: (e: Expense) => string
): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const e of expenses) {
    const k = keyOf(e);
    out[k] = roundCurrency((out[k] ?? 0) + reportAmount(e, filter));
  }
  return out;
};

export const UNCATEGORISED = '';

/** Ranked categories with their share and the change against the previous
 *  period. An empty category name is kept as the empty string; the UI gives
 *  it its own label. */
export const byCategory = (expenses: Expense[], filter: ReportFilter): CategoryRow[] => {
  const current = groupBy(applyFilter(expenses, filter), filter, (e) => (e.category || '').trim());
  const prev = previousPeriod({ start: filter.start, end: filter.end });
  const previous = groupBy(
    applyFilter(expenses, { ...filter, start: prev.start, end: prev.end }),
    filter,
    (e) => (e.category || '').trim()
  );
  const grand = Object.values(current).reduce((t, v) => t + v, 0);
  return Object.entries(current)
    .map(([category, total]) => ({
      category,
      total,
      share: grand > 0 ? total / grand : 0,
      previousTotal: previous[category] ?? 0,
      change: roundCurrency(total - (previous[category] ?? 0)),
    }))
    .sort((a, b) => b.total - a.total || a.category.localeCompare(b.category));
};

/** The bucket a date falls in at a granularity: the day, the Monday of its
 *  week, or YYYY-MM. */
export const bucketOf = (iso: string, granularity: Granularity): string =>
  granularity === 'day' ? iso : granularity === 'week' ? weekStart(iso) : monthKey(iso);

/** Every bucket from the period start to its end, in order, so charts show
 *  the quiet weeks as zero rather than skipping them. */
export const bucketsFor = (period: Period, granularity: Granularity): string[] => {
  const out: string[] = [];
  if (granularity === 'month') {
    const s = parseLocalDate(period.start);
    const e = parseLocalDate(period.end);
    let y = s.getFullYear();
    let m = s.getMonth();
    while (y < e.getFullYear() || (y === e.getFullYear() && m <= e.getMonth())) {
      out.push(`${y}-${pad(m + 1)}`);
      const n = addMonths(y, m, 1);
      y = n.year;
      m = n.monthIndex;
    }
    return out;
  }
  const step = granularity === 'week' ? 7 : 1;
  const d = parseLocalDate(granularity === 'week' ? weekStart(period.start) : period.start);
  const end = parseLocalDate(period.end);
  while (d.getTime() <= end.getTime()) {
    out.push(toLocalIso(d));
    d.setDate(d.getDate() + step);
  }
  return out;
};

export interface TimePoint {
  bucket: string;
  total: number;
  /** The matching bucket of the previous period, for the compare overlay. */
  previousTotal: number;
}

/** The period split into days, weeks or months, zero-filled, with the
 *  previous period lined up bucket for bucket. */
export const overTime = (
  expenses: Expense[],
  filter: ReportFilter,
  granularity: Granularity
): TimePoint[] => {
  const period = { start: filter.start, end: filter.end };
  const prev = previousPeriod(period);
  const current = groupBy(applyFilter(expenses, filter), filter, (e) =>
    bucketOf(e.date, granularity)
  );
  const previous = groupBy(
    applyFilter(expenses, { ...filter, start: prev.start, end: prev.end }),
    filter,
    (e) => bucketOf(e.date, granularity)
  );
  const prevBuckets = bucketsFor(prev, granularity);
  return bucketsFor(period, granularity).map((bucket, i) => ({
    bucket,
    total: current[bucket] ?? 0,
    previousTotal: previous[prevBuckets[i] ?? ''] ?? 0,
  }));
};

export interface CategoryTimePoint {
  bucket: string;
  values: Record<string, number>;
}

export interface CategoryTimeline {
  /** The categories carried, largest first; everything else is "other". */
  categories: string[];
  points: CategoryTimePoint[];
}

export const OTHER_CATEGORY = '__other__';

/** The top [limit] categories over time, the rest folded into one bucket. */
export const categoryOverTime = (
  expenses: Expense[],
  filter: ReportFilter,
  granularity: Granularity,
  limit = 5
): CategoryTimeline => {
  const lines = applyFilter(expenses, filter);
  const top = byCategory(lines, filter)
    .slice(0, limit)
    .map((r) => r.category);
  const keep = new Set(top);
  const byBucket: Record<string, Record<string, number>> = {};
  for (const e of lines) {
    const b = bucketOf(e.date, granularity);
    const c = (e.category || '').trim();
    const key = keep.has(c) ? c : OTHER_CATEGORY;
    byBucket[b] = byBucket[b] || {};
    byBucket[b][key] = roundCurrency((byBucket[b][key] ?? 0) + reportAmount(e, filter));
  }
  return {
    categories: top,
    points: bucketsFor({ start: filter.start, end: filter.end }, granularity).map((bucket) => ({
      bucket,
      values: byBucket[bucket] ?? {},
    })),
  };
};

export interface PersonRow {
  uid: string;
  /** Household: what they paid out. Personal: what they fronted for the viewer. */
  paid: number;
  /** Household: the sum of their shares. Personal: unused, 0. */
  responsible: number;
}

/** Household view: who paid how much and who was responsible for how much.
 *  Personal view: how much of the viewer's share each other member fronted. */
export const byPerson = (
  expenses: Expense[],
  filter: ReportFilter,
  memberIds: string[]
): PersonRow[] => {
  const lines = applyFilter(expenses, filter);
  const paid: Record<string, number> = {};
  const responsible: Record<string, number> = {};
  for (const e of lines) {
    if (filter.view === 'household') {
      paid[e.paidBy] = roundCurrency((paid[e.paidBy] ?? 0) + e.amount);
      for (const [uid, share] of Object.entries(e.shares || {})) {
        responsible[uid] = roundCurrency((responsible[uid] ?? 0) + share);
      }
    } else if (e.paidBy !== filter.uid) {
      paid[e.paidBy] = roundCurrency((paid[e.paidBy] ?? 0) + (e.shares?.[filter.uid] ?? 0));
    }
  }
  const ids = new Set([...memberIds, ...Object.keys(paid), ...Object.keys(responsible)]);
  return [...ids]
    .filter((uid) => uid && (filter.view === 'household' || uid !== filter.uid))
    .map((uid) => ({ uid, paid: paid[uid] ?? 0, responsible: responsible[uid] ?? 0 }))
    .sort((a, b) => b.paid - a.paid || a.uid.localeCompare(b.uid));
};

/** How the filtered lines were paid, in the chosen view. */
export const byInstrument = (expenses: Expense[], filter: ReportFilter): Record<string, number> =>
  groupBy(applyFilter(expenses, filter), filter, instrumentOf);

export interface RecurringSplit {
  recurring: number;
  oneOff: number;
  /** Distinct recurring sources with a line in the period. */
  sources: number;
}

export const recurringSplit = (expenses: Expense[], filter: ReportFilter): RecurringSplit => {
  let recurring = 0;
  let oneOff = 0;
  const sources = new Set<string>();
  for (const e of applyFilter(expenses, filter)) {
    const v = reportAmount(e, filter);
    if (isRecurringLine(e)) {
      recurring += v;
      sources.add(e.recurringSourceId || e.id);
    } else {
      oneOff += v;
    }
  }
  return {
    recurring: roundCurrency(recurring),
    oneOff: roundCurrency(oneOff),
    sources: sources.size,
  };
};

/** The largest lines in the period, in the chosen view. */
export const topExpenses = (expenses: Expense[], filter: ReportFilter, limit = 10): Expense[] =>
  applyFilter(expenses, filter)
    .slice()
    .sort(
      (a, b) => reportAmount(b, filter) - reportAmount(a, filter) || a.date.localeCompare(b.date)
    )
    .slice(0, limit);

export interface PivotRow {
  key: string;
  cells: Record<string, number>;
  total: number;
}

export interface Pivot {
  columns: string[];
  rows: PivotRow[];
  columnTotals: Record<string, number>;
  grandTotal: number;
}

/** Categories down, time buckets across, totals both ways: the sheet view of
 *  a report, and the shape the workbook export writes. */
export const pivot = (
  expenses: Expense[],
  filter: ReportFilter,
  granularity: Granularity = 'month'
): Pivot => {
  const columns = bucketsFor({ start: filter.start, end: filter.end }, granularity);
  const rowsByKey: Record<string, PivotRow> = {};
  const columnTotals: Record<string, number> = {};
  for (const c of columns) columnTotals[c] = 0;
  let grandTotal = 0;
  for (const e of applyFilter(expenses, filter)) {
    const key = (e.category || '').trim();
    const col = bucketOf(e.date, granularity);
    const v = reportAmount(e, filter);
    const row = (rowsByKey[key] ||= { key, cells: {}, total: 0 });
    row.cells[col] = roundCurrency((row.cells[col] ?? 0) + v);
    row.total = roundCurrency(row.total + v);
    columnTotals[col] = roundCurrency((columnTotals[col] ?? 0) + v);
    grandTotal = roundCurrency(grandTotal + v);
  }
  const rows = Object.values(rowsByKey).sort(
    (a, b) => b.total - a.total || a.key.localeCompare(b.key)
  );
  return { columns, rows, columnTotals, grandTotal };
};

export interface ExportRow {
  date: string;
  item: string;
  category: string;
  paidBy: string;
  method: string;
  amount: number;
  yourShare: number;
  status: string;
  recurring: boolean;
}

/** One plain row per line for a spreadsheet: dates as dates, money as
 *  numbers, names instead of ids, nothing else. */
export const exportRows = (
  expenses: Expense[],
  filter: ReportFilter,
  nameOf: (uid: string) => string,
  statusLabel: (e: Expense) => string
): ExportRow[] =>
  applyFilter(expenses, filter)
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt))
    .map((e) => ({
      date: e.date,
      item: e.title,
      category: (e.category || '').trim(),
      paidBy: nameOf(e.paidBy),
      method: instrumentOf(e),
      amount: e.amount,
      yourShare: e.shares?.[filter.uid] ?? 0,
      status: statusLabel(e),
      recurring: isRecurringLine(e),
    }));

export interface FrontedRow {
  uid: string;
  /** Fronted on a credit card, still being carried until the statement. */
  credit: number;
  /** Fronted with money already gone: cash, debit, a transfer, Venmo, Zelle. */
  ownMoney: number;
  /** 'OTHER' or never recorded. */
  unknown: number;
  total: number;
}

/** Who fronted what, split by how: in Household view each payer's whole
 *  amounts, in Personal view the viewer's share of what each other member
 *  fronted. Members with nothing fronted stay in the list at zero so the
 *  bars line up with the roster. */
export const frontedBy = (
  expenses: Expense[],
  filter: ReportFilter,
  memberIds: string[]
): FrontedRow[] => {
  const rows: Record<string, FrontedRow> = {};
  const rowFor = (uid: string) =>
    (rows[uid] ||= { uid, credit: 0, ownMoney: 0, unknown: 0, total: 0 });
  for (const uid of memberIds) if (uid) rowFor(uid);
  for (const e of applyFilter(expenses, filter)) {
    if (!e.paidBy) continue;
    if (filter.view === 'personal' && e.paidBy === filter.uid) continue;
    const v = reportAmount(e, filter);
    if (v <= 0) continue;
    const row = rowFor(e.paidBy);
    const instrument = instrumentOf(e);
    const cls =
      instrument === 'UNKNOWN'
        ? null
        : getInstrumentClass(instrument as Parameters<typeof getInstrumentClass>[0]);
    if (cls === 'DEFERRED') row.credit = roundCurrency(row.credit + v);
    else if (cls === 'IMMEDIATE') row.ownMoney = roundCurrency(row.ownMoney + v);
    else row.unknown = roundCurrency(row.unknown + v);
    row.total = roundCurrency(row.total + v);
  }
  return Object.values(rows)
    .filter((r) => filter.view === 'household' || r.uid !== filter.uid)
    .sort((a, b) => b.total - a.total || a.uid.localeCompare(b.uid));
};

/** The percent change of each pivot column against the one before it, as a
 *  whole number; null for the first column and where the previous column was
 *  zero. The grid's "Change" row. */
export const columnChanges = (p: Pivot): (number | null)[] =>
  p.columns.map((col, i) => {
    if (i === 0) return null;
    const prev = p.columnTotals[p.columns[i - 1]] ?? 0;
    if (prev <= 0) return null;
    return Math.round((((p.columnTotals[col] ?? 0) - prev) / prev) * 100);
  });

export interface MonthlyStats {
  months: number;
  perMonth: number;
  high: number;
  low: number;
}

/** The average, highest and lowest whole month over the period, for the
 *  totals strip. Months with nothing count as zero, like the chart shows. */
export const monthlyStats = (expenses: Expense[], filter: ReportFilter): MonthlyStats => {
  const points = overTime(expenses, filter, 'month');
  const values = points.map((p) => p.total);
  const total = roundCurrency(values.reduce((t, v) => t + v, 0));
  const months = Math.max(1, values.length);
  return {
    months,
    perMonth: roundCurrency(total / months),
    high: values.length ? Math.max(...values) : 0,
    low: values.length ? Math.min(...values) : 0,
  };
};

/** The mean number of days from an expense's date to each confirmed payment
 *  on it (the payment date when recorded, else the day it was logged), as a
 *  whole number; null when nothing has been paid. The "average settlement
 *  every N days" line. */
export const averageDaysToSettle = (expenses: Expense[]): number | null => {
  let total = 0;
  let n = 0;
  for (const e of expenses) {
    if (!e.date) continue;
    for (const s of e.settlements || []) {
      if (s.status !== 'confirmed') continue;
      const paid = settlementDay(s);
      if (!paid) continue;
      const days = Math.round(
        (parseLocalDate(paid).getTime() - parseLocalDate(e.date).getTime()) / 86400000
      );
      total += Math.max(0, days);
      n++;
    }
  }
  return n === 0 ? null : Math.round(total / n);
};
