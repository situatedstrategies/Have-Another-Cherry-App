import { getFullMembers, getFullDefaultSplit } from './lib/members';
import { computeMismatchForSettlement } from './lib/mismatch';
import { getRemainingSettlementAmount, getSettlementTotal, getExpenseStatusLabel, roundCurrency } from './lib/money';
import { encryptData, decryptData } from './lib/crypto';
import React, { useState, useEffect, useRef } from 'react';
import { collection, query, orderBy, onSnapshot, updateDoc, deleteDoc, doc, setDoc, getDoc, where, deleteField } from 'firebase/firestore';
import { onAuthStateChanged, deleteUser, reauthenticateWithPopup, reauthenticateWithCredential, GoogleAuthProvider, EmailAuthProvider, updateProfile } from 'firebase/auth';
import { auth, db, OperationType, handleFirestoreError } from './firebase';
import { Expense, Group, SettleDetails, User as AppUser } from './types';
import StatsSection from './components/StatsSection';
import ExpenseForm from './components/ExpenseForm';
import ExpenseDetail from './components/ExpenseDetail';
import SettleUpModal from './components/SettleUpModal';
import ExpenseList from './components/ExpenseList';
import AuthScreen from './components/AuthScreen';
import ProfileSetup from './components/ProfileSetup';
import BackupModal from './components/BackupModal';
import MonthlyComparisonChart from './components/MonthlyComparisonChart';
import CryptoJS from 'crypto-js';
import GroupSetup from './components/GroupSetup';
import LegalModal, { LegalDoc } from './components/LegalModal';
import { ToastContainer, ToastMessage } from './components/Toast';
import { Plus, Cloud, User, Sparkles, CheckSquare, RefreshCcw, LogOut, Settings, Copy, RefreshCw, X, Download, Trash2, Shield, Lock, FileText, AlertCircle, Check, Edit2 } from 'lucide-react';

function CherryLogo({ className = "h-10 w-10" }: { className?: string }) {
  return (
    <img src="/cherry2transparent.png" alt="Cherry Logo" className={className} style={{ objectFit: 'contain' }} />
  );
}

// A key that changes weekly (ISO week) and when the group size changes, so the
// cached greeting refreshes at most once per week (or when membership changes).
function getGreetingKey(memberCount: number): string {
  const d = new Date();
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((date.getTime() - firstThursday.getTime()) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return `${date.getUTCFullYear()}-W${week}-m${memberCount}`;
}

export default function App() {
  const [currentUser, setCurrentUser] = useState<any>(null);
  const activeUser = currentUser?.uid;
  const [userProfile, setUserProfile] = useState<any>(null);
  const [group, setGroup] = useState<Group | null>(null);
  const [groupUsers, setGroupUsers] = useState<Record<string, any>>({});
  
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Modal / Form States
  const [showForm, setShowForm] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showBackup, setShowBackup] = useState(false);
  const [groupSecret, setGroupSecret] = useState('');
  useEffect(() => {
    if (activeUser) {
      setGroupSecret(localStorage.getItem(`group_secret_${activeUser}`) || '');
    }
  }, [activeUser]);
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const [dismissedWaiting, setDismissedWaiting] = useState(false);
  const [legalDoc, setLegalDoc] = useState<LegalDoc | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [showSettleModal, setShowSettleModal] = useState(false);

  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const isInitialLoadRef = useRef(true);
  
  const addToast = (title: string, message: string, type: 'info' | 'success' | 'error' = 'info') => {
    setToasts(prev => [...prev, { id: Date.now().toString() + Math.random().toString(), title, message, type }]);
  };
  
  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  // 1. Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      if (!user) {
        setIsLoading(false);
      }
    });
    return () => unsubscribe();
  }, []);

  // 2. Fetch User Profile
  useEffect(() => {
    if (!currentUser) return;
    setIsLoading(true);

    const fetchProfile = async () => {
      try {
        const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
        if (userDoc.exists()) {
          const profile = userDoc.data() as any;
          // Backfill a missing/legacy name from the account's sign-in display name
          // (covers both Google and email/password accounts).
          if ((!profile.name || profile.name === 'Anonymous' || profile.name === 'Unknown') && currentUser.displayName) {
            profile.name = currentUser.displayName;
            updateDoc(doc(db, 'users', currentUser.uid), { name: currentUser.displayName }).catch(() => {});
          }
          setUserProfile(profile);
        } else {
          setUserProfile({}); // Setup required
        }
      } catch (error) {
        console.error("Error fetching profile", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchProfile();
  }, [currentUser]);

  // 2b. Listen to Group
  useEffect(() => {
    if (!userProfile?.groupId) return;
    const groupUnsubscribe = onSnapshot(doc(db, 'groups', userProfile.groupId), (groupSnapshot) => {
      if (groupSnapshot.exists()) {
        setGroup(groupSnapshot.data() as Group);
      }
    }, (error) => {
      console.error('groupUnsubscribe error:', error);
    });
    return () => groupUnsubscribe();
  }, [userProfile?.groupId]);

  useEffect(() => {
    if (!group || !group.memberIds || group.memberIds.length === 0) return;
    const q = query(collection(db, 'users'), where('__name__', 'in', group.memberIds));
    const unsub = onSnapshot(q, (snap) => {
      const users: Record<string, any> = {};
      snap.forEach(d => { users[d.id] = d.data(); });
      setGroupUsers(users);
    });
    return () => unsub();
  }, [group?.memberIds]);

  
  
  
  // Local Storage for Expenses
  useEffect(() => {
    if (activeUser && group) {
      const stored = localStorage.getItem('expenses_' + group.id);
      if (stored) {
        try {
          setExpenses(JSON.parse(stored));
        } catch(e) {
          console.error(e);
        }
      } else {
        setExpenses([]);
      }
    }
  }, [activeUser, group]);

  // Sync Queue Listener
  useEffect(() => {
    if (activeUser && group) {
      const q = query(collection(db, 'transfer_queue'), where('to', '==', activeUser));
      const unsubscribe = onSnapshot(q, async (snapshot) => {

        let newExps = [];
        let deletedIds = [];
        for (const change of snapshot.docChanges()) {
          if (change.type === 'added') {
            const data = change.doc.data();
            try {
              const decrypted = await decryptData(data.payload, group.id);
              if (decrypted) {
                if (data.action === 'DELETE') {
                  deletedIds.push(decrypted.id);
                } else {
                  newExps.push(decrypted);
                }
              }
              // Delete message after receiving
              deleteDoc(doc(db, 'transfer_queue', change.doc.id)).catch(console.error);
            } catch(e) {
              console.error(e);
            }
          }
        }
        
        if (newExps.length > 0 || deletedIds.length > 0) {
          setExpenses(prev => {
            let updated = [...prev];
            // Handle deletes
            updated = updated.filter(e => !deletedIds.includes(e.id));
            // Handle upserts
            for (const exp of newExps) {
              const idx = updated.findIndex(e => e.id === exp.id);
              if (idx >= 0) updated[idx] = exp;
              else updated.push(exp);
            }
            updated.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());
            localStorage.setItem('expenses_' + group.id, JSON.stringify(updated));
            return updated;
          });
        }
      }, (error) => {
        console.error('transfer_queue unsubscribe error:', error);
      });
      return () => unsubscribe();
    }
  }, [activeUser, group]);
  

  // Weekly cherry greeting: generate once per week (per group size) and cache it
  // on the user doc so we don't call the AI on every load.
  useEffect(() => {
    if (!activeUser || !userProfile?.financialProfile || !group) return;
    const memberCount = group.memberIds?.length || 1;
    const key = getGreetingKey(memberCount);
    if (userProfile.weeklyGreeting?.key === key && userProfile.weeklyGreeting?.text) return;

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/generate-greeting', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            memberCount,
            profileType: userProfile.financialProfile?.type,
            greetingTone: userProfile.financialProfile?.greetingTone,
          }),
        });
        const data = await res.json();
        const text = (data.greeting || '').trim();
        if (!text || cancelled) return;
        const weeklyGreeting = { text, key };
        updateDoc(doc(db, 'users', activeUser), { weeklyGreeting }).catch(() => {});
        setUserProfile((prev: any) => ({ ...(prev || {}), weeklyGreeting }));
      } catch (e) {
        console.error('Weekly greeting fetch failed', e);
      }
    })();
    return () => { cancelled = true; };
  }, [activeUser, group?.memberIds?.length, userProfile?.financialProfile?.type, userProfile?.weeklyGreeting?.key]);

  // Update selectedExpense ref if background data updates
  useEffect(() => {
    if (selectedExpense) {
      const updated = expenses.find(e => e.id === selectedExpense.id);
      if (updated) {
        setSelectedExpense(updated);
      }
    }
  }, [expenses]);

  if (!currentUser) {
    return <AuthScreen />;
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-natural-bg flex flex-col items-center justify-center">
        <RefreshCcw className="h-8 w-8 text-natural-primary animate-spin mb-3" />
        <p className="text-natural-muted text-xs font-mono">Loading data...</p>
      </div>
    );
  }

  if (userProfile && !userProfile.financialProfile) {
    return <ProfileSetup userId={activeUser} onComplete={() => {
      import('firebase/firestore').then(({ getDoc, doc }) => {
        import('./firebase').then(({ db }) => {
          getDoc(doc(db, 'users', activeUser)).then(userDoc => {
            if (userDoc.exists()) {
              setUserProfile(userDoc.data() as any);
            }
          });
        });
      });
    }} />;
  }

  if (!userProfile?.groupId || !group) {
    return <GroupSetup onComplete={(groupId) => {
      // It will auto update via snapshot/effect hopefully, but we can force reload or set states
      setUserProfile(prev => ({...prev, groupId}));
    }} />;
  }

  // Non-blocking: members who are in the group but haven't finished their quiz yet.
  // We no longer lock the whole app on this — the ledger is usable right away and we
  // surface a gentle, dismissible banner instead (see below).
  const missingProfiles = (group.memberIds || []).filter(
    id => id !== activeUser && groupUsers[id] && !groupUsers[id]?.financialProfile
  );

  // Active User is current user
  let hasIncomeDiscrepancy = false;
  if (groupUsers && Object.keys(groupUsers).length >= 2) {
    const userIds = Object.keys(groupUsers);
    for (let i = 0; i < userIds.length; i++) {
      for (let j = i + 1; j < userIds.length; j++) {
        const u1 = groupUsers[userIds[i]];
        const u2 = groupUsers[userIds[j]];
        
        const u1Income = Number(u1.income);
        const u1PartnerEst = Number(u1.partnerIncome);
        const u2Income = Number(u2.income);
        const u2PartnerEst = Number(u2.partnerIncome);
        
        if (u1Income && u2PartnerEst && Math.abs(u1Income - u2PartnerEst) > u1Income * 0.1) hasIncomeDiscrepancy = true;
        if (u2Income && u1PartnerEst && Math.abs(u2Income - u1PartnerEst) > u2Income * 0.1) hasIncomeDiscrepancy = true;
      }
    }
  }
  

  // We need to modify all our handlers to use the new group data structure
    const handleGenerateNewInviteCode = async () => {
    if (!group) return;
    try {
      const newCode = Math.random().toString(36).substring(2, 8).toUpperCase();
      const groupRef = doc(db, 'groups', group.id);
      await updateDoc(groupRef, { inviteCode: newCode });
      addToast('Invite Code Updated', 'A new invite code has been generated.', 'success');
    } catch (e) {
      console.error(e);
      addToast('Error', 'Failed to generate new code.', 'info');
    }
  };

  const handleSignOut = () => {
    setUserProfile({} as any);
    setGroup(null);
    setExpenses([]);
    auth.signOut();
  };

  const handleAddComment = async (expenseId: string, text: string) => {
    if (!group) return;
    const expense = expenses.find(e => e.id === expenseId);
    if (!expense) return;

    const newComment = {
      id: crypto.randomUUID(),
      userId: activeUser,
      text,
      timestamp: new Date().toISOString()
    };
    const updatedExp = { ...expense, comments: [...(expense.comments || []), newComment] };
    await syncExpenseUpdate(updatedExp);
      
      
  };

  const handleExportData = () => {
    if (!group) return;

    const allMembers = getFullMembers(group);

    const escapeCsv = (value: unknown): string => {
      const text = String(value ?? '');
      return `"${text.replace(/"/g, '""')}"`;
    };

    // The CSV only gains the "Participant Type" column (and guest rows) once at
    // least one expense includes an added cherry (extra participant). With no
    // extras anywhere, the export format is unchanged.
    const hasExtras = expenses.some(e => (e.extraParticipants || []).length > 0);

    let csv = [
      'Title',
      'Amount',
      'Date',
      'Category',
      'Paid By',
      'Status',
      'Split Type',
      'Participant',
      ...(hasExtras ? ['Participant Type'] : []),
      'Original Share',
      'Confirmed Paid',
      'Remaining Balance'
    ].join(',') + '\n';

    // Build a row, inserting the type column only when the extras format is active.
    const rowFor = (
      expense: Expense,
      paidByName: string,
      participant: string,
      type: string,
      originalShare: number,
      confirmedPaid: number,
      remaining: number
    ) => [
      escapeCsv(expense.title),
      roundCurrency(expense.amount).toFixed(2),
      escapeCsv(expense.date),
      escapeCsv(expense.category),
      escapeCsv(paidByName),
      escapeCsv(getExpenseStatusLabel(expense)),
      escapeCsv(expense.splitType),
      escapeCsv(participant),
      ...(hasExtras ? [escapeCsv(type)] : []),
      roundCurrency(originalShare).toFixed(2),
      roundCurrency(confirmedPaid).toFixed(2),
      roundCurrency(remaining).toFixed(2)
    ].join(',') + '\n';

    expenses.forEach(expense => {
      const paidByName =
        allMembers.find(member => member.uid === expense.paidBy)?.name ||
        expense.paidBy;

      Object.entries(expense.shares || {}).forEach(([userId, originalShare]) => {
        if (userId === expense.paidBy) return;

        const participantName =
          allMembers.find(member => member.uid === userId)?.name || userId;

        const confirmedPaid = getSettlementTotal(expense, userId, false);
        const remainingBalance = getRemainingSettlementAmount(expense, userId, false);

        csv += rowFor(expense, paidByName, participantName, 'Member', originalShare || 0, confirmedPaid, remainingBalance);
      });

      if (expense.splitType === 'third_party' && expense.thirdPersonShare) {
        csv += rowFor(expense, paidByName, expense.thirdPersonName || 'Third Person', 'Guest', expense.thirdPersonShare, 0, expense.thirdPersonShare);
      }

      // Per-transaction cherries (guests) — only present when hasExtras is true.
      (expense.extraParticipants || []).forEach(g => {
        csv += rowFor(expense, paidByName, g.name, 'Guest', g.share, 0, g.share);
      });
    });

    const blob = new Blob([csv], {
      type: 'text/csv;charset=utf-8;'
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = url;
    link.download = 'have-another-cherry-ledger.csv';

    document.body.appendChild(link);
    link.click();
    link.remove();

    URL.revokeObjectURL(url);
  };

  // Scrub the current user out of their group document (members list, memberIds,
  // and their slot in the default split). Shared by "Leave Group" and "Delete Account".
  const removeSelfFromGroup = async () => {
    if (!group) return;
    const groupRef = doc(db, 'groups', group.id);
    const newMembers = group.members.filter(m => m.uid !== activeUser);
    const newMemberIds = (group.memberIds || []).filter(id => id !== activeUser);
    await updateDoc(groupRef, {
      members: newMembers,
      memberIds: newMemberIds,
      [`defaultSplit.${activeUser}`]: deleteField()
    });
  };

  // Clear any locally cached ledger data for this user/group.
  const clearLocalData = () => {
    if (group) localStorage.removeItem('expenses_' + group.id);
    if (activeUser) localStorage.removeItem(`group_secret_${activeUser}`);
  };

  const handleLeaveGroup = async () => {
    if (!window.confirm("Leave this group? You'll be removed from the member list and returned to the group setup screen. Your account stays active and you can create or join another group.")) return;
    try {
      await removeSelfFromGroup();
      await updateDoc(doc(db, 'users', activeUser), { groupId: deleteField() });
      clearLocalData();
      setShowSettings(false);
      setShowPrivacyModal(false);
      setUserProfile((prev: any) => ({ ...(prev || {}), groupId: null }));
      setGroup(null);
      setGroupUsers({});
      setExpenses([]);
    } catch (err) {
      console.error("Error leaving group", err);
      alert("Failed to leave the group. Please try again.");
    }
  };

  // Re-authenticate the current user when Firebase requires a recent login before
  // a sensitive operation (account deletion). Handles both Google and email/password.
  const reauthenticate = async () => {
    const user = auth.currentUser;
    if (!user) throw new Error("No signed-in user");
    const providerId = user.providerData[0]?.providerId;
    if (providerId === 'google.com') {
      await reauthenticateWithPopup(user, new GoogleAuthProvider());
    } else if (providerId === 'password') {
      const pw = window.prompt("For your security, please re-enter your password to permanently delete your account:");
      if (!pw) throw new Error("cancelled");
      const credential = EmailAuthProvider.credential(user.email || '', pw);
      await reauthenticateWithCredential(user, credential);
    } else {
      throw new Error("Please sign out and sign back in, then try deleting your account again.");
    }
  };

  const handleDeleteAccount = async () => {
    if (!window.confirm("Permanently delete your account? This removes you from your current group, deletes your app profile, clears local ledger data, and deletes your sign-in account. This action cannot be undone.")) return;
    try {
      // Authenticate before performing destructive operations so a cancelled
      // or failed reauthentication cannot leave the account half-deleted.
      await reauthenticate();

      // 1. Remove from the shared group.
      await removeSelfFromGroup();

      // 2. Delete the Firestore profile.
      await deleteDoc(doc(db, 'users', activeUser));

      // 3. Clear local cached ledger data.
      clearLocalData();

      // 4. Delete the Firebase Authentication account.
      await deleteUser(auth.currentUser!);
      // Auth listener will drop currentUser -> AuthScreen. Reset local state too.
      setShowSettings(false);
      setShowPrivacyModal(false);
      setUserProfile(null);
      setGroup(null);
      setGroupUsers({});
      setExpenses([]);
    } catch (err: any) {
      if (err?.message === 'cancelled') return;
      console.error("Error deleting account", err);
      alert(err?.message || "Failed to delete your account. Please sign out, sign back in, and try again.");
    }
  };

  const pushToTransferQueue = async (expense: Expense, action: 'UPSERT' | 'DELETE') => {
    if (!groupSecret || !group) return;
    const payload = CryptoJS.AES.encrypt(JSON.stringify(expense), groupSecret).toString();
    const otherMembers = group.memberIds.filter(id => id !== activeUser);
    for (const memberId of otherMembers) {
      const qRef = doc(collection(db, 'transfer_queue'));
      await setDoc(qRef, {
        to: memberId,
        from: activeUser,
        groupId: group.id,
        action,
        payload,
        createdAt: new Date().toISOString()
      });
    }
  };

  const handleAddOrEditExpense = async (formData: Omit<Expense, 'id' | 'createdAt' | 'status' | 'groupId'>) => {
    try {
      if (!group.categories?.includes(formData.category)) {
        const groupRef = doc(db, 'groups', group.id);
        const newCategories = [...(group.categories || []), formData.category];
        await updateDoc(groupRef, { categories: newCategories });
      }

      let finalExpense: Expense;
      if (editingExpense) {
        finalExpense = { ...editingExpense, ...formData };
        setExpenses(prev => {
          const updated = prev.map(ex => ex.id === finalExpense.id ? finalExpense : ex);
          localStorage.setItem('expenses_' + group.id, JSON.stringify(updated));
          return updated;
        });
        setEditingExpense(null);
        setShowForm(false);
        setSelectedExpense(finalExpense);
      } else {
        finalExpense = {
          ...formData,
          id: crypto.randomUUID(),
          groupId: group.id,
          status: 'OPEN',
          createdAt: new Date().toISOString()
        };
        setExpenses(prev => {
          const updated = [finalExpense, ...prev];
          localStorage.setItem('expenses_' + group.id, JSON.stringify(updated));
          return updated;
        });
        setShowForm(false);
      }

      // Sync to cloud queue
      if (group) {
        const encrypted = await encryptData(finalExpense, group.id);
        const otherMembers = group.memberIds.filter(id => id !== activeUser);
        for (const memberId of otherMembers) {
          const qRef = doc(collection(db, 'transfer_queue'));
          await setDoc(qRef, {
            to: memberId,
            from: activeUser,
            groupId: group.id,
            action: 'UPSERT',
            payload: encrypted,
            createdAt: new Date().toISOString()
          });
        }
      }
    } catch (e) {
      console.error(e);
      alert('Failed to save expense locally or sync.');
    }
  };

  const handleDeleteExpense = async (id: string) => {
    if (window.confirm("Are you sure you want to delete this expense?")) {
      try {
        const expenseToDelete = expenses.find(e => e.id === id);
        setExpenses(prev => {
          const updated = prev.filter(e => e.id !== id);
          localStorage.setItem('expenses_' + group?.id, JSON.stringify(updated));
          return updated;
        });
        setSelectedExpense(null);
        
        if (expenseToDelete && group) {
          const encrypted = await encryptData({ id }, group.id);
          const otherMembers = group.memberIds.filter(mid => mid !== activeUser);
          for (const memberId of otherMembers) {
            const qRef = doc(collection(db, 'transfer_queue'));
            await setDoc(qRef, {
              to: memberId,
              from: activeUser,
              action: 'DELETE',
              payload: encrypted,
              createdAt: new Date().toISOString()
            });
          }
        }
      } catch (e: any) {
        console.error("Delete error:", e);
        alert("Failed to delete data locally.");
      }
    }
  };

    const syncExpenseUpdate = async (updatedExpense: Expense) => {
    setExpenses(prev => {
      const updated = prev.map(e => e.id === updatedExpense.id ? updatedExpense : e);
      localStorage.setItem('expenses_' + group.id, JSON.stringify(updated));
      return updated;
    });
    setSelectedExpense(updatedExpense);
    if (group) {
      const encrypted = await encryptData(updatedExpense, group.id);
      const otherMembers = group.memberIds.filter(mid => mid !== activeUser);
      for (const memberId of otherMembers) {
        const qRef = doc(collection(db, 'transfer_queue'));
        await setDoc(qRef, {
          to: memberId,
          from: activeUser,
          action: 'UPSERT',
          payload: encrypted,
          createdAt: new Date().toISOString()
        });
      }
    }
  };

  const handleSettleUpProposal = async (instrumentType: import('./types').PaymentInstrument, amount: number, label: string, debtorId: string, paymentDate?: string) => {
    if (!selectedExpense || !group) return;

    const normalizedAmount = roundCurrency(amount);
    const remainingAmount = getRemainingSettlementAmount(selectedExpense, debtorId, true);

    if (
      !group.memberIds.includes(debtorId) ||
      !Number.isFinite(normalizedAmount) ||
      normalizedAmount <= 0 ||
      normalizedAmount > remainingAmount
    ) {
      addToast(
        'Invalid Payment',
        `Payment must be between $0.01 and $${remainingAmount.toFixed(2)}.`,
        'info'
      );
      return;
    }
    
    const isCreditor = selectedExpense.paidBy === activeUser;
    
    const newSettlement: import('./types').Settlement = {
      id: crypto.randomUUID(),
      expenseId: selectedExpense.id,
      paidBy: debtorId,
      receivedBy: selectedExpense.paidBy,
      amount: normalizedAmount,
      instrumentType: instrumentType,
      label: label,
      timestamp: new Date().toISOString(),
      paymentDate: paymentDate || new Date().toISOString().split('T')[0],
      status: isCreditor ? 'confirmed' : 'pending',
      mismatchType: computeMismatchForSettlement(selectedExpense, instrumentType)
    };

    const settlements = [...(selectedExpense.settlements || []), newSettlement];
    
    // Check if fully settled
    let allConfirmedTotal = 0;
    let allOwedTotal = 0;
    Object.entries(selectedExpense.shares || {}).forEach(([uid, share]) => {
      if (uid !== selectedExpense.paidBy) allOwedTotal += share;
    });
    settlements.forEach(s => {
      if (s.status === 'confirmed') allConfirmedTotal += s.amount;
    });
    
    const isFullySettled = allConfirmedTotal >= allOwedTotal - 0.01;
    const newStatus: Expense['status'] = isFullySettled ? 'CLOSED' : 'PARTIALLY_SETTLED';

    const updatedExp: Expense = { ...selectedExpense, status: newStatus, settlements };
    try {
      setShowSettleModal(false);
      addToast(isCreditor ? 'Payment Logged' : 'Settlement Logged', isCreditor ? 'The received payment was recorded.' : 'Your payment is pending confirmation.', 'success');
      await syncExpenseUpdate(updatedExp);
      
      // Write mismatch to protected collection
      const computedMismatch = computeMismatchForSettlement(selectedExpense, instrumentType);
      if (computedMismatch !== 'NOT_CLASSIFIABLE' && computedMismatch !== 'NO_MISMATCH') {
        const mismatchRef = doc(db, 'group_mismatches', group.id, 'events', newSettlement.id);
        await setDoc(mismatchRef, {
          expenseId: selectedExpense.id,
          settlementId: newSettlement.id,
          mismatchType: computedMismatch,
          paidBy: debtorId,
          receivedBy: selectedExpense.paidBy,
          amount: normalizedAmount,
          timestamp: newSettlement.timestamp
        }).catch(e => console.error("Data write failed", e));
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleConfirmSettleReceipt = async (settlementId: string) => {
    if (!group || !selectedExpense) return;
    const expense = expenses.find(e => e.id === selectedExpense.id);
    if (!expense) return;

    const settlements = (expense.settlements || []).map(s => 
      s.id === settlementId ? { ...s, status: 'confirmed' as const } : s
    );

    // Check if fully settled
    let allConfirmedTotal = 0;
    let allOwedTotal = 0;
    Object.entries(expense.shares || {}).forEach(([uid, share]) => {
      if (uid !== expense.paidBy) allOwedTotal += share;
    });
    settlements.forEach(s => {
      if (s.status === 'confirmed') allConfirmedTotal += s.amount;
    });

    const isFullySettled = allConfirmedTotal >= allOwedTotal - 0.01;
    const newStatus: Expense['status'] = isFullySettled ? 'CLOSED' : 'PARTIALLY_SETTLED';

    const updatedExp = { 
      ...expense, 
      status: newStatus, 
      settlements 
    };
    await syncExpenseUpdate(updatedExp);
    addToast('Receipt Confirmed', 'The payment has been confirmed.', 'success');
  };

  // Let the user set/change their display name regardless of how they signed in.
  const handleSaveName = async () => {
    const newName = nameInput.trim();
    if (!newName) {
      addToast('Name Required', 'Please enter a name.', 'info');
      return;
    }
    try {
      await updateDoc(doc(db, 'users', activeUser), { name: newName });
      if (auth.currentUser) {
        try { await updateProfile(auth.currentUser, { displayName: newName }); } catch (e) { console.error(e); }
      }
      // Keep the group's stored member list in sync so the name shows everywhere.
      if (group && group.members?.some(m => m.uid === activeUser)) {
        const newMembers = group.members.map(m => m.uid === activeUser ? { ...m, name: newName } : m);
        await updateDoc(doc(db, 'groups', group.id), { members: newMembers });
      }
      setUserProfile((prev: any) => ({ ...(prev || {}), name: newName }));
      setEditingName(false);
      addToast('Name Updated', 'Your name has been updated.', 'success');
    } catch (e) {
      console.error('Failed to update name', e);
      addToast('Error', 'Could not update your name. Please try again.', 'error');
    }
  };

  // Payments logged by others that are waiting for THIS user to confirm receipt.
  const pendingToConfirm = expenses.filter(e =>
    (e.settlements || []).some(s => s.status === 'pending' && s.receivedBy === activeUser)
  );
  const pendingConfirmCount = pendingToConfirm.reduce(
    (n, e) => n + (e.settlements || []).filter(s => s.status === 'pending' && s.receivedBy === activeUser).length,
    0
  );

  return (
    <div className="min-h-screen bg-natural-bg text-natural-text font-sans antialiased pb-12" id="app-root">
      <ToastContainer toasts={toasts} removeToast={removeToast} />
      {/* Cherry Checkered Border Top Strip */}
      <div className="h-px bg-slate-200 w-full" />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 pt-6 sm:pt-10">
        
        {hasIncomeDiscrepancy && (
          <div className="mb-6 bg-natural-sidebar border-l-4 border-natural-primary p-4 rounded-r-xl shadow-sm animate-in fade-in slide-in-from-top-2">
            <div className="flex gap-3 items-start">
              <Sparkles className="h-5 w-5 text-natural-primary shrink-0 mt-0.5" />
              <div>
                <h3 className="text-sm font-bold text-natural-text">Conversation Starter: Financial Alignment</h3>
                <p className="text-sm text-natural-muted mt-1">
                  It looks like there's a discrepancy between what you reported as your income and what your partner estimated (or vice versa).
                  Money conversations can be tough, but clarity is the first step to fairness!
                </p>
                <div className="mt-2 text-xs font-medium text-natural-primary cursor-pointer hover:underline">
                  Review Financial Profiles
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Top bar */}
        <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8" id="app-header">
          <div className="flex items-start gap-4 relative">
            <div className="shrink-0 p-1 bg-white border border-natural-border rounded-2xl shadow-sm hover:scale-105 transition-transform duration-300">
              <CherryLogo className="h-14 w-14" />
            </div>
            <div>
              <h1 className="text-3xl sm:text-4xl font-display font-black tracking-tight text-natural-text mt-1">
                Have Another Cherry
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-3" id="header-controls">
            <button
              onClick={() => {
                setEditingExpense(null);
                setShowForm(true);
              }}
              className="bg-natural-primary hover:bg-natural-dark text-white font-semibold text-xs px-5 py-2.5 rounded-full shadow-md hover:shadow-lg flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <Plus className="h-4 w-4" /> Log Expense
            </button>
          </div>
        </header>

        <div className="space-y-6" id="dashboard-content">
          <div className="bg-white border border-natural-border rounded-xl p-4 shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3" id="welcome-banner">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-natural-sage text-natural-primary rounded-xl">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-natural-text">
                  Welcome back, <span className="capitalize">{userProfile?.name || currentUser?.displayName || 'Friend'}</span>!
                </h3>
                {userProfile?.weeklyGreeting?.text && (
                  <p className="text-xs text-natural-primary font-medium mt-1 italic leading-snug max-w-md">
                    {userProfile.weeklyGreeting.text}
                  </p>
                )}
                <p className="text-[11px] text-natural-muted mt-0.5">
                  Group: <strong className="text-natural-text">{group.name || 'Unnamed Group'}</strong>
                </p>
              </div>
            </div>
            <div className="flex justify-end">
              <button 
                onClick={() => setShowSettings(true)}
                className="text-natural-muted hover:text-natural-primary flex items-center gap-1.5 transition-colors bg-white px-3 py-1.5 border border-natural-border rounded-md shadow-sm"
                title="Account Settings"
              >
                <Settings size={14} />
                <span className="text-xs font-semibold uppercase tracking-widest">Settings</span>
              </button>
            </div>
          </div>

          {pendingConfirmCount > 0 && (
            <div className="bg-natural-primary/5 border border-natural-primary/30 rounded-xl p-4 shadow-sm flex items-start gap-3 animate-in fade-in slide-in-from-top-2">
              <div className="relative shrink-0 mt-0.5">
                <AlertCircle className="h-5 w-5 text-natural-primary" />
                <span className="absolute -top-1.5 -right-1.5 bg-natural-primary text-white text-[10px] font-bold rounded-full h-4 min-w-4 px-1 flex items-center justify-center">
                  {pendingConfirmCount}
                </span>
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-bold text-natural-text">
                  {pendingConfirmCount === 1 ? 'A payment needs your confirmation' : `${pendingConfirmCount} payments need your confirmation`}
                </h3>
                <p className="text-xs text-natural-muted mt-1">
                  Someone logged a payment to you. Confirm receipt so it clears and updates their balance.
                </p>
              </div>
              <button
                onClick={() => setSelectedExpense(pendingToConfirm[0])}
                className="shrink-0 bg-natural-primary hover:bg-natural-dark text-white font-semibold text-xs px-4 py-2 rounded-full shadow-sm transition-colors"
              >
                Review
              </button>
            </div>
          )}

          {missingProfiles.length > 0 && !dismissedWaiting && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 shadow-sm flex items-start gap-3 animate-in fade-in slide-in-from-top-2">
              <Sparkles className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
              <div className="flex-1">
                <h3 className="text-sm font-bold text-natural-text">Some members are still setting up</h3>
                <p className="text-xs text-natural-muted mt-1">
                  You can start logging and settling expenses right away. Income-based splits and financial
                  insights will get more accurate once everyone finishes their profile quiz.
                </p>
                <div className="mt-2 space-y-0.5">
                  {missingProfiles.map(id => (
                    <div key={id} className="text-xs font-medium text-amber-700">
                      {groupUsers[id]?.name || 'A member'} hasn't completed setup yet.
                    </div>
                  ))}
                </div>
              </div>
              <button
                onClick={() => setDismissedWaiting(true)}
                className="text-amber-500 hover:text-amber-700 bg-white/60 p-1 rounded-full border border-amber-200 shrink-0"
                title="Dismiss"
              >
                <X size={14} />
              </button>
            </div>
          )}

          <StatsSection expenses={expenses} group={group} activeUser={activeUser} />

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-natural-muted uppercase tracking-widest">Shared Ledger</h3>
            </div>
            <ExpenseList 
              expenses={expenses} 
              group={group}
              activeUser={activeUser} 
              onExpenseClick={(exp) => setSelectedExpense(exp)} 
            />
          </div>

          <MonthlyComparisonChart expenses={expenses} members={getFullMembers(group)} />
        </div>

        <footer className="text-center text-[10px] text-natural-muted mt-12 space-y-1" id="app-footer">
          <p>Have Another Cherry • Shared Home Ledger</p>
          <p className="font-mono">Real-time Cloud Sync Active</p>
        </footer>
      </main>

      {/* MODALS */}
      {showBackup && (
        <BackupModal 
          onClose={() => setShowBackup(false)}
          activeUser={activeUser}
          groupId={group.id}
          localExpenses={expenses}
          setLocalExpenses={setExpenses}
          groupSecret={groupSecret}
          setGroupSecret={setGroupSecret}
        />
      )}
      {showSettings && (
        <div className="fixed inset-0 bg-natural-bg/80 backdrop-blur-sm z-50 flex justify-center items-center p-4">
          <div className="bg-white rounded-xl shadow-xl border border-natural-border w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200 flex flex-col max-h-[90vh]">
            <div className="flex justify-between items-center p-5 border-b border-natural-border bg-natural-bg/30 shrink-0">
              <h2 className="font-bold text-natural-text font-display flex items-center gap-2">
                <Settings className="h-5 w-5 text-natural-primary" />
                Account Settings
              </h2>
              <button onClick={() => setShowSettings(false)} className="text-natural-muted hover:text-natural-text bg-white p-1 rounded-full border border-natural-border shadow-sm">
                <X size={16} />
              </button>
            </div>
            
            <div className="p-6 space-y-6 overflow-y-auto">
              <div>
                <h3 className="text-xs font-bold text-natural-muted uppercase tracking-wider mb-2">User Profile</h3>
                <div className="bg-natural-bg/50 p-4 rounded-xl border border-natural-border space-y-2">
                  <div className="flex justify-between items-center gap-2">
                    <span className="text-sm text-natural-muted">Name</span>
                    {editingName ? (
                      <div className="flex items-center gap-1.5">
                        <input
                          value={nameInput}
                          onChange={(e) => setNameInput(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') handleSaveName(); if (e.key === 'Escape') setEditingName(false); }}
                          autoFocus
                          placeholder="Your name"
                          className="w-36 px-2 py-1 text-sm text-right border border-natural-border focus:border-natural-primary rounded-md outline-none"
                        />
                        <button onClick={handleSaveName} className="text-natural-primary hover:text-natural-dark p-1" title="Save"><Check size={16} /></button>
                        <button onClick={() => setEditingName(false)} className="text-natural-muted hover:text-natural-text p-1" title="Cancel"><X size={16} /></button>
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          const current = userProfile?.name && !['Anonymous', 'Unknown'].includes(userProfile.name)
                            ? userProfile.name
                            : (currentUser?.displayName || '');
                          setNameInput(current);
                          setEditingName(true);
                        }}
                        className="flex items-center gap-1.5 group"
                        title="Edit your name"
                      >
                        <span className="text-sm font-semibold text-natural-text capitalize">
                          {userProfile?.name && !['Anonymous', 'Unknown'].includes(userProfile.name)
                            ? userProfile.name
                            : (currentUser?.displayName || 'Add your name')}
                        </span>
                        <Edit2 size={13} className="text-natural-muted group-hover:text-natural-primary" />
                      </button>
                    )}
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-natural-muted">Annual Income</span>
                    <span className="text-sm font-semibold text-natural-text">
                      {userProfile?.income ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(Number(userProfile.income)) : 'N/A'}
                    </span>
                  </div>
                  {userProfile?.financialProfile && (
                    <div className="pt-2 mt-2 border-t border-natural-border">
                      <span className="text-xs text-natural-muted block mb-1">Financial Style</span>
                      <span className="text-sm font-semibold text-natural-primary block">{userProfile.financialProfile.type}</span>
                      <p className="text-xs text-natural-text mt-1 leading-relaxed">{userProfile.financialProfile.description}</p>
                      {Array.isArray(userProfile.financialProfile.traits) && userProfile.financialProfile.traits.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {userProfile.financialProfile.traits.map((t: string, i: number) => (
                            <span key={i} className="text-[10px] font-semibold text-natural-primary bg-natural-sage/40 border border-natural-primary/20 px-2 py-0.5 rounded-full">{t}</span>
                          ))}
                        </div>
                      )}
                      {userProfile.financialProfile.strengths && (
                        <p className="text-xs text-natural-text mt-2"><strong className="text-natural-muted">Strength:</strong> {userProfile.financialProfile.strengths}</p>
                      )}
                      {userProfile.financialProfile.watchouts && (
                        <p className="text-xs text-natural-text mt-1"><strong className="text-natural-muted">Watch-out:</strong> {userProfile.financialProfile.watchouts}</p>
                      )}
                      {userProfile.financialProfile.communicationStyle && (
                        <p className="text-xs text-natural-text mt-1"><strong className="text-natural-muted">Money talk:</strong> {userProfile.financialProfile.communicationStyle}</p>
                      )}
                      {userProfile.financialProfile.quote && (
                        <blockquote className="mt-3 text-xs italic text-natural-muted border-l-2 border-natural-primary/30 pl-2">
                          {userProfile.financialProfile.quote}
                        </blockquote>
                      )}
                      <button 
                        onClick={() => {
                          import('firebase/firestore').then(({ updateDoc, doc }) => {
                            import('./firebase').then(({ db }) => {
                              updateDoc(doc(db, 'users', activeUser), { financialProfile: null });
                              setUserProfile((prev: any) => ({ ...prev, financialProfile: null }));
                            });
                          });
                        }} 
                        className="mt-4 text-xs font-semibold text-natural-primary hover:underline"
                      >
                        Retake Profile Quiz
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <h3 className="text-xs font-bold text-natural-muted uppercase tracking-wider mb-2">Group Details</h3>
                <div className="bg-natural-sage/20 p-4 rounded-xl border border-natural-primary/20 space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-natural-muted">Group Name</span>
                    <span className="text-sm font-semibold text-natural-text">{group?.name || 'Unnamed Group'}</span>
                  </div>
                  
                  <div className="border-t border-natural-border/50 pt-3">
                    <span className="text-sm text-natural-muted block mb-2">Group Members</span>
                    <div className="space-y-3">
                      {group && Object.entries(getFullDefaultSplit(group)).map(([uid, pct]) => {
                        const isGhost = uid.startsWith('ghost_');
                        const memberName = isGhost 
                          ? (group.availableSplits?.find((_, i) => `ghost_${i}` === uid) as any)?.name || 'Unknown'
                          : groupUsers[uid]?.name || 'Unknown';
                        return (
                          <div key={uid} className="flex justify-between items-center text-sm border-b border-natural-border/30 pb-2 last:border-0 last:pb-0">
                            <div>
                              <span className="text-natural-text font-semibold">{memberName}</span>
                              <span className="ml-2 text-xs font-mono text-natural-muted">{Number(pct)}% split</span>
                            </div>
                            <div>
                              {!isGhost ? (
                                <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">Joined</span>
                              ) : (
                                <div className="flex items-center gap-2">
                                  <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">Pending</span>
                                  <button 
                                    onClick={() => {
                                      const email = window.prompt(`Enter email address to send invite to ${memberName}:`);
                                      if (email) {
                                        fetch('/api/send-invite', {
                                          method: 'POST',
                                          headers: { 'Content-Type': 'application/json' },
                                          body: JSON.stringify({
                                            email,
                                            groupName: group.name,
                                            inviteCode: group.inviteCode
                                          })
                                        }).then(res => {
                                          if (res.ok) addToast('Invite Sent', `An invitation has been sent to ${email}`, 'success');
                                          else addToast('Error', 'Failed to send invite', 'error');
                                        });
                                      }
                                    }}
                                    className="text-[10px] uppercase font-bold text-natural-primary hover:underline"
                                  >
                                    Resend Invite
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    {Object.keys(groupUsers).length === 2 && (
                       <button
                         className="mt-3 w-full text-xs font-bold bg-white text-natural-primary py-2 rounded-lg border border-natural-border shadow-sm hover:border-natural-primary transition-colors"
                         onClick={async () => {
                           const uids = Object.keys(groupUsers);
                           const inc1 = Number(groupUsers[uids[0]]?.income) || 0;
                           const inc2 = Number(groupUsers[uids[1]]?.income) || 0;
                           if (inc1 > 0 && inc2 > 0) {
                             const total = inc1 + inc2;
                             const pct1 = Math.round((inc1 / total) * 100);
                             const pct2 = 100 - pct1;
                             
                             import('firebase/firestore').then(({ updateDoc, doc }) => {
                               import('./firebase').then(({ db }) => {
                                 updateDoc(doc(db, 'groups', group!.id), {
                                   [`defaultSplit.${uids[0]}`]: pct1,
                                   [`defaultSplit.${uids[1]}`]: pct2,
                                 });
                                 addToast('Split Updated', `New split is ${pct1}% / ${pct2}% based on verified incomes.`, 'success');
                               });
                             });
                           } else {
                             addToast('Cannot Recalculate', 'Both users need valid numerical incomes to calculate.', 'error');
                           }
                         }}
                       >
                         Recalculate Using Reported Incomes
                       </button>
                    )}
                  </div>
                  
                  <div className="border-t border-natural-border/50 pt-3">
                    <span className="text-sm text-natural-muted block mb-2">Invite Code{(group?.targetNumPeople || 0) > 2 ? 's' : ''}</span>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-white border border-natural-border rounded-lg px-3 py-2 text-center font-mono font-bold tracking-widest text-lg text-natural-text shadow-inner">
                        {group?.inviteCode}
                      </div>
                      <button 
                        onClick={() => navigator.clipboard.writeText(group?.inviteCode || '')}
                        className="p-2.5 bg-white text-natural-muted hover:text-natural-primary border border-natural-border rounded-lg shadow-sm transition-colors"
                        title="Copy to clipboard"
                      >
                        <Copy size={18} />
                      </button>
                    </div>
                  </div>
                  
                  <button
                    onClick={handleGenerateNewInviteCode}
                    className="w-full mt-2 py-2 flex items-center justify-center gap-2 text-xs font-bold text-natural-primary hover:text-natural-dark bg-white border border-natural-primary/30 rounded-lg transition-colors shadow-sm"
                  >
                    <RefreshCw size={14} /> Generate New Code{(group?.targetNumPeople || 0) > 2 ? 's' : ''}
                  </button>

                  <div className="border-t border-natural-border/50 pt-3">
                    <button
                      onClick={handleLeaveGroup}
                      className="w-full py-2 flex items-center justify-center gap-2 text-xs font-bold text-natural-muted hover:text-red-500 bg-white border border-natural-border rounded-lg transition-colors shadow-sm"
                    >
                      <LogOut size={14} /> Leave This Group
                    </button>
                    <p className="text-[11px] text-natural-muted mt-1.5 text-center">Removes you from this group but keeps your account.</p>
                  </div>
                </div>
              </div>

              <div>
                <div>
                <h3 className="text-xs font-bold text-natural-muted uppercase tracking-wider mb-2">Local Ledger</h3>
                <div className="bg-natural-bg/50 p-4 rounded-xl border border-natural-border space-y-3 mb-4">
                  <button 
                    onClick={() => { setShowSettings(false); setShowBackup(true); }}
                    className="w-full py-2 px-3 flex items-center justify-between text-sm font-semibold text-natural-text hover:bg-white border border-transparent hover:border-natural-border rounded-lg transition-colors"
                  >
                    <span className="flex items-center gap-2"><Cloud size={16} className="text-natural-primary" /> Backup & Sync Options</span>
                  </button>
                </div>
              </div>
              <h3 className="text-xs font-bold text-natural-muted uppercase tracking-wider mb-2">Legal & Privacy</h3>
                <div className="bg-natural-bg/50 p-4 rounded-xl border border-natural-border space-y-3">
                  <button 
                    onClick={() => setShowPrivacyModal(true)}
                    className="w-full py-2 px-3 flex items-center justify-between text-sm font-semibold text-natural-text hover:bg-white border border-transparent hover:border-natural-border rounded-lg transition-colors"
                  >
                    <span className="flex items-center gap-2"><Shield size={16} className="text-natural-primary" /> Data, Privacy & Security</span>
                  </button>
                </div>
              </div>
            </div>
            
            <div className="p-5 border-t border-natural-border bg-natural-bg/30">
              <button 
                onClick={() => {
                  setShowSettings(false);
                  handleSignOut();
                }}
                className="w-full flex items-center justify-center gap-2 text-sm font-bold text-red-500 hover:text-red-600 bg-white hover:bg-red-50 border border-red-200 py-2.5 rounded-xl transition-colors shadow-sm"
              >
                <LogOut size={16} /> Sign Out
              </button>
            </div>
          </div>
        </div>
      )}

      {showPrivacyModal && (
        <div className="fixed inset-0 bg-natural-bg/80 backdrop-blur-sm z-50 flex justify-center items-center p-4">
          <div className="bg-white rounded-3xl shadow-xl border border-natural-border w-full max-w-lg max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in duration-200">
            <div className="flex justify-between items-center p-6 border-b border-natural-border bg-natural-bg/30 sticky top-0 z-10 backdrop-blur-md">
              <h2 className="font-bold text-natural-text font-display flex items-center gap-2">
                <Shield className="h-5 w-5 text-natural-primary" />
                Data, Privacy & Security
              </h2>
              <button onClick={() => setShowPrivacyModal(false)} className="text-natural-muted hover:text-natural-text bg-white p-1 rounded-full border border-natural-border shadow-sm">
                <X size={16} />
              </button>
            </div>
            
            <div className="p-6 space-y-8">
              
              <section>
                <h3 className="text-sm font-bold text-natural-text mb-3 flex items-center gap-2">
                  <Lock size={16} className="text-natural-muted" /> How Your Data Is Protected
                </h3>
                <div className="bg-natural-sage/20 p-5 rounded-2xl border border-natural-sage/30 text-sm text-natural-text leading-relaxed space-y-4">
                  <p>
                    Your privacy is our top priority. We have implemented robust technical controls to ensure your financial ledgers and personal information are completely confidential and unreadable by anyone outside your group, including our own developers.
                  </p>
                  <ul className="list-disc pl-5 space-y-2 text-natural-muted">
                    <li><strong>End-to-End Encryption (E2EE):</strong> All expense details and ledgers are fully encrypted on your device (using AES-GCM) before being sent to our database. They can only be decrypted using your group's invite code. Even if our backend developers try to view your database records, they will only see unreadable ciphertext.</li>
                    <li><strong>Anonymized Profiles:</strong> We completely hash your email address (using SHA-256) before storing it in the database. We do not store raw emails alongside your data.</li>
                    <li><strong>Strict Cloud Isolation:</strong> We use strict Firestore backend security rules that physically block cross-group data queries. Groups are completely isolated from one another.</li>
                    <li><strong>Profile Controls:</strong> You can leave your current group and clear the profile information stored by the app. Full sign-in account deletion is not yet available in Alpha Lite and will be implemented before public release.</li>
                  </ul>
                  <div className="bg-white/60 p-4 rounded-xl border border-natural-border/60 text-sm text-natural-dark italic mt-4 shadow-sm">
                    Have Another Cherry was made to make sharing expenses sweet (or sweeter). We built the boring parts well so money stays a detail, not a conversation.
                  </div>
                  <p className="text-xs text-natural-muted mt-2 border-t border-natural-border pt-3">
                    <em>Google Cloud and Firebase are trademarks of Google LLC.</em>
                  </p>
                </div>
              </section>

              <section>
                <h3 className="text-sm font-bold text-natural-text mb-3 flex items-center gap-2">
                  <FileText size={16} className="text-natural-muted" /> Legal Documents
                </h3>
                <div className="space-y-3">
                  <button
                    onClick={() => setLegalDoc('terms')}
                    className="w-full text-left p-4 rounded-xl border border-natural-border bg-natural-bg/50 hover:bg-white hover:border-natural-primary/40 transition-colors flex items-center justify-between gap-2"
                  >
                    <span className="flex flex-col gap-0.5">
                      <span className="font-semibold text-natural-text text-sm">Terms of Service</span>
                      <span className="text-xs text-natural-muted">Read our terms of service.</span>
                    </span>
                    <FileText size={16} className="text-natural-primary shrink-0" />
                  </button>
                  <button
                    onClick={() => setLegalDoc('privacy')}
                    className="w-full text-left p-4 rounded-xl border border-natural-border bg-natural-bg/50 hover:bg-white hover:border-natural-primary/40 transition-colors flex items-center justify-between gap-2"
                  >
                    <span className="flex flex-col gap-0.5">
                      <span className="font-semibold text-natural-text text-sm">Privacy Policy</span>
                      <span className="text-xs text-natural-muted">Read how we handle your data.</span>
                    </span>
                    <Shield size={16} className="text-natural-primary shrink-0" />
                  </button>
                </div>
              </section>

              <section>
                <h3 className="text-sm font-bold text-natural-text mb-3">Your Data Controls</h3>
                <div className="bg-white p-4 rounded-2xl border border-natural-border space-y-3">
                  <button 
                    onClick={handleExportData}
                    className="w-full py-3 px-4 flex items-center justify-between text-sm font-bold text-natural-text hover:bg-natural-bg/50 border border-natural-border rounded-xl transition-all shadow-sm"
                  >
                    <span className="flex items-center gap-2"><Download size={18} className="text-natural-primary" /> Export Data (CSV)</span>
                  </button>
                  
                  <div className="border-t border-natural-border/50"></div>
                  
                  <button
                    onClick={handleDeleteAccount}
                    className="w-full py-3 px-4 flex items-center justify-between text-sm font-bold text-red-500 hover:bg-red-50 border border-red-100 hover:border-red-200 rounded-xl transition-all shadow-sm"
                  >
                    <span className="flex items-center gap-2"><Trash2 size={18} /> Delete Account &amp; All Data</span>
                  </button>
                  <p className="text-[11px] text-natural-muted px-1 leading-relaxed">
                    Permanently deletes your profile, financial data, group membership, and your sign-in account. This cannot be undone.
                  </p>
                </div>
              </section>

            </div>
          </div>
        </div>
      )}

      {showForm && (
        <ExpenseForm
          group={group}
          activeUser={activeUser}
          onClose={() => {
            setShowForm(false);
            setEditingExpense(null);
          }}
          onSubmit={handleAddOrEditExpense}
          editingExpense={editingExpense}
        />
      )}

      {selectedExpense && (
        <ExpenseDetail
          expense={selectedExpense}
          group={group}
          activeUser={activeUser}
          onClose={() => setSelectedExpense(null)}
          onEdit={() => {
            setEditingExpense(selectedExpense);
            setSelectedExpense(null);
            setShowForm(true);
          }}
          onDelete={() => handleDeleteExpense(selectedExpense.id)}
          onSettleClick={() => setShowSettleModal(true)}
          onConfirmReceipt={(settlementId) => handleConfirmSettleReceipt(settlementId)}
          onAddComment={(text) => handleAddComment(selectedExpense.id, text)}
        />
      )}

      {showSettleModal && selectedExpense && (
        <SettleUpModal
          expense={selectedExpense}
          group={group}
          activeUser={activeUser}
          onClose={() => setShowSettleModal(false)}
          onSubmit={handleSettleUpProposal}
        />
      )}

      {legalDoc && <LegalModal doc={legalDoc} onClose={() => setLegalDoc(null)} />}
    </div>
  );
}

