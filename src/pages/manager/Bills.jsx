// File: src/pages/manager/Bills.jsx
import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Eye, FileText, AlertCircle, Check, X, MoreVertical,
  Coins, RefreshCw, Trash2, Clock, CheckCircle2,
  Search, Filter, DollarSign, Zap,
} from 'lucide-react';
import managerService from '../../services/managerService';
import { formatPKR, getBillPaymentStatus, getBillStatusInfo, getRelativeTime } from '../../utils/managerHelpers';
import { BILL_FILTER_LABELS } from '../../utils/constants';
import useManagerData from '../../hooks/useManagerData';
import DataTable from '../../components/manager/DataTable';
import ExportMenu from '../../components/manager/ExportMenu';
import BillDetail from './BillDetail';
import toast from 'react-hot-toast';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { cn } from '../../utils/cn';

const StatusBadge = ({ status, children }) => {
  const variants = {
    green: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25',
    orange: 'bg-amber-500/15   text-amber-400   border-amber-500/25',
    red: 'bg-rose-500/15    text-rose-400    border-rose-500/25',
    blue: 'bg-blue-500/15    text-blue-400    border-blue-500/25',
    gray: 'bg-slate-500/15   text-slate-400   border-slate-500/25',
  };
  return (
    <span className={cn(
      'inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold border whitespace-nowrap',
      variants[status] || variants.gray
    )}>
      {children}
    </span>
  );
};

const StatCard = ({ label, value, icon: Icon, color }) => (
  <motion.div
    initial={{ opacity: 0, scale: 0.95 }}
    animate={{ opacity: 1, scale: 1 }}
    className="relative overflow-hidden rounded-xl border border-[#2a1f0d] bg-gradient-to-br from-[#1a1208] to-[#0f0a05] p-2.5"
  >
    <div className={cn(
      'absolute -top-8 -right-8 w-24 h-24 rounded-full blur-2xl opacity-20',
      color === 'amber' && 'bg-amber-500',
      color === 'green' && 'bg-emerald-500',
      color === 'red' && 'bg-rose-500',
      color === 'blue' && 'bg-blue-500',
      color === 'purple' && 'bg-violet-500',
    )} />
    <div className="flex items-center justify-between relative">
      <div className="min-w-0">
        <p className="text-[9px] text-slate-500 font-medium uppercase tracking-wide truncate">{label}</p>
        <p className="text-sm sm:text-base font-bold text-gray-100 mt-0.5 truncate">
          {Number(value || 0).toLocaleString()}
        </p>
      </div>
      <div className={cn(
        'p-1.5 rounded-lg shrink-0',
        color === 'amber' && 'bg-amber-500/15  text-amber-500',
        color === 'green' && 'bg-emerald-500/15 text-emerald-500',
        color === 'red' && 'bg-rose-500/15    text-rose-500',
        color === 'blue' && 'bg-blue-500/15    text-blue-500',
        color === 'purple' && 'bg-violet-500/15  text-violet-500',
      )}>
        <Icon className="w-3.5 h-3.5" />
      </div>
    </div>
  </motion.div>
);

const ActionMenu = ({ row, refresh, setSelectedBill, setCancelTarget, handleStatusChange }) => {
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    const handleClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const total = Number(row.totalAmount || row.total || 0);
  const paid = Number(row.paidAmount || 0);
  const out = total - paid > 0;

  return (
    <div className="relative" ref={menuRef} onClick={(e) => e.stopPropagation()}>
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
            className="absolute right-0 mt-1 w-44 rounded-xl border border-[#2a1f0d] bg-[#1a1208] shadow-xl z-50 overflow-hidden"
          >
            <div className="py-1 px-1">
              <button
                onClick={() => { setOpen(false); setSelectedBill(row.localId || row.id); }}
                className="w-full text-left px-2.5 py-1.5 text-xs text-slate-300 hover:bg-amber-500/10 hover:text-amber-400 rounded-lg transition-all flex items-center gap-2"
              >
                <Eye className="w-3.5 h-3.5 text-amber-500" /> View Details
              </button>

              {row.status === 'pending' && (
                <button
                  onClick={async () => {
                    setOpen(false);
                    if (!confirm('Approve this bill?')) return;
                    try {
                      const requests = await managerService.getApprovalRequests({ status: 'pending' });
                      const req = requests.find(
                        r => r.billId === row.billId || r.localBillId === row.localId || r.localBillId === row.id
                      );
                      if (req) {
                        await managerService.processApprovalRequest(req.requestId || req.id, 'approve', 'Approved from list');
                      } else {
                        await managerService.updateBill(row.localId || row.id, { status: 'approved' });
                      }
                      toast.success('Bill Approved ✓');
                      refresh();
                    } catch {
                      toast.error('Approve failed');
                    }
                  }}
                  className="w-full text-left px-2.5 py-1.5 text-xs text-emerald-400 hover:bg-emerald-500/10 rounded-lg transition-all flex items-center gap-2"
                >
                  <Check className="w-3.5 h-3.5 text-emerald-500" /> Approve
                </button>
              )}

              {row.status !== 'paid' && out && (
                <button
                  onClick={() => {
                    setOpen(false);
                    if (!confirm('Mark as Paid?')) return;
                    handleStatusChange(row, 'paid', { paymentStatus: 'paid', paidAmount: total, outstandingAmount: 0 });
                  }}
                  className="w-full text-left px-2.5 py-1.5 text-xs text-emerald-400 hover:bg-emerald-500/10 rounded-lg transition-all flex items-center gap-2"
                >
                  <Coins className="w-3.5 h-3.5 text-emerald-500" /> Mark Paid
                </button>
              )}

              {row.status !== 'pending' && (
                <button
                  onClick={() => {
                    setOpen(false);
                    if (!confirm('Reset to Pending?')) return;
                    handleStatusChange(row, 'pending', { paymentStatus: 'unpaid', paidAmount: 0, outstandingAmount: total });
                  }}
                  className="w-full text-left px-2.5 py-1.5 text-xs text-amber-400 hover:bg-amber-500/10 rounded-lg transition-all flex items-center gap-2"
                >
                  <RefreshCw className="w-3.5 h-3.5 text-amber-500" /> Reset
                </button>
              )}

              {row.status !== 'cancelled' && (
                <button
                  onClick={() => { setOpen(false); setCancelTarget(row); }}
                  className="w-full text-left px-2.5 py-1.5 text-xs text-rose-400 hover:bg-rose-500/10 rounded-lg transition-all flex items-center gap-2"
                >
                  <Trash2 className="w-3.5 h-3.5 text-rose-500" /> Cancel
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const Bills = () => {
  const [filters, setFilters] = useState({
    search: '', status: '', paymentStatus: '', from: '', to: '', branchId: '',
  });
  const [selectedBill, setSelectedBill] = useState(null);
  const [showFilters, setShowFilters] = useState(false);
  const [cancelTarget, setCancelTarget] = useState(null);
  const [cancelReason, setCancelReason] = useState('');
  const [submittingCancel, setSubmittingCancel] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState(null);

  const loader = useCallback(
    () => managerService.getBills({ ...filters, limit: 10000 }),
    [filters]
  );
  const { data, loading, refresh } = useManagerData(loader, [filters], {
    autoRefresh: true,
    refreshInterval: 5000,
  });

  const bills = data?.items || [];

  const stats = useMemo(() => ({
    total: bills.length,
    totalAmount: bills.reduce((s, b) => s + Number(b.totalAmount || b.total || 0), 0),
    paidAmount: bills.reduce((s, b) => s + Number(b.paidAmount || 0), 0),
    pending: bills.filter(b => !b.isDeleted && b.status === 'pending').length,
    paid: bills.filter(b => b.paymentStatus === 'paid').length,
  }), [bills]);

  const handleStatusChange = useCallback(async (row, newStatus, extraUpdates = {}) => {
    try {
      setLoadingStatus(row.localId || row.id);
      const res = await managerService.updateBill(row.localId || row.id, {
        status: newStatus, ...extraUpdates,
      });
      if (res?.success) {
        toast.success(`Status updated ✓`);
        refresh();
      } else {
        toast.error(res?.error || 'Update failed');
      }
    } catch {
      toast.error('Update failed');
    } finally {
      setLoadingStatus(null);
    }
  }, [refresh]);

  // ── COMPACT 5-COL TABLE — fits any screen ─────────────────
  const columns = useMemo(() => [
    {
      label: 'Bill #',
      field: 'serialNo',
      width: '110px',
      sortable: true,
      sortValue: (row) => row.serialNo || row.billSerial || row.localId,
      render: (row) => (
        <div className="min-w-0">
          <p className="font-bold text-gray-100 text-xs leading-tight font-mono truncate">
            {(row.serialNo || row.billSerial || row.localId?.slice(-8) || '').slice(-12)}
          </p>
          <p className="text-[11px] text-slate-400 mt-0.5">
            {(() => {
              try {
                const ts = row.savedAt || row.createdAt;
                if (!ts) return '';
                const d = ts.toDate ? ts.toDate() : new Date(ts);
                return d.toLocaleDateString('en-PK', { day: '2-digit', month: 'short' });
              } catch { return ''; }
            })()}
          </p>
        </div>
      ),
    },
    {
      label: 'Customer / Biller',
      field: 'customerName',
      width: '160px',
      sortable: true,
      sortValue: (row) => row.customer?.name || row.customerName || 'Walk-in',
      render: (row) => {
        const name = row.customer?.name || row.customerName || 'Walk-in';
        const phone = row.customer?.phone || row.customerPhone || '';
        const biller = row.billerName || '';
        return (
          <div className="min-w-0 text-xs leading-tight">
            <p className="font-medium text-gray-200 truncate">{name}</p>
            <p className="text-[11px] text-slate-400 truncate mt-0.5">
              {phone ? `${phone}` : ''}{phone && biller ? ' • ' : ''}{biller ? `${biller}` : (!phone ? '—' : '')}
            </p>
          </div>
        );
      },
    },
    {
      label: 'Financials',
      field: 'totalAmount',
      width: '120px',
      align: 'right',
      sortable: true,
      sortValue: (row) => Number(row.totalAmount || row.total || 0),
      render: (row) => {
        const total = Number(row.totalAmount || row.total || 0);
        const paid = Number(row.paidAmount || 0);
        const out = total - paid;
        return (
          <div className="text-right text-xs leading-tight space-y-0.5 font-mono">
            <span className="font-bold text-gray-100 block">
              {formatPKR(total)}
            </span>
            <span className="text-emerald-400 block text-[11px]">
              {formatPKR(paid)}
            </span>
            {out > 0 && (
              <span className="text-rose-400 block text-[11px]">
                Due {formatPKR(out)}
              </span>
            )}
          </div>
        );
      },
    },
    {
      label: 'Status',
      field: 'status',
      width: '100px',
      sortable: true,
      sortValue: (row) => row.status,
      render: (row) => {
        const ps = getBillPaymentStatus(row);
        const info = getBillStatusInfo(row.status);
        return (
          <div className="flex flex-col gap-1 items-start">
            <StatusBadge status={ps.color}>{ps.label}</StatusBadge>
            <StatusBadge status={info.color}>{info.label}</StatusBadge>
          </div>
        );
      },
    },
    {
      label: '',
      width: '40px',
      sortable: false,
      render: (row) => (
        <div className="flex items-center justify-end">
          {loadingStatus === (row.localId || row.id) ? (
            <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}>
              <RefreshCw className="w-3.5 h-3.5 text-amber-500" />
            </motion.div>
          ) : (
            <ActionMenu
              row={row}
              refresh={refresh}
              setSelectedBill={setSelectedBill}
              setCancelTarget={setCancelTarget}
              handleStatusChange={handleStatusChange}
            />
          )}
        </div>
      ),
    },
  ], [loadingStatus, refresh, handleStatusChange]);

  const mobileCard = useCallback((row) => {
    const ps = getBillPaymentStatus(row);
    const total = Number(row.totalAmount || row.total || 0);
    const paid = Number(row.paidAmount || 0);
    const out = total - paid;
    return (
      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        onClick={() => setSelectedBill(row.localId || row.id)}
        className="p-2.5 rounded-lg border border-[#2a1f0d] bg-gradient-to-br from-[#1a1208] to-[#0f0a05] hover:border-amber-500/30 cursor-pointer transition-all"
      >
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <span className="text-[11px] font-semibold text-gray-100 font-mono truncate">
            {(row.serialNo || row.billSerial || row.localId?.slice(-8) || '').slice(-12)}
          </span>
          <StatusBadge status={ps.color}>{ps.label}</StatusBadge>
        </div>
        <p className="text-[11px] text-gray-300 truncate mb-1">
          {row.customer?.name || row.customerName || 'Walk-in'}
        </p>
        <div className="flex items-center justify-between text-[10px]">
          <span className="text-gray-200 font-medium font-mono">{formatPKR(total)}</span>
          {out > 0 && <span className="text-rose-400 font-medium">Due {formatPKR(out)}</span>}
        </div>
      </motion.div>
    );
  }, []);

  const exportRows = useMemo(() =>
    bills.map(b => ({
      Serial: b.serialNo || b.billSerial || b.localId,
      Date: (b.savedAt || b.createdAt || '').toString().slice(0, 19).replace('T', ' '),
      Customer: b.customer?.name || b.customerName || 'Walk-in',
      Phone: b.customer?.phone || b.customerPhone || '',
      Biller: b.billerName || b.billerId || '',
      Total: Number(b.totalAmount || b.total || 0),
      Paid: Number(b.paidAmount || 0),
      Outstanding: Number(b.totalAmount || b.total || 0) - Number(b.paidAmount || 0),
      Status: b.status,
      Branch: b.storeId,
    })),
    [bills]
  );

  const handleReset = useCallback(() => {
    setFilters({ search: '', status: '', paymentStatus: '', from: '', to: '', branchId: '' });
  }, []);

  return (
    <div className="space-y-4">

      {/* ── Header ───────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h2 className="text-base sm:text-lg font-bold text-gray-100 flex items-center gap-2">
            <FileText className="w-4 h-4 text-amber-500" />
            Bills Monitoring
            {loading && <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />}
          </h2>
          <p className="text-[10px] text-slate-500 mt-0.5">
            {bills.length.toLocaleString()} bills • Real-time
          </p>
        </div>
        <ExportMenu
          data={exportRows}
          filename={'bills_' + new Date().toISOString().slice(0, 10)}
          pdfOptions={{
            title: 'Bills Report',
            subtitle: bills.length + ' bills',
            headers: ['Serial', 'Date', 'Customer', 'Phone', 'Biller', 'Total', 'Paid', 'Outstanding', 'Status'],
            rows: exportRows.map(r => [
              r.Serial, r.Date, r.Customer, r.Phone,
              r.Biller, r.Total, r.Paid, r.Outstanding, r.Status,
            ]),
          }}
        />
      </div>

      {/* ── Stats ────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
        <StatCard label="Total Bills" value={stats.total} icon={FileText} color="amber" />
        <StatCard label="Total Value" value={stats.totalAmount} icon={DollarSign} color="blue" />
        <StatCard label="Paid Amount" value={stats.paidAmount} icon={CheckCircle2} color="green" />
        <StatCard label="Pending" value={stats.pending} icon={Clock} color="red" />
        <StatCard label="Completed" value={stats.paid} icon={Zap} color="purple" />
      </div>

      {/* ── Filter Bar ───────────────────────────────────────── */}
      <div className="rounded-xl border border-[#2a1f0d] bg-gradient-to-br from-[#1a1208] to-[#0f0a05] p-2 space-y-2">
        <div className="flex items-center gap-2">
          <div className="flex-1 relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
            <input
              type="text"
              value={filters.search}
              onChange={(e) => setFilters(f => ({ ...f, search: e.target.value }))}
              placeholder="Search..."
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-[#0f0a05] border border-[#2a1f0d] rounded-lg text-gray-200 placeholder-slate-500 outline-none focus:border-amber-500/50"
            />
          </div>
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
          </button>
          {(filters.status || filters.paymentStatus || filters.from || filters.to) && (
            <button onClick={handleReset} className="p-1.5 text-slate-500 hover:text-rose-400">
              <X className="w-4 h-4" />
            </button>
          )}
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
                  value={filters.paymentStatus}
                  onChange={(e) => setFilters(f => ({ ...f, paymentStatus: e.target.value }))}
                  className="bg-[#0f0a05] border border-[#2a1f0d] text-gray-200 text-xs px-2 py-1.5 rounded-lg outline-none focus:border-amber-500/50"
                >
                  <option value="">Payment</option>
                  <option value="paid">Paid</option>
                  <option value="partial">Partial</option>
                  <option value="unpaid">Unpaid</option>
                </select>
                <select
                  value={filters.status}
                  onChange={(e) => setFilters(f => ({ ...f, status: e.target.value }))}
                  className="bg-[#0f0a05] border border-[#2a1f0d] text-gray-200 text-xs px-2 py-1.5 rounded-lg outline-none focus:border-amber-500/50"
                >
                  <option value="">Status</option>
                  {Object.entries(BILL_FILTER_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
                <input
                  type="date"
                  value={filters.from}
                  onChange={(e) => setFilters(f => ({ ...f, from: e.target.value }))}
                  className="bg-[#0f0a05] border border-[#2a1f0d] text-gray-200 text-xs px-2 py-1.5 rounded-lg outline-none focus:border-amber-500/50"
                />
                <input
                  type="date"
                  value={filters.to}
                  onChange={(e) => setFilters(f => ({ ...f, to: e.target.value }))}
                  className="bg-[#0f0a05] border border-[#2a1f0d] text-gray-200 text-xs px-2 py-1.5 rounded-lg outline-none focus:border-amber-500/50"
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex items-center justify-between text-[10px] text-slate-500 pt-1.5 border-t border-[#2a1f0d]">
          <span>{bills.length.toLocaleString()} records</span>
          {data?.lastUpdated && <span>Updated: {getRelativeTime(data.lastUpdated)}</span>}
        </div>
      </div>

      {/* ── Data Table — full width, no horizontal scroll ────── */}
      <div className="w-full overflow-hidden">
        <DataTable
          columns={columns}
          data={bills}
          loading={loading}
          emptyMessage="No bills found"
          emptySubtext="Try adjusting filters"
          rowKey="localId"
          onRowClick={(row) => setSelectedBill(row.localId || row.id)}
          mobileCardRenderer={mobileCard}
          pageSize={50}
          enableVirtualization={true}
          virtualizationThreshold={50}
          maxHeight="600px"
          className="rounded-xl border border-[#2a1f0d] overflow-hidden w-full"
        />
      </div>

      {selectedBill && (
        <BillDetail
          localId={selectedBill}
          onClose={() => { setSelectedBill(null); refresh(); }}
        />
      )}

      {/* ── Cancel Modal ─────────────────────────────────────── */}
      <AnimatePresence>
        {cancelTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-md rounded-2xl border border-[#2a1f0d] bg-gradient-to-b from-[#1a1208] to-[#0f0a05] p-5 shadow-2xl"
            >
              <div className="flex items-center gap-2 pb-3 border-b border-[#2a1f0d] mb-4">
                <AlertCircle className="w-5 h-5 text-rose-500" />
                <h3 className="text-sm font-semibold text-gray-100">Cancel & Delete Bill</h3>
              </div>
              <p className="text-xs text-slate-400 mb-4 leading-relaxed">
                Cancel bill <strong className="text-gray-200">#{cancelTarget.serialNo || cancelTarget.billSerial}</strong>?
              </p>
              <textarea
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Type cancel reason..."
                rows={3}
                className="w-full rounded-xl border border-[#2a1f0d] bg-[#0f0a05] p-3 text-xs text-gray-200 placeholder-slate-500 outline-none focus:border-rose-500/50 mb-4 resize-none"
              />
              <div className="flex gap-2">
                <button
                  disabled={submittingCancel}
                  onClick={() => { setCancelTarget(null); setCancelReason(''); }}
                  className="flex-1 rounded-xl border border-[#2a1f0d] bg-[#1a1208] py-2.5 text-xs text-slate-400 hover:text-gray-200"
                >
                  Go Back
                </button>
                <button
                  disabled={submittingCancel || !cancelReason.trim()}
                  onClick={async () => {
                    setSubmittingCancel(true);
                    try {
                      await managerService.updateBill(cancelTarget.localId || cancelTarget.id, {
                        status: 'cancelled',
                        isDeleted: true,
                        cancelReason: cancelReason.trim(),
                        cancelledAt: new Date().toISOString(),
                      });
                      try {
                        const requests = await managerService.getApprovalRequests({ status: 'pending' });
                        const req = requests.find(r => r.billId === cancelTarget.billId || r.localBillId === cancelTarget.localId);
                        if (req) await managerService.processApprovalRequest(req.requestId || req.id, 'cancel', cancelReason.trim());
                      } catch { }
                      try {
                        await addDoc(collection(db, 'deletedBills'), {
                          originalOrderId: cancelTarget.id || cancelTarget.localId,
                          billSerial: cancelTarget.billSerial || cancelTarget.serialNo,
                          storeId: cancelTarget.storeId || 'default',
                          orderSnapshot: { ...cancelTarget },
                          reason: cancelReason.trim(),
                          cancelledAt: serverTimestamp(),
                        });
                      } catch { }
                      toast.success('Bill cancelled');
                      refresh();
                      setCancelTarget(null);
                      setCancelReason('');
                    } catch {
                      toast.error('Cancellation failed');
                    } finally {
                      setSubmittingCancel(false);
                    }
                  }}
                  className="flex-1 rounded-xl bg-rose-500 hover:bg-rose-600 py-2.5 text-xs font-semibold text-white disabled:opacity-40"
                >
                  {submittingCancel ? 'Processing...' : 'Confirm Cancel'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Bills;