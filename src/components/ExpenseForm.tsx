import React, { useState, useEffect, useMemo, useRef } from 'react';
import { getFullMembers, getFullDefaultSplit } from '../lib/members';
import { SplitType, Expense, Group, User as AppUser, PaymentInstrument } from '../types';
import { X, Calculator, Percent, DollarSign, Calendar, Tag, Repeat, Scale, Plus, Camera, Sparkles } from 'lucide-react';

interface ExpenseFormProps {
  group: Group;
  activeUser: string;
  onClose: () => void;
  onSubmit: (expenseData: Omit<Expense, 'id' | 'createdAt' | 'status' | 'groupId'>) => void;
  editingExpense?: Expense | null;
}

export default function ExpenseForm({ group, activeUser, onClose, onSubmit, editingExpense }: ExpenseFormProps) {
  const categories = group.categories || [];
  const members = useMemo(() => getFullMembers(group), [group]);
  
  const [title, setTitle] = useState(editingExpense?.title || '');
  const [amount, setAmount] = useState(editingExpense?.amount?.toString() || '');
  // Start empty so the placeholder shows and nothing "sticks" in the field.
  const [category, setCategory] = useState<string>(editingExpense?.category || '');
  const categoryInputRef = useRef<HTMLInputElement>(null);

  const handleCategoryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCategory(e.target.value);
  };
    const [date, setDate] = useState(editingExpense?.date || new Date().toISOString().split('T')[0]);
  const [paidBy, setPaidBy] = useState<string>(editingExpense?.paidBy || activeUser);
  const [instrumentType, setInstrumentType] = useState<PaymentInstrument | undefined>(
    editingExpense?.contributions?.[0]?.instrumentType
  );
  const [instrumentLabel, setInstrumentLabel] = useState<string>(
    editingExpense?.contributions?.[0]?.label || ''
  );
  const [splitType, setSplitType] = useState<SplitType>(editingExpense?.splitType || 'household_default');

  // Shares: member uid -> value (either percentage or amount)
  const [customPct, setCustomPct] = useState<Record<string, string>>({});
  const [customAmt, setCustomAmt] = useState<Record<string, string>>({});

  const [thirdPersonName, setThirdPersonName] = useState(editingExpense?.thirdPersonName || '');
  const [thirdPersonEmail, setThirdPersonEmail] = useState(editingExpense?.thirdPersonEmail || '');
  
  const [thirdPartyPct, setThirdPartyPct] = useState<Record<string, string>>({});

  // Per-transaction "cherries": extra people added only to this expense's split.
  const [guests, setGuests] = useState<{ id: string; name: string; pct: string }[]>([]);
  const addGuest = () => setGuests(prev => [...prev, { id: crypto.randomUUID(), name: '', pct: '' }]);
  const updateGuest = (id: string, field: 'name' | 'pct', val: string) =>
    setGuests(prev => prev.map(g => (g.id === id ? { ...g, [field]: val } : g)));
  const removeGuest = (id: string) => setGuests(prev => prev.filter(g => g.id !== id));

  const [notes, setNotes] = useState(editingExpense?.notes || '');
  const [isRecurring, setIsRecurring] = useState(editingExpense?.isRecurring || false);
  const [recurringInterval, setRecurringInterval] = useState<any>(editingExpense?.recurringInterval || 'monthly');
  const [alreadySettled, setAlreadySettled] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load editing values if present
  useEffect(() => {
    if (editingExpense) {
      setTitle(editingExpense.title);
      setAmount(editingExpense.amount.toString());
      setCategory(editingExpense.category);
      setDate(editingExpense.date);
      setPaidBy(editingExpense.paidBy);
      setSplitType(editingExpense.splitType);
      setNotes(editingExpense.notes || '');
      setIsRecurring(editingExpense.isRecurring || false);
      setRecurringInterval(editingExpense.recurringInterval || 'monthly');

      if (editingExpense.splitType === 'custom_percentage') {
        const total = editingExpense.amount;
        const pcts: Record<string, string> = {};
        for (const uid in editingExpense.shares) {
          pcts[uid] = Math.round((editingExpense.shares[uid] / total) * 100).toString();
        }
        setCustomPct(pcts);
        // Restore any per-transaction guests as percentage lines.
        if (editingExpense.extraParticipants?.length) {
          setGuests(editingExpense.extraParticipants.map(g => ({
            id: crypto.randomUUID(),
            name: g.name,
            pct: total ? ((g.share / total) * 100).toFixed(2) : '0'
          })));
        }
      } else if (editingExpense.splitType === 'custom_amount') {
        const amts: Record<string, string> = {};
        for (const uid in editingExpense.shares) {
          amts[uid] = editingExpense.shares[uid].toString();
        }
        setCustomAmt(amts);
      } else if (editingExpense.splitType === 'third_party') {
        setThirdPersonName(editingExpense.thirdPersonName || '');
        setThirdPersonEmail(editingExpense.thirdPersonEmail || '');
        
        const total = editingExpense.amount;
        const pcts: Record<string, string> = {};
        for (const uid in editingExpense.shares) {
          pcts[uid] = ((editingExpense.shares[uid] / total) * 100).toFixed(2);
        }
        pcts['third_party'] = (((editingExpense.thirdPersonShare || 0) / total) * 100).toFixed(2);
        setThirdPartyPct(pcts);
      }
    } else {
      // Default initial states for custom pct
      const initPct: Record<string, string> = {};
      members.forEach(m => {
        initPct[m.uid] = (group.defaultSplit[m.uid] || 0).toString();
      });
      setCustomPct(initPct);
    }
  }, [editingExpense, members, group]);

  // Adjust categories automatically on title or type change to be helpful
  useEffect(() => {
    if (!editingExpense) {
      const lowerTitle = title.toLowerCase();
      if (lowerTitle.includes('rent')) {
        setCategory('Rent');
        setSplitType('household_default');
      } else if (lowerTitle.includes('internet') || lowerTitle.includes('wifi')) {
        setCategory('Internet');
        setSplitType('household_default');
      } else if (lowerTitle.includes('power') || lowerTitle.includes('water') || lowerTitle.includes('utility') || lowerTitle.includes('gas') || lowerTitle.includes('electric')) {
        setCategory('Utilities');
        setSplitType('household_default');
      } else if (lowerTitle.includes('grocery') || lowerTitle.includes('groceries') || lowerTitle.includes('food')) {
        setCategory('Groceries');
        setSplitType('equal');
      } else if (lowerTitle.includes('dinner') || lowerTitle.includes('restaurant') || lowerTitle.includes('lunch') || lowerTitle.includes('cafe')) {
        setCategory('Dining Out');
        setSplitType('equal');
      }
    }
  }, [title]);

  const numericAmount = parseFloat(amount) || 0;

  // Perform split calculations on the fly for UI previews
  const previewShares: Record<string, number> = {};
  let previewThirdPersonShare = 0;

  members.forEach(m => previewShares[m.uid] = 0);

  if (splitType === 'household_default') {
    members.forEach(m => {
      previewShares[m.uid] = numericAmount * ((getFullDefaultSplit(group)[m.uid] || 0) / 100);
    });
  } else if (splitType === 'equal') {
    // wait, it should be equal split among all members
    members.forEach(m => {
      previewShares[m.uid] = numericAmount / members.length;
    });
  } else if (splitType === 'custom_percentage') {
    members.forEach(m => {
      const pct = parseFloat(customPct[m.uid]) || 0;
      previewShares[m.uid] = (numericAmount * pct) / 100;
    });
  } else if (splitType === 'custom_amount') {
    members.forEach(m => {
      previewShares[m.uid] = parseFloat(customAmt[m.uid]) || 0;
    });
  } else if (splitType === 'third_party') {
    const tPct = parseFloat(thirdPartyPct['third_party']) || 0;
    previewThirdPersonShare = (numericAmount * tPct) / 100;
    members.forEach(m => {
      const pct = parseFloat(thirdPartyPct[m.uid]) || 0;
      previewShares[m.uid] = (numericAmount * pct) / 100;
    });
  }

  const handleCustomPctChange = (uid: string, val: string) => {
    setCustomPct(prev => ({ ...prev, [uid]: val }));
  };

  const handleCustomAmtChange = (uid: string, val: string) => {
    setCustomAmt(prev => ({ ...prev, [uid]: val }));
  };

  const handleThirdPartyPctChange = (uid: string, val: string) => {
    setThirdPartyPct(prev => ({ ...prev, [uid]: val }));
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!title.trim()) {
      setError('Please enter a description or title for the expense.');
      return;
    }

    if (!amount || isNaN(numericAmount) || numericAmount <= 0) {
      setError('Please enter a valid amount greater than zero.');
      return;
    }

    let finalShares: Record<string, number> = {};
    let finalThirdPersonShare: number | undefined = undefined;
    let finalExtraParticipants: { name: string; share: number }[] | undefined = undefined;
    const round2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;

    if (splitType === 'household_default' || splitType === 'equal') {
      let runningTotal = 0;
      members.forEach((m, index) => {
        const pct = splitType === 'household_default'
          ? (getFullDefaultSplit(group)[m.uid] || 0)
          : (100 / members.length);
        const share = round2((numericAmount * pct) / 100);
        // Adjust the last member's share to account for rounding errors
        if (index === members.length - 1) {
          finalShares[m.uid] = round2(numericAmount - runningTotal);
        } else {
          finalShares[m.uid] = share;
          runningTotal += share;
        }
      });
    } else if (splitType === 'custom_percentage') {
      const guestEntries = guests.map(g => ({ name: g.name.trim(), pct: parseFloat(g.pct) || 0 }));
      if (guestEntries.some(g => !g.name)) {
        setError('Please enter a name for each added cherry.');
        return;
      }
      let totalPct = 0;
      members.forEach(m => (totalPct += parseFloat(customPct[m.uid]) || 0));
      guestEntries.forEach(g => (totalPct += g.pct));
      if (Math.abs(totalPct - 100) > 0.01) {
        setError('Percentages (members + added cherries) must add up to 100%.');
        return;
      }
      // Round each share, then absorb any leftover cent into the last line
      // so the parts sum exactly to the total.
      let running = 0;
      members.forEach(m => {
        const share = round2((numericAmount * (parseFloat(customPct[m.uid]) || 0)) / 100);
        finalShares[m.uid] = share;
        running += share;
      });
      const guestShares = guestEntries.map(g => {
        const share = round2((numericAmount * g.pct) / 100);
        running += share;
        return { name: g.name, share };
      });
      const diff = round2(numericAmount - running);
      if (Math.abs(diff) >= 0.01) {
        if (guestShares.length) {
          guestShares[guestShares.length - 1].share = round2(guestShares[guestShares.length - 1].share + diff);
        } else if (members.length) {
          const lastUid = members[members.length - 1].uid;
          finalShares[lastUid] = round2(finalShares[lastUid] + diff);
        }
      }
      if (guestShares.length) finalExtraParticipants = guestShares;
    } else if (splitType === 'custom_amount') {
      let totalAmt = 0;
      members.forEach(m => totalAmt += (parseFloat(customAmt[m.uid]) || 0));
      if (Math.abs(totalAmt - numericAmount) > 0.02) {
        setError(`Individual shares ($${totalAmt}) must equal the total amount ($${numericAmount}).`);
        return;
      }
      members.forEach(m => finalShares[m.uid] = parseFloat(customAmt[m.uid]) || 0);
    } else if (splitType === 'third_party') {
      if (!thirdPersonName.trim()) {
        setError('Please enter the third person\'s name.');
        return;
      }
      if (!thirdPersonEmail.trim()) {
        setError('Please enter the third person\'s email.');
        return;
      }
      let totalPct = (parseFloat(thirdPartyPct['third_party']) || 0);
      members.forEach(m => totalPct += (parseFloat(thirdPartyPct[m.uid]) || 0));
      
      if (Math.abs(totalPct - 100) > 0.01) {
        setError('Custom percentages must add up to 100%.');
        return;
      }
      
      const tPct = parseFloat(thirdPartyPct['third_party']) || 0;
      finalThirdPersonShare = Math.round((numericAmount * tPct) / 100 * 100) / 100;
      let runningTotal = finalThirdPersonShare;
      members.forEach((m, index) => {
        const pct = parseFloat(thirdPartyPct[m.uid]) || 0;
        const share = Math.round((numericAmount * pct) / 100 * 100) / 100;
        if (index === members.length - 1) {
          finalShares[m.uid] = Math.round((numericAmount - runningTotal) * 100) / 100;
        } else {
          finalShares[m.uid] = share;
          runningTotal += share;
        }
      });
    }

    let finalCategory = category.trim();
    if (!finalCategory) {
      setError('Please enter a category.');
      return;
    }

    const calculateNextDate = (currentDateStr: string, interval: string) => {
      const d = new Date(currentDateStr);
      // Adjust timezone offset to avoid jumping days
      d.setMinutes(d.getMinutes() + d.getTimezoneOffset());
      
      switch(interval) {
        case 'weekly': d.setDate(d.getDate() + 7); break;
        case 'biweekly': d.setDate(d.getDate() + 14); break;
        case 'monthly': d.setMonth(d.getMonth() + 1); break;
        case '2_months': d.setMonth(d.getMonth() + 2); break;
        case '3_months': d.setMonth(d.getMonth() + 3); break;
        case '6_months': d.setMonth(d.getMonth() + 6); break;
        case 'yearly': d.setFullYear(d.getFullYear() + 1); break;
      }
      return d.toISOString().split('T')[0];
    };

    let nextRecurDate = editingExpense?.nextRecurringDate || null;
    if (isRecurring && (!editingExpense || !editingExpense.isRecurring || editingExpense.recurringInterval !== recurringInterval)) {
       nextRecurDate = calculateNextDate(date, recurringInterval);
    }

    const payload: any = {
      title: title.trim(),
      amount: numericAmount,
      date,
      category: finalCategory,
      paidBy,
      contributions: [{
        userId: paidBy,
        amount: numericAmount,
        ...(instrumentType ? { instrumentType } : {}),
        ...(instrumentLabel.trim() ? { label: instrumentLabel.trim() } : {})
      }],
      splitType,
      shares: finalShares,
      thirdPersonName: splitType === 'third_party' ? (thirdPersonName.trim() || null) : null,
      thirdPersonEmail: splitType === 'third_party' ? (thirdPersonEmail.trim() || null) : null,
      thirdPersonShare: splitType === 'third_party' ? finalThirdPersonShare : null,
      extraParticipants: splitType === 'custom_percentage' ? (finalExtraParticipants || null) : null,
      notes: notes.trim() || null,
      isRecurring,
      ...(isRecurring ? { recurringInterval, nextRecurringDate: nextRecurDate } : { recurringInterval: null, nextRecurringDate: null }),
      // Quick settle: only meaningful when creating a new expense.
      quickSettle: !editingExpense && alreadySettled,
    };

    // Remove any strictly undefined values just in case, though we used null
    Object.keys(payload).forEach(key => payload[key] === undefined && delete payload[key]);

    onSubmit(payload);
  };

  return (
    <div className="fixed inset-0 bg-natural-dark/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" id="form-overlay">
      <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl border border-natural-border flex flex-col max-h-[90vh] animate-in fade-in-50 zoom-in-95 duration-150" id="form-container">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-natural-border" id="form-header">
          <h2 className="text-xl font-display font-bold text-natural-text">
            {editingExpense ? 'Edit Expense' : 'Log New Expense'}
          </h2>
          <button 
            onClick={onClose}
            className="text-natural-muted hover:text-natural-text hover:bg-natural-sidebar p-2 rounded-xl transition-colors cursor-pointer"
            id="close-form-btn"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        
        {/* Form Body */}
        <form onSubmit={handleFormSubmit} className="flex-1 overflow-y-auto p-6 space-y-5" id="expense-form">
          {error && (
            <div className="p-3 bg-natural-sidebar border border-natural-border/20 rounded-xl text-natural-text text-sm font-semibold" id="form-error">
              {error}
            </div>
          )}

          
          {/* AI Smart Scan Placeholder */}
          <div className="bg-natural-sage/20 border border-natural-primary/20 rounded-2xl p-4 flex flex-col sm:flex-row items-center gap-4">
            <div className="flex-1">
              <h3 className="text-sm font-bold text-natural-text flex items-center gap-1.5">
                <Sparkles size={16} className="text-natural-primary" /> Smart Scan
              </h3>
              <p className="text-xs text-natural-muted mt-1">Auto-fill details by scanning a receipt.</p>
            </div>
            <button 
              type="button"
              onClick={async () => {
                try {
                  // MOCK CLIENT-SIDE INTEGRATION
                  const btn = document.getElementById('scan-receipt-btn');
                  if (btn) btn.innerHTML = 'Scanning...';
                  
                  const response = await fetch('/api/scan-receipt', { method: 'POST' });
                  const result = await response.json();
                  
                  if (result.success) {
                    setTitle(result.data.description);
                    setAmount(result.data.amount.toString());
                    setCustomAmt({});
                  }
                  
                  if (btn) btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-camera"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/></svg> Scan Receipt';
                } catch (e) {
                  console.error("Scan failed", e);
                  const btn = document.getElementById('scan-receipt-btn');
                  if (btn) btn.innerHTML = 'Scan Failed';
                }
              }}
              id="scan-receipt-btn"
              className="w-full sm:w-auto px-4 py-2 bg-white hover:bg-natural-sage/50 text-natural-primary border border-natural-primary/30 font-bold text-xs rounded-xl shadow-sm flex items-center justify-center gap-2 transition-colors"
            >
              <Camera size={16} /> Scan Receipt
            </button>
          </div>



          {/* Description */}
          <div>
            <label className="block text-xs font-bold text-natural-text uppercase tracking-wider mb-2">Description / Title</label>
            <div className="relative">
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Rent, electric bill, wifi, groceries..."
                className="w-full pl-3 pr-3 py-2.5 bg-natural-bg/50 hover:bg-natural-bg focus:bg-white border border-natural-border focus:border-natural-primary rounded-xl text-natural-text placeholder-natural-muted/60 font-sans text-sm outline-none transition-all"
                id="expense-title-input"
              />
            </div>
          </div>

          {/* Amount & Date Grid */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-natural-text uppercase tracking-wider mb-2">Amount ($)</label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-natural-muted font-medium">$</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={amount}
                  onChange={(e) => {
                    setAmount(e.target.value);
                    setCustomAmt({});
                  }}
                  placeholder="0.00"
                  className="w-full pl-8 pr-3 py-2.5 bg-natural-bg/50 hover:bg-natural-bg focus:bg-white border border-natural-border focus:border-natural-primary rounded-xl text-natural-text placeholder-natural-muted/60 font-mono text-sm outline-none transition-all"
                  id="expense-amount-input"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-natural-text uppercase tracking-wider mb-2">Date</label>
              <div className="relative">
                <Calendar className="absolute left-3.5 top-1/2 -translate-y-1/2 text-natural-muted h-4 w-4" />
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full pl-10 pr-3 py-2.5 bg-natural-bg/50 hover:bg-natural-bg focus:bg-white border border-natural-border focus:border-natural-primary rounded-xl text-natural-text font-sans text-sm outline-none transition-all cursor-pointer"
                  id="expense-date-input"
                />
              </div>

              {/* Recurring Toggle */}
              <div className="mt-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isRecurring}
                    onChange={(e) => setIsRecurring(e.target.checked)}
                    className="w-4 h-4 rounded text-natural-primary focus:ring-natural-primary/30 border-natural-border"
                  />
                  <span className="text-sm font-semibold text-natural-text flex items-center gap-1.5"><Repeat size={14} className="text-natural-muted" /> Recurring Expense</span>
                </label>
                
                {isRecurring && (
                  <div className="mt-2 pl-6">
                    <select
                      value={recurringInterval}
                      onChange={(e) => setRecurringInterval(e.target.value)}
                      className="w-full px-3 py-2 bg-natural-bg/50 hover:bg-natural-bg focus:bg-white border border-natural-border focus:border-natural-primary rounded-lg text-natural-text font-sans text-sm outline-none transition-all appearance-none cursor-pointer"
                    >
                      <option value="weekly">Weekly</option>
                      <option value="biweekly">Bi-weekly</option>
                      <option value="monthly">Monthly</option>
                      <option value="2_months">Every 2 Months</option>
                      <option value="3_months">Every 3 Months</option>
                      <option value="6_months">Every 6 Months</option>
                      <option value="yearly">Yearly</option>
                    </select>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Transaction Payment Type */}
          <div className="pb-4">

              <label className="block text-xs font-bold text-natural-text uppercase tracking-wider mb-2">Transaction Payment Type</label>
              <div className="flex flex-wrap gap-1.5">
                {(['CASH', 'CREDIT', 'DEBIT', 'TRANSFER', 'OTHER'] as PaymentInstrument[]).map(inst => (
                  <button
                    key={inst}
                    type="button"
                    onClick={() => setInstrumentType(inst)}
                    className={`flex-1 py-1.5 px-3 text-xs font-semibold rounded-full border transition-all cursor-pointer ${
                      instrumentType === inst
                        ? 'bg-natural-primary border-natural-primary text-white shadow-sm'
                        : 'bg-white border-natural-border text-natural-muted hover:bg-natural-sidebar'
                    }`}
                  >
                    {inst === 'TRANSFER' ? 'BANK/VENMO' : inst}
                  </button>
                ))}
              </div>
              {['CREDIT', 'DEBIT', 'OTHER'].includes(instrumentType) && (
                <div className="mt-2 relative">
                  <input
                    type="text"
                    value={instrumentLabel}
                    onChange={(e) => setInstrumentLabel(e.target.value)}
                    placeholder="e.g., Chase Sapphire"
                    className="w-full pl-3 pr-3 py-2 text-xs bg-natural-bg/50 hover:bg-natural-bg focus:bg-white border border-natural-border focus:border-natural-primary rounded-xl text-natural-text outline-none transition-all"
                  />
                </div>
              )}
            
          </div>

          {/* Category & Payer Grid */}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-natural-text uppercase tracking-wider mb-2">Category</label>
              <div className="relative">
                <Tag className="absolute left-3.5 top-1/2 -translate-y-1/2 text-natural-muted h-4 w-4" />
                <input
                  ref={categoryInputRef}
                  type="text"
                  value={category}
                  onChange={handleCategoryChange}
                  placeholder="Type or pick a category"
                  list="category-options"
                  className="w-full pl-10 pr-3 py-2.5 bg-natural-bg/50 hover:bg-natural-bg focus:bg-white border border-natural-border focus:border-natural-primary rounded-xl text-natural-text font-sans text-sm outline-none transition-all"
                  id="expense-category-input"
                  autoComplete="off"
                />
                <datalist id="category-options">
                  {categories.map(c => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-natural-text uppercase tracking-wider mb-2">Paid By</label>
              <div className="flex flex-wrap gap-2 bg-natural-sidebar p-1.5 rounded-xl w-full">
                {members.map(m => (
                  <button
                    key={m.uid}
                    type="button"
                    onClick={() => setPaidBy(m.uid)}
                    className={`flex-1 min-w-[60px] py-2 px-2 text-xs font-semibold rounded-lg transition-all cursor-pointer truncate ${
                      paidBy === m.uid
                        ? 'bg-white text-natural-text font-bold shadow-sm border border-natural-border/50'
                        : 'text-natural-muted hover:text-natural-text hover:bg-black/5'
                    }`}
                    title={m.name}
                  >
                    {m.name}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Split Rule Selector */}
          <div>
            <label className="block text-xs font-bold text-natural-text uppercase tracking-wider mb-2">Split Rules</label>
            <div className="space-y-2" id="split-rules-group">
              {/* Default split option */}
              <label className={`flex items-center justify-between p-3 border rounded-xl cursor-pointer hover:bg-natural-sidebar/20 transition-all ${
                splitType === 'household_default' ? 'border-natural-border bg-natural-sidebar/40 font-medium' : 'border-natural-border'
              }`}>
                <div className="flex items-center gap-3">
                  <input
                    type="radio"
                    name="splitType"
                    checked={splitType === 'household_default'}
                    onChange={() => setSplitType('household_default')}
                    className="text-natural-text focus:ring-natural-primary cursor-pointer h-4 w-4"
                    id="rule-default"
                  />
                  <div>
                    <span className="block text-sm font-semibold text-natural-text">Standard Split</span>
                    <span className="block text-xs text-natural-muted">Default split</span>
                  </div>
                </div>
                <span className="w-8 h-8 text-natural-text bg-natural-sidebar rounded-lg flex items-center justify-center"><Scale className="w-4 h-4 transform -rotate-12" /></span>
              </label>

              {/* Equal split option */}
              <label className={`flex items-center justify-between p-3 border rounded-xl cursor-pointer hover:bg-natural-sidebar/20 transition-all ${
                splitType === 'equal' ? 'border-natural-border bg-natural-sidebar/40 font-medium' : 'border-natural-border'
              }`}>
                <div className="flex items-center gap-3">
                  <input
                    type="radio"
                    name="splitType"
                    checked={splitType === 'equal'}
                    onChange={() => setSplitType('equal')}
                    className="text-natural-text focus:ring-natural-primary cursor-pointer h-4 w-4"
                    id="rule-5050"
                  />
                  <div>
                    <span className="block text-sm font-semibold text-natural-text">Even Split</span>
                    <span className="block text-xs text-natural-muted">Equal split among members</span>
                  </div>
                </div>
                <span className="w-8 h-8 text-sm font-bold font-mono text-natural-text bg-natural-sidebar rounded-lg flex items-center justify-center">=</span>
              </label>

              {/* Custom Percentage split option */}
              <label className={`flex items-center justify-between p-3 border rounded-xl cursor-pointer hover:bg-natural-sidebar/20 transition-all ${
                splitType === 'custom_percentage' ? 'border-natural-border bg-natural-sidebar/40 font-medium' : 'border-natural-border'
              }`}>
                <div className="flex items-center gap-3">
                  <input
                    type="radio"
                    name="splitType"
                    checked={splitType === 'custom_percentage'}
                    onChange={() => setSplitType('custom_percentage')}
                    className="text-natural-text focus:ring-natural-primary cursor-pointer h-4 w-4"
                    id="rule-custom-pct"
                  />
                  <div>
                    <span className="block text-sm font-semibold text-natural-text">Custom Percentages</span>
                    <span className="block text-xs text-natural-muted">Manually set custom split percentages</span>
                  </div>
                </div>
                <span className="w-8 h-8 text-natural-text bg-natural-sidebar rounded-lg flex items-center justify-center"><Percent className="w-4 h-4" /></span>
              </label>

              {/* Custom Amount split option */}
              <label className={`flex items-center justify-between p-3 border rounded-xl cursor-pointer hover:bg-natural-sidebar/20 transition-all ${
                splitType === 'custom_amount' ? 'border-natural-border bg-natural-sidebar/40 font-medium' : 'border-natural-border'
              }`}>
                <div className="flex items-center gap-3">
                  <input
                    type="radio"
                    name="splitType"
                    checked={splitType === 'custom_amount'}
                    onChange={() => setSplitType('custom_amount')}
                    className="text-natural-text focus:ring-natural-primary cursor-pointer h-4 w-4"
                    id="rule-custom-amt"
                  />
                  <div>
                    <span className="block text-sm font-semibold text-natural-text">Custom Amounts</span>
                    <span className="block text-xs text-natural-muted">Manually specify individual flat shares</span>
                  </div>
                </div>
                <span className="w-8 h-8 text-natural-text bg-natural-sidebar rounded-lg flex items-center justify-center"><DollarSign className="w-4 h-4" /></span>
              </label>

              {/* Third Party split option */}
              {members.length === 2 && (
                <label className={`flex items-center justify-between p-3 border rounded-xl cursor-pointer hover:bg-natural-sidebar/20 transition-all ${
                  splitType === 'third_party' ? 'border-natural-border bg-natural-sidebar/40 font-medium' : 'border-natural-border'
                }`}>
                  <div className="flex items-center gap-3">
                    <input
                      type="radio"
                      name="splitType"
                      checked={splitType === 'third_party'}
                      onChange={() => setSplitType('third_party')}
                      className="text-natural-text focus:ring-natural-primary cursor-pointer h-4 w-4"
                      id="rule-third-party"
                    />
                    <div>
                      <span className="block text-sm font-semibold text-natural-text">Add Third Person</span>
                      <span className="block text-xs text-natural-muted">Split with an additional person</span>
                    </div>
                  </div>
                  <span className="w-8 h-8 text-natural-text bg-natural-sidebar rounded-lg flex items-center justify-center"><Plus className="w-4 h-4" /></span>
                </label>
              )}
            </div>
          </div>

          {/* Custom Percentage Inputs (Conditional) */}
          {splitType === 'custom_percentage' && (() => {
            const memberPctTotal = members.reduce((s, m) => s + (parseFloat(customPct[m.uid]) || 0), 0);
            const guestPctTotal = guests.reduce((s, g) => s + (parseFloat(g.pct) || 0), 0);
            const pctTotal = memberPctTotal + guestPctTotal;
            const balanced = Math.abs(pctTotal - 100) <= 0.01;
            return (
            <div className="bg-natural-sidebar/50 p-4 rounded-2xl border border-natural-border space-y-3 animate-in slide-in-from-top-2 duration-150" id="custom-pct-inputs">
              <span className="block text-xs font-bold text-natural-text uppercase tracking-wider">Set Split Percentages</span>
              <div className="grid grid-cols-2 gap-4">
                {members.map(m => (
                  <div key={`pct-${m.uid}`}>
                    <label className="block text-xs text-natural-muted mb-1 font-semibold">{m.name}'s %</label>
                    <div className="relative">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={customPct[m.uid] || ''}
                        onChange={(e) => handleCustomPctChange(m.uid, e.target.value)}
                        className="w-full pr-8 pl-3 py-2 bg-white border border-natural-border focus:border-natural-primary rounded-lg text-natural-text font-mono text-sm outline-none transition-all"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-natural-muted text-xs font-mono">%</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Per-transaction guests ("cherries") */}
              {guests.length > 0 && (
                <div className="space-y-2 pt-2 border-t border-natural-border/60">
                  <span className="block text-[10px] font-bold text-natural-muted uppercase tracking-wider">Added for this expense only</span>
                  {guests.map(g => (
                    <div key={g.id} className="flex items-center gap-2">
                      <input
                        type="text"
                        value={g.name}
                        onChange={(e) => updateGuest(g.id, 'name', e.target.value)}
                        placeholder="Name (e.g. 🍒 guest)"
                        className="flex-1 px-3 py-2 bg-white border border-natural-border focus:border-natural-primary rounded-lg text-natural-text text-sm outline-none transition-all"
                      />
                      <div className="relative w-24 shrink-0">
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={g.pct}
                          onChange={(e) => updateGuest(g.id, 'pct', e.target.value)}
                          placeholder="0"
                          className="w-full pr-7 pl-3 py-2 bg-white border border-natural-border focus:border-natural-primary rounded-lg text-natural-text font-mono text-sm outline-none transition-all"
                        />
                        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-natural-muted text-xs font-mono">%</span>
                      </div>
                      <button type="button" onClick={() => removeGuest(g.id)} className="text-natural-muted hover:text-red-500 p-1.5 shrink-0" title="Remove">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex items-center justify-between pt-1">
                <button
                  type="button"
                  onClick={addGuest}
                  className="flex items-center gap-1.5 text-xs font-bold text-natural-primary hover:text-natural-dark"
                >
                  <Plus className="h-3.5 w-3.5" /> Add a cherry
                </button>
                <span className={`text-xs font-bold font-mono ${balanced ? 'text-natural-primary' : 'text-natural-muted'}`}>
                  Total: {pctTotal.toFixed(1)}%{balanced ? ' ✓' : ' / 100%'}
                </span>
              </div>
            </div>
            );
          })()}

          {/* Custom Amount Inputs (Conditional) */}
          {splitType === 'custom_amount' && (
            <div className="bg-natural-sidebar/50 p-4 rounded-2xl border border-natural-border space-y-3 animate-in slide-in-from-top-2 duration-150" id="custom-amt-inputs">
              <div className="flex items-center justify-between">
                <span className="block text-xs font-bold text-natural-text uppercase tracking-wider">Specify Shares</span>
                <span className="text-xs text-natural-muted font-mono">Total expense: ${numericAmount.toFixed(2)}</span>
              </div>
              <div className="grid grid-cols-2 gap-4">
                {members.map(m => (
                  <div key={`amt-${m.uid}`}>
                    <label className="block text-xs text-natural-muted mb-1 font-semibold">{m.name}'s Share ($)</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-natural-muted text-xs">$</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        max={numericAmount}
                        value={customAmt[m.uid] || ''}
                        onChange={(e) => handleCustomAmtChange(m.uid, e.target.value)}
                        className="w-full pl-6 pr-3 py-2 bg-white border border-natural-border focus:border-natural-primary rounded-lg text-natural-text font-mono text-sm outline-none transition-all"
                        placeholder="0.00"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Third Party Inputs (Conditional) */}
          {splitType === 'third_party' && (
            <div className="bg-natural-sidebar/50 p-4 rounded-2xl border border-natural-border space-y-4 animate-in slide-in-from-top-2 duration-150" id="third-party-inputs">
              <span className="block text-xs font-bold text-natural-text uppercase tracking-wider">Third Person Details</span>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-natural-muted mb-1 font-semibold">Name</label>
                  <input
                    type="text"
                    value={thirdPersonName}
                    onChange={(e) => setThirdPersonName(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-natural-border focus:border-natural-primary rounded-lg text-natural-text font-sans text-sm outline-none transition-all"
                    placeholder="E.g. Sarah"
                    id="third-person-name-input"
                  />
                </div>
                <div>
                  <label className="block text-xs text-natural-muted mb-1 font-semibold">Email</label>
                  <input
                    type="email"
                    value={thirdPersonEmail}
                    onChange={(e) => setThirdPersonEmail(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-natural-border focus:border-natural-primary rounded-lg text-natural-text font-sans text-sm outline-none transition-all"
                    placeholder="sarah@example.com"
                    id="third-person-email-input"
                  />
                </div>
              </div>

              <div className="pt-2 border-t border-natural-border">
                <span className="block text-xs font-bold text-natural-muted uppercase tracking-wider mb-3">Set 3-Way Split Percentages</span>
                <div className="grid grid-cols-2 gap-4">
                  {members.map(m => (
                    <div key={`third-pct-${m.uid}`}>
                      <label className="block text-xs text-natural-muted mb-1 font-semibold">{m.name}</label>
                      <div className="relative">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          max="100"
                          value={thirdPartyPct[m.uid] || ''}
                          onChange={(e) => handleThirdPartyPctChange(m.uid, e.target.value)}
                          className="w-full pr-8 pl-3 py-2 bg-white border border-natural-border focus:border-natural-primary rounded-lg text-natural-text font-mono text-sm outline-none transition-all"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-natural-muted text-xs font-mono">%</span>
                      </div>
                    </div>
                  ))}
                  <div>
                    <label className="block text-xs text-natural-muted mb-1 font-semibold">{thirdPersonName || 'Third Person'}</label>
                    <div className="relative">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        max="100"
                        value={thirdPartyPct['third_party'] || ''}
                        onChange={(e) => handleThirdPartyPctChange('third_party', e.target.value)}
                        className="w-full pr-8 pl-3 py-2 bg-white border border-natural-border focus:border-natural-primary rounded-lg text-natural-text font-mono text-sm outline-none transition-all"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-natural-muted text-xs font-mono">%</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Split Detail Preview Box */}
          {numericAmount > 0 && (
            <div className="bg-natural-sidebar/30 p-4 border border-dashed border-natural-border rounded-2xl flex flex-col space-y-2" id="split-preview">
              <span className="text-[10px] font-bold text-natural-muted uppercase tracking-widest flex items-center gap-1">
                <Calculator className="h-3 w-3" /> Split Breakdown
              </span>
              <div className="grid grid-cols-2 gap-4 pt-1">
                {members.map(m => (
                  <div key={`preview-${m.uid}`} className="flex flex-col">
                    <span className="text-xs text-natural-muted font-semibold">{m.name}'s Share ({Math.round(((previewShares[m.uid] || 0) / numericAmount) * 100) || 0}%)</span>
                    <span className="text-lg font-display font-bold text-natural-text">
                      ${(previewShares[m.uid] || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                    <span className="text-[10px] text-natural-text font-medium">
                      {paidBy === m.uid ? 'Paid - No debt' : 'Owes payer'}
                    </span>
                  </div>
                ))}
                {splitType === 'custom_percentage' && guests.filter(g => g.name.trim() || g.pct).map(g => (
                  <div key={`preview-${g.id}`} className="flex flex-col">
                    <span className="text-xs text-natural-muted font-semibold">{g.name.trim() || 'Guest'}'s Share ({parseFloat(g.pct) || 0}%)</span>
                    <span className="text-lg font-display font-bold text-natural-text">
                      ${((numericAmount * (parseFloat(g.pct) || 0)) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                    <span className="text-[10px] text-natural-text font-medium">Guest (this expense)</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Quick settle (new expenses only) */}
          {!editingExpense && (
            <label className="flex items-start gap-3 p-4 bg-natural-sage/20 border border-natural-primary/20 rounded-2xl cursor-pointer">
              <input
                type="checkbox"
                checked={alreadySettled}
                onChange={(e) => setAlreadySettled(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded text-natural-primary focus:ring-natural-primary border-natural-border"
              />
              <span>
                <span className="block text-sm font-bold text-natural-text">Already settled</span>
                <span className="block text-xs text-natural-muted mt-0.5">
                  Everyone's paid up on this one — log it as fully settled (no balances owed). Great for recording a
                  past expense that's already been paid back.
                </span>
              </span>
            </label>
          )}

          {/* Notes */}
          <div>
            <label className="block text-xs font-bold text-natural-text uppercase tracking-wider mb-2">Private Notes (Optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add payment reminders, split notes, or utility breakdown details..."
              rows={2}
              className="w-full p-3 bg-natural-bg/50 hover:bg-natural-bg focus:bg-white border border-natural-border focus:border-natural-primary rounded-xl text-natural-text placeholder-natural-muted/60 font-sans text-sm outline-none transition-all resize-none"
              id="expense-notes-input"
            />
          </div>
        </form>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-natural-border flex items-center justify-end gap-3" id="form-actions">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-natural-muted hover:text-natural-text bg-natural-sidebar hover:bg-natural-sidebar/80 rounded-xl transition-all cursor-pointer"
            id="cancel-btn"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="expense-form"
            className="px-6 py-2.5 text-xs font-semibold text-white bg-natural-primary hover:bg-natural-dark rounded-full shadow-md hover:shadow-lg transition-all cursor-pointer"
            id="save-expense-btn"
          >
            {editingExpense ? 'Update Expense' : 'Save Expense'}
          </button>
        </div>
      </div>
    </div>
  );
}
