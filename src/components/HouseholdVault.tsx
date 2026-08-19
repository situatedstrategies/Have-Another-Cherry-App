import React, { useEffect, useMemo, useRef, useState } from 'react';
import { doc, getDoc, setDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { encryptData, decryptData } from '../lib/crypto';
import { Expense, VaultBill, VaultDocMeta, VaultData, DEFAULT_CATEGORIES } from '../types';
import Modal from './Modal';
import {
  Vault, CalendarDays, ReceiptText, FileText, Upload, Download, Trash2,
  ChevronLeft, ChevronRight, Plus, RefreshCcw, Repeat, Lock
} from 'lucide-react';

interface HouseholdVaultProps {
  groupId: string;
  activeUser: string;
  expenses: Expense[];
  memberNames: Record<string, string>;
  onClose: () => void;
}

// Firestore caps documents at ~1MB; encrypted base64 inflates a file by ~2.2x,
// so cap uploads well below that. Bigger files need Firebase Storage (later).
const MAX_FILE_BYTES = 400 * 1024;

const EMPTY_VAULT: VaultData = { bills: [], docs: [] };

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

// Step a date forward by a recurring interval (mirrors ExpenseForm's logic).
function stepDate(d: Date, interval?: string): Date {
  const next = new Date(d);
  switch (interval) {
    case 'weekly': next.setDate(next.getDate() + 7); break;
    case 'biweekly': next.setDate(next.getDate() + 14); break;
    case '2_months': next.setMonth(next.getMonth() + 2); break;
    case '3_months': next.setMonth(next.getMonth() + 3); break;
    case '6_months': next.setMonth(next.getMonth() + 6); break;
    case 'yearly': next.setFullYear(next.getFullYear() + 1); break;
    case 'monthly':
    default: next.setMonth(next.getMonth() + 1); break;
  }
  return next;
}

const parseLocalDate = (s: string) => new Date(/^\d{4}-\d{2}-\d{2}$/.test(s) ? s + 'T00:00:00' : s);

const ordinal = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
};

export default function HouseholdVault({ groupId, activeUser, expenses, memberNames, onClose }: HouseholdVaultProps) {
  const [tab, setTab] = useState<'calendar' | 'bills' | 'docs'>('calendar');
  const [vault, setVault] = useState<VaultData>(EMPTY_VAULT);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Calendar month being viewed.
  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());

  // Bill form
  const [billName, setBillName] = useState('');
  const [billAmount, setBillAmount] = useState('');
  const [billDueDay, setBillDueDay] = useState('1');
  const [billCategory, setBillCategory] = useState(DEFAULT_CATEGORIES[1] || 'Utilities');

  // ---- Load / persist (E2E-encrypted with the group key, like the ledger) ----
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'group_vault', groupId));
        if (snap.exists() && snap.data()?.payload) {
          const decrypted = await decryptData(snap.data().payload, groupId);
          if (!cancelled && decrypted && typeof decrypted === 'object') {
            setVault({
              bills: Array.isArray(decrypted.bills) ? decrypted.bills : [],
              docs: Array.isArray(decrypted.docs) ? decrypted.docs : [],
            });
          }
        }
      } catch (e) {
        console.error('Vault load failed', e);
        if (!cancelled) setError('Could not load the vault. Please try again.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [groupId]);

  const persistVault = async (next: VaultData) => {
    setVault(next);
    try {
      const payload = await encryptData(next, groupId);
      await setDoc(doc(db, 'group_vault', groupId), {
        groupId,
        payload,
        updatedAt: new Date().toISOString(),
        updatedBy: activeUser,
      }, { merge: true });
    } catch (e) {
      console.error('Vault save failed', e);
      setError('Could not save to the vault. Please try again.');
    }
  };

  // ---- Bills ----
  const addBill = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const dueDay = Math.min(31, Math.max(1, Math.round(Number(billDueDay) || 1)));
    if (!billName.trim()) { setError('Give the bill a name.'); return; }
    const bill: VaultBill = {
      id: crypto.randomUUID(),
      name: billName.trim(),
      dueDay,
      category: billCategory,
      ...(Number(billAmount) > 0 ? { amount: Math.round(Number(billAmount) * 100) / 100 } : {}),
    };
    await persistVault({ ...vault, bills: [...vault.bills, bill] });
    setBillName(''); setBillAmount(''); setBillDueDay('1');
  };

  const removeBill = async (id: string) => {
    await persistVault({ ...vault, bills: vault.bills.filter(b => b.id !== id) });
  };

  // ---- Documents (encrypted, one Firestore doc per file) ----
  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError('');
    if (file.size > MAX_FILE_BYTES) {
      setError(`That file is ${(file.size / 1024).toFixed(0)}KB — the vault currently holds files up to ${(MAX_FILE_BYTES / 1024).toFixed(0)}KB. Larger storage is coming.`);
      return;
    }
    setBusy(true);
    try {
      const dataBase64: string = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });

      const meta: VaultDocMeta = {
        id: crypto.randomUUID(),
        name: file.name,
        mimeType: file.type || 'application/octet-stream',
        size: file.size,
        uploadedBy: activeUser,
        uploadedAt: new Date().toISOString(),
      };

      const filePayload = await encryptData({ name: meta.name, mimeType: meta.mimeType, dataBase64 }, groupId);
      await setDoc(doc(db, 'group_vault', groupId, 'files', meta.id), {
        payload: filePayload,
        uploadedBy: activeUser,
        uploadedAt: meta.uploadedAt,
      });
      await persistVault({ ...vault, docs: [...vault.docs, meta] });
    } catch (err) {
      console.error('Vault upload failed', err);
      setError('Could not upload that file. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const handleDownload = async (meta: VaultDocMeta) => {
    setError('');
    setBusy(true);
    try {
      const snap = await getDoc(doc(db, 'group_vault', groupId, 'files', meta.id));
      if (!snap.exists() || !snap.data()?.payload) throw new Error('missing');
      const decrypted = await decryptData(snap.data().payload, groupId);
      if (!decrypted?.dataBase64) throw new Error('bad payload');

      const bytes = Uint8Array.from(atob(decrypted.dataBase64), c => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: decrypted.mimeType || meta.mimeType });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = meta.name;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Vault download failed', err);
      setError('Could not open that document. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteDoc = async (meta: VaultDocMeta) => {
    if (!window.confirm(`Delete "${meta.name}" from the vault? This cannot be undone.`)) return;
    setBusy(true);
    try {
      await deleteDoc(doc(db, 'group_vault', groupId, 'files', meta.id));
      await persistVault({ ...vault, docs: vault.docs.filter(d => d.id !== meta.id) });
    } catch (err) {
      console.error('Vault delete failed', err);
      setError('Could not delete that document. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  // ---- Calendar data: vault bills + projected recurring ledger expenses ----
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstWeekday = new Date(viewYear, viewMonth, 1).getDay();

  const dueByDay = useMemo(() => {
    const map: Record<number, { label: string; amount?: number; source: 'bill' | 'expense' }[]> = {};

    for (const bill of vault.bills) {
      const day = Math.min(bill.dueDay, daysInMonth);
      (map[day] ||= []).push({ label: bill.name, amount: bill.amount, source: 'bill' });
    }

    // Project each recurring ledger expense's occurrences into the viewed month.
    const monthStart = new Date(viewYear, viewMonth, 1);
    const monthEnd = new Date(viewYear, viewMonth, daysInMonth, 23, 59, 59);
    for (const exp of expenses) {
      if (!exp.isRecurring || !exp.nextRecurringDate) continue;
      let cursor = parseLocalDate(exp.nextRecurringDate);
      for (let i = 0; i < 40 && cursor <= monthEnd; i++) {
        if (cursor >= monthStart) {
          (map[cursor.getDate()] ||= []).push({ label: exp.title, amount: exp.amount, source: 'expense' });
        }
        cursor = stepDate(cursor, exp.recurringInterval);
      }
    }
    return map;
  }, [vault.bills, expenses, viewYear, viewMonth, daysInMonth]);

  const monthTotal = useMemo(
    () => Object.values(dueByDay).flat().reduce((s, item) => s + (item.amount || 0), 0),
    [dueByDay]
  );

  const shiftMonth = (delta: number) => {
    const d = new Date(viewYear, viewMonth + delta, 1);
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
  };

  const isThisMonth = viewYear === now.getFullYear() && viewMonth === now.getMonth();

  return (
    <Modal
      onClose={onClose}
      title="Household Vault"
      icon={<Vault className="h-5 w-5 text-natural-primary" />}
      size="lg"
      bodyClassName=""
    >
      {/* Tabs */}
      <div className="flex items-center gap-1.5 px-6 pt-4">
        {([
          { key: 'calendar', label: 'Calendar', icon: <CalendarDays size={14} /> },
          { key: 'bills', label: 'Recurring Bills', icon: <ReceiptText size={14} /> },
          { key: 'docs', label: 'Documents', icon: <FileText size={14} /> },
        ] as const).map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-all cursor-pointer ${
              tab === t.key ? 'bg-natural-primary text-white shadow-sm' : 'text-natural-muted hover:text-natural-text bg-natural-sidebar/60 hover:bg-natural-sidebar'
            }`}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      <div className="p-6 space-y-4">
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs font-semibold">{error}</div>
        )}

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-natural-muted text-xs font-mono">
            <RefreshCcw className="h-4 w-4 animate-spin" /> Opening the vault...
          </div>
        ) : tab === 'calendar' ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <button onClick={() => shiftMonth(-1)} className="p-1.5 rounded-lg border border-natural-border text-natural-muted hover:text-natural-text hover:bg-natural-sidebar/50"><ChevronLeft size={16} /></button>
              <div className="text-center">
                <span className="text-sm font-display font-bold text-natural-text">{MONTH_NAMES[viewMonth]} {viewYear}</span>
                {monthTotal > 0 && (
                  <span className="block text-[10px] font-mono text-natural-muted">~${monthTotal.toFixed(2)} in recurring costs</span>
                )}
              </div>
              <button onClick={() => shiftMonth(1)} className="p-1.5 rounded-lg border border-natural-border text-natural-muted hover:text-natural-text hover:bg-natural-sidebar/50"><ChevronRight size={16} /></button>
            </div>

            <div className="grid grid-cols-7 gap-1 text-center">
              {WEEKDAYS.map((d, i) => (
                <span key={i} className="text-[10px] font-bold text-natural-muted uppercase py-1">{d}</span>
              ))}
              {Array.from({ length: firstWeekday }).map((_, i) => <span key={`pad-${i}`} />)}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day = i + 1;
                const items = dueByDay[day] || [];
                const isToday = isThisMonth && day === now.getDate();
                return (
                  <div
                    key={day}
                    className={`min-h-11 rounded-lg border p-1 text-left ${
                      isToday ? 'border-natural-primary bg-natural-sage/30' : items.length ? 'border-natural-primary/30 bg-natural-primary/5' : 'border-natural-border/40'
                    }`}
                    title={items.map(x => `${x.label}${x.amount ? ` ($${x.amount.toFixed(2)})` : ''}`).join('\n')}
                  >
                    <span className={`text-[10px] font-mono ${isToday ? 'font-bold text-natural-primary' : 'text-natural-muted'}`}>{day}</span>
                    {items.slice(0, 2).map((x, idx) => (
                      <span key={idx} className="block text-[9px] leading-tight font-semibold text-natural-text truncate">
                        {x.label}
                      </span>
                    ))}
                    {items.length > 2 && (
                      <span className="block text-[9px] text-natural-muted">+{items.length - 2} more</span>
                    )}
                  </div>
                );
              })}
            </div>

            <p className="text-[11px] text-natural-muted flex items-center gap-1.5">
              <Repeat size={12} className="shrink-0" />
              Shows bills catalogued in the vault plus recurring expenses from your ledger.
            </p>
          </div>
        ) : tab === 'bills' ? (
          <div className="space-y-4">
            <form onSubmit={addBill} className="bg-natural-bg/50 border border-natural-border rounded-2xl p-4 space-y-3">
              <span className="text-xs font-bold text-natural-text uppercase tracking-wider flex items-center gap-1.5"><Plus size={14} /> Catalog a Recurring Bill</span>
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="text" value={billName} onChange={e => setBillName(e.target.value)}
                  placeholder="e.g. Rent, Internet" required
                  className="col-span-2 px-3 py-2 bg-white border border-natural-border rounded-xl text-sm outline-none focus:border-natural-primary"
                />
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-natural-muted text-sm">$</span>
                  <input
                    type="number" min="0" step="0.01" value={billAmount} onChange={e => setBillAmount(e.target.value)}
                    placeholder="Amount (optional)"
                    className="w-full pl-7 pr-3 py-2 bg-white border border-natural-border rounded-xl text-sm outline-none focus:border-natural-primary"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-xs text-natural-muted whitespace-nowrap">Due day</label>
                  <input
                    type="number" min="1" max="31" value={billDueDay} onChange={e => setBillDueDay(e.target.value)} required
                    className="w-full px-3 py-2 bg-white border border-natural-border rounded-xl text-sm outline-none focus:border-natural-primary font-mono"
                  />
                </div>
                <select
                  value={billCategory} onChange={e => setBillCategory(e.target.value)}
                  className="col-span-2 px-3 py-2 bg-white border border-natural-border rounded-xl text-sm outline-none"
                >
                  {DEFAULT_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <button type="submit" className="w-full py-2 text-xs font-bold text-white bg-natural-primary hover:bg-natural-dark rounded-xl transition-colors">
                Add to Vault
              </button>
            </form>

            {vault.bills.length === 0 ? (
              <p className="text-center text-xs text-natural-muted py-4">No recurring bills catalogued yet.</p>
            ) : (
              <div className="space-y-2">
                {vault.bills
                  .slice()
                  .sort((a, b) => a.dueDay - b.dueDay)
                  .map(bill => (
                    <div key={bill.id} className="flex items-center justify-between bg-white border border-natural-border rounded-xl px-4 py-2.5">
                      <div>
                        <span className="text-sm font-semibold text-natural-text">{bill.name}</span>
                        <span className="block text-[11px] text-natural-muted">
                          Due the {ordinal(bill.dueDay)}
                          {bill.category ? ` · ${bill.category}` : ''}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        {bill.amount != null && <span className="text-sm font-mono font-bold text-natural-text">${bill.amount.toFixed(2)}</span>}
                        <button onClick={() => removeBill(bill.id)} className="text-natural-muted hover:text-red-500" title="Remove">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="bg-natural-sage/20 border border-natural-primary/20 rounded-2xl p-4 flex items-start gap-3">
              <Lock className="h-4 w-4 text-natural-primary shrink-0 mt-0.5" />
              <p className="text-xs text-natural-text leading-relaxed">
                Documents are end-to-end encrypted with your group's key before they leave this
                device — the lease, the wifi password, insurance cards. Only group members can open them.
              </p>
            </div>

            <input ref={fileInputRef} type="file" className="hidden" onChange={handleUpload} />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={busy}
              className="w-full py-2.5 text-xs font-bold text-natural-primary bg-white border border-natural-primary/30 hover:bg-natural-sage/30 rounded-xl flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
            >
              <Upload size={14} /> {busy ? 'Working…' : `Upload a Document (up to ${(MAX_FILE_BYTES / 1024).toFixed(0)}KB)`}
            </button>

            {vault.docs.length === 0 ? (
              <p className="text-center text-xs text-natural-muted py-4">Nothing in the vault yet.</p>
            ) : (
              <div className="space-y-2">
                {vault.docs.map(d => (
                  <div key={d.id} className="flex items-center justify-between bg-white border border-natural-border rounded-xl px-4 py-2.5 gap-3">
                    <div className="min-w-0">
                      <span className="text-sm font-semibold text-natural-text truncate block">{d.name}</span>
                      <span className="block text-[11px] text-natural-muted">
                        {(d.size / 1024).toFixed(0)}KB · {memberNames[d.uploadedBy] || 'A member'} · {new Date(d.uploadedAt).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button onClick={() => handleDownload(d)} disabled={busy} className="p-1.5 text-natural-primary hover:bg-natural-sage/40 rounded-lg border border-natural-border disabled:opacity-50" title="Download">
                        <Download size={14} />
                      </button>
                      <button onClick={() => handleDeleteDoc(d)} disabled={busy} className="p-1.5 text-natural-muted hover:text-red-500 rounded-lg border border-natural-border disabled:opacity-50" title="Delete">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
