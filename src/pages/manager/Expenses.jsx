// File: src/pages/manager/Expenses.jsx
// Purpose: Expense management with categories, approval workflow

import React, { useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Receipt, Plus, CheckCircle, XCircle, X, Loader2, FileText } from 'lucide-react';
import { toast } from 'react-hot-toast';
import managerService from '../../services/managerService';
import { EXPENSE_CATEGORIES } from '../../utils/constants';
import { formatPKR, getRelativeTime } from '../../utils/managerHelpers';
import useManagerData from '../../hooks/useManagerData';
import { useLanguage } from '../../hooks/useLanguage';
import DataTable from '../../components/manager/DataTable';
import AdvancedFilters from '../../components/manager/AdvancedFilters';
import ExportMenu from '../../components/manager/ExportMenu';
import StatCard from '../../components/manager/StatCard';

const ExpenseForm = ({ isOpen, onClose, onSaved }) => {
  const { t } = useLanguage();
  const [form, setForm] = useState({ amount: '', category: 'utilities', description: '', date: new Date().toISOString().slice(0, 10) });
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!form.amount || Number(form.amount) <= 0) {
      toast.error(t('manager.common.validAmountRequired', 'Valid amount required'));
      return;
    }
    setLoading(true);
    try {
      const res = await managerService.addExpense(form);
      if (res.success) {
        toast.success(t('manager.expensesPage.addedSuccess', 'Expense added successfully'));
        setForm({ amount: '', category: 'utilities', description: '', date: new Date().toISOString().slice(0, 10) });
        onSaved?.();
        onClose();
      }
    } catch (err) { toast.error(err.message); }
    finally { setLoading(false); }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
          <motion.div initial={{ scale: 0.95, y: 16 }} animate={{ scale: 1, y: 0 }}
            className="w-full max-w-md rounded-2xl border border-[#2a1f0d] bg-[#12100a]"
          >
            <div className="flex justify-between items-center p-4 border-b border-[#2a1f0d]">
              <h3 className="text-base font-bold text-gray-100">{t('manager.expensesPage.addExpense', 'Add Expense')}</h3>
              <button onClick={onClose} className="p-2 rounded-lg hover:bg-[#2a1f0d] text-gray-400"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <label className="text-xs text-gray-400 mb-1 block">{t('manager.expensesPage.amountLabel', 'Amount *')}</label>
                <input type="number" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })}
                  className="w-full rounded-xl border border-[#2a1f0d] bg-[#0a0805] px-3 py-2 text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-amber-500/50" />
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">{t('manager.common.category', 'Category')}</label>
                <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}
                  className="w-full rounded-xl border border-[#2a1f0d] bg-[#0a0805] px-3 py-2 text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-amber-500/50">
                  {EXPENSE_CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">{t('manager.common.date', 'Date')}</label>
                <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })}
                  className="w-full rounded-xl border border-[#2a1f0d] bg-[#0a0805] px-3 py-2 text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-amber-500/50" />
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">{t('manager.common.description', 'Description')}</label>
                <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={3}
                  className="w-full rounded-xl border border-[#2a1f0d] bg-[#0a0805] px-3 py-2 text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-amber-500/50 resize-none" />
              </div>
            </div>
            <div className="p-3 border-t border-[#2a1f0d] flex gap-2">
              <button onClick={onClose} disabled={loading} className="flex-1 rounded-xl border border-[#2a1f0d] bg-[#1a1208] py-2.5 text-sm text-gray-400">{t('manager.common.cancel', 'Cancel')}</button>
              <button onClick={submit} disabled={loading} className="flex-1 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 py-2.5 text-sm font-semibold text-[#1a1208] flex items-center justify-center gap-2">
                {loading && <Loader2 className="w-4 h-4 animate-spin" />} {t('manager.expensesPage.addExpense', 'Add Expense')}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

const Expenses = () => {
  const { t } = useLanguage();
  const [filters, setFilters] = useState({ search: '', status: '', category: '', from: '', to: '' });
  const [formOpen, setFormOpen] = useState(false);

  const loader = useCallback(() => managerService.listExpenses(filters), [filters]);
  const { data, loading, refresh } = useManagerData(loader, [filters]);

  const expenses = useMemo(() => {
    let list = data || [];
    if (filters.search) {
      const q = filters.search.toLowerCase();
      list = list.filter(e => (e.description || '').toLowerCase().includes(q) || (e.category || '').toLowerCase().includes(q));
    }
    return list;
  }, [data, filters.search]);

  const stats = useMemo(() => {
    const totalAmount = expenses.reduce((s, e) => s + Number(e.amount || 0), 0);
    const pending = expenses.filter(e => e.status === 'pending').length;
    const approved = expenses.filter(e => e.status === 'approved').length;
    return { totalAmount, pending, approved, count: expenses.length };
  }, [expenses]);

  const handleApprove = async (e) => {
    const res = await managerService.approveExpense(e.expenseId);
    if (res.success) { toast.success(t('manager.expensesPage.approved', 'Expense approved')); refresh(); }
    else toast.error(res.error);
  };

  const handleReject = async (e) => {
    const reason = window.prompt(t('manager.expensesPage.rejectPrompt', 'Rejection reason?'));
    if (!reason) return;
    const res = await managerService.rejectExpense(e.expenseId, reason);
    if (res.success) { toast.success(t('manager.expensesPage.rejected', 'Expense rejected')); refresh(); }
  };

  const getCategoryLabel = (id) => EXPENSE_CATEGORIES.find(c => c.id === id)?.label || id;

  const statusLabel = (status) => {
    if (status === 'approved') return t('manager.common.approved', 'Approved');
    if (status === 'rejected') return t('manager.common.rejected', 'Rejected');
    return t('manager.common.pending', 'Pending');
  };

  const columns = useMemo(() => [
    {
      label: t('manager.common.date', 'Date'), field: 'createdAt',
      render: (r) => <span className="text-xs text-gray-400">{getRelativeTime(r.createdAt)}</span>,
    },
    {
      label: t('manager.common.category', 'Category'), field: 'category',
      render: (r) => <span className="text-xs text-gray-300">{getCategoryLabel(r.category)}</span>,
    },
    { label: t('manager.common.description', 'Description'), field: 'description', render: (r) => <span className="text-xs text-gray-400">{r.description || '—'}</span> },
    {
      label: t('manager.common.amount', 'Amount'), field: 'amount', align: 'right',
      render: (r) => <span className="text-sm font-semibold text-gray-100">{formatPKR(r.amount)}</span>,
    },
    {
      label: t('manager.common.status', 'Status'), field: 'status', sortable: false,
      render: (r) => {
        const colors = { pending: 'bg-orange-500/15 text-orange-400', approved: 'bg-green-500/15 text-green-400', rejected: 'bg-red-500/15 text-red-400' };
        return <span className={'text-[10px] px-2 py-0.5 rounded-full ' + (colors[r.status] || colors.pending)}>{statusLabel(r.status)}</span>;
      },
    },
    {
      label: t('manager.common.action', 'Action'), sortable: false, align: 'right',
      render: (r) => r.status === 'pending' && (
        <div className="flex gap-1 justify-end">
          <button onClick={() => handleApprove(r)} className="p-1.5 rounded-lg text-green-400 hover:bg-green-500/10"><CheckCircle className="w-3.5 h-3.5" /></button>
          <button onClick={() => handleReject(r)} className="p-1.5 rounded-lg text-red-400 hover:bg-red-500/10"><XCircle className="w-3.5 h-3.5" /></button>
        </div>
      ),
    },
  ], [t]);

  const mobileCard = (r) => (
    <div className="p-3 rounded-xl border border-[#2a1f0d] bg-[#1a1208]">
      <div className="flex justify-between items-start mb-2">
        <div>
          <p className="text-sm font-bold text-gray-100">{formatPKR(r.amount)}</p>
          <p className="text-xs text-gray-400">{getCategoryLabel(r.category)}</p>
          <p className="text-[10px] text-gray-500">{getRelativeTime(r.createdAt)}</p>
        </div>
        <span className={'text-[10px] px-2 py-0.5 rounded-full ' + ({ pending: 'bg-orange-500/15 text-orange-400', approved: 'bg-green-500/15 text-green-400', rejected: 'bg-red-500/15 text-red-400' }[r.status])}>{statusLabel(r.status)}</span>
      </div>
      <p className="text-xs text-gray-400 mb-2">{r.description || '—'}</p>
      {r.status === 'pending' && (
        <div className="flex gap-2">
          <button onClick={() => handleApprove(r)} className="flex-1 py-1.5 rounded-lg bg-green-500/15 text-green-400 text-xs">{t('manager.common.approve', 'Approve')}</button>
          <button onClick={() => handleReject(r)} className="flex-1 py-1.5 rounded-lg bg-red-500/15 text-red-400 text-xs">{t('manager.common.reject', 'Reject')}</button>
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <h2 className="text-xl font-bold text-gray-100 flex items-center gap-2">
          <Receipt className="w-5 h-5 text-amber-500" /> {t('manager.expensesPage.title', 'Expenses')}
        </h2>
        <div className="flex gap-2">
          <ExportMenu data={expenses.map(e => ({ Date: (e.createdAt || '').slice(0, 10), Category: getCategoryLabel(e.category), Description: e.description, Amount: Number(e.amount || 0), Status: e.status }))} filename="expenses" />
          <button onClick={() => setFormOpen(true)} className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 px-3 py-2 text-xs font-semibold text-[#1a1208]">
            <Plus className="w-3.5 h-3.5" /> {t('manager.expensesPage.addExpense', 'Add Expense')}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label={t('manager.expensesPage.statCount', 'Total')} value={stats.count} icon={FileText} color="amber" loading={loading} />
        <StatCard label={t('manager.expensesPage.statAmount', 'Amount')} value={stats.totalAmount} prefix="Rs " icon={Receipt} color="purple" loading={loading} />
        <StatCard label={t('manager.expensesPage.statPending', 'Pending')} value={stats.pending} icon={Loader2} color="orange" loading={loading} />
        <StatCard label={t('manager.expensesPage.statApproved', 'Approved')} value={stats.approved} icon={CheckCircle} color="green" loading={loading} />
      </div>

      <AdvancedFilters
        searchValue={filters.search}
        onSearchChange={(v) => setFilters(f => ({ ...f, search: v }))}
        searchPlaceholder={t('manager.expensesPage.searchPh', 'Search expenses…')}
        dateFrom={filters.from}
        dateTo={filters.to}
        onDateChange={(d) => setFilters(f => ({ ...f, from: d.from, to: d.to }))}
        onReset={() => setFilters({ search: '', status: '', category: '', from: '', to: '' })}
        resultCount={expenses.length}
        customFilters={[
          {
            key: 'status', label: t('manager.common.status', 'Status'), value: filters.status,
            options: [
              { value: 'pending', label: t('manager.common.pending', 'Pending') },
              { value: 'approved', label: t('manager.common.approved', 'Approved') },
              { value: 'rejected', label: t('manager.common.rejected', 'Rejected') },
            ],
            onChange: (v) => setFilters(f => ({ ...f, status: v })),
          },
          {
            key: 'category', label: t('manager.common.category', 'Category'), value: filters.category,
            options: EXPENSE_CATEGORIES.map(c => ({ value: c.id, label: c.label })),
            onChange: (v) => setFilters(f => ({ ...f, category: v })),
          },
        ]}
      />

      <DataTable
        columns={columns}
        data={expenses}
        loading={loading}
        emptyMessage={t('manager.expensesPage.noExpensesFound', 'No expenses found')}
        rowKey="expenseId"
        mobileCardRenderer={mobileCard}
        pageSize={25}
      />

      <ExpenseForm isOpen={formOpen} onClose={() => setFormOpen(false)} onSaved={refresh} />
    </div>
  );
};

export default Expenses;
