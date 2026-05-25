// src/pages/admin/ReportsAnalytics.jsx
import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  BarChart3, TrendingUp, Download, Search,
  CreditCard, Users, Store, Calendar,
  ChevronUp, ChevronDown, RefreshCw,
} from 'lucide-react';
import { cn } from '../../utils/cn';
import { useTheme } from '../../context/ThemeContext';
import { collection, getDocs, db, isFirebaseReady } from '../../services/firebase';
import Button from '../../components/ui/Button';
import PageHeader from '../../components/admin/PageHeader';
import StatCard from '../../components/admin/StatCard';
import Badge from '../../components/ui/Badge';
import Input from '../../components/ui/Input';

const fmt = (v) => `Rs ${Number(v || 0).toLocaleString()}`;
const PAGE = 50;

const toDate = (v) => {
  if (!v) return new Date();
  let d;
  if (v && typeof v.toDate === 'function') {
    try { d = v.toDate(); } catch {}
  } else if (v && typeof v === 'object' && typeof v.seconds === 'number' && v.seconds > 0) {
    d = new Date(v.seconds * 1000);
  } else {
    d = new Date(v);
  }
  if (d && !isNaN(d.getTime())) return d;
  return new Date();
};

const getPaymentMethod = (b) => {
  const pm = String(b?.paymentMethod || '').trim().toLowerCase();
  const pt = String(b?.paymentType || '').trim().toLowerCase();
  const isPlaceholder = (val) => !val || ['n/a', 'na', 'none', 'unknown', 'null', 'undefined'].includes(val);
  if (!isPlaceholder(pm)) return b.paymentMethod;
  if (!isPlaceholder(pt)) return b.paymentType;
  return 'Cash';
};

const ReportsAnalytics = () => {
  const { isDark } = useTheme();
  const [loading,  setLoading]  = useState(true);
  const [allBills, setAllBills] = useState([]);
  const [metrics,  setMetrics]  = useState({
    todaySales: 0, weekSales: 0, monthSales: 0, ytdSales: 0,
    returnAmount: 0, totalBills: 0, branchCount: 0, customerCount: 0,
    topBranches: [], topCustomers: [], payments: {},
  });

  // Filters
  const [search,        setSearch]        = useState('');
  const [dateFilter,    setDateFilter]    = useState('all');
  const [paymentFilter, setPaymentFilter] = useState('all');
  const [sortKey,       setSortKey]       = useState('date');
  const [sortDir,       setSortDir]       = useState('desc');
  const [page,          setPage]          = useState(1);

  // ── Load ──────────────────────────────────────────────────
  const loadReports = useCallback(async () => {
    if (!isFirebaseReady() || !db) { setLoading(false); return; }
    setLoading(true);
    try {
      const now = new Date();
      const d0  = new Date(now); d0.setHours(0, 0, 0, 0);
      const d7  = new Date(d0);  d7.setDate(d7.getDate() - 7);
      const d30 = new Date(d0);  d30.setMonth(d30.getMonth() - 1);
      const dy  = new Date(now.getFullYear(), 0, 1);

      let bSnap = { docs: [] }, sSnap = { docs: [], size: 0 }, cSnap = { docs: [], size: 0 };
      try { bSnap = await getDocs(collection(db, 'orders'));    } catch {}
      try { sSnap = await getDocs(collection(db, 'stores'));    } catch {}
      try { cSnap = await getDocs(collection(db, 'customers')); } catch {}

      const branchMap   = Object.fromEntries(sSnap.docs.map(d => [d.id, d.data().name || d.id]));
      const customerMap = Object.fromEntries(cSnap.docs.map(d => [d.id, d.data().name || d.id]));

      let todaySales = 0, weekSales = 0, monthSales = 0, ytdSales = 0;
      let returnAmount = 0, totalBills = 0;
      const branchSales = {}, customerSales = {}, payments = {};

      bSnap.docs.forEach(doc => {
        const b   = doc.data();
        if (b.deleted) return;
        const amt = Number(b.totalAmount || b.grandTotal || b.total || 0);
        const dt  = toDate(b.createdAt);
        const sid = b.storeId || b.branchId || 'Unknown';
        const cid = b.customerId || b.customer?.name || 'Unknown';
        const pm  = b.paymentMethod || b.paymentType || 'Unknown';

        if (dt >= d0)  todaySales  += amt;
        if (dt >= d7)  weekSales   += amt;
        if (dt >= d30) monthSales  += amt;
        if (dt >= dy)  ytdSales    += amt;

        const ref = Number(b.returnAmount || b.refundAmount || 0);
        const st  = b.status || b.paymentStatus || '';
        if (ref > 0 || st === 'returned' || st === 'refund')
          returnAmount += ref || amt;

        branchSales[sid]   = (branchSales[sid]   || 0) + amt;
        customerSales[cid] = (customerSales[cid] || 0) + amt;
        payments[pm]       = (payments[pm]       || 0) + amt;
        totalBills++;
      });

      const topBranches = Object.entries(branchSales)
        .sort((a, b) => b[1] - a[1]).slice(0, 3)
        .map(([id, value]) => ({ id, name: branchMap[id] || id, value }));
      const topCustomers = Object.entries(customerSales)
        .sort((a, b) => b[1] - a[1]).slice(0, 3)
        .map(([id, value]) => ({ id, name: customerMap[id] || id, value }));

      setMetrics({
        todaySales, weekSales, monthSales, ytdSales, returnAmount,
        totalBills, branchCount: sSnap.size, customerCount: cSnap.size,
        topBranches, topCustomers, payments,
      });

      setAllBills(
        bSnap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter(b => !b.deleted)
          .sort((a, b) => toDate(b.createdAt) - toDate(a.createdAt))
      );
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadReports(); }, [loadReports]);

  // ── Filter + Sort ─────────────────────────────────────────
  const filtered = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const weekAgo  = new Date(today); weekAgo.setDate(weekAgo.getDate() - 7);
    const monthAgo = new Date(today); monthAgo.setMonth(monthAgo.getMonth() - 1);

    let list = allBills.filter(b => {
      if (paymentFilter !== 'all') {
        const m = (b.paymentMethod || b.paymentType || '').toLowerCase();
        if (!m.includes(paymentFilter)) return false;
      }
      if (dateFilter !== 'all') {
        const d = toDate(b.createdAt);
        if (dateFilter === 'today' && d < today)   return false;
        if (dateFilter === 'week'  && d < weekAgo)  return false;
        if (dateFilter === 'month' && d < monthAgo) return false;
      }
      if (search) {
        const s = search.toLowerCase();
        return (
          (b.billSerial || b.billNumber || '').toLowerCase().includes(s) ||
          (b.customer?.name || b.customerName || '').toLowerCase().includes(s) ||
          (b.billerName || b.cashierName || '').toLowerCase().includes(s)
        );
      }
      return true;
    });

    // Sort
    list.sort((a, b) => {
      let av, bv;
      if (sortKey === 'date') {
        av = toDate(a.createdAt).getTime();
        bv = toDate(b.createdAt).getTime();
      } else if (sortKey === 'amount') {
        av = Number(a.totalAmount || a.grandTotal || 0);
        bv = Number(b.totalAmount || b.grandTotal || 0);
      } else if (sortKey === 'customer') {
        av = (a.customer?.name || '').toLowerCase();
        bv = (b.customer?.name || '').toLowerCase();
      } else {
        av = (a[sortKey] || '').toString().toLowerCase();
        bv = (b[sortKey] || '').toString().toLowerCase();
      }
      if (av < bv) return sortDir === 'asc' ? -1 :  1;
      if (av > bv) return sortDir === 'asc' ?  1 : -1;
      return 0;
    });

    return list;
  }, [allBills, search, dateFilter, paymentFilter, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const paginated  = useMemo(
    () => filtered.slice((page - 1) * PAGE, page * PAGE),
    [filtered, page],
  );

  useEffect(() => setPage(1),
    [search, dateFilter, paymentFilter, sortKey, sortDir]);

  const handleSort = (k) => {
    if (sortKey === k) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(k); setSortDir('desc'); }
  };

  const SortIcon = ({ k }) => sortKey === k
    ? sortDir === 'asc'
      ? <ChevronUp   className="w-3 h-3 inline ml-1" />
      : <ChevronDown className="w-3 h-3 inline ml-1" />
    : null;

  // ── Export ────────────────────────────────────────────────
  const handleExport = () => {
    const rows = filtered.map(b => [
      toDate(b.createdAt).toLocaleDateString(),
      b.billSerial || b.id,
      b.billerName || 'System',
      b.customer?.name || 'Walk-in',
      b.paymentMethod || b.paymentType || 'N/A',
      b.paymentStatus || 'unpaid',
      b.totalAmount || b.grandTotal || 0,
    ].map(v => `"${v}"`).join(','));

    const csv  = `data:text/csv;charset=utf-8,Date,Bill#,Biller,Customer,Payment,Status,Amount\n${rows.join('\n')}`;
    const link = document.createElement('a');
    link.href  = encodeURI(csv);
    link.download = `reports_${Date.now()}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // ── Th helper ─────────────────────────────────────────────
  const Th = ({ label, k, end }) => (
    <th
      onClick={() => handleSort(k)}
      className={cn(
        'px-4 py-3 font-semibold cursor-pointer select-none whitespace-nowrap',
        end ? 'text-end' : 'text-start',
      )}
    >
      {label}<SortIcon k={k} />
    </th>
  );

  return (
    <div className="p-4 sm:p-6 max-w-[1600px] mx-auto space-y-6">

      <PageHeader
        icon={BarChart3}
        title="Reports & Analytics"
        description={`${allBills.length.toLocaleString()} orders • system-wide analytics`}
        actions={
          <div className="flex gap-2">
            <Button variant="ghost"
              leftIcon={<RefreshCw className="w-4 h-4" />}
              onClick={loadReports}>
              Refresh
            </Button>
            <Button variant="primary"
              leftIcon={<Download className="w-4 h-4" />}
              onClick={handleExport}>
              Export CSV
            </Button>
          </div>
        }
      />

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard label="Today"     value={fmt(metrics.todaySales)}  icon={TrendingUp} color="green" />
        <StatCard label="This Week" value={fmt(metrics.weekSales)}   color="amber" />
        <StatCard label="This Month"value={fmt(metrics.monthSales)}  color="blue" />
        <StatCard label="YTD"       value={fmt(metrics.ytdSales)}    color="purple" />
      </div>

      {/* Top 3 panels */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {[
          { title: 'Top Branches',   items: metrics.topBranches,   color: 'text-emerald-500' },
          { title: 'Top Customers',  items: metrics.topCustomers,  color: 'text-amber-500'   },
        ].map(({ title, items, color }) => (
          <div key={title} className={cn(
            'rounded-2xl border p-5',
            isDark ? 'bg-[#0f0a05] border-[#2a1f0d]' : 'bg-white border-amber-200',
          )}>
            <h3 className={cn('font-bold mb-4', isDark ? 'text-white' : 'text-gray-900')}>
              {title}
            </h3>
            {items.length === 0
              ? <p className="text-sm text-gray-500">No data yet</p>
              : items.map(item => (
                <div key={item.id}
                  className="flex items-center justify-between py-2.5
                             border-b last:border-0 border-dashed border-amber-100/20">
                  <div>
                    <p className={cn('font-medium text-sm',
                      isDark ? 'text-white' : 'text-gray-900')}>
                      {item.name}
                    </p>
                    <p className="text-[10px] text-gray-500 font-mono">
                      {item.id.slice(0, 10)}
                    </p>
                  </div>
                  <span className={cn('font-bold text-sm', color)}>
                    {fmt(item.value)}
                  </span>
                </div>
              ))}
          </div>
        ))}

        {/* Payment breakdown */}
        <div className={cn(
          'rounded-2xl border p-5',
          isDark ? 'bg-[#0f0a05] border-[#2a1f0d]' : 'bg-white border-amber-200',
        )}>
          <div className="flex items-center justify-between mb-4">
            <h3 className={cn('font-bold', isDark ? 'text-white' : 'text-gray-900')}>
              Payment Breakdown
            </h3>
            <span className="text-xs text-amber-500 font-semibold">
              {metrics.totalBills} bills
            </span>
          </div>
          {Object.entries(metrics.payments).length === 0
            ? <p className="text-sm text-gray-500">No payments yet</p>
            : Object.entries(metrics.payments).map(([m, v]) => (
              <div key={m} className="flex justify-between py-2.5
                                     border-b last:border-0 border-dashed border-amber-100/20">
                <span className={cn('text-sm capitalize',
                  isDark ? 'text-gray-200' : 'text-gray-700')}>
                  {m}
                </span>
                <span className="text-sm font-semibold text-sky-500">{fmt(v)}</span>
              </div>
            ))}
        </div>
      </div>

      {/* Filter bar */}
      <div className={cn(
        'rounded-2xl border p-4 flex flex-col sm:flex-row gap-3',
        isDark ? 'bg-[#0f0a05] border-[#2a1f0d]' : 'bg-white border-amber-200',
      )}>
        <Input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search bill #, customer, biller..."
          leftIcon={<Search className="w-4 h-4" />}
          className="flex-1"
        />
        {[
          {
            val: dateFilter, set: setDateFilter,
            opts: [
              { v: 'all',   l: 'All Time'    },
              { v: 'today', l: 'Today'       },
              { v: 'week',  l: 'Past 7 Days' },
              { v: 'month', l: 'Past 30 Days'},
            ],
          },
          {
            val: paymentFilter, set: setPaymentFilter,
            opts: [
              { v: 'all',  l: 'All Payments' },
              { v: 'cash', l: 'Cash'          },
              { v: 'card', l: 'Card'          },
            ],
          },
        ].map((f, i) => (
          <select key={i} value={f.val}
            onChange={e => f.set(e.target.value)}
            className={cn(
              'rounded-xl border px-3 py-2 text-sm outline-none min-w-[140px]',
              isDark
                ? 'bg-[#0a0805] border-[#2a1f0d] text-white'
                : 'bg-white border-amber-200 text-gray-900',
            )}>
            {f.opts.map(o => (
              <option key={o.v} value={o.v}>{o.l}</option>
            ))}
          </select>
        ))}

        <p className={cn(
          'self-center text-xs whitespace-nowrap',
          isDark ? 'text-gray-500' : 'text-gray-400',
        )}>
          {filtered.length} records
        </p>
      </div>

      {/* Table */}
      <div className={cn(
        'rounded-2xl border overflow-hidden',
        isDark ? 'bg-[#0f0a05] border-[#2a1f0d]' : 'bg-white border-amber-200',
      )}>
        <div className={cn(
          'px-4 py-3 border-b flex items-center justify-between',
          isDark ? 'border-[#2a1f0d]' : 'border-amber-100',
        )}>
          <h3 className={cn('font-bold', isDark ? 'text-white' : 'text-gray-900')}>
            Comprehensive Report
          </h3>
          <span className="text-xs text-amber-500 font-semibold">
            {allBills.length.toLocaleString()} records total
          </span>
        </div>

        <div className="overflow-x-auto max-h-[560px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className={cn(
              'sticky top-0 z-10',
              isDark ? 'bg-[#1a1208] text-gray-400' : 'bg-amber-50 text-gray-600',
            )}>
              <tr>
                <Th label="Date"     k="date"     />
                <Th label="Bill #"   k="billSerial"/>
                <Th label="Biller"   k="billerName"/>
                <Th label="Customer" k="customer"  />
                <Th label="Payment"  k="payment"   />
                <Th label="Status"   k="status"    />
                <Th label="Amount"   k="amount" end />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-gray-500">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-amber-500" />
                    Loading {allBills.length > 0
                      ? `${allBills.length.toLocaleString()} records...`
                      : 'data...'}
                  </td>
                </tr>
              ) : paginated.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-10 text-gray-500">
                    No records match filters
                  </td>
                </tr>
              ) : paginated.map(b => (
                <tr key={b.id} className={cn(
                  'border-t transition-colors',
                  isDark
                    ? 'border-[#2a1f0d] hover:bg-[#1a1208]/60'
                    : 'border-amber-100 hover:bg-amber-50/50',
                )}>
                  <td className={cn('px-4 py-3 text-xs',
                    isDark ? 'text-gray-400' : 'text-gray-500')}>
                    {toDate(b.createdAt).toLocaleDateString('en-PK')}
                  </td>
                  <td className={cn('px-4 py-3 font-mono font-semibold text-xs',
                    isDark ? 'text-white' : 'text-gray-900')}>
                    {b.billSerial || b.billNumber || b.id.slice(0, 8)}
                  </td>
                  <td className={cn('px-4 py-3 text-xs',
                    isDark ? 'text-gray-300' : 'text-gray-700')}>
                    {b.billerName || b.cashierName || 'System'}
                  </td>
                  <td className={cn('px-4 py-3 text-xs',
                    isDark ? 'text-gray-300' : 'text-gray-700')}>
                    {b.customer?.name || b.customerName || 'Walk-in'}
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn(
                      'inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase',
                      (b.paymentMethod || b.paymentType || '').toLowerCase() === 'cash'
                        ? 'bg-emerald-500/10 text-emerald-500'
                        : 'bg-blue-500/10 text-blue-500',
                    )}>
                      {b.paymentMethod || b.paymentType || 'N/A'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={
                      b.paymentStatus === 'paid' ? 'success' : 'warning'
                    }>
                      {b.paymentStatus || 'unpaid'}
                    </Badge>
                  </td>
                  <td className={cn('px-4 py-3 text-end font-bold',
                    isDark ? 'text-white' : 'text-gray-900')}>
                    {fmt(b.totalAmount || b.grandTotal || b.total || 0)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className={cn(
          'px-4 py-3 border-t text-xs flex items-center justify-between',
          isDark ? 'border-[#2a1f0d] text-gray-500' : 'border-amber-100 text-gray-400',
        )}>
          <span>
            Page {page}/{totalPages} •{' '}
            {filtered.length.toLocaleString()} filtered •{' '}
            {allBills.length.toLocaleString()} total
          </span>
          {totalPages > 1 && (
            <div className="flex items-center gap-1">
              <button
                disabled={page === 1}
                onClick={() => setPage(p => p - 1)}
                className="px-2 py-1 rounded hover:bg-amber-500/10
                           disabled:opacity-30 transition-colors"
              >
                ←
              </button>
              {Array.from(
                { length: Math.min(5, totalPages) },
                (_, i) => {
                  let p = page <= 3
                    ? i + 1
                    : page >= totalPages - 2
                      ? totalPages - 4 + i
                      : page - 2 + i;
                  p = Math.max(1, Math.min(totalPages, p));
                  return (
                    <button key={p} onClick={() => setPage(p)}
                      className={cn(
                        'w-7 h-7 rounded text-xs font-medium transition-colors',
                        page === p
                          ? 'bg-amber-500 text-white'
                          : 'hover:bg-amber-500/10',
                      )}>
                      {p}
                    </button>
                  );
                }
              )}
              <button
                disabled={page === totalPages}
                onClick={() => setPage(p => p + 1)}
                className="px-2 py-1 rounded hover:bg-amber-500/10
                           disabled:opacity-30 transition-colors"
              >
                →
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ReportsAnalytics;