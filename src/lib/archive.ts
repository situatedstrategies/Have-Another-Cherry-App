// Six-month cloud archive: which entries stay in the main snapshot, which move
// to cold storage, and how the cold half is grouped.
//
// This is a port of the Flutter client's lib/domain/ledger/archive.dart and it
// has to stay behaviourally identical. Both clients write the same
// group_ledgers document and the same archive subcollection, so if they
// disagree about what "old" means, one of them un-archives what the other just
// archived, every sync, forever.
//
// Before this existed the web client had no idea the archive was there. It
// read only the main document, so once an iOS user crossed the six-month
// boundary the older half of the ledger simply stopped appearing on the web.
//
// Deliberately pure. Deciding what is old is the part worth testing, and it
// should not need Firestore to do it.

import { Expense } from '../types';

/// How much history stays hot. Stated publicly in the privacy policy, so this
/// constant and that document have to agree. Matches archiveAfterMonths in the
/// Flutter client.
export const ARCHIVE_AFTER_MONTHS = 6;

/**
 * The first date that still counts as recent.
 *
 * Calendar arithmetic, not `now - 182 days`. A duration is absolute time, so
 * subtracting six months' worth of hours across a daylight saving change lands
 * an hour short and floors to the previous day, quietly moving the boundary.
 *
 * Floored to the start of the day so the boundary does not drift during a
 * session and shuffle an entry between hot and cold while the app is open.
 *
 * Day overflow normalises forward in both languages: six months before 31
 * August is 31 February, which becomes 3 March. That errs toward keeping
 * entries hot, which is the safe direction.
 */
export function archiveCutoff(now: Date = new Date()): Date {
  return new Date(now.getFullYear(), now.getMonth() - ARCHIVE_AFTER_MONTHS, now.getDate());
}

/**
 * The archive document key for a date: `2026-03`.
 *
 * Zero-padded so keys sort lexicographically in the same order they sort
 * chronologically, which is what lets a range query on document id work
 * without a separate index.
 */
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

/**
 * An expense's date, or null when it is missing or unparseable.
 *
 * A row with no usable date must never be archived: it would vanish from the
 * main snapshot and there would be no month key under which anyone could ask
 * for it back. Undated rows stay hot forever, which is the safe way to fail.
 */
export function expenseDate(expense: Expense): Date | null {
  const raw = (expense.date || '').trim();
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export interface ArchiveSplit {
  /** Stays in the main encrypted snapshot. */
  recent: Expense[];
  /** Moves to cold storage, grouped by archiveMonthKey. */
  byMonth: Record<string, Expense[]>;
  hasArchive: boolean;
}

/**
 * Splits expenses into the half that stays hot and the half that goes cold.
 *
 * Recurring expenses are never archived regardless of age. A monthly bill set
 * up two years ago is still the live definition of what gets logged next
 * month, so archiving it would break the ledger going forward rather than just
 * hiding history.
 */
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
