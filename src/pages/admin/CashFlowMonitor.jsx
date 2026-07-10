// File: src/pages/admin/CashFlowMonitor.jsx
// ✅ FIXED — User import added, fully responsive, no scroll issues
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Wallet, ArrowUpRight, ArrowDownRight, RefreshCw, Search,
  Wifi, Database, Eye, CheckCircle2, X, Filter, Download,
  DollarSign, Users, Building2, Calendar, FileText, FileSpreadsheet,
  FileType, ChevronDown, BarChart3, Activity,
  Banknote, Smartphone, CreditCard, Landmark, RotateCcw,
  User,
} from 'lucide-react';
import { isFirebaseReady } from '../../services/firebase';
import { db as localDB } from '../../db/index';
import { cn } from '../../utils/cn';
import { useTheme } from '../../context/ThemeContext';
import { useNetwork } from '../../context/NetworkContext';
import { useAuth } from '../../context/AuthContext';
import { downloadCSV, downloadExcel, downloadPDF } from '../../utils/exportUtils';
import PageHeader from '../../components/admin/PageHeader';
import StatCard from '../../components/admin/StatCard';
import EmptyState from '../../components/admin/EmptyState';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import { useLanguage } from '../../hooks/useLanguage';
import useStoresMap, { resolveStoreName } from '../../hooks/useStoresMap';
import { resolveAdminDataScope } from '../../utils/branchAccess';
import { resolveDatePresetRange } from '../../utils/datePresetUtils';
import DatePresetBar from '../../components/shared/DatePresetBar';
import { fetchCashFlowSnapshot, CASH_FLOW_POLL_MS } from '../../utils/ordersQueryUtils';

// ── HELPERS ──────────────────────────────────────────────────
const toDate = (v) => {
  if (!v) return new Date();
  let d;
  if (v && typeof v.toDate === 'function') {
    try { d = v.toDate(); } catch { }
  } else if (v && typeof v === 'object' && typeof v.seconds === 'number' && v.seconds > 0) {
    d = new Date(v.seconds * 1000);
  } else {
    d = new Date(v);
  }
  if (d && !isNaN(d.getTime())) return d;
  return new Date();
};

const fmt = (v) => `Rs ${Number(v || 0).toLocaleString('en-PK', { maximumFractionDigits: 2 })}`;

const fmtShort = (v) => {
  const n = Number(v || 0);
  if (n >= 10000000) return `Rs ${(n / 10000000).toFixed(2)}Cr`;
  if (n >= 100000) return `Rs ${(n / 100000).toFixed(1)}L`;
  if (n >= 1000) return `Rs ${(n / 1000).toFixed(1)}K`;
  return `Rs ${n.toLocaleString()}`;
};

const fmtDt = (v) => {
  const d = toDate(v);
  if (isNaN(d.getTime()) || d.getTime() === 0) return '—';
  const diff = Date.now() - d.getTime();
  const min = Math.floor(diff / 60000);
  const hr = Math.floor(diff / 3600000);
  const day = Math.floor(diff / 86400000);
  if (min < 1) return 'Just now';
  if (min < 60) return `${min}m ago`;
  if (hr < 24) return `${hr}h ago`;
  if (day < 7) return `${day}d ago`;
  return d.toLocaleDateString();
};

const getPaymentMethod = (bill) =>
  (bill.paymentType || bill.paymentMethod || 'cash').toLowerCase().trim();

const getTotal = (bill) =>
  Number(bill.grandTotal || bill.totalAmount || bill.total || 0);

const PAYMENT_ICONS = {
  cash: Banknote, easypaisa: Smartphone, jazzcash: Smartphone,
  bank: Landmark, card: CreditCard, mobile: Smartphone,
};

// ════════════════════════════════════════════════════════════
// EXPORT MENU
// ════════════════════════════════════════════════════════════
const ExportMenu = ({ data, filename, isDark }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const exportRows = useMemo(() =>
    data.map(t => ({
      Type: t.type,
      Source: t.source,
      Description: t.description,
      Operator: t.initiator,
      Customer: t.customer || '—',
      Branch: t.branch,
      Method: t.method || 'cash',
      Amount: Number(t.amount || 0),
      Date: toDate(t.timestamp).toLocaleString(),
      Synced: t.synced ? 'Yes' : 'No',
    })), [data]);

  const handleExport = (format) => {
    if (data.length === 0) return alert('No data');
    const fn = `${filename}_${new Date().toISOString().slice(0, 10)}`;
    if (format === 'csv') downloadCSV(`${fn}.csv`, exportRows);
    if (format === 'excel') downloadExcel(`${fn}.xlsx`, exportRows, 'Cash Flow');
    if (format === 'pdf') downloadPDF(`${fn}.pdf`, {
      title: 'Cash Flow Report',
      subtitle: `${data.length} transactions`,
      headers: Object.keys(exportRows[0] || {}),
      rows: exportRows.map(r => Object.values(r)),
    });
    setOpen(false);
  };

  return (
    <div className="relative" ref={ref}>
      <Button variant="secondary" onClick={() => setOpen(v => !v)}>
        <Download className="w-3.5 h-3.5 mr-1.5" /> Export
        <ChevronDown className={cn('w-3 h-3 ml-1 transition-transform', open && 'rotate-180')} />
      </Button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className={cn(
              'absolute right-0 top-full mt-2 w-52 rounded-xl border shadow-xl z-50',
              isDark ? 'bg-[#0f0a05] border-[#2a1f0d]' : 'bg-white border-amber-100',
            )}
          >
            {[
              { id: 'csv', label: 'CSV File', icon: FileText, desc: 'Comma-separated' },
              { id: 'excel', label: 'Excel File', icon: FileSpreadsheet, desc: '.xlsx format' },
              { id: 'pdf', label: 'PDF Report', icon: FileType, desc: 'Formatted PDF' },
            ].map(opt => {
              const Icon = opt.icon;
              return (
                <button key={opt.id} onClick={() => handleExport(opt.id)}
                  className={cn(
                    'w-full flex items-start gap-3 px-3 py-2.5 transition-colors text-left',
                    isDark ? 'hover:bg-amber-500/10 text-gray-200' : 'hover:bg-amber-50 text-gray-700',
                  )}
                >
                  <div className="h-8 w-8 rounded-lg bg-amber-500/10 text-amber-500 flex items-center justify-center shrink-0">
                    <Icon className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-xs font-medium">{opt.label}</p>
                    <p className="text-[10px] text-gray-500">{opt.desc}</p>
                  </div>
                </button>
              );
            })}
            <div className={cn('px-3 py-2 text-[10px] text-gray-500 border-t',
              isDark ? 'border-[#2a1f0d]' : 'border-amber-100')}>
              {data.length.toLocaleString()} records ready
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// ════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ════════════════════════════════════════════════════════════
const CashFlowMonitor = ({ scopeOverride = null, managerMode = false } = {}) => {
  const { isDark } = useTheme();
  const { isOnline } = useNetwork();
  const { t, isRTL } = useLanguage();
  const { userData } = useAuth();
  const storesMap = useStoresMap();
  const branchLabel = useCallback((id) => resolveStoreName(id, storesMap), [storesMap]);
  const mountedRef = useRef(true);

  const cashScope = useMemo(
    () => scopeOverride || resolveAdminDataScope(userData, storesMap),
    [scopeOverride, userData, storesMap],
  );
  const lockedBranchId = managerMode
    ? (cashScope.storeId || cashScope.storeIds?.[0] || null)
    : null;

  const [bills, setBills] = useState([]);
  const [transfers, setTransfers] = useState([]);
  const [registers, setRegisters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState(null);

  const [datePreset, setDatePreset] = useState('today');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [paymentFilter, setPaymentFilter] = useState('all');
  const [registerFilter, setRegisterFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [branchFilter, setBranchFilter] = useState(() => lockedBranchId || 'all');
  const [search, setSearch] = useState('');
  const [showSug, setShowSug] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [selectedRegister, setSelectedRegister] = useState(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);

  const fetchCashFlow = useCallback(async () => {
    if (!mountedRef.current) return;
    setLoading(true);
    try {
      if (!isFirebaseReady()) {
        const idbOrders = await localDB.orders.toArray();
        if (!mountedRef.current) return;
        setBills(idbOrders);
        setTransfers([]);
        setRegisters([]);
        setLastRefreshed(new Date());
        return;
      }

      const snapshot = await fetchCashFlowSnapshot(cashScope);
      if (!mountedRef.current) return;

      let orders = snapshot.orders || [];
      try {
        const localRows = await localDB.orders.toArray();
        const map = new Map();
        [...orders, ...localRows].forEach((o) => {
          const key = o.id || o.localId;
          if (key) map.set(key, o);
        });
        orders = Array.from(map.values());
      } catch { /* ignore */ }

      setBills(orders);
      setRegisters(snapshot.registers || []);
      setTransfers(snapshot.transactions || []);
      setLastRefreshed(new Date());

      try {
        await localDB.orders.bulkPut((snapshot.orders || []).map((b) => ({
          ...b,
          localId: b.localId || b.id,
          syncStatus: 'synced',
          synced: 1,
        })));
      } catch { /* offline cache optional */ }
    } catch (err) {
      console.error('[CashFlow] fetch error:', err);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [cashScope]);

  useEffect(() => {
    mountedRef.current = true;
    fetchCashFlow();
    const interval = setInterval(fetchCashFlow, CASH_FLOW_POLL_MS);
    return () => {
      mountedRef.current = false;
      clearInterval(interval);
    };
  }, [fetchCashFlow]);

  useEffect(() => {
    if (lockedBranchId) setBranchFilter(lockedBranchId);
  }, [lockedBranchId]);

  // ── Date range ─────────────────────────────────────────────
  const dateRange = useMemo(
    () => resolveDatePresetRange(datePreset, customFrom, customTo),
    [datePreset, customFrom, customTo],
  );

  const allBranches = useMemo(() => {
    const set = new Set();
    bills.forEach(b => {
      const branch = b.storeId || b.branchId;
      if (branch) set.add(branch);
    });
    return Array.from(set).sort();
  }, [bills]);

  // ── Stats ──────────────────────────────────────────────────
  const stats = useMemo(() => {
    let cashIn = 0, cashOut = 0, digital = 0;
    let totalSales = 0, totalBills = 0;
    let returnsAmt = 0, expensesAmt = 0;

    bills.forEach(b => {
      if (b.deleted || b.isDeleted) return;
      const dt = toDate(b.createdAt);
      if (dt < dateRange.from || dt > dateRange.to) return;
      if (branchFilter !== 'all' && (b.storeId || b.branchId) !== branchFilter) return;

      const total = getTotal(b);
      const method = getPaymentMethod(b);
      const isCash = method === 'cash' || !method;

      totalBills++;
      totalSales += total;
      if (isCash) cashIn += total; else digital += total;

      if (b.status === 'returned' || b.returnAmount) {
        returnsAmt += Number(b.returnAmount || total);
        cashOut += Number(b.returnAmount || total);
      }
      if (b.expense) {
        expensesAmt += Number(b.expense);
        cashOut += Number(b.expense);
      }
    });

    transfers.forEach(t => {
      const dt = toDate(t.timestamp || t.createdAt);
      if (dt < dateRange.from || dt > dateRange.to) return;
      if (branchFilter !== 'all' && (t.storeId || t.branchId) !== branchFilter) return;

      const amt = Number(t.amount || 0);
      if (t.type === 'IN' || t.type === 'receive' || t.type === 'deposit') cashIn += amt;
      else cashOut += amt;
    });

    const uniqueBillers = new Set(
      bills.filter(b => !b.deleted && !b.isDeleted && b.billerName).map(b => b.billerName)
    );
    const openReg = registers.length > 0
      ? registers.filter(r => r.status === 'open').length
      : Math.max(0, uniqueBillers.size);

    return {
      cashIn, cashOut, digital, totalSales, totalBills,
      returnsAmt, expensesAmt,
      netCash: cashIn - cashOut,
      openRegisters: openReg,
      uniqueBranches: allBranches.length,
    };
  }, [bills, transfers, registers, dateRange, branchFilter, allBranches]);

  // ── Tx list ────────────────────────────────────────────────
  const allTx = useMemo(() => {
    const fromOrders = bills
      .filter(b => {
        if (b.deleted || b.isDeleted) return false;
        const dt = toDate(b.createdAt);
        if (dt < dateRange.from || dt > dateRange.to) return false;
        return true;
      })
      .map(b => {
        const method = getPaymentMethod(b);
        return {
          id: b.id,
          type: 'IN',
          source: 'SALE',
          description: `Sale #${b.billSerial || b.serialNo || b.id.slice(0, 8)}`,
          amount: getTotal(b),
          timestamp: b.createdAt,
          initiator: b.billerName || b.cashierName || 'Unknown',
          branch: b.storeId || b.branchId || 'Main',
          customer: b.customer?.name || b.customerName || 'Walk-in',
          synced: b.synced !== false,
          method,
        };
      });

    const fromTransfers = transfers.map(t => ({
      id: t.id,
      type: t.type === 'receive' || t.type === 'deposit' || t.type === 'IN' ? 'IN' : 'OUT',
      source: 'TRANSFER',
      description: t.description || t.reason || `${t.type} transaction`,
      amount: Number(t.amount || 0),
      timestamp: t.timestamp || t.createdAt,
      initiator: t.userName || t.initiator || 'Manager',
      branch: t.storeId || t.branchId || 'Main',
      customer: '',
      synced: t.synced !== false,
      method: 'cash',
    }));

    return [...fromOrders, ...fromTransfers]
      .sort((a, b) => toDate(b.timestamp) - toDate(a.timestamp))
      .filter(t => {
        if (typeFilter !== 'all' && t.type !== typeFilter) return false;
        if (paymentFilter !== 'all' && t.method !== paymentFilter) return false;
        if (registerFilter !== 'all' &&
          (t.initiator || '').toLowerCase() !== registerFilter.toLowerCase()) return false;
        if (branchFilter !== 'all' && t.branch !== branchFilter) return false;
        if (search) {
          const s = search.toLowerCase();
          return t.description.toLowerCase().includes(s) ||
            (t.initiator || '').toLowerCase().includes(s) ||
            (t.customer || '').toLowerCase().includes(s) ||
            (t.branch || '').toLowerCase().includes(s);
        }
        return true;
      });
  }, [bills, transfers, dateRange, typeFilter, paymentFilter, registerFilter, branchFilter, search]);

  const activeRegs = useMemo(() => {
    if (registers.length > 0) return registers;
    const map = {};
    bills.forEach(b => {
      if (b.deleted || b.isDeleted || !b.billerName) return;
      const dt = toDate(b.createdAt);
      if (dt < dateRange.from || dt > dateRange.to) return;
      if (branchFilter !== 'all' && (b.storeId || b.branchId) !== branchFilter) return;

      if (!map[b.billerName]) {
        map[b.billerName] = {
          id: `reg_${b.billerId || b.billerName}`,
          name: b.billerName,
          branch: b.storeId || b.branchId || 'Main',
          cashReceived: 0,
          digitalReceived: 0,
          totalBills: 0,
          status: 'open',
        };
      }
      const method = getPaymentMethod(b);
      const isCash = method === 'cash' || !method;
      const t = getTotal(b);
      if (isCash) map[b.billerName].cashReceived += t;
      else map[b.billerName].digitalReceived += t;
      map[b.billerName].totalBills++;
    });
    return Object.values(map).sort((a, b) => b.cashReceived - a.cashReceived);
  }, [bills, registers, dateRange, branchFilter]);

  const suggestions = useMemo(() => {
    if (!search.trim()) return [];
    const s = search.toLowerCase();
    const set = new Set();
    bills.forEach(b => {
      if (b.billerName?.toLowerCase().includes(s)) set.add(b.billerName);
      if (b.cashierName?.toLowerCase().includes(s)) set.add(b.cashierName);
      if (b.customer?.name?.toLowerCase().includes(s)) set.add(b.customer.name);
      if ((b.storeId || b.branchId || '').toLowerCase().includes(s)) set.add(b.storeId || b.branchId);
    });
    return [...set].slice(0, 6);
  }, [bills, search]);

  const methodBreakdown = useMemo(() => {
    const map = {};
    bills.forEach(b => {
      if (b.deleted || b.isDeleted) return;
      const dt = toDate(b.createdAt);
      if (dt < dateRange.from || dt > dateRange.to) return;
      if (branchFilter !== 'all' && (b.storeId || b.branchId) !== branchFilter) return;
      const m = getPaymentMethod(b);
      map[m] = (map[m] || 0) + getTotal(b);
    });
    return Object.entries(map)
      .map(([method, amount]) => ({ method, amount }))
      .sort((a, b) => b.amount - a.amount);
  }, [bills, dateRange, branchFilter]);

  const totalActiveFilters =
    (paymentFilter !== 'all' ? 1 : 0) +
    (registerFilter !== 'all' ? 1 : 0) +
    (typeFilter !== 'all' ? 1 : 0) +
    (branchFilter !== 'all' ? 1 : 0) +
    (datePreset !== 'today' ? 1 : 0) +
    (search ? 1 : 0);

  const resetFilters = () => {
    setPaymentFilter('all'); setRegisterFilter('all');
    setTypeFilter('all'); setBranchFilter('all');
    setDatePreset('today'); setSearch('');
    setCustomFrom(''); setCustomTo('');
  };

  const pageCount = Math.max(1, Math.ceil(allTx.length / pageSize));
  const pageItems = useMemo(() => {
    const start = (page - 1) * pageSize;
    return allTx.slice(start, start + pageSize);
  }, [allTx, page, pageSize]);

  return (
    <div dir={isRTL ? 'rtl' : 'ltr'} className={cn(managerMode ? 'p-0' : 'p-2 sm:p-3 lg:p-4', 'max-w-[1600px] mx-auto space-y-3')}>

      {/* ── HEADER ─────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
        <PageHeader
          icon={Wallet}
          title={t('admin.cashflowPage.title', 'Cash Flow Monitor')}
          description={
            <div className="flex items-center gap-2 flex-wrap text-[10px] sm:text-xs mt-1">
              <span>{stats.totalBills.toLocaleString()} bills</span>
              <span className="text-gray-500">•</span>
              <span>{fmt(stats.totalSales)} sales</span>
              <span className="text-gray-500">•</span>
              <span className="flex items-center gap-1">
                <span className={cn('h-2 w-2 rounded-full',
                  isOnline ? 'bg-green-400' : 'bg-gray-500')} />
                {isOnline ? t('admin.billsPage.polledData', 'Polled') : t('admin.billsPage.localData', 'Local')}
              </span>
              <span className="text-gray-500">•</span>
              <span>
                {t('admin.cashflowPage.lastUpdated', 'Last updated')}:{' '}
                {lastRefreshed ? fmtDt(lastRefreshed) : t('common.never', 'Never')}
              </span>
            </div>
          }
        />
        <div className="flex items-center gap-2 flex-wrap">
          <ExportMenu data={allTx} filename="cashflow" isDark={isDark} />
          <Button variant="ghost" onClick={fetchCashFlow} disabled={loading}>
            <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
            <span className="ml-1.5 hidden sm:inline">
              {loading ? t('common.refreshing', 'Refreshing...') : t('common.refreshNow', '↻ Refresh Now')}
            </span>
          </Button>
        </div>
      </div>

      {/* ── DATE PRESETS ────────────────────────────────────── */}
      <DatePresetBar
        datePreset={datePreset}
        onPresetChange={setDatePreset}
        customFrom={customFrom}
        customTo={customTo}
        onCustomFromChange={setCustomFrom}
        onCustomToChange={setCustomTo}
        isDark={isDark}
      />

      {/* ── STATS GRID ──────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        <StatCard label="Cash Received" value={fmtShort(stats.cashIn)} icon={ArrowDownRight} color="green" />
        <StatCard label="Cash Out" value={fmtShort(stats.cashOut)} icon={ArrowUpRight} color="rose" />
        <StatCard label="Net Cash" value={fmtShort(stats.netCash)} icon={Wallet} color="amber" />
        <StatCard label="Digital" value={fmtShort(stats.digital)} icon={CreditCard} color="blue" />
        <StatCard label="Active Registers" value={stats.openRegisters} icon={Users} color="purple" />
        <StatCard label="Branches" value={stats.uniqueBranches} icon={Building2} color="cyan" />
      </div>

      {/* ── PAYMENT METHOD BREAKDOWN ────────────────────────── */}
      {methodBreakdown.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          className={cn('rounded-xl border p-3',
            isDark ? 'bg-[#0f0a05] border-[#2a1f0d]' : 'bg-white border-amber-200')}
        >
          <h4 className={cn('text-xs font-bold mb-2 flex items-center gap-2',
            isDark ? 'text-white' : 'text-gray-900')}>
            <BarChart3 className="w-3.5 h-3.5 text-amber-500" />
            Payment Method Breakdown
          </h4>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
            {methodBreakdown.map(m => {
              const Icon = PAYMENT_ICONS[m.method] || DollarSign;
              const pct = stats.totalSales > 0 ? (m.amount / stats.totalSales * 100).toFixed(1) : 0;
              return (
                <div key={m.method}
                  className={cn('rounded-lg p-2.5 border',
                    isDark ? 'bg-[#070503] border-[#2a1f0d]' : 'bg-gray-50 border-gray-200')}>
                  <div className="flex items-center gap-2 mb-1">
                    <Icon className="w-3.5 h-3.5 text-amber-400" />
                    <p className="text-[10px] font-semibold uppercase text-gray-500 truncate">{m.method}</p>
                  </div>
                  <p className={cn('text-sm font-bold font-mono', isDark ? 'text-gray-100' : 'text-gray-900')}>
                    {fmtShort(m.amount)}
                  </p>
                  <p className="text-[10px] text-amber-500/70">{pct}% of total</p>
                </div>
              );
            })}
          </div>
        </motion.div>
      )}

      {/* ── FILTER BAR ──────────────────────────────────────── */}
      <div className={cn('rounded-xl border p-2.5',
        isDark ? 'bg-[#0f0a05] border-[#2a1f0d]' : 'bg-white border-amber-200')}>
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
            <input
              value={search}
              onChange={e => { setSearch(e.target.value); setShowSug(true); }}
              onFocus={() => setShowSug(true)}
              placeholder="Search bills, cashier, customer, branch..."
              className={cn(
                'w-full rounded-lg border pl-9 pr-9 py-1.5 text-xs',
                isDark
                  ? 'bg-[#070503] border-[#2a1f0d] text-gray-200 placeholder-gray-600'
                  : 'bg-white border-amber-100 text-gray-700 placeholder-gray-400',
                'focus:outline-none focus:ring-2 focus:ring-amber-500/40',
              )}
            />
            {search && (
              <button onClick={() => { setSearch(''); setShowSug(false); }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
            {showSug && suggestions.length > 0 && (
              <>
                <div className="fixed inset-0 z-20" onClick={() => setShowSug(false)} />
                <motion.div
                  initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
                  className={cn(
                    'absolute top-full left-0 mt-1 w-full rounded-xl border shadow-xl z-30 p-1',
                    isDark ? 'bg-[#0c0804] border-[#2a1f0d]' : 'bg-white border-amber-100',
                  )}
                >
                  {suggestions.map((s, i) => (
                    <button key={i} onClick={() => { setSearch(s); setShowSug(false); }}
                      className={cn(
                        'w-full text-left px-3 py-1.5 rounded-lg text-xs transition-colors',
                        isDark ? 'text-gray-300 hover:bg-amber-500/10' : 'text-gray-700 hover:bg-amber-50',
                      )}>
                      <Search className="w-3 h-3 inline mr-2 text-gray-500" />
                      {s}
                    </button>
                  ))}
                </motion.div>
              </>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setShowAdvanced(v => !v)}
              className={cn(
                'flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors',
                showAdvanced || totalActiveFilters > 0
                  ? 'bg-amber-500/15 text-amber-400 border-amber-500/40'
                  : isDark
                    ? 'bg-[#070503] border-[#2a1f0d] text-gray-400'
                    : 'bg-white border-amber-100 text-gray-500',
              )}
            >
              <Filter className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Filters</span>
              {totalActiveFilters > 0 && (
                <span className="bg-amber-500 text-[#1a1208] text-[9px] font-bold px-1.5 py-0.5 rounded-full">
                  {totalActiveFilters}
                </span>
              )}
            </button>

            {totalActiveFilters > 0 && (
              <Button variant="secondary" onClick={resetFilters}>
                <RotateCcw className="w-3.5 h-3.5 mr-1" /> Reset
              </Button>
            )}
          </div>
        </div>

        <AnimatePresence>
          {showAdvanced && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className={cn('mt-2 pt-2 border-t grid grid-cols-2 sm:grid-cols-4 gap-2',
                isDark ? 'border-[#2a1f0d]' : 'border-amber-100')}>
                <div>
                  <label className="text-[9px] font-semibold uppercase text-gray-500 block mb-1">Type</label>
                  <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
                    className={cn('w-full rounded-lg border px-2 py-1 text-xs',
                      isDark ? 'bg-[#070503] border-[#2a1f0d] text-gray-200' : 'bg-white border-amber-100')}>
                    <option value="all">All Types</option>
                    <option value="IN">Cash IN</option>
                    <option value="OUT">Cash OUT</option>
                  </select>
                </div>
                <div>
                  <label className="text-[9px] font-semibold uppercase text-gray-500 block mb-1">Method</label>
                  <select value={paymentFilter} onChange={e => setPaymentFilter(e.target.value)}
                    className={cn('w-full rounded-lg border px-2 py-1 text-xs',
                      isDark ? 'bg-[#070503] border-[#2a1f0d] text-gray-200' : 'bg-white border-amber-100')}>
                    <option value="all">All Methods</option>
                    <option value="cash">Cash</option>
                    <option value="easypaisa">EasyPaisa</option>
                    <option value="jazzcash">JazzCash</option>
                    <option value="bank">Bank</option>
                    <option value="card">Card</option>
                  </select>
                </div>
                {!managerMode && (
                <div>
                  <label className="text-[9px] font-semibold uppercase text-gray-500 block mb-1">Branch</label>
                  <select value={branchFilter} onChange={e => setBranchFilter(e.target.value)}
                    className={cn('w-full rounded-lg border px-2 py-1 text-xs',
                      isDark ? 'bg-[#070503] border-[#2a1f0d] text-gray-200' : 'bg-white border-amber-100')}>
                    <option value="all">All Branches</option>
                    {allBranches.map(b => <option key={b} value={b}>{branchLabel(b)}</option>)}
                  </select>
                </div>
                )}
                <div>
                  <label className="text-[9px] font-semibold uppercase text-gray-500 block mb-1">Register</label>
                  <select value={registerFilter} onChange={e => setRegisterFilter(e.target.value)}
                    className={cn('w-full rounded-lg border px-2 py-1 text-xs',
                      isDark ? 'bg-[#070503] border-[#2a1f0d] text-gray-200' : 'bg-white border-amber-100')}>
                    <option value="all">All Registers</option>
                    {activeRegs.map(r => <option key={r.id} value={r.name}>{r.name}</option>)}
                  </select>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex items-center justify-between mt-2 pt-2 border-t border-[#2a1f0d]/50">
          <p className={cn('text-[10px]', isDark ? 'text-gray-500' : 'text-gray-400')}>
            <span className="font-semibold text-amber-500">{allTx.length.toLocaleString()}</span> transactions
            {bills.length > 0 && <span className="text-gray-600"> / {bills.length.toLocaleString()} bills</span>}
          </p>
          {pageCount > 1 && (
            <button onClick={() => setPage(pageCount)}
              className="text-[10px] text-amber-500 hover:text-amber-400">
              Latest →
            </button>
          )}
        </div>
      </div>

      {/* ── ACTIVE REGISTERS ────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
        className={cn('rounded-xl border p-3 w-full',
          isDark ? 'bg-[#0f0a05] border-[#2a1f0d]' : 'bg-white border-amber-200')}>
        <h3 className={cn('font-bold text-xs mb-2.5 flex items-center justify-between',
          isDark ? 'text-white' : 'text-gray-900')}>
          <span className="flex items-center gap-2">
            <Activity className="w-3.5 h-3.5 text-amber-500 animate-pulse" />
            Active Registers
          </span>
          <span className="text-[10px] text-gray-500 font-normal">({activeRegs.length})</span>
        </h3>

        {activeRegs.length === 0 ? (
          <EmptyState title="No registers" description="No active cashiers found" />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
            {activeRegs.map((reg, idx) => (
              <motion.div
                key={reg.id}
                initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.03 }}
                className={cn('rounded-lg border p-2.5 hover:border-amber-500/30 transition-colors cursor-pointer group',
                  isDark ? 'bg-[#070503] border-[#2a1f0d]' : 'bg-gray-50 border-gray-200')}
                onClick={() => setSelectedRegister(reg)}
              >
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <div className="min-w-0 flex-1">
                    <p className={cn('font-semibold text-xs truncate',
                      isDark ? 'text-gray-100' : 'text-gray-900')}>{reg.name}</p>
                    <p className="text-[9px] text-gray-500 truncate">
                      <Building2 className="w-2.5 h-2.5 inline mr-1" />{branchLabel(reg.branch)}
                    </p>
                  </div>
                  <Badge variant={reg.status === 'open' ? 'success' : 'secondary'}>
                    {(reg.status || 'open').toUpperCase()}
                  </Badge>
                </div>
                <div className="grid grid-cols-3 gap-1.5 text-[10px]">
                  <div>
                    <p className="text-gray-500 mb-0.5">Cash</p>
                    <p className="font-bold text-emerald-400 font-mono truncate">{fmtShort(reg.cashReceived)}</p>
                  </div>
                  <div>
                    <p className="text-gray-500 mb-0.5">Digital</p>
                    <p className="font-bold text-blue-400 font-mono truncate">{fmtShort(reg.digitalReceived || 0)}</p>
                  </div>
                  <div>
                    <p className="text-gray-500 mb-0.5">Bills</p>
                    <p className="font-bold text-gray-300 font-mono">{reg.totalBills}</p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </motion.div>

      {/* ── LIVE LEDGER ─────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
        className={cn('rounded-xl border p-3 w-full',
          isDark ? 'bg-[#0f0a05] border-[#2a1f0d]' : 'bg-white border-amber-200')}
      >
        <h3 className={cn('font-bold text-xs sm:text-sm mb-2 flex items-center justify-between',
          isDark ? 'text-white' : 'text-gray-900')}>
          <span className="flex items-center gap-1.5">
            <Wallet className="w-4 h-4 text-emerald-500 animate-pulse" />
            Live Cash Ledger
          </span>
          <span className="text-[10px] text-slate-500 font-normal">
            Page {page}/{pageCount} • {allTx.length.toLocaleString()}
          </span>
        </h3>

        {loading ? (
          <div className="text-center py-12">
            <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-amber-500" />
            <p className="text-xs text-slate-500">Loading transactions...</p>
          </div>
        ) : allTx.length === 0 ? (
          <EmptyState title="No transactions" description="Cash transactions will appear here" />
        ) : (
          <>
            {/* ── Desktop Table ─────────────────────────────── */}
            <div className="hidden md:block w-full overflow-hidden rounded-lg border border-[#2a1f0d]/50">
              <div className="overflow-y-auto max-h-[500px]">
                <table className="w-full text-sm table-fixed">
                  <thead className={cn('sticky top-0 z-10',
                    isDark ? 'bg-[#1a1208] text-slate-400' : 'bg-amber-50 text-gray-600')}>
                    <tr>
                      <th className="px-2 py-2 text-start font-bold text-xs uppercase tracking-wider w-[80px]">Type</th>
                      <th className="px-2 py-2 text-start font-bold text-xs uppercase tracking-wider">Description</th>
                      <th className="px-2 py-2 text-start font-bold text-xs uppercase tracking-wider w-[150px]">Operator</th>
                      <th className="px-2 py-2 text-end font-bold text-xs uppercase tracking-wider w-[125px]">Amount</th>
                      <th className="px-2 py-2 text-end font-bold text-xs uppercase tracking-wider w-[95px]">Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    <AnimatePresence mode="popLayout">
                      {pageItems.map((tx, idx) => {
                        const isIn = tx.type === 'IN';
                        const MethodIcon = PAYMENT_ICONS[tx.method] || DollarSign;
                        return (
                          <motion.tr
                            key={tx.id}
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                            transition={{ delay: Math.min(idx * 0.008, 0.4) }}
                            className={cn(
                              'border-t transition-colors',
                              isDark ? 'border-[#2a1f0d]/60 hover:bg-[#1a1208]/60' : 'border-amber-100 hover:bg-amber-50/50',
                              !isIn && (isDark ? 'bg-rose-500/[0.02]' : 'bg-rose-50/20'),
                            )}>
                            <td className="px-2 py-2">
                              <span className={cn(
                                'inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded font-bold text-[10px] uppercase border',
                                isIn
                                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                  : 'bg-rose-500/10 text-rose-400 border-rose-500/20',
                              )}>
                                {isIn ? <ArrowDownRight className="w-2.5 h-2.5" /> : <ArrowUpRight className="w-2.5 h-2.5" />}
                                {tx.type}
                              </span>
                            </td>
                            <td className={cn('px-2 py-2', isDark ? 'text-gray-300' : 'text-gray-700')}>
                              <p className="font-semibold text-xs truncate">{tx.description}</p>
                              <p className="text-[11px] text-slate-400 mt-0.5 truncate">
                                {tx.source}{tx.customer && ` • ${tx.customer}`}
                              </p>
                            </td>
                            <td className="px-2 py-2">
                              <div className="min-w-0">
                                <div className="flex items-center gap-1">
                                  <User className="w-2.5 h-2.5 text-amber-500 shrink-0" />
                                  <span className="text-xs text-slate-200 font-semibold truncate">
                                    {tx.initiator}
                                  </span>
                                </div>
                                <div className="flex items-center gap-1 mt-0.5">
                                  <Building2 className="w-2.5 h-2.5 text-slate-500 shrink-0" />
                                  <span className="text-[11px] text-slate-400 font-mono truncate">
                                    {branchLabel(tx.branch)}
                                  </span>
                                </div>
                              </div>
                            </td>
                            <td className="px-2 py-2 text-right">
                              <span className={cn('text-xs font-bold font-mono block',
                                isIn ? 'text-emerald-400' : 'text-rose-400')}>
                                {isIn ? '+' : '-'}{fmtShort(tx.amount)}
                              </span>
                              <span className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded bg-amber-500/10 text-amber-400 text-[10px] mt-0.5 border border-amber-500/10 font-mono">
                                <MethodIcon className="w-2.5 h-2.5" />
                                {tx.method || 'cash'}
                              </span>
                            </td>
                            <td className="px-2 py-2 text-right">
                              <div className="flex flex-col items-end gap-0.5">
                                <span className="text-xs text-slate-400 font-mono">{fmtDt(tx.timestamp)}</span>
                                <div className="flex items-center gap-0.5">
                                  {tx.synced ? (
                                    <>
                                      <Wifi className="w-2.5 h-2.5 text-emerald-500" />
                                      <span className="text-[10px] text-emerald-500 font-bold">Synced</span>
                                    </>
                                  ) : (
                                    <>
                                      <Database className="w-2.5 h-2.5 text-amber-500 animate-pulse" />
                                      <span className="text-[10px] text-amber-500 font-bold">Wait</span>
                                    </>
                                  )}
                                </div>
                              </div>
                            </td>
                          </motion.tr>
                        );
                      })}
                    </AnimatePresence>
                  </tbody>
                </table>
              </div>
            </div>

            {/* ── Mobile Cards ──────────────────────────────── */}
            <div className="md:hidden space-y-2 max-h-[500px] overflow-y-auto pr-1">
              {pageItems.map((tx) => {
                const isIn = tx.type === 'IN';
                const MethodIcon = PAYMENT_ICONS[tx.method] || DollarSign;
                return (
                  <motion.div
                    key={tx.id}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={cn(
                      'p-2.5 rounded-lg border',
                      isDark ? 'bg-[#070503] border-[#2a1f0d]' : 'bg-gray-50 border-gray-200',
                      !isIn && (isDark ? 'bg-rose-500/[0.03]' : 'bg-rose-50/30'),
                    )}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <span className={cn(
                        'inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded font-bold text-[9px] uppercase border',
                        isIn
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                          : 'bg-rose-500/10 text-rose-400 border-rose-500/20',
                      )}>
                        {isIn ? <ArrowDownRight className="w-2.5 h-2.5" /> : <ArrowUpRight className="w-2.5 h-2.5" />}
                        {tx.type}
                      </span>
                      <span className={cn('text-xs font-bold font-mono',
                        isIn ? 'text-emerald-400' : 'text-rose-400')}>
                        {isIn ? '+' : '-'}{fmtShort(tx.amount)}
                      </span>
                    </div>
                    <p className="text-[11px] text-gray-300 truncate mb-1">{tx.description}</p>
                    <div className="flex items-center justify-between text-[10px] text-slate-500">
                      <span className="truncate">{tx.initiator} • {branchLabel(tx.branch)}</span>
                      <span>{fmtDt(tx.timestamp)}</span>
                    </div>
                    <div className="flex items-center gap-1 mt-1">
                      <MethodIcon className="w-2.5 h-2.5 text-amber-400" />
                      <span className="text-[9px] text-amber-400 font-mono uppercase">{tx.method || 'cash'}</span>
                    </div>
                  </motion.div>
                );
              })}
            </div>

            {/* ── Pagination ──────────────────────────────── */}
            {pageCount > 1 && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-2 mt-2.5 pt-2.5 border-t border-[#2a1f0d]/50">
                <div className="flex items-center gap-2">
                  <button disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}
                    className="px-2.5 py-1 rounded-md bg-amber-500/10 text-amber-400 text-xs disabled:opacity-40 border border-amber-500/20">
                    Prev
                  </button>
                  <button disabled={page >= pageCount} onClick={() => setPage(p => Math.min(pageCount, p + 1))}
                    className="px-2.5 py-1 rounded-md bg-amber-500/10 text-amber-400 text-xs disabled:opacity-40 border border-amber-500/20">
                    Next
                  </button>
                  <span className="text-[10px] text-gray-500">Page {page}/{pageCount}</span>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-[10px] text-gray-500">Rows:</label>
                  <select value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}
                    className={cn('rounded-md border px-2 py-0.5 text-xs',
                      isDark ? 'bg-[#070503] border-[#2a1f0d] text-gray-200' : 'bg-white border-amber-100')}>
                    {[25, 50, 100, 200].map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
              </div>
            )}
          </>
        )}
      </motion.div>

      {/* ── REGISTER MODAL ──────────────────────────────────── */}
      <AnimatePresence>
        {selectedRegister && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
            onClick={(e) => { if (e.target === e.currentTarget) setSelectedRegister(null); }}
          >
            <motion.div
              initial={{ scale: 0.95, y: 16 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 16 }}
              className={cn('w-full max-w-md rounded-2xl border p-5 shadow-2xl relative',
                isDark ? 'bg-[#0f0a05] border-[#2a1f0d]' : 'bg-white border-amber-200')}
            >
              <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-amber-400 to-amber-600 rounded-t-2xl" />

              <div className={cn('flex items-center justify-between pb-3 border-b mb-4',
                isDark ? 'border-[#2a1f0d]' : 'border-amber-100')}>
                <h3 className={cn('font-bold flex items-center gap-2 text-sm',
                  isDark ? 'text-white' : 'text-gray-900')}>
                  <Wallet className="w-5 h-5 text-amber-500" /> Register Verification
                </h3>
                <button onClick={() => setSelectedRegister(null)}
                  className="p-1 rounded-lg text-gray-400 hover:text-gray-300">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3 text-xs">
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: 'Cashier', value: selectedRegister.name },
                    { label: 'Branch', value: branchLabel(selectedRegister.branch) },
                    { label: 'Total Bills', value: selectedRegister.totalBills || 0 },
                    { label: 'Status', value: (selectedRegister.status || 'open').toUpperCase() },
                  ].map(f => (
                    <div key={f.label} className={cn('p-2.5 rounded-lg border',
                      isDark ? 'bg-[#070503] border-[#2a1f0d]' : 'bg-gray-50 border-gray-200')}>
                      <p className="text-[9px] text-gray-500 font-bold uppercase mb-1">{f.label}</p>
                      <p className={cn('font-semibold truncate', isDark ? 'text-gray-200' : 'text-gray-900')}>{f.value}</p>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className={cn('p-3 rounded-lg border',
                    isDark ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-emerald-50 border-emerald-200')}>
                    <p className="text-[9px] text-emerald-500/70 font-bold uppercase mb-1">Cash</p>
                    <p className="text-base font-bold text-emerald-400 font-mono">{fmt(selectedRegister.cashReceived)}</p>
                  </div>
                  <div className={cn('p-3 rounded-lg border',
                    isDark ? 'bg-blue-500/5 border-blue-500/20' : 'bg-blue-50 border-blue-200')}>
                    <p className="text-[9px] text-blue-500/70 font-bold uppercase mb-1">Digital</p>
                    <p className="text-base font-bold text-blue-400 font-mono">{fmt(selectedRegister.digitalReceived || 0)}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 bg-emerald-500/5 border border-emerald-500/10 rounded-lg p-2.5 text-emerald-400 text-[10px]">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  Cashier registry synchronized with offline cache & Firestore
                </div>
              </div>

              <div className="mt-4">
                <Button variant="primary" className="w-full rounded-lg" onClick={() => setSelectedRegister(null)}>
                  Close
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default CashFlowMonitor;