export interface User {
  uid: string;
  name: string;
  email: string;
  income?: string;
  financialProfile?: {
    type: string;
    description: string;
    quote?: string;
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
}

export type SplitType = 'household_default' | 'equal' | 'custom_percentage' | 'custom_amount' | 'third_party';

export type PaymentInstrument = 'CASH' | 'CREDIT' | 'DEBIT' | 'TRANSFER' | 'OTHER';

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
  status: 'pending' | 'confirmed';
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
  // Per-transaction "cherries" — extra people added to a single expense's split
  // (not permanent group members). Each gets a dollar share of this expense only.
  extraParticipants?: { name: string; share: number }[];
  isRecurring?: boolean;
  recurringInterval?: 'weekly' | 'biweekly' | 'monthly' | '2_months' | '3_months' | '6_months' | 'yearly';
  nextRecurringDate?: string;
  status: 'OPEN' | 'PARTIALLY_SETTLED' | 'CLOSED' | 'unsettled' | 'pending_confirmation' | 'settled'; // legacy values retained for existing records
  settleDetails?: SettleDetails; // legacy
  settlements?: Settlement[];
  comments?: Comment[];
  createdAt: string;
  notes?: string;
  encryptedData?: string;
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
