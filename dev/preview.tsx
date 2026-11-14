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
import ExpenseForm from '../src/components/ExpenseForm';
import CherryPlusModal from '../src/components/CherryPlusModal';
import SettleUpModal from '../src/components/SettleUpModal';
import { toLocalIso, todayLocal } from '../src/lib/recurring';
import { Budget, Goal, PlanPayload, PlanScope, monthOf, planStatuses } from '../src/lib/plan';
import RuleNudge from '../src/components/RuleNudge';
import MonthCloseCard from '../src/components/MonthCloseCard';
import { closedMonthFor, monthCloseSummary } from '../src/lib/monthClose';
import { t } from '../src/i18n';

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
    goal?: string;
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
    splitType: o.deposit ? 'deposit' : o.goal ? 'goal' : 'household_default',
    shares: o.deposit ? {} : o.goal ? { [paidBy]: amount } : { [A]: aShare, [B]: bShare },
    ...(o.goal ? { goalId: o.goal } : {}),
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
  // Goal contributions: in the ledger, never spending.
  line('Couch fund', 120, d(3, 20), 'Couch fund', { instrument: 'TRANSFER', goal: 'couch' }),
  line('Couch fund', 100, d(2, 20), 'Couch fund', {
    paidBy: B,
    instrument: 'TRANSFER',
    goal: 'couch',
  }),
  line('Couch fund', 120, d(1, 20), 'Couch fund', { instrument: 'TRANSFER', goal: 'couch' }),
  line('Couch fund', 300, d(0, 2), 'Couch fund', {
    paidBy: B,
    instrument: 'TRANSFER',
    goal: 'couch',
  }),
  line('Deposit buffer', 2000, d(4, 1), 'Deposit buffer', {
    instrument: 'TRANSFER',
    goal: 'buffer',
  }),
];

const thisMonth = monthOf(todayLocal());
const startMonth = d(2, 1).slice(0, 7);
const budget = (id: string, category: string, limit: number, o: Partial<Budget> = {}): Budget => ({
  id,
  category,
  limit,
  group: 'flexible',
  rollover: false,
  alerts: true,
  startMonth,
  scope: 'household',
  ...o,
});
const householdPlan: PlanPayload = {
  budgets: [
    budget('groceries', 'Groceries', 320),
    budget('dining', 'Dining', 60),
    budget('household', 'Household', 40, { rollover: true }),
    budget('utilities', 'Utilities', 240, { group: 'fixed', alerts: false }),
    budget('transport', 'Transport', 200, { group: 'fixed', alerts: false }),
    budget('insurance', 'Insurance', 90, { group: 'nonMonthly', rollover: true }),
  ],
  goals: [
    {
      id: 'couch',
      name: 'Couch fund',
      target: 1200,
      dueDate: `${thisMonth.slice(0, 4)}-12-01`,
      scope: 'household',
      createdAt: `${d(3, 1)}T12:00:00.000Z`,
    },
    {
      id: 'buffer',
      name: 'Deposit buffer',
      target: 2000,
      scope: 'household',
      createdAt: `${d(4, 1)}T12:00:00.000Z`,
    },
    {
      id: 'trip',
      name: 'Spring trip',
      target: 600,
      scope: 'household',
      createdAt: `${d(5, 1)}T12:00:00.000Z`,
      doneAt: `${d(1, 1)}T12:00:00.000Z`,
    },
  ],
  rules: [
    {
      id: 'r1',
      contains: 'trader joe',
      category: 'Groceries',
      createdAt: `${d(1, 3)}T12:00:00.000Z`,
    },
    { id: 'r2', contains: 'con ed', category: 'Utilities', createdAt: `${d(1, 9)}T12:00:00.000Z` },
    {
      id: 'r3',
      contains: 'corner shop',
      category: 'Dining',
      createdAt: `${d(0, 2)}T12:00:00.000Z`,
    },
  ],
};
const personalPlan: PlanPayload = {
  budgets: [
    budget('p-groceries', 'Groceries', 180, { scope: 'personal' }),
    budget('p-dining', 'Dining', 50, { scope: 'personal', rollover: true }),
  ],
  goals: [
    {
      id: 'bike',
      name: 'Bike',
      target: 500,
      dueDate: `${Number(thisMonth.slice(0, 4)) + 1}-06-01`,
      scope: 'personal',
      createdAt: `${d(0, 1)}T12:00:00.000Z`,
    },
  ],
  rules: [],
};

const members = group.members;
const noop = () => {};
const params = new URLSearchParams(window.location.search);
const which = params.get('view') || 'home';
const plus = params.get('plus') !== '0';
const goalForm = params.get('goal') === '1';
// The moment after a save: the form has closed and the rule nudge is up.
const ruleNudge = params.get('rule') === '1';
const rulesOpen = params.get('rules') === '1';
// The "make it recurring" card on Home, for the top candidate.
const candidate = params.get('candidate') === '1';
// The month close card at the top of Home (last month).
const close = params.get('close') === '1';
// "All my groups": a second household (Olivia and Riley, 50/50) as a preset ledger.
const scopeAll = params.get('scope') === 'all';
const R = 'riley';
const otherGroupId = 'river-road';
const otherLine = (
  title: string,
  amount: number,
  date: string,
  category: string,
  paidBy = R
): Expense => ({
  id: `o${++n}`,
  groupId: otherGroupId,
  title,
  amount,
  date,
  category,
  paidBy,
  contributions: [{ userId: paidBy, amount, instrumentType: 'CREDIT' }],
  splitType: 'household_default',
  shares: {
    [A]: Math.round(amount * 50) / 100,
    [R]: Math.round(amount * 100) / 100 - Math.round(amount * 50) / 100,
  },
  status: 'OPEN',
  createdAt: `${date}T12:00:00.000Z`,
});
const otherExpenses: Expense[] = [
  otherLine('Rent', 1800, d(0, 1), 'Rent'),
  otherLine('Rent', 1800, d(1, 1), 'Rent'),
  otherLine('Rent', 1800, d(2, 1), 'Rent'),
  otherLine('Groceries', 64.2, d(0, 4), 'Groceries', A),
  otherLine('Groceries', 71, d(1, 12), 'Groceries'),
  otherLine('Water bill', 38, d(1, 6), 'Utilities'),
  otherLine('Takeout', 29.5, d(0, 2), 'Dining', A),
];
const presetOthers = scopeAll
  ? {
      ledgers: { [otherGroupId]: otherExpenses },
      names: { [R]: 'Riley' },
      memberIds: { [otherGroupId]: [A, R] },
      loading: false,
    }
  : undefined;
if (scopeAll) {
  try {
    localStorage.setItem(
      `reports_filters_${group.id}`,
      JSON.stringify({ view: 'all', period: '3m' })
    );
    localStorage.setItem(`plan_view_${group.id}`, 'all');
  } catch {
    /* ignore */
  }
}

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
  const [plans, setPlans] = useState({ household: householdPlan, personal: personalPlan });
  const [showPlus, setShowPlus] = useState(which === 'plan' && !plus);
  const savePlan = async (scope: PlanScope, change: (current: PlanPayload) => PlanPayload) => {
    setPlans((p) => ({ ...p, [scope]: change(p[scope]) }));
    return true;
  };
  const budgetStatuses = plus
    ? planStatuses(expenses, householdPlan.budgets, thisMonth, 'household', A)
    : null;
  const goal: Goal = householdPlan.goals[0];

  return (
    <div
      className="min-h-screen bg-natural-bg text-natural-text font-sans antialiased"
      id="app-root"
    >
      <div className="flex flex-col md:flex-row md:items-stretch min-h-screen">
        <Sidebar
          view={view}
          onNavigate={(v) => {
            if (v === 'vault') return;
            if ((v === 'reports' || v === 'plan') && !plus) {
              setShowPlus(true);
              return;
            }
            setView(v);
          }}
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
              budgets={budgetStatuses}
              onOpenPlan={() => setView('plan')}
              monthClose={
                close && (
                  <MonthCloseCard
                    summary={monthCloseSummary(
                      expenses,
                      householdPlan.budgets,
                      householdPlan.goals,
                      closedMonthFor(todayLocal()),
                      'household',
                      A
                    )}
                    showBudgets={plus}
                    onSettle={noop}
                    onReport={() => setView('reports')}
                    onDismiss={noop}
                  />
                )
              }
              candidate={
                candidate
                  ? {
                      title: 'Groceries',
                      interval: '1_months',
                      anchorDay: 3,
                      latestId: expenses[0].id,
                      count: 3,
                      medianAmount: 86.4,
                    }
                  : null
              }
              onMakeRecurring={noop}
              onDismissCandidate={noop}
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
              otherGroupIds={scopeAll ? [otherGroupId] : []}
              presetOtherLedgers={presetOthers}
            />
          ) : (
            <PlanView
              expenses={expenses}
              group={group}
              activeUser={A}
              members={members}
              locked={!plus}
              onUnlock={() => setShowPlus(true)}
              household={plans.household}
              personal={plans.personal}
              onSave={savePlan}
              onContribute={noop}
              onPlanPurchase={noop}
              onLogDeposit={noop}
              initialRulesOpen={rulesOpen}
              otherGroupIds={scopeAll ? [otherGroupId] : []}
              presetOtherLedgers={presetOthers}
            />
          )}
        </main>
      </div>
      {which === 'log' && ruleNudge && (
        <RuleNudge
          suggestion={{ contains: 'corner shop', category: 'Dining' }}
          title="Corner shop"
          onYes={noop}
          onNotNow={noop}
        />
      )}
      {which === 'log' && !ruleNudge && (
        <ExpenseForm
          group={group}
          activeUser={A}
          onClose={noop}
          onSubmit={noop}
          mode={goalForm ? 'goal' : 'expense'}
          goal={goalForm ? { id: goal.id, name: goal.name } : null}
          budgets={plus ? [...householdPlan.budgets, ...personalPlan.budgets] : undefined}
          expenses={expenses}
          rules={plans.household.rules}
          isPlus={plus}
          prefill={
            goalForm
              ? null
              : { title: 'Groceries', amount: 86.4, paidBy: A, splitType: 'household_default' }
          }
        />
      )}
      {which === 'settle' && (
        <SettleUpModal
          expense={expenses[1]}
          group={group}
          activeUser={A}
          paymentHandlesByUid={{ [B]: { venmo: 'sam-maple' } }}
          onClose={noop}
          onSubmit={noop}
        />
      )}
      {showPlus && (
        <CherryPlusModal
          onClose={() => setShowPlus(false)}
          intro={{
            title: t(which === 'reports' ? 'nav.reports' : 'nav.plan'),
            pitch: t(which === 'reports' ? 'plus.pitchReports' : 'plus.pitchPlan'),
          }}
        />
      )}
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Preview />
  </StrictMode>
);
