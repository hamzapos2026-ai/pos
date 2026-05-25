// File: src/pages/manager/Salespersons.jsx
// Purpose: Salesperson commission management

import React, { useState, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Briefcase, DollarSign, CheckCircle, X, Loader2 } from 'lucide-react';
import { motion as m, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import managerService from '../../services/managerService';
import { formatPKR, getInitials, truncate } from '../../utils/managerHelpers';
import useManagerData from '../../hooks/useManagerData';
import DataTable from '../../components/manager/DataTable';
import AdvancedFilters from '../../components/manager/AdvancedFilters';
import ExportMenu from '../../components/manager/ExportMenu';
import StatCard from '../../components/manager/StatCard';

// ============ PAY COMMISSION MODAL ============
const PayCommissionModal = ({ user, onClose, onSaved }) => {
  const [amount, setAmount] = useState(Number(user?.commissionPending || 0));
  const [branchId, setBranchId] = useState(user?.storeId || (user?.storeIds && user.storeIds[0]) || '');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!amount || amount <= 0) { toast.error('Valid amount required'); return; }
    if (!branchId) { toast.error('Branch ID required'); return; }
    setLoading(true);
    try {
      const res = await managerService.markCommissionPaid(user.uid, amount, branchId, note);
      if (res.success) {
        toast.success('Commission of ' + formatPKR(amount) + ' paid');
        onSaved?.();
        onClose();
      } else toast.error(res.error);
    } catch (err) { toast.error(err.message); }
    finally { setLoading(false); }
  };

  if (!user) return null;
  const pending = Number(user.commissionPending || 0);

  return (
    <AnimatePresence>
      <m.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      >
        <m.div initial={{ scale: 0.95, y: 16 }} animate={{ scale: 1, y: 0 }}
          className="w-full max-w-md rounded-2xl border border-[#2a1f0d] bg-[#12100a]"
        >
          <div className="flex justify-between items-center p-4 border-b border-[#2a1f0d]">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-amber-500/15 text-amber-400 flex items-center justify-center font-bold">{getInitials(user.name || user.displayName)}</div>
              <div>
                <h3 className="text-base font-bold text-gray-100">Pay Commission</h3>
                <p className="text-[10px] text-gray-500">{user.name || user.displayName}</p>
              </div>
            </div>
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-[#2a1f0d] text-gray-400"><X className="w-4 h-4" /></button>
          </div>

          <div className="p-4 space-y-3">
            <div className="rounded-lg bg-orange-500/5 p-3 border border-orange-500/20">
              <p className="text-[10px] text-orange-500/70 uppercase">Pending Commission</p>
              <p className="text-xl font-bold text-orange-400">{formatPKR(pending)}</p>
            </div>

            <div>
              <label className="text-xs text-gray-400 mb-1 block">Amount to Pay</label>
              <input type="number" value={amount} onChange={e => setAmount(Number(e.target.value))}
                className="w-full rounded-xl border border-[#2a1f0d] bg-[#0a0805] px-3 py-2.5 text-sm font-semibold text-gray-100 focus:outline-none focus:ring-2 focus:ring-amber-500/50" />
              <div className="flex gap-1.5 mt-2">
                {[0.25, 0.5, 0.75, 1].map(pct => (
                  <button key={pct} onClick={() => setAmount(Number((pending * pct).toFixed(2)))}
                    className="text-[10px] px-2 py-1 rounded-md border border-[#2a1f0d] text-gray-500 hover:text-amber-400">
                    {pct === 1 ? 'Full' : Math.round(pct * 100) + '%'}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs text-gray-400 mb-1 block">Branch ID</label>
              <input value={branchId} onChange={e => setBranchId(e.target.value)}
                className="w-full rounded-xl border border-[#2a1f0d] bg-[#0a0805] px-3 py-2 text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-amber-500/50" />
            </div>

            <div>
              <label className="text-xs text-gray-400 mb-1 block">Note (optional)</label>
              <input value={note} onChange={e => setNote(e.target.value)}
                placeholder="e.g. Monthly payout"
                className="w-full rounded-xl border border-[#2a1f0d] bg-[#0a0805] px-3 py-2 text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-amber-500/50" />
            </div>
          </div>

          <div className="p-3 border-t border-[#2a1f0d] flex gap-2">
            <button onClick={onClose} disabled={loading} className="flex-1 rounded-xl border border-[#2a1f0d] bg-[#1a1208] py-2.5 text-sm text-gray-400">Cancel</button>
            <button onClick={submit} disabled={loading} className="flex-1 rounded-xl bg-gradient-to-r from-green-500 to-green-600 py-2.5 text-sm font-semibold text-white flex items-center justify-center gap-2">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <DollarSign className="w-4 h-4" />}
              Pay {formatPKR(amount)}
            </button>
          </div>
        </m.div>
      </m.div>
    </AnimatePresence>
  );
};

// ============ MAIN PAGE ============
const Salespersons = () => {
  const [search, setSearch] = useState('');
  const [payFor, setPayFor] = useState(null);

  const loader = useCallback(() => managerService.getSalespersons(), []);
  const { data, loading, refresh } = useManagerData(loader, []);

  const list = useMemo(() => {
    let l = data || [];
    if (search) {
      const q = search.toLowerCase();
      l = l.filter(u =>
        (u.name || '').toLowerCase().includes(q) ||
        (u.displayName || '').toLowerCase().includes(q) ||
        (u.email || '').toLowerCase().includes(q)
      );
    }
    return l;
  }, [data, search]);

  const stats = useMemo(() => {
    const earned = list.reduce((s, u) => s + Number(u.commissionEarned || 0), 0);
    const pending = list.reduce((s, u) => s + Number(u.commissionPending || 0), 0);
    const paid = list.reduce((s, u) => s + Number(u.commissionPaid || 0), 0);
    return { count: list.length, earned, pending, paid };
  }, [list]);

  const columns = [
    {
      label: 'Salesperson', field: 'name',
      render: (r) => (
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-lg bg-amber-500/15 text-amber-400 flex items-center justify-center text-xs font-bold shrink-0">
            {getInitials(r.name || r.displayName)}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-100 truncate">{truncate(r.name || r.displayName, 22)}</p>
            <p className="text-[10px] text-gray-500 truncate">{r.email}</p>
          </div>
        </div>
      ),
    },
    {
      label: 'Earned', field: 'commissionEarned', align: 'right',
      render: r => <span className="text-sm text-green-400">{formatPKR(r.commissionEarned || 0)}</span>
    },
    {
      label: 'Pending', field: 'commissionPending', align: 'right',
      render: r => <span className="text-sm font-bold text-orange-400">{formatPKR(r.commissionPending || 0)}</span>
    },
    {
      label: 'Paid', field: 'commissionPaid', align: 'right',
      render: r => <span className="text-sm text-blue-400">{formatPKR(r.commissionPaid || 0)}</span>
    },
    {
      label: 'Status', sortable: false,
      render: r => (
        <span className={'text-[10px] px-2 py-0.5 rounded-full ' + (r.isActive !== false ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400')}>
          {r.isActive !== false ? 'Active' : 'Inactive'}
        </span>
      ),
    },
    {
      label: 'Action', sortable: false, align: 'right',
      render: r => Number(r.commissionPending || 0) > 0 && (
        <button onClick={() => setPayFor(r)}
          className="px-2.5 py-1 rounded-lg bg-green-500/15 text-green-400 text-xs font-medium hover:bg-green-500/25">
          Pay
        </button>
      ),
    },
  ];

  const mobileCard = (r) => (
    <div className="p-3 rounded-xl border border-[#2a1f0d] bg-[#1a1208]">
      <div className="flex items-center gap-3 mb-2">
        <div className="h-10 w-10 rounded-lg bg-amber-500/15 text-amber-400 flex items-center justify-center font-bold">{getInitials(r.name || r.displayName)}</div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-gray-100 truncate">{r.name || r.displayName}</p>
          <p className="text-[10px] text-gray-500 truncate">{r.email}</p>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 text-xs my-2">
        <div><p className="text-[9px] text-gray-500">Earned</p><p className="text-green-400 font-medium">{formatPKR(r.commissionEarned || 0)}</p></div>
        <div><p className="text-[9px] text-gray-500">Pending</p><p className="text-orange-400 font-bold">{formatPKR(r.commissionPending || 0)}</p></div>
        <div><p className="text-[9px] text-gray-500">Paid</p><p className="text-blue-400">{formatPKR(r.commissionPaid || 0)}</p></div>
      </div>
      {Number(r.commissionPending || 0) > 0 && (
        <button onClick={() => setPayFor(r)}
          className="w-full mt-2 py-1.5 rounded-lg bg-green-500/15 text-green-400 text-xs">
          Pay Pending Commission
        </button>
      )}
    </div>
  );

  const exportRows = list.map(u => ({
    Name: u.name || u.displayName, Email: u.email,
    Earned: Number(u.commissionEarned || 0),
    Pending: Number(u.commissionPending || 0),
    Paid: Number(u.commissionPaid || 0),
    Status: u.isActive !== false ? 'Active' : 'Inactive',
  }));

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <h2 className="text-xl font-bold text-gray-100 flex items-center gap-2">
          <Briefcase className="w-5 h-5 text-amber-500" /> Salespersons & Commissions
        </h2>
        <ExportMenu data={exportRows} filename={'commissions_' + new Date().toISOString().slice(0, 10)} />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Salespersons" value={stats.count} icon={Briefcase} color="amber" loading={loading} />
        <StatCard label="Earned" value={stats.earned} prefix="Rs " icon={CheckCircle} color="green" loading={loading} />
        <StatCard label="Pending" value={stats.pending} prefix="Rs " icon={Loader2} color="orange" loading={loading} />
        <StatCard label="Paid" value={stats.paid} prefix="Rs " icon={DollarSign} color="blue" loading={loading} />
      </div>

      <AdvancedFilters
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search salesperson…"
        showBranches={false}
        onReset={() => setSearch('')}
        resultCount={list.length}
      />

      <DataTable
        columns={columns}
        data={list}
        loading={loading}
        emptyMessage="No salespersons found"
        emptySubtext="Salespersons appear here when they earn commissions"
        rowKey="uid"
        mobileCardRenderer={mobileCard}
        pageSize={25}
      />

      {payFor && <PayCommissionModal user={payFor} onClose={() => setPayFor(null)} onSaved={refresh} />}
    </div>
  );
};

export default Salespersons;