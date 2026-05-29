// File: src/pages/admin/BillsControl.jsx
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  ShoppingBag, Search, Eye, Trash2, RotateCcw, Download,
  Clock, FileText, CheckCircle2, Printer, Wifi, Database,
  AlertTriangle, FileCheck, Coins, ChevronUp, ChevronDown,
  X, Filter, DollarSign, Check, RefreshCw, MoreVertical,
} from 'lucide-react';
import {
  collection, doc, updateDoc, deleteDoc,
  serverTimestamp, onSnapshot, query, orderBy, limit,
  addDoc,
} from '../../services/firebase';
import { db, isFirebaseReady } from '../../services/firebase';
import toast from 'react-hot-toast';
import { cn } from '../../utils/cn';
import { motion, AnimatePresence } from 'framer-motion';
import Button from '../../components/ui/Button';
import DataTable from '../../components/manager/DataTable';

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
  return d && !isNaN(d.getTime()) ? d : new Date(0);
};

const fmt = (v) => `Rs ${Number(v || 0).toLocaleString()}`;

// ── Status Badge ───────────────────────────────────────────────
const StatusBadge = ({ variant, children }) => {
  const variants = {
    success: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25',
    warning: 'bg-amber-500/15   text-amber-400   border-amber-500/25',
    destructive: 'bg-rose-500/15    text-rose-400    border-rose-500/25',
    info: 'bg-blue-500/15    text-blue-400    border-blue-500/25',
  };
  return (
    <span className={cn(
      'inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold border whitespace-nowrap',
      variants[variant] || variants.info
    )}>
      {children}
    </span>
  );
};

// ── Stat Card ──────────────────────────────────────────────────
const StatCard = ({ label, value, icon: Icon, color }) => (
  <motion.div
    initial={{ opacity: 0, scale: 0.95 }}
    animate={{ opacity: 1, scale: 1 }}
    className="relative overflow-hidden rounded-xl border border-[#2a1f0d] bg-gradient-to-br from-[#1a1208] to-[#0f0a05] p-3"
  >
    <div className={cn(
      'absolute -top-8 -right-8 w-24 h-24 rounded-full blur-2xl opacity-20',
      color === 'amber' && 'bg-amber-500',
      color === 'green' && 'bg-emerald-500',
      color === 'red' && 'bg-rose-500',
      color === 'purple' && 'bg-violet-500',
      color === 'blue' && 'bg-blue-500',
    )} />
    <div className="flex items-center justify-between relative">
      <div className="min-w-0">
        <p className="text-[9px] text-slate-500 font-medium uppercase tracking-wide truncate">{label}</p>
        <p className="text-base sm:text-lg font-bold text-gray-100 mt-0.5">
          {Number(value || 0).toLocaleString()}
        </p>
      </div>
      <div className={cn(
        'p-1.5 rounded-lg shrink-0',
        color === 'amber' && 'bg-amber-500/15  text-amber-500',
        color === 'green' && 'bg-emerald-500/15 text-emerald-500',
        color === 'red' && 'bg-rose-500/15    text-rose-500',
        color === 'purple' && 'bg-violet-500/15  text-violet-500',
        color === 'blue' && 'bg-blue-500/15    text-blue-500',
      )}>
        <Icon className="w-3.5 h-3.5" />
      </div>
    </div>
  </motion.div>
);

// ── Action Menu ────────────────────────────────────────────────
const ActionMenu = ({ row, onView, onApprove, onMarkPaid, onReset, onSoftDelete, onHardDelete }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const isDel = row.deleted || row.isDeleted;
  const total = Number(row.grandTotal || row.totalAmount || row.total || 0);
  const paid = Number(row.paidAmount || 0);
  const hasOut = total - paid > 0;

  return (
    <div className="relative" ref={ref} onClick={(e) => e.stopPropagation()}>
      <button
        onClick={() => setOpen(!open)}
        className="p-1 rounded bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 transition-all border border-amber-500/20"
      >
        <MoreVertical className="w-3.5 h-3.5" />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -4 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 mt-1 w-48 rounded-xl border border-[#2a1f0d] bg-[#1a1208] shadow-xl z-50 overflow-hidden"
          >
            <div className="py-1 px-1">
              <button
                onClick={() => { setOpen(false); onView(); }}
                className="w-full text-left px-2.5 py-1.5 text-xs text-slate-300 hover:bg-amber-500/10 hover:text-amber-400 rounded-lg transition-all flex items-center gap-2"
              >
                <Eye className="w-3.5 h-3.5 text-amber-500" /> View Details
              </button>

              {!isDel && (row.status === 'pending' || row.paymentStatus === 'unpaid' || !row.paymentStatus) && (
                <button
                  onClick={() => { setOpen(false); onApprove(); }}
                  className="w-full text-left px-2.5 py-1.5 text-xs text-emerald-400 hover:bg-emerald-500/10 rounded-lg transition-all flex items-center gap-2"
                >
                  <Check className="w-3.5 h-3.5 text-emerald-500" /> Approve
                </button>
              )}

              {!isDel && hasOut && (
                <button
                  onClick={() => { setOpen(false); onMarkPaid(); }}
                  className="w-full text-left px-2.5 py-1.5 text-xs text-emerald-400 hover:bg-emerald-500/10 rounded-lg transition-all flex items-center gap-2"
                >
                  <Coins className="w-3.5 h-3.5 text-emerald-500" /> Mark Paid
                </button>
              )}

              {!isDel && row.paymentStatus === 'paid' && (
                <button
                  onClick={() => { setOpen(false); onReset(); }}
                  className="w-full text-left px-2.5 py-1.5 text-xs text-amber-400 hover:bg-amber-500/10 rounded-lg transition-all flex items-center gap-2"
                >
                  <RefreshCw className="w-3.5 h-3.5 text-amber-500" /> Reset Pending
                </button>
              )}

              <div className="my-1 border-t border-[#2a1f0d]" />

              {!isDel && (
                <button
                  onClick={() => { setOpen(false); onSoftDelete(); }}
                  className="w-full text-left px-2.5 py-1.5 text-xs text-rose-400 hover:bg-rose-500/10 rounded-lg transition-all flex items-center gap-2"
                >
                  <Trash2 className="w-3.5 h-3.5 text-rose-500" /> Cancel Bill
                </button>
              )}

              {isDel && (
                <>
                  <button
                    onClick={() => { setOpen(false); onReset(); }}
                    className="w-full text-left px-2.5 py-1.5 text-xs text-emerald-400 hover:bg-emerald-500/10 rounded-lg transition-all flex items-center gap-2"
                  >
                    <RotateCcw className="w-3.5 h-3.5 text-emerald-500" /> Restore
                  </button>
                  <button
                    onClick={() => { setOpen(false); onHardDelete(); }}
                    className="w-full text-left px-2.5 py-1.5 text-xs text-rose-400 hover:bg-rose-500/10 rounded-lg transition-all flex items-center gap-2"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-rose-500" /> Erase Forever
                  </button>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const BillsControl = () => {
  const [bills, setBills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('all');
  const [branchFilter, setBranchFilter] = useState('all');
  const [showFilters, setShowFilters] = useState(false);
  const [selectedBill, setSelectedBill] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteReason, setDeleteReason] = useState('');
  const [submittingDelete, setSubmittingDelete] = useState(false);
  const [loadingAction, setLoadingAction] = useState(null);

  useEffect(() => {
    if (!isFirebaseReady() || !db) { setLoading(false); return; }
    setLoading(true);
    const q = query(collection(db, 'orders'), orderBy('createdAt', 'desc'), limit(10000));
    const unsub = onSnapshot(q, snap => {
      setBills(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, err => {
      console.error('[BillsControl]', err);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const branches = useMemo(() => {
    const s = new Set(bills.map(b => b.storeId || b.branchId).filter(Boolean));
    return [...s].sort();
  }, [bills]);

  const stats = useMemo(() => ({
    total: bills.length,
    active: bills.filter(b => !b.deleted && !b.isDeleted).length,
    deleted: bills.filter(b => b.deleted || b.isDeleted).length,
    pending: bills.filter(b => !b.deleted && !b.isDeleted &&
      (b.paymentStatus === 'unpaid' || b.paymentStatus === 'pending' || !b.paymentStatus)).length,
    totalAmount: bills.filter(b => !b.deleted && !b.isDeleted)
      .reduce((s, b) => s + Number(b.grandTotal || b.totalAmount || b.total || 0), 0),
  }), [bills]);

  const filtered = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const weekAgo = new Date(today); weekAgo.setDate(weekAgo.getDate() - 7);
    const monAgo = new Date(today); monAgo.setMonth(monAgo.getMonth() - 1);

    return bills.filter(b => {
      const isDel = b.deleted || b.isDeleted;
      if (filter === 'deleted' && !isDel) return false;
      if (filter === 'active' && isDel) return false;
      if (filter === 'pending' && (isDel ||
        (b.paymentStatus !== 'unpaid' && b.paymentStatus !== 'pending' && b.paymentStatus))) return false;

      if (branchFilter !== 'all' && b.storeId !== branchFilter && b.branchId !== branchFilter) return false;

      if (dateFilter !== 'all') {
        const d = toDate(b.createdAt);
        if (dateFilter === 'today' && d < today) return false;
        if (dateFilter === 'week' && d < weekAgo) return false;
        if (dateFilter === 'month' && d < monAgo) return false;
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
  }, [bills, search, filter, dateFilter, branchFilter]);

  // ── Actions ────────────────────────────────────────────────
  const handleApprove = useCallback(async (row) => {
    if (!confirm('Approve this bill?')) return;
    setLoadingAction(row.id);
    try {
      await updateDoc(doc(db, 'orders', row.id), {
        status: 'approved',
        approvedAt: serverTimestamp(),
      });
      toast.success('Bill approved ✓');
    } catch (e) { toast.error(e.message); }
    finally { setLoadingAction(null); }
  }, []);

  const handleMarkPaid = useCallback(async (row) => {
    if (!confirm('Mark as Paid?')) return;
    const total = Number(row.grandTotal || row.totalAmount || row.total || 0);
    setLoadingAction(row.id);
    try {
      await updateDoc(doc(db, 'orders', row.id), {
        paymentStatus: 'paid',
        paidAmount: total,
        outstandingAmount: 0,
        paidAt: serverTimestamp(),
      });
      toast.success('Marked as Paid ✓');
    } catch (e) { toast.error(e.message); }
    finally { setLoadingAction(null); }
  }, []);

  const handleRestore = useCallback(async (row) => {
    setLoadingAction(row.id);
    try {
      await updateDoc(doc(db, 'orders', row.id), {
        deleted: false,
        isDeleted: false,
        restoredAt: serverTimestamp(),
        paymentStatus: 'unpaid',
      });
      toast.success(`Bill restored ✓`);
    } catch (e) { toast.error(e.message); }
    finally { setLoadingAction(null); }
  }, []);

  const handleResetPending = useCallback(async (row) => {
    if (!confirm('Reset to Pending?')) return;
    const total = Number(row.grandTotal || row.totalAmount || row.total || 0);
    setLoadingAction(row.id);
    try {
      await updateDoc(doc(db, 'orders', row.id), {
        paymentStatus: 'unpaid',
        paidAmount: 0,
        outstandingAmount: total,
        status: 'pending',
      });
      toast.success('Reset ✓');
    } catch (e) { toast.error(e.message); }
    finally { setLoadingAction(null); }
  }, []);

  const executeSoftDelete = useCallback(async () => {
    if (!deleteTarget || !deleteReason.trim()) { toast.error('Reason required'); return; }
    setSubmittingDelete(true);
    try {
      await updateDoc(doc(db, 'orders', deleteTarget.id), {
        deleted: true,
        isDeleted: true,
        deletedAt: serverTimestamp(),
        deleteReason: deleteReason.trim(),
        cancelReason: deleteReason.trim(),
        status: 'cancelled',
        paymentStatus: 'deleted',
      });
      await addDoc(collection(db, 'auditLogs'), {
        action: 'SOFT_DELETE',
        billId: deleteTarget.id,
        billSerial: deleteTarget.serial,
        reason: deleteReason.trim(),
        timestamp: serverTimestamp(),
      }).catch(() => { });
      toast.success(`Bill cancelled`);
      setDeleteTarget(null);
      setDeleteReason('');
    } catch (e) { toast.error(e.message); }
    finally { setSubmittingDelete(false); }
  }, [deleteTarget, deleteReason]);

  const executeHardDelete = useCallback(async () => {
    if (!deleteTarget || !deleteReason.trim()) { toast.error('Reason required'); return; }
    setSubmittingDelete(true);
    try {
      const target = bills.find(b => b.id === deleteTarget.id);
      if (target) {
        await addDoc(collection(db, 'deletedBills'), {
          ...target,
          deletedAt: serverTimestamp(),
          hardDeleteReason: deleteReason.trim(),
        }).catch(() => { });
      }
      await deleteDoc(doc(db, 'orders', deleteTarget.id));
      toast.success(`Permanently deleted`);
      setDeleteTarget(null);
      setDeleteReason('');
    } catch (e) { toast.error(e.message); }
    finally { setSubmittingDelete(false); }
  }, [deleteTarget, deleteReason, bills]);

  const handleExport = useCallback(() => {
    if (!filtered.length) { toast.error('No data'); return; }
    const rows = filtered.map(b => [
      b.billSerial || b.serialNo || b.id.slice(0, 8),
      b.storeId || 'Main',
      b.customer?.name || 'Walk-in',
      b.customer?.phone || '',
      b.grandTotal || b.totalAmount || 0,
      b.deleted ? 'Deleted' : (b.paymentStatus || 'unpaid'),
      toDate(b.createdAt).toLocaleDateString('en-PK'),
      b.billerName || '',
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));

    const csv = `data:text/csv;charset=utf-8,\uFEFFBill#,Branch,Customer,Phone,Amount,Status,Date,Biller\n${rows.join('\n')}`;
    const link = document.createElement('a');
    link.href = encodeURI(csv);
    link.download = `bills_${Date.now()}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Exported ✓');
  }, [filtered]);

  // ── COMPACT Columns — fit screen ──────────────────────────
  const columns = useMemo(() => [
    {
      label: 'Serial',
      field: 'billSerial',
      width: '95px',
      sortable: true,
      sortValue: (row) => row.billSerial || row.serialNo || row.id,
      render: (row) => (
        <div className="min-w-0">
          <p className="font-mono font-semibold text-[15px] text-gray-100 truncate leading-tight">
            {(row.billSerial || row.serialNo || row.id.slice(0, 8) || '').slice(-12)}
          </p>
          <p className="text-[15px] text-slate-500 mt-0.5">
            {toDate(row.createdAt).toLocaleDateString('en-PK', { day: '2-digit', month: 'short' })}
          </p>
        </div>
      ),
    },
    {
      label: 'Customer',
      field: 'customerName',
      width: '110px',
      sortable: true,
      sortValue: (row) => row.customer?.name || row.customerName || 'Walk-in',
      render: (row) => (
        <div className="min-w-0">
          <p className="text-[15px] font-medium text-gray-200 truncate">
            {row.customer?.name || row.customerName || 'Walk-in'}
          </p>
          {row.customer?.phone && (
            <p className="text-[15px] text-slate-500 font-mono truncate">{row.customer.phone}</p>
          )}
        </div>
      ),
    },
    {
      label: 'Biller',
      field: 'billerName',
      width: '70px',
      sortable: true,
      sortValue: (row) => row.billerName || row.cashierName || '',
      render: (row) => (
        <span className="text-[14px] text-slate-400 truncate block">
          {row.billerName || row.cashierName || '—'}
        </span>
      ),
    },
    {
      label: 'Amount',
      field: 'grandTotal',
      width: '80px',
      sortable: true,
      align: 'right',
      sortValue: (row) => Number(row.grandTotal || row.totalAmount || row.total || 0),
      render: (row) => (
        <span className="text-[14px] font-semibold text-gray-100 font-mono">
          {fmt(row.grandTotal || row.totalAmount || row.total)}
        </span>
      ),
    },
    {
      label: 'Payment',
      field: 'paymentStatus',
      width: '80px',
      sortable: true,
      sortValue: (row) => row.deleted || row.isDeleted ? 'deleted' : (row.paymentStatus || 'unpaid'),
      render: (row) => {
        const isDel = row.deleted || row.isDeleted;
        if (isDel) return <StatusBadge variant="destructive">DELETED</StatusBadge>;
        if (row.paymentStatus === 'paid') return <StatusBadge variant="success">PAID</StatusBadge>;
        return <StatusBadge variant="warning">{row.paymentStatus?.toUpperCase() || 'UNPAID'}</StatusBadge>;
      },
    },
    {
      label: 'Sync',
      field: 'synced',
      width: '60px',
      sortable: false,
      render: (row) => (
        row.synced !== false ? (
          <div className="flex items-center gap-1">
            <Wifi className="w-2.5 h-2.5 text-emerald-500" />
            <span className="text-[13px] text-emerald-500">OK</span>
          </div>
        ) : (
          <div className="flex items-center gap-1">
            <Database className="w-2.5 h-2.5 text-amber-500 animate-pulse" />
            <span className="text-[13px] text-amber-500">Wait</span>
          </div>
        )
      ),
    },
    {
      label: '',
      width: '40px',
      sortable: false,
      align: 'right',
      render: (row) => {
        if (loadingAction === row.id) {
          return (
            <div className="flex justify-end">
              <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}>
                <RefreshCw className="w-3.5 h-3.5 text-amber-500" />
              </motion.div>
            </div>
          );
        }
        const isDel = row.deleted || row.isDeleted;
        const serial = row.billSerial || row.id.slice(0, 8);
        return (
          <ActionMenu
            row={row}
            onView={() => setSelectedBill(row)}
            onApprove={() => handleApprove(row)}
            onMarkPaid={() => handleMarkPaid(row)}
            onReset={() => isDel ? handleRestore(row) : handleResetPending(row)}
            onSoftDelete={() => setDeleteTarget({ id: row.id, type: 'soft', serial })}
            onHardDelete={() => setDeleteTarget({ id: row.id, type: 'hard', serial })}
          />
        );
      },
    },
  ], [loadingAction, handleApprove, handleMarkPaid, handleRestore, handleResetPending]);

  const mobileCard = useCallback((row) => {
    const isDel = row.deleted || row.isDeleted;
    const total = Number(row.grandTotal || row.totalAmount || row.total || 0);
    const paid = Number(row.paidAmount || 0);
    const out = total - paid;
    return (
      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        onClick={() => setSelectedBill(row)}
        className="p-2.5 rounded-lg border border-[#2a1f0d] bg-gradient-to-br from-[#1a1208] to-[#0f0a05] hover:border-amber-500/30 cursor-pointer transition-all"
      >
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <span className="text-[11px] font-semibold text-gray-100 font-mono truncate">
            {(row.billSerial || row.serialNo || row.id.slice(0, 8) || '').slice(-12)}
          </span>
          {isDel
            ? <StatusBadge variant="destructive">Deleted</StatusBadge>
            : row.paymentStatus === 'paid'
              ? <StatusBadge variant="success">Paid</StatusBadge>
              : <StatusBadge variant="warning">{row.paymentStatus?.toUpperCase() || 'UNPAID'}</StatusBadge>
          }
        </div>
        <p className="text-[11px] text-gray-300 truncate mb-1">
          {row.customer?.name || row.customerName || 'Walk-in'}
        </p>
        <div className="flex items-center justify-between text-[10px]">
          <span className="text-gray-200 font-medium font-mono">{fmt(total)}</span>
          {out > 0 && !isDel && (
            <span className="text-rose-400 font-medium">Due {fmt(out)}</span>
          )}
        </div>
      </motion.div>
    );
  }, []);

  return (
    <div className="p-2 sm:p-3 lg:p-4 max-w-[1600px] mx-auto space-y-3">

      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 className="text-base sm:text-lg font-bold text-gray-100 flex items-center gap-2">
            <ShoppingBag className="w-4 h-4 text-amber-500" />
            Bills Control Center
            {loading && <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />}
          </h1>
          <p className="text-[10px] text-slate-500 mt-0.5">
            {bills.length.toLocaleString()} orders • {filtered.length.toLocaleString()} shown
          </p>
        </div>
        <Button
          variant="primary"
          leftIcon={<Download className="w-4 h-4" />}
          onClick={handleExport}
          disabled={!filtered.length}
        >
          Export CSV
        </Button>
      </div>

      {/* ── Stats ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
        <StatCard label="Total" value={stats.total} icon={ShoppingBag} color="amber" />
        <StatCard label="Active" value={stats.active} icon={FileCheck} color="green" />
        <StatCard label="Pending" value={stats.pending} icon={Clock} color="red" />
        <StatCard label="Deleted" value={stats.deleted} icon={AlertTriangle} color="purple" />
        <StatCard label="Total Value" value={stats.totalAmount} icon={DollarSign} color="blue" />
      </div>

      {/* ── Filter Bar ─────────────────────────────────────────── */}
      <div className="rounded-xl border border-[#2a1f0d] bg-gradient-to-br from-[#1a1208] to-[#0f0a05] p-2.5">
        <div className="flex flex-col sm:flex-row gap-2 mb-2">
          <div className="flex-1 relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search..."
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-[#0f0a05] border border-[#2a1f0d] rounded-lg text-gray-200 placeholder-slate-500 outline-none focus:border-amber-500/50"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={cn(
                'flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs font-medium',
                showFilters
                  ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                  : 'bg-[#0f0a05] border-[#2a1f0d] text-slate-400'
              )}
            >
              <Filter className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Filters</span>
              {showFilters ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
            {(search || filter !== 'all' || dateFilter !== 'all' || branchFilter !== 'all') && (
              <button
                onClick={() => { setSearch(''); setFilter('all'); setDateFilter('all'); setBranchFilter('all'); }}
                className="flex items-center justify-center p-1.5 text-slate-500 hover:text-rose-400"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        <AnimatePresence>
          {showFilters && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="flex flex-wrap gap-2 pt-2 border-t border-[#2a1f0d]">
                <select
                  value={branchFilter}
                  onChange={(e) => setBranchFilter(e.target.value)}
                  className="bg-[#0f0a05] border border-[#2a1f0d] text-gray-200 text-xs px-2 py-1.5 rounded-lg outline-none focus:border-amber-500/50"
                >
                  <option value="all">All Branches</option>
                  {branches.map(b => (
                    <option key={b} value={b}>{b.length > 14 ? b.slice(0, 14) + '…' : b}</option>
                  ))}
                </select>
                <select
                  value={dateFilter}
                  onChange={(e) => setDateFilter(e.target.value)}
                  className="bg-[#0f0a05] border border-[#2a1f0d] text-gray-200 text-xs px-2 py-1.5 rounded-lg outline-none focus:border-amber-500/50"
                >
                  <option value="all">All Time</option>
                  <option value="today">Today</option>
                  <option value="week">7 Days</option>
                  <option value="month">30 Days</option>
                </select>
                <select
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  className="bg-[#0f0a05] border border-[#2a1f0d] text-gray-200 text-xs px-2 py-1.5 rounded-lg outline-none focus:border-amber-500/50"
                >
                  <option value="all">All Statuses</option>
                  <option value="active">Active</option>
                  <option value="deleted">Deleted</option>
                  <option value="pending">Pending</option>
                </select>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex items-center justify-between text-[10px] text-slate-500 mt-2 pt-2 border-t border-[#2a1f0d]">
          <span>{filtered.length.toLocaleString()} records</span>
          <span>Loaded: {bills.length.toLocaleString()}</span>
        </div>
      </div>

      {/* ── Data Table ─────────────────────────────────────────── */}
      <div className="w-full overflow-hidden">
        <DataTable
          columns={columns}
          data={filtered}
          loading={loading}
          emptyMessage="No bills found"
          emptySubtext="Check connection or filters"
          rowKey="id"
          onRowClick={(row) => setSelectedBill(row)}
          mobileCardRenderer={mobileCard}
          pageSize={50}
          enableVirtualization={true}
          virtualizationThreshold={50}
          maxHeight="600px"
          className="rounded-xl border border-[#2a1f0d] overflow-hidden w-full"
        />
      </div>

      {/* ── Delete Modal ───────────────────────────────────────── */}
      <AnimatePresence>
        {deleteTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-md rounded-2xl border border-[#2a1f0d] bg-gradient-to-b from-[#1a1208] to-[#0f0a05] p-5 shadow-2xl"
            >
              <div className="flex items-center gap-2 pb-3 border-b border-[#2a1f0d] mb-4">
                <AlertTriangle className="w-5 h-5 text-rose-500" />
                <h3 className="text-sm font-semibold text-gray-100">
                  {deleteTarget.type === 'hard' ? 'Permanent Delete' : 'Cancel Bill'}
                </h3>
              </div>
              <p className="text-xs text-slate-400 mb-4">
                Action on <strong className="text-gray-200">#{deleteTarget.serial}</strong> will be logged.
              </p>
              <textarea
                value={deleteReason}
                onChange={(e) => setDeleteReason(e.target.value)}
                placeholder="Enter reason..."
                rows={3}
                className="w-full rounded-xl border border-[#2a1f0d] bg-[#0f0a05] p-3 text-xs text-gray-200 placeholder-slate-500 outline-none focus:border-rose-500/50 mb-4 resize-none"
              />
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  className="flex-1"
                  disabled={submittingDelete}
                  onClick={() => { setDeleteTarget(null); setDeleteReason(''); }}
                >
                  Cancel
                </Button>
                <button
                  disabled={!deleteReason.trim() || submittingDelete}
                  onClick={deleteTarget.type === 'hard' ? executeHardDelete : executeSoftDelete}
                  className="flex-1 rounded-xl bg-rose-500 hover:bg-rose-600 py-2.5 text-xs font-semibold text-white disabled:opacity-40"
                >
                  {submittingDelete
                    ? 'Processing...'
                    : deleteTarget.type === 'hard' ? 'Erase Forever' : 'Confirm'
                  }
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Bill Detail Drawer — LARGE READABLE RECEIPT ───────── */}
      <AnimatePresence>
        {selectedBill && (
          <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/75 backdrop-blur-sm">
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 220 }}
              className="w-full max-w-md sm:max-w-xl h-full flex flex-col bg-gradient-to-b from-[#1a1208] to-[#0f0a05] border-l border-[#2a1f0d] shadow-2xl"
            >
              {/* Header */}
              <div className="flex items-center justify-between p-4 border-b border-[#2a1f0d] shrink-0">
                <div className="flex items-center gap-2">
                  <FileText className="w-5 h-5 text-amber-500" />
                  <h3 className="text-sm font-semibold text-gray-100">Receipt Details</h3>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => window.print()}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-amber-500 hover:bg-amber-500/10 transition-all"
                  >
                    <Printer className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setSelectedBill(null)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-gray-200 hover:bg-[#2a1f0d] transition-all"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Scrollable Body */}
              <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">

                {/* ─── LARGER RECEIPT — readable ───────────────── */}
                <div className="bg-white text-gray-900 p-5 rounded-xl border-4 border-dashed border-gray-300 mx-auto max-w-[400px] font-mono shadow-inner">

                  <div className="text-center space-y-1 mb-4">
                    <h4 className="font-bold text-xl">A-ONE JEWELRY</h4>
                    <p className="text-xs text-gray-600">Tariq Road Gold Bazar, Karachi</p>
                    <p className="text-xs text-gray-600">PH: 0316-2502498</p>
                    <div className="border-b-2 border-dashed border-gray-400 pt-1.5" />
                  </div>

                  <div className="space-y-1.5 text-sm text-gray-800 mb-4">
                    <p><strong>Bill No:</strong> {selectedBill.billSerial || selectedBill.serialNo || selectedBill.id?.slice(0, 10)}</p>
                    <p><strong>Date:</strong> {toDate(selectedBill.createdAt).toLocaleString('en-PK')}</p>
                    <p><strong>Cashier:</strong> {selectedBill.billerName || selectedBill.cashierName || '—'}</p>
                    <p><strong>Customer:</strong> {selectedBill.customer?.name || 'Walk-in'}</p>
                    <p><strong>Phone:</strong> {selectedBill.customer?.phone || '—'}</p>
                    <div className="border-b-2 border-dashed border-gray-400 pt-1" />
                  </div>

                  <div className="space-y-2.5 mb-4">
                    <div className="flex justify-between font-bold text-black text-sm">
                      <span>Item</span><span>Total</span>
                    </div>
                    <div className="border-b border-dashed border-gray-400" />
                    {(selectedBill.items || []).map((item, i) => (
                      <div key={i} className="space-y-1 text-gray-800">
                        <div className="flex justify-between font-semibold text-sm">
                          <span className="truncate max-w-[200px]">
                            {item.productName || `Item #${item.serialId || i + 1}`}
                          </span>
                          <span>{fmt(item.total || item.price * item.qty)}</span>
                        </div>
                        <div className="text-xs text-gray-600 flex justify-between">
                          <span>{item.qty} × {fmt(item.price)}</span>
                          {item.discount > 0 && <span>-{item.discount}%</span>}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="border-b-2 border-dashed border-gray-400 mb-3" />

                  <div className="space-y-1.5 text-sm text-black mb-4">
                    <div className="flex justify-between">
                      <span>Subtotal:</span>
                      <span className="font-medium">{fmt(selectedBill.subtotal)}</span>
                    </div>
                    {Number(selectedBill.totalDiscount) > 0 && (
                      <div className="flex justify-between text-rose-600">
                        <span>Discount:</span>
                        <span>-{fmt(selectedBill.totalDiscount)}</span>
                      </div>
                    )}
                    <div className="flex justify-between font-bold border-t-2 border-dashed border-gray-400 pt-1.5 text-base">
                      <span>Grand Total:</span>
                      <span>{fmt(selectedBill.grandTotal || selectedBill.totalAmount)}</span>
                    </div>
                    <div className="border-b border-dashed border-gray-400 py-0.5" />
                    <div className="flex justify-between">
                      <span>Received:</span>
                      <span className="font-medium">{fmt(selectedBill.amountReceived)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Change:</span>
                      <span className="font-medium">{fmt(selectedBill.changeGiven)}</span>
                    </div>
                  </div>

                  <div className="text-center text-xs text-gray-600 border-t-2 border-dashed border-gray-400 pt-3 space-y-1">
                    <p className="font-bold text-sm">22K Gold Purity Certified</p>
                    <p>Thank you for your purchase!</p>
                  </div>
                </div>

                {/* Audit Info */}
                <div className="space-y-3">
                  <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Audit Information</h4>
                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    {[
                      { label: 'Store ID', value: selectedBill.storeId || '—' },
                      { label: 'Source', value: (selectedBill.source || 'biller').toUpperCase() },
                      { label: 'Payment', value: selectedBill.paymentType || selectedBill.paymentMethod || '—' },
                      { label: 'Sync', value: selectedBill.synced !== false ? '✅ Synced' : '⏳ Pending' },
                    ].map(f => (
                      <div key={f.label} className="p-2.5 rounded-lg border border-[#2a1f0d] bg-[#070503]">
                        <p className="text-[9px] text-slate-500 font-bold uppercase mb-1">{f.label}</p>
                        <p className="font-medium text-gray-300 truncate">{f.value}</p>
                      </div>
                    ))}
                  </div>

                  {selectedBill.deleteReason && (
                    <div className="bg-rose-500/5 p-3 rounded-lg border border-rose-500/20 text-xs">
                      <p className="text-[9px] text-rose-400 font-bold uppercase mb-1">Delete Reason</p>
                      <p className="font-mono text-rose-300">{selectedBill.deleteReason}</p>
                    </div>
                  )}

                  <div className="flex items-center justify-center gap-1.5 py-2 text-emerald-500 text-[11px] bg-emerald-500/5 rounded-lg border border-emerald-500/10">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Transaction locked in sync registry
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="p-4 shrink-0 border-t border-[#2a1f0d]">
                <Button variant="primary" className="w-full" onClick={() => setSelectedBill(null)}>
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