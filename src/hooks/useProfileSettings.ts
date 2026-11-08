import { useState, useEffect, useRef } from 'react';
import { updateDoc, doc, deleteField, onSnapshot } from 'firebase/firestore';
import { updateProfile } from 'firebase/auth';
import { auth, db, authHeader } from '../firebase';
import { getFullMembers } from '../lib/members';
import {
  getRemainingSettlementAmount,
  getSettlementTotal,
  getExpenseStatusLabel,
  roundCurrency,
} from '../lib/money';
import { encryptData, decryptData } from '../lib/crypto';
import { getGreetingKey } from '../lib/greeting';
import { incomeInputError, parseIncome, normalizeIncome } from '../lib/income';
import { quizRetakeBlocker } from '../lib/quizRetake';
import { isBankId, isHandoffId } from '../lib/handoffs';
import { CHERRY_ERRORS } from '../lib/errors';
import type { Dispatch, SetStateAction } from 'react';
import { Expense, Group } from '../types';
import { t } from '../i18n';
import { formatCurrency } from '../lib/format';
import { SupportError } from '../lib/errors';

type AddToast = (title: string, message: string, type?: 'info' | 'success' | 'error') => void;
type Setter<T> = Dispatch<SetStateAction<T>>;

// A member's handles by handoff id: the 2.0 `handles` map, else the 1.x
// encrypted Venmo and Zelle pair, else the pre-encryption plaintext.
async function readHandles(profile: any, uid: string | undefined): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  if (profile?.handles && typeof profile.handles === 'object') {
    for (const [id, v] of Object.entries(profile.handles)) {
      if (isHandoffId(id) && typeof v === 'string' && v.trim()) out[id] = v.trim();
    }
    if (Object.keys(out).length > 0) return out;
  }
  let legacy: any = profile?.paymentHandles || null;
  if (profile?.paymentHandlesEnc && uid) {
    try {
      legacy = await decryptData(profile.paymentHandlesEnc, uid);
    } catch (e) {
      console.error('Could not decrypt payment handles', e);
    }
  }
  if (legacy?.venmo) out.venmo = String(legacy.venmo).replace(/^@/, '');
  if (legacy?.zelle) out.zelle = String(legacy.zelle);
  return out;
}

export function useProfileSettings({
  currentUser,
  activeUser,
  userProfile,
  setUserProfile,
  setIsLoading,
  group,
  groupUsers,
  expenses,
  addToast,
  setSupportError,
}: {
  currentUser: any;
  activeUser: any;
  userProfile: any;
  setUserProfile: Setter<any>;
  setIsLoading: Setter<boolean>;
  group: Group | null;
  groupUsers: Record<string, any>;
  expenses: Expense[];
  addToast: AddToast;
  setSupportError: Setter<SupportError | null>;
}) {
  const [thresholdInput, setThresholdInput] = useState('');

  // Payment handles by handoff id and the bank app picked per pick-your-bank
  // handoff (lib/handoffs.ts). Inputs mirror the profile until Save.
  const [handlesInput, setHandlesInput] = useState<Record<string, string>>({});
  const [bankAppInput, setBankAppInput] = useState<Record<string, string>>({});

  const [savingThreshold, setSavingThreshold] = useState(false);

  const [savingHandles, setSavingHandles] = useState(false);

  // The profile is a LIVE listener, not a one-shot read, so entitlement
  // writes that land after sign-in — the RevenueCat webhook, plus-promo-sync,
  // a purchase made on another device or platform — reach this session
  // immediately. Cherry+ follows the account, whichever group is active.
  const profileBackfilledRef = useRef<string | null>(null);
  useEffect(() => {
    if (!currentUser) return;
    setIsLoading(true);

    const unsubscribe = onSnapshot(
      doc(db, 'users', currentUser.uid),
      (userDoc) => {
        if (userDoc.exists()) {
          const profile = userDoc.data() as any;
          // One-time backfills per sign-in; the writes echo back through this
          // same listener, so guard against re-running them on every snapshot.
          if (profileBackfilledRef.current !== currentUser.uid) {
            profileBackfilledRef.current = currentUser.uid;
            // Backfill a missing name from the sign-in display name.
            if (
              (!profile.name || profile.name === 'Anonymous' || profile.name === 'Unknown') &&
              currentUser.displayName
            ) {
              profile.name = currentUser.displayName;
              updateDoc(doc(db, 'users', currentUser.uid), {
                name: currentUser.displayName,
              }).catch(() => {});
            }
            // Migrate legacy single-group accounts to the multi-group shape.
            if (
              profile.groupId &&
              (!Array.isArray(profile.groupIds) ||
                profile.groupIds.length === 0 ||
                !profile.activeGroupId)
            ) {
              profile.groupIds =
                Array.isArray(profile.groupIds) && profile.groupIds.length
                  ? profile.groupIds
                  : [profile.groupId];
              profile.activeGroupId = profile.activeGroupId || profile.groupId;
              updateDoc(doc(db, 'users', currentUser.uid), {
                groupIds: profile.groupIds,
                activeGroupId: profile.activeGroupId,
              }).catch(() => {});
            }
          }
          setUserProfile(profile);
        } else {
          setUserProfile({}); // Setup required
        }
        setIsLoading(false);
      },
      (error) => {
        // Sign-out cancels listeners with permission-denied; teardown noise.
        if ((error as any).code === 'permission-denied' && !auth.currentUser) return;
        console.error('Error watching profile', error);
        setIsLoading(false);
      }
    );

    return () => unsubscribe();
  }, [currentUser]);

  // Settings inputs mirror the profile. 2.0 stores `handles` by handoff id
  // and `bankApp` by handoff id in the clear (the people who read them are
  // the group members who have to pay the person, so the uid-keyed
  // encryption of 1.x hid nothing from them). A profile that only has the
  // 1.x paymentHandlesEnc (Venmo and Zelle) is read through it.
  useEffect(() => {
    setThresholdInput(
      userProfile?.recurringThreshold > 0 ? String(userProfile.recurringThreshold) : ''
    );
    let cancelled = false;
    (async () => {
      const handles = await readHandles(userProfile, activeUser);
      if (!cancelled) {
        setHandlesInput(handles);
        setBankAppInput({ ...(userProfile?.bankApp || {}) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    userProfile?.recurringThreshold,
    userProfile?.handles,
    userProfile?.bankApp,
    userProfile?.paymentHandlesEnc,
    userProfile?.paymentHandles,
    activeUser,
  ]);

  // Every member's handles by handoff id, for the settle screen's handoffs
  // and the roster. Legacy encrypted handles are decrypted with the member's
  // uid, which groupmates know.
  const [paymentHandlesByUid, setPaymentHandlesByUid] = useState<
    Record<string, Record<string, string>>
  >({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const next: Record<string, Record<string, string>> = {};
      for (const [uid, u] of Object.entries(groupUsers) as [string, any][]) {
        const handles = await readHandles(u, uid);
        if (Object.keys(handles).length > 0) next[uid] = handles;
      }
      if (!cancelled) setPaymentHandlesByUid(next);
    })();
    return () => {
      cancelled = true;
    };
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
    return () => {
      cancelled = true;
    };
  }, [
    activeUser,
    group?.memberIds?.length,
    userProfile?.financialProfile?.type,
    userProfile?.weeklyGreeting?.key,
  ]);

  const handleExportData = () => {
    if (!group) return;

    const allMembers = getFullMembers(group);

    const escapeCsv = (value: unknown): string => {
      const text = String(value ?? '');
      return `"${text.replace(/"/g, '""')}"`;
    };

    // The "Participant Type" column and guest rows appear only once some
    // expense has an extra participant, so the plain format is unchanged.
    const hasExtras = expenses.some((e) => (e.extraParticipants || []).length > 0);

    let csv =
      [
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
        'Remaining Balance',
      ].join(',') + '\n';

    const rowFor = (
      expense: Expense,
      paidByName: string,
      participant: string,
      type: string,
      originalShare: number,
      confirmedPaid: number,
      remaining: number
    ) =>
      [
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
        roundCurrency(remaining).toFixed(2),
      ].join(',') + '\n';

    expenses.forEach((expense) => {
      const paidByName =
        allMembers.find((member) => member.uid === expense.paidBy)?.name || expense.paidBy;

      Object.entries(expense.shares || {}).forEach(([userId, originalShare]) => {
        if (userId === expense.paidBy) return;

        const participantName = allMembers.find((member) => member.uid === userId)?.name || userId;

        const confirmedPaid = getSettlementTotal(expense, userId, false);
        const remainingBalance = getRemainingSettlementAmount(expense, userId, false);

        csv += rowFor(
          expense,
          paidByName,
          participantName,
          'Member',
          originalShare || 0,
          confirmedPaid,
          remainingBalance
        );
      });

      if (expense.splitType === 'third_party' && expense.thirdPersonShare) {
        csv += rowFor(
          expense,
          paidByName,
          expense.thirdPersonName || 'Third Person',
          'Guest',
          expense.thirdPersonShare,
          0,
          expense.thirdPersonShare
        );
      }

      (expense.extraParticipants || []).forEach((g) => {
        csv += rowFor(expense, paidByName, g.name, 'Guest', g.share, 0, g.share);
      });
    });

    const blob = new Blob([csv], {
      type: 'text/csv;charset=utf-8;',
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

  const handleSaveName = async (newName: string) => {
    if (!newName) {
      addToast(t('profileHook.nameRequired'), t('profileHook.enterName'), 'info');
      return;
    }
    try {
      await updateDoc(doc(db, 'users', activeUser), { name: newName });
      if (auth.currentUser) {
        try {
          await updateProfile(auth.currentUser, { displayName: newName });
        } catch (e) {
          console.error(e);
        }
      }
      // The group's member list carries the name too.
      if (group && group.members?.some((m) => m.uid === activeUser)) {
        const newMembers = group.members.map((m) =>
          m.uid === activeUser ? { ...m, name: newName } : m
        );
        await updateDoc(doc(db, 'groups', group.id), { members: newMembers });
      }
      setUserProfile((prev: any) => ({ ...(prev || {}), name: newName }));
      addToast(t('profileHook.nameUpdated'), t('profileHook.nameUpdatedBody'), 'success');
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

  // Yearly income, editable from the Settings roster. Same writer either
  // client uses (users/{uid}.income as a plain number string); the group can
  // read it - that is its point: the roster shows it, and the income-based
  // split recommendation divides by the group total. Validation mirrors the
  // Flutter app's domain/profile/income.dart.
  const handleSaveIncome = async (raw: string): Promise<boolean> => {
    const err = incomeInputError(raw);
    if (err) {
      addToast(t('profileHook.checkIncome'), err, 'error');
      return false;
    }
    const income = normalizeIncome(parseIncome(raw)!);
    try {
      await updateDoc(doc(db, 'users', activeUser), { income });
      setUserProfile((prev: any) => ({ ...(prev || {}), income }));
      addToast(t('profileHook.incomeUpdated'), t('profileHook.incomeUpdatedBody'), 'success');
      return true;
    } catch (e) {
      console.error('Failed to save income', e);
      setSupportError({ error: CHERRY_ERRORS.settingsSave, screen: 'Settings - income' });
      return false;
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
      addToast(
        t('profileHook.thresholdSaved'),
        val > 0
          ? t('profileHook.willFlag', { amount: formatCurrency(val, 0) })
          : t('profileHook.thresholdCleared'),
        'success'
      );
    } catch (e) {
      console.error('Failed to save threshold', e);
      setSupportError({
        error: CHERRY_ERRORS.settingsSave,
        screen: 'Settings - spending threshold',
      });
    } finally {
      setSavingThreshold(false);
    }
  };

  // Writes `handles` and `bankApp` (the 2.0 shape both clients read), plus
  // the 1.x encrypted Venmo and Zelle pair so a phone still on 1.2 keeps its
  // handoffs; any legacy plaintext copy is deleted. Handles never enter
  // cloud backups.
  const handleSavePaymentHandles = async () => {
    if (savingHandles) return;
    const handles: Record<string, string> = {};
    for (const [id, raw] of Object.entries(handlesInput)) {
      if (!isHandoffId(id)) continue;
      const v = raw.trim().replace(/^[@$]/, '');
      if (v) handles[id] = v.slice(0, 120);
    }
    const bankApp: Record<string, string> = {};
    for (const [id, bank] of Object.entries(bankAppInput)) {
      if (isHandoffId(id) && isBankId(bank)) bankApp[id] = bank;
    }
    setSavingHandles(true);
    try {
      const legacy = { venmo: handles.venmo || '', zelle: handles.zelle || '' };
      const enc = await encryptData(legacy, activeUser);
      await updateDoc(doc(db, 'users', activeUser), {
        handles,
        bankApp,
        paymentHandlesEnc: enc,
        paymentHandles: deleteField(),
      });
      setUserProfile((prev: any) => ({
        ...(prev || {}),
        handles,
        bankApp,
        paymentHandlesEnc: enc,
        paymentHandles: undefined,
      }));
      setPaymentHandlesByUid((prev) => ({ ...prev, [activeUser]: handles }));
      addToast(t('profileHook.paymentSaved'), t('profileHook.paymentSavedBody'), 'success');
    } catch (e) {
      console.error('Failed to save payment handles', e);
      setSupportError({ error: CHERRY_ERRORS.settingsSave, screen: 'Settings - payment handles' });
    } finally {
      setSavingHandles(false);
    }
  };

  // The payer's bank for a pick-your-bank handoff, remembered from the settle
  // sheet so the next settlement opens the right app straight away.
  const handleSaveBankApp = async (handoff: string, bank: string) => {
    if (!isHandoffId(handoff) || !isBankId(bank)) return;
    const next = { ...(userProfile?.bankApp || {}), [handoff]: bank };
    setBankAppInput(next);
    setUserProfile((prev: any) => ({ ...(prev || {}), bankApp: next }));
    try {
      await updateDoc(doc(db, 'users', activeUser), { bankApp: next });
    } catch (e) {
      console.error('Failed to save bank app', e);
    }
  };

  const handleRetakeQuiz = async () => {
    const blocker = quizRetakeBlocker(userProfile?.financialProfileAt);
    if (blocker) {
      addToast(t('profileHook.notYet'), blocker, 'info');
      return;
    }
    try {
      await updateDoc(doc(db, 'users', activeUser), { financialProfile: null });
      setUserProfile((prev: any) => ({ ...prev, financialProfile: null }));
    } catch (e) {
      console.error('Failed to reset profile', e);
    }
  };

  return {
    thresholdInput,
    setThresholdInput,
    handlesInput,
    setHandlesInput,
    bankAppInput,
    setBankAppInput,
    savingThreshold,
    savingHandles,
    paymentHandlesByUid,
    handleExportData,
    handleSaveName,
    handleSaveIncome,
    handleSaveMarketingOptIn,
    handleSaveThreshold,
    handleSavePaymentHandles,
    handleSaveBankApp,
    handleRetakeQuiz,
  };
}
