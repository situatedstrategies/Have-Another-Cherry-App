// Six-month cloud archive, a port of the Flutter client's archive.dart that
// must stay behaviourally identical: both clients write the same documents, so
// if they disagree about "old", each un-archives what the other just archived.

import { Expense } from '../types';

// Stated in the privacy policy and mirrored by the Flutter client's
// archiveAfterMonths; all three have to agree.
export const ARCHIVE_AFTER_MONTHS = 6;

/**
 * The first date that still counts as recent. Calendar arithmetic rather than
 * `now - 182 days`, which lands an hour short across a DST change; floored to
 * the start of the day so the boundary does not drift during a session.
 */
export function archiveCutoff(now: Date = new Date()): Date {
  return new Date(now.getFullYear(), now.getMonth() - ARCHIVE_AFTER_MONTHS, now.getDate());
}

/** The archive document key for a date, zero-padded so ids sort chronologically. */
export function archiveMonthKey(date: Date): string {
  const year = String(date.getFullYear()).padStart(4, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

/** Parses a key produced by archiveMonthKey. Null if it is not one. */
export function parseArchiveMonthKey(key: string): Date | null {
  const parts = key.split('-');
  if (parts.length !== 2) return null;
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  if (!Number.isInteger(year) || !Number.isInteger(month)) return null;
  if (month < 1 || month > 12) return null;
  return new Date(year, month - 1, 1);
}

/** An expense's date, or null. Undated rows stay hot forever: archived, they
 *  would have no month key under which anyone could ask for them back. */
function expenseDate(expense: Expense): Date | null {
  const raw = (expense.date || '').trim();
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export interface ArchiveSplit {
  recent: Expense[];
  /** Grouped by archiveMonthKey. */
  byMonth: Record<string, Expense[]>;
  hasArchive: boolean;
}

/** Splits expenses into the half that stays hot and the half that goes cold.
 *  Recurring definitions are never archived, whatever their age. */
export function splitForArchive(expenses: Expense[], now: Date = new Date()): ArchiveSplit {
  const cutoff = archiveCutoff(now);
  const recent: Expense[] = [];
  const byMonth: Record<string, Expense[]> = {};

  for (const expense of expenses) {
    const date = expenseDate(expense);
    if (date === null || expense.isRecurring === true || !(date < cutoff)) {
      recent.push(expense);
      continue;
    }
    const key = archiveMonthKey(date);
    (byMonth[key] ||= []).push(expense);
  }

  return { recent, byMonth, hasArchive: Object.keys(byMonth).length > 0 };
}

/** Whether a month is old enough that its entries live in the archive. */
export function isArchivedMonth(month: Date, now: Date = new Date()): boolean {
  const cutoff = archiveCutoff(now);
  // A month is fully archived once its last day is before the cutoff.
  const lastDay = new Date(month.getFullYear(), month.getMonth() + 1, 0);
  return lastDay < cutoff;
}
