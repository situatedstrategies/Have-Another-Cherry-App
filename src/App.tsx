import { getFullMembers, getFullDefaultSplit } from './lib/members';
import { computeMismatchForSettlement } from './lib/mismatch';
import { getRemainingSettlementAmount, getSettlementTotal, getExpenseStatusLabel, getNormalizedExpenseStatus, roundCurrency } from './lib/money';
import { encryptData, decryptData } from './lib/crypto';
import React, { useState, useEffect, useRef } from 'react';
import { collection, query, orderBy, onSnapshot, updateDoc, deleteDoc, doc, setDoc, getDoc, getDocs, where, deleteField } from 'firebase/firestore';
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
import GroupSetup from './components/GroupSetup';
import LegalModal, { LegalDoc } from './components/LegalModal';
import Modal from './components/Modal';
import SettingsModal from './components/SettingsModal';
import PrivacyModal from './components/PrivacyModal';
import { ToastContainer, ToastMessage } from './components/Toast';
import { Plus, Sparkles, RefreshCcw, Settings, X, AlertCircle, Check } from 'lucide-react';

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

// Union two lists of {id,...} without losing either side's entries. Used to
// merge an incoming (remote) expense onto our local copy so a concurrently-added
// settlement and comment don't clobber each other. A settlement that is
// 'confirmed' on either side stays confirmed (status only moves forward).
function mergeById<T extends { id: string }>(local: T[] = [], incoming: T[] = []): T[] {
  const byId = new Map<string, T>();
  for (const item of local) byId.set(item.id, item);
  for (const item of incoming) {
    const existing = byId.get(item.id) as any;
    if (existing && (existing.status === 'confirmed' || (item as any).status === 'confirmed')) {
      byId.set(item.id, { ...existing, ...item, status: 'confirmed' });
    } else {
      byId.set(item.id, existing ? { ...existing, ...item } : item);
    }
  }
  return Array.from(byId.values());
}

// Merge a remote expense onto the local copy: scalar fields take the incoming
// version, but settlements/comments are unioned by id so concurrent edits from
// two members don't erase each other. Status is re-derived from the result.
function mergeExpense(local: Expense, incoming: Expense): Expense {
  const merged: Expense = {
    ...incoming,
    settlements: mergeById(local.settlements, incoming.settlements),
    comments: mergeById(local.comments, incoming.comments),
  };
  merged.status = getNormalizedExpenseStatus(merged);
  return merged;
}

// Consistent, branded loading screen — same background as every other screen so
// switching between them never flashes white or a stale page.
function LoadingScreen({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="min-h-screen bg-natural-bg flex flex-col items-center justify-center animate-in fade-in duration-300">
      <RefreshCcw className="h-8 w-8 text-natural-primary animate-spin mb-3" />
      <p className="text-natural-muted text-xs font-mono">{label}</p>
    </div>
  );
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
    if (!activeUser || !group) return;
    const groupId = group.id;
    const q = query(collection(db, 'transfer_queue'), where('to', '==', activeUser));
    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const newExps: Expense[] = [];
      const deletedIds: string[] = [];
      for (const change of snapshot.docChanges()) {
        if (change.type !== 'added') continue;
        const data = change.doc.data();
        // Ignore (but don't delete) messages for a different group — e.g. leftover
        // items from a group the user has since left.
        if (data.groupId && data.groupId !== groupId) continue;
        try {
          const decrypted = await decryptData(data.payload, groupId);
          // Decrypt failed: leave the message queued so it can be retried later,
          // instead of silently and permanently dropping the update.
          if (!decrypted) continue;
          if (data.action === 'DELETE') deletedIds.push(decrypted.id);
          else newExps.push(decrypted);
          // Only remove the message once we've successfully decrypted it.
          deleteDoc(doc(db, 'transfer_queue', change.doc.id)).catch(console.error);
        } catch (e) {
          console.error(e);
        }
      }

      if (newExps.length === 0 && deletedIds.length === 0) return;
      setExpenses(prev => {
        let updated = prev.filter(e => !deletedIds.includes(e.id));
        for (const exp of newExps) {
          const idx = updated.findIndex(e => e.id === exp.id);
          if (idx >= 0) updated[idx] = mergeExpense(updated[idx], exp);
          else updated.push(exp);
        }
        updated.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        try {
          localStorage.setItem('expenses_' + groupId, JSON.stringify(updated));
        } catch (e) {
          console.error('Failed to persist expenses to localStorage', e);
        }
        return updated;
      });
    }, (error) => {
      console.error('transfer_queue listener error:', error);
    });
    return () => unsubscribe();
  }, [activeUser, group?.id]);
  

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
    return <div className="animate-in fade-in duration-300"><AuthScreen /></div>;
  }

  if (isLoading) {
    return <LoadingScreen label="Loading your ledger…" />;
  }

  if (userProfile && !userProfile.financialProfile) {
    return <div className="animate-in fade-in duration-300"><ProfileSetup userId={activeUser} onComplete={() => {
      import('firebase/firestore').then(({ getDoc, doc }) => {
        import('./firebase').then(({ db }) => {
          getDoc(doc(db, 'users', activeUser)).then(userDoc => {
            if (userDoc.exists()) {
              setUserProfile(userDoc.data() as any);
            }
          });
        });
      });
    }} /></div>;
  }

  // The user belongs to a group but its data hasn't arrived yet — show a loading
  // screen, NOT the create/join screen, so we never flash the wrong page.
  if (userProfile?.groupId && !group) {
    return <LoadingScreen label="Loading your group…" />;
  }

  if (!userProfile?.groupId) {
    return <div className="animate-in fade-in duration-300"><GroupSetup onComplete={(groupId) => {
      setUserProfile(prev => ({...prev, groupId}));
    }} /></div>;
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

  // Scrub the current user out of their group document. Shared by "Leave Group"
  // and "Delete Account". Redistributes the leaver's split percentage across the
  // remaining members so household-default expenses still bill 100%, and deletes
  // the group entirely if the last member leaves (no orphaned dead group).
  const removeSelfFromGroup = async () => {
    if (!group) return;
    const groupRef = doc(db, 'groups', group.id);
    const newMembers = group.members.filter(m => m.uid !== activeUser);
    const newMemberIds = (group.memberIds || []).filter(id => id !== activeUser);

    // Last member out — delete the whole group rather than leaving a dead,
    // empty group that still occupies its invite code.
    if (newMemberIds.length === 0) {
      await deleteDoc(groupRef);
      return;
    }

    // Redistribute the leaver's percentage across the remaining joined members
    // (proportional to their current shares) so the default split still sums to
    // 100. Pending ghost slots in availableSplits are left untouched.
    const split = group.defaultSplit || {};
    const leaverPct = Number(split[activeUser]) || 0;
    const newDefault: Record<string, number> = {};
    newMemberIds.forEach(uid => { newDefault[uid] = Number(split[uid]) || 0; });
    const joinedSum = newMemberIds.reduce((sum, uid) => sum + (Number(split[uid]) || 0), 0);
    if (leaverPct > 0) {
      let acc = 0;
      newMemberIds.forEach((uid, i) => {
        const base = Number(split[uid]) || 0;
        const add = i === newMemberIds.length - 1
          ? leaverPct - acc
          : Math.round(leaverPct * (joinedSum > 0 ? base / joinedSum : 1 / newMemberIds.length));
        acc += add;
        newDefault[uid] = base + add;
      });
    }

    await updateDoc(groupRef, {
      members: newMembers,
      memberIds: newMemberIds,
      defaultSplit: newDefault,
    });
  };

  // Delete the queue messages addressed to this user (allowed by the rules for
  // to == self). Best-effort cleanup during account deletion.
  const deleteMyInboundQueue = async () => {
    if (!activeUser) return;
    try {
      const snap = await getDocs(query(collection(db, 'transfer_queue'), where('to', '==', activeUser)));
      await Promise.allSettled(snap.docs.map(d => deleteDoc(d.ref)));
    } catch (e) {
      console.error('Failed to clean up inbound queue', e);
    }
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

      // Firestore cleanup must happen while still authenticated (these writes
      // need auth), so they precede the auth-account deletion.
      // 1. Remove from the shared group (re-normalizes split / deletes empty group).
      await removeSelfFromGroup();

      // 2. Clean up the queue messages addressed to this user.
      await deleteMyInboundQueue();

      // 3. Delete the Firestore profile.
      await deleteDoc(doc(db, 'users', activeUser));

      // 4. Clear local cached ledger data.
      clearLocalData();

      // 5. Delete the Firebase Authentication account (last — it revokes the
      //    auth needed for the steps above).
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

  // Encrypt `payloadObj` and enqueue it for every other group member. Uses
  // allSettled so one member's failed write doesn't abort delivery to the rest,
  // and guards the optional memberIds so a malformed group can't crash the app.
  const broadcastToMembers = async (action: 'UPSERT' | 'DELETE', payloadObj: any) => {
    if (!group) return;
    const encrypted = await encryptData(payloadObj, group.id);
    const otherMembers = (group.memberIds || []).filter(id => id !== activeUser);
    const results = await Promise.allSettled(
      otherMembers.map(memberId =>
        setDoc(doc(collection(db, 'transfer_queue')), {
          to: memberId,
          from: activeUser,
          groupId: group.id,
          action,
          payload: encrypted,
          createdAt: new Date().toISOString(),
        })
      )
    );
    const failed = results.filter(r => r.status === 'rejected').length;
    if (failed > 0) console.error(`broadcastToMembers: ${failed}/${otherMembers.length} member writes failed`);
  };

  const handleAddOrEditExpense = async (formData: Omit<Expense, 'id' | 'createdAt' | 'status' | 'groupId'>) => {
    try {
      if (!group.categories?.includes(formData.category)) {
        const groupRef = doc(db, 'groups', group.id);
        const newCategories = [...(group.categories || []), formData.category];
        await updateDoc(groupRef, { categories: newCategories });
      }

      // "Quick settle": when logging an expense that's already been paid back,
      // mark every debtor's share as a confirmed settlement so it lands closed.
      const quickSettle = (formData as any).quickSettle === true;
      const { quickSettle: _omitQuickSettle, ...cleanForm } = formData as any;

      let finalExpense: Expense;
      if (editingExpense) {
        finalExpense = { ...editingExpense, ...cleanForm };
        // Shares/amount may have changed — re-derive status from the new shares
        // vs. the existing settlements so a previously-"settled" expense doesn't
        // keep hiding newly-created debt (or stay open after a reduction).
        finalExpense.status = getNormalizedExpenseStatus(finalExpense);
        setExpenses(prev => {
          const updated = prev.map(ex => ex.id === finalExpense.id ? finalExpense : ex);
          localStorage.setItem('expenses_' + group.id, JSON.stringify(updated));
          return updated;
        });
        setEditingExpense(null);
        setShowForm(false);
        setSelectedExpense(finalExpense);
      } else {
        const newId = crypto.randomUUID();
        let status: Expense['status'] = 'OPEN';
        let settlements = cleanForm.settlements || [];

        if (quickSettle) {
          const debtors = Object.entries(cleanForm.shares || {}).filter(
            ([uid, share]) => uid !== cleanForm.paidBy && Number(share) > 0
          );
          if (debtors.length > 0) {
            settlements = debtors.map(([uid, share]) => ({
              id: crypto.randomUUID(),
              expenseId: newId,
              paidBy: uid,
              receivedBy: cleanForm.paidBy,
              amount: roundCurrency(Number(share)),
              instrumentType: cleanForm.contributions?.[0]?.instrumentType || 'OTHER',
              label: 'Logged as already settled',
              timestamp: new Date().toISOString(),
              paymentDate: cleanForm.date,
              status: 'confirmed' as const,
            }));
            status = 'CLOSED';
          }
        }

        finalExpense = {
          ...cleanForm,
          settlements,
          id: newId,
          groupId: group.id,
          status,
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
      await broadcastToMembers('UPSERT', finalExpense);
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
          await broadcastToMembers('DELETE', { id });
        }
      } catch (e: any) {
        console.error("Delete error:", e);
        alert("Failed to delete data locally.");
      }
    }
  };

    const syncExpenseUpdate = async (updatedExpense: Expense) => {
    if (!group) return;
    const groupId = group.id;
    setExpenses(prev => {
      const updated = prev.map(e => e.id === updatedExpense.id ? updatedExpense : e);
      try {
        localStorage.setItem('expenses_' + groupId, JSON.stringify(updated));
      } catch (e) {
        console.error('Failed to persist expenses to localStorage', e);
      }
      return updated;
    });
    setSelectedExpense(updatedExpense);
    await broadcastToMembers('UPSERT', updatedExpense);
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

    // Status is derived per-debtor from the actual shares vs. settlements
    // (getNormalizedExpenseStatus), not an aggregate sum — so one overpaid
    // debtor can't mask another's shortfall and mark the whole expense closed.
    const updatedExp: Expense = { ...selectedExpense, settlements };
    updatedExp.status = getNormalizedExpenseStatus(updatedExp);
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

    const updatedExp: Expense = { ...expense, settlements };
    updatedExp.status = getNormalizedExpenseStatus(updatedExp);
    await syncExpenseUpdate(updatedExp);
    addToast('Receipt Confirmed', 'The payment has been confirmed.', 'success');
  };

  // Let the user set/change their display name regardless of how they signed in.
  const handleSaveName = async (newName: string) => {
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
      addToast('Name Updated', 'Your name has been updated.', 'success');
    } catch (e) {
      console.error('Failed to update name', e);
      addToast('Error', 'Could not update your name. Please try again.', 'error');
    }
  };

  const handleRetakeQuiz = async () => {
    try {
      await updateDoc(doc(db, 'users', activeUser), { financialProfile: null });
      setUserProfile((prev: any) => ({ ...prev, financialProfile: null }));
    } catch (e) { console.error('Failed to reset profile', e); }
  };

  const handleResendInvite = (memberName: string) => {
    const email = window.prompt(`Enter email address to send invite to ${memberName}:`);
    if (!email || !group) return;
    fetch('/api/send-invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, groupName: group.name, inviteCode: group.inviteCode }),
    }).then(res => {
      if (res.ok) addToast('Invite Sent', `An invitation has been sent to ${email}`, 'success');
      else addToast('Error', 'Failed to send invite', 'error');
    });
  };

  const handleRecalculateSplit = async () => {
    if (!group) return;
    const uids = Object.keys(groupUsers);
    const inc1 = Number(groupUsers[uids[0]]?.income) || 0;
    const inc2 = Number(groupUsers[uids[1]]?.income) || 0;
    if (inc1 <= 0 || inc2 <= 0) {
      addToast('Cannot Recalculate', 'Both users need valid numerical incomes to calculate.', 'error');
      return;
    }
    const total = inc1 + inc2;
    const pct1 = Math.round((inc1 / total) * 100);
    const pct2 = 100 - pct1;
    try {
      await updateDoc(doc(db, 'groups', group.id), {
        [`defaultSplit.${uids[0]}`]: pct1,
        [`defaultSplit.${uids[1]}`]: pct2,
      });
      addToast('Split Updated', `New split is ${pct1}% / ${pct2}% based on verified incomes.`, 'success');
    } catch (e) {
      console.error('Failed to recalculate split', e);
      addToast('Error', 'Could not update the split. Please try again.', 'error');
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
    <div className="min-h-screen bg-natural-bg text-natural-text font-sans antialiased pb-12 animate-in fade-in duration-300" id="app-root">
      <ToastContainer toasts={toasts} removeToast={removeToast} />
      {/* Cherry Checkered Border Top Strip */}
      <div className="h-px bg-slate-200 w-full" />

      <main className="max-w-4xl lg:max-w-5xl xl:max-w-6xl mx-auto px-4 sm:px-6 pt-6 sm:pt-10">
        
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

          {/* Two-column on large screens: balances become a sticky right rail
              beside the ledger; on phones/iPad-portrait they stay a full-width
              band above the ledger so nothing gets cut off. */}
          <div className="flex flex-col lg:flex-row lg:items-start gap-6">
            <div className="flex-1 min-w-0 space-y-6 order-2 lg:order-1">
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

            <div className="order-1 lg:order-2 lg:w-80 xl:w-96 shrink-0 lg:sticky lg:top-6">
              <StatsSection expenses={expenses} group={group} activeUser={activeUser} orientation="rail" />
            </div>
          </div>
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
          groupKeyHash={group.keyHash}
          localExpenses={expenses}
          setLocalExpenses={setExpenses}
          groupSecret={groupSecret}
          setGroupSecret={setGroupSecret}
        />
      )}
      {showSettings && group && (
        <SettingsModal
          onClose={() => setShowSettings(false)}
          userProfile={userProfile}
          currentUser={currentUser}
          group={group}
          groupUsers={groupUsers}
          onSaveName={handleSaveName}
          onRetakeQuiz={handleRetakeQuiz}
          onRecalculateSplit={handleRecalculateSplit}
          onResendInvite={handleResendInvite}
          onGenerateNewCode={handleGenerateNewInviteCode}
          onLeaveGroup={handleLeaveGroup}
          onOpenBackup={() => { setShowSettings(false); setShowBackup(true); }}
          onOpenPrivacy={() => setShowPrivacyModal(true)}
          onSignOut={() => { setShowSettings(false); handleSignOut(); }}
        />
      )}

      {showPrivacyModal && (
        <PrivacyModal
          onClose={() => setShowPrivacyModal(false)}
          onOpenLegal={(d) => setLegalDoc(d)}
          onExportData={handleExportData}
          onDeleteAccount={handleDeleteAccount}
        />
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

