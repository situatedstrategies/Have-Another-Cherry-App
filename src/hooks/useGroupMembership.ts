import { useState, useEffect, useCallback, useRef } from 'react';
import {
  onSnapshot,
  updateDoc,
  deleteDoc,
  doc,
  getDoc,
  deleteField,
  arrayRemove,
} from 'firebase/firestore';
import { auth, db, authHeader } from '../firebase';
import { joinedUids, pendingSeats, withAddedSeat, withRemovedSeat } from '../lib/members';
import { CHERRY_ERRORS } from '../lib/errors';
import type { Dispatch, SetStateAction } from 'react';
import { Expense, Group } from '../types';
import { SupportError } from '../lib/errors';

type AddToast = (title: string, message: string, type?: 'info' | 'success' | 'error') => void;
type Setter<T> = Dispatch<SetStateAction<T>>;

export function useGroupMembership({
  currentUser,
  activeUser,
  userProfile,
  setUserProfile,
  group,
  setGroup,
  setGroupUsers,
  groupUsers,
  setExpenses,
  setSelectedExpense,
  setEditingExpense,
  setShowAddGroup,
  setShowSettings,
  setShowGroupMenu,
  setShowPrivacyModal,
  setDismissedWaiting,
  addToast,
  setSupportError,
}: {
  currentUser: any;
  activeUser: any;
  userProfile: any;
  setUserProfile: Setter<any>;
  group: Group | null;
  setGroup: Setter<Group | null>;
  setGroupUsers: Setter<Record<string, any>>;
  groupUsers: Record<string, any>;
  setExpenses: Setter<Expense[]>;
  setSelectedExpense: Setter<Expense | null>;
  setEditingExpense: Setter<Expense | null>;
  setShowAddGroup: Setter<boolean>;
  setShowSettings: Setter<boolean>;
  setShowGroupMenu: Setter<boolean>;
  setShowPrivacyModal: Setter<boolean>;
  setDismissedWaiting: Setter<boolean>;
  addToast: AddToast;
  setSupportError: Setter<SupportError | null>;
}) {
  // `activeGroupId` is the group being viewed; `groupIds` is the full set. Both
  // fall back to the legacy single `groupId` field.
  const activeGroupId: string | null = userProfile?.activeGroupId || userProfile?.groupId || null;

  const groupIds: string[] =
    Array.isArray(userProfile?.groupIds) && userProfile.groupIds.length
      ? userProfile.groupIds
      : userProfile?.groupId
        ? [userProfile.groupId]
        : [];

  // For listeners that must not re-subscribe on every profile change.
  const groupIdsRef = useRef<string[]>([]);

  groupIdsRef.current = groupIds;

  const [groupSummaries, setGroupSummaries] = useState<Record<string, { name?: string }>>({});

  // After creating or joining a group (GroupSetup already wrote the docs):
  // make it active locally and clear the previous group's view state.
  const applyJoinedGroup = useCallback((gid: string) => {
    setUserProfile((prev: any) => {
      const prevIds: string[] =
        Array.isArray(prev?.groupIds) && prev.groupIds.length
          ? prev.groupIds
          : prev?.groupId
            ? [prev.groupId]
            : [];
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
    if (!currentUser || !activeGroupId) return;
    const gid = activeGroupId;
    const groupUnsubscribe = onSnapshot(
      doc(db, 'groups', gid),
      (groupSnapshot) => {
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
        const remaining = groupIdsRef.current.filter((id) => id !== gid);
        const nextActive = remaining[0] || null;
        setGroup(null);
        setUserProfile((prev: any) =>
          prev
            ? { ...prev, groupIds: remaining, activeGroupId: nextActive, groupId: nextActive }
            : prev
        );
        updateDoc(doc(db, 'users', currentUser.uid), {
          groupIds: arrayRemove(gid),
          activeGroupId: nextActive ?? deleteField(),
          groupId: nextActive ?? deleteField(),
        }).catch(() => {});
      },
      (error) => {
        // Sign-out cancels listeners with permission-denied; teardown noise.
        if (error.code === 'permission-denied' && !auth.currentUser) return;
        console.error('groupUnsubscribe error:', error);
      }
    );
    return () => groupUnsubscribe();
  }, [currentUser, activeGroupId]);

  // Group names for the header switcher. Any signed-in user may `get` a group by id.
  useEffect(() => {
    if (!groupIds.length) {
      setGroupSummaries({});
      return;
    }
    let cancelled = false;
    (async () => {
      const entries = await Promise.all(
        groupIds.map(async (gid) => {
          try {
            const snap = await getDoc(doc(db, 'groups', gid));
            return [gid, { name: snap.exists() ? (snap.data() as any).name : undefined }] as const;
          } catch {
            return [gid, {}] as const;
          }
        })
      );
      if (!cancelled) setGroupSummaries(Object.fromEntries(entries));
    })();
    return () => {
      cancelled = true;
    };
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
      onSnapshot(
        doc(db, 'users', uid),
        (snap) => {
          if (snap.exists()) {
            users[uid] = snap.data();
          } else {
            delete users[uid];
          }
          setGroupUsers({ ...users });
        },
        (error) => {
          if (error.code === 'permission-denied' && !auth.currentUser) return;
          // Surface it: a silent empty roster disables every feature built on it.
          console.error('group member listener error for ' + uid + ':', error);
        }
      )
    );
    return () => unsubs.forEach((u) => u());
  }, [currentUser, memberIdsKey]);

  // Shared by Leave Group and Delete Account. Redistributes the leaver's split
  // so household-default expenses still bill 100%, and deletes the group when
  // the last member leaves. Reads the group fresh so it works for any group.
  const removeSelfFromGroupById = async (gid: string) => {
    const groupRef = doc(db, 'groups', gid);
    const snap = await getDoc(groupRef);
    if (!snap.exists()) return;
    const g = snap.data() as Group;
    const newMembers = (g.members || []).filter((m) => m.uid !== activeUser);
    const newMemberIds = (g.memberIds || []).filter((id) => id !== activeUser);

    // Last member out deletes the group rather than leaving a dead one on the invite code.
    if (newMemberIds.length === 0) {
      await deleteDoc(groupRef);
      return;
    }

    // Proportional to current shares; pending ghost slots are left untouched.
    const split = g.defaultSplit || {};
    const leaverPct = Number(split[activeUser]) || 0;
    const newDefault: Record<string, number> = {};
    newMemberIds.forEach((uid) => {
      newDefault[uid] = Number(split[uid]) || 0;
    });
    const joinedSum = newMemberIds.reduce((sum, uid) => sum + (Number(split[uid]) || 0), 0);
    if (leaverPct > 0) {
      let acc = 0;
      newMemberIds.forEach((uid, i) => {
        const base = Number(split[uid]) || 0;
        const add =
          i === newMemberIds.length - 1
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
    const remaining = groupIds.filter((id) => id !== activeGroupId);
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
      setUserProfile((prev: any) => ({
        ...(prev || {}),
        groupIds: remaining,
        activeGroupId: nextActive,
        groupId: nextActive,
      }));
      setGroup(null);
      setGroupUsers({});
      setExpenses([]);
      setSelectedExpense(null);
    } catch (err) {
      console.error('Error leaving group', err);
      alert('Failed to leave the group. Please try again.');
    }
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
          fromName:
            (userProfile?.name && !['Anonymous', 'Unknown'].includes(userProfile.name)
              ? userProfile.name
              : currentUser?.displayName) || undefined,
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
    addToast(
      'Seat Added',
      `${name.trim()} can join with the invite code. Their share comes out of everyone's proportionally.`,
      'success'
    );
    if (email?.trim()) await handleResendInvite(name.trim(), email);
  };

  const handleRemoveSeat = async (index: number) => {
    if (!group) return;
    const seat = pendingSeats(group)[index];
    if (!seat) return;
    if (
      !window.confirm(
        `Remove the pending seat for ${seat.name}? Their ${seat.split}% goes back to everyone else.`
      )
    )
      return;
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
      addToast(
        'Cannot Recalculate',
        'Everyone needs an income on their profile before the split can be recalculated.',
        'error'
      );
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
      addToast(
        'Split Updated',
        `New split is ${pct1}% / ${pct2}% based on verified incomes.`,
        'success'
      );
    } catch (e) {
      console.error('Failed to recalculate split', e);
      addToast('Error', 'Could not update the split. Please try again.', 'error');
    }
  };

  return {
    activeGroupId,
    groupIds,
    groupSummaries,
    memberIdsKey,
    applyJoinedGroup,
    removeSelfFromGroupById,
    handleSwitchGroup,
    handleLeaveGroup,
    handleAddSeat,
    handleRemoveSeat,
    handleRecalculateSplit,
    handleResendInvite,
  };
}
