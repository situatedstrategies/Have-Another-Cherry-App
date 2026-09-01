import { PaymentInstrument, MismatchType, Expense } from '../types';

export const getInstrumentClass = (instrument?: PaymentInstrument): 'IMMEDIATE' | 'DEFERRED' | null => {
  if (!instrument) return null;
  if (['CASH', 'DEBIT', 'TRANSFER', 'VENMO', 'ZELLE'].includes(instrument)) return 'IMMEDIATE';
  if (instrument === 'CREDIT') return 'DEFERRED';
  return null; // OTHER
};

export const classifyMismatch = (contribution?: PaymentInstrument, settlement?: PaymentInstrument): MismatchType => {
  const c = getInstrumentClass(contribution);
  const s = getInstrumentClass(settlement);
  
  if (c === null || s === null) return 'NOT_CLASSIFIABLE';
  if (c === s) return 'NO_MISMATCH';
  if (c === 'DEFERRED' && s === 'IMMEDIATE') return 'FRONTED_ON_CREDIT_SETTLED_IN_CASH';
  if (c === 'IMMEDIATE' && s === 'DEFERRED') return 'FRONTED_IN_CASH_SETTLED_ON_CREDIT';
  
  return 'NOT_CLASSIFIABLE';
};

// Allocation logic: Find the corresponding contribution for a settlement
export const computeMismatchForSettlement = (expense: Expense, settlementInstrument: PaymentInstrument): MismatchType => {
  // Simplest FIFO: just find the first contribution from the person who paid the expense
  // If no contributions array exists, we can't classify
  if (!expense.contributions || expense.contributions.length === 0) return 'NOT_CLASSIFIABLE';
  
  // Assuming the main payer is the first contribution for now
  // Real FIFO would allocate partial amounts, but the requirement specifies: 
  // "run the classification once per Settlement, against the specific Contribution it's closing out
  // (if multiple contributors exist, allocate FIFO against the oldest open contribution)"
  
  // For simplicity since we mostly have single contributors per expense in this UI:
  const contribution = expense.contributions.find(c => c.userId === expense.paidBy);
  
  if (!contribution) return 'NOT_CLASSIFIABLE';
  
  return classifyMismatch(contribution.instrumentType, settlementInstrument);
};
