import React, { useMemo, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Expense, User } from '../types';

interface MonthlyComparisonChartProps {
  expenses: Expense[];
  members: User[];
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const RANGES: { key: string; label: string; months: number }[] = [
  { key: '1M', label: '1M', months: 1 },
  { key: '3M', label: '3M', months: 3 },
  { key: '6M', label: '6M', months: 6 },
  { key: '1Y', label: '1Y', months: 12 },
];

const round2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;

// Tooltip for the lending chart: shows who lent and who borrowed that month.
function LendingTooltip({ active, payload, label, compare }: any) {
  if (!active || !payload || !payload.length) return null;
  const d = payload[0]?.payload || {};
  const lentBy: Record<string, number> = d.lentBy || {};
  const borrowedBy: Record<string, number> = d.borrowedBy || {};
  return (
    <div style={{ borderRadius: 8, border: '1px solid #E4E4E7', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', background: '#fff', padding: '10px 12px', fontSize: 12 }}>
      <p style={{ fontWeight: 700, color: '#18181B', marginBottom: 4 }}>{label}</p>
      <p style={{ color: '#18181B', fontWeight: 600 }}>Total lent: ${Number(d.lending || 0).toFixed(2)}</p>
      {compare && (
        <p style={{ color: '#A1A1AA' }}>Previous: ${Number(d.prevLending || 0).toFixed(2)}</p>
      )}
      {Object.keys(lentBy).length > 0 && (
        <div style={{ marginTop: 6 }}>
          <p style={{ color: '#71717A', textTransform: 'uppercase', fontSize: 10, letterSpacing: '0.05em' }}>Lent by</p>
          {Object.entries(lentBy).map(([name, amt]) => (
            <p key={name} style={{ color: '#18181B' }}>{name}: <strong>${Number(amt).toFixed(2)}</strong></p>
          ))}
        </div>
      )}
      {Object.keys(borrowedBy).length > 0 && (
        <div style={{ marginTop: 6 }}>
          <p style={{ color: '#71717A', textTransform: 'uppercase', fontSize: 10, letterSpacing: '0.05em' }}>Borrowed by</p>
          {Object.entries(borrowedBy).map(([name, amt]) => (
            <p key={name} style={{ color: '#18181B' }}>{name}: <strong>${Number(amt).toFixed(2)}</strong></p>
          ))}
        </div>
      )}
    </div>
  );
}

export default function MonthlyComparisonChart({ expenses, members }: MonthlyComparisonChartProps) {
  const [rangeKey, setRangeKey] = useState('6M');
  const [compare, setCompare] = useState(false);

  const months = RANGES.find(r => r.key === rangeKey)?.months || 6;

  const chartData = useMemo(() => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    const withYear = months >= 12;

    const nameOf = (uid: string) => members.find(m => m.uid === uid)?.name || 'Unknown';

    // Build `months` monthly buckets ending this month, shifted back by periodOffset periods.
    const buildBuckets = (periodOffset: number) =>
      Array.from({ length: months }).map((_, i) => {
        const d = new Date(currentYear, currentMonth - (months - 1) + i - periodOffset * months, 1);
        return {
          year: d.getFullYear(),
          month: d.getMonth(),
          label: MONTH_NAMES[d.getMonth()].substring(0, 3) + (withYear ? ` '${String(d.getFullYear()).slice(2)}` : ''),
        };
      });

    const curBuckets = buildBuckets(0);
    const prevBuckets = buildBuckets(1);

    const curMap = new Map<string, number>();
    curBuckets.forEach((b, i) => curMap.set(`${b.year}-${b.month}`, i));
    const prevMap = new Map<string, number>();
    prevBuckets.forEach((b, i) => prevMap.set(`${b.year}-${b.month}`, i));

    const cur = curBuckets.map(b => ({ ...b, spending: 0, lending: 0, lentBy: {} as Record<string, number>, borrowedBy: {} as Record<string, number> }));
    const prev = prevBuckets.map(b => ({ ...b, spending: 0, lending: 0 }));

    expenses.forEach(exp => {
      const d = new Date(exp.date);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      const amount = exp.amount || 0;
      const payerShare = exp.shares?.[exp.paidBy] || 0;
      const lent = Math.max(0, round2(amount - payerShare)); // what everyone else owes the payer

      if (curMap.has(key)) {
        const b = cur[curMap.get(key)!];
        b.spending += amount;
        b.lending += lent;
        const payerName = nameOf(exp.paidBy);
        if (lent > 0) b.lentBy[payerName] = round2((b.lentBy[payerName] || 0) + lent);
        Object.entries(exp.shares || {}).forEach(([uid, s]) => {
          if (uid !== exp.paidBy && (s || 0) > 0) {
            const n = nameOf(uid);
            b.borrowedBy[n] = round2((b.borrowedBy[n] || 0) + (s || 0));
          }
        });
        if (exp.splitType === 'third_party' && exp.thirdPersonShare) {
          const n = exp.thirdPersonName || 'Third person';
          b.borrowedBy[n] = round2((b.borrowedBy[n] || 0) + exp.thirdPersonShare);
        }
        (exp.extraParticipants || []).forEach(g => {
          b.borrowedBy[g.name] = round2((b.borrowedBy[g.name] || 0) + g.share);
        });
      } else if (prevMap.has(key)) {
        const b = prev[prevMap.get(key)!];
        b.spending += amount;
        b.lending += lent;
      }
    });

    return cur.map((b, i) => ({
      name: b.label,
      spending: round2(b.spending),
      lending: round2(b.lending),
      prevSpending: round2(prev[i]?.spending || 0),
      prevLending: round2(prev[i]?.lending || 0),
      lentBy: b.lentBy,
      borrowedBy: b.borrowedBy,
    }));
  }, [expenses, members, months]);

  const rangeLabel = RANGES.find(r => r.key === rangeKey)?.months === 1 ? 'Last month' : `Last ${months} months`;
  const subtitle = compare ? `${rangeLabel} vs previous ${months === 1 ? 'month' : `${months} months`}` : rangeLabel;

  const Controls = (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex gap-1 bg-natural-sidebar rounded-lg p-1">
        {RANGES.map(r => (
          <button
            key={r.key}
            type="button"
            onClick={() => setRangeKey(r.key)}
            className={`px-2.5 py-1 text-xs font-bold rounded-md transition-all ${
              rangeKey === r.key ? 'bg-white text-natural-text shadow-sm' : 'text-natural-muted hover:text-natural-text'
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={() => setCompare(c => !c)}
        className={`px-3 py-1.5 text-xs font-bold rounded-lg border transition-all ${
          compare ? 'bg-natural-primary text-white border-natural-primary' : 'bg-white text-natural-muted border-natural-border hover:border-natural-primary/50'
        }`}
      >
        Compare previous
      </button>
    </div>
  );

  return (
    <div className="space-y-4 mb-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-natural-text uppercase tracking-wider">Spending &amp; Lending Trends</h3>
          <p className="text-xs text-natural-muted mt-1">{subtitle}</p>
        </div>
        {Controls}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Spending */}
        <div className="bg-white rounded-xl border border-natural-border shadow-sm p-6">
          <h4 className="text-xs font-bold text-natural-text uppercase tracking-wider mb-4">Monthly Spending</h4>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E4E4E7" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#71717A' }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#71717A' }} tickFormatter={(val) => `$${val}`} width={45} />
                <Tooltip
                  contentStyle={{ borderRadius: '8px', border: '1px solid #E4E4E7', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  formatter={(value: number, name: string) => [`$${Number(value).toFixed(2)}`, name === 'prevSpending' ? 'Previous' : 'This period']}
                />
                {compare && <Legend wrapperStyle={{ fontSize: 11 }} />}
                <Line type="monotone" dataKey="spending" name="This period" stroke="#C41200" strokeWidth={3} dot={{ r: 4, fill: '#C41200' }} activeDot={{ r: 6 }} />
                {compare && <Line type="monotone" dataKey="prevSpending" name="Previous" stroke="#C41200" strokeDasharray="4 4" strokeWidth={2} dot={{ r: 3 }} strokeOpacity={0.5} />}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Lending */}
        <div className="bg-white rounded-xl border border-natural-border shadow-sm p-6">
          <h4 className="text-xs font-bold text-natural-text uppercase tracking-wider mb-4">Monthly Lending</h4>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E4E4E7" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#71717A' }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#71717A' }} tickFormatter={(val) => `$${val}`} width={45} />
                <Tooltip content={<LendingTooltip compare={compare} />} />
                {compare && <Legend wrapperStyle={{ fontSize: 11 }} />}
                <Line type="monotone" dataKey="lending" name="This period" stroke="#18181B" strokeWidth={3} dot={{ r: 4, fill: '#18181B' }} activeDot={{ r: 6 }} />
                {compare && <Line type="monotone" dataKey="prevLending" name="Previous" stroke="#18181B" strokeDasharray="4 4" strokeWidth={2} dot={{ r: 3 }} strokeOpacity={0.5} />}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
