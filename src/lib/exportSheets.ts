// The clean workbook: one sheet per thing the person picked, headers on row
// one, dates as dates, money as numbers, names instead of ids, nothing else.
// This file builds the sheets as plain data from the reports arithmetic
// (exportRows, pivot) and the house account grouping, so the file and the
// screen never disagree; lib/exportDownload.ts turns them into .xlsx or .csv
// in the browser. Pure, checked by scripts/export-check.ts.
import { settlementDay } from './recurring';
import { Expense } from '../types';
import { ReportFilter, exportRows, pivot, Granularity } from './reports';
import { depositsOf } from './deposits';
import { instrumentOf } from './insights';

export type CellType = 'text' | 'date' | 'money' | 'bool';

export interface SheetColumn {
  header: string;
  type: CellType;
}

export type SheetCell = string | number | boolean | null;

export interface Sheet {
  name: string;
  columns: SheetColumn[];
  rows: SheetCell[][];
}

export type ExportKind = 'ledger' | 'pivot' | 'deposits' | 'settlements';

export interface ExportLabels {
  /** Sheet names, one per kind. */
  sheet: Record<ExportKind, string>;
  date: string;
  item: string;
  category: string;
  paidBy: string;
  method: string;
  amount: string;
  yourShare: string;
  status: string;
  recurring: string;
  total: string;
  from: string;
  to: string;
  /** What an empty category is called. */
  uncategorised: string;
  /** A month column header for YYYY-MM. */
  month: (yyyyMm: string) => string;
  /** The payment method's display name for a stored code. */
  methodName: (code: string) => string;
  /** A settlement status's display name. */
  settlementStatus: (status: string) => string;
}

export interface ExportInput {
  expenses: Expense[];
  filter: ReportFilter;
  granularity?: Granularity;
  nameOf: (uid: string) => string;
  statusLabel: (e: Expense) => string;
  labels: ExportLabels;
}

export const ledgerSheet = (input: ExportInput): Sheet => {
  const l = input.labels;
  const rows = exportRows(input.expenses, input.filter, input.nameOf, input.statusLabel);
  return {
    name: l.sheet.ledger,
    columns: [
      { header: l.date, type: 'date' },
      { header: l.item, type: 'text' },
      { header: l.category, type: 'text' },
      { header: l.paidBy, type: 'text' },
      { header: l.method, type: 'text' },
      { header: l.amount, type: 'money' },
      { header: l.yourShare, type: 'money' },
      { header: l.status, type: 'text' },
      { header: l.recurring, type: 'bool' },
    ],
    rows: rows.map((r) => [
      r.date,
      r.item,
      r.category || l.uncategorised,
      r.paidBy,
      l.methodName(r.method),
      r.amount,
      r.yourShare,
      r.status,
      r.recurring,
    ]),
  };
};

export const pivotSheet = (input: ExportInput): Sheet => {
  const l = input.labels;
  const p = pivot(input.expenses, input.filter, input.granularity ?? 'month');
  return {
    name: l.sheet.pivot,
    columns: [
      { header: l.category, type: 'text' },
      ...p.columns.map((c) => ({ header: l.month(c), type: 'money' as CellType })),
      { header: l.total, type: 'money' },
    ],
    rows: [
      ...p.rows.map((r) => [
        r.key || l.uncategorised,
        ...p.columns.map((c) => r.cells[c] ?? 0),
        r.total,
      ]),
      [l.total, ...p.columns.map((c) => p.columnTotals[c] ?? 0), p.grandTotal],
    ],
  };
};

/** Deposits in the period, one row each: deposits are excluded from the
 *  ledger sheet (they are not spending), so this is where they live. */
export const depositsSheet = (input: ExportInput): Sheet => {
  const l = input.labels;
  const rows = depositsOf(input.expenses).filter(
    (d) => d.date >= input.filter.start && d.date <= input.filter.end
  );
  return {
    name: l.sheet.deposits,
    columns: [
      { header: l.date, type: 'date' },
      { header: l.paidBy, type: 'text' },
      { header: l.method, type: 'text' },
      { header: l.amount, type: 'money' },
      { header: l.item, type: 'text' },
    ],
    rows: rows.map((d) => [
      d.date,
      input.nameOf(d.paidBy),
      l.methodName(instrumentOf(d)),
      d.amount,
      d.title,
    ]),
  };
};

/** Every settlement dated in the period on a line the viewer can see, oldest
 *  first: who paid whom, how much, how, and whether it was confirmed. */
export const settlementsSheet = (input: ExportInput): Sheet => {
  const l = input.labels;
  const { start, end, uid } = input.filter;
  const rows: { date: string; cells: SheetCell[] }[] = [];
  for (const e of input.expenses) {
    if (e.splitType === 'dark_cherry' && e.paidBy !== uid) continue;
    for (const s of e.settlements || []) {
      if (s.status === 'voided') continue;
      const date = settlementDay(s);
      if (!date || date < start || date > end) continue;
      rows.push({
        date,
        cells: [
          date,
          e.title,
          input.nameOf(s.paidBy),
          input.nameOf(s.receivedBy),
          s.amount,
          l.methodName(s.instrumentType),
          l.settlementStatus(s.status),
        ],
      });
    }
  }
  rows.sort((a, b) => a.date.localeCompare(b.date));
  return {
    name: l.sheet.settlements,
    columns: [
      { header: l.date, type: 'date' },
      { header: l.item, type: 'text' },
      { header: l.from, type: 'text' },
      { header: l.to, type: 'text' },
      { header: l.amount, type: 'money' },
      { header: l.method, type: 'text' },
      { header: l.status, type: 'text' },
    ],
    rows: rows.map((r) => r.cells),
  };
};

const BUILDERS: Record<ExportKind, (input: ExportInput) => Sheet> = {
  ledger: ledgerSheet,
  pivot: pivotSheet,
  deposits: depositsSheet,
  settlements: settlementsSheet,
};

/** The chosen sheets, in the panel's order. */
export const buildSheets = (kinds: ExportKind[], input: ExportInput): Sheet[] =>
  (['ledger', 'pivot', 'deposits', 'settlements'] as ExportKind[])
    .filter((k) => kinds.includes(k))
    .map((k) => BUILDERS[k](input));

const csvCell = (v: SheetCell): string => {
  if (v === null || v === undefined) return '';
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (typeof v === 'number') return String(v);
  // A title beginning with =, +, - or @ would run as a formula when the file
  // is opened in a spreadsheet; a leading apostrophe makes it plain text.
  const text = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

/** One sheet as CSV text: the header row, then one line per row. Several
 *  sheets are separated by a blank line and start with their own header row,
 *  since a CSV file has no tabs. */
export const toCsv = (sheets: Sheet[]): string =>
  sheets
    .map((s) =>
      [
        s.columns.map((c) => csvCell(c.header)).join(','),
        ...s.rows.map((r) => r.map(csvCell).join(',')),
      ].join('\r\n')
    )
    .join('\r\n\r\n');
