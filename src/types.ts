export interface User {
  uid: string;
  name: string;
  email: string;
  // A user account can belong to several groups at once and switch between them.
  // `groupIds` is the full membership set; `activeGroupId` is the one currently
  // being viewed. `groupId` is the legacy single-group field, kept mirrored to
  // `activeGroupId` for backward compatibility.
  groupIds?: string[];
  activeGroupId?: string;
  groupId?: string;
  // Cherry + entitlement, written ONLY by the RevenueCat webhook (or a manual
  // promo grant). Read through lib/entitlements.hasPlus - never directly.
  isPlus?: boolean;
  plusEntitlement?: {
    source: 'revenuecat_ios' | 'revenuecat_android' | 'promo';
    productId?: string;
    expiresAt?: string;
    updatedAt: string;
  };
  // Cherry +: the most this user wants to owe on a single shared expense; both
  // sides get a heads-up when a split goes over it. 0/absent = off.
  recurringThreshold?: number;
  // Payment handles other members use to pay this user directly. Stored ONLY
  // as paymentHandlesEnc (encrypted client-side with the owner's uid via
  // lib/crypto, like the ledger). The plaintext shape below is the in-memory /
  // legacy form; saving always writes the encrypted field and deletes this one.
  paymentHandles?: {
    venmo?: string; // Venmo username, without the @
    zelle?: string; // email or US phone number enrolled with Zelle
  };
  paymentHandlesEnc?: string;
  income?: string;
  partnerIncome?: string;
  financialProfile?: {
    type: string;
    description: string;
    quote?: string;
    traits?: string[];
    strengths?: string;
    watchouts?: string;
    communicationStyle?: string;
    greetingTone?: string; // guides the weekly dashboard greeting
  };
  // Cached AI-generated weekly greeting. `key` is `${isoWeek}-${memberCount}` so
  // it refreshes weekly and when the group size changes.
  weeklyGreeting?: {
    text: string;
    key: string;
  };
}

export interface Group {
  id: string;
  name?: string;
  inviteCode: string;
  members: User[];
  memberIds?: string[];
  defaultSplit: Record<string, number>; // uid -> percentage
  targetNumPeople?: number;
  availableSplits?: { name: string; split: number }[] | number[];
  categories: string[];
  memberIncomes?: Record<string, string>;
  keyHash?: string; // SHA-256 of the group backup key (never the key itself)
}

// 'dark_cherry' is the blind split (a Plus feature): the creator sets the pot
// target (the expense amount) plus a min/max per logged payment; everyone else
// only ever sees the allowed payment range, never the total or what remains.
export type SplitType = 'household_default' | 'equal' | 'custom_percentage' | 'custom_amount' | 'third_party' | 'dark_cherry';

// 'TRANSFER' is the legacy catch-all bank/Venmo value; Venmo and Zelle are now
// their own instruments so the settle flow can hand the payer into those apps.
export type PaymentInstrument = 'CASH' | 'CREDIT' | 'DEBIT' | 'TRANSFER' | 'VENMO' | 'ZELLE' | 'OTHER';

export type MismatchType = 
  | 'NO_MISMATCH'
  | 'FRONTED_ON_CREDIT_SETTLED_IN_CASH'
  | 'FRONTED_IN_CASH_SETTLED_ON_CREDIT'
  | 'NOT_CLASSIFIABLE';

export interface Contribution {
  userId: string;
  amount: number;
  instrumentType: PaymentInstrument;
  label?: string; // e.g., "Chase Sapphire"
}

export interface Comment {
  id: string;
  userId: string;
  text: string;
  timestamp: string;
}

export interface Settlement {
  id: string;
  expenseId: string;
  paidBy: string; // The person paying the settlement
  receivedBy: string; // The person receiving the settlement
  amount: number;
  instrumentType: PaymentInstrument;
  label?: string; // e.g., "Chase Checking"
  timestamp: string;        // when the settlement was logged in-app
  paymentDate?: string;     // the actual date the payment was made (user-provided)
  // Status only ever moves forward: pending -> confirmed -> voided. A voided
  // settlement is a tombstone for an entry logged in error — it stays in the
  // audit trail (so merges can't resurrect it) but no longer counts toward
  // anyone's balance.
  status: 'pending' | 'confirmed' | 'voided';
  voidedAt?: string;
  voidedBy?: string;        // uid of whoever removed the entry
  mismatchType?: MismatchType;
}

export interface Credit {
  id: string;
  groupId: string;
  userId: string;
  amount: number;
  timestamp: string;
  notes?: string;
}

export interface SettleDetails {
  paymentMethod: string; // e.g. "Venmo", "Cash", "Bank Transfer", "Other"
  paidAt: string;        // Date string
  confirmedAt?: string;  // Date string when confirmed
  paidBy: string;        // uid of who paid the settle amount
  receivedBy: string;    // uid of who received the settle amount
  amount: number;        // The exact settlement amount
  notes?: string;
}

export interface Expense {
  id: string;
  groupId: string;
  title: string;
  amount: number;
  date: string;
  category: string;
  paidBy: string;         // legacy: uid of who paid the full original expense
  contributions?: Contribution[];
  splitType: SplitType;
  shares: Record<string, number>; // uid -> amount owed
  thirdPersonName?: string;
  thirdPersonEmail?: string;
  thirdPersonShare?: number;
  // Per-transaction "cherries" - extra people added to a single expense's split
  // (not permanent group members). Each gets a dollar share of this expense only.
  extraParticipants?: { name: string; share: number }[];
  // Dark Cherry (blind split) only: bounds for a single logged payment. The pot
  // target is `amount`; participants see only these bounds.
  blindMin?: number;
  blindMax?: number;
  // Set on instances auto-logged by the recurring autopilot: the id of the
  // recurring expense that spawned this one (used to prevent duplicates).
  recurringSourceId?: string;
  isRecurring?: boolean;
  recurringInterval?: 'weekly' | 'biweekly' | 'monthly' | '2_months' | '3_months' | '6_months' | 'yearly';
  nextRecurringDate?: string;
  status: 'OPEN' | 'PARTIALLY_SETTLED' | 'CLOSED' | 'unsettled' | 'pending_confirmation' | 'settled'; // legacy values retained for existing records
  settleDetails?: SettleDetails; // legacy
  settlements?: Settlement[];
  comments?: Comment[];
  createdAt: string;
  // Bumped only when the expense *content* (title/amount/shares/split/...)
  // changes — never by settlements or comments. Merges use it to decide whose
  // content fields win, so a device that hasn't seen the latest edit can't
  // revert it when it broadcasts a settlement confirmation.
  editedAt?: string;
  notes?: string;
}

// ---- Household Vault ----
// A recurring bill catalogued in the vault (not necessarily in the ledger):
// name + which day of the month it's due, so the vault calendar can show it.
export interface VaultBill {
  id: string;
  name: string;
  amount?: number;
  dueDay: number; // 1-31, clamped to the month's length when rendered
  category?: string;
  notes?: string;
}

// Metadata for an encrypted document stored in the vault. The file body lives
// in its own Firestore doc (group_vault/{groupId}/files/{id}), E2E-encrypted.
export interface VaultDocMeta {
  id: string;
  name: string;
  mimeType: string;
  size: number; // original byte size
  uploadedBy: string;
  uploadedAt: string;
}

export interface VaultData {
  bills: VaultBill[];
  docs: VaultDocMeta[];
}

export const DEFAULT_CATEGORIES = [
  'Rent',
  'Utilities',
  'Internet',
  'Groceries',
  'Dining Out',
  'Home Improvement',
  'Subscription',
  'Other'
];
