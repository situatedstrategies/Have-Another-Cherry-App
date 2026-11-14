// The member list for email: every account's address from Firebase
// Authentication (the profile only keeps six characters of a hash, which
// cannot be turned back into an address), joined with the two preferences
// on users/{uid}.
//
//   notices    "yes" unless the member turned app notices off in Settings.
//              Send product notices (new features, a change of name, changes
//              to the terms) to these rows only.
//   marketing  "yes" only if the member opted in. Newsletters and offers go
//              to these rows only.
//
// Read-only: it writes one CSV file and changes nothing in Firebase. The file
// holds personal data, so it is written outside the repository by default
// and must not be committed or shared.
//
// Run, signed in with an account that can read the project:
//   gcloud auth application-default login
//   GOOGLE_CLOUD_PROJECT=<project id> npx tsx scripts/export-emails.ts [out.csv]
import { writeFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

const projectId = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT;
initializeApp({ credential: applicationDefault(), ...(projectId ? { projectId } : {}) });

const cell = (v: string): string => {
  // A name is whatever the member typed: keep it from running as a formula.
  const text = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

(async () => {
  const profiles = new Map<string, FirebaseFirestore.DocumentData>();
  for (const doc of (await getFirestore().collection('users').get()).docs) {
    profiles.set(doc.id, doc.data());
  }
  const rows: string[][] = [
    ['email', 'name', 'signed_up', 'email_verified', 'notices', 'marketing', 'language', 'uid'],
  ];
  let total = 0;
  let pageToken: string | undefined;
  do {
    const page = await getAuth().listUsers(1000, pageToken);
    for (const u of page.users) {
      if (!u.email || u.disabled) continue;
      const p = profiles.get(u.uid) || {};
      rows.push([
        u.email,
        String(p.name || u.displayName || ''),
        (u.metadata.creationTime ? new Date(u.metadata.creationTime).toISOString() : '').slice(
          0,
          10
        ),
        u.emailVerified ? 'yes' : 'no',
        p.noticesOptOut === true ? 'no' : 'yes',
        p.marketingOptIn === true ? 'yes' : 'no',
        String(p.locale || ''),
        u.uid,
      ]);
      total++;
    }
    pageToken = page.pageToken;
  } while (pageToken);

  const out =
    process.argv[2] ||
    join(homedir(), `two-cherries-emails-${new Date().toISOString().slice(0, 10)}.csv`);
  writeFileSync(out, rows.map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n', { mode: 0o600 });
  const notices = rows.slice(1).filter((r) => r[4] === 'yes').length;
  const marketing = rows.slice(1).filter((r) => r[5] === 'yes').length;
  console.log(`${total} accounts written to ${out}`);
  console.log(`${notices} receive app notices, ${marketing} opted in to newsletters and offers`);
})().catch((e) => {
  console.error('Export failed:', e?.message || e);
  process.exit(1);
});
