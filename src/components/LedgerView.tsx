import { useMemo, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Download, Cherry as CherryIcon } from 'lucide-react';
import { Expense, Group } from '../types';
import { formatDateWith } from '../lib/format';
import { parseLocalDate, todayLocal } from '../lib/recurring';
import { monthKey } from '../lib/reports';
import ExpenseList from './ExpenseList';
import LedgerSheet from './LedgerSheet';
import ModuleBoundary from './ModuleBoundary';
import { Chip, GhostButton, PrimaryButton, PageHeader, Segmented } from './Controls';

export type LedgerMode = 'cards' | 'sheet';

interface Props {
  expenses: Expense[];
  group: Group;
  activeUser: string;
  members: { uid: string; name?: string }[];
  onOpenExpense: (e: Expense) => void;
  onEditAmount: (e: Expense, amount: number) => void;
  onLogExpense: () => void;
  onExport: () => void;
  onCherryPick: () => void;
  onOpenGrid: () => void;
  onOpenHouseAccount: () => void;
}

const MODE_KEY = 'ledger_mode';

/**
 * The Ledger: the existing cards, or the sheet, behind a Cards / Sheet switch.
 * Period chips narrow both to one month; "All" shows everything.
 */
export default function LedgerView({
  expenses,
  group,
  activeUser,
  members,
  onOpenExpense,
  onEditAmount,
  onLogExpense,
  onExport,
  onCherryPick,
  onOpenGrid,
  onOpenHouseAccount,
}: Props) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<LedgerMode>(() => {
    try {
      return localStorage.getItem(MODE_KEY) === 'sheet' ? 'sheet' : 'cards';
    } catch {
      return 'cards';
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(MODE_KEY, mode);
    } catch {
      /* per-device convenience only */
    }
  }, [mode]);
  const [period, setPeriod] = useState<string>('all');

  // The months the ledger spans, newest first, as chips.
  const months = useMemo(() => {
    const set = new Set<string>();
    for (const e of expenses) if (e.date) set.add(monthKey(e.date));
    return [...set].sort().reverse().slice(0, 12);
  }, [expenses]);

  const shown = useMemo(
    () => (period === 'all' ? expenses : expenses.filter((e) => monthKey(e.date) === period)),
    [expenses, period]
  );

  const monthLabel = (k: string, long = false) => {
    const d = parseLocalDate(`${k}-01`);
    const thisYear = d.getFullYear() === parseLocalDate(todayLocal()).getFullYear();
    return formatDateWith(d, {
      month: long ? 'long' : 'short',
      year: thisYear ? undefined : 'numeric',
    });
  };
  const periodLabel =
    period === 'all' ? t('sheet.allTime', { count: shown.length }) : monthLabel(period, true);

  return (
    <div className="flex flex-col gap-4" id="ledger-view">
      <PageHeader
        title={t('nav.ledger')}
        subtitle={mode === 'sheet' ? t('sheet.hint') : t('sheet.cardsHint')}
      >
        <Segmented
          value={mode}
          onChange={setMode}
          ariaLabel={t('sheet.modeAria')}
          options={[
            { value: 'cards', label: t('sheet.cards') },
            { value: 'sheet', label: t('sheet.sheet') },
          ]}
        />
        <GhostButton onClick={onExport} id="ledger-export-btn">
          <Download className="h-4 w-4" /> {t('export.button')}
        </GhostButton>
        <GhostButton
          onClick={onCherryPick}
          title={t('app.cherryPickTitle')}
          id="ledger-cherry-pick-btn"
        >
          <CherryIcon className="h-4 w-4 text-natural-primary" /> {t('app.cherryPick')}
        </GhostButton>
        <PrimaryButton onClick={onLogExpense} id="ledger-log-btn">
          <Plus className="h-4 w-4" /> {t('home.logExpense')}
        </PrimaryButton>
      </PageHeader>

      {mode === 'sheet' ? (
        <ModuleBoundary label={t('sheet.sheet')}>
          <LedgerSheet
            expenses={shown}
            activeUser={activeUser}
            members={members}
            periodLabel={periodLabel}
            onOpenExpense={onOpenExpense}
            onEditAmount={onEditAmount}
          />
        </ModuleBoundary>
      ) : (
        <ModuleBoundary label={t('app.sharedLedger')}>
          <ExpenseList
            expenses={shown}
            group={group}
            activeUser={activeUser}
            onExpenseClick={onOpenExpense}
          />
        </ModuleBoundary>
      )}

      <div className="flex flex-wrap items-center gap-2" id="ledger-periods">
        <Chip selected={period === 'all'} onClick={() => setPeriod('all')}>
          {t('sheet.all')}
        </Chip>
        {months.map((m) => (
          <Chip key={m} selected={period === m} onClick={() => setPeriod(m)}>
            {monthLabel(m)}
          </Chip>
        ))}
        <span className="w-px h-5 bg-natural-border mx-1" aria-hidden="true" />
        <Chip onClick={onOpenGrid}>{t('sheet.byCategoryAndMonth')}</Chip>
        <Chip onClick={onOpenHouseAccount}>{t('house.title')}</Chip>
      </div>
    </div>
  );
}
