import React, { useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Expense, User } from '../types';

interface MonthlyComparisonChartProps {
  expenses: Expense[];
  members: User[];
}

export default function MonthlyComparisonChart({ expenses, members }: MonthlyComparisonChartProps) {
  const data = useMemo(() => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    let prevMonth = currentMonth - 1;
    
    if (prevMonth < 0) {
      prevMonth = 11;
    }

    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const currentMonthName = monthNames[currentMonth];
    const prevMonthName = monthNames[prevMonth];

    // Generate last 6 months
    const last6Months = Array.from({ length: 6 }).map((_, i) => {
      const d = new Date(currentYear, currentMonth - 5 + i, 1);
      return {
        monthKey: `${d.getFullYear()}-${d.getMonth()}`,
        name: monthNames[d.getMonth()].substring(0, 3),
        spending: 0,
        lending: 0
      };
    });

    expenses.forEach(exp => {
      const d = new Date(exp.date);
      const m = d.getMonth();
      const y = d.getFullYear();
      const monthKey = `${y}-${m}`;
      
      const monthData = last6Months.find(m => m.monthKey === monthKey);
      if (monthData) {
        monthData.spending += exp.amount;
        monthData.lending += exp.amount; 
      }
    });

    return {
      chartData: last6Months,
      currentMonthName,
      prevMonthName
    };
  }, [expenses]);

  if (data.chartData.length === 0) return null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
      <div className="bg-white rounded-xl border border-natural-border shadow-sm p-6">
        <div className="mb-6">
          <h3 className="text-sm font-bold text-natural-text uppercase tracking-wider">Monthly Spending Trends</h3>
          <p className="text-xs text-natural-muted mt-1">Comparing {data.prevMonthName} to {data.currentMonthName}</p>
        </div>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data.chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748B' }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748B' }} tickFormatter={(val) => `$${val}`} width={45} />
              <Tooltip 
                contentStyle={{ borderRadius: '8px', border: '1px solid #E2E8F0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                formatter={(value: number) => [`$${value.toFixed(2)}`, 'Spending']}
              />
              <Line type="monotone" dataKey="spending" stroke="#C41200" strokeWidth={3} dot={{ r: 4, fill: '#C41200' }} activeDot={{ r: 6 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-natural-border shadow-sm p-6">
        <div className="mb-6">
          <h3 className="text-sm font-bold text-natural-text uppercase tracking-wider">Monthly Lending Trends</h3>
          <p className="text-xs text-natural-muted mt-1">Comparing {data.prevMonthName} to {data.currentMonthName}</p>
        </div>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data.chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748B' }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748B' }} tickFormatter={(val) => `$${val}`} width={45} />
              <Tooltip 
                contentStyle={{ borderRadius: '8px', border: '1px solid #E2E8F0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                formatter={(value: number) => [`$${value.toFixed(2)}`, 'Lending']}
              />
              <Line type="monotone" dataKey="lending" stroke="#334155" strokeWidth={3} dot={{ r: 4, fill: '#334155' }} activeDot={{ r: 6 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
