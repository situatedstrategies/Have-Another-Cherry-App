import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Expense } from '../types';
import { ReportFilter, Period } from '../lib/reports';
import { buildSheets, ExportKind, ExportLabels } from '../lib/exportSheets';
import { downloadCsv, downloadXlsx } from '../lib/exportDownload';
import { getExpenseStatusLabel } from '../lib/money';
import { instrumentLabel } from '../lib/instruments';
import { formatDateWith } from '../lib/format';
import { parseLocalDate, todayLocal } from '../lib/recurring';
import { Chip, panel, label } from './Controls';

interface Props {
  expenses: Expense[];
  activeUser: string;
  nameOf: (uid: string) => string;
  /** The period the reports are on, offered as the first chip. */
  currentPeriod?: Period;
  currentPeriodLabel?: string;
  groupName?: string;
  onDone?: () => void;
}

type PeriodChoice = 'current' | 'year' | 'all';

const ALL_TIME: Period = { start: '0000-01-01', end: '9999-12-31' };

/**
 * The export panel: pick what goes in, pick a period, download .xlsx or .csv.
 * Sheets come from lib/exportSheets, which is built on the same reports
 * arithmetic the screen shows, so the file and the screen never disagree.
 */
export default function ExportPanel({
  expenses,
  activeUser,
  nameOf,
  currentPeriod,
  currentPeriodLabel,
  groupName,
  onDone,
}: Props) {
  const { t } = useTranslation();
  const [kinds, setKinds] = useState<Record<ExportKind, boolean>>({
    ledger: true,
    pivot: true,
    deposits: true,
    settlements: false,
  });
  const [period, setPeriod] = useState<PeriodChoice>(currentPeriod ? 'current' : 'year');
  const [busy, setBusy] = useState(false);
  const today = todayLocal();

  const chosen = (Object.keys(kinds) as ExportKind[]).filter((k) => kinds[k]);
  const bounds: Period =
    period === 'current' && currentPeriod
      ? currentPeriod
      : period === 'year'
        ? { start: `${today.slice(0, 4)}-01-01`, end: `${today.slice(0, 4)}-12-31` }
        : ALL_TIME;

  const labels: ExportLabels = {
    sheet: {
      ledger: t('export.sheet.ledger'),
      pivot: t('export.sheet.pivot'),
      deposits: t('export.sheet.deposits'),
      settlements: t('export.sheet.settlements'),
    },
    date: t('sheet.date'),
    item: t('sheet.item'),
    category: t('sheet.category'),
    paidBy: t('export.col.paidBy'),
    method: t('export.col.method'),
    amount: t('sheet.amount'),
    yourShare: t('sheet.yourShare'),
    status: t('sheet.status'),
    recurring: t('export.col.recurring'),
    total: t('reports.total'),
    from: t('export.col.from'),
    to: t('export.col.to'),
    uncategorised: t('category.none'),
    month: (m) => formatDateWith(parseLocalDate(`${m}-01`), { month: 'short', year: 'numeric' }),
    methodName: (code) => (code === 'UNKNOWN' ? t('insights.notRecorded') : instrumentLabel(code)),
    settlementStatus: (s) => t(`export.settlementStatus.${s}`, { defaultValue: s }),
  };

  const build = () => {
    const filter: ReportFilter = { ...bounds, view: 'personal', uid: activeUser };
    return buildSheets(chosen, {
      expenses,
      filter,
      nameOf,
      statusLabel: getExpenseStatusLabel,
      labels,
    });
  };

  const fileStem = `${(groupName || t('common.brand')).replace(/[^\wÀ-ɏЀ-ӿ -]/g, '').trim() || 'ledger'} ${today}`;

  const run = async (format: 'xlsx' | 'csv') => {
    if (chosen.length === 0 || busy) return;
    setBusy(true);
    try {
      const sheets = build();
      if (format === 'xlsx') await downloadXlsx(sheets, `${fileStem}.xlsx`);
      else downloadCsv(sheets, `${fileStem}.csv`);
      onDone?.();
    } finally {
      setBusy(false);
    }
  };

  const items: { key: ExportKind; text: string }[] = [
    { key: 'ledger', text: t('export.pick.ledger') },
    { key: 'pivot', text: t('export.pick.pivot') },
    { key: 'deposits', text: t('export.pick.deposits') },
    { key: 'settlements', text: t('export.pick.settlements') },
  ];

  return (
    <section
      className={`${panel} rounded-[20px] px-5 py-[18px] flex flex-col gap-3`}
      id="export-panel"
    >
      <div className="flex flex-col gap-0.5">
        <span className={label}>{t('export.title')}</span>
        <span className="text-[13px] leading-[18px] text-natural-muted">
          {t('export.subtitle')}
        </span>
      </div>
      <div className="flex flex-col gap-1 text-sm leading-5">
        {items.map((i) => (
          <label key={i.key} className="flex items-center gap-2.5 min-h-[44px] cursor-pointer">
            <input
              type="checkbox"
              checked={kinds[i.key]}
              onChange={(e) => setKinds((k) => ({ ...k, [i.key]: e.target.checked }))}
              className="h-[18px] w-[18px] accent-natural-primary"
              id={`export-${i.key}`}
            />
            {i.text}
          </label>
        ))}
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-xs text-natural-muted">{t('export.period')}</span>
        <div className="flex gap-1.5 flex-wrap">
          {currentPeriod && (
            <Chip small selected={period === 'current'} onClick={() => setPeriod('current')}>
              {currentPeriodLabel || t('export.thisPeriod')}
            </Chip>
          )}
          <Chip small selected={period === 'year'} onClick={() => setPeriod('year')}>
            {t('export.thisYear')}
          </Chip>
          <Chip small selected={period === 'all'} onClick={() => setPeriod('all')}>
            {t('sheet.all')}
          </Chip>
        </div>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => run('xlsx')}
          disabled={chosen.length === 0 || busy}
          className="flex-1 h-11 rounded-full bg-natural-primary hover:bg-natural-primary-ink disabled:opacity-50 text-white text-sm font-semibold cursor-pointer transition-colors"
          id="export-xlsx-btn"
        >
          {busy ? t('common.pleaseWait') : t('export.downloadXlsx')}
        </button>
        <button
          type="button"
          onClick={() => run('csv')}
          disabled={chosen.length === 0 || busy}
          className="h-11 px-4 rounded-full border border-natural-border bg-white text-natural-text text-sm font-semibold hover:border-natural-muted disabled:opacity-50 cursor-pointer transition-colors"
          id="export-csv-btn"
        >
          {t('export.downloadCsv')}
        </button>
      </div>
      <span className="text-xs leading-4 text-natural-muted">
        {t('export.footnote', { count: chosen.length })}
      </span>
    </section>
  );
}
