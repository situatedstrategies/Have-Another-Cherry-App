// The household setup quiz, one per group (docs/REBUILD_PLAN.md sections 4
// and 11 in the mobile repo). Pure helpers: the option lists both clients
// share, the branching, what the answers seed, and the summary line the
// group settings show. Writing happens in the component, through the
// group document the creator owns. The vault seeding, which touches
// Firestore, lives in householdSeed.ts so this file stays testable in Node.
import { t } from '../i18n';
import type {
  GroupKind,
  GroupPaying,
  GroupRecurring,
  GroupSettle,
  GroupSetup,
  GroupSplitAnswer,
  VaultBill,
} from '../types';

export const SETUP_VERSION = 1;

export const GROUP_KINDS: GroupKind[] = ['partners', 'housemates', 'family', 'friends', 'trip', 'team', 'other'];
export const GROUP_PAYING: GroupPaying[] = ['one_fronts', 'whoever', 'shared_account', 'varies'];
export const GROUP_SETTLE: GroupSettle[] = ['as_you_go', 'weekly', 'monthly', 'when_big'];
export const GROUP_SPLITS: GroupSplitAnswer[] = ['even', 'income', 'shares', 'each_time'];
export const GROUP_RECURRING: GroupRecurring[] = ['rent', 'utilities', 'subscriptions', 'groceries', 'childcare'];

export type SetupDraft = Omit<GroupSetup, 'version' | 'completedBy' | 'completedAt'>;

export function emptyDraft(handoffs: string[]): SetupDraft {
  return {
    kind: 'partners',
    paying: 'one_fronts',
    settle: 'monthly',
    split: 'even',
    handoffs,
    recurring: [],
    thresholdsWanted: false,
    trip: null,
    note: '',
  };
}

export function draftFrom(setup: GroupSetup | undefined, fallbackHandoffs: string[]): SetupDraft {
  if (!setup) return emptyDraft(fallbackHandoffs);
  return {
    kind: setup.kind,
    paying: setup.paying,
    settle: setup.settle,
    split: setup.split,
    handoffs: setup.handoffs?.length ? [...setup.handoffs] : fallbackHandoffs,
    recurring: [...(setup.recurring || [])],
    thresholdsWanted: !!setup.thresholdsWanted,
    trip: setup.trip ? { ...setup.trip } : null,
    note: setup.note || '',
  };
}

/** The question ids, in order, that this draft asks; the branching of section 4. */
export type SetupStep =
  | 'kind'
  | 'paying'
  | 'settle'
  | 'split'
  | 'handoffs'
  | 'recurring'
  | 'thresholds'
  | 'trip'
  | 'note';

export function stepsFor(draft: Pick<SetupDraft, 'kind'>): SetupStep[] {
  const steps: SetupStep[] = ['kind', 'paying', 'settle', 'split', 'handoffs', 'recurring'];
  if (draft.kind === 'partners' || draft.kind === 'family') steps.push('thresholds');
  if (draft.kind === 'trip') steps.push('trip');
  steps.push('note');
  return steps;
}

/** The finished document from a draft. */
export function completeSetup(draft: SetupDraft, uid: string, now = new Date()): GroupSetup {
  return {
    version: SETUP_VERSION,
    completedBy: uid,
    completedAt: now.toISOString(),
    kind: draft.kind,
    paying: draft.paying,
    settle: draft.settle,
    split: draft.split,
    handoffs: [...draft.handoffs],
    recurring: [...draft.recurring],
    thresholdsWanted: draft.thresholdsWanted,
    trip: draft.kind === 'trip' && draft.trip ? { ...draft.trip } : null,
    note: draft.note.trim().slice(0, 500),
  };
}

/** How many reminder days the settle answer implies; null for "when it gets big". */
export function reminderCadenceDays(settle: GroupSettle): number | null {
  switch (settle) {
    case 'as_you_go':
      return 1;
    case 'weekly':
      return 7;
    case 'monthly':
      return 30;
    default:
      return null;
  }
}

/** An even split across `seats` people, in whole tenths that sum to 100. */
export function evenSplit(seats: number): number[] {
  const n = Math.max(1, Math.floor(seats));
  const base = Math.floor((100 / n) * 10) / 10;
  const out = Array(n).fill(base);
  out[0] = Math.round((100 - base * (n - 1)) * 10) / 10;
  return out;
}

/** The vault bill stubs a recurring answer seeds (names translated, due on the 1st). */
export function recurringStubs(recurring: GroupRecurring[], existing: VaultBill[]): VaultBill[] {
  const have = new Set(existing.map((b) => b.name.trim().toLowerCase()));
  const stubs: VaultBill[] = [];
  for (const r of recurring) {
    const name = t(`household.recurring.${r}`);
    if (have.has(name.trim().toLowerCase())) continue;
    stubs.push({
      id: `setup_${r}`,
      name,
      dueDay: 1,
      category: t(`household.recurringCategory.${r}`),
    });
  }
  return stubs;
}

/** One line for group settings: "Partners · one person fronts it · settle monthly". */
export function setupSummary(setup: GroupSetup): string {
  return [
    t(`household.kind.${setup.kind}`),
    t(`household.paying.${setup.paying}`),
    t(`household.settle.${setup.settle}`),
  ].join(' · ');
}

/** Who may change the setup: the creator, or the first member on groups made before 2.0. */
export function setupOwner(group: { createdBy?: string; members?: { uid: string }[] }): string | null {
  return group.createdBy || group.members?.[0]?.uid || null;
}
