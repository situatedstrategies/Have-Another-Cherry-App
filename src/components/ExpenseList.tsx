import React, { useState, useMemo } from 'react';
import { getFullMembers } from '../lib/members';
import { Expense, Group } from '../types';
import { getRemainingSettlementAmount, getTotalRemainingOwedToPayer, isExpenseFullySettled, getNormalizedExpenseStatus, isDarkCherry, getDarkCherryRemaining } from '../lib/money';
import { Search, ArrowUpDown, ChevronRight, AlertCircle, Clock, CheckCircle2, RefreshCw, Repeat, Cherry } from 'lucide-react';

// Render a date-only (YYYY-MM-DD) string without a timezone shift (new Date on a
// bare date parses as UTC midnight, showing the prior day in negative-UTC zones).
const fmtDate = (dateStr: string) => {
  const d = /^\d{4}-\d{2}-\d{2}$/.test(dateStr) ? new Date(dateStr + 'T00:00:00') : new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

interface ExpenseListProps {
  expenses: Expense[];
  group: Group;
  activeUser: string;
  onExpenseClick: (expense: Expense) => void;
}

type SortField = 'date' | 'amount' | 'title';
type SortOrder = 'asc' | 'desc';

export default function ExpenseList({ expenses, group, activeUser, onExpenseClick }: ExpenseListProps) {
  const categories = group.categories || [];
  const members = useMemo(() => getFullMembers(group), [group]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'OPEN' | 'PARTIALLY_SETTLED' | 'CLOSED'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  // The ledger shows at most PAGE_SIZE rows at a time; "Show more" reveals the
  // next batch so old unsettled items stay reachable without flooding the page.
  const PAGE_SIZE = 10;
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  // Sort and Filter logic
  const filteredExpenses = expenses
    .filter(exp => {
      // Search
      const matchesSearch = exp.title.toLowerCase().includes(search.toLowerCase()) || 
                            exp.category.toLowerCase().includes(search.toLowerCase());
      // Status
      const matchesStatus = statusFilter === 'all' || getNormalizedExpenseStatus(exp) === statusFilter;
      // Category
      const matchesCategory = categoryFilter === 'all' || exp.category === categoryFilter;

      return matchesSearch && matchesStatus && matchesCategory;
    })
    .sort((a, b) => {
      let multiplier = sortOrder === 'desc' ? -1 : 1;
      
      if (sortField === 'date') {
        return multiplier * (new Date(a.date).getTime() - new Date(b.date).getTime());
      }
      if (sortField === 'amount') {
        return multiplier * (a.amount - b.amount);
      }
      if (sortField === 'title') {
        return multiplier * a.title.localeCompare(b.title);
      }
      return 0;
    });

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  // Helper to format currency
  const formatCurrency = (val: number) => {
    return val.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
  };

  const getCategoryColor = (_category: string) => {
    // Brand system: one hue only. Category chips are uniform neutral zinc.
    return 'text-natural-muted bg-natural-sidebar border-natural-border';
  };

  return (
    <div className="bg-white rounded-3xl border border-natural-border shadow-sm overflow-hidden" id="expense-list-section">
      {/* Controls Header */}
      <div className="p-5 border-b border-natural-border space-y-4" id="list-controls-header">
        <div className="flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
          <h2 className="text-xl font-display font-semibold text-natural-text">Itemized Transactions</h2>
          
          {/* Quick Filters */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0" id="status-filters">
            {(['all', 'OPEN', 'PARTIALLY_SETTLED', 'CLOSED'] as const).map((status) => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-xl whitespace-nowrap transition-all cursor-pointer ${
                  statusFilter === status
                    ? 'bg-natural-primary text-white shadow-sm'
                    : 'text-natural-muted hover:text-natural-text bg-natural-sidebar/60 hover:bg-natural-sidebar'
                }`}
                id={`filter-status-${status}`}
              >
                {status === 'all'
                  ? 'All Items'
                  : status === 'OPEN'
                    ? 'Open'
                    : status === 'PARTIALLY_SETTLED'
                      ? 'Partially Settled'
                      : 'Fully Settled'}
              </button>
            ))}
          </div>
        </div>

        {/* Search & Select Filters Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3" id="advanced-filters-grid">
          {/* Search bar */}
          <div className="relative col-span-1 sm:col-span-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-natural-muted h-4 w-4" />
            <input
              type="text"
              placeholder="Search items..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-natural-bg/50 hover:bg-natural-bg focus:bg-white border border-natural-border focus:border-natural-primary rounded-xl text-natural-text placeholder-natural-muted/60 font-sans text-xs outline-none transition-all"
              id="search-input"
            />
          </div>

          {/* Category Filter */}
          <div className="relative">
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="w-full px-3 py-2 bg-natural-bg/50 hover:bg-natural-bg focus:bg-white border border-natural-border focus:border-natural-primary rounded-xl text-natural-text font-sans text-xs outline-none transition-all appearance-none cursor-pointer"
              id="category-filter-select"
            >
              <option value="all">All Categories</option>
              {categories.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>

          {/* Sort Toggles */}
          <div className="flex items-center gap-2" id="sort-actions-group">
            <button
              onClick={() => toggleSort('date')}
              className={`flex-1 py-2 px-2.5 text-xs font-semibold rounded-xl border flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                sortField === 'date'
                  ? 'border-natural-primary bg-natural-sage/30 text-natural-primary font-bold'
                  : 'border-natural-border text-natural-muted hover:bg-natural-sidebar/50'
              }`}
              id="sort-date-btn"
            >
              <ArrowUpDown className="h-3 w-3" /> Date {sortField === 'date' && (sortOrder === 'asc' ? '↑' : '↓')}
            </button>
            <button
              onClick={() => toggleSort('amount')}
              className={`flex-1 py-2 px-2.5 text-xs font-semibold rounded-xl border flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                sortField === 'amount'
                  ? 'border-natural-primary bg-natural-sage/30 text-natural-primary font-bold'
                  : 'border-natural-border text-natural-muted hover:bg-natural-sidebar/50'
              }`}
              id="sort-amount-btn"
            >
              <ArrowUpDown className="h-3 w-3" /> Amount {sortField === 'amount' && (sortOrder === 'asc' ? '↑' : '↓')}
            </button>
          </div>
        </div>
      </div>

      {/* Expenses Table/List */}
      <div className="divide-y divide-natural-border" id="expense-list-items">
        {filteredExpenses.length === 0 ? (
          <div className="p-12 text-center" id="empty-list-state">
            <AlertCircle className="h-10 w-10 text-natural-muted mx-auto mb-3" />
            <p className="text-natural-text font-semibold text-sm">No expenses found</p>
            <p className="text-natural-muted text-xs mt-1">Try relaxing your search terms or filters.</p>
            {(statusFilter !== 'all' || categoryFilter !== 'all' || search.trim() !== '') && (
              <button
                onClick={() => { setStatusFilter('all'); setCategoryFilter('all'); setSearch(''); }}
                className="mt-3 text-natural-primary hover:underline text-xs font-bold inline-flex items-center gap-1"
              >
                <RefreshCw className="h-3 w-3" /> Clear filters
              </button>
            )}
          </div>
        ) : (
          filteredExpenses.slice(0, visibleCount).map((exp) => {
            const payerMember = members.find(m => m.uid === exp.paidBy);
            const payerName = payerMember?.name || 'Unknown';
            const isPayerActive = exp.paidBy === activeUser;
            const isFullySettled = isExpenseFullySettled(exp);
            const myRemainingBalance = getRemainingSettlementAmount(exp, activeUser, false);
            const totalRemainingToPayer = getTotalRemainingOwedToPayer(exp, false);
            // Dark Cherry: only its creator ever sees numbers.
            const isDark = isDarkCherry(exp);
            const maskNumbers = isDark && !isPayerActive;

            let balanceText = '';
            let balanceStyle = '';

            if (isFullySettled) {
              balanceText = 'Fully Settled';
              balanceStyle = 'text-natural-primary bg-natural-sage border-natural-primary/20 font-semibold';
            } else if (isDark) {
              if (isPayerActive) {
                balanceText = `Pot: $${getDarkCherryRemaining(exp, false).toFixed(2)} to go`;
                balanceStyle = 'text-natural-primary bg-natural-sidebar border-natural-border font-semibold';
              } else {
                balanceText = 'Chip in when you can';
                balanceStyle = 'text-natural-text bg-natural-sidebar border-natural-border/20 font-semibold';
              }
            } else if (isPayerActive) {
              if (totalRemainingToPayer > 0.01) {
                balanceText = `Others owe you $${totalRemainingToPayer.toFixed(2)}`;
                balanceStyle = 'text-natural-primary bg-natural-sidebar border-natural-border font-semibold';
              } else {
                balanceText = 'No balance for you';
                balanceStyle = 'text-natural-muted bg-natural-sidebar border-natural-border font-semibold';
              }
            } else if (myRemainingBalance > 0.01) {
              balanceText = `You owe ${payerName} $${myRemainingBalance.toFixed(2)}`;
              balanceStyle = 'text-natural-text bg-natural-sidebar border-natural-border/20 font-semibold';
            } else {
              balanceText = 'No balance for you';
              balanceStyle = 'text-natural-muted bg-natural-sidebar border-natural-border font-semibold';
            }

            return (
              <div
                key={exp.id}
                onClick={() => onExpenseClick(exp)}
                className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-0 sm:justify-between hover:bg-natural-sidebar/30 cursor-pointer transition-all group"
                id={`expense-row-${exp.id}`}
              >
                <div className="flex items-start gap-3 sm:gap-4 min-w-0 flex-1">
                  {/* Status indicator ring */}
                  <div className="mt-0.5 shrink-0" id={`status-ring-${exp.id}`}>
                    {/* Cherry means money is outstanding, so open is the
                        loudest and closed is the quietest. This used to run
                        the other way, pointing the eye at the rows that
                        needed nothing. */}
                    {getNormalizedExpenseStatus(exp) === 'CLOSED' ? (
                      <div className="p-2 bg-natural-pebble text-natural-muted rounded-full border border-natural-border">
                        <CheckCircle2 className="h-4 w-4" />
                      </div>
                    ) : getNormalizedExpenseStatus(exp) === 'PARTIALLY_SETTLED' ? (
                      <div className="p-2 bg-natural-pebble text-natural-primary rounded-full border border-natural-primary/25 animate-pulse">
                        <Clock className="h-4 w-4" />
                      </div>
                    ) : (
                      <div className="p-2 bg-natural-primary-wash text-natural-primary rounded-full border border-natural-primary/30">
                        <AlertCircle className="h-4 w-4" />
                      </div>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className="text-sm font-semibold text-natural-text group-hover:text-natural-dark truncate max-w-full">
                        {exp.title}
                      </span>
                      <span className={`text-[10px] font-bold border px-2 py-0.5 rounded-md uppercase tracking-wider ${getCategoryColor(exp.category)}`}>
                        {exp.category}
                      </span>
                      {exp.isRecurring && (
                        <span role="img" aria-label={`Recurring: ${exp.recurringInterval}`} className="text-[10px] font-bold text-natural-primary bg-natural-primary/10 border border-natural-primary/20 px-1.5 py-0.5 rounded-md flex items-center gap-1" title={`Recurring: ${exp.recurringInterval}`}>
                          <Repeat size={10} />
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-natural-muted">
                      <span className="font-mono">{fmtDate(exp.date)}</span>
                      <span className="text-natural-border">•</span>
                      <span>Paid by <strong className="capitalize text-natural-text font-medium">{payerName}</strong></span>
                      <span className="text-natural-border">•</span>
                      <span className="font-mono text-[11px]">
                        {isDark
                          ? 'Dark Cherry · blind split'
                          : <>Split: {members.map(m => `${m.name} ${Math.round(((exp.shares?.[m.uid] || 0) / exp.amount) * 100) || 0}%`).join(' / ')}
                            {exp.splitType === 'third_party' && ` / ${exp.thirdPersonName} ${Math.round(((exp.thirdPersonShare || 0) / exp.amount) * 100) || 0}%`}</>}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Right (desktop) / bottom (mobile): amount + share balance */}
                <div className="flex items-center justify-between gap-3 pl-11 sm:pl-4 sm:justify-end sm:gap-4 sm:shrink-0" id={`expense-balance-${exp.id}`}>
                  <div className="sm:text-right">
                    <span className="block text-base font-display font-semibold text-natural-text">
                      {maskNumbers
                        ? <span className="inline-flex items-center gap-1"><Cherry className="h-4 w-4 text-natural-primary" /> •••</span>
                        : formatCurrency(exp.amount)}
                    </span>
                    <span className={`inline-block text-[10px] px-2 py-0.5 rounded-lg border mt-1 ${balanceStyle}`}>
                      {balanceText}
                    </span>
                  </div>
                  <ChevronRight className="hidden sm:block h-5 w-5 text-natural-border group-hover:text-natural-primary group-hover:translate-x-0.5 transition-all shrink-0" />
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Show more (list is capped at PAGE_SIZE rows at a time) */}
      {filteredExpenses.length > visibleCount && (
        <div className="p-3 border-t border-natural-border text-center">
          <button
            onClick={() => setVisibleCount(c => c + PAGE_SIZE)}
            className="text-xs font-bold text-natural-primary hover:text-natural-dark bg-natural-sage/30 hover:bg-natural-sage/50 border border-natural-primary/20 px-5 py-2 rounded-full transition-all cursor-pointer"
            id="show-more-expenses-btn"
          >
            Show more ({filteredExpenses.length - visibleCount} more)
          </button>
        </div>
      )}

      {/* Stats Counter Footer */}
      {filteredExpenses.length > 0 && (
        <div className="p-4 bg-natural-sidebar/30 border-t border-natural-border flex items-center justify-between text-xs text-natural-muted rounded-b-3xl" id="list-footer-stats">
          <span className="font-medium font-mono">Showing {Math.min(visibleCount, filteredExpenses.length)} of {expenses.length} expense items</span>
          {(statusFilter !== 'all' || categoryFilter !== 'all' || search.trim() !== '') && (
            <button 
              onClick={() => { setStatusFilter('all'); setCategoryFilter('all'); setSearch(''); }}
              className="text-natural-text hover:text-natural-primary font-bold flex items-center gap-1 cursor-pointer"
              id="clear-filters-footer-btn"
            >
              <RefreshCw className="h-3 w-3" /> Clear filters
            </button>
          )}
        </div>
      )}
    </div>
  );
}
