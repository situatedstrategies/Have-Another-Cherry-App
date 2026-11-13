import { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import { useTranslation, Trans } from 'react-i18next';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { formatCurrency } from './lib/format';
import { db, authHeader } from './firebase';
import { getFullMembers, joinedUids, nameOf as rosterName } from './lib/members';
import { isDarkCherry, isDeposit, getNormalizedExpenseStatus, roundCurrency } from './lib/money';
import { hasPlus } from './lib/entitlements';
import { useReminderPublisher } from './hooks/useReminderPublisher';
import { computeIncomeDiscrepancy } from './lib/incomeDiscrepancy';
import { SupportError } from './lib/errors';
import { Expense, Group } from './types';
import { useGroupMembership } from './hooks/useGroupMembership';
import { useAuthSession } from './hooks/useAuthSession';
import { useProfileSettings } from './hooks/useProfileSettings';
import { useLedgerSync } from './hooks/useLedgerSync';
import { useNotifications } from './hooks/useNotifications';
import { useExpenseMutations } from './hooks/useExpenseMutations';
import { useSettlements } from './hooks/useSettlements';
import ErrorSupportModal from './components/ErrorSupportModal';
import ModuleBoundary from './components/ModuleBoundary';
import LoadingScreen from './components/LoadingScreen';
import BudgetPaymentsSettings from './components/BudgetPaymentsSettings';
import ExpenseForm from './components/ExpenseForm';
import Sidebar, { View } from './components/Sidebar';
import HomeView from './components/HomeView';
import LedgerView from './components/LedgerView';
import ReportsView from './components/ReportsView';
import PlanView from './components/PlanView';
import { usePlan } from './hooks/usePlan';
import { todayLocal } from './lib/recurring';
import { Goal, planStatuses, monthOf, goalFunded, goalProjection } from './lib/plan';
import { budgetAlerts, goalAlerts } from './lib/alerts';
import { RuleSuggestion, ruleFrom, suggestRule } from './lib/rules';
import { isGoalContribution } from './lib/money';
import RuleNudge from './components/RuleNudge';
import { detectRecurringCandidates, makeRecurring } from './lib/recurringDetect';
import { closedMonthFor, monthCloseSummary, shouldShowMonthClose } from './lib/monthClose';
import MonthCloseCard from './components/MonthCloseCard';
import type { PeriodKey } from './lib/reports';
import ExportPanel from './components/ExportPanel';
import Modal from './components/Modal';
import ExpenseDetail from './components/ExpenseDetail';
import SettleUpModal from './components/SettleUpModal';
import AuthScreen from './components/AuthScreen';
import ProfileSetup from './components/ProfileSetup';
import BackupModal from './components/BackupModal';
import GroupSetup from './components/GroupSetup';
import LegalModal, { LegalDoc } from './components/LegalModal';
import SettingsModal from './components/SettingsModal';
import PrivacyModal from './components/PrivacyModal';
import FinancialAlignmentModal from './components/FinancialAlignmentModal';
import PlanPurchase, { PlanPrefill } from './components/PlanPurchase';
import HouseholdVault from './components/HouseholdVault';
import RhythmCard from './components/RhythmCard';
import InsightsSection from './components/InsightsSection';
import MonthAheadCard from './components/MonthAheadCard';
import CarryingCard from './components/CarryingCard';
import OrchardMode from './components/OrchardMode';
import CherryPlusModal from './components/CherryPlusModal';
import OwedBreakdownModal from './components/OwedBreakdownModal';
import { ToastContainer, ToastMessage } from './components/Toast';

// The chart pulls in recharts (about 240 KB gzipped), which only the signed-in
// dashboard uses, so it loads after sign-in instead of before the sign-in form.
const MonthlyComparisonChart = lazy(() => import('./components/MonthlyComparisonChart'));
import { Sparkles, X, AlertCircle } from 'lucide-react';

export default function App() {
  const { t } = useTranslation();
  const [currentUser, setCurrentUser] = useState<any>(null);
  const activeUser = currentUser?.uid;
  const [userProfile, setUserProfile] = useState<any>(null);
  const [group, setGroup] = useState<Group | null>(null);
  const [groupUsers, setGroupUsers] = useState<Record<string, any>>({});

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [showForm, setShowForm] = useState(false);
  // 'deposit' opens the form as "Log a deposit" (house account).
  const [formMode, setFormMode] = useState<'expense' | 'deposit' | 'goal'>('expense');
  // The goal being funded when the form opens in 'goal' mode.
  const [formGoal, setFormGoal] = useState<Goal | null>(null);
  // The tab that opened the Cherry + page (Reports, Plan): its name and pitch.
  const [plusIntro, setPlusIntro] = useState<{ title: string; pitch: string } | null>(null);
  const [view, setView] = useState<View>('home');
  // Set when the ledger's "By category and month" chip sends us to the grid.
  const [reportsTab, setReportsTab] = useState<'charts' | 'grid' | undefined>(undefined);
  // Set when the month close card sends us to last month's report.
  const [reportsPeriod, setReportsPeriod] = useState<PeriodKey | undefined>(undefined);
  // The last month this device showed the month close card for (lib/monthClose).
  const [monthCloseShown, setMonthCloseShown] = useState<string | null>(() => {
    try {
      return localStorage.getItem('month_close_shown');
    } catch {
      return null;
    }
  });
  const dismissMonthClose = (month: string) => {
    setMonthCloseShown(month);
    try {
      localStorage.setItem('month_close_shown', month);
    } catch {
      /* per-device convenience only */
    }
  };
  const [showExport, setShowExport] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showBackup, setShowBackup] = useState(false);
  const [showGroupMenu, setShowGroupMenu] = useState(false);
  const [showAddGroup, setShowAddGroup] = useState(false);
  const [groupSecret, setGroupSecret] = useState('');
  useEffect(() => {
    if (activeUser) {
      setGroupSecret(localStorage.getItem(`group_secret_${activeUser}`) || '');
    }
  }, [activeUser]);
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const [showAlignmentModal, setShowAlignmentModal] = useState(false);
  const [showPlanPurchase, setShowPlanPurchase] = useState(false);
  const [showOrchard, setShowOrchard] = useState(false);
  const [planPrefill, setPlanPrefill] = useState<PlanPrefill | null>(null);
  const [showVault, setShowVault] = useState(false);
  const [showCherryPlus, setShowCherryPlus] = useState(false);
  // The one error dialog, set from any failure point.
  const [supportError, setSupportError] = useState<SupportError | null>(null);
  const [owedModal, setOwedModal] = useState<null | 'you_owe' | 'owed_to_you'>(null);
  // Titles the person said "Not this one" to on the recurring card, per device.
  const [dismissedRecurring, setDismissedRecurring] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem('recurring_dismissed');
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : [];
    } catch {
      return [];
    }
  });
  const dismissRecurring = (title: string) => {
    const next = [...dismissedRecurring, title];
    setDismissedRecurring(next);
    try {
      localStorage.setItem('recurring_dismissed', JSON.stringify(next));
    } catch {
      /* per-device convenience only */
    }
  };
  // "Always use <Category> for '<title>'?" after a save (lib/rules).
  const [ruleNudge, setRuleNudge] = useState<{ title: string; suggestion: RuleSuggestion } | null>(
    null
  );
  const [dismissedWaiting, setDismissedWaiting] = useState(false);
  // Which split change (by its timestamp) this device has acknowledged. In
  // localStorage so the banner doesn't come back on every reload, but a NEW
  // change (different `at`) shows again.
  const [dismissedSplitChangeAt, setDismissedSplitChangeAt] = useState<string | null>(null);
  const dismissSplitChange = (at: string) => {
    setDismissedSplitChangeAt(at);
    try {
      if (group) localStorage.setItem(`split_change_seen_${group.id}`, at);
    } catch {
      /* per-device convenience only */
    }
  };
  useEffect(() => {
    if (!group?.id) return;
    try {
      setDismissedSplitChangeAt(localStorage.getItem(`split_change_seen_${group.id}`));
    } catch {
      setDismissedSplitChangeAt(null);
    }
  }, [group?.id]);
  const [legalDoc, setLegalDoc] = useState<LegalDoc | null>(null);
  const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [showSettleModal, setShowSettleModal] = useState(false);

  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  // Stable identities so Toast's auto-dismiss timer is not reset on every render.
  const addToast = useCallback(
    (title: string, message: string, type: 'info' | 'success' | 'error' = 'info') => {
      setToasts((prev) => [
        ...prev,
        { id: Date.now().toString() + Math.random().toString(), title, message, type },
      ]);
    },
    []
  );

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const {
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
    handleSaveDefaultSplit,
    handleResendInvite,
  } = useGroupMembership({
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
  });

  // RevenueCat's live answer for this user, read at sign-in (useAuthSession)
  // and set after a purchase. ORed with the profile flag below so a paid
  // customer is unlocked even before users/{uid}.isPlus catches up.
  const [rcPlus, setRcPlus] = useState(false);
  // Bill reminders: publish the minimal due-date index the daily push job
  // reads, so a web-only household gets "due tomorrow" too.
  useReminderPublisher({
    uid: activeUser || null,
    groupId: group?.id || null,
    expenses,
    isPlus: hasPlus(userProfile) || rcPlus,
  });
  // Budgets and goals: the household's plan on the group, the member's own
  // under their profile. Cherry + only, so nothing is read for free members.
  const plan = usePlan(group, activeUser, hasPlus(userProfile) || rcPlus);

  const { handleSignOut, handleDeleteAccount } = useAuthSession({
    activeUser,
    setCurrentUser,
    setIsLoading,
    groupIds,
    group,
    removeSelfFromGroupById,
    setUserProfile,
    setGroup,
    setGroupUsers,
    setExpenses,
    setShowSettings,
    setShowPrivacyModal,
    setRcPlus,
  });

  const {
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
    handleSaveIncome,
    handleSaveMarketingOptIn,
    handleSaveThreshold,
    handleSavePaymentHandles,
    handleRetakeQuiz,
  } = useProfileSettings({
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
  });

  useLedgerSync({ activeUser, group, memberIdsKey, expenses, setExpenses, addToast });

  const { broadcastToMembers, notifyLedgerEvent, handleGentleRemind } = useNotifications({
    currentUser,
    activeUser,
    group,
    addToast,
  });

  const {
    handleAddComment,
    handleAddOrEditExpense,
    handleClaimExpense,
    handleDeleteExpense,
    syncExpenseUpdate,
  } = useExpenseMutations({
    activeUser,
    group,
    expenses,
    setExpenses,
    editingExpense,
    setEditingExpense,
    setShowForm,
    setSelectedExpense,
    broadcastToMembers,
    notifyLedgerEvent,
    addToast,
    setSupportError,
    onExpenseSaved: (saved, before) => {
      // Rules are part of Plan (Cherry +); deposits and goal contributions
      // have no category of their own to learn from.
      if (!(hasPlus(userProfile) || rcPlus)) return;
      if (isDeposit(saved)) return;
      if (!isGoalContribution(saved)) {
        const s = suggestRule(saved.title, saved.category, before, plan.household.rules);
        setRuleNudge(s ? { title: saved.title, suggestion: s } : null);
      }
      // Household budget and goal crossings go to the other members as
      // contentless pushes (lib/alerts); personal ones stay on this screen.
      const after = [saved, ...before];
      const today = todayLocal();
      const month = monthOf(today);
      const hb = plan.household.budgets;
      for (const a of budgetAlerts(
        planStatuses(before, hb, month, 'household', activeUser),
        planStatuses(after, hb, month, 'household', activeUser)
      )) {
        notifyLedgerEvent(a.kind, a.budgetId);
      }
      for (const g of plan.household.goals) {
        if (g.doneAt) continue;
        for (const a of goalAlerts(
          goalFunded(before, g, 'household', activeUser),
          goalFunded(after, g, 'household', activeUser),
          g,
          goalProjection(before, g, today),
          goalProjection(after, g, today)
        )) {
          notifyLedgerEvent(a.kind, a.goalId);
        }
      }
    },
  });

  const { handleSettleUpProposal, handleConfirmSettleReceipt, handleVoidSettlement } =
    useSettlements({
      activeUser,
      group,
      expenses,
      selectedExpense,
      setShowSettleModal,
      syncExpenseUpdate,
      notifyLedgerEvent,
      addToast,
      setSupportError,
    });

  // Keep the selected expense current as background data changes.
  useEffect(() => {
    if (selectedExpense) {
      const updated = expenses.find((e) => e.id === selectedExpense.id);
      if (updated) {
        setSelectedExpense(updated);
      }
    }
  }, [expenses]);

  if (!currentUser) {
    return <AuthScreen />;
  }

  if (isLoading) {
    return <LoadingScreen label={t('common.loadingLedger')} />;
  }

  if (userProfile && !userProfile.financialProfile) {
    return (
      <div className="animate-in fade-in duration-300">
        <ProfileSetup
          userId={activeUser}
          onComplete={() => {
            getDoc(doc(db, 'users', activeUser))
              .then((userDoc) => {
                if (userDoc.exists()) setUserProfile(userDoc.data() as any);
              })
              .catch((e) => console.error('Failed to reload profile', e));
          }}
        />
      </div>
    );
  }

  if (!activeGroupId) {
    return (
      <div className="animate-in fade-in duration-300">
        <GroupSetup onComplete={applyJoinedGroup} />
      </div>
    );
  }

  // Group data not here yet: a loading screen, never the create/join screen.
  if (!group) {
    return <LoadingScreen label={t('common.loadingGroup')} />;
  }

  // Members who have not finished their quiz. Non-blocking: a dismissible banner.
  const missingProfiles = (group.memberIds || []).filter(
    (id) => id !== activeUser && groupUsers[id] && !groupUsers[id]?.financialProfile
  );

  // Dark Cherry amounts are hidden from everyone but their creator, so a
  // group total that included one would let members back the number out.
  // House account deposits are not spending, so no statistic counts them.
  const statsVisibleExpenses = expenses.filter(
    (e) => !isDeposit(e) && (!isDarkCherry(e) || e.paidBy === activeUser)
  );
  const spendingExpenses = expenses.filter((e) => !isDeposit(e));
  const members = getFullMembers(group);

  // The sheet's in-place amount edit: the total changes and every share
  // scales with it, the way a rounded amount is scaled on save.
  const handleEditAmount = (target: Expense, amount: number) => {
    const latest = expenses.find((e) => e.id === target.id) || target;
    if (latest.amount <= 0 || amount <= 0) return;
    const scale = amount / latest.amount;
    const scaled = (v: number) => roundCurrency(v * scale);
    const next: Expense = {
      ...latest,
      amount,
      shares: Object.fromEntries(
        Object.entries(latest.shares || {}).map(([uid, v]) => [uid, scaled(Number(v))])
      ),
      ...(latest.thirdPersonShare != null
        ? { thirdPersonShare: scaled(Number(latest.thirdPersonShare)) }
        : {}),
      ...(latest.extraParticipants
        ? {
            extraParticipants: latest.extraParticipants.map((g) => ({
              ...g,
              share: scaled(g.share),
            })),
          }
        : {}),
      contributions: (latest.contributions || []).map((c) =>
        c.userId === latest.paidBy ? { ...c, amount } : c
      ),
      editedAt: new Date().toISOString(),
    };
    next.status = getNormalizedExpenseStatus(next);
    syncExpenseUpdate(next).catch((e) => console.error('Amount edit failed', e));
  };

  const openForm = (mode: 'expense' | 'deposit' | 'goal' = 'expense', goal?: Goal) => {
    setEditingExpense(null);
    setFormMode(mode);
    setFormGoal(mode === 'goal' ? goal || null : null);
    setShowForm(true);
  };

  // Reports and Plan are Cherry + tabs: for a free member the sidebar opens
  // the paywall straight away, headed with the tab's name, and the view does
  // not change, so closing it lands back where they were.
  const openPlusFor = (tab: 'reports' | 'plan') => {
    setPlusIntro({
      title: t(tab === 'reports' ? 'nav.reports' : 'nav.plan'),
      pitch: t(tab === 'reports' ? 'plus.pitchReports' : 'plus.pitchPlan'),
    });
    setShowCherryPlus(true);
  };

  // "60 / 40 with Sam": the standing split, the viewer first.
  const splitLine = (() => {
    const ids = joinedUids(group);
    const ordered = [activeUser, ...ids.filter((id) => id !== activeUser)].filter((id) =>
      ids.includes(id)
    );
    const split = ordered
      .map((id) => Math.round(Number(group.defaultSplit?.[id]) || 0))
      .join(' / ');
    const others = ordered.filter((id) => id !== activeUser).map((id) => rosterName(id, members));
    if (others.length === 0) return t('nav.justYou');
    return t('nav.splitWith', { split, names: others.join(`, `) });
  })();

  // Gates vault, thresholds, rhythm, insights and Dark Cherry creation.
  const isPlus = hasPlus(userProfile) || rcPlus;
  // The dashboard's budget tile and nudges read the household plan when it
  // has budgets, else the member's own.
  const budgetStatuses = (() => {
    const useHousehold = plan.household.budgets.length > 0;
    const budgets = useHousehold ? plan.household.budgets : plan.personal.budgets;
    return planStatuses(
      expenses,
      budgets,
      monthOf(todayLocal()),
      useHousehold ? 'household' : 'personal',
      activeUser
    );
  })();

  // The month close card: last month, once per device, when it had anything in it.
  const monthClose = (() => {
    const today = todayLocal();
    if (!shouldShowMonthClose(today, monthCloseShown)) return null;
    const month = closedMonthFor(today);
    const useHousehold = plan.household.budgets.length > 0;
    const summary = monthCloseSummary(
      expenses,
      isPlus ? (useHousehold ? plan.household.budgets : plan.personal.budgets) : [],
      isPlus ? plan.household.goals : [],
      month,
      useHousehold ? 'household' : 'personal',
      activeUser
    );
    if (summary.total <= 0 && summary.openCount === 0) return null;
    return summary;
  })();

  // The one "make it recurring" card on Home: the best candidate not dismissed.
  const recurringCandidate =
    detectRecurringCandidates(expenses, todayLocal(), dismissedRecurring)[0] ?? null;

  // Each member's spending limit, and this user's shares that exceed their own.
  const memberThresholds: Record<string, number> = {};
  Object.entries(groupUsers).forEach(([uid, u]: any) => {
    memberThresholds[uid] = Number(u?.recurringThreshold) || 0;
  });
  const myThreshold = Number(userProfile?.recurringThreshold) || 0;
  const overThresholdExpenses =
    myThreshold > 0
      ? expenses.filter(
          (e) =>
            e.paidBy !== activeUser &&
            (e.shares?.[activeUser] || 0) > myThreshold &&
            !isDarkCherry(e)
        )
      : [];

  const { hasIncomeDiscrepancy, incomeDiscrepancyPct } = computeIncomeDiscrepancy(groupUsers);

  // Payments waiting for this user to confirm receipt.
  const pendingToConfirm = expenses.filter((e) =>
    (e.settlements || []).some((s) => s.status === 'pending' && s.receivedBy === activeUser)
  );
  const pendingConfirmCount = pendingToConfirm.reduce(
    (n, e) =>
      n +
      (e.settlements || []).filter((s) => s.status === 'pending' && s.receivedBy === activeUser)
        .length,
    0
  );

  const unlock = () => setShowCherryPlus(true);
  const plusExtras = (
    <div className="flex flex-col gap-5 pt-2" id="reports-more">
      {isPlus && (
        <ModuleBoundary label={t('app.monthlyTrends')}>
          <Suspense fallback={null}>
            <MonthlyComparisonChart expenses={statsVisibleExpenses} members={members} />
          </Suspense>
        </ModuleBoundary>
      )}
      <div className="grid gap-5 lg:grid-cols-2 items-start">
        {isPlus ? (
          <>
            <ModuleBoundary label={t('app.insights')}>
              <InsightsSection
                expenses={statsVisibleExpenses}
                members={members}
                activeUser={activeUser}
              />
            </ModuleBoundary>
            <div className="flex flex-col gap-5">
              <ModuleBoundary label={t('app.whosCarrying')}>
                <CarryingCard
                  expenses={statsVisibleExpenses}
                  members={members}
                  activeUser={activeUser}
                />
              </ModuleBoundary>
              <ModuleBoundary label={t('app.rhythm')}>
                <RhythmCard expenses={spendingExpenses} locked={false} onUnlock={unlock} />
              </ModuleBoundary>
            </div>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={unlock}
              className="w-full text-left bg-white border border-natural-border rounded-3xl p-5 shadow-sm hover:border-natural-primary/40 transition-colors"
            >
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-widest text-natural-muted">
                  {t('app.insights')}
                </span>
                <span className="text-[10px] font-bold tracking-wider text-white bg-natural-dark px-1 py-0.5 rounded">
                  Cherry +
                </span>
              </div>
              <p className="mt-2 font-display text-lg font-semibold text-natural-text">
                {t('app.insightsTeaserTitle')}
              </p>
              <p className="mt-1 text-sm text-natural-muted">{t('app.insightsTeaserBody')}</p>
              <span className="mt-3 inline-block text-sm font-semibold text-natural-primary">
                {t('app.seeCherryPlus')}
              </span>
            </button>
            <ModuleBoundary label={t('app.rhythm')}>
              <RhythmCard expenses={spendingExpenses} locked onUnlock={unlock} />
            </ModuleBoundary>
          </>
        )}
      </div>
    </div>
  );

  return (
    <div
      className="min-h-screen bg-natural-bg text-natural-text font-sans antialiased animate-in fade-in duration-300"
      id="app-root"
    >
      <ToastContainer toasts={toasts} removeToast={removeToast} />

      <div className="flex flex-col md:flex-row md:items-stretch min-h-screen">
        <Sidebar
          view={view}
          onNavigate={(v) => {
            if (v === 'vault') {
              if (isPlus) setShowVault(true);
              else setShowCherryPlus(true);
              return;
            }
            if ((v === 'reports' || v === 'plan') && !isPlus) {
              openPlusFor(v);
              return;
            }
            if (v !== 'reports') {
              setReportsTab(undefined);
              setReportsPeriod(undefined);
            }
            setView(v);
          }}
          onSettings={() => setShowSettings(true)}
          groupName={group.name || t('app.unnamedGroup')}
          groupDetail={splitLine}
          groups={groupIds.map((gid) => ({
            id: gid,
            name:
              gid === group.id
                ? group.name || t('app.unnamedGroup')
                : groupSummaries[gid]?.name || t('app.unnamedGroup'),
            active: gid === activeGroupId,
          }))}
          showGroupMenu={showGroupMenu}
          setShowGroupMenu={setShowGroupMenu}
          onSwitchGroup={handleSwitchGroup}
          onAddGroup={() => setShowAddGroup(true)}
          vaultLocked={!isPlus}
        />

        <main
          className="flex-1 min-w-0 px-4 sm:px-[max(16px,3vw)] pt-6 md:pt-7 pb-12 flex flex-col gap-5"
          id="main-content"
        >
          {hasIncomeDiscrepancy && (
            <div className="mb-6 bg-natural-sidebar border-l-4 border-natural-primary p-4 rounded-r-xl shadow-sm animate-in fade-in slide-in-from-top-2">
              <div className="flex gap-3 items-start">
                <Sparkles className="h-5 w-5 text-natural-primary shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-sm font-bold text-natural-text">{t('app.alignmentTitle')}</h3>
                  <p className="text-sm text-natural-muted mt-1">{t('app.alignmentBody')}</p>
                  <button
                    onClick={() => setShowAlignmentModal(true)}
                    className="mt-2 text-xs font-medium text-natural-primary cursor-pointer hover:underline"
                  >
                    {t('app.reviewProfiles')}
                  </button>
                </div>
              </div>
            </div>
          )}

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
                  {t('app.paymentsNeedConfirmation', { count: pendingConfirmCount })}
                </h3>
                <p className="text-xs text-natural-muted mt-1">{t('app.confirmReceiptBody')}</p>
              </div>
              <button
                onClick={() => setSelectedExpense(pendingToConfirm[0])}
                className="shrink-0 bg-natural-primary hover:bg-natural-primary-ink text-white font-semibold text-xs px-4 py-2 rounded-full shadow-sm transition-colors"
              >
                {t('app.review')}
              </button>
            </div>
          )}

          {overThresholdExpenses.length > 0 && (
            <div className="bg-natural-primary/5 border border-natural-primary/25 rounded-xl p-4 shadow-sm flex items-start gap-3 animate-in fade-in slide-in-from-top-2">
              <AlertCircle className="h-5 w-5 text-natural-primary shrink-0 mt-0.5" />
              <div className="flex-1">
                <h3 className="text-sm font-bold text-natural-text">
                  {t('app.overThreshold', { count: overThresholdExpenses.length })}
                </h3>
                <p className="text-xs text-natural-muted mt-1">
                  {t(
                    overThresholdExpenses.length === 1
                      ? 'app.overThresholdBodyOne'
                      : 'app.overThresholdBodyMany',
                    { amount: formatCurrency(myThreshold, 0) }
                  )}
                </p>
              </div>
              <button
                onClick={() => setSelectedExpense(overThresholdExpenses[0])}
                className="shrink-0 bg-natural-primary hover:bg-natural-primary-ink text-white font-semibold text-xs px-4 py-2 rounded-full shadow-sm transition-colors"
              >
                {t('app.review')}
              </button>
            </div>
          )}

          {/* Someone changed the standing split: a banner at the top of every
            other member's dashboard, dismissed per change (keyed on `at`). */}
          {group.splitChange &&
            group.splitChange.by !== activeUser &&
            dismissedSplitChangeAt !== group.splitChange.at && (
              <div className="bg-natural-primary/5 border border-natural-primary/25 rounded-xl p-4 shadow-sm flex items-start gap-3 animate-in fade-in slide-in-from-top-2">
                <AlertCircle className="h-5 w-5 text-natural-primary shrink-0 mt-0.5" />
                <div className="flex-1">
                  <h3 className="text-sm font-bold text-natural-text">
                    {t('app.splitUpdatedBy', { name: group.splitChange.byName })}
                  </h3>
                  <p className="text-xs text-natural-muted mt-1">
                    <Trans
                      i18nKey="app.splitUpdatedBody"
                      values={{ summary: group.splitChange.summary }}
                      components={{
                        1: <span className="font-mono font-semibold text-natural-text" />,
                      }}
                    />
                  </p>
                </div>
                <button
                  onClick={() => dismissSplitChange(group.splitChange!.at)}
                  className="text-natural-primary hover:text-natural-dark bg-white/60 p-1 rounded-full border border-natural-primary/25 shrink-0"
                  title={t('common.gotIt')}
                  aria-label={t('app.dismissSplitNotice')}
                >
                  <X size={14} />
                </button>
              </div>
            )}

          {missingProfiles.length > 0 && !dismissedWaiting && (
            <div className="bg-natural-primary/5 border border-natural-primary/25 rounded-xl p-4 shadow-sm flex items-start gap-3 animate-in fade-in slide-in-from-top-2">
              <Sparkles className="h-5 w-5 text-natural-primary shrink-0 mt-0.5" />
              <div className="flex-1">
                <h3 className="text-sm font-bold text-natural-text">{t('app.membersSettingUp')}</h3>
                <p className="text-xs text-natural-muted mt-1">{t('app.membersSettingUpBody')}</p>
                <div className="mt-2 space-y-0.5">
                  {missingProfiles.map((id) => (
                    <div key={id} className="text-xs font-medium text-natural-primary">
                      {t('app.hasntCompletedSetup', {
                        name: groupUsers[id]?.name || t('common.someone'),
                      })}
                    </div>
                  ))}
                </div>
              </div>
              <button
                onClick={() => setDismissedWaiting(true)}
                className="text-natural-primary hover:text-natural-dark bg-white/60 p-1 rounded-full border border-natural-primary/25 shrink-0"
                title={t('app.dismiss')}
                aria-label={t('app.dismiss')}
              >
                <X size={14} />
              </button>
            </div>
          )}

          {view === 'home' && (
            <HomeView
              expenses={expenses}
              activeUser={activeUser}
              members={members}
              userName={userProfile?.name || currentUser?.displayName || t('common.friend')}
              greetingNote={userProfile?.weeklyGreeting?.text}
              onLogExpense={() => openForm()}
              onScanReceipt={() => openForm()}
              onOpenExpense={(exp) => setSelectedExpense(exp)}
              onSettle={() => setOwedModal('you_owe')}
              onOpenLedger={() => setView('ledger')}
              onOpenReports={() => (isPlus ? setView('reports') : openPlusFor('reports'))}
              budgets={isPlus ? budgetStatuses : null}
              onOpenPlan={() => (isPlus ? setView('plan') : openPlusFor('plan'))}
              monthClose={
                monthClose && (
                  <MonthCloseCard
                    summary={monthClose}
                    showBudgets={isPlus}
                    onSettle={() => setOwedModal('you_owe')}
                    onReport={() => {
                      dismissMonthClose(monthClose.month);
                      if (!isPlus) {
                        openPlusFor('reports');
                        return;
                      }
                      setReportsPeriod('last_month');
                      setView('reports');
                    }}
                    onDismiss={() => dismissMonthClose(monthClose.month)}
                  />
                )
              }
              candidate={recurringCandidate}
              onDismissCandidate={(c) => dismissRecurring(c.title)}
              onMakeRecurring={(c) => {
                const latest = expenses.find((e) => e.id === c.latestId);
                if (!latest) return;
                syncExpenseUpdate({
                  ...latest,
                  ...makeRecurring(latest, c.interval, c.anchorDay),
                  editedAt: new Date().toISOString(),
                })
                  .then(() =>
                    addToast(
                      t('home.madeRecurring'),
                      t('home.madeRecurringBody', { title: c.title }),
                      'success'
                    )
                  )
                  .catch((e) => console.error('Make recurring failed', e));
              }}
              aside={
                <ModuleBoundary label={t('app.myMonthAhead')}>
                  <MonthAheadCard
                    expenses={statsVisibleExpenses}
                    activeUser={activeUser}
                    locked={!isPlus}
                    onUnlock={unlock}
                  />
                </ModuleBoundary>
              }
            />
          )}

          {view === 'ledger' && (
            <LedgerView
              expenses={expenses}
              group={group}
              activeUser={activeUser}
              members={members}
              onOpenExpense={(exp) => setSelectedExpense(exp)}
              onEditAmount={handleEditAmount}
              onLogExpense={() => openForm()}
              onExport={() => (isPlus ? setShowExport(true) : setShowCherryPlus(true))}
              onCherryPick={() => setShowOrchard(true)}
              onOpenGrid={() => {
                setReportsTab('grid');
                setView('reports');
              }}
              onOpenHouseAccount={() => setView('plan')}
            />
          )}

          {view === 'reports' && (
            <ReportsView
              expenses={expenses}
              group={group}
              activeUser={activeUser}
              members={members}
              locked={!isPlus}
              onUnlock={unlock}
              onOpenExpense={(exp) => setSelectedExpense(exp)}
              onOpenLedger={() => setView('ledger')}
              initialTab={reportsTab}
              initialPeriod={reportsPeriod}
              otherGroupIds={groupIds.filter((gid) => gid !== group.id)}
            >
              {plusExtras}
            </ReportsView>
          )}

          {view === 'plan' && (
            <PlanView
              expenses={expenses}
              group={group}
              activeUser={activeUser}
              members={members}
              locked={!isPlus}
              onUnlock={() => openPlusFor('plan')}
              household={plan.household}
              personal={plan.personal}
              onSave={plan.save}
              onContribute={(g) => openForm('goal', g)}
              onPlanPurchase={() => setShowPlanPurchase(true)}
              onLogDeposit={() => openForm('deposit')}
              otherGroupIds={groupIds.filter((gid) => gid !== group.id)}
            />
          )}

          <footer
            className="text-center text-xs text-natural-muted mt-auto pt-8 pb-2 scroll-end-safe space-y-1"
            id="app-footer"
          >
            <p>{t('app.footerTagline')}</p>
            <p className="font-mono">{t('app.footerSync')}</p>
          </footer>
        </main>
      </div>

      {showExport && isPlus && (
        <Modal
          onClose={() => setShowExport(false)}
          title={t('export.title')}
          bodyClassName="p-4 sm:p-5"
        >
          <ExportPanel
            expenses={expenses}
            activeUser={activeUser}
            nameOf={(uid) => rosterName(uid, members, activeUser)}
            groupName={group.name}
            onDone={() => setShowExport(false)}
          />
        </Modal>
      )}

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
          onSaveIncome={handleSaveIncome}
          onSaveMarketingOptIn={handleSaveMarketingOptIn}
          onSaveLocale={(locale) => {
            // Remembered on the profile so server emails can follow it later.
            setUserProfile((prev: any) => ({ ...(prev || {}), locale }));
            setDoc(doc(db, 'users', activeUser), { locale }, { merge: true }).catch(() => {});
          }}
          onRetakeQuiz={handleRetakeQuiz}
          onRecalculateSplit={handleRecalculateSplit}
          paymentHandlesByUid={paymentHandlesByUid}
          onSaveDefaultSplit={handleSaveDefaultSplit}
          onResendInvite={handleResendInvite}
          onAddSeat={handleAddSeat}
          onRemoveSeat={handleRemoveSeat}
          onLeaveGroup={handleLeaveGroup}
          onOpenBackup={() => {
            // Backups and export are Cherry +; free users get the upgrade page.
            setShowSettings(false);
            if (isPlus) {
              setShowBackup(true);
            } else {
              setShowCherryPlus(true);
            }
          }}
          onOpenPrivacy={() => setShowPrivacyModal(true)}
          onSignOut={() => {
            setShowSettings(false);
            handleSignOut();
          }}
          extraSection={
            <BudgetPaymentsSettings
              isPlus={isPlus}
              setShowSettings={setShowSettings}
              setShowCherryPlus={setShowCherryPlus}
              thresholdInput={thresholdInput}
              setThresholdInput={setThresholdInput}
              savingThreshold={savingThreshold}
              handleSaveThreshold={handleSaveThreshold}
              venmoInput={venmoInput}
              setVenmoInput={setVenmoInput}
              zelleInput={zelleInput}
              setZelleInput={setZelleInput}
              savingHandles={savingHandles}
              handleSavePaymentHandles={handleSavePaymentHandles}
            />
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
          onClose={() => {
            setShowCherryPlus(false);
            setPlusIntro(null);
          }}
          intro={plusIntro}
          customerEmail={currentUser?.email || userProfile?.email}
          onPurchased={() => {
            // Unlock now. The durable copy on users/{uid} is written by the
            // webhook and, independently, by the entitlement sync asked for
            // here, so the purchase survives sign-out even if the webhook
            // never lands.
            setRcPlus(true);
            setUserProfile((prev: any) => ({
              ...(prev || {}),
              isPlus: true,
              plusEntitlement: {
                source: 'revenuecat_web',
                updatedAt: new Date().toISOString(),
              },
            }));
            authHeader()
              .then((h) => fetch('/api/plus-promo-sync', { method: 'POST', headers: h }))
              .catch(() => {});
          }}
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

      {showOrchard && (
        <OrchardMode
          expenses={spendingExpenses}
          group={group}
          activeUser={activeUser}
          onSettle={(e) => {
            setSelectedExpense(e);
            setShowSettleModal(true);
          }}
          onOpen={(e) => setSelectedExpense(e)}
          onAddComment={handleAddComment}
          onClose={() => setShowOrchard(false)}
        />
      )}

      {showPlanPurchase && (
        <PlanPurchase
          group={group}
          activeUser={activeUser}
          groupUsers={groupUsers}
          expenses={expenses}
          myThreshold={Number(userProfile?.recurringThreshold) || 0}
          onLogIt={(prefill) => {
            setShowPlanPurchase(false);
            setEditingExpense(null);
            setPlanPrefill(prefill);
            setShowForm(true);
          }}
          onClose={() => setShowPlanPurchase(false)}
        />
      )}

      {showVault && isPlus && (
        <HouseholdVault
          groupId={group.id}
          activeUser={activeUser}
          expenses={expenses}
          memberNames={Object.fromEntries(getFullMembers(group).map((m) => [m.uid, m.name]))}
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
            setPlanPrefill(null);
            setFormMode('expense');
            setFormGoal(null);
          }}
          onSubmit={handleAddOrEditExpense}
          editingExpense={editingExpense}
          mode={formMode}
          goal={formGoal}
          budgets={isPlus ? [...plan.household.budgets, ...plan.personal.budgets] : undefined}
          expenses={expenses}
          rules={plan.household.rules}
          memberThresholds={memberThresholds}
          isPlus={isPlus}
          paymentHandlesByUid={paymentHandlesByUid}
          prefill={planPrefill}
        />
      )}

      {/* The live copy, so synced confirmations and edits show up immediately. */}
      {selectedExpense && (
        <ExpenseDetail
          expense={expenses.find((e) => e.id === selectedExpense.id) || selectedExpense}
          group={group}
          activeUser={activeUser}
          onClose={() => setSelectedExpense(null)}
          onEdit={() => {
            setEditingExpense(expenses.find((e) => e.id === selectedExpense.id) || selectedExpense);
            setSelectedExpense(null);
            setShowForm(true);
          }}
          onDelete={() => handleDeleteExpense(selectedExpense.id)}
          onSettleClick={() => setShowSettleModal(true)}
          onConfirmReceipt={(settlementId) => handleConfirmSettleReceipt(settlementId)}
          onVoidSettlement={(settlementId) => handleVoidSettlement(settlementId)}
          onAddComment={(text) => handleAddComment(selectedExpense.id, text)}
          onGentleRemind={() =>
            handleGentleRemind(expenses.find((e) => e.id === selectedExpense.id) || selectedExpense)
          }
          onClaim={(uid) => handleClaimExpense(selectedExpense.id, uid)}
        />
      )}

      {showSettleModal && selectedExpense && (
        <SettleUpModal
          expense={expenses.find((e) => e.id === selectedExpense.id) || selectedExpense}
          group={group}
          activeUser={activeUser}
          paymentHandlesByUid={paymentHandlesByUid}
          onClose={() => setShowSettleModal(false)}
          onSubmit={handleSettleUpProposal}
        />
      )}

      {ruleNudge && !showForm && (
        <RuleNudge
          suggestion={ruleNudge.suggestion}
          title={ruleNudge.title}
          onNotNow={() => setRuleNudge(null)}
          onYes={async () => {
            const s = ruleNudge.suggestion;
            setRuleNudge(null);
            const ok = await plan.save('household', {
              ...plan.household,
              rules: [...plan.household.rules, ruleFrom(s)],
            });
            if (ok) {
              addToast(
                t('rules.saved'),
                t('rules.savedBody', { title: s.contains, category: s.category }),
                'success'
              );
            }
          }}
        />
      )}

      {legalDoc && <LegalModal doc={legalDoc} onClose={() => setLegalDoc(null)} />}
    </div>
  );
}
