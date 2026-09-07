// Wipe the BETA project: every Firestore document and every Auth user.
//
// Beta lives in its own Firebase project (have-another-cherry-beta) with its
// own Firestore and its own Auth user pool, so this can never touch a real
// ledger. The script still refuses to run against anything but the beta
// project id, and refuses outright if the production id is ever passed.
//
// One-time setup (needs Owner or Firebase Admin on the beta project):
//   gcloud auth application-default login
//
// Then:
//   npm run wipe:beta -- --dry-run    # counts only, deletes nothing
//   npm run wipe:beta -- --yes        # deletes everything
//
// What it deletes: every root collection (groups, users, group_ledgers,
// group_vault, transfer_queue, reminder_schedules, group_mismatches,
// user_reflections, group_reflections, profile_log, ...) including
// subcollections, and every Authentication user, whichever provider they
// signed in with (email, Google, Apple). Auth users are the "ghost accounts":
// deleting a users/{uid} document in Firestore does not delete the sign-in
// account, and a sign-in account with no users/{uid} document lands on the
// group setup screen as if it were brand new.
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

const BETA_PROJECT = 'have-another-cherry-beta';
const PRODUCTION_PROJECT = 'gen-lang-client-0987674990';

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const dryRun = flag('--dry-run');
const confirmed = flag('--yes');
const requested =
  args[args.indexOf('--project') + 1] ||
  process.env.GOOGLE_CLOUD_PROJECT ||
  process.env.GCLOUD_PROJECT ||
  BETA_PROJECT;

if (requested === PRODUCTION_PROJECT) {
  console.error('Refusing: that is the PRODUCTION project. This script only ever wipes beta.');
  process.exit(2);
}
if (requested !== BETA_PROJECT) {
  console.error(`Refusing: project "${requested}" is not the beta project (${BETA_PROJECT}).`);
  process.exit(2);
}
if (!dryRun && !confirmed) {
  console.error('Nothing done. Pass --dry-run to count, or --yes to delete everything in beta.');
  process.exit(2);
}

initializeApp({ credential: applicationDefault(), projectId: BETA_PROJECT });
const db = getFirestore();
const auth = getAuth();

async function countTree(path: string): Promise<number> {
  // Root-collection document counts only (subcollections are deleted along
  // with their parents by recursiveDelete). Enough to sanity-check the target.
  const agg = await db.collection(path).count().get();
  return agg.data().count;
}

async function main() {
  console.log(`${dryRun ? 'DRY RUN' : 'WIPING'} project ${BETA_PROJECT}\n`);

  const collections = await db.listCollections();
  let totalDocs = 0;
  for (const coll of collections) {
    const n = await countTree(coll.id);
    totalDocs += n;
    console.log(`firestore  ${coll.id.padEnd(22)} ${n} document(s)`);
  }

  const uids: string[] = [];
  const byProvider: Record<string, number> = {};
  let pageToken: string | undefined;
  do {
    const page = await auth.listUsers(1000, pageToken);
    page.users.forEach(u => {
      uids.push(u.uid);
      const providers = u.providerData.map(p => p.providerId);
      const key = providers.length ? providers.join('+') : 'no-provider';
      byProvider[key] = (byProvider[key] || 0) + 1;
    });
    pageToken = page.pageToken;
  } while (pageToken);
  console.log(`auth       ${'users'.padEnd(22)} ${uids.length} account(s)`);
  Object.entries(byProvider).forEach(([k, v]) => console.log(`             ${k.padEnd(20)} ${v}`));

  if (dryRun) {
    console.log(`\nDry run: would delete ${totalDocs} root document(s) across ${collections.length} collection(s) and ${uids.length} auth account(s).`);
    return;
  }

  for (const coll of collections) {
    await db.recursiveDelete(coll);
    console.log(`deleted    collection ${coll.id}`);
  }

  for (let i = 0; i < uids.length; i += 1000) {
    const batch = uids.slice(i, i + 1000);
    const result = await auth.deleteUsers(batch);
    console.log(`deleted    ${result.successCount} auth account(s)${result.failureCount ? `, ${result.failureCount} failed` : ''}`);
    result.errors.forEach(e => console.error(`  failed uid index ${e.index}: ${e.error.message}`));
  }

  console.log('\nBeta is empty. Sign up demo@haveanothercherry.com and demo+two@haveanothercherry.com fresh.');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
