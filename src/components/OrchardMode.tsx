import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Cherry,
  Check,
  Handshake,
  Repeat,
  Send,
  Tag,
  Calendar,
  Wallet,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { Expense, Group } from '../types';
import { getFullMembers } from '../lib/members';
import { getExpenseStatusLabel, getNormalizedExpenseStatus, isDarkCherry } from '../lib/money';
import { orchardDeck, outstandingFor, ORCHARD_SETTLED_TOLERANCE } from '../lib/orchard';

interface Props {
  expenses: Expense[];
  group: Group;
  activeUser: string;
  /** Open the settle-up modal for this expense (it overlays the deck). */
  onSettle: (expense: Expense) => void;
  /** Open the expense detail. */
  onOpen: (expense: Expense) => void;
  onAddComment: (expenseId: string, text: string) => Promise<void> | void;
  onClose: () => void;
}

const money = (v: number) => `$${v.toFixed(2)}`;
const label = 'text-[11px] font-mono font-bold uppercase tracking-[0.1em] text-natural-muted';
const shortDate = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};
const fullDate = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString();
};

/**
 * Cherry Pick: settle the ledger by swiping instead of tapping. Port of the
 * iOS Orchard screen. The unsettled items become a deck; drag or use the
 * arrow keys to move between them, and settling advances on its own so a
 * session of catching up is one continuous motion.
 */
export default function OrchardMode({
  expenses,
  group,
  activeUser,
  onSettle,
  onOpen,
  onAddComment,
  onClose,
}: Props) {
  const members = useMemo(() => getFullMembers(group), [group]);
  const memberName = (uid: string) =>
    uid === activeUser ? 'You' : members.find((m) => m.uid === uid)?.name || 'Someone';

  // Ids cleared or skipped this session: the deck never re-orders under
  // the user's finger the moment something settles.
  const [handled, setHandled] = useState<Set<string>>(() => new Set());
  const [page, setPage] = useState(0);
  const deck = useMemo(
    () => orchardDeck(expenses, activeUser, handled),
    [expenses, activeUser, handled]
  );
  const total = deck.length;
  const done = total === 0 || handled.size >= total;

  const advance = () => setPage((p) => Math.min(p + 1, Math.max(total - 1, 0)));
  const back = () => setPage((p) => Math.max(p - 1, 0));

  // A settlement logged in the overlay lowers the current card's remainder;
  // that is the signal to mark it handled and move on, so dismissing the
  // modal without logging leaves you where you were.
  const current = deck[page];
  const outstanding = current ? outstandingFor(current, activeUser) : 0;
  const lastOutstanding = useRef<Record<string, number>>({});
  useEffect(() => {
    if (!current) return;
    const before = lastOutstanding.current[current.id];
    lastOutstanding.current[current.id] = outstanding;
    if (
      before !== undefined &&
      outstanding < before - ORCHARD_SETTLED_TOLERANCE &&
      !handled.has(current.id)
    ) {
      setHandled((h) => new Set(h).add(current.id));
      advance();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outstanding, current?.id]);

  const skip = (e: Expense) => {
    setHandled((h) => new Set(h).add(e.id));
    advance();
  };

  // Drag to swipe. Pointer events, no library: track horizontal travel and
  // commit past a third of the card width.
  const [dragX, setDragX] = useState(0);
  const drag = useRef<{ startX: number; width: number } | null>(null);
  const onPointerDown = (ev: React.PointerEvent<HTMLDivElement>) => {
    if ((ev.target as HTMLElement).closest('button, input, textarea, a')) return;
    drag.current = { startX: ev.clientX, width: ev.currentTarget.clientWidth };
    ev.currentTarget.setPointerCapture(ev.pointerId);
  };
  const onPointerMove = (ev: React.PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    setDragX(ev.clientX - drag.current.startX);
  };
  const onPointerUp = () => {
    if (!drag.current) return;
    const threshold = drag.current.width / 3;
    if (dragX < -threshold) advance();
    else if (dragX > threshold) back();
    drag.current = null;
    setDragX(0);
  };

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'ArrowRight') advance();
      if (ev.key === 'ArrowLeft') back();
      if (ev.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [total]);

  return (
    <div className="fixed inset-0 z-50 bg-natural-sidebar flex flex-col">
      <header className="flex items-center justify-between px-5 py-3">
        <h2 className="text-[11px] font-mono font-bold uppercase tracking-[0.1em] text-natural-primary flex items-center gap-1.5">
          <Cherry className="h-3.5 w-3.5" /> Cherry Pick
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="text-sm font-semibold text-natural-primary hover:underline"
        >
          Ledger
        </button>
      </header>

      {total === 0 ? (
        <AllClear onClose={onClose} />
      ) : (
        <div className="flex-1 flex flex-col min-h-0 max-w-md w-full mx-auto">
          <div className="px-5 pb-3">
            <div className="flex justify-between font-mono text-[11px] text-natural-muted">
              <span>
                {page + 1} of {total}
              </span>
              <span>{handled.size} handled</span>
            </div>
            <div className="mt-2 h-[5px] rounded-full bg-natural-border overflow-hidden">
              <div
                className="h-full bg-natural-primary rounded-full transition-all"
                style={{ width: `${total === 0 ? 0 : (handled.size / total) * 100}%` }}
              />
            </div>
          </div>

          <div className="flex-1 min-h-0 px-4 pb-4 relative">
            <div
              className="h-full touch-pan-y select-none"
              style={{
                transform: `translateX(${dragX}px) rotate(${dragX / 40}deg)`,
                transition: drag.current ? 'none' : 'transform 200ms ease-out',
              }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
            >
              {current && (
                <Card
                  key={current.id}
                  expense={current}
                  activeUser={activeUser}
                  memberName={memberName}
                  cleared={handled.has(current.id) || outstanding <= ORCHARD_SETTLED_TOLERANCE}
                  outstanding={outstanding}
                  onSettle={() => onSettle(current)}
                  onSkip={() => skip(current)}
                  onOpen={() => onOpen(current)}
                  onAddComment={(text) => onAddComment(current.id, text)}
                />
              )}
            </div>
            {page > 0 && (
              <button
                type="button"
                aria-label="Previous"
                onClick={back}
                className="hidden sm:flex absolute left-[-2.5rem] top-1/2 -translate-y-1/2 p-2 rounded-full bg-white border border-natural-border shadow-sm text-natural-muted hover:text-natural-text"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
            )}
            {page < total - 1 && (
              <button
                type="button"
                aria-label="Next"
                onClick={advance}
                className="hidden sm:flex absolute right-[-2.5rem] top-1/2 -translate-y-1/2 p-2 rounded-full bg-white border border-natural-border shadow-sm text-natural-muted hover:text-natural-text"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            )}
          </div>

          {done && (
            <div className="px-5 pb-5">
              <button
                type="button"
                onClick={onClose}
                className="w-full py-2.5 text-sm font-bold text-white bg-natural-primary hover:bg-natural-primary-ink rounded-full flex items-center justify-center gap-1.5"
              >
                <Check className="h-4 w-4" /> Back to the ledger
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Meta({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <span className="inline-flex items-center gap-1 font-mono text-[9px] tracking-wider text-natural-muted uppercase">
      <span className="text-natural-primary">{icon}</span>
      {text}
    </span>
  );
}

function Card({
  expense,
  activeUser,
  memberName,
  cleared,
  outstanding,
  onSettle,
  onSkip,
  onOpen,
  onAddComment,
}: {
  expense: Expense;
  activeUser: string;
  memberName: (uid: string) => string;
  cleared: boolean;
  outstanding: number;
  onSettle: () => void;
  onSkip: () => void;
  onOpen: () => void;
  onAddComment: (text: string) => Promise<void> | void;
}) {
  const [comment, setComment] = useState('');
  const dark = isDarkCherry(expense);
  const status = getNormalizedExpenseStatus(expense);
  const comments = expense.comments || [];
  const send = async () => {
    const text = comment.trim();
    if (!text) return;
    await onAddComment(text);
    setComment('');
  };
  const pill =
    status === 'CLOSED'
      ? 'bg-natural-sidebar text-natural-muted'
      : status === 'PARTIALLY_SETTLED'
        ? 'bg-natural-primary-wash text-natural-primary'
        : 'bg-natural-primary text-white';

  return (
    <div className="h-full bg-white rounded-3xl border border-natural-border shadow-sm p-5 flex flex-col overflow-hidden">
      <div className="flex items-center justify-between">
        <span className={label}>{cleared ? 'Settled' : 'Outstanding'}</span>
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${pill}`}>
          {getExpenseStatusLabel(expense)}
        </span>
      </div>
      <h3 className="mt-3 font-display text-[22px] font-semibold tracking-tight text-natural-text line-clamp-2">
        {expense.title}
      </h3>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
        <Meta icon={<Tag className="h-3 w-3" />} text={expense.category} />
        <Meta icon={<Calendar className="h-3 w-3" />} text={shortDate(expense.date)} />
        <Meta
          icon={<Wallet className="h-3 w-3" />}
          text={`Paid by ${memberName(expense.paidBy)}`}
        />
        {expense.isRecurring && <Meta icon={<Repeat className="h-3 w-3" />} text="Recurring" />}
      </div>

      <div className="mt-4">
        <p
          className={`font-display text-4xl font-semibold tracking-tighter ${cleared ? 'text-natural-muted' : 'text-natural-primary'}`}
        >
          {money(cleared ? 0 : outstanding)}
        </p>
        <p className="text-xs text-natural-muted mt-0.5">
          {cleared
            ? 'Nothing left on this one'
            : dark
              ? 'Your chip-in closes the pot'
              : `of ${money(expense.amount)} total`}
        </p>
      </div>

      {expense.notes?.trim() && (
        <p className="mt-3 text-xs text-natural-text bg-natural-sidebar border border-natural-border rounded-2xl p-3 line-clamp-3">
          {expense.notes}
        </p>
      )}

      {!dark && Object.keys(expense.shares || {}).length > 0 && (
        <div className="mt-4">
          <span className={label}>Split</span>
          <div className="mt-2 space-y-1">
            {Object.entries(expense.shares).map(([uid, share]) => (
              <div key={uid} className="flex justify-between text-xs">
                <span className="text-natural-text">{memberName(uid)}</span>
                <span className="font-mono text-natural-muted">
                  {uid === expense.paidBy ? 'paid' : money(share)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-4 flex items-center justify-between">
        <span className={label}>Conversation</span>
        <span className="font-mono text-[10px] text-natural-muted">{comments.length}</span>
      </div>
      <div className="mt-2 flex-1 min-h-[3rem] overflow-y-auto space-y-2">
        {comments.length === 0 ? (
          <p className="text-xs text-natural-accent">No comments on this one</p>
        ) : (
          comments.map((c) => {
            const mine = c.userId === activeUser;
            return (
              <div key={c.id} className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
                <div
                  className={`max-w-[250px] px-3 py-2 text-xs text-natural-text border ${
                    mine
                      ? 'bg-natural-primary-wash border-natural-primary/20 rounded-2xl rounded-br-sm'
                      : 'bg-natural-sidebar border-natural-border rounded-2xl rounded-bl-sm'
                  }`}
                >
                  {c.text}
                </div>
                <span className="mt-0.5 font-mono text-[9px] text-natural-accent">
                  {memberName(c.userId)} · {fullDate(c.timestamp)}
                </span>
              </div>
            );
          })
        )}
      </div>
      <div className="mt-2 relative">
        <input
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') send();
          }}
          placeholder="Comment"
          aria-label="Comment"
          className="w-full pl-3 pr-9 py-2 text-[13px] bg-natural-bg border border-natural-border focus:border-natural-text rounded-xl outline-none"
        />
        <button
          type="button"
          onClick={send}
          disabled={!comment.trim()}
          aria-label="Send comment"
          className="absolute right-2 top-1/2 -translate-y-1/2 text-natural-primary disabled:text-natural-accent"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-3 space-y-2">
        {cleared ? (
          <p className="flex items-center gap-2 text-[13px] text-natural-muted">
            <span className="inline-flex p-1.5 rounded-full bg-natural-pebble text-natural-primary">
              <Check className="h-3.5 w-3.5" />
            </span>
            Swipe for the next one
          </p>
        ) : (
          <button
            type="button"
            onClick={onSettle}
            className="w-full py-2.5 text-sm font-bold text-white bg-natural-primary hover:bg-natural-primary-ink rounded-full flex items-center justify-center gap-1.5"
          >
            <Handshake className="h-4 w-4" /> {dark ? 'Chip in' : 'Settle this'}
          </button>
        )}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onOpen}
            className="flex-1 py-2 text-sm font-semibold text-natural-text bg-white border border-natural-border rounded-full hover:border-natural-primary"
          >
            Details
          </button>
          <button
            type="button"
            onClick={onSkip}
            className="flex-1 py-2 text-sm font-semibold text-natural-text bg-white border border-natural-border rounded-full hover:border-natural-primary"
          >
            Skip
          </button>
        </div>
      </div>
    </div>
  );
}

function AllClear({ onClose }: { onClose: () => void }) {
  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="text-center max-w-xs">
        <span className="inline-flex p-4 rounded-full bg-natural-pebble text-natural-primary">
          <Check className="h-6 w-6" />
        </span>
        <h3 className="mt-4 font-display text-[22px] font-semibold text-natural-text">
          The orchard is clear
        </h3>
        <p className="mt-1.5 text-[13.5px] text-natural-muted">
          Nothing is waiting on you right now.
        </p>
        <button
          type="button"
          onClick={onClose}
          className="mt-5 px-5 py-2.5 text-sm font-bold text-white bg-natural-primary hover:bg-natural-primary-ink rounded-full"
        >
          Back to the ledger
        </button>
      </div>
    </div>
  );
}
