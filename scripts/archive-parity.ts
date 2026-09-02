// Parity check for src/lib/archive.ts against the Flutter client's
// test/archive_test.dart. Same cases, same expected answers. Run with tsx.
import {
  archiveCutoff, archiveMonthKey, parseArchiveMonthKey,
  splitForArchive, isArchivedMonth,
} from '../src/lib/archive';

let failures = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g !== w) { failures++; console.log(`FAIL ${name}\n  got  ${g}\n  want ${w}`); }
  else console.log(`ok   ${name}`);
};
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const exp = (id: string, date: string, extra: any = {}) => ({ id, date, ...extra }) as any;

// archiveCutoff
eq('six calendar months back', iso(archiveCutoff(new Date(2026, 8, 2))), '2026-03-02');
// DST: the US spring-forward is in March. 6 months before 2026-09-02 must stay the 2nd.
eq('unmoved by DST', iso(archiveCutoff(new Date(2026, 8, 2, 23, 59))), '2026-03-02');
// day overflow normalises forward, keeping entries hot
eq('day overflow forward', iso(archiveCutoff(new Date(2026, 7, 31))), '2026-03-03');
// does not drift within a day
eq('no intra-day drift',
   iso(archiveCutoff(new Date(2026, 8, 2, 0, 1))) === iso(archiveCutoff(new Date(2026, 8, 2, 23, 59))) ? 'same' : 'drifted',
   'same');

// month keys
eq('zero padded', archiveMonthKey(new Date(2026, 2, 5)), '2026-03');
eq('sorts chronologically', ['2026-10','2026-03','2026-01'].sort(), ['2026-01','2026-03','2026-10']);
eq('round trip', archiveMonthKey(parseArchiveMonthKey('2026-03')!), '2026-03');
eq('rejects nonsense', parseArchiveMonthKey('2026-13'), null);

// splitForArchive
const now = new Date(2026, 8, 2);
const recentOne = exp('r', '2026-08-01');
const oldOne    = exp('o', '2025-12-11');
const older     = exp('o2', '2025-12-28');
const otherMon  = exp('o3', '2026-01-04');
const recurring = exp('rec', '2020-01-01', { isRecurring: true });
const undated   = exp('u', '');

const s = splitForArchive([recentOne, oldOne, older, otherMon, recurring, undated], now);
eq('keeps recent hot', s.recent.map((e:any)=>e.id).sort(), ['r','rec','u']);
eq('groups by month', Object.keys(s.byMonth).sort(), ['2025-12','2026-01']);
eq('groups contents', s.byMonth['2025-12'].map((e:any)=>e.id).sort(), ['o','o2']);
eq('never archives recurring', s.recent.some((e:any)=>e.id==='rec'), true);
eq('never archives undated', s.recent.some((e:any)=>e.id==='u'), true);

// loses nothing
const all = [recentOne, oldOne, older, otherMon, recurring, undated];
const landed = s.recent.length + Object.values(s.byMonth).reduce((n,v)=>n+v.length,0);
eq('loses nothing', landed, all.length);

// isArchivedMonth: true only once the whole month is past the cutoff
eq('current month not archived', isArchivedMonth(new Date(2026, 8, 1), now), false);
eq('month straddling cutoff not archived', isArchivedMonth(new Date(2026, 2, 1), now), false);
eq('fully past month archived', isArchivedMonth(new Date(2026, 0, 1), now), true);

console.log(failures === 0 ? '\nALL PARITY CHECKS PASSED' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
