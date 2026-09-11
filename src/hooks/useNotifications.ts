import { useEffect } from 'react';
import { collection, doc, setDoc } from 'firebase/firestore';
import { db, authHeader } from '../firebase';
import { pushPermission, enableWebPush, listenForegroundPush } from '../lib/push';
import { getRemainingSettlementAmount } from '../lib/money';
import { encryptData } from '../lib/crypto';
import { Expense, Group } from '../types';

type AddToast = (title: string, message: string, type?: 'info' | 'success' | 'error') => void;

export function useNotifications({
  currentUser,
  activeUser,
  group,
  addToast,
}: {
  currentUser: any;
  activeUser: any;
  group: Group | null;
  addToast: AddToast;
}) {
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
    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [currentUser]);

  const broadcastToMembers = async (action: 'UPSERT' | 'DELETE', payloadObject: unknown) => {
    if (!group) return;

    const encrypted = await encryptData(payloadObject, group.id);

    const otherMembers = (group.memberIds || []).filter((id) => id !== activeUser);

    const results = await Promise.allSettled(
      otherMembers.map((memberId) =>
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

    const failed = results.filter((result) => result.status === 'rejected').length;

    if (failed > 0) {
      console.error(`broadcastToMembers: ${failed}/${otherMembers.length} writes failed`);
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
      } catch {
        /* best effort */
      }
    })();
  };

  // Manual push to this expense's outstanding debtors.
  const handleGentleRemind = async (expense: Expense) => {
    if (!group) return;
    const debtors = group.memberIds!.filter(
      (uid) => uid !== expense.paidBy && getRemainingSettlementAmount(expense, uid, false) > 0.01
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

  return { broadcastToMembers, notifyLedgerEvent, handleGentleRemind };
}
