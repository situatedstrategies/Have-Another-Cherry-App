// Dev-only harness: renders the new views with sample data and no Firebase,
// so they can be looked at and screenshotted without signing in. Served by
// Vite in dev at /dev/preview.html?view=<home|ledger|sheet|reports|grid|
// plan|export>; `vite build` only bundles index.html, so none of this ships.
import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../src/i18n';
import '../src/index.css';
import { Expense, Group } from '../src/types';
import Sidebar, { View } from '../src/components/Sidebar';
import HomeView from '../src/components/HomeView';
import LedgerView from '../src/components/LedgerView';
import ReportsView from '../src/components/ReportsView';
import PlanView from '../src/components/PlanView';
import ExportPanel from '../src/components/ExportPanel';
import MonthAheadCard from '../src/components/MonthAheadCard';
import { toLocalIso } from '../src/lib/recurring';

const A = 'olivia';
const B = 'sam';

const group: Group = {
  id: 'maple-street',
  name: 'Maple Street',
  inviteCode: 'CHERRY',
  members: [
    { uid: A, name: 'Olivia', email: '' },
    { uid: B, name: 'Sam', email: '' },
  ],
  memberIds: [A, B],
  defaultSplit: { [A]: 60, [B]: 40 },
  categories: ['Groceries', 'Utilities', 'Dining', 'Household', 'Transport', 'Internet'],
};

const now = new Date();
// A date `monthsAgo` months back on `day`, clamped to this month's day for the
// current month so nothing lands in the future.
const d = (monthsAgo: number, day: number) => {
  const dt = new Date(now.getFullYear(), now.getMonth() - monthsAgo, day);
  if (monthsAgo === 0 && dt > now) dt.setDate(now.getDate());
  return toLocalIso(dt);
};

let n = 0;
const line = (
  title: string,
  amount: number,
  date: string,
  category: string,
  o: {
    paidBy?: string;
    instrument?: string;
    settled?: boolean;
    recurring?: string;
    sourceId?: string;
    deposit?: boolean;
  } = {}
): Expense => {
  const paidBy = o.paidBy ?? A;
  const aShare = Math.round(amount * 60) / 100;
  const bShare = Math.round(amount * 100) / 100 - aShare;
  const other = paidBy === A ? B : A;
  const id = `e${++n}`;
  return {
    id,
    groupId: group.id,
    title,
    amount,
    date,
    category,
    paidBy,
    contributions: [
      { userId: paidBy, amount, instrumentType: (o.instrument ?? 'CREDIT') as 'CREDIT' },
    ],
    splitType: o.deposit ? 'deposit' : 'household_default',
    shares: o.deposit ? {} : { [A]: aShare, [B]: bShare },
    status: 'OPEN',
    createdAt: `${date}T12:00:00.000Z`,
    ...(o.recurring ? { isRecurring: true, recurringInterval: o.recurring } : {}),
    ...(o.sourceId ? { recurringSourceId: o.sourceId } : {}),
    settlements: o.settled
      ? [
          {
            id: `s-${id}`,
            expenseId: id,
            paidBy: other,
            receivedBy: paidBy,
            amount: other === A ? aShare : bShare,
            instrumentType: 'VENMO',
            timestamp: `${date}T18:00:00.000Z`,
            paymentDate: date,
            status: 'confirmed',
          },
        ]
      : [],
  } as Expense;
};

const internet = line('Internet', 65, d(2, 30), 'Internet', {
  recurring: '1_months',
  settled: true,
});

// Thirteen expenses across three months and two deposits.
const expenses: Expense[] = [
  line('Groceries', 86.4, d(0, 3), 'Groceries', { instrument: 'CREDIT' }),
  line('Electric bill', 112, d(0, 2), 'Utilities', {
    paidBy: B,
    instrument: 'DEBIT',
    sourceId: 'electric',
  }),
  line('Takeout', 42.75, d(0, 1), 'Dining', { instrument: 'CASH' }),
  line('Internet', 65, d(1, 30), 'Internet', {
    instrument: 'CREDIT',
    sourceId: internet.id,
    settled: true,
  }),
  line('Paper towels and soap', 23.1, d(1, 28), 'Household', {
    paidBy: B,
    instrument: 'CASH',
    settled: true,
  }),
  line('Train tickets', 54, d(1, 26), 'Transport', { paidBy: B, instrument: 'CREDIT' }),
  line('Groceries', 91.2, d(1, 24), 'Groceries', { instrument: 'DEBIT', settled: true }),
  line('Dinner out', 78.5, d(1, 19), 'Dining', { paidBy: B, instrument: 'CREDIT', settled: true }),
  line('Electric bill', 104.6, d(1, 2), 'Utilities', {
    paidBy: B,
    instrument: 'DEBIT',
    sourceId: 'electric',
    settled: true,
  }),
  internet,
  line('Brunch', 46, d(2, 14), 'Dining', { instrument: 'CASH', settled: true }),
  line('Groceries', 74.9, d(2, 6), 'Groceries', { instrument: 'CREDIT', settled: true }),
  line('Light bulbs', 18.4, d(2, 3), 'Household', {
    paidBy: B,
    instrument: 'DEBIT',
    settled: true,
  }),
  line('Deposit', 300, d(1, 1), 'House account', { instrument: 'TRANSFER', deposit: true }),
  line('Deposit', 200, d(1, 2), 'House account', {
    paidBy: B,
    instrument: 'TRANSFER',
    deposit: true,
  }),
];

const members = group.members;
const noop = () => {};
const params = new URLSearchParams(window.location.search);
const which = params.get('view') || 'home';
const plus = params.get('plus') !== '0';

function Preview() {
  const initialSheet = which === 'sheet';
  if (initialSheet) {
    try {
      localStorage.setItem('ledger_mode', 'sheet');
    } catch {
      /* ignore */
    }
  } else if (which === 'ledger') {
    try {
      localStorage.setItem('ledger_mode', 'cards');
    } catch {
      /* ignore */
    }
  }
  const [view, setView] = useState<View>(
    which === 'ledger' || which === 'sheet'
      ? 'ledger'
      : which === 'reports' || which === 'grid'
        ? 'reports'
        : which === 'plan' || which === 'house'
          ? 'plan'
          : 'home'
  );
  const [menu, setMenu] = useState(false);

  return (
    <div
      className="min-h-screen bg-natural-bg text-natural-text font-sans antialiased"
      id="app-root"
    >
      <div className="flex flex-col md:flex-row md:items-stretch min-h-screen">
        <Sidebar
          view={view}
          onNavigate={(v) => v !== 'vault' && setView(v)}
          onSettings={noop}
          groupName="Maple Street"
          groupDetail="60 / 40 with Sam"
          groups={[{ id: group.id, name: 'Maple Street', active: true }]}
          showGroupMenu={menu}
          setShowGroupMenu={setMenu}
          onSwitchGroup={noop}
          onAddGroup={noop}
          vaultLocked={!plus}
        />
        <main className="flex-1 min-w-0 px-4 sm:px-[max(16px,3vw)] pt-6 md:pt-7 pb-12 flex flex-col gap-5">
          {which === 'export' ? (
            <div className="max-w-sm">
              <ExportPanel
                expenses={expenses}
                activeUser={A}
                nameOf={(u) => (u === A ? 'You' : 'Sam')}
                currentPeriod={{ start: d(2, 1).slice(0, 7) + '-01', end: d(0, 1) }}
                currentPeriodLabel="Sep to Nov"
                groupName="Maple Street"
              />
            </div>
          ) : view === 'home' ? (
            <HomeView
              expenses={expenses}
              activeUser={A}
              members={members}
              userName="Olivia"
              onLogExpense={noop}
              onScanReceipt={noop}
              onOpenExpense={noop}
              onSettle={noop}
              onOpenLedger={() => setView('ledger')}
              onOpenReports={() => setView('reports')}
              aside={
                <MonthAheadCard
                  expenses={expenses.filter((e) => e.splitType !== 'deposit')}
                  activeUser={A}
                  locked={!plus}
                  onUnlock={noop}
                />
              }
            />
          ) : view === 'ledger' ? (
            <LedgerView
              expenses={expenses}
              group={group}
              activeUser={A}
              members={members}
              onOpenExpense={noop}
              onEditAmount={noop}
              onLogExpense={noop}
              onExport={noop}
              onCherryPick={noop}
              onOpenGrid={() => setView('reports')}
              onOpenHouseAccount={() => setView('plan')}
            />
          ) : view === 'reports' ? (
            <ReportsView
              expenses={expenses}
              group={group}
              activeUser={A}
              members={members}
              locked={!plus}
              onUnlock={noop}
              onOpenExpense={noop}
              onOpenLedger={() => setView('ledger')}
              initialTab={which === 'grid' ? 'grid' : 'charts'}
            />
          ) : (
            <PlanView
              expenses={expenses}
              group={group}
              activeUser={A}
              members={members}
              onPlanPurchase={noop}
              onLogDeposit={noop}
            />
          )}
        </main>
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Preview />
  </StrictMode>
);
