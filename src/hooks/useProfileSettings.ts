import { useState, useEffect } from 'react';
import { updateDoc, doc, getDoc, deleteField } from 'firebase/firestore';
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
import { CHERRY_ERRORS } from '../lib/errors';
import type { Dispatch, SetStateAction } from 'react';
import { Expense, Group } from '../types';
import { SupportError } from '../lib/errors';

type AddToast = (title: string, message: string, type?: 'info' | 'success' | 'error') => void;
type Setter<T> = Dispatch<SetStateAction<T>>;

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

  const [venmoInput, setVenmoInput] = useState('');

  const [zelleInput, setZelleInput] = useState('');

  const [savingThreshold, setSavingThreshold] = useState(false);

  const [savingHandles, setSavingHandles] = useState(false);

  useEffect(() => {
    if (!currentUser) return;
    setIsLoading(true);

    const fetchProfile = async () => {
      try {
        const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
        if (userDoc.exists()) {
          const profile = userDoc.data() as any;
          // Backfill a missing name from the sign-in display name.
          if (
            (!profile.name || profile.name === 'Anonymous' || profile.name === 'Unknown') &&
            currentUser.displayName
          ) {
            profile.name = currentUser.displayName;
            updateDoc(doc(db, 'users', currentUser.uid), { name: currentUser.displayName }).catch(
              () => {}
            );
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
          setUserProfile(profile);
        } else {
          setUserProfile({}); // Setup required
        }
      } catch (error) {
        console.error('Error fetching profile', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchProfile();
  }, [currentUser]);

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
    return () => {
      cancelled = true;
    };
  }, [
    userProfile?.recurringThreshold,
    userProfile?.paymentHandlesEnc,
    userProfile?.paymentHandles,
    activeUser,
  ]);

  // Every member's handles, decrypted with their uid (which groupmates know),
  // for the settle screen's Venmo/Zelle handoff.
  const [paymentHandlesByUid, setPaymentHandlesByUid] = useState<
    Record<string, { venmo?: string; zelle?: string }>
  >({});

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
      addToast('Name Required', 'Please enter a name.', 'info');
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
      addToast(
        'Threshold Saved',
        val > 0 ? `We'll flag shared expenses over $${val}.` : 'Threshold cleared.',
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
      setUserProfile((prev: any) => ({
        ...(prev || {}),
        paymentHandlesEnc: enc,
        paymentHandles: undefined,
      }));
      setPaymentHandlesByUid((prev) => ({ ...prev, [activeUser]: handles }));
      addToast(
        'Payment Info Saved',
        'Encrypted and saved. Group members can now pay you directly through Venmo or Zelle.',
        'success'
      );
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
    } catch (e) {
      console.error('Failed to reset profile', e);
    }
  };

  return {
    thresholdInput,
    setThresholdInput,
    venmoInput,
    setVenmoInput,
    zelleInput,
    setZelleInput,
    savingThreshold,
    savingHandles,
    paymentHandlesByUid,
    handleExportData,
    handleSaveName,
    handleSaveMarketingOptIn,
    handleSaveThreshold,
    handleSavePaymentHandles,
    handleRetakeQuiz,
  };
}
