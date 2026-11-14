import { useEffect, useMemo, useState, lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { BarChart3, Sparkles, ChevronDown, Check } from 'lucide-react';
import { Expense, Group } from '../types';
import {
  PeriodKey,
  ReportFilter,
  ReportView as ReportMode,
  periodBounds,
  applyFilter,
} from '../lib/reports';
import { nameOf as rosterName, joinedUids } from '../lib/members';
import { mergePersonalAcrossGroups } from '../lib/crossGroup';
import { useOtherLedgers, OtherLedgers } from '../hooks/useOtherLedgers';
import { todayLocal, parseLocalDate } from '../lib/recurring';
import { formatDateWith } from '../lib/format';
import { labelClass } from '../lib/ui';
import ReportsGrid from './ReportsGrid';
import ExportPanel from './ExportPanel';
import ModuleBoundary from './ModuleBoundary';
import { panel, Chip, Segmented, PageHeader } from './Controls';

// The charts pull in recharts; the grid does not, so the charts load when
// first shown rather than with the view.
const ReportsCharts = lazy(() => import('./ReportsCharts'));

type Tab = 'charts' | 'grid';
/** Personal, Household, or the member's share across every group they are in. */
type Scope = ReportMode | 'all';

interface Props {
  expenses: Expense[];
  group: Group;
  activeUser: string;
  members: { uid: string; name?: string }[];
  /** Cherry + gate: a teaser that opens the Cherry + page. */
  locked?: boolean;
  onUnlock?: () => void;
  onOpenExpense: (e: Expense) => void;
  onOpenLedger: () => void;
  /** Start on the grid (from the ledger's "By category and month" chip). */
  initialTab?: Tab;
  /** Start on this period (the month close card opens Last month). */
  initialPeriod?: PeriodKey;
  /** Everything else that lives on the reports page under the reports. */
  children?: React.ReactNode;
  /** The member's other groups; with any, the view offers "All my groups". */
  otherGroupIds?: string[];
  /** Dev harness only: the other ledgers without Firebase. */
  presetOtherLedgers?: OtherLedgers;
}

interface Remembered {
  tab: Tab;
  view: Scope;
  period: PeriodKey;
  payer: string;
  categories: string[];
}

const PERIODS: PeriodKey[] = ['this_month', 'last_month', '3m', '6m', '1y'];

const storageKey = (gid: string) => `reports_filters_${gid}`;

const readRemembered = (gid: string): Partial<Remembered> => {
  try {
    const raw = localStorage.getItem(storageKey(gid));
    return raw ? (JSON.parse(raw) as Partial<Remembered>) : {};
  } catch {
    return {};
  }
};

/**
 * Reports: where the money went, for any period, in Household or Personal
 * view, as charts or as a grid. Cherry + only; the free state is a locked
 * teaser like My month ahead's. Filters are remembered per device.
 */
export default function ReportsView({
  expenses,
  group,
  activeUser,
  members,
  locked,
  onUnlock,
  onOpenExpense,
  onOpenLedger,
  initialTab,
  initialPeriod,
  children,
  otherGroupIds = [],
  presetOtherLedgers,
}: Props) {
  const { t } = useTranslation();
  const remembered = useMemo(() => readRemembered(group.id), [group.id]);
  const [tab, setTab] = useState<Tab>(initialTab ?? remembered.tab ?? 'charts');
  const [view, setView] = useState<Scope>(
    remembered.view === 'all' && otherGroupIds.length === 0
      ? 'personal'
      : (remembered.view ?? 'personal')
  );
  const [period, setPeriod] = useState<PeriodKey>(
    initialPeriod ??
      (PERIODS.includes(remembered.period as PeriodKey) ? (remembered.period as PeriodKey) : '6m')
  );
  const [payer, setPayer] = useState<string>(remembered.payer ?? 'all');
  const [categories, setCategories] = useState<string[]>(remembered.categories ?? []);
  const [catOpen, setCatOpen] = useState(false);

  useEffect(() => {
    if (initialTab) setTab(initialTab);
  }, [initialTab]);
  useEffect(() => {
    if (initialPeriod) setPeriod(initialPeriod);
  }, [initialPeriod]);

  useEffect(() => {
    try {
      const value: Remembered = { tab, view, period, payer, categories };
      localStorage.setItem(storageKey(group.id), JSON.stringify(value));
    } catch {
      /* per-device convenience only */
    }
  }, [tab, view, period, payer, categories, group.id]);

  // "All my groups": the other ledgers load only while that scope is chosen
  // and are dropped when it changes; nothing is written anywhere.
  const all = view === 'all' && otherGroupIds.length > 0;
  const loaded = useOtherLedgers(otherGroupIds, all && !presetOtherLedgers);
  const others = presetOtherLedgers ?? loaded;
  const data = useMemo(
    () =>
      all
        ? mergePersonalAcrossGroups({ [group.id]: expenses, ...others.ledgers }, activeUser)
        : expenses,
    [all, group.id, expenses, others.ledgers, activeUser]
  );
  const reportView: ReportMode = view === 'household' ? 'household' : 'personal';

  const today = todayLocal();
  const bounds = useMemo(() => periodBounds(period, today), [period, today]);
  const filter: ReportFilter = useMemo(
    () => ({
      ...bounds,
      view: reportView,
      uid: activeUser,
      payers: payer === 'all' ? undefined : [payer],
      categories: categories.length ? categories : undefined,
    }),
    [bounds, reportView, activeUser, payer, categories]
  );

  const memberIds = useMemo(() => {
    const own = joinedUids(group);
    if (!all) return own;
    const set = new Set(own);
    for (const ids of Object.values(others.memberIds)) for (const id of ids) set.add(id);
    return [...set];
  }, [group, all, others.memberIds]);
  const roster = useMemo(
    () => [...members, ...Object.entries(others.names).map(([uid, name]) => ({ uid, name }))],
    [members, others.names]
  );
  const nameOf = (uid: string) => rosterName(uid, roster, activeUser);

  // Every category with a line in the period, for the picker.
  const allCategories = useMemo(() => {
    const set = new Set<string>();
    for (const e of applyFilter(data, { ...bounds, view: reportView, uid: activeUser })) {
      set.add((e.category || '').trim());
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [data, bounds, reportView, activeUser]);

  // A remembered filter the controls no longer offer is dropped, or the
  // picker would read "Everyone" while the reports stayed filtered to a
  // member of another group, or to a category with nothing in this period.
  const stillLoading = all && others.loading;
  useEffect(() => {
    if (!stillLoading && payer !== 'all' && !memberIds.includes(payer)) setPayer('all');
  }, [stillLoading, payer, memberIds]);
  useEffect(() => {
    if (stillLoading) return;
    setCategories((cs) => {
      const kept = cs.filter((c) => allCategories.includes(c));
      return kept.length === cs.length ? cs : kept;
    });
  }, [stillLoading, allCategories]);

  const periodLabel = (k: PeriodKey) => t(`reports.period.${k}`);
  const rangeLabel = useMemo(() => {
    const s = parseLocalDate(bounds.start);
    const e = parseLocalDate(bounds.end);
    const f = (d: Date) =>
      formatDateWith(d, {
        month: 'short',
        year: s.getFullYear() === e.getFullYear() ? undefined : 'numeric',
      });
    return s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear()
      ? formatDateWith(s, { month: 'long', year: 'numeric' })
      : t('reports.rangeLabel', { from: f(s), to: f(e) });
  }, [bounds, t]);

  if (locked) {
    return (
      <div className="flex flex-col gap-5" id="reports-view">
        <PageHeader title={t('nav.reports')} subtitle={t('reports.subtitle')} />
        <button
          type="button"
          onClick={onUnlock}
          className={`${panel} p-5 w-full text-left space-y-3 hover:border-natural-primary/40 transition-colors cursor-pointer`}
          id="reports-locked"
        >
          <div className="flex items-center justify-between">
            <h3 className={`${labelClass} flex items-center gap-1.5`}>
              <BarChart3 className="h-3.5 w-3.5 text-natural-primary" /> {t('nav.reports')}
            </h3>
            <span className="text-[10px] font-bold tracking-wider text-white bg-natural-dark px-1.5 py-0.5 rounded-md">
              Cherry +
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2" aria-hidden="true">
            {[
              t('reports.yourShare'),
              t('reports.perMonth'),
              t('reports.recurring'),
              t('reports.frontedOnCredit'),
            ].map((l) => (
              <div
                key={l}
                className="bg-natural-bg/50 rounded-xl p-2 border border-natural-border/50 text-center"
              >
                <span className="block text-lg font-display font-semibold text-natural-border select-none">
                  ···
                </span>
                <span className="block text-xs font-semibold text-natural-muted uppercase">
                  {l}
                </span>
              </div>
            ))}
          </div>
          <p className="text-xs text-natural-muted flex items-center gap-1.5">
            <Sparkles className="h-3 w-3 shrink-0" /> {t('reports.teaser')}
          </p>
        </button>
        {children}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5" id="reports-view">
      <PageHeader
        title={t('nav.reports')}
        subtitle={
          <>
            {tab === 'grid' ? t(`reports.gridHint.${reportView}`) : t('reports.subtitle')}
            {all && (
              <>
                {' '}
                <span className="font-mono text-natural-text" id="reports-groups-caption">
                  {others.loading
                    ? t('reports.loadingGroups')
                    : t('reports.groupsCount', { count: otherGroupIds.length + 1 })}
                </span>
              </>
            )}
          </>
        }
      >
        <Segmented
          value={tab}
          onChange={setTab}
          ariaLabel={t('reports.tabAria')}
          options={[
            { value: 'charts', label: t('reports.charts') },
            { value: 'grid', label: t('reports.grid') },
          ]}
        />
        <Segmented
          value={view}
          onChange={setView}
          ariaLabel={t('reports.viewAria')}
          options={[
            { value: 'personal', label: t('reports.view.personal') },
            { value: 'household', label: t('reports.view.household') },
            ...(otherGroupIds.length > 0
              ? [{ value: 'all' as Scope, label: t('reports.view.all') }]
              : []),
          ]}
        />
      </PageHeader>

      <div className="flex flex-wrap items-center gap-2" id="reports-filters">
        {PERIODS.map((p) => (
          <Chip key={p} selected={period === p} onClick={() => setPeriod(p)}>
            {periodLabel(p)}
          </Chip>
        ))}
        <span className="w-px h-5 bg-natural-border mx-1 hidden sm:block" aria-hidden="true" />
        <label className="relative inline-flex items-center">
          <select
            value={payer}
            onChange={(e) => setPayer(e.target.value)}
            aria-label={t('reports.whoPaidAria')}
            className={`chip h-[34px] pl-3.5 pr-8 rounded-full text-[13px] font-semibold border appearance-none cursor-pointer outline-none ${
              payer === 'all'
                ? 'bg-white text-natural-muted border-natural-border'
                : 'bg-natural-dark text-white border-natural-dark'
            }`}
            id="reports-payer"
          >
            <option value="all">{t('reports.everyone')}</option>
            {memberIds.map((uid) => (
              <option key={uid} value={uid}>
                {nameOf(uid)}
              </option>
            ))}
          </select>
          <ChevronDown
            className={`absolute right-3 h-3.5 w-3.5 pointer-events-none ${payer === 'all' ? 'text-natural-muted' : 'text-white'}`}
          />
        </label>
        <div className="relative">
          <Chip selected={categories.length > 0} onClick={() => setCatOpen((o) => !o)}>
            <span className="inline-flex items-center gap-1.5">
              {categories.length === 0
                ? t('reports.allCategories')
                : t('reports.categoriesChosen', { count: categories.length })}
              <ChevronDown className="h-3.5 w-3.5" />
            </span>
          </Chip>
          {catOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setCatOpen(false)} />
              <div
                className="absolute left-0 top-full mt-1 z-20 w-60 max-h-72 overflow-y-auto bg-white border border-natural-border rounded-xl shadow-lg py-1 animate-in fade-in"
                role="menu"
              >
                <button
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked={categories.length === 0}
                  onClick={() => setCategories([])}
                  className="w-full text-left px-3 py-2 text-xs font-semibold flex items-center justify-between gap-2 hover:bg-natural-bg min-h-[44px]"
                >
                  {t('reports.allCategories')}
                  {categories.length === 0 && <Check size={14} className="text-natural-primary" />}
                </button>
                {allCategories.map((c) => {
                  const on = categories.includes(c);
                  return (
                    <button
                      key={c || '__none__'}
                      type="button"
                      role="menuitemcheckbox"
                      aria-checked={on}
                      onClick={() =>
                        setCategories((cs) => (on ? cs.filter((x) => x !== c) : [...cs, c]))
                      }
                      className="w-full text-left px-3 py-2 text-xs flex items-center justify-between gap-2 hover:bg-natural-bg min-h-[44px]"
                    >
                      <span className="truncate">{c || t('category.none')}</span>
                      {on && <Check size={14} className="text-natural-primary shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>

      {tab === 'charts' ? (
        <ModuleBoundary label={t('reports.charts')}>
          <Suspense
            fallback={
              <div className={`${panel} p-5 text-sm text-natural-muted`}>{t('common.loading')}</div>
            }
          >
            <ReportsCharts
              expenses={data}
              filter={filter}
              period={period}
              memberIds={memberIds}
              nameOf={nameOf}
              today={today}
              onOpenLedger={onOpenLedger}
            />
          </Suspense>
        </ModuleBoundary>
      ) : (
        <div className="flex flex-wrap gap-4 items-start">
          <div className="[flex:999_1_480px] min-w-0">
            <ModuleBoundary label={t('reports.grid')}>
              <ReportsGrid
                expenses={data}
                filter={filter}
                today={today}
                onOpenExpense={onOpenExpense}
              />
            </ModuleBoundary>
          </div>
          <aside className="[flex:1_1_280px] max-w-[360px] min-w-0 flex flex-col gap-4">
            <ModuleBoundary label={t('export.title')}>
              <ExportPanel
                expenses={data}
                activeUser={activeUser}
                nameOf={nameOf}
                currentPeriod={bounds}
                currentPeriodLabel={rangeLabel}
                groupName={group.name}
              />
            </ModuleBoundary>
          </aside>
        </div>
      )}

      {children}
    </div>
  );
}
