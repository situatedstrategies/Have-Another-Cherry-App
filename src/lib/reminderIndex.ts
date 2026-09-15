// The only thing the server is allowed to know about upcoming bills.
//
// A reminder has to fire when nobody has the app open, which makes it a
// server job. But the ledger and the Vault are encrypted client-side, so the
// client publishes a deliberately impoverished index: a date, an opaque id,
// and which screen to open. No names, no amounts, no categories, no vendor.
// Port of the iOS `lib/domain/vault/reminder_index.dart`; change together.

import { Expense, VaultBill, VaultData } from '../types';

export type ReminderTarget = 'bill' | 'recurring';

export interface ReminderEntry {
  id: string;
  dueDate: string; // YYYY-MM-DD, never a time of day
  target: ReminderTarget;
}

const iso = (d: Date) =>
  `${d.getFullYear().toString().padStart(4, '0')}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`;

const dayOnly = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** A date-only string is a calendar day, not an instant: parse it as local
 *  so "2026-09-05" is the 5th everywhere rather than UTC midnight. */
const parseDay = (raw: string): Date | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
};

/** The next calendar date a bill falls due, this month or next, clamped to
 *  the month's length. Today counts as due, not missed. */
export const nextVaultBillDate = (bill: VaultBill, from: Date = new Date()): Date | null => {
  const today = dayOnly(from);
  if (!(bill.dueDay >= 1 && bill.dueDay <= 31)) return null;
  for (let offset = 0; offset <= 1; offset++) {
    const month = new Date(today.getFullYear(), today.getMonth() + offset, 1);
    const lastDay = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    const candidate = new Date(
      month.getFullYear(),
      month.getMonth(),
      Math.min(Math.max(bill.dueDay, 1), lastDay)
    );
    if (candidate.getTime() >= today.getTime()) return candidate;
  }
  return null;
};

export const buildReminderIndex = (
  expenses: Expense[],
  vault: VaultData | null | undefined,
  opts: { days?: number; now?: Date } = {}
): ReminderEntry[] => {
  const today = dayOnly(opts.now ?? new Date());
  const horizon = new Date(today.getTime() + (opts.days ?? 45) * 86400000);
  const out: ReminderEntry[] = [];
  for (const bill of vault?.bills || []) {
    const due = nextVaultBillDate(bill, today);
    if (!due || due.getTime() > horizon.getTime()) continue;
    out.push({ id: bill.id, dueDate: iso(due), target: 'bill' });
  }
  for (const e of expenses) {
    if (!e.isRecurring) continue;
    const next = e.nextRecurringDate ? parseDay(e.nextRecurringDate) : null;
    if (!next) continue;
    const due = dayOnly(next);
    if (due.getTime() < today.getTime() || due.getTime() > horizon.getTime()) continue;
    out.push({ id: e.id, dueDate: iso(due), target: 'recurring' });
  }
  return out.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
};

/** Stable across ordering; an unchanged index means no write. */
export const reminderIndexSignature = (entries: ReminderEntry[]): string =>
  entries
    .map((e) => `${e.dueDate}|${e.target}|${e.id}`)
    .sort()
    .join(',');
