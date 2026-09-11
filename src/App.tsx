import { getFullMembers, joinedUids, pendingSeats, withAddedSeat, withRemovedSeat } from './lib/members';
import { claimSeats } from './lib/seatClaims';
import { computeMismatchForSettlement } from './lib/mismatch';
import { getRemainingSettlementAmount, getSettlementTotal, getExpenseStatusLabel, getNormalizedExpenseStatus, roundCurrency, isDarkCherry, getDarkCherryRemaining } from './lib/money';
import { mergeExpense } from './lib/merge';
import { advanceIntervalStr, parseLocalDate, todayLocal } from './lib/recurring';
import { encryptData, decryptData } from './lib/crypto';
import { useGroupLedgerSnapshot } from './hooks/useGroupLedgerSnapshot';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { collection, query, onSnapshot, updateDoc, deleteDoc, doc, setDoc, getDoc, getDocs, where, deleteField, arrayRemove } from 'firebase/firestore';
import { onAuthStateChanged, deleteUser, reauthenticateWithPopup, reauthenticateWithCredential, GoogleAuthProvider, OAuthProvider, EmailAuthProvider, updateProfile } from 'firebase/auth';
import { auth, db, authHeader, forgetKeepSignedIn } from './firebase';
import { pushPermission, enableWebPush, disableWebPush, listenForegroundPush } from './lib/push';
import { configureBilling } from './lib/billing';
import ErrorSupportModal from './components/ErrorSupportModal';
import CherryLogo from './components/CherryLogo';
import ModuleBoundary from './components/ModuleBoundary';
import { CHERRY_ERRORS, CherryError } from './lib/errors';
import { normalizeAmount } from './lib/limits';
import { Expense, Group } from './types';
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
import FinancialAlignmentModal from './components/FinancialAlignmentModal';
import PlanPurchase from './components/PlanPurchase';
import HouseholdVault from './components/HouseholdVault';
import RhythmCard from './components/RhythmCard';
import CherryPlusModal from './components/CherryPlusModal';
import OwedBreakdownModal from './components/OwedBreakdownModal';
import { hasPlus } from './lib/entitlements';
import { ToastContainer, ToastMessage } from './components/Toast';
import { Plus, Cloud, Sparkles, RefreshCcw, Settings, X, AlertCircle, Check, ChevronDown, TrendingUp, Vault as VaultIcon, Wallet } from 'lucide-react';

// ISO week plus member count, so the cached greeting refreshes weekly or when membership changes.
function getGreetingKey(memberCount: number): string {
  const d = new Date();
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((date.getTime() - firstThursday.getTime()) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return `${date.getUTCFullYear()}-W${week}-m${memberCount}`;
}

// Same background as every other screen, so switching never flashes white.
function LoadingScreen({ label = 'Loading...' }: { label?: string }) {
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

  // `activeGroupId` is the group being viewed; `groupIds` is the full set. Both
  // fall back to the legacy single `groupId` field.
  const activeGroupId: string | null = userProfile?.activeGroupId || userProfile?.groupId || null;
  const groupIds: string[] = Array.isArray(userProfile?.groupIds) && userProfile.groupIds.length
    ? userProfile.groupIds
    : (userProfile?.groupId ? [userProfile.groupId] : []);
  // For listeners that must not re-subscribe on every profile change.
  const groupIdsRef = useRef<string[]>([]);
  groupIdsRef.current = groupIds;

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [showForm, setShowForm] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showBackup, setShowBackup] = useState(false);
  const [showGroupMenu, setShowGroupMenu] = useState(false);
  const [showAddGroup, setShowAddGroup] = useState(false);
  const [groupSummaries, setGroupSummaries] = useState<Record<string, { name?: string }>>({});
  const [groupSecret, setGroupSecret] = useState('');
  useEffect(() => {
    if (activeUser) {
      setGroupSecret(localStorage.getItem(`group_secret_${activeUser}`) || '');
    }
  }, [activeUser]);
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const [showAlignmentModal, setShowAlignmentModal] = useState(false);
  const [showPlanPurchase, setShowPlanPurchase] = useState(false);
  const [showVault, setShowVault] = useState(false);
  const [showCherryPlus, setShowCherryPlus] = useState(false);
  // The one error dialog, set from any failure point.
  const [supportError, setSupportError] = useState<{ error: CherryError; screen?: string; detail?: string } | null>(null);
  const [owedModal, setOwedModal] = useState<null | 'you_owe' | 'owed_to_you'>(null);
  const [thresholdInput, setThresholdInput] = useState('');
  const [venmoInput, setVenmoInput] = useState('');
  const [zelleInput, setZelleInput] = useState('');
  const [savingThreshold, setSavingThreshold] = useState(false);
  const [savingHandles, setSavingHandles] = useState(false);
  const [dismissedWaiting, setDismissedWaiting] = useState(false);
  const [legalDoc, setLegalDoc] = useState<LegalDoc | null>(null);
  const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [showSettleModal, setShowSettleModal] = useState(false);

  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  // Stable identities so Toast's auto-dismiss timer is not reset on every render.
  const addToast = useCallback((title: string, message: string, type: 'info' | 'success' | 'error' = 'info') => {
    setToasts(prev => [...prev, { id: Date.now().toString() + Math.random().toString(), title, message, type }]);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  // After creating or joining a group (GroupSetup already wrote the docs):
  // make it active locally and clear the previous group's view state.
  const applyJoinedGroup = useCallback((gid: string) => {
    setUserProfile((prev: any) => {
      const prevIds: string[] = Array.isArray(prev?.groupIds) && prev.groupIds.length
        ? prev.groupIds
        : (prev?.groupId ? [prev.groupId] : []);
      const gids = Array.from(new Set([...prevIds, gid]));
      return { ...(prev || {}), groupId: gid, activeGroupId: gid, groupIds: gids };
    });
    setSelectedExpense(null);
    setEditingExpense(null);
    setExpenses([]);
    setGroup(null);
    setGroupUsers({});
    setShowAddGroup(false);
    setShowSettings(false);
    setShowGroupMenu(false);
    setDismissedWaiting(false);
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      if (!user) {
        setIsLoading(false);
      } else {
        // Web billing is keyed to the Firebase uid so a purchase maps to users/{uid}.
        configureBilling(user.uid).catch(console.error);
        // Promo allowlist: the server writes the entitlement and the profile
        // listener picks it up. Silent on failure.
        authHeader()
          .then((h) => fetch('/api/plus-promo-sync', { method: 'POST', headers: h }))
          .catch(() => {});
      }
    });
    return () => unsubscribe();
  }, []);

  // Web push: refresh the token if permission was already granted, and show
  // pushes that arrive while the tab is open as toasts. The first permission
  // ask lives in Settings, behind a click.
  useEffect(() => {
    if (!currentUser) return;
    let unsub: (() => void) | undefined;
    let cancelled = false;
    (async () => {
      if (pushPermission() === 'granted') {
        await enableWebPush(currentUser.uid).catch(() => {});
      }
      const u = await listenForegroundPush((title, body) => addToast(title, body, 'info'));
      if (cancelled) u();
      else unsub = u;
    })();
    return () => { cancelled = true; unsub?.(); };
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) return;
    setIsLoading(true);

    const fetchProfile = async () => {
      try {
        const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
        if (userDoc.exists()) {
          const profile = userDoc.data() as any;
          // Backfill a missing name from the sign-in display name.
          if ((!profile.name || profile.name === 'Anonymous' || profile.name === 'Unknown') && currentUser.displayName) {
            profile.name = currentUser.displayName;
            updateDoc(doc(db, 'users', currentUser.uid), { name: currentUser.displayName }).catch(() => {});
          }
          // Migrate legacy single-group accounts to the multi-group shape.
          if (profile.groupId && (!Array.isArray(profile.groupIds) || profile.groupIds.length === 0 || !profile.activeGroupId)) {
            profile.groupIds = Array.isArray(profile.groupIds) && profile.groupIds.length ? profile.groupIds : [profile.groupId];
            profile.activeGroupId = profile.activeGroupId || profile.groupId;
            updateDoc(doc(db, 'users', currentUser.uid), {
              groupIds: profile.groupIds,
              activeGroupId: profile.activeGroupId,
            }).catch(() => {});
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

  useEffect(() => {
    if (!currentUser || !activeGroupId) return;
    const gid = activeGroupId;
    const groupUnsubscribe = onSnapshot(doc(db, 'groups', gid), (groupSnapshot) => {
      // Read before exists(): that guard narrows the snapshot type to never.
      const fromCache = groupSnapshot.metadata.fromCache;
      if (groupSnapshot.exists()) {
        setGroup(groupSnapshot.data() as Group);
        return;
      }
      // A miss served from cache is not a deletion: the server has not spoken
      // yet (cold start, or offline), so wait for a synced snapshot.
      if (fromCache) return;
      // The group is gone. Left alone, the profile still points at it and the
      // app sits on "Loading your group" forever, so drop it locally and
      // scrub it from the user doc best effort.
      const remaining = groupIdsRef.current.filter(id => id !== gid);
      const nextActive = remaining[0] || null;
      setGroup(null);
      setUserProfile((prev: any) => (prev ? { ...prev, groupIds: remaining, activeGroupId: nextActive, groupId: nextActive } : prev));
      updateDoc(doc(db, 'users', currentUser.uid), {
        groupIds: arrayRemove(gid),
        activeGroupId: nextActive ?? deleteField(),
        groupId: nextActive ?? deleteField(),
      }).catch(() => {});
    }, (error) => {
      // Sign-out cancels listeners with permission-denied; teardown noise.
      if (error.code === 'permission-denied' && !auth.currentUser) return;
      console.error('groupUnsubscribe error:', error);
    });
    return () => groupUnsubscribe();
  }, [currentUser, activeGroupId]);

  // Group names for the header switcher. Any signed-in user may `get` a group by id.
  useEffect(() => {
    if (!groupIds.length) { setGroupSummaries({}); return; }
    let cancelled = false;
    (async () => {
      const entries = await Promise.all(groupIds.map(async (gid) => {
        try {
          const snap = await getDoc(doc(db, 'groups', gid));
          return [gid, { name: snap.exists() ? (snap.data() as any).name : undefined }] as const;
        } catch {
          return [gid, {}] as const;
        }
      }));
      if (!cancelled) setGroupSummaries(Object.fromEntries(entries));
    })();
    return () => { cancelled = true; };
  }, [groupIds.join(',')]);

  // One listener per member doc. Rules are not filters: a collection query
  // cannot prove the per-document users `read` rule and is denied outright,
  // while a single-doc read evaluates it against the actual document.
  const memberIdsKey = (group?.memberIds || []).join(',');
  useEffect(() => {
    if (!currentUser || !memberIdsKey) return;
    const memberIds = memberIdsKey.split(',');
    const users: Record<string, any> = {};
    const unsubs = memberIds.map((uid) =>
      onSnapshot(doc(db, 'users', uid), (snap) => {
        if (snap.exists()) {
          users[uid] = snap.data();
        } else {
          delete users[uid];
        }
        setGroupUsers({ ...users });
      }, (error) => {
        if (error.code === 'permission-denied' && !auth.currentUser) return;
        // Surface it: a silent empty roster disables every feature built on it.
        console.error('group member listener error for ' + uid + ':', error);
      })
    );
    return () => unsubs.forEach((u) => u());
  }, [currentUser, memberIdsKey]);

  
  
  
  // Keyed on the group id, not the group object, so unrelated field updates
  // do not reload the ledger.
  useEffect(() => {
    if (!activeUser || !group) return;
    const stored = localStorage.getItem('expenses_' + group.id);
    if (stored) {
      try {
        setExpenses(JSON.parse(stored));
      } catch (e) {
        console.error('Failed to parse cached expenses', e);
      }
    } else {
      setExpenses([]);
    }
  }, [activeUser, group?.id]);

  // Historical backfill from the shared encrypted snapshot.
  useGroupLedgerSnapshot({
    activeUser,
    groupId: group?.id,
    expenses,
    setExpenses,
  });

  // Claim placeholder seats (lib/seatClaims) whenever the ledger or roster
  // changes, so an open tab heals the moment a join lands; the persist
  // effect then writes the claimed ledger back.
  useEffect(() => {
    if (!group?.id || !memberIdsKey || expenses.length === 0) return;
    const claimed = claimSeats(expenses, memberIdsKey.split(','));
    if (!claimed.changed) return;
    setExpenses(claimed.expenses);
    try { localStorage.setItem('expenses_' + group.id, JSON.stringify(claimed.expenses)); } catch {}
  }, [expenses, memberIdsKey, group?.id]);

  // Transfer queue: encrypted expense upserts and deletes from other members.
  useEffect(() => {
    if (!activeUser || !group) return;

    const groupId = group.id;
    const q = query(
      collection(db, 'transfer_queue'),
      where('to', '==', activeUser)
    );

    const unsubscribe = onSnapshot(
      q,
      async (snapshot) => {
        const newExps: Expense[] = [];
        const deletedIds: string[] = [];

        for (const change of snapshot.docChanges()) {
          if (change.type !== 'added') continue;

          const data = change.doc.data();

          // Leftovers from a group the user previously belonged to.
          if (data.groupId && data.groupId !== groupId) continue;

          try {
            const decrypted = await decryptData(data.payload, groupId);

            // Never delete a queue item we could not decrypt.
            if (!decrypted) continue;

            if (data.action === 'DELETE') {
              deletedIds.push(decrypted.id);
            } else {
              newExps.push(decrypted as Expense);
            }

            deleteDoc(
              doc(db, 'transfer_queue', change.doc.id)
            ).catch(console.error);
          } catch (e) {
            console.error('Transfer queue decrypt failed', e);
          }
        }

        if (newExps.length === 0 && deletedIds.length === 0) return;

        setExpenses(prev => {
          let updated = prev.filter(
            expense => !deletedIds.includes(expense.id)
          );

          for (const incoming of newExps) {
            const idx = updated.findIndex(
              expense => expense.id === incoming.id
            );

            if (idx >= 0) {
              updated[idx] = mergeExpense(updated[idx], incoming);
            } else {
              updated.push(incoming);
            }
          }

          updated.sort(
            (a, b) =>
              new Date(b.date).getTime() -
              new Date(a.date).getTime()
          );

          try {
            localStorage.setItem(
              `expenses_${groupId}`,
              JSON.stringify(updated)
            );
          } catch (e) {
            console.error('Failed to persist synced ledger', e);
          }

          return updated;
        });
      },
      error => {
        console.error('transfer_queue listener error:', error);
      }
    );

    return () => unsubscribe();
  }, [activeUser, group?.id]);

  // Recurring autopilot. Only the payer's own account spawns instances, so two
  // members cannot double-log, and copies carry recurringSourceId + date as a
  // duplicate guard. Runs at most once per group per day per session.
  const recurringAutopilotRef = useRef('');
  useEffect(() => {
    if (!activeUser || !group || expenses.length === 0) return;
    const groupId = group.id;
    const memberIds = group.memberIds || [];
    const runKey = `${groupId}:${todayLocal()}`;
    if (recurringAutopilotRef.current === runKey) return;

    const today = todayLocal();
    // Materialise a cycle two weeks early, keeping its real future date.
    const horizon = (() => {
      const d = new Date(today + 'T00:00:00');
      d.setDate(d.getDate() + 14);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    })();
    const spawned: Expense[] = [];
    const sourceUpdates = new Map<string, string>(); // source id -> new nextRecurringDate

    for (const exp of expenses) {
      if (!exp.isRecurring || !exp.nextRecurringDate || exp.paidBy !== activeUser) continue;
      let next: string = exp.nextRecurringDate;
      let guard = 0;
      while (next && next <= horizon && guard < 24) {
        guard++;
        const dueDate = next;
        const dupe =
          expenses.some(x => x.recurringSourceId === exp.id && x.date === dueDate) ||
          spawned.some(x => x.recurringSourceId === exp.id && x.date === dueDate);
        if (!dupe) {
          spawned.push({
            ...exp,
            id: crypto.randomUUID(),
            date: dueDate,
            // Unclaimed: the definition's payer is a claim about last year,
            // not this month. Someone claims it when it is actually paid.
            paidBy: '',
            createdAt: new Date().toISOString(),
            editedAt: new Date().toISOString(),
            status: 'OPEN',
            settlements: [],
            comments: [],
            isRecurring: false,
            recurringInterval: undefined,
            nextRecurringDate: undefined,
            recurringSourceId: exp.id,
          });
        }
        // Anchored on the definition's own day, so the 31st stays the 31st.
        next = advanceIntervalStr(dueDate, exp.recurringInterval, parseLocalDate(exp.date).getDate());
      }
      if (next !== exp.nextRecurringDate) sourceUpdates.set(exp.id, next);
    }

    recurringAutopilotRef.current = runKey;
    if (spawned.length === 0 && sourceUpdates.size === 0) return;

    setExpenses(prev => {
      const updated = prev.map(e =>
        sourceUpdates.has(e.id) ? { ...e, nextRecurringDate: sourceUpdates.get(e.id)!, editedAt: new Date().toISOString() } : e
      );
      const merged = [...spawned, ...updated].sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      );
      try {
        localStorage.setItem('expenses_' + groupId, JSON.stringify(merged));
      } catch (e) {
        console.error('Failed to persist autopilot ledger', e);
      }
      return merged;
    });

    (async () => {
      try {
        const others = memberIds.filter(id => id !== activeUser);
        const toSend: Expense[] = [
          ...spawned,
          ...expenses
            .filter(e => sourceUpdates.has(e.id))
            .map(e => ({ ...e, nextRecurringDate: sourceUpdates.get(e.id)!, editedAt: new Date().toISOString() })),
        ];
        for (const expensePayload of toSend) {
          const encrypted = await encryptData(expensePayload, groupId);
          await Promise.allSettled(
            others.map(memberId =>
              setDoc(doc(collection(db, 'transfer_queue')), {
                to: memberId,
                from: activeUser,
                groupId,
                action: 'UPSERT',
                payload: encrypted,
                createdAt: new Date().toISOString(),
              })
            )
          );
        }
      } catch (e) {
        console.error('Recurring autopilot sync failed', e);
      }
    })();

    if (spawned.length > 0) {
      addToast(
        'Recurring Logged',
        spawned.length === 1
          ? `"${spawned[0].title}" was auto-logged from your recurring schedule.`
          : `${spawned.length} recurring expenses were auto-logged.`,
        'success'
      );
    }
  }, [activeUser, group?.id, expenses]);

  // Settings inputs mirror the profile. Handles are stored encrypted with the
  // owner's uid; legacy plaintext paymentHandles is the fallback.
  useEffect(() => {
    setThresholdInput(
      userProfile?.recurringThreshold > 0 ? String(userProfile.recurringThreshold) : ''
    );
    let cancelled = false;
    (async () => {
      let handles = userProfile?.paymentHandles || null;
      if (userProfile?.paymentHandlesEnc && activeUser) {
        try {
          handles = await decryptData(userProfile.paymentHandlesEnc, activeUser);
        } catch (e) {
          console.error('Could not decrypt own payment handles', e);
        }
      }
      if (!cancelled) {
        setVenmoInput(handles?.venmo || '');
        setZelleInput(handles?.zelle || '');
      }
    })();
    return () => { cancelled = true; };
  }, [userProfile?.recurringThreshold, userProfile?.paymentHandlesEnc, userProfile?.paymentHandles, activeUser]);

  // Every member's handles, decrypted with their uid (which groupmates know),
  // for the settle screen's Venmo/Zelle handoff.
  const [paymentHandlesByUid, setPaymentHandlesByUid] = useState<Record<string, { venmo?: string; zelle?: string }>>({});
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const next: Record<string, { venmo?: string; zelle?: string }> = {};
      for (const [uid, u] of Object.entries(groupUsers) as [string, any][]) {
        if (u?.paymentHandlesEnc) {
          try {
            const dec = await decryptData(u.paymentHandlesEnc, uid);
            if (dec && (dec.venmo || dec.zelle)) next[uid] = dec;
          } catch (e) {
            console.error('Could not decrypt payment handles for member', uid, e);
          }
        } else if (u?.paymentHandles && (u.paymentHandles.venmo || u.paymentHandles.zelle)) {
          next[uid] = u.paymentHandles; // legacy plaintext
        }
      }
      if (!cancelled) setPaymentHandlesByUid(next);
    })();
    return () => { cancelled = true; };
  }, [groupUsers]);

  // Weekly greeting, cached on the user doc.
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
          headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
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

  // Keep the selected expense current as background data changes.
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
    return <LoadingScreen label="Loading your ledger..." />;
  }

  if (userProfile && !userProfile.financialProfile) {
    return <div className="animate-in fade-in duration-300"><ProfileSetup userId={activeUser} onComplete={() => {
      getDoc(doc(db, 'users', activeUser)).then(userDoc => {
        if (userDoc.exists()) setUserProfile(userDoc.data() as any);
      }).catch(e => console.error('Failed to reload profile', e));
    }} /></div>;
  }

  // Group data not here yet: a loading screen, never the create/join screen.
  if (activeGroupId && !group) {
    return <LoadingScreen label="Loading your group..." />;
  }

  if (!activeGroupId) {
    return <div className="animate-in fade-in duration-300"><GroupSetup onComplete={applyJoinedGroup} /></div>;
  }

  // Members who have not finished their quiz. Non-blocking: a dismissible banner.
  const missingProfiles = (group.memberIds || []).filter(
    id => id !== activeUser && groupUsers[id] && !groupUsers[id]?.financialProfile
  );

  // Dark Cherry amounts are hidden from everyone but their creator, so a
  // group total that included one would let members back the number out.
  const statsVisibleExpenses = expenses.filter(
    e => !isDarkCherry(e) || e.paidBy === activeUser
  );

  // Gates vault, thresholds, rhythm, insights and Dark Cherry creation.
  const isPlus = hasPlus(userProfile);

  // Each member's spending limit, and this user's shares that exceed their own.
  const memberThresholds: Record<string, number> = {};
  Object.entries(groupUsers).forEach(([uid, u]: any) => {
    memberThresholds[uid] = Number(u?.recurringThreshold) || 0;
  });
  const myThreshold = Number(userProfile?.recurringThreshold) || 0;
  const overThresholdExpenses = myThreshold > 0
    ? expenses.filter(e => e.paidBy !== activeUser && (e.shares?.[activeUser] || 0) > myThreshold && !isDarkCherry(e))
    : [];

  // Each member's reported income against what the others estimated. The
  // worst relative gap tunes the alignment modal's conversation starter.
  let hasIncomeDiscrepancy = false;
  let incomeDiscrepancyPct = 0;
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

        if (u1Income && u2PartnerEst && Math.abs(u1Income - u2PartnerEst) > u1Income * 0.1) {
          hasIncomeDiscrepancy = true;
          incomeDiscrepancyPct = Math.max(incomeDiscrepancyPct, (Math.abs(u1Income - u2PartnerEst) / u1Income) * 100);
        }
        if (u2Income && u1PartnerEst && Math.abs(u2Income - u1PartnerEst) > u2Income * 0.1) {
          hasIncomeDiscrepancy = true;
          incomeDiscrepancyPct = Math.max(incomeDiscrepancyPct, (Math.abs(u2Income - u1PartnerEst) / u2Income) * 100);
        }
      }
    }
  }
  

  const handleSignOut = async () => {
    // Best effort: cleanup must never block signing out.
    const uid = auth.currentUser?.uid;
    if (uid) await disableWebPush(uid).catch(() => {});
    // The next visit asks for login again instead of restoring a session.
    forgetKeepSignedIn();
    // Let the auth listener reset state: clearing userProfile here would
    // flash ProfileSetup for a frame before currentUser clears.
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
    try {
      await syncExpenseUpdate(updatedExp);
    } catch (e: any) {
      console.error('Comment sync failed', e);
      setSupportError({ error: CHERRY_ERRORS.expenseSave, screen: 'Expense comment', detail: String(e?.message || e) });
    }
  };

  const handleExportData = () => {
    if (!group) return;

    const allMembers = getFullMembers(group);

    const escapeCsv = (value: unknown): string => {
      const text = String(value ?? '');
      return `"${text.replace(/"/g, '""')}"`;
    };

    // The "Participant Type" column and guest rows appear only once some
    // expense has an extra participant, so the plain format is unchanged.
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

  // Shared by Leave Group and Delete Account. Redistributes the leaver's split
  // so household-default expenses still bill 100%, and deletes the group when
  // the last member leaves. Reads the group fresh so it works for any group.
  const removeSelfFromGroupById = async (gid: string) => {
    const groupRef = doc(db, 'groups', gid);
    const snap = await getDoc(groupRef);
    if (!snap.exists()) return;
    const g = snap.data() as Group;
    const newMembers = (g.members || []).filter(m => m.uid !== activeUser);
    const newMemberIds = (g.memberIds || []).filter(id => id !== activeUser);

    // Last member out deletes the group rather than leaving a dead one on the invite code.
    if (newMemberIds.length === 0) {
      await deleteDoc(groupRef);
      return;
    }

    // Proportional to current shares; pending ghost slots are left untouched.
    const split = g.defaultSplit || {};
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

  // Best-effort cleanup during account deletion (the rules allow to == self).
  const deleteMyInboundQueue = async () => {
    if (!activeUser) return;
    try {
      const snap = await getDocs(query(collection(db, 'transfer_queue'), where('to', '==', activeUser)));
      await Promise.allSettled(snap.docs.map(d => deleteDoc(d.ref)));
    } catch (e) {
      console.error('Failed to clean up inbound queue', e);
    }
  };

  // Local ledger caches for every group, plus the backup secret.
  const clearLocalData = () => {
    groupIds.forEach(gid => localStorage.removeItem('expenses_' + gid));
    if (group) localStorage.removeItem('expenses_' + group.id);
    if (activeUser) localStorage.removeItem(`group_secret_${activeUser}`);
  };

  // Everything re-keys off activeGroupId, so persist the choice and clear the
  // previous group's view state.
  const handleSwitchGroup = async (gid: string) => {
    setShowGroupMenu(false);
    if (!gid || gid === activeGroupId) return;
    try {
      await updateDoc(doc(db, 'users', activeUser), { activeGroupId: gid, groupId: gid });
    } catch (e) {
      console.error('Failed to switch group', e);
    }
    setUserProfile((prev: any) => ({ ...(prev || {}), activeGroupId: gid, groupId: gid }));
    setGroup(null);
    setGroupUsers({});
    setExpenses([]);
    setSelectedExpense(null);
    setEditingExpense(null);
    setDismissedWaiting(false);
    setShowSettings(false);
  };

  const handleLeaveGroup = async () => {
    if (!activeGroupId) return;
    const remaining = groupIds.filter(id => id !== activeGroupId);
    const nextActive = remaining[0] || null;
    // The last member out deletes the group and its ledger; say so.
    const lastOne = !!group && joinedUids(group).length <= 1;
    const afterwards = nextActive
      ? "You'll be switched to another of your groups. Your account and your other groups stay intact."
      : "You'll be returned to the group setup screen. Your account stays active and you can create or join another group.";
    const message = lastOne
      ? `Leave this group? You're the only member, so leaving deletes the group and its ledger for good. ${afterwards}`
      : `Leave this group? You'll be removed from its member list. ${afterwards}`;
    if (!window.confirm(message)) return;
    try {
      await removeSelfFromGroupById(activeGroupId);
      await updateDoc(doc(db, 'users', activeUser), {
        groupIds: arrayRemove(activeGroupId),
        activeGroupId: nextActive ?? deleteField(),
        groupId: nextActive ?? deleteField(),
      });
      localStorage.removeItem('expenses_' + activeGroupId);
      setShowSettings(false);
      setShowPrivacyModal(false);
      setShowGroupMenu(false);
      setUserProfile((prev: any) => ({ ...(prev || {}), groupIds: remaining, activeGroupId: nextActive, groupId: nextActive }));
      setGroup(null);
      setGroupUsers({});
      setExpenses([]);
      setSelectedExpense(null);
    } catch (err) {
      console.error("Error leaving group", err);
      alert("Failed to leave the group. Please try again.");
    }
  };

  // Firebase requires a recent login before account deletion. Apple needs the
  // popup flow: signing out and back in never satisfies the check.
  const reauthenticate = async () => {
    const user = auth.currentUser;
    if (!user) throw new Error("No signed-in user");
    const providerId = user.providerData[0]?.providerId;
    if (providerId === 'google.com') {
      await reauthenticateWithPopup(user, new GoogleAuthProvider());
    } else if (providerId === 'apple.com') {
      const apple = new OAuthProvider('apple.com');
      apple.addScope('email');
      apple.addScope('name');
      await reauthenticateWithPopup(user, apple);
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
      // First, so a cancelled reauthentication cannot leave the account half-deleted.
      await reauthenticate();

      // Firestore cleanup needs auth, so it precedes the auth-account deletion.
      for (const gid of groupIds) {
        try { await removeSelfFromGroupById(gid); }
        catch (e) { console.error('Failed to leave group during account deletion', gid, e); }
      }

      await deleteMyInboundQueue();

      await deleteDoc(doc(db, 'users', activeUser));

      clearLocalData();

      // Last: this revokes the auth the steps above needed.
      await deleteUser(auth.currentUser!);
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

  const broadcastToMembers = async (
    action: 'UPSERT' | 'DELETE',
    payloadObject: unknown
  ) => {
    if (!group) return;

    const encrypted = await encryptData(payloadObject, group.id);

    const otherMembers = (group.memberIds || []).filter(
      id => id !== activeUser
    );

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

    const failed = results.filter(
      result => result.status === 'rejected'
    ).length;

    if (failed > 0) {
      console.error(
        `broadcastToMembers: ${failed}/${otherMembers.length} writes failed`
      );
    }
  };

  // Best effort: a failed notification must never fail the write it follows.
  // The server enforces membership and the push carries no amounts or titles.
  const notifyLedgerEvent = (kind: 'expense_logged' | 'payment_logged') => {
    const gid = group?.id;
    if (!gid) return;
    (async () => {
      try {
        await fetch('/api/notify-ledger-event', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
          body: JSON.stringify({ groupId: gid, kind }),
        });
      } catch { /* best effort */ }
    })();
  };

  // Manual push to this expense's outstanding debtors.
  const handleGentleRemind = async (expense: Expense) => {
    if (!group) return;
    const debtors = group.memberIds.filter(uid =>
      uid !== expense.paidBy && getRemainingSettlementAmount(expense, uid, false) > 0.01
    );
    try {
      const res = await fetch('/api/send-nudge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
        body: JSON.stringify({ groupId: group.id, toUids: debtors }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not send the reminder.');
      addToast(
        'Nudge Sent',
        data.sent > 0
          ? 'A gentle reminder is on its way.'
          : "Sent - though nobody's devices are set up for notifications yet.",
        'success'
      );
    } catch (e: any) {
      addToast('Could Not Nudge', e?.message || 'Please try again in a moment.', 'info');
    }
  };

  const handleAddOrEditExpense = async (formData: Omit<Expense, 'id' | 'createdAt' | 'status' | 'groupId'>) => {
    const normalizedAmount = normalizeAmount(Number(formData.amount));
    if (!normalizedAmount) {
      setSupportError({ error: CHERRY_ERRORS.amountTooLarge, screen: 'Log expense' });
      return;
    }
    if (normalizedAmount.wasRounded) {
      // Scale the shares by the same factor so they still cover the saved total.
      const scale = normalizedAmount.value / Number(formData.amount);
      const scaled = (v: number) => Math.round(v * scale * 100) / 100;
      formData = {
        ...formData,
        amount: normalizedAmount.value,
        shares: Object.fromEntries(
          Object.entries(formData.shares || {}).map(([uid, s]) => [uid, scaled(Number(s))])
        ),
        ...(formData.thirdPersonShare != null
          ? { thirdPersonShare: scaled(Number(formData.thirdPersonShare)) }
          : {}),
        ...(formData.extraParticipants
          ? {
              extraParticipants: formData.extraParticipants.map(g => ({
                ...g,
                share: scaled(g.share),
              })),
            }
          : {}),
      };
      addToast('Rounded', `Saved as $${normalizedAmount.value.toLocaleString()} - amounts this large round to the nearest $100,000.`, 'info');
    }
    try {
      if (!group.categories?.includes(formData.category)) {
        const groupRef = doc(db, 'groups', group.id);
        const newCategories = [...(group.categories || []), formData.category];
        await updateDoc(groupRef, { categories: newCategories });
      }

      // Quick settle: an expense already paid back lands closed.
      const quickSettle = (formData as any).quickSettle === true;
      const { quickSettle: _omitQuickSettle, ...cleanForm } = formData as any;

      let finalExpense: Expense;
      if (editingExpense) {
        // Build on the freshest copy, so a settlement logged while the form was
        // open survives the save. `editedAt` marks this content revision.
        const latest = expenses.find(ex => ex.id === editingExpense.id) || editingExpense;
        finalExpense = { ...latest, ...cleanForm, editedAt: new Date().toISOString() };
        // Re-derive status from the new shares against existing settlements.
        finalExpense.status = getNormalizedExpenseStatus(finalExpense);
        setExpenses(prev => {
          const updated = prev.map(ex => ex.id === finalExpense.id ? mergeExpense(ex, finalExpense) : ex);
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

        const createdAt = new Date().toISOString();
        finalExpense = {
          ...cleanForm,
          settlements,
          id: newId,
          groupId: group.id,
          status,
          createdAt,
          editedAt: createdAt
        };
        setExpenses(prev => {
          const updated = [finalExpense, ...prev];
          localStorage.setItem('expenses_' + group.id, JSON.stringify(updated));
          return updated;
        });
        setShowForm(false);
      }

      await broadcastToMembers('UPSERT', finalExpense);

      // New expenses only: edits would be noisy.
      if (!editingExpense) notifyLedgerEvent('expense_logged');
    } catch (e: any) {
      console.error(e);
      setSupportError({ error: CHERRY_ERRORS.expenseSave, screen: 'Log expense', detail: String(e?.message || e) });
    }
  };


  // Recurring bills arrive unclaimed; until claimed an expense owes nobody.
  const handleClaimExpense = async (expenseId: string, payerUid: string) => {
    if (!group) return;
    const groupId = group.id;
    const target = expenses.find(e => e.id === expenseId);
    if (!target) return;
    const claimed: Expense = { ...target, paidBy: payerUid, editedAt: new Date().toISOString() };
    setExpenses(prev => {
      const updated = prev.map(e => (e.id === expenseId ? claimed : e));
      try { localStorage.setItem('expenses_' + groupId, JSON.stringify(updated)); }
      catch (err) { console.error('Failed to persist expenses', err); }
      return updated;
    });
    setSelectedExpense(claimed);
    try {
      await broadcastToMembers('UPSERT', claimed);
    } catch (err) {
      console.error('Claim broadcast failed', err);
    }
  };

  const handleDeleteExpense = async (id: string) => {
    // ExpenseDetail already confirms inline.
    if (!group) return;
    const groupId = group.id;
    try {
      const expenseToDelete = expenses.find(e => e.id === id);
      setExpenses(prev => {
        const updated = prev.filter(e => e.id !== id);
        try { localStorage.setItem('expenses_' + groupId, JSON.stringify(updated)); }
        catch (e) { console.error('Failed to persist expenses', e); }
        return updated;
      });
      setSelectedExpense(null);

      if (expenseToDelete) {
        await broadcastToMembers('DELETE', { id });
      }
    } catch (e: any) {
      console.error("Delete error:", e);
      setSupportError({
        error: {
          code: 'EXPENSE_DELETE_FAILED',
          title: "That expense didn't delete",
          message: 'The expense could not be removed, so it still stands in the ledger.',
          hint: 'Try again in a moment. If it keeps failing, contact us.',
        },
        screen: 'Ledger',
        detail: String(e?.message || e),
      });
    }
  };

    const syncExpenseUpdate = async (updatedExpense: Expense) => {
    if (!group) return;
    const groupId = group.id;
    // Merge, do not replace: a stale snapshot must not drop a settlement or
    // comment that arrived from another member.
    const current = expenses.find(e => e.id === updatedExpense.id);
    const merged = current ? mergeExpense(current, updatedExpense) : updatedExpense;
    setExpenses(prev => {
      const updated = prev.map(e => e.id === merged.id ? mergeExpense(e, merged) : e);
      try {
        localStorage.setItem('expenses_' + groupId, JSON.stringify(updated));
      } catch (e) {
        console.error('Failed to persist expenses to localStorage', e);
      }
      return updated;
    });
    setSelectedExpense(merged);
    await broadcastToMembers('UPSERT', merged);
  };

  const handleSettleUpProposal = async (instrumentType: import('./types').PaymentInstrument, amount: number, label: string, debtorId: string, paymentDate?: string) => {
    if (!selectedExpense || !group) return;

    // Validate against the freshest copy, not the one the modal opened with.
    const expense = expenses.find(e => e.id === selectedExpense.id) || selectedExpense;

    const normalizedAmount = roundCurrency(amount);
    // A pending seat (ghost_N) is a valid debtor; the claim pass rewrites the
    // settlement to their real uid when they join.
    const baseValid =
      getFullMembers(group).some(m => m.uid === debtorId) &&
      Number.isFinite(normalizedAmount) &&
      normalizedAmount > 0;

    if (isDarkCherry(expense)) {
      // Contributors are bound by the creator's per-payment range; the creator
      // is bound by what is left in the pot.
      const isCreatorLogging = expense.paidBy === activeUser;
      if (isCreatorLogging) {
        const potRemaining = getDarkCherryRemaining(expense, true);
        if (!baseValid || normalizedAmount > potRemaining) {
          addToast('Invalid Payment', `Payment must be between $0.01 and $${potRemaining.toFixed(2)}.`, 'info');
          return;
        }
      } else {
        const min = expense.blindMin || 0.01;
        const max = expense.blindMax || Number.MAX_SAFE_INTEGER;
        if (!baseValid || normalizedAmount < min || normalizedAmount > max) {
          addToast('Invalid Payment', `Payments on this Dark Cherry are between $${min.toFixed(2)} and $${max.toFixed(2)}.`, 'info');
          return;
        }
      }
    } else {
      const remainingAmount = getRemainingSettlementAmount(expense, debtorId, true);
      if (!baseValid || normalizedAmount > remainingAmount) {
        addToast(
          'Invalid Payment',
          `Payment must be between $0.01 and $${remainingAmount.toFixed(2)}.`,
          'info'
        );
        return;
      }
    }

    const isCreditor = expense.paidBy === activeUser;

    // A received payment that exactly matches a pending one is a confirmation
    // of it, not a second payment.
    if (isCreditor) {
      const matchingPending = (expense.settlements || []).find(
        s =>
          s.status === 'pending' &&
          s.paidBy === debtorId &&
          Math.abs(s.amount - normalizedAmount) < 0.005
      );
      if (matchingPending) {
        setShowSettleModal(false);
        await handleConfirmSettleReceipt(matchingPending.id);
        return;
      }
    }

    const newSettlement: import('./types').Settlement = {
      id: crypto.randomUUID(),
      expenseId: expense.id,
      paidBy: debtorId,
      receivedBy: expense.paidBy,
      amount: normalizedAmount,
      instrumentType: instrumentType,
      label: label,
      timestamp: new Date().toISOString(),
      paymentDate: paymentDate || todayLocal(),
      status: isCreditor ? 'confirmed' : 'pending',
      mismatchType: computeMismatchForSettlement(expense, instrumentType)
    };

    const settlements = [...(expense.settlements || []), newSettlement];

    // Per-debtor status, so one overpaid debtor cannot mask another's shortfall.
    const updatedExp: Expense = { ...expense, settlements };
    updatedExp.status = getNormalizedExpenseStatus(updatedExp);
    try {
      setShowSettleModal(false);
      await syncExpenseUpdate(updatedExp);
      // Toast only after the write: "logged" over a failed save gets a payment sent twice.
      addToast(isCreditor ? 'Payment Logged' : 'Settlement Logged', isCreditor ? 'The received payment was recorded.' : 'Your payment is pending confirmation.', 'success');
      notifyLedgerEvent('payment_logged');

      const computedMismatch = computeMismatchForSettlement(expense, instrumentType);
      if (computedMismatch !== 'NOT_CLASSIFIABLE' && computedMismatch !== 'NO_MISMATCH') {
        const mismatchRef = doc(db, 'group_mismatches', group.id, 'events', newSettlement.id);
        await setDoc(mismatchRef, {
          expenseId: expense.id,
          settlementId: newSettlement.id,
          mismatchType: computedMismatch,
          paidBy: debtorId,
          receivedBy: expense.paidBy,
          amount: normalizedAmount,
          timestamp: newSettlement.timestamp
        }).catch(e => console.error("Data write failed", e));
      }
    } catch (e: any) {
      console.error(e);
      setSupportError({ error: CHERRY_ERRORS.settlementSave, screen: 'Settle up', detail: String(e?.message || e) });
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
    try {
      await syncExpenseUpdate(updatedExp);
      addToast('Receipt Confirmed', 'The payment has been confirmed.', 'success');
    } catch (e: any) {
      console.error('Confirm receipt failed', e);
      setSupportError({ error: CHERRY_ERRORS.settlementSave, screen: 'Confirm receipt', detail: String(e?.message || e) });
    }
  };

  // Voids rather than deletes: the tombstone stops a merge from another
  // device resurrecting the entry.
  const handleVoidSettlement = async (settlementId: string) => {
    if (!group || !selectedExpense) return;
    const expense = expenses.find(e => e.id === selectedExpense.id);
    if (!expense) return;

    const target = (expense.settlements || []).find(s => s.id === settlementId);
    if (!target || target.status === 'voided') return;

    const settlements = (expense.settlements || []).map(s =>
      s.id === settlementId
        ? { ...s, status: 'voided' as const, voidedAt: new Date().toISOString(), voidedBy: activeUser }
        : s
    );

    const updatedExp: Expense = { ...expense, settlements };
    updatedExp.status = getNormalizedExpenseStatus(updatedExp);
    try {
      await syncExpenseUpdate(updatedExp);
      addToast('Payment Removed', 'The payment entry was removed and the balance updated.', 'success');
    } catch (e: any) {
      console.error('Void settlement failed', e);
      setSupportError({ error: CHERRY_ERRORS.settlementSave, screen: 'Remove payment entry', detail: String(e?.message || e) });
    }
  };

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
      // The group's member list carries the name too.
      if (group && group.members?.some(m => m.uid === activeUser)) {
        const newMembers = group.members.map(m => m.uid === activeUser ? { ...m, name: newName } : m);
        await updateDoc(doc(db, 'groups', group.id), { members: newMembers });
      }
      setUserProfile((prev: any) => ({ ...(prev || {}), name: newName }));
      addToast('Name Updated', 'Your name has been updated.', 'success');
    } catch (e) {
      console.error('Failed to update name', e);
      setSupportError({ error: CHERRY_ERRORS.settingsSave, screen: 'Settings - name' });
    }
  };

  // An update, not a merge set, so it cannot recreate a profile an account
  // deletion just removed. Same-value calls are dropped so a double click
  // cannot move the consent timestamp.
  const handleSaveMarketingOptIn = async (optIn: boolean) => {
    if (!!userProfile?.marketingOptIn === optIn) return;
    const at = new Date().toISOString();
    const patch = optIn
      ? { marketingOptIn: true, marketingOptInAt: at }
      : { marketingOptIn: false, marketingOptOutAt: at };
    try {
      await updateDoc(doc(db, 'users', activeUser), patch);
      setUserProfile((prev: any) => ({ ...(prev || {}), ...patch }));
    } catch (e) {
      console.error('Failed to save marketing preference', e);
      setSupportError({ error: CHERRY_ERRORS.settingsSave, screen: 'Settings - email' });
    }
  };

  // Synced to the profile so other members' forms can warn early.
  const handleSaveThreshold = async () => {
    if (savingThreshold) return;
    const val = Math.max(0, Number(thresholdInput) || 0);
    setSavingThreshold(true);
    try {
      await updateDoc(doc(db, 'users', activeUser), { recurringThreshold: val });
      setUserProfile((prev: any) => ({ ...(prev || {}), recurringThreshold: val }));
      addToast('Threshold Saved', val > 0 ? `We'll flag shared expenses over $${val}.` : 'Threshold cleared.', 'success');
    } catch (e) {
      console.error('Failed to save threshold', e);
      setSupportError({ error: CHERRY_ERRORS.settingsSave, screen: 'Settings - spending threshold' });
    } finally {
      setSavingThreshold(false);
    }
  };

  // Written only encrypted (keyed by the owner's uid); any legacy plaintext
  // copy is deleted on save. Handles never enter cloud backups.
  const handleSavePaymentHandles = async () => {
    if (savingHandles) return;
    const handles = {
      venmo: venmoInput.trim().replace(/^@/, ''),
      zelle: zelleInput.trim(),
    };
    setSavingHandles(true);
    try {
      const enc = await encryptData(handles, activeUser);
      await updateDoc(doc(db, 'users', activeUser), {
        paymentHandlesEnc: enc,
        paymentHandles: deleteField(),
      });
      setUserProfile((prev: any) => ({ ...(prev || {}), paymentHandlesEnc: enc, paymentHandles: undefined }));
      setPaymentHandlesByUid(prev => ({ ...prev, [activeUser]: handles }));
      addToast('Payment Info Saved', 'Encrypted and saved. Group members can now pay you directly through Venmo or Zelle.', 'success');
    } catch (e) {
      console.error('Failed to save payment handles', e);
      setSupportError({ error: CHERRY_ERRORS.settingsSave, screen: 'Settings - payment handles' });
    } finally {
      setSavingHandles(false);
    }
  };

  const handleRetakeQuiz = async () => {
    try {
      await updateDoc(doc(db, 'users', activeUser), { financialProfile: null });
      setUserProfile((prev: any) => ({ ...prev, financialProfile: null }));
    } catch (e) { console.error('Failed to reset profile', e); }
  };

  const handleResendInvite = async (memberName: string, email: string) => {
    const to = email.trim();
    if (!to || !group) return;
    try {
      const res = await fetch('/api/send-invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
        body: JSON.stringify({
          email: to,
          groupName: group.name,
          inviteCode: group.inviteCode,
          recipientName: memberName,
          fromName: (userProfile?.name && !['Anonymous', 'Unknown'].includes(userProfile.name) ? userProfile.name : currentUser?.displayName) || undefined,
        }),
      });
      if (res.ok) addToast('Invite Sent', `An invitation has been sent to ${to}.`, 'success');
      else setSupportError({ error: CHERRY_ERRORS.inviteSend, screen: 'Invite' });
    } catch {
      setSupportError({ error: CHERRY_ERRORS.inviteSend, screen: 'Invite' });
    }
  };

  // A whole-field update, because every share changes at once.
  const handleAddSeat = async (name: string, percent: number, email?: string) => {
    if (!group) return;
    const next = withAddedSeat(group, name, percent);
    await updateDoc(doc(db, 'groups', group.id), {
      defaultSplit: next.defaultSplit,
      availableSplits: next.availableSplits,
      targetNumPeople: next.targetNumPeople,
      addedSeats: next.addedSeats,
    });
    addToast('Seat Added', `${name.trim()} can join with the invite code. Their share comes out of everyone's proportionally.`, 'success');
    if (email?.trim()) await handleResendInvite(name.trim(), email);
  };

  const handleRemoveSeat = async (index: number) => {
    if (!group) return;
    const seat = pendingSeats(group)[index];
    if (!seat) return;
    if (!window.confirm(`Remove the pending seat for ${seat.name}? Their ${seat.split}% goes back to everyone else.`)) return;
    try {
      const next = withRemovedSeat(group, index);
      await updateDoc(doc(db, 'groups', group.id), {
        defaultSplit: next.defaultSplit,
        availableSplits: next.availableSplits,
        targetNumPeople: next.targetNumPeople,
        addedSeats: next.addedSeats,
      });
      addToast('Seat Removed', `${seat.name} is no longer pending.`, 'success');
    } catch (e) {
      console.error('Failed to remove seat', e);
      addToast('Error', 'Could not remove that seat. Please try again.', 'error');
    }
  };

  const handleRecalculateSplit = async () => {
    if (!group) return;
    const uids = Object.keys(groupUsers);
    const inc1 = Number(groupUsers[uids[0]]?.income) || 0;
    const inc2 = Number(groupUsers[uids[1]]?.income) || 0;
    if (inc1 <= 0 || inc2 <= 0) {
      addToast('Cannot Recalculate', 'Everyone needs an income on their profile before the split can be recalculated.', 'error');
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

  // Payments waiting for this user to confirm receipt.
  const pendingToConfirm = expenses.filter(e =>
    (e.settlements || []).some(s => s.status === 'pending' && s.receivedBy === activeUser)
  );
  const pendingConfirmCount = pendingToConfirm.reduce(
    (n, e) => n + (e.settlements || []).filter(s => s.status === 'pending' && s.receivedBy === activeUser).length,
    0
  );

  return (
    <div
      className="min-h-screen bg-natural-bg text-natural-text font-sans antialiased pb-12 animate-in fade-in duration-300"
      style={{
        background:
          'radial-gradient(60% 40% at 78% 0%, rgba(196,18,0,.05), transparent 60%), #F4F4F5',
        backgroundRepeat: 'no-repeat',
      }}
      id="app-root"
    >
      <ToastContainer toasts={toasts} removeToast={removeToast} />
      <div className="h-px bg-natural-sidebar w-full" />

      <main className="max-w-6xl lg:max-w-7xl 2xl:max-w-[100rem] mx-auto px-4 sm:px-8 pt-6 sm:pt-10">
        
        {hasIncomeDiscrepancy && (
          <div className="mb-6 bg-natural-sidebar border-l-4 border-natural-primary p-4 rounded-r-xl shadow-sm animate-in fade-in slide-in-from-top-2">
            <div className="flex gap-3 items-start">
              <Sparkles className="h-5 w-5 text-natural-primary shrink-0 mt-0.5" />
              <div>
                <h3 className="text-sm font-bold text-natural-text">Conversation Starter: Financial Alignment</h3>
                <p className="text-sm text-natural-muted mt-1">
                  It looks like there's a discrepancy between what you reported as your income and what someone else in the group estimated (or vice versa).
                  Money conversations can be tough, but clarity is the first step to fairness.
                </p>
                <button
                  onClick={() => setShowAlignmentModal(true)}
                  className="mt-2 text-xs font-medium text-natural-primary cursor-pointer hover:underline"
                >
                  Review Financial Profiles
                </button>
              </div>
            </div>
          </div>
        )}

        <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8" id="app-header">
          <div className="flex items-center gap-3 sm:gap-4 relative">
            <div className="shrink-0 p-1 bg-white border border-natural-border rounded-2xl shadow-sm hover:scale-105 transition-transform duration-300">
              <CherryLogo className="h-9 w-9 sm:h-14 sm:w-14" />
            </div>
            <h1 className="text-xl sm:text-4xl font-display font-semibold tracking-tight text-natural-text leading-tight">
              Have Another Cherry
            </h1>
          </div>

          {/* Three equal columns on phones; natural size in a row from sm up. */}
          <div
            className="grid grid-cols-3 gap-2 w-full sm:flex sm:w-auto sm:items-center sm:gap-3"
            id="header-controls"
          >
            <button
              onClick={() => (isPlus ? setShowVault(true) : setShowCherryPlus(true))}
              className="min-w-0 w-full sm:w-auto bg-white border border-natural-border text-natural-text hover:border-natural-primary hover:text-natural-primary font-semibold text-xs sm:text-xs px-2.5 sm:px-4 py-2.5 rounded-full shadow-sm flex items-center justify-center gap-1.5 whitespace-nowrap transition-all cursor-pointer"
              title="Household Vault"
            >
              <VaultIcon className="h-4 w-4 shrink-0" /> Vault
              {!isPlus && <span className="hidden sm:inline text-[10px] font-bold tracking-wider text-white bg-natural-dark px-1 py-0.5 rounded">Cherry +</span>}
            </button>
            <button
              onClick={() => setShowPlanPurchase(true)}
              className="min-w-0 w-full sm:w-auto bg-white border border-natural-primary/30 text-natural-primary hover:bg-natural-sage/40 font-semibold text-xs sm:text-xs px-2.5 sm:px-4 py-2.5 rounded-full shadow-sm flex items-center justify-center gap-1.5 whitespace-nowrap transition-all cursor-pointer"
              title="Plan a shared purchase"
            >
              <TrendingUp className="h-4 w-4 shrink-0" />
              <span className="sm:hidden">Plan</span>
              <span className="hidden sm:inline">Plan a Purchase</span>
            </button>
            <button
              onClick={() => {
                setEditingExpense(null);
                setShowForm(true);
              }}
              className="min-w-0 w-full sm:w-auto bg-natural-primary hover:bg-natural-primary-ink text-white font-semibold text-xs sm:text-xs px-2.5 sm:px-5 py-2.5 rounded-full shadow-md hover:shadow-lg flex items-center justify-center gap-1.5 whitespace-nowrap transition-all cursor-pointer"
            >
              <Plus className="h-4 w-4 shrink-0" />
              <span className="sm:hidden">Log</span>
              <span className="hidden sm:inline">Log Expense</span>
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
                <div className="relative mt-0.5">
                  <button
                    onClick={() => setShowGroupMenu(v => !v)}
                    className="text-xs text-natural-muted hover:text-natural-primary flex items-center gap-1 transition-colors"
                    title="Switch group"
                  >
                    Group: <strong className="text-natural-text">{group.name || 'Unnamed Group'}</strong>
                    <ChevronDown size={12} className={`transition-transform ${showGroupMenu ? 'rotate-180' : ''}`} />
                  </button>
                  {showGroupMenu && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setShowGroupMenu(false)} />
                      <div className="absolute left-0 mt-1 z-20 w-64 bg-white border border-natural-border rounded-xl shadow-lg py-1 animate-in fade-in slide-in-from-top-1">
                        <p className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-natural-muted">Your Groups</p>
                        {groupIds.map(gid => {
                          const isActive = gid === activeGroupId;
                          const name = gid === group.id
                            ? (group.name || 'Unnamed Group')
                            : (groupSummaries[gid]?.name || 'Unnamed Group');
                          return (
                            <button
                              key={gid}
                              onClick={() => handleSwitchGroup(gid)}
                              disabled={isActive}
                              className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between gap-2 transition-colors ${isActive ? 'font-bold text-natural-primary bg-natural-sage/20 cursor-default' : 'text-natural-text hover:bg-natural-bg'}`}
                            >
                              <span className="truncate">{name}</span>
                              {isActive && <Check size={14} className="text-natural-primary shrink-0" />}
                            </button>
                          );
                        })}
                        <div className="border-t border-natural-border my-1" />
                        <button
                          onClick={() => { setShowGroupMenu(false); setShowAddGroup(true); }}
                          className="w-full text-left px-3 py-2 text-xs font-semibold text-natural-primary hover:bg-natural-bg flex items-center gap-1.5 transition-colors"
                        >
                          <Plus size={14} /> Join or create another group
                        </button>
                      </div>
                    </>
                  )}
                </div>
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
                <span className="absolute -top-1.5 -right-1.5 bg-natural-primary text-white text-xs font-bold rounded-full h-4 min-w-4 px-1 flex items-center justify-center">
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
                className="shrink-0 bg-natural-primary hover:bg-natural-primary-ink text-white font-semibold text-xs px-4 py-2 rounded-full shadow-sm transition-colors"
              >
                Review
              </button>
            </div>
          )}

          {overThresholdExpenses.length > 0 && (
            <div className="bg-natural-primary/5 border border-natural-primary/25 rounded-xl p-4 shadow-sm flex items-start gap-3 animate-in fade-in slide-in-from-top-2">
              <AlertCircle className="h-5 w-5 text-natural-primary shrink-0 mt-0.5" />
              <div className="flex-1">
                <h3 className="text-sm font-bold text-natural-text">
                  {overThresholdExpenses.length === 1 ? 'A shared expense is over your threshold' : `${overThresholdExpenses.length} shared expenses are over your threshold`}
                </h3>
                <p className="text-xs text-natural-muted mt-1">
                  Your share {overThresholdExpenses.length === 1 ? 'here exceeds' : 'on these exceeds'} your spending threshold of ${myThreshold.toFixed(0)}. Worth a look, and a conversation if the timing's tight.
                </p>
              </div>
              <button
                onClick={() => setSelectedExpense(overThresholdExpenses[0])}
                className="shrink-0 bg-natural-primary hover:bg-natural-primary-ink text-white font-semibold text-xs px-4 py-2 rounded-full shadow-sm transition-colors"
              >
                Review
              </button>
            </div>
          )}

          {missingProfiles.length > 0 && !dismissedWaiting && (
            <div className="bg-natural-primary/5 border border-natural-primary/25 rounded-xl p-4 shadow-sm flex items-start gap-3 animate-in fade-in slide-in-from-top-2">
              <Sparkles className="h-5 w-5 text-natural-primary shrink-0 mt-0.5" />
              <div className="flex-1">
                <h3 className="text-sm font-bold text-natural-text">Some members are still setting up</h3>
                <p className="text-xs text-natural-muted mt-1">
                  You can start logging and settling expenses right away. Income-based splits and financial
                  insights will get more accurate once everyone finishes their profile quiz.
                </p>
                <div className="mt-2 space-y-0.5">
                  {missingProfiles.map(id => (
                    <div key={id} className="text-xs font-medium text-natural-primary">
                      {groupUsers[id]?.name || 'Someone'} hasn't completed setup yet.
                    </div>
                  ))}
                </div>
              </div>
              <button
                onClick={() => setDismissedWaiting(true)}
                className="text-natural-primary hover:text-natural-dark bg-white/60 p-1 rounded-full border border-natural-primary/25 shrink-0"
                title="Dismiss"
                aria-label="Dismiss"
              >
                <X size={14} />
              </button>
            </div>
          )}

          {/* Balances are a sticky right rail on large screens and a band above the ledger on phones. */}
          <div className="flex flex-col lg:flex-row lg:items-start gap-6">
            <div className="flex-1 min-w-0 space-y-6 order-2 lg:order-1">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-natural-muted uppercase tracking-widest">Shared Ledger</h3>
                </div>
                <ModuleBoundary label="Shared Ledger">
                  <ExpenseList
                    expenses={expenses}
                    group={group}
                    activeUser={activeUser}
                    onExpenseClick={(exp) => setSelectedExpense(exp)}
                  />
                </ModuleBoundary>
              </div>
              {/* Gated: month-over-month is on the paywall as "Insights and monthly trends". */}
              {isPlus && (
                <ModuleBoundary label="Monthly trends">
                  <MonthlyComparisonChart expenses={statsVisibleExpenses} members={getFullMembers(group)} />
                </ModuleBoundary>
              )}
            </div>

            <div className="order-1 lg:order-2 lg:w-80 xl:w-96 shrink-0 lg:sticky lg:top-6 space-y-6">
              {/* Balances are the free splitter itself, never gated. */}
              <ModuleBoundary label="Balances">
                <StatsSection expenses={statsVisibleExpenses} group={group} activeUser={activeUser} orientation="rail" onCardClick={(card) => setOwedModal(card)} />
              </ModuleBoundary>
              {!isPlus && (
                <button
                  type="button"
                  onClick={() => setShowCherryPlus(true)}
                  className="w-full text-left bg-white border border-natural-border rounded-2xl p-5 shadow-sm hover:border-natural-primary/40 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold uppercase tracking-widest text-natural-muted">Insights</span>
                    <span className="text-[10px] font-bold tracking-wider text-white bg-natural-dark px-1 py-0.5 rounded">Cherry +</span>
                  </div>
                  <p className="mt-2 font-display text-lg font-semibold text-natural-text">
                    See where the money actually goes
                  </p>
                  <p className="mt-1 text-sm text-natural-muted">
                    How it was paid, who is carrying the card, and how long
                    things take to come back. Arriving with the iOS and Android
                    apps.
                  </p>
                  <span className="mt-3 inline-block text-sm font-semibold text-natural-primary">
                    Join the waitlist
                  </span>
                </button>
              )}
              <ModuleBoundary label="Rhythm">
                <RhythmCard expenses={expenses} locked={!isPlus} onUnlock={() => setShowCherryPlus(true)} />
              </ModuleBoundary>
            </div>
          </div>
        </div>

        <footer className="text-center text-xs text-natural-muted mt-12 pb-6 scroll-end-safe space-y-1" id="app-footer">
          <p>Have Another Cherry • Shared Home Ledger</p>
          <p className="font-mono">Real-time Cloud Sync Active</p>
        </footer>
      </main>

      {showAddGroup && (
        <div className="fixed inset-0 z-50 overflow-auto animate-in fade-in duration-200">
          <GroupSetup onComplete={applyJoinedGroup} onCancel={() => setShowAddGroup(false)} />
        </div>
      )}
      {showBackup && isPlus && (
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
          onSaveMarketingOptIn={handleSaveMarketingOptIn}
          onRetakeQuiz={handleRetakeQuiz}
          onRecalculateSplit={handleRecalculateSplit}
          onResendInvite={handleResendInvite}
          onAddSeat={handleAddSeat}
          onRemoveSeat={handleRemoveSeat}
          onLeaveGroup={handleLeaveGroup}
          onOpenBackup={() => {
            // Backups and export are Cherry +; free users get the upgrade page.
            setShowSettings(false);
            if (isPlus) { setShowBackup(true); } else { setShowCherryPlus(true); }
          }}
          onOpenPrivacy={() => setShowPrivacyModal(true)}
          onSignOut={() => { setShowSettings(false); handleSignOut(); }}
          extraSection={
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-bold text-natural-muted uppercase tracking-wider">Budget & Payments</h3>
                <button
                  onClick={() => setShowCherryPlus(true)}
                  className="text-[10px] font-bold tracking-wider text-white bg-natural-dark px-2 py-1 rounded-md hover:bg-natural-primary transition-colors"
                  title="About Cherry +"
                >
                  Cherry +
                </button>
              </div>
              <div className="bg-natural-sage/20 p-4 rounded-xl border border-natural-primary/20 space-y-4">
                <div>
                  <label className="block text-xs font-bold text-natural-muted uppercase tracking-wider mb-1 flex items-center gap-2">
                    Spending threshold
                    {!isPlus && <span className="text-[10px] font-bold tracking-wider text-white bg-natural-dark px-1 py-0.5 rounded">Cherry +</span>}
                  </label>
                  <p className="text-xs text-natural-muted mb-2">The most you want to owe on a single shared expense. Everyone on the expense gets a heads-up when a split goes over it.</p>
                  {isPlus ? (
                    <div>
                      <div className="flex items-center gap-2">
                        <div className="relative flex-1">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-natural-muted text-sm">$</span>
                          <input
                            type="number"
                            min="0"
                            value={thresholdInput}
                            onChange={(e) => setThresholdInput(e.target.value)}
                            placeholder="Amount"
                            className="w-full pl-7 pr-3 py-2 bg-white border border-natural-border rounded-lg text-sm outline-none focus:border-natural-primary"
                          />
                        </div>
                        <button
                          onClick={handleSaveThreshold}
                          disabled={savingThreshold}
                          className="text-xs font-bold text-white bg-natural-primary hover:bg-natural-primary-ink px-4 py-2 rounded-lg shrink-0 disabled:opacity-60"
                        >
                          {savingThreshold ? 'Saving...' : 'Save'}
                        </button>
                      </div>
                      <p className="text-xs text-natural-muted mt-1.5">0 turns it off.</p>
                    </div>
                  ) : (
                    <button
                      onClick={() => { setShowSettings(false); setShowCherryPlus(true); }}
                      className="w-full py-2 text-xs font-bold text-natural-primary bg-white border border-natural-primary/30 hover:bg-natural-sage/30 rounded-lg transition-colors"
                    >
                      Unlock with Cherry +
                    </button>
                  )}
                </div>

                <div className="border-t border-natural-primary/10 pt-3">
                  <label className="block text-xs font-bold text-natural-muted uppercase tracking-wider mb-1 flex items-center gap-1.5"><Wallet size={12} /> How people pay you</label>
                  <p className="text-xs text-natural-muted mb-2">Add your handles and group members get a one-tap way into Venmo or Zelle when they settle up with you.</p>
                  <div className="space-y-2">
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-natural-muted text-sm">@</span>
                      <input
                        type="text"
                        value={venmoInput}
                        onChange={(e) => setVenmoInput(e.target.value)}
                        placeholder="Venmo username"
                        className="w-full pl-7 pr-3 py-2 bg-white border border-natural-border rounded-lg text-sm outline-none focus:border-natural-primary"
                      />
                    </div>
                    <input
                      type="text"
                      value={zelleInput}
                      onChange={(e) => setZelleInput(e.target.value)}
                      placeholder="Zelle email or phone"
                      className="w-full px-3 py-2 bg-white border border-natural-border rounded-lg text-sm outline-none focus:border-natural-primary"
                    />
                    <button
                      onClick={handleSavePaymentHandles}
                      disabled={savingHandles}
                      className="w-full text-sm font-bold text-white bg-natural-primary hover:bg-natural-primary-ink px-4 py-2 rounded-lg disabled:opacity-60"
                    >
                      {savingHandles ? 'Saving...' : 'Save Payment Info'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          }
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

      {owedModal && (
        <OwedBreakdownModal
          mode={owedModal}
          expenses={statsVisibleExpenses}
          group={group}
          activeUser={activeUser}
          isPlus={isPlus}
          onSelectExpense={(exp) => setSelectedExpense(exp)}
          onCherryPlus={() => setShowCherryPlus(true)}
          onToast={addToast}
          onClose={() => setOwedModal(null)}
        />
      )}

      {showCherryPlus && (
        <CherryPlusModal
          onClose={() => setShowCherryPlus(false)}
          customerEmail={currentUser?.email || userProfile?.email}
          onPurchased={() =>
            // Unlock now; the webhook writes the durable copy to users/{uid}.
            setUserProfile((prev: any) => ({
              ...(prev || {}),
              isPlus: true,
              plusEntitlement: {
                source: 'revenuecat_web',
                updatedAt: new Date().toISOString(),
              },
            }))
          }
        />
      )}

      {supportError && (
        <ErrorSupportModal
          error={supportError.error}
          screen={supportError.screen}
          detail={supportError.detail}
          onClose={() => setSupportError(null)}
        />
      )}

      {showPlanPurchase && (
        <PlanPurchase
          group={group}
          activeUser={activeUser}
          groupUsers={groupUsers}
          expenses={expenses}
          onClose={() => setShowPlanPurchase(false)}
        />
      )}

      {showVault && isPlus && (
        <HouseholdVault
          groupId={group.id}
          activeUser={activeUser}
          expenses={expenses}
          memberNames={Object.fromEntries(getFullMembers(group).map(m => [m.uid, m.name]))}
          categories={group.categories}
          onClose={() => setShowVault(false)}
        />
      )}

      {showAlignmentModal && (
        <FinancialAlignmentModal
          onClose={() => setShowAlignmentModal(false)}
          activeUser={activeUser}
          severityPct={incomeDiscrepancyPct}
          members={Object.entries(groupUsers).map(([uid, u]) => ({
            uid,
            name: u?.name || '',
            income: u?.income,
            partnerIncome: u?.partnerIncome,
            financialProfile: u?.financialProfile,
          }))}
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
          memberThresholds={memberThresholds}
          isPlus={isPlus}
        />
      )}

      {/* The live copy, so synced confirmations and edits show up immediately. */}
      {selectedExpense && (
        <ExpenseDetail
          expense={expenses.find(e => e.id === selectedExpense.id) || selectedExpense}
          group={group}
          activeUser={activeUser}
          onClose={() => setSelectedExpense(null)}
          onEdit={() => {
            setEditingExpense(expenses.find(e => e.id === selectedExpense.id) || selectedExpense);
            setSelectedExpense(null);
            setShowForm(true);
          }}
          onDelete={() => handleDeleteExpense(selectedExpense.id)}
          onSettleClick={() => setShowSettleModal(true)}
          onConfirmReceipt={(settlementId) => handleConfirmSettleReceipt(settlementId)}
          onVoidSettlement={(settlementId) => handleVoidSettlement(settlementId)}
          onAddComment={(text) => handleAddComment(selectedExpense.id, text)}
          onGentleRemind={() => handleGentleRemind(expenses.find(e => e.id === selectedExpense.id) || selectedExpense)}
          onClaim={(uid) => handleClaimExpense(selectedExpense.id, uid)}
        />
      )}

      {showSettleModal && selectedExpense && (
        <SettleUpModal
          expense={expenses.find(e => e.id === selectedExpense.id) || selectedExpense}
          group={group}
          activeUser={activeUser}
          paymentHandlesByUid={paymentHandlesByUid}
          onClose={() => setShowSettleModal(false)}
          onSubmit={handleSettleUpProposal}
        />
      )}

      {legalDoc && <LegalModal doc={legalDoc} onClose={() => setLegalDoc(null)} />}
    </div>
  );
}

