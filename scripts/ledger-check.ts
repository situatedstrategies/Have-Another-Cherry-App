import { splitForArchive, archiveCutoff } from '../src/lib/archive';

const mk = (over: any = {}): any => ({
  id: 'e', groupId: 'g', title: 'T', amount: 10, category: 'C', paidBy: 'a',
  splitType: 'equal', shares: { a: 10 }, status: 'OPEN', settlements: [], comments: [],
  date: '2026-09-05', createdAt: '2026-09-05T00:00:00.000Z', ...over,
});

const now = new Date();
console.log('cutoff:', archiveCutoff(now).toISOString().slice(0, 10));

const cases: [string, any][] = [
  ['today', mk({ date: new Date().toISOString().slice(0, 10) })],
  ['last month', mk({ date: '2026-08-15' })],
  ['a future recurring instance', mk({ date: '2026-09-20' })],
  ['no date', mk({ date: undefined })],
  ['a recurring definition', mk({ isRecurring: true, recurringInterval: 'monthly', date: '2024-01-01' })],
  ['genuinely old', mk({ date: '2024-01-01' })],
];

for (const [name, e] of cases) {
  const s = splitForArchive([e], now);
  const months = Object.keys(s.archived ?? {});
  console.log(
    `${(s.recent?.length ? 'RECENT ' : 'ARCHIVED')}  ${name}` +
    (months.length ? `  -> ${months.join(',')}` : '')
  );
}
