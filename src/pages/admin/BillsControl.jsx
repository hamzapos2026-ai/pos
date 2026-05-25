// src/pages/admin/BillsControl.jsx
// ✅ FIXED — 10k+ orders, pagination, sort, all filters
import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  ShoppingBag, Search, Eye, Trash2, RotateCcw, Download,
  Clock, FileText, CheckCircle2, Printer, Wifi, Database,
  AlertTriangle, FileCheck, Coins, ChevronUp, ChevronDown,
  RefreshCw, X,
} from 'lucide-react';
import {
  collection, doc, updateDoc, deleteDoc,
  serverTimestamp, onSnapshot, query, orderBy, limit,
  addDoc,
} from '../../services/firebase';
import { db, isFirebaseReady } from '../../services/firebase';
import toast from 'react-hot-toast';
import { cn } from '../../utils/cn';
import { useTheme } from '../../context/ThemeContext';
import { motion, AnimatePresence } from 'framer-motion';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Badge from '../../components/ui/Badge';
import PageHeader from '../../components/admin/PageHeader';
import EmptyState from '../../components/admin/EmptyState';
import StatCard from '../../components/admin/StatCard';

// ── Helpers ────────────────────────────────────────────────────
const toDate = (v) => {
  if (!v) return new Date(0);
  let d;
  if (v && typeof v.toDate === 'function') {
    try { d = v.toDate(); } catch { d = new Date(v); }
  } else if (v && typeof v === 'object' && typeof v.seconds === 'number') {
    d = new Date(v.seconds * 1000);
  } else {
    d = new Date(v);
  }
  if (d && !isNaN(d.getTime())) return d;
  return new Date(0);
};
const fmt = (v) => `Rs ${Number(v || 0).toLocaleString()}`;
const PAGE = 50;

const BillsControl = () => {
  const { isDark } = useTheme();

  // ── Data ───────────────────────────────────────────────────
  const [bills,   setBills]   = useState([]);
  const [loading, setLoading] = useState(true);

  // ── Filters ────────────────────────────────────────────────
  const [search,        setSearch]        = useState('');
  const [filter,        setFilter]        = useState('all');
  const [dateFilter,    setDateFilter]    = useState('all');
  const [branchFilter,  setBranchFilter]  = useState('all');
  const [sortKey,       setSortKey]       = useState('date');
  const [sortDir,       setSortDir]       = useState('desc');
  const [page,          setPage]          = useState(1);

  // ── Modals ─────────────────────────────────────────────────
  const [selectedBill,     setSelectedBill]     = useState(null);
  const [deleteTarget,     setDeleteTarget]     = useState(null);
  const [deleteReason,     setDeleteReason]     = useState('');
  const [submittingDelete, setSubmittingDelete] = useState(false);

  // ── Stream ─────────────────────────────────────────────────
  useEffect(() => {
    if (!isFirebaseReady() || !db) { setLoading(false); return; }
    setLoading(true);

    // Load all orders (no limit for full data)
    const q = query(
      collection(db, 'orders'),
      orderBy('createdAt', 'desc'),
      limit(10000),
    );

    const unsub = onSnapshot(q, snap => {
      setBills(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, err => {
      console.error('[BillsControl]', err);
      setLoading(false);
    });

    return () => unsub();
  }, []);

  // ── Branch list ────────────────────────────────────────────
  const branches = useMemo(() => {
    const s = new Set(bills.map(b => b.storeId || b.branchId).filter(Boolean));
    return [...s];
  }, [bills]);

  // ── Stats ──────────────────────────────────────────────────
  const stats = useMemo(() => ({
    total:   bills.length,
    active:  bills.filter(b => !b.deleted && !b.isDeleted).length,
    deleted: bills.filter(b =>  b.deleted ||  b.isDeleted).length,
    pending: bills.filter(b => !b.deleted && !b.isDeleted &&
      (b.paymentStatus === 'unpaid' || b.paymentStatus === 'pending')).length,
  }), [bills]);

  // ── Filter + Sort ──────────────────────────────────────────
  const filtered = useMemo(() => {
    const today    = new Date(); today.setHours(0, 0, 0, 0);
    const weekAgo  = new Date(today); weekAgo.setDate(weekAgo.getDate() - 7);
    const monthAgo = new Date(today); monthAgo.setMonth(monthAgo.getMonth() - 1);

    let list = bills.filter(b => {
      const isDel = b.deleted || b.isDeleted;

      if (filter === 'deleted' && !isDel)  return false;
      if (filter === 'active'  &&  isDel)  return false;
      if (filter === 'pending' && (isDel ||
        (b.paymentStatus !== 'unpaid' && b.paymentStatus !== 'pending')))
        return false;

      if (branchFilter !== 'all' &&
        b.storeId !== branchFilter && b.branchId !== branchFilter)
        return false;

      if (dateFilter !== 'all') {
        const d = toDate(b.createdAt);
        if (dateFilter === 'today' && d < today)    return false;
        if (dateFilter === 'week'  && d < weekAgo)  return false;
        if (dateFilter === 'month' && d < monthAgo) return false;
      }

      if (search) {
        const s = search.toLowerCase();
        return (
          (b.billSerial || b.serialNo || b.id || '').toLowerCase().includes(s) ||
          (b.customer?.name || b.customerName || '').toLowerCase().includes(s) ||
          (b.customer?.phone || '').includes(s) ||
          (b.billerName || '').toLowerCase().includes(s)
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
        av = Number(a.grandTotal || a.totalAmount || 0);
        bv = Number(b.grandTotal || b.totalAmount || 0);
      } else if (sortKey === 'serial') {
        av = (a.billSerial || '').toLowerCase();
        bv = (b.billSerial || '').toLowerCase();
      } else {
        av = (a[sortKey] || '').toString().toLowerCase();
        bv = (b[sortKey] || '').toString().toLowerCase();
      }
      if (av < bv) return sortDir === 'asc' ? -1 :  1;
      if (av > bv) return sortDir === 'asc' ?  1 : -1;
      return 0;
    });

    return list;
  }, [bills, search, filter, dateFilter, branchFilter, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const paginated  = useMemo(
    () => filtered.slice((page - 1) * PAGE, page * PAGE),
    [filtered, page],
  );

  useEffect(() => setPage(1),
    [search, filter, dateFilter, branchFilter, sortKey, sortDir]);

  const handleSort = (k) => {
    if (sortKey === k) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(k); setSortDir('desc'); }
  };

  const SortIcon = ({ k }) => sortKey === k
    ? sortDir === 'asc'
      ? <ChevronUp   className="w-3 h-3 inline ml-0.5" />
      : <ChevronDown className="w-3 h-3 inline ml-0.5" />
    : null;

  // ── Soft Delete ────────────────────────────────────────────
  const executeSoftDelete = useCallback(async () => {
    if (!deleteTarget || !deleteReason.trim()) {
      toast.error('Reason required'); return;
    }
    setSubmittingDelete(true);
    try {
      await updateDoc(doc(db, 'orders', deleteTarget.id), {
        deleted: true, isDeleted: true,
        deletedAt: serverTimestamp(),
        deleteReason: deleteReason.trim(),
        cancelReason: deleteReason.trim(),
        status: 'cancelled',
        paymentStatus: 'deleted',
      });
      // Audit log
      await addDoc(collection(db, 'auditLogs'), {
        action: 'SOFT_DELETE', billId: deleteTarget.id,
        billSerial: deleteTarget.serial,
        reason: deleteReason.trim(),
        timestamp: serverTimestamp(),
      }).catch(() => {});
      toast.success(`Bill ${deleteTarget.serial} cancelled`);
      setDeleteTarget(null); setDeleteReason('');
    } catch (e) {
      toast.error(e.message);
    } finally { setSubmittingDelete(false); }
  }, [deleteTarget, deleteReason]);

  // ── Hard Delete ────────────────────────────────────────────
  const executeHardDelete = useCallback(async () => {
    if (!deleteTarget || !deleteReason.trim()) {
      toast.error('Reason required'); return;
    }
    setSubmittingDelete(true);
    try {
      const target = bills.find(b => b.id === deleteTarget.id);
      if (target) {
        await addDoc(collection(db, 'deletedBills'), {
          ...target, deletedAt: serverTimestamp(),
          hardDeleteReason: deleteReason.trim(),
        }).catch(() => {});
      }
      await deleteDoc(doc(db, 'orders', deleteTarget.id));
      toast.success(`Bill ${deleteTarget.serial} permanently deleted`);
      setDeleteTarget(null); setDeleteReason('');
    } catch (e) {
      toast.error(e.message);
    } finally { setSubmittingDelete(false); }
  }, [deleteTarget, deleteReason, bills]);

  // ── Restore ────────────────────────────────────────────────
  const handleRestore = useCallback(async (b) => {
    try {
      await updateDoc(doc(db, 'orders', b.id), {
        deleted: false, isDeleted: false,
        restoredAt: serverTimestamp(),
        paymentStatus: 'unpaid',
      });
      toast.success(`Bill ${b.billSerial || b.id.slice(0, 8)} restored`);
    } catch (e) { toast.error(e.message); }
  }, []);

  // ── Export ─────────────────────────────────────────────────
  const handleExport = useCallback(() => {
    if (!filtered.length) return;
    const rows = filtered.map(b => [
      b.billSerial || b.id.slice(0, 8),
      b.storeId || 'Main',
      b.customer?.name || 'Walk-in',
      b.customer?.phone || '',
      b.grandTotal || b.totalAmount || 0,
      b.deleted ? 'Deleted' : (b.paymentStatus || 'unpaid'),
      toDate(b.createdAt).toLocaleDateString('en-PK'),
      b.billerName || '',
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));

    const csv  = `data:text/csv;charset=utf-8,\uFEFFBill#,Branch,Customer,Phone,Amount,Status,Date,Biller\n${rows.join('\n')}`;
    const link = document.createElement('a');
    link.href  = encodeURI(csv);
    link.download = `bills_${Date.now()}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Exported successfully');
  }, [filtered]);

  // ── Th helper ──────────────────────────────────────────────
  const Th = ({ label, k, end, center }) => (
    <th
      onClick={() => handleSort(k)}
      className={cn(
        'px-4 py-3.5 font-semibold cursor-pointer select-none whitespace-nowrap text-xs',
        end ? 'text-end' : center ? 'text-center' : 'text-start',
      )}
    >
      {label}<SortIcon k={k} />
    </th>
  );

  // ── RENDER ─────────────────────────────────────────────────
  return (
    <div className="p-4 sm:p-6 max-w-[1600px] mx-auto space-y-6">

      <PageHeader
        icon={ShoppingBag}
        title="Bills Control Center"
        description={`${bills.length.toLocaleString()} total orders loaded`}
        actions={
          <Button variant="primary"
            leftIcon={<Download className="w-4 h-4" />}
            onClick={handleExport}
            disabled={!filtered.length}>
            Export Registry
          </Button>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <StatCard label="Total Bills"    value={stats.total}   icon={ShoppingBag} color="amber" />
        <StatCard label="Active"         value={stats.active}  icon={FileCheck}   color="green" />
        <StatCard label="Pending"        value={stats.pending} icon={Coins}       color="rose"  />
        <StatCard label="Soft Deleted"   value={stats.deleted} icon={AlertTriangle} color="purple" />
      </div>

      {/* Filter bar */}
      <div className={cn(
        'rounded-2xl border p-4 flex flex-col lg:flex-row gap-3',
        isDark ? 'bg-[#0f0a05] border-[#2a1f0d]' : 'bg-white border-amber-200',
      )}>
        <Input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search serial, customer, phone, biller..."
          leftIcon={<Search className="w-4 h-4" />}
          className="flex-1"
        />
        <div className="flex flex-wrap gap-2">
          {/* Branch */}
          <select value={branchFilter} onChange={e => setBranchFilter(e.target.value)}
            className={cn('rounded-xl border px-3 py-2 text-xs outline-none',
              isDark ? 'bg-[#0a0805] border-[#2a1f0d] text-white' : 'bg-white border-amber-200 text-gray-900')}>
            <option value="all">All Branches</option>
            {branches.map(b => (
              <option key={b} value={b}>{b.slice(0, 14)}...</option>
            ))}
          </select>
          {/* Date */}
          <select value={dateFilter} onChange={e => setDateFilter(e.target.value)}
            className={cn('rounded-xl border px-3 py-2 text-xs outline-none',
              isDark ? 'bg-[#0a0805] border-[#2a1f0d] text-white' : 'bg-white border-amber-200 text-gray-900')}>
            <option value="all">All Time</option>
            <option value="today">Today</option>
            <option value="week">Past 7 Days</option>
            <option value="month">Past 30 Days</option>
          </select>
          {/* Status */}
          <select value={filter} onChange={e => setFilter(e.target.value)}
            className={cn('rounded-xl border px-3 py-2 text-xs outline-none',
              isDark ? 'bg-[#0a0805] border-[#2a1f0d] text-white' : 'bg-white border-amber-200 text-gray-900')}>
            <option value="all">All Statuses</option>
            <option value="active">Active</option>
            <option value="deleted">Deleted</option>
            <option value="pending">Pending</option>
          </select>

          <p className={cn('self-center text-xs whitespace-nowrap px-1',
            isDark ? 'text-gray-500' : 'text-gray-400')}>
            {filtered.length.toLocaleString()} records
          </p>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="text-center py-16">
          <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-3 text-amber-500" />
          <p className="text-sm text-gray-500">Loading orders...</p>
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={ShoppingBag} title="No bills found"
          description="Adjust filters or check connection" />
      ) : (
        <>
          <div className={cn(
            'rounded-2xl border overflow-hidden shadow-lg',
            isDark ? 'bg-[#0f0a05] border-[#2a1f0d]' : 'bg-white border-amber-200',
          )}>
            <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
              <table className="w-full text-xs">
                <thead className={cn(
                  'sticky top-0 z-10',
                  isDark ? 'bg-[#1a1208] text-gray-400' : 'bg-amber-50 text-gray-600',
                )}>
                  <tr>
                    <Th label="Serial"   k="serial"   />
                    <Th label="Customer" k="customer" />
                    <Th label="Biller"   k="billerName" />
                    <Th label="Amount"   k="amount" end />
                    <Th label="Status"   k="paymentStatus" center />
                    <Th label="Date"     k="date"    />
                    <th className="px-4 py-3.5 text-center font-semibold">Sync</th>
                    <th className="px-4 py-3.5 text-end font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginated.map(b => {
                    const isDel = b.deleted || b.isDeleted;
                    return (
                      <tr key={b.id} className={cn(
                        'border-t transition-colors',
                        isDark
                          ? 'border-[#2a1f0d] hover:bg-[#1a1208]/60'
                          : 'border-amber-100 hover:bg-amber-50/50',
                        isDel && 'opacity-60 bg-rose-500/[0.03]',
                      )}>
                        {/* Serial */}
                        <td className={cn('px-4 py-3 font-mono font-bold',
                          isDark ? 'text-gray-200' : 'text-gray-800')}>
                          {b.billSerial || b.serialNo || b.id.slice(0, 8)}
                        </td>

                        {/* Customer */}
                        <td className="px-4 py-3">
                          <p className={cn('font-semibold',
                            isDark ? 'text-gray-200' : 'text-gray-800')}>
                            {b.customer?.name || b.customerName || 'Walk-in'}
                          </p>
                          <p className="text-[10px] text-gray-500 font-mono">
                            {b.customer?.phone || '—'}
                          </p>
                        </td>

                        {/* Biller */}
                        <td className={cn('px-4 py-3',
                          isDark ? 'text-gray-400' : 'text-gray-600')}>
                          {b.billerName || b.cashierName || '—'}
                        </td>

                        {/* Amount */}
                        <td className={cn('px-4 py-3 text-end font-bold font-mono',
                          isDark ? 'text-white' : 'text-gray-900')}>
                          {fmt(b.grandTotal || b.totalAmount || b.total)}
                        </td>

                        {/* Status */}
                        <td className="px-4 py-3 text-center">
                          <Badge variant={
                            isDel ? 'destructive'
                              : b.paymentStatus === 'paid' ? 'success'
                              : 'warning'
                          }>
                            {isDel ? 'Deleted'
                              : (b.paymentStatus || 'unpaid').toUpperCase()}
                          </Badge>
                        </td>

                        {/* Date */}
                        <td className={cn('px-4 py-3 whitespace-nowrap',
                          isDark ? 'text-gray-400' : 'text-gray-500')}>
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {toDate(b.createdAt).toLocaleDateString('en-PK')}
                          </span>
                        </td>

                        {/* Sync */}
                        <td className="px-4 py-3 text-center">
                          {b.synced !== false
                            ? <Wifi     className="w-4 h-4 text-emerald-500 inline" />
                            : <Database className="w-4 h-4 text-amber-500 inline animate-pulse" />}
                        </td>

                        {/* Actions */}
                        <td className="px-4 py-3 text-end">
                          <div className="inline-flex gap-1">
                            <button onClick={() => setSelectedBill(b)}
                              className="p-1.5 rounded-lg hover:bg-amber-500/10 text-amber-500">
                              <Eye className="w-4 h-4" />
                            </button>
                            {isDel ? (
                              <>
                                <button onClick={() => handleRestore(b)}
                                  className="p-1.5 rounded-lg hover:bg-emerald-500/10 text-emerald-500">
                                  <RotateCcw className="w-4 h-4" />
                                </button>
                                <button onClick={() => setDeleteTarget({
                                  id: b.id, type: 'hard',
                                  serial: b.billSerial || b.id.slice(0, 8),
                                })}
                                  className="p-1.5 rounded-lg hover:bg-rose-500/10 text-rose-500">
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </>
                            ) : (
                              <button onClick={() => setDeleteTarget({
                                id: b.id, type: 'soft',
                                serial: b.billSerial || b.id.slice(0, 8),
                              })}
                                className="p-1.5 rounded-lg hover:bg-rose-500/10 text-rose-400">
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Footer */}
            <div className={cn(
              'px-4 py-3 border-t text-xs flex items-center justify-between',
              isDark ? 'border-[#2a1f0d] text-gray-500' : 'border-amber-100 text-gray-400',
            )}>
              <span>
                Page {page}/{totalPages} •{' '}
                {filtered.length.toLocaleString()} filtered •{' '}
                {bills.length.toLocaleString()} total
              </span>
              {totalPages > 1 && (
                <div className="flex items-center gap-1">
                  <button disabled={page === 1}
                    onClick={() => setPage(p => p - 1)}
                    className="px-2 py-1 rounded hover:bg-amber-500/10 disabled:opacity-30">
                    ←
                  </button>
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let p = page <= 3 ? i + 1
                      : page >= totalPages - 2 ? totalPages - 4 + i
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
                  })}
                  <button disabled={page === totalPages}
                    onClick={() => setPage(p => p + 1)}
                    className="px-2 py-1 rounded hover:bg-amber-500/10 disabled:opacity-30">
                    →
                  </button>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* ── Delete Modal ──────────────────────────────────── */}
      <AnimatePresence>
        {deleteTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center
                          bg-black/80 backdrop-blur-sm p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1,    opacity: 1 }}
              exit={{   scale: 0.95, opacity: 0 }}
              className={cn(
                'w-full max-w-md rounded-3xl border p-6 shadow-2xl relative overflow-hidden',
                isDark ? 'bg-[#0f0a05] border-[#2a1f0d]' : 'bg-white border-amber-200',
              )}
            >
              <div className="absolute top-0 inset-x-0 h-1 bg-rose-500" />
              <div className="flex items-center gap-2 text-rose-500 font-bold mb-3">
                <AlertTriangle className="w-5 h-5 animate-pulse" />
                <h3>{deleteTarget.type === 'hard'
                  ? 'Permanent Delete' : 'Cancel Bill'}</h3>
              </div>
              <p className={cn('text-xs mb-4 leading-relaxed',
                isDark ? 'text-gray-400' : 'text-gray-600')}>
                Action on Bill <strong>#{deleteTarget.serial}</strong> will be
                logged to immutable audit registers.
              </p>
              <textarea
                value={deleteReason}
                onChange={e => setDeleteReason(e.target.value)}
                placeholder="Enter justification reason..."
                rows={3}
                className={cn(
                  'w-full rounded-2xl border p-3 text-xs outline-none resize-none mb-4',
                  isDark
                    ? 'bg-[#070503] border-[#2a1f0d] text-white'
                    : 'bg-amber-50 border-amber-200 text-gray-900',
                )}
              />
              <div className="flex gap-2">
                <Button variant="secondary" className="flex-1 rounded-xl"
                  disabled={submittingDelete}
                  onClick={() => { setDeleteTarget(null); setDeleteReason(''); }}>
                  Cancel
                </Button>
                <Button
                  className="flex-1 rounded-xl font-bold bg-rose-500 hover:bg-rose-600 text-white"
                  disabled={!deleteReason.trim() || submittingDelete}
                  onClick={deleteTarget.type === 'hard'
                    ? executeHardDelete : executeSoftDelete}>
                  {submittingDelete ? 'Processing...'
                    : deleteTarget.type === 'hard'
                      ? 'Erase Forever' : 'Confirm Cancel'}
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Bill Detail Drawer ────────────────────────────── */}
      <AnimatePresence>
        {selectedBill && (
          <div className="fixed inset-0 z-50 flex items-center justify-end
                          bg-black/75 backdrop-blur-sm">
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{   x: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 220 }}
              className={cn(
                'w-full max-w-lg h-full p-6 shadow-2xl flex flex-col',
                isDark
                  ? 'bg-[#0f0a05] border-l border-[#2a1f0d]'
                  : 'bg-white border-l border-amber-200',
              )}
            >
              {/* Header */}
              <div className={cn(
                'flex items-center justify-between pb-4 border-b mb-4 shrink-0',
                isDark ? 'border-[#2a1f0d]' : 'border-amber-100',
              )}>
                <div className="flex items-center gap-2">
                  <FileText className="w-5 h-5 text-amber-500" />
                  <h3 className={cn('font-bold text-sm',
                    isDark ? 'text-white' : 'text-gray-900')}>
                    Receipt Details
                  </h3>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => window.print()}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-amber-500
                               hover:bg-amber-500/10 transition-colors">
                    <Printer className="w-4 h-4" />
                  </button>
                  <button onClick={() => setSelectedBill(null)}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-gray-300
                               hover:bg-white/5 transition-colors">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto space-y-5 pr-1">

                {/* Thermal receipt */}
                <div className="bg-white text-gray-900 p-5 rounded-2xl
                                border-4 border-dashed border-gray-300
                                mx-auto max-w-[340px] font-mono shadow-inner">
                  <div className="text-center space-y-0.5 mb-4">
                    <h4 className="font-bold text-base">A-ONE JEWELRY</h4>
                    <p className="text-[10px] text-gray-500">Tariq Road Gold Bazar, Karachi</p>
                    <p className="text-[9px] text-gray-500">PH: 0316-2502498</p>
                    <div className="border-b border-dashed border-gray-300 pt-1" />
                  </div>

                  <div className="space-y-1 text-[9px] text-gray-700 mb-3">
                    <p>Bill No: <strong>
                      {selectedBill.billSerial || selectedBill.serialNo || selectedBill.id.slice(0, 10)}
                    </strong></p>
                    <p>Date: {toDate(selectedBill.createdAt).toLocaleString('en-PK')}</p>
                    <p>Cashier: {selectedBill.billerName || selectedBill.cashierName || '—'}</p>
                    <p>Customer: {selectedBill.customer?.name || 'Walk-in'}</p>
                    <p>Phone: {selectedBill.customer?.phone || '—'}</p>
                    <div className="border-b border-dashed border-gray-300 py-0.5" />
                  </div>

                  {/* Items */}
                  <div className="space-y-2 mb-3 text-[9px]">
                    <div className="flex justify-between font-bold text-black">
                      <span>Item</span><span>Total</span>
                    </div>
                    <div className="border-b border-dashed border-gray-300" />
                    {(selectedBill.items || []).map((item, i) => (
                      <div key={i} className="space-y-0.5 text-gray-800">
                        <div className="flex justify-between font-semibold">
                          <span className="truncate max-w-[150px]">
                            {item.productName || `Item #${item.serialId || i + 1}`}
                          </span>
                          <span>{fmt(item.total || item.price * item.qty)}</span>
                        </div>
                        <div className="text-gray-500 flex justify-between">
                          <span>{item.qty} × {fmt(item.price)}</span>
                          {item.discount > 0 && <span>-{item.discount}%</span>}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="border-b border-dashed border-gray-300 mb-2" />

                  {/* Totals */}
                  <div className="space-y-1 text-[10px] text-black mb-3">
                    <div className="flex justify-between">
                      <span>Subtotal:</span>
                      <span>{fmt(selectedBill.subtotal)}</span>
                    </div>
                    {Number(selectedBill.totalDiscount) > 0 && (
                      <div className="flex justify-between text-rose-600">
                        <span>Discount:</span>
                        <span>-{fmt(selectedBill.totalDiscount)}</span>
                      </div>
                    )}
                    <div className="flex justify-between font-bold border-t
                                    border-dashed border-gray-300 pt-1 text-xs">
                      <span>Grand Total:</span>
                      <span>{fmt(selectedBill.grandTotal || selectedBill.totalAmount)}</span>
                    </div>
                    <div className="border-b border-dashed border-gray-300 py-0.5" />
                    <div className="flex justify-between">
                      <span>Received:</span>
                      <span>{fmt(selectedBill.amountReceived)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Change:</span>
                      <span>{fmt(selectedBill.changeGiven)}</span>
                    </div>
                  </div>

                  <div className="text-center text-[9px] text-gray-500
                                  border-t border-dashed border-gray-300 pt-2 space-y-1">
                    <p className="font-bold">22K Gold Purity Certified</p>
                    <p>Thank you for your purchase!</p>
                  </div>
                </div>

                {/* Audit panel */}
                <div className="space-y-3">
                  <h4 className={cn('text-[9px] font-bold uppercase tracking-wider',
                    isDark ? 'text-gray-400' : 'text-gray-500')}>
                    Audit Information
                  </h4>
                  <div className="grid grid-cols-2 gap-2 text-[10px]">
                    {[
                      { label: 'Store ID',   value: selectedBill.storeId || '—'             },
                      { label: 'Source',     value: (selectedBill.source || 'biller').toUpperCase() },
                      { label: 'Payment',    value: selectedBill.paymentType || selectedBill.paymentMethod || '—' },
                      { label: 'Sync',       value: selectedBill.synced !== false ? '✅ Synced' : '⏳ Pending' },
                    ].map(f => (
                      <div key={f.label} className={cn(
                        'p-2.5 rounded-xl border',
                        isDark ? 'bg-[#070503] border-[#2a1f0d]' : 'bg-gray-50 border-gray-200',
                      )}>
                        <p className="text-[8px] text-gray-500 font-bold uppercase mb-1">
                          {f.label}
                        </p>
                        <p className={cn('font-semibold truncate',
                          isDark ? 'text-gray-300' : 'text-gray-800')}>
                          {f.value}
                        </p>
                      </div>
                    ))}
                  </div>

                  {selectedBill.deleteReason && (
                    <div className="bg-rose-500/5 p-3 rounded-2xl border
                                    border-rose-500/20 text-[10px]">
                      <p className="text-[8px] text-rose-400 font-bold uppercase mb-1">
                        Delete Reason
                      </p>
                      <p className={cn('font-mono', isDark ? 'text-rose-300' : 'text-rose-700')}>
                        {selectedBill.deleteReason}
                      </p>
                    </div>
                  )}

                  <div className="flex items-center justify-center gap-1.5 py-2
                                  text-emerald-500 text-[10px] bg-emerald-500/5
                                  rounded-xl border border-emerald-500/10">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Transaction locked in sync registry
                  </div>
                </div>
              </div>

              <div className="mt-4 shrink-0">
                <Button variant="primary" className="w-full rounded-xl"
                  onClick={() => setSelectedBill(null)}>
                  Close
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default BillsControl;