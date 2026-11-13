// Turns the sheets from lib/exportSheets into a file the browser saves. The
// .xlsx writer (exceljs, about 250 KB) loads on first use rather than with the
// app, since most sessions never export. Dates are written as real date cells
// and money as numbers with a two-decimal format, so the file sorts and sums
// the moment it opens.
import { Sheet, toCsv } from './exportSheets';
import { parseLocalDate } from './recurring';

const saveBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Give the click a moment to start before the URL is released.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

/** Excel refuses sheet names over 31 characters or with []:*?/\ in them. */
const safeSheetName = (name: string, index: number): string => {
  const clean = name
    .replace(/[[\]:*?/\\]/g, ' ')
    .trim()
    .slice(0, 31);
  return clean || `Sheet${index + 1}`;
};

export async function downloadXlsx(sheets: Sheet[], filename: string): Promise<void> {
  const ExcelJS = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  sheets.forEach((sheet, i) => {
    const ws = wb.addWorksheet(safeSheetName(sheet.name, i), {
      views: [{ state: 'frozen', ySplit: 1 }],
    });
    ws.columns = sheet.columns.map((c) => ({
      header: c.header,
      key: c.header,
      width: c.type === 'text' ? 24 : 14,
      style:
        c.type === 'date'
          ? { numFmt: 'yyyy-mm-dd' }
          : c.type === 'money'
            ? { numFmt: '#,##0.00' }
            : {},
    }));
    ws.getRow(1).font = { bold: true };
    for (const row of sheet.rows) {
      ws.addRow(
        row.map((v, col) => {
          const type = sheet.columns[col]?.type;
          if (type === 'date' && typeof v === 'string' && v) {
            const d = parseLocalDate(v);
            // UTC midnight: Excel stores dates without a zone, and a local
            // midnight west of Greenwich would land on the day before.
            return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
          }
          return v;
        })
      );
    }
  });
  const buffer = await wb.xlsx.writeBuffer();
  saveBlob(
    new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    filename
  );
}

export function downloadCsv(sheets: Sheet[], filename: string): void {
  // The BOM makes Excel read the file as UTF-8, so accents survive.
  saveBlob(new Blob(['﻿' + toCsv(sheets)], { type: 'text/csv;charset=utf-8' }), filename);
}
