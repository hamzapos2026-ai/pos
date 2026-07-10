// src/pages/admin/ReportsAnalytics.jsx
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import {
  BarChart3, TrendingUp, Download, Search,
  RefreshCw, X, Eye, Receipt, Calendar,
} from 'lucide-react';
import { cn } from '../../utils/cn';
import useStoresMap, { resolveStoreName } from '../../hooks/useStoresMap';
import { collection, getDocs, query, limit, db, isFirebaseReady } from '../../services/firebase';
import { db as localDB } from '../../db/index';
import Button from '../../components/ui/Button';
import PageHeader from '../../components/admin/PageHeader';
import StatCard from '../../components/admin/StatCard';
import Badge from '../../components/ui/Badge';
import Input from '../../components/ui/Input';
import { useLanguage } from '../../hooks/useLanguage';
import { fetchReportOrdersPage, REPORT_PAGE_SIZE } from '../../utils/ordersQueryUtils';
import { REPORTS_CUSTOMER_META_POLL_MS, REPORTS_CUSTOMERS_META_LIMIT } from '../../utils/firebaseQuotaConfig';
import { normalizeOrder } from '../../services/managerService';
import {
  prepareBillsForDisplay,
  isBillRemoved,
} from '../../utils/billsFilterUtils';
import {
  isCashierCollected,
  isManagerSettled,
} from '../../utils/cashierOrderUtils';
import {
  formatBillDateTime,
  getBillDisplayTimestamp,
  getBillPaidAtTimestamp,
  getBillPaidByDisplay,
  getBillSerialDisplay,
  parseBillTimestamp,
} from '../../utils/billsListHelpers';
import { getOrderDiscountBreakdown, formatDiscountRs } from '../../utils/orderDiscountUtils';
import { resolveAdminDataScope } from '../../utils/branchAccess';
import DatePresetBar from '../../components/shared/DatePresetBar';
import { resolveDatePresetRange, toDateInputValue } from '../../utils/datePresetUtils';
import CashierDeletedFlagsPanel from '../../components/admin/CashierDeletedFlagsPanel';
import PaginationBar from '../../components/ui/PaginationBar';
import { motion, AnimatePresence } from 'framer-motion';

const fmt = (v) => `Rs ${Number(v || 0).toLocaleString()}`;
const PAGE_SIZE_OPTIONS = [25, 50, 100, 200];
const DEFAULT_PAGE_SIZE = 50;

const startOfDay = (d = new Date()) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};

const endOfDay = (d = new Date()) => {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
};

const toDateInput = (d) => {
  const x = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(x.getTime())) return '';
  return x.toISOString().slice(0, 10);
};

const hasValue = (v) => {
  const s = String(v ?? '').trim();
  return s && s !== '—' && s !== '-' && s.toLowerCase() !== 'n/a';
};

const getPaymentMethod = (b) => {
  const pm = String(b?.paymentMethod || '').trim().toLowerCase();
  const pt = String(b?.paymentType || '').trim().toLowerCase();
  const isPlaceholder = (val) => !val || ['n/a', 'na', 'none', 'unknown', 'null', 'undefined'].includes(val);
  if (!isPlaceholder(pm)) return b.paymentMethod;
  if (!isPlaceholder(pt)) return b.paymentType;
  return 'Cash';
};

const getBillAmount = (b) =>
  Number(b?.totalAmount || b?.grandTotal || b?.total || 0);

const getReportActivityDate = (b) =>
  parseBillTimestamp(getBillPaidAtTimestamp(b) || getBillDisplayTimestamp(b)) || new Date(0);

const isIncludedInSales = (b) => {
  if (!b || b.deleted || b.isDeleted || isBillRemoved(b)) return false;
  if (String(b.status || '').toLowerCase() === 'cancelled') return false;
  return isCashierCollected(b) || isManagerSettled(b);
};

const getStatusLabel = (b) => {
  const ps = String(b.paymentStatus || '').toLowerCase();
  if (isManagerSettled(b) || ps === 'paid') return 'Paid — Manager confirmed';
  if (ps === 'cashier_paid' || b.status === 'cashier_paid') return 'Paid — Cashier collected';
  if (ps === 'partial') return 'Partial payment';
  if (ps === 'pending_payment') return 'Waiting for cashier';
  if (ps === 'deleted') return 'Deleted';
  if (String(b.status || '').toLowerCase() === 'cancelled') return 'Cancelled';
  return ps ? ps.replace(/_/g, ' ') : 'Unpaid';
};

const getStatusVariant = (b) => {
  const label = getStatusLabel(b).toLowerCase();
  if (label.includes('paid')) return 'success';
  if (label.includes('partial')) return 'warning';
  if (label.includes('waiting')) return 'info';
  if (label.includes('deleted') || label.includes('cancelled')) return 'error';
  return 'warning';
};

const computeMetrics = (bills, storesMap, customerMap) => {
  const now = new Date();
  const d0 = new Date(now); d0.setHours(0, 0, 0, 0);
  const d7 = new Date(d0); d7.setDate(d7.getDate() - 7);
  const d30 = new Date(d0); d30.setMonth(d30.getMonth() - 1);
  const dy = new Date(now.getFullYear(), 0, 1);

  let todaySales = 0, weekSales = 0, monthSales = 0, ytdSales = 0;
  let returnAmount = 0, totalBills = 0, paidCount = 0;
  const branchSales = {}, customerSales = {}, payments = {};

  bills.forEach((b) => {
    if (b.deleted || b.isDeleted || isBillRemoved(b)) return;

    const amt = getBillAmount(b);
    const dt = getReportActivityDate(b);
    const sid = b.storeId || b.branchId || 'Unknown';
    const cid = b.customerId || b.customer?.name || b.customerName || 'Unknown';
    const pm = getPaymentMethod(b);

    totalBills++;

    if (isIncludedInSales(b)) {
      paidCount++;
      if (dt >= d0) todaySales += amt;
      if (dt >= d7) weekSales += amt;
      if (dt >= d30) monthSales += amt;
      if (dt >= dy) ytdSales += amt;

      branchSales[sid] = (branchSales[sid] || 0) + amt;
      customerSales[cid] = (customerSales[cid] || 0) + amt;
      payments[pm] = (payments[pm] || 0) + amt;
    }

    const ref = Number(b.returnAmount || b.refundAmount || 0);
    const st = b.status || b.paymentStatus || '';
    if (ref > 0 || st === 'returned' || st === 'refund') {
      returnAmount += ref || amt;
    }
  });

  const topBranches = Object.entries(branchSales)
    .sort((a, b) => b[1] - a[1]).slice(0, 3)
    .map(([id, value]) => ({ id, name: resolveStoreName(id, storesMap), value }));

  const topCustomers = Object.entries(customerSales)
    .sort((a, b) => b[1] - a[1]).slice(0, 3)
    .map(([id, value]) => ({ id, name: customerMap[id] || id, value }));

  return {
    todaySales, weekSales, monthSales, ytdSales, returnAmount,
    totalBills, paidCount, branchCount: Object.keys(storesMap).length,
    customerCount: Object.keys(customerMap).length,
    topBranches, topCustomers, payments,
  };
};

const mergeWithLocalOrders = async (remote, { storeIds = null, since = null } = {}) => {
  const map = new Map();
  const upsert = (raw) => {
    const n = normalizeOrder(raw);
    if (!n || n.deleted || n.isDeleted) return;
    const key = n.id || n.localId;
    if (!key) return;
    const prev = map.get(key);
    const nTs = getReportActivityDate(n).getTime();
    const pTs = prev ? getReportActivityDate(prev).getTime() : 0;
    if (!prev || nTs >= pTs) map.set(key, n);
  };
  (remote || []).forEach(upsert);
  try {
    const local = await localDB.orders.toArray();
    local.forEach(upsert);
  } catch { /* offline */ }
  let merged = prepareBillsForDisplay(Array.from(map.values()));
  try {
    const { fetchAndApplyCloudPayments } = await import('../../services/paymentReconciliationService');
    merged = await fetchAndApplyCloudPayments(merged, { storeIds, since });
  } catch { /* non-critical */ }
  return merged;
};

const ReportsAnalytics = ({ scopeOverride = null, managerMode = false } = {}) => {
  const { isDark } = useTheme();
  const { t, isRTL } = useLanguage();
  const { userData } = useAuth();
  const [initialLoad, setInitialLoad] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [allBills, setAllBills] = useState([]);
  const [liveAt, setLiveAt] = useState(null);
  const [reportCursor, setReportCursor] = useState(null);
  const [hasMoreReport, setHasMoreReport] = useState(false);
  const [datePreset, setDatePreset] = useState('today');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [dateFrom, setDateFrom] = useState(() => startOfDay(new Date()));
  const [dateTo, setDateTo] = useState(() => endOfDay(new Date()));
  const storesMap = useStoresMap();
  const [customerMap, setCustomerMap] = useState({});
  const mountedRef = useRef(true);

  const reportScope = useMemo(
    () => scopeOverride || resolveAdminDataScope(userData, storesMap),
    [scopeOverride, userData, storesMap],
  );

  const [search, setSearch] = useState('');
  const [paymentFilter, setPaymentFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortKey, setSortKey] = useState('date');
  const [sortDir, setSortDir] = useState('desc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [selectedBill, setSelectedBill] = useState(null);

  const applyBills = useCallback(async (remoteOrders, { silent = false, append = false } = {}) => {
    if (!silent) setRefreshing(true);
    try {
      const scopeIds = reportScope.storeIds?.length
        ? reportScope.storeIds
        : (reportScope.storeId ? [reportScope.storeId] : null);
      const allBranches = !reportScope.storeIds?.length && !reportScope.storeId;
      const merged = await mergeWithLocalOrders(remoteOrders, {
        storeIds: scopeIds,
        since: allBranches ? null : dateFrom,
      });
      if (!mountedRef.current) return;
      if (append) {
        setAllBills((prev) => {
          const map = new Map();
          [...prev, ...merged].forEach((b) => {
            const key = b.id || b.localId;
            if (key) map.set(key, b);
          });
          return Array.from(map.values());
        });
      } else {
        setAllBills(merged);
      }
      setLiveAt(Date.now());
    } finally {
      if (mountedRef.current) {
        setInitialLoad(false);
        setRefreshing(false);
      }
    }
  }, [reportScope, dateFrom]);

  const loadReport = useCallback(async (cursor = null) => {
    if (!isFirebaseReady() || !db) {
      setInitialLoad(false);
      return;
    }
    setRefreshing(true);
    if (!cursor) setInitialLoad(true);
    try {
      const serverFrom = new Date(dateFrom);
      serverFrom.setDate(serverFrom.getDate() - 14);
      const { orders, lastDoc, hasMore } = await fetchReportOrdersPage({
        ...reportScope,
        dateFrom: serverFrom,
        dateTo,
        cursor,
        pageSize: REPORT_PAGE_SIZE,
        normalizer: (raw) => normalizeOrder(raw),
      });
      setReportCursor(lastDoc);
      setHasMoreReport(hasMore);
      await applyBills(orders, { silent: true, append: Boolean(cursor) });
    } catch (err) {
      console.error('[ReportsAnalytics] loadReport:', err);
    } finally {
      if (mountedRef.current) {
        setInitialLoad(false);
        setRefreshing(false);
      }
    }
  }, [applyBills, dateFrom, dateTo, reportScope]);

  useEffect(() => {
    const { from, to } = resolveDatePresetRange(datePreset, customFrom, customTo);
    setDateFrom(from);
    setDateTo(to);
  }, [datePreset, customFrom, customTo]);

  useEffect(() => {
    if (!isFirebaseReady() || !db || !userData?.uid) return;
    void loadReport(null);
  }, [userData?.uid, dateFrom, dateTo, loadReport]);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (!isFirebaseReady() || !db) return undefined;
    const loadMeta = async () => {
      try {
        const cSnap = await getDocs(query(
          collection(db, 'customers'),
          limit(REPORTS_CUSTOMERS_META_LIMIT),
        )).catch(() => ({ docs: [] }));
        if (!mountedRef.current) return;
        setCustomerMap(Object.fromEntries(cSnap.docs.map(d => [d.id, d.data().name || d.id])));
      } catch { /* ignore */ }
    };
    loadMeta();
    const timer = setInterval(loadMeta, REPORTS_CUSTOMER_META_POLL_MS);
    return () => clearInterval(timer);
  }, []);

  const metrics = useMemo(
    () => computeMetrics(allBills, storesMap, customerMap),
    [allBills, storesMap, customerMap],
  );

  const filtered = useMemo(() => {
    let list = allBills.filter((b) => {
      if (paymentFilter !== 'all') {
        const m = getPaymentMethod(b).toLowerCase();
        if (!m.includes(paymentFilter)) return false;
      }
      if (statusFilter === 'paid' && !isIncludedInSales(b)) return false;
      if (statusFilter === 'unpaid' && isIncludedInSales(b)) return false;
      const d = getReportActivityDate(b);
      if (d < dateFrom || d > dateTo) return false;
      if (search) {
        const s = search.toLowerCase();
        return (
          getBillSerialDisplay(b).toLowerCase().includes(s) ||
          (b.customer?.name || b.customerName || '').toLowerCase().includes(s) ||
          (b.billerName || b.cashierName || '').toLowerCase().includes(s) ||
          getBillPaidByDisplay(b).toLowerCase().includes(s)
        );
      }
      return true;
    });

    list.sort((a, b) => {
      let av; let bv;
      if (sortKey === 'date') {
        av = getReportActivityDate(a).getTime();
        bv = getReportActivityDate(b).getTime();
      } else if (sortKey === 'amount') {
        av = getBillAmount(a);
        bv = getBillAmount(b);
      } else if (sortKey === 'customer') {
        av = (a.customer?.name || a.customerName || '').toLowerCase();
        bv = (b.customer?.name || b.customerName || '').toLowerCase();
      } else if (sortKey === 'payment') {
        av = getPaymentMethod(a).toLowerCase();
        bv = getPaymentMethod(b).toLowerCase();
      } else if (sortKey === 'status') {
        av = getStatusLabel(a);
        bv = getStatusLabel(b);
      } else {
        av = (a[sortKey] || '').toString().toLowerCase();
        bv = (b[sortKey] || '').toString().toLowerCase();
      }
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });

    return list;
  }, [allBills, search, dateFrom, dateTo, paymentFilter, statusFilter, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginated = useMemo(
    () => filtered.slice((page - 1) * pageSize, page * pageSize),
    [filtered, page, pageSize],
  );

  const columnVisibility = useMemo(() => ({
    billerName: filtered.some((b) => hasValue(b.billerName)),
    paidBy: filtered.some((b) => hasValue(getBillPaidByDisplay(b))),
    customer: filtered.some((b) => hasValue(b.customer?.name || b.customerName)),
    payment: filtered.some((b) => hasValue(getPaymentMethod(b))),
  }), [filtered]);

  const tableColumns = useMemo(() => {
    const cols = [
      { k: 'date', label: 'Date', align: 'text-start', always: true },
      { k: 'billSerial', label: 'Bill Serial', align: 'text-start', always: true },
      { k: 'billerName', label: 'Biller', align: 'text-start' },
      { k: 'paidBy', label: 'Paid By', align: 'text-start' },
      { k: 'customer', label: 'Customer', align: 'text-start' },
      { k: 'payment', label: 'Payment', align: 'text-start' },
      { k: 'status', label: 'Status', align: 'text-start', always: true },
      { k: 'amount', label: 'Amount', align: 'text-end', always: true },
    ];
    return cols.filter((c) => c.always || columnVisibility[c.k]);
  }, [columnVisibility]);

  const topPanels = useMemo(() => {
    const panels = [];
    if (metrics.topBranches.length > 0) {
      panels.push({ title: t('admin.reportsPage.topBranches', 'Top Branches'), items: metrics.topBranches, color: 'text-emerald-500' });
    }
    if (metrics.topCustomers.length > 0) {
      panels.push({ title: t('admin.reportsPage.topCustomers', 'Top Customers'), items: metrics.topCustomers, color: 'text-amber-500' });
    }
    if (Object.keys(metrics.payments).length > 0) {
      panels.push({ type: 'payments' });
    }
    return panels;
  }, [metrics, t]);

  useEffect(() => setPage(1), [search, dateFrom, dateTo, paymentFilter, statusFilter, sortKey, sortDir, pageSize]);

  const handleSort = (k) => {
    if (sortKey === k) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(k); setSortDir('desc'); }
  };

  const SortIcon = ({ k }) => {
    if (sortKey !== k) return null;
    return (
      <span className="ml-1 text-amber-500">{sortDir === 'asc' ? '↑' : '↓'}</span>
    );
  };

  const handleExport = () => {
    const rows = filtered.map(b => {
      const disc = getOrderDiscountBreakdown(b);
      return [
        getReportActivityDate(b).toLocaleDateString(),
        getBillSerialDisplay(b),
        b.billerName || 'System',
        getBillPaidByDisplay(b),
        b.customer?.name || b.customerName || 'Walk-in',
        getPaymentMethod(b),
        getStatusLabel(b),
        disc.billerDiscountTotal,
        disc.cashierExtraDiscount,
        getBillAmount(b),
      ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(',');
    });

    const csv = `data:text/csv;charset=utf-8,Date,Bill#,Biller,Paid By,Customer,Payment,Status,Biller Discount,Extra Discount,Amount\n${rows.join('\n')}`;
    const link = document.createElement('a');
    link.href = encodeURI(csv);
    link.download = `reports_${Date.now()}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const liveLabel = liveAt
    ? new Date(liveAt).toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : '—';

  return (
    <div dir={isRTL ? 'rtl' : 'ltr'} className={cn(
      managerMode ? 'p-0 max-w-none space-y-6' : 'p-4 sm:p-6 max-w-[1600px] mx-auto space-y-6',
    )}>

      <PageHeader
        icon={BarChart3}
        title={t('admin.reportsPage.title', 'Reports & Analytics')}
        description={t('admin.reportsPage.subtitle', 'Sales report — loads automatically; use date range and filters below')}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {liveAt && (
              <span className={cn(
                'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold',
                isDark ? 'border-amber-500/30 bg-amber-500/10 text-amber-400' : 'border-amber-200 bg-amber-50 text-amber-700',
              )}>
                <Calendar className="w-3 h-3" />
                Loaded · {liveLabel}
              </span>
            )}
            <Button
              variant="primary"
              leftIcon={<RefreshCw className={cn('w-4 h-4', refreshing && 'animate-spin')} />}
              onClick={() => loadReport(null)}
              disabled={refreshing}
            >
              {refreshing ? t('common.loading', 'Loading...') : t('admin.reportsPage.loadReport', 'Load Report')}
            </Button>
            <Button variant="ghost" leftIcon={<Download className="w-4 h-4" />} onClick={handleExport}>
              {t('admin.reportsPage.exportReport', 'Export Report')}
            </Button>
          </div>
        }
      />

      <DatePresetBar
        datePreset={datePreset}
        onPresetChange={setDatePreset}
        customFrom={customFrom}
        customTo={customTo}
        onCustomFromChange={setCustomFrom}
        onCustomToChange={setCustomTo}
        isDark={isDark}
      />

      <div className={cn(
        'rounded-2xl border p-4 flex flex-col sm:flex-row flex-wrap items-end gap-3',
        isDark ? 'bg-[#0f0a05] border-[#2a1f0d]' : 'bg-white border-amber-200',
      )}>
        <div>
          <label className="text-[10px] font-bold uppercase text-gray-500 block mb-1">From</label>
          <input
            type="date"
            value={toDateInputValue(dateFrom)}
            onChange={(e) => {
              setDatePreset('custom');
              setCustomFrom(e.target.value);
              setDateFrom(startOfDay(new Date(e.target.value)));
            }}
            className={cn(
              'rounded-xl border px-3 py-2 text-sm outline-none',
              isDark ? 'bg-[#0a0805] border-[#2a1f0d] text-white' : 'bg-white border-amber-200',
            )}
          />
        </div>
        <div>
          <label className="text-[10px] font-bold uppercase text-gray-500 block mb-1">To</label>
          <input
            type="date"
            value={toDateInputValue(dateTo)}
            onChange={(e) => {
              setDatePreset('custom');
              setCustomTo(e.target.value);
              setDateTo(endOfDay(new Date(e.target.value)));
            }}
            className={cn(
              'rounded-xl border px-3 py-2 text-sm outline-none',
              isDark ? 'bg-[#0a0805] border-[#2a1f0d] text-white' : 'bg-white border-amber-200',
            )}
          />
        </div>
        <Button variant="primary" onClick={() => loadReport(null)} disabled={refreshing}>
          {refreshing ? t('common.loading', 'Loading...') : t('admin.reportsPage.loadReport', 'Load Report')}
        </Button>
        {hasMoreReport && reportCursor && (
          <Button variant="secondary" onClick={() => loadReport(reportCursor)} disabled={refreshing}>
            {t('admin.reportsPage.loadMore', 'Load More')}
          </Button>
        )}
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard label={t('admin.reportsPage.todaySales', 'Today Sales')} value={fmt(metrics.todaySales)} icon={TrendingUp} color="green" subtitle={`${metrics.paidCount} bills collected`} />
        <StatCard label={t('admin.reportsPage.weekSales', 'This Week')} value={fmt(metrics.weekSales)} color="amber" />
        <StatCard label={t('admin.reportsPage.monthSales', 'This Month')} value={fmt(metrics.monthSales)} color="blue" />
        <StatCard label={t('admin.reportsPage.ytdSales', 'Year to Date')} value={fmt(metrics.ytdSales)} color="purple" />
      </div>

      <CashierDeletedFlagsPanel
        description="Cashier ne cancelled bill flag ki — flag reason check karo aur review karo."
      />

      {/* Top panels — only when data exists */}
      {topPanels.length > 0 && (
      <div className={cn(
        'grid gap-4',
        topPanels.length === 1 ? 'grid-cols-1' : topPanels.length === 2 ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1 lg:grid-cols-3',
      )}>
        {topPanels.map((panel) => {
          if (panel.type === 'payments') {
            return (
        <div key="payments" className={cn(
          'rounded-2xl border p-5',
          isDark ? 'bg-[#0f0a05] border-[#2a1f0d]' : 'bg-white border-amber-200',
        )}>
          <div className="flex items-center justify-between mb-4 gap-2">
            <h3 className={cn('font-bold', isDark ? 'text-white' : 'text-gray-900')}>Payment Breakdown</h3>
            <span className="text-xs text-amber-500 font-semibold whitespace-nowrap">{metrics.paidCount} paid</span>
          </div>
          {Object.entries(metrics.payments).map(([m, v]) => (
            <div key={m} className="flex justify-between gap-3 py-2.5 border-b last:border-0 border-dashed border-amber-100/20">
              <span className={cn('text-sm capitalize', isDark ? 'text-gray-200' : 'text-gray-700')}>{m}</span>
              <span className="text-sm font-semibold text-sky-500 tabular-nums shrink-0">{fmt(v)}</span>
            </div>
          ))}
        </div>
            );
          }
          return (
          <div key={panel.title} className={cn(
            'rounded-2xl border p-5',
            isDark ? 'bg-[#0f0a05] border-[#2a1f0d]' : 'bg-white border-amber-200',
          )}>
            <h3 className={cn('font-bold mb-4', isDark ? 'text-white' : 'text-gray-900')}>{panel.title}</h3>
            {panel.items.map(item => (
              <div key={item.id} className="flex items-center justify-between gap-3 py-2.5 border-b last:border-0 border-dashed border-amber-100/20">
                <div className="min-w-0 flex-1">
                  <p className={cn('font-medium text-sm', isDark ? 'text-white' : 'text-gray-900')}>{item.name}</p>
                </div>
                <span className={cn('font-bold text-sm shrink-0 tabular-nums', panel.color)}>{fmt(item.value)}</span>
              </div>
            ))}
          </div>
          );
        })}
      </div>
      )}

      {/* Filters */}
      <div className={cn(
        'rounded-2xl border p-4 flex flex-col lg:flex-row gap-3',
        isDark ? 'bg-[#0f0a05] border-[#2a1f0d]' : 'bg-white border-amber-200',
      )}>
        <Input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search bill number, customer, biller or cashier name..."
          leftIcon={<Search className="w-4 h-4" />}
          className="flex-1 min-w-0"
        />
        {[
          {
            val: statusFilter, set: setStatusFilter,
            opts: [
              { v: 'all', l: 'All Status' },
              { v: 'paid', l: 'Collected / Paid' },
              { v: 'unpaid', l: 'Still Pending' },
            ],
          },
          {
            val: paymentFilter, set: setPaymentFilter,
            opts: [
              { v: 'all', l: 'All Payments' },
              { v: 'cash', l: 'Cash' },
              { v: 'card', l: 'Card' },
            ],
          },
        ].map((f, i) => (
          <select
            key={i}
            value={f.val}
            onChange={e => f.set(e.target.value)}
            className={cn(
              'rounded-xl border px-3 py-2 text-sm outline-none min-w-[140px]',
              isDark ? 'bg-[#0a0805] border-[#2a1f0d] text-white' : 'bg-white border-amber-200 text-gray-900',
            )}
          >
            {f.opts.map(o => (
              <option key={o.v} value={o.v}>{o.l}</option>
            ))}
          </select>
        ))}
        <p className={cn('self-center text-xs whitespace-nowrap', isDark ? 'text-gray-500' : 'text-gray-400')}>
          {filtered.length} / {allBills.length} bills
        </p>
      </div>

      {/* Table */}
      <div className={cn(
        'rounded-2xl border overflow-hidden reports-table-wrap',
        isDark ? 'bg-[#0f0a05] border-[#2a1f0d]' : 'bg-white border-amber-200',
      )}>
        <div className={cn(
          'px-4 py-3 border-b flex items-center justify-between gap-2',
          isDark ? 'border-[#2a1f0d]' : 'border-amber-100',
        )}>
          <h3 className={cn('font-bold', isDark ? 'text-white' : 'text-gray-900')}>Bill Report — Click row for details</h3>
          <span className="text-xs text-amber-500 font-semibold whitespace-nowrap flex items-center gap-1">
            <Eye className="w-3 h-3" /> Tap any bill
          </span>
        </div>

        <div className="overflow-x-auto max-h-[560px] overflow-y-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead className={cn(
              'sticky top-0 z-10',
              isDark ? 'bg-[#1a1208] text-gray-400' : 'bg-amber-50 text-gray-600',
            )}>
              <tr>
                {tableColumns.map(col => (
                  <th
                    key={col.k}
                    onClick={() => handleSort(col.k === 'paidBy' ? 'billerName' : col.k)}
                    className={cn(
                      'px-3 py-3 font-semibold cursor-pointer select-none whitespace-nowrap',
                      col.align,
                      col.k === 'billSerial' && 'min-w-[280px]',
                    )}
                  >
                    {col.label}
                    <SortIcon k={col.k === 'paidBy' ? 'billerName' : col.k} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {initialLoad && allBills.length === 0 ? (
                <tr>
                  <td colSpan={tableColumns.length} className="text-center py-12 text-gray-500">
                    {refreshing ? (
                      <>
                        <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-amber-500" />
                        Loading report data...
                      </>
                    ) : (
                      <>Select dates and click Load Report to fetch bills</>
                    )}
                  </td>
                </tr>
              ) : paginated.length === 0 ? (
                <tr>
                  <td colSpan={tableColumns.length} className="text-center py-10 text-gray-500">
                    No bills match your filters — try changing date or status
                  </td>
                </tr>
              ) : paginated.map(b => {
                const { date, time } = formatBillDateTime(getReportActivityDate(b));
                const pm = getPaymentMethod(b);
                const serial = getBillSerialDisplay(b);
                const cell = (key) => {
                  switch (key) {
                    case 'date':
                      return (
                        <td key={key} className="px-3 py-3 align-top whitespace-nowrap">
                          <p className={cn('text-xs font-medium', isDark ? 'text-slate-300' : 'text-gray-600')}>{date}</p>
                          <p className="text-[10px] text-amber-500/90 font-mono">{time}</p>
                        </td>
                      );
                    case 'billSerial':
                      return (
                        <td key={key} className="px-3 py-3 align-top min-w-[280px] max-w-[360px]">
                          <p className={cn('font-mono font-bold text-[11px] sm:text-xs whitespace-nowrap', isDark ? 'text-amber-300' : 'text-amber-700')} title={serial}>
                            {serial}
                          </p>
                        </td>
                      );
                    case 'billerName':
                      return (
                        <td key={key} className={cn('px-3 py-3 text-xs font-medium align-top', isDark ? 'text-slate-300' : 'text-gray-700')}>
                          {hasValue(b.billerName) ? b.billerName : ''}
                        </td>
                      );
                    case 'paidBy': {
                      const paidBy = getBillPaidByDisplay(b);
                      return (
                        <td key={key} className={cn('px-3 py-3 text-xs align-top', isDark ? 'text-slate-300' : 'text-gray-700')}>
                          {hasValue(paidBy) ? paidBy : ''}
                        </td>
                      );
                    }
                    case 'customer': {
                      const cust = b.customer?.name || b.customerName;
                      return (
                        <td key={key} className={cn('px-3 py-3 text-xs font-semibold align-top', isDark ? 'text-slate-200' : 'text-gray-700')}>
                          {hasValue(cust) ? cust : ''}
                        </td>
                      );
                    }
                    case 'payment':
                      return (
                        <td key={key} className="px-3 py-3 align-top">
                          {hasValue(pm) ? (
                            <span className={cn(
                              'inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold uppercase border whitespace-nowrap',
                              pm.toLowerCase().includes('cash')
                                ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                                : 'bg-blue-500/10 text-blue-500 border-blue-500/20',
                            )}>{pm}</span>
                          ) : null}
                        </td>
                      );
                    case 'status':
                      return (
                        <td key={key} className="px-3 py-3 align-top">
                          <Badge variant={getStatusVariant(b)} size="small">{getStatusLabel(b)}</Badge>
                        </td>
                      );
                    case 'amount':
                      return (
                        <td key={key} className={cn('px-3 py-3 text-end font-bold text-sm font-mono tabular-nums align-top whitespace-nowrap', isDark ? 'text-gray-100' : 'text-gray-900')}>
                          {fmt(getBillAmount(b))}
                        </td>
                      );
                    default:
                      return null;
                  }
                };
                return (
                  <tr
                    key={b.id || b.localId}
                    onClick={() => setSelectedBill(b)}
                    className={cn(
                      'border-t transition-colors cursor-pointer',
                      isDark ? 'border-[#2a1f0d] hover:bg-[#1a1208]/80' : 'border-amber-100 hover:bg-amber-50/80',
                      isIncludedInSales(b) && 'reports-row-paid',
                    )}
                  >
                    {tableColumns.map((col) => cell(col.k))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <PaginationBar
          page={page}
          totalPages={totalPages}
          totalItems={filtered.length}
          pageSize={pageSize}
          onPageChange={setPage}
          pageSizeOptions={PAGE_SIZE_OPTIONS}
          onPageSizeChange={setPageSize}
        />
      </div>

      {/* Bill detail drawer */}
      <AnimatePresence>
        {selectedBill && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-sm"
            onClick={() => setSelectedBill(null)}
          >
            <motion.div
              initial={{ x: 320 }}
              animate={{ x: 0 }}
              exit={{ x: 320 }}
              onClick={(e) => e.stopPropagation()}
              className={cn(
                'w-full max-w-md h-full overflow-y-auto border-l shadow-2xl p-5',
                isDark ? 'bg-[#0f0a05] border-[#2a1f0d]' : 'bg-white border-amber-200',
              )}
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Receipt className="w-5 h-5 text-amber-500" />
                  <h3 className={cn('font-bold text-lg', isDark ? 'text-white' : 'text-gray-900')}>
                    Bill Details
                  </h3>
                </div>
                <button type="button" onClick={() => setSelectedBill(null)} className="p-1 rounded-lg text-gray-500 hover:bg-white/10">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {(() => {
                const b = selectedBill;
                const disc = getOrderDiscountBreakdown(b);
                const { date, time } = formatBillDateTime(getReportActivityDate(b));
                const items = b.items || [];
                return (
                  <div className="space-y-4 text-sm">
                    <div className={cn('rounded-xl border p-4', isDark ? 'border-[#2a1f0d] bg-black/20' : 'border-amber-100 bg-amber-50/30')}>
                      <p className="text-base sm:text-xl font-black font-mono text-amber-500 break-all leading-snug">#{getBillSerialDisplay(b)}</p>
                      <p className={cn('text-xs mt-1', isDark ? 'text-gray-400' : 'text-gray-600')}>{date} at {time}</p>
                      <div className="mt-2">
                        <Badge variant={getStatusVariant(b)} size="small">{getStatusLabel(b)}</Badge>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      {[
                        ['Customer', b.customer?.name || b.customerName],
                        ['Phone', b.customer?.phone],
                        ['Biller', b.billerName],
                        ['Paid By', getBillPaidByDisplay(b)],
                        ['Payment', getPaymentMethod(b)],
                        ['Branch', resolveStoreName(b.storeId || b.branchId, storesMap)],
                      ].filter(([, val]) => hasValue(val)).map(([label, val]) => (
                        <div key={label}>
                          <p className="text-[10px] uppercase font-bold text-gray-500">{label}</p>
                          <p className={cn('font-semibold break-words', isDark ? 'text-gray-200' : 'text-gray-800')}>{val}</p>
                        </div>
                      ))}
                    </div>

                    {(disc.itemDiscount > 0 || disc.billerBillDiscount > 0 || disc.cashierExtraDiscount > 0) && (
                    <div className={cn('rounded-xl border p-4 space-y-2', isDark ? 'border-[#2a1f0d]' : 'border-amber-100')}>
                      <p className="font-bold text-amber-500">Discounts</p>
                      {disc.itemDiscount > 0 && (
                        <div className="flex justify-between"><span className="text-gray-500">Item discount</span><span>{formatDiscountRs(disc.itemDiscount)}</span></div>
                      )}
                      {disc.billerBillDiscount > 0 && (
                        <div className="flex justify-between"><span className="text-gray-500">Biller bill discount</span><span className="text-emerald-500">{formatDiscountRs(disc.billerBillDiscount)}</span></div>
                      )}
                      {disc.cashierExtraDiscount > 0 && (
                        <div className="flex justify-between"><span className="text-gray-500">Cashier extra discount</span><span className="text-orange-400">{formatDiscountRs(disc.cashierExtraDiscount)}</span></div>
                      )}
                      <div className="flex justify-between border-t pt-2 font-bold text-base">
                        <span>Final Amount</span>
                        <span>{fmt(getBillAmount(b))}</span>
                      </div>
                      {b.discountReason && (
                        <p className="text-xs text-gray-500 italic">Note: {b.discountReason}</p>
                      )}
                    </div>
                    )}

                    {!(disc.itemDiscount > 0 || disc.billerBillDiscount > 0 || disc.cashierExtraDiscount > 0) && (
                    <div className={cn('rounded-xl border p-4', isDark ? 'border-[#2a1f0d]' : 'border-amber-100')}>
                      <div className="flex justify-between font-bold text-base">
                        <span>Final Amount</span>
                        <span>{fmt(getBillAmount(b))}</span>
                      </div>
                    </div>
                    )}

                    {items.length > 0 && (
                      <div className={cn('rounded-xl border p-4', isDark ? 'border-[#2a1f0d]' : 'border-amber-100')}>
                        <p className="font-bold mb-2">Items ({items.length})</p>
                        <div className="space-y-2 max-h-48 overflow-y-auto">
                          {items.map((it, i) => (
                            <div key={i} className="flex justify-between gap-2 text-xs border-b border-dashed border-gray-500/20 pb-1">
                              <span className="truncate flex-1">{it.productName || it.name || 'Item'}</span>
                              <span className="tabular-nums shrink-0">×{it.qty || 1}</span>
                              <span className="tabular-nums shrink-0 font-semibold">Rs.{Number(it.total || it.price * it.qty || 0).toLocaleString()}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {(b.isEdited || b.wasEdited) && (
                      <p className="text-xs text-purple-400 font-semibold">
                        ✎ Edited by {b.lastEditedBy || b.editedByName || 'cashier'}
                        {b.editedTotalDifference ? ` — difference Rs.${Number(b.editedTotalDifference).toLocaleString()}` : ''}
                      </p>
                    )}
                  </div>
                );
              })()}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ReportsAnalytics;
