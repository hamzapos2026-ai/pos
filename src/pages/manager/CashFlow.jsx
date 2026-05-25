// File: src/pages/manager/CashFlow.jsx
// Purpose: Cash flow management — bills + manual + transfers
// FIXED v3.0: Responsive stats, no truncation, modern UI, full features
// Features: All Time default, advance filters, search, export, transfers

import React, { useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  DollarSign, Plus, Wallet, ArrowDownCircle, ArrowUpCircle,
  RefreshCcw, CheckCircle, X, Loader2, TrendingUp, TrendingDown,
  Receipt, RefreshCw, Building2, User, Calendar,
  AlertCircle, BarChart3, Filter, Search,
} from 'lucide-react';
import toast from 'react-hot-toast';
import managerService from '../../services/managerService';
import { formatPKR, getRelativeTime } from '../../utils/managerHelpers';
import useManagerData from '../../hooks/useManagerData';
import DataTable from '../../components/manager/DataTable';
import AdvancedFilters from '../../components/manager/AdvancedFilters';
import ExportMenu from '../../components/manager/ExportMenu';
import ConfirmDialog from '../../components/manager/ConfirmDialog';

// ════════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════════

// Format big numbers in short form
const fmtShort = (v) => {
  const n = Number(v || 0);
  if (n >= 10000000) return `${(n / 10000000).toFixed(2)}Cr`;
  if (n >= 100000)   return `${(n / 100000).toFixed(2)}L`;
  if (n >= 1000)     return `${(n / 1000).toFixed(1)}K`;
  return n.toLocaleString('en-PK');
};

const getExtendedPresets = () => {
  const now = new Date();
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
  const last7 = new Date(today); last7.setDate(last7.getDate() - 7);
  const last30 = new Date(today); last30.setMonth(last30.getMonth() - 1);
  const fmt = (d) => d.toISOString().slice(0, 10);

  return {
    today:      { label: 'Today',        from: fmt(today),     to: fmt(now)       },
    yesterday:  { label: 'Yesterday',    from: fmt(yesterday), to: fmt(yesterday) },
    last7days:  { label: 'Last 7 Days',  from: fmt(last7),     to: fmt(now)       },
    last30days: { label: 'Last 30 Days', from: fmt(last30),    to: fmt(now)       },
    all:        { label: 'All Time',     from: '2020-01-01',   to: '2099-12-31'   },
  };
};

// ════════════════════════════════════════════════════════════
// SMART STAT CARD — Auto-shrinks text, full responsive
// ════════════════════════════════════════════════════════════
const SmartStatCard = ({ label, value, icon: Icon, color, subtitle, trend }) => {
  const COLORS = {
    blue:   { bg: 'bg-blue-500/10',   text: 'text-blue-400',   border: 'border-blue-500/20',   icon: 'bg-blue-500/15'   },
    green:  { bg: 'bg-green-500/10',  text: 'text-green-400',  border: 'border-green-500/20',  icon: 'bg-green-500/15'  },
    red:    { bg: 'bg-red-500/10',    text: 'text-red-400',    border: 'border-red-500/20',    icon: 'bg-red-500/15'    },
    amber:  { bg: 'bg-amber-500/10',  text: 'text-amber-400',  border: 'border-amber-500/20',  icon: 'bg-amber-500/15'  },
    cyan:   { bg: 'bg-cyan-500/10',   text: 'text-cyan-400',   border: 'border-cyan-500/20',   icon: 'bg-cyan-500/15'   },
    orange: { bg: 'bg-orange-500/10', text: 'text-orange-400', border: 'border-orange-500/20', icon: 'bg-orange-500/15' },
  };
  const c = COLORS[color] || COLORS.blue;
  const numValue = Number(value || 0);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -2 }}
      className={`
        relative overflow-hidden rounded-xl border ${c.border}
        bg-gradient-to-br from-[#1a1208] to-[#12100a]
        p-3 sm:p-4 transition-all hover:shadow-lg hover:shadow-amber-500/5
      `}
    >
      {/* Background glow */}
      <div className={`absolute -top-8 -right-8 h-24 w-24 rounded-full ${c.bg} blur-2xl opacity-40`} />

      <div className="relative">
        {/* Header */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="min-w-0 flex-1">
            <p className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-gray-500 truncate">
              {label}
            </p>
          </div>
          <div className={`h-7 w-7 sm:h-8 sm:w-8 rounded-lg ${c.icon} flex items-center justify-center shrink-0`}>
            <Icon className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${c.text}`} />
          </div>
        </div>

        {/* Value — responsive font size */}
        <div className="space-y-0.5">
          <p className={`font-bold text-gray-100 leading-tight ${
            numValue >= 10000000 ? 'text-base sm:text-lg' :
            numValue >= 1000000  ? 'text-lg sm:text-xl'  :
            numValue >= 100000   ? 'text-xl sm:text-2xl' :
                                   'text-xl sm:text-2xl'
          }`}>
            <span className="text-[10px] sm:text-xs text-gray-500 mr-0.5">Rs</span>
            {fmtShort(numValue)}
          </p>

          {/* Subtitle */}
          {subtitle && (
            <p className="text-[9px] sm:text-[10px] text-gray-500 truncate">
              {subtitle}
            </p>
          )}

          {/* Trend */}
          {trend && (
            <div className="flex items-center gap-1 mt-1">
              <TrendingUp className={`w-2.5 h-2.5 ${trend > 0 ? 'text-green-400' : 'text-red-400 rotate-180'}`} />
              <span className={`text-[9px] font-semibold ${trend > 0 ? 'text-green-400' : 'text-red-400'}`}>
                {Math.abs(trend)}%
              </span>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
};

// ════════════════════════════════════════════════════════════
// TRANSACTION FORM MODAL
// ════════════════════════════════════════════════════════════
const TransactionForm = ({ isOpen, onClose, onSaved }) => {
  const [form, setForm] = useState({
    type: 'receive',
    amount: '',
    reason: '',
    storeId: '',
    toUserName: '',
  });
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!form.amount || Number(form.amount) <= 0) {
      toast.error('Valid amount required');
      return;
    }
    if (!form.reason?.trim()) {
      toast.error('Reason is required');
      return;
    }
    setLoading(true);
    try {
      const res = await managerService.addCashTransaction(form);
      if (res.success) {
        toast.success('Transaction recorded successfully');
        setForm({ type: 'receive', amount: '', reason: '', storeId: '', toUserName: '' });
        onSaved?.();
        onClose();
      } else {
        toast.error(res.error || 'Failed to save');
      }
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const TYPE_OPTIONS = [
    { value: 'receive',  label: 'Receive',  desc: 'Cash IN',   icon: ArrowDownCircle, color: 'green'  },
    { value: 'handover', label: 'Handover', desc: 'To Admin',  icon: ArrowUpCircle,   color: 'red'    },
    { value: 'transfer', label: 'Transfer', desc: 'To User',   icon: RefreshCcw,      color: 'blue'   },
    { value: 'expense',  label: 'Expense',  desc: 'Cash OUT',  icon: TrendingDown,    color: 'orange' },
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-3 sm:p-4"
          onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
          <motion.div
            initial={{ scale: 0.95, y: 16 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 16 }}
            className="w-full max-w-md rounded-2xl border border-[#2a1f0d] bg-[#12100a] shadow-2xl overflow-hidden"
          >
            {/* Header with gradient */}
            <div className="relative overflow-hidden border-b border-[#2a1f0d] p-4 bg-gradient-to-r from-amber-500/5 to-transparent">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2.5">
                  <div className="h-9 w-9 rounded-xl bg-amber-500/15 flex items-center justify-center">
                    <DollarSign className="w-4 h-4 text-amber-400" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-gray-100">New Transaction</h3>
                    <p className="text-[10px] text-gray-500">Record cash movement</p>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="p-2 rounded-lg hover:bg-[#2a1f0d] text-gray-400 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="p-4 space-y-4 max-h-[70vh] overflow-y-auto">
              {/* Type selector */}
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2 block">
                  Transaction Type
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {TYPE_OPTIONS.map((t) => {
                    const Icon = t.icon;
                    const active = form.type === t.value;
                    return (
                      <button
                        key={t.value}
                        onClick={() => setForm({ ...form, type: t.value })}
                        className={`
                          flex items-center gap-2.5 p-3 rounded-xl border transition-all
                          ${active
                            ? `bg-${t.color}-500/15 border-${t.color}-500/40 text-${t.color}-400`
                            : 'bg-[#0a0805] border-[#2a1f0d] text-gray-500 hover:text-gray-300 hover:border-gray-700'}
                        `}
                      >
                        <Icon className="w-4 h-4 shrink-0" />
                        <div className="text-left min-w-0">
                          <p className="text-xs font-semibold truncate">{t.label}</p>
                          <p className="text-[9px] opacity-70 truncate">{t.desc}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Amount */}
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5 block">
                  Amount
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-gray-500">
                    Rs
                  </span>
                  <input
                    type="number"
                    value={form.amount}
                    onChange={(e) => setForm({ ...form, amount: e.target.value })}
                    placeholder="0.00"
                    className="w-full rounded-xl border border-[#2a1f0d] bg-[#0a0805] pl-10 pr-3 py-3 text-base font-bold text-gray-100 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/30 transition-all"
                  />
                </div>
              </div>

              {/* Reason */}
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5 block">
                  Reason / Description
                </label>
                <input
                  value={form.reason}
                  onChange={(e) => setForm({ ...form, reason: e.target.value })}
                  placeholder="Why this transaction?"
                  className="w-full rounded-xl border border-[#2a1f0d] bg-[#0a0805] px-3 py-2.5 text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/30"
                />
              </div>

              {/* Conditional fields */}
              {form.type === 'transfer' && (
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5 block">
                    Transfer To (User Name)
                  </label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                    <input
                      value={form.toUserName}
                      onChange={(e) => setForm({ ...form, toUserName: e.target.value })}
                      placeholder="Recipient name"
                      className="w-full rounded-xl border border-[#2a1f0d] bg-[#0a0805] pl-10 pr-3 py-2.5 text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5 block">
                  Branch ID <span className="text-gray-600 normal-case font-normal">(optional)</span>
                </label>
                <div className="relative">
                  <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                  <input
                    value={form.storeId}
                    onChange={(e) => setForm({ ...form, storeId: e.target.value })}
                    placeholder="Defaults to primary branch"
                    className="w-full rounded-xl border border-[#2a1f0d] bg-[#0a0805] pl-10 pr-3 py-2.5 text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                  />
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="p-3 border-t border-[#2a1f0d] bg-[#0a0805]/50 flex gap-2">
              <button
                onClick={onClose}
                disabled={loading}
                className="flex-1 rounded-xl border border-[#2a1f0d] bg-[#1a1208] py-2.5 text-sm font-medium text-gray-400 hover:text-gray-200 hover:border-gray-700 transition-all disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={submit}
                disabled={loading || !form.amount || !form.reason}
                className="flex-[2] rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 py-2.5 text-sm font-bold text-[#1a1208] flex items-center justify-center gap-2 disabled:opacity-50 transition-all shadow-lg shadow-amber-500/20"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                Save Transaction
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

// ════════════════════════════════════════════════════════════
// MAIN CASH FLOW PAGE
// ════════════════════════════════════════════════════════════
const CashFlow = () => {
  const PRESETS = useMemo(() => getExtendedPresets(), []);

  const [dateRange, setDateRange]       = useState(PRESETS.all);
  const [filters, setFilters]           = useState({ search: '', type: '' });
  const [formOpen, setFormOpen]         = useState(false);
  const [confirmReconcile, setConfirmReconcile] = useState(null);

  // ── Loaders ──────────────────────────────────────────────
  const txLoader = useCallback(
    () => managerService.listCashTransactions(null, {
      from: dateRange.from,
      to:   dateRange.to,
      type: filters.type || undefined,
    }),
    [dateRange.from, dateRange.to, filters.type]
  );

  const summaryLoader = useCallback(
    () => managerService.getCashSummary(null, null),
    []
  );

  const {
    data: txs,
    loading: loadingTx,
    refresh: refreshTx,
  } = useManagerData(txLoader, [dateRange, filters.type]);

  const {
    data: summary,
    refresh: refreshSummary,
  } = useManagerData(summaryLoader, [], {
    autoRefresh: true,
    refreshInterval: 60000,
  });

  // ── Filtered transactions ─────────────────────────────────
  const transactions = useMemo(() => {
    let list = txs || [];
    if (filters.search) {
      const q = filters.search.toLowerCase();
      list = list.filter((t) =>
        (t.reason   || '').toLowerCase().includes(q) ||
        (t.type     || '').toLowerCase().includes(q) ||
        (t.storeId  || '').toLowerCase().includes(q) ||
        (t.userName || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [txs, filters.search]);

  // ── Compute summary from current transactions ─────────────
  const computedSummary = useMemo(() => {
    let received = 0, paid = 0, transferred = 0, expenses = 0;
    let cashFromBills = 0, billsCount = 0, manualCount = 0;

    (txs || []).forEach((t) => {
      const amt = Number(t.amount || 0);
      const isBill = t.isFromBill || t.billId;

      switch (t.type) {
        case 'receive':
        case 'deposit':
          received += amt;
          if (isBill) { cashFromBills += amt; billsCount++; }
          else manualCount++;
          break;
        case 'handover':
        case 'withdrawal':
          paid += amt; manualCount++; break;
        case 'transfer':
          transferred += amt; manualCount++; break;
        case 'expense':
          expenses += amt; manualCount++; break;
        default:
          manualCount++;
      }
    });

    const openingBalance = summary?.openingBalance || 0;
    const closingBalance = openingBalance + received - paid - transferred - expenses;

    return {
      openingBalance,
      received,
      paid,
      transferred,
      expenses,
      closingBalance,
      cashFromBills,
      billsCount,
      transactionCount: (txs || []).length,
      manualCount,
      activeShift: summary?.activeShift || null,
    };
  }, [txs, summary]);

  // ── Helpers ───────────────────────────────────────────────
  const refresh = () => { refreshTx(); refreshSummary(); };

  const handleReconcile = async () => {
    if (!confirmReconcile) return;
    if (confirmReconcile.isFromBill || confirmReconcile.billId) {
      toast.error('Bill transactions auto-reconciled');
      setConfirmReconcile(null);
      return;
    }
    const res = await managerService.markCashTransactionReconciled(confirmReconcile.txId);
    if (res.success) {
      toast.success('Transaction reconciled');
      refresh();
    } else {
      toast.error(res.error || 'Failed');
    }
    setConfirmReconcile(null);
  };

  const getTypeStyle = (type) => ({
    receive:    { bg: 'bg-green-500/15',  text: 'text-green-400',  icon: ArrowDownCircle },
    deposit:    { bg: 'bg-green-500/15',  text: 'text-green-400',  icon: ArrowDownCircle },
    handover:   { bg: 'bg-red-500/15',    text: 'text-red-400',    icon: ArrowUpCircle   },
    withdrawal: { bg: 'bg-red-500/15',    text: 'text-red-400',    icon: ArrowUpCircle   },
    transfer:   { bg: 'bg-blue-500/15',   text: 'text-blue-400',   icon: RefreshCcw      },
    expense:    { bg: 'bg-orange-500/15', text: 'text-orange-400', icon: TrendingDown    },
    refund:     { bg: 'bg-purple-500/15', text: 'text-purple-400', icon: ArrowUpCircle   },
    commission: { bg: 'bg-pink-500/15',   text: 'text-pink-400',   icon: TrendingUp      },
  }[type] || { bg: 'bg-gray-500/15', text: 'text-gray-400', icon: DollarSign });

  // ── Table columns ─────────────────────────────────────────
  const columns = [
    {
      label: 'Type',
      field: 'type',
      render: (r) => {
        const s = getTypeStyle(r.type);
        const Icon = s.icon;
        const isBill = r.isFromBill || r.billId;
        return (
          <div className="flex items-center gap-1.5 flex-wrap">
            <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] font-bold uppercase ${s.bg} ${s.text}`}>
              <Icon className="w-3 h-3" />
              {r.type}
            </div>
            {isBill && (
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-400 font-semibold">
                <Receipt className="w-2.5 h-2.5 inline mr-0.5" />
                BILL
              </span>
            )}
          </div>
        );
      },
    },
    {
      label: 'Amount',
      field: 'amount',
      align: 'right',
      render: (r) => {
        const s = getTypeStyle(r.type);
        return (
          <span className={`text-sm font-bold font-mono ${s.text}`}>
            {formatPKR(r.amount)}
          </span>
        );
      },
    },
    {
      label: 'Reason',
      field: 'reason',
      render: (r) => (
        <span className="text-xs text-gray-400 line-clamp-2">{r.reason || '—'}</span>
      ),
    },
    {
      label: 'Operator',
      field: 'userName',
      render: (r) => (
        <div className="flex items-center gap-1.5">
          <div className="h-6 w-6 rounded-full bg-amber-500/15 flex items-center justify-center shrink-0">
            <User className="w-3 h-3 text-amber-400" />
          </div>
          <span className="text-xs text-gray-400 truncate max-w-[100px]">
            {r.userName || r.userId || '—'}
          </span>
        </div>
      ),
    },
    {
      label: 'Branch',
      field: 'storeId',
      render: (r) => (
        <div className="flex items-center gap-1">
          <Building2 className="w-3 h-3 text-gray-500" />
          <span className="text-[10px] text-gray-500 font-mono">
            {(r.storeId || '—').slice(0, 10)}
          </span>
        </div>
      ),
    },
    {
      label: 'Time',
      field: 'createdAt',
      render: (r) => (
        <span className="text-[10px] text-gray-500 whitespace-nowrap">
          {getRelativeTime(r.createdAt || r.timestamp)}
        </span>
      ),
    },
    {
      label: 'Status',
      sortable: false,
      align: 'center',
      render: (r) => {
        const isBill = r.isFromBill || r.billId;
        if (isBill) {
          return (
            <span className="inline-flex items-center gap-1 text-[10px] text-blue-400 font-semibold">
              <CheckCircle className="w-3 h-3" /> Auto
            </span>
          );
        }
        return r.reconciled ? (
          <span className="inline-flex items-center gap-1 text-[10px] text-green-400 font-semibold">
            <CheckCircle className="w-3 h-3" /> Done
          </span>
        ) : (
          <button
            onClick={(e) => { e.stopPropagation(); setConfirmReconcile(r); }}
            className="text-[10px] px-2 py-1 rounded-lg bg-amber-500/15 text-amber-400 hover:bg-amber-500/25 font-semibold transition-colors"
          >
            Reconcile
          </button>
        );
      },
    },
  ];

  // ── Mobile card renderer ──────────────────────────────────
  const mobileCard = (r) => {
    const s = getTypeStyle(r.type);
    const Icon = s.icon;
    const isBill = r.isFromBill || r.billId;
    return (
      <motion.div
        whileTap={{ scale: 0.98 }}
        className="p-3 rounded-xl border border-[#2a1f0d] bg-[#1a1208] hover:border-amber-500/20 transition-colors"
      >
        <div className="flex justify-between items-start mb-2.5">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${s.bg}`}>
              <Icon className={`w-5 h-5 ${s.text}`} />
            </div>
            <div className="min-w-0">
              <p className={`text-base font-bold font-mono ${s.text}`}>
                {formatPKR(r.amount)}
              </p>
              <p className="text-[10px] text-gray-500 capitalize font-medium">
                {r.type}
              </p>
            </div>
          </div>
          <div className="flex flex-col gap-1 items-end shrink-0">
            {isBill && (
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-400 font-bold">
                <Receipt className="w-2.5 h-2.5 inline mr-0.5" />
                BILL
              </span>
            )}
            {r.reconciled && !isBill && (
              <CheckCircle className="w-4 h-4 text-green-400" />
            )}
          </div>
        </div>

        <p className="text-xs text-gray-300 mb-2 line-clamp-2">{r.reason}</p>

        <div className="flex items-center justify-between text-[10px] text-gray-500 pt-2 border-t border-[#2a1f0d]">
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1">
              <User className="w-2.5 h-2.5" />
              {(r.userName || '—').slice(0, 12)}
            </span>
            <span className="flex items-center gap-1">
              <Building2 className="w-2.5 h-2.5" />
              {(r.storeId || '—').slice(0, 8)}
            </span>
          </div>
          <span>{getRelativeTime(r.createdAt || r.timestamp)}</span>
        </div>

        {!r.reconciled && !isBill && (
          <button
            onClick={() => setConfirmReconcile(r)}
            className="w-full mt-2.5 py-2 rounded-lg bg-amber-500/15 text-amber-400 text-xs font-semibold hover:bg-amber-500/25 transition-colors"
          >
            Mark as Reconciled
          </button>
        )}
      </motion.div>
    );
  };

  // ── Export rows ───────────────────────────────────────────
  const exportRows = transactions.map((t) => ({
    Type:       t.type,
    Amount:     Number(t.amount || 0),
    Reason:     t.reason || '',
    Operator:   t.userName || t.userId || '',
    Branch:     t.storeId || '',
    Source:     t.isFromBill || t.billId ? 'Bill' : 'Manual',
    Date:       (t.createdAt || t.timestamp || '').slice(0, 19).replace('T', ' '),
    Reconciled: t.reconciled ? 'Yes' : (t.isFromBill || t.billId ? 'Auto' : 'No'),
  }));

  const PRESET_KEYS = [
    { key: 'today',      label: 'Today'        },
    { key: 'yesterday',  label: 'Yesterday'    },
    { key: 'last7days',  label: '7 Days'       },
    { key: 'last30days', label: '30 Days'      },
    { key: 'all',        label: 'All Time'     },
  ];

  // ══════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════
  return (
    <div className="space-y-4 sm:space-y-5">

      {/* ═══════ HEADER ═══════ */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xl sm:text-2xl font-bold text-gray-100 flex items-center gap-2">
            <div className="h-9 w-9 rounded-xl bg-amber-500/15 flex items-center justify-center">
              <DollarSign className="w-5 h-5 text-amber-500" />
            </div>
            Cash Flow Control
          </h2>
          <p className="text-xs text-gray-500 mt-1 flex items-center gap-2 flex-wrap">
            <span className="flex items-center gap-1">
              <BarChart3 className="w-3 h-3" />
              {computedSummary.transactionCount} transactions
            </span>
            <span className="text-gray-700">•</span>
            <span className="flex items-center gap-1 text-blue-400">
              <Receipt className="w-3 h-3" />
              {computedSummary.billsCount} from bills
            </span>
            <span className="text-gray-700">•</span>
            <span className="flex items-center gap-1 text-amber-400">
              <Plus className="w-3 h-3" />
              {computedSummary.manualCount} manual
            </span>
          </p>
        </div>

        <div className="flex gap-2 flex-wrap">
          <ExportMenu
            data={exportRows}
            filename={'cashflow_' + new Date().toISOString().slice(0, 10)}
          />
          <button
            onClick={() => setFormOpen(true)}
            className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 px-3.5 py-2 text-xs font-bold text-[#1a1208] shadow-lg shadow-amber-500/20 transition-all"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Transaction
          </button>
        </div>
      </div>

      {/* ═══════ DATE PRESETS ═══════ */}
      <div className="flex items-center gap-2 flex-wrap">
        {PRESET_KEYS.map((item) => {
          const preset = PRESETS[item.key];
          const active = preset.from === dateRange.from && preset.to === dateRange.to;
          return (
            <button
              key={item.key}
              onClick={() => setDateRange(preset)}
              className={`
                rounded-lg px-3 py-1.5 text-[11px] font-bold transition-all border
                ${active
                  ? 'bg-amber-500/15 text-amber-400 border-amber-500/40 shadow-sm shadow-amber-500/10'
                  : 'bg-[#1a1208] text-gray-400 border-[#2a1f0d] hover:text-gray-200 hover:border-gray-700'}
              `}
            >
              {item.label}
            </button>
          );
        })}
        <div className="flex-1" />
        <button
          onClick={refresh}
          className="flex items-center gap-1.5 rounded-lg border border-[#2a1f0d] bg-[#1a1208] px-3 py-1.5 text-xs text-gray-400 hover:text-amber-400 hover:border-amber-500/30 transition-all"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Refresh</span>
        </button>
      </div>

      {/* ═══════ STAT CARDS — RESPONSIVE, NO TRUNCATION ═══════ */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 sm:gap-3">
        <SmartStatCard
          label="Opening"
          value={computedSummary.openingBalance}
          icon={Wallet}
          color="blue"
        />
        <SmartStatCard
          label="Received"
          value={computedSummary.received}
          icon={ArrowDownCircle}
          color="green"
          subtitle={`Bills: Rs ${fmtShort(computedSummary.cashFromBills)}`}
        />
        <SmartStatCard
          label="Handover"
          value={computedSummary.paid}
          icon={ArrowUpCircle}
          color="red"
        />
        <SmartStatCard
          label="Transferred"
          value={computedSummary.transferred}
          icon={RefreshCcw}
          color="cyan"
        />
        <SmartStatCard
          label="Expenses"
          value={computedSummary.expenses}
          icon={TrendingDown}
          color="orange"
        />
        <SmartStatCard
          label="Closing"
          value={computedSummary.closingBalance}
          icon={Wallet}
          color="amber"
        />
      </div>

      {/* ═══════ NO SHIFT BANNER ═══════ */}
      {!computedSummary.activeShift && computedSummary.cashFromBills > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl border border-amber-500/30 bg-gradient-to-r from-amber-500/10 to-amber-500/5 p-3.5 flex items-start gap-3"
        >
          <div className="h-9 w-9 rounded-xl bg-amber-500/20 flex items-center justify-center shrink-0">
            <AlertCircle className="w-4 h-4 text-amber-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-amber-300">No Active Shift</p>
            <p className="text-xs text-amber-500/70 mt-0.5">
              Auto-collected <span className="font-mono font-bold text-amber-300">{formatPKR(computedSummary.cashFromBills)}</span>{' '}
              from <span className="font-bold">{computedSummary.billsCount}</span> cash bills.{' '}
              <a href="/manager/shifts" className="underline text-amber-400 font-semibold hover:text-amber-300">
                Open a shift →
              </a>
            </p>
          </div>
        </motion.div>
      )}

      {/* ═══════ FILTERS ═══════ */}
      <AdvancedFilters
        searchValue={filters.search}
        onSearchChange={(v) => setFilters((f) => ({ ...f, search: v }))}
        searchPlaceholder="Search by reason, type, branch, operator..."
        showDatePresets={false}
        onReset={() => setFilters({ search: '', type: '' })}
        resultCount={transactions.length}
        customFilters={[{
          key: 'type',
          label: 'Type',
          value: filters.type,
          options: [
            { value: 'receive',    label: '📥 Receive'    },
            { value: 'handover',   label: '📤 Handover'   },
            { value: 'transfer',   label: '🔄 Transfer'   },
            { value: 'expense',    label: '💸 Expense'    },
            { value: 'refund',     label: '↩️ Refund'     },
            { value: 'commission', label: '💰 Commission' },
          ],
          onChange: (v) => setFilters((f) => ({ ...f, type: v })),
        }]}
      />

      {/* ═══════ TABLE ═══════ */}
      <DataTable
        columns={columns}
        data={transactions}
        loading={loadingTx}
        emptyMessage="No cash transactions found"
        emptySubtext="Cash sales from bills will appear here automatically"
        rowKey="txId"
        mobileCardRenderer={mobileCard}
        pageSize={25}
        enableVirtualization
        virtualizationThreshold={100}
      />

      {/* ═══════ MODALS ═══════ */}
      <TransactionForm
        isOpen={formOpen}
        onClose={() => setFormOpen(false)}
        onSaved={refresh}
      />

      <ConfirmDialog
        isOpen={!!confirmReconcile}
        onClose={() => setConfirmReconcile(null)}
        onConfirm={handleReconcile}
        title="Mark as Reconciled"
        message={`Confirm reconciliation for ${formatPKR(confirmReconcile?.amount || 0)}?`}
        subMessage="This action cannot be undone."
        confirmText="Confirm"
        confirmIcon={CheckCircle}
        confirmColor="green"
      />
    </div>
  );
};

export default CashFlow;