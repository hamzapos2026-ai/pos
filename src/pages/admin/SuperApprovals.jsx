import React, { useEffect, useState } from 'react';
import { Check, X, FileText } from 'lucide-react';
import managerService from '../../services/managerService';
import { formatPKR, getRelativeTime } from '../../utils/managerHelpers';

const SuperApprovals = () => {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sortOrder, setSortOrder] = useState('newest'); // 'newest' | 'oldest'
  const [hideDuplicates, setHideDuplicates] = useState(true);
  const [roleFilter, setRoleFilter] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const load = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      let items = await managerService.getSuperApprovalRequests({ status: 'pending' }) || [];

      // Normalize createdAt to timestamp for sorting
      items = items.map(it => ({
        ...it,
        _ts: it.createdAt && typeof it.createdAt.toDate === 'function'
          ? it.createdAt.toDate().getTime()
          : (it.createdAt && it.createdAt.seconds ? it.createdAt.seconds * 1000 : 0)
      }));

      // Optionally dedupe by bill id / local id / serial
      if (hideDuplicates) {
        const map = new Map();
        for (const it of items) {
          const key = it.billId || it.localBillId || (it.billSnapshot && it.billSnapshot.serialNo) || it.requestId || it.id;
          if (!key) continue;
          const prev = map.get(key);
          if (!prev || (it._ts || 0) > (prev._ts || 0)) map.set(key, it);
        }
        items = Array.from(map.values());
      }

      // Filter by role
      if (roleFilter && roleFilter !== 'all') {
        const rf = roleFilter.toLowerCase();
        items = items.filter(it => {
          const role = (it.requestedByRole || it.requesterRole || (it.requestedBy && it.requestedBy.role) || '').toString().toLowerCase();
          return role === rf;
        });
      }

      // Filter by date range
      if (startDate) {
        const s = new Date(`${startDate}T00:00:00`).getTime();
        items = items.filter(it => (it._ts || 0) >= s);
      }
      if (endDate) {
        const e = new Date(`${endDate}T23:59:59`).getTime();
        items = items.filter(it => (it._ts || 0) <= e);
      }

      // Sort
      items.sort((a,b) => sortOrder === 'newest' ? (b._ts - a._ts) : (a._ts - b._ts));

      setRequests(items);
    } catch (err) { console.error(err); }
    if (!silent) setLoading(false);
  };

  useEffect(() => {
    load(false);
    const timer = setInterval(() => load(true), 5000);
    return () => clearInterval(timer);
  }, [sortOrder, hideDuplicates, roleFilter, startDate, endDate]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-100">Super Admin Approvals</h2>
        <div className="flex items-center gap-3">
          <label className="text-sm text-gray-400">{requests.length} pending</label>
          <select value={sortOrder} onChange={(e) => { setSortOrder(e.target.value); }} className="bg-[#0f0b07] text-sm text-gray-300 rounded-md px-2 py-1">
            <option value="newest">Most recent</option>
            <option value="oldest">Oldest first</option>
          </select>
          <label className="flex items-center gap-2 text-sm text-gray-400">
            <input type="checkbox" checked={hideDuplicates} onChange={(e) => setHideDuplicates(e.target.checked)} />
            Hide duplicates
          </label>
          <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} className="bg-[#0f0b07] text-sm text-gray-300 rounded-md px-2 py-1">
            <option value="all">All roles</option>
            <option value="cashier">Cashier</option>
            <option value="manager">Manager</option>
            <option value="biller">Biller</option>
            <option value="admin">Admin</option>
            <option value="superadmin">Super Admin</option>
          </select>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="bg-[#0f0b07] text-sm text-gray-300 rounded-md px-2 py-1" />
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="bg-[#0f0b07] text-sm text-gray-300 rounded-md px-2 py-1" />
          <button onClick={load} className="px-2 py-1 rounded-md bg-amber-500 text-black text-sm">Refresh</button>
        </div>
      </div>

      {loading ? (
        <div className="p-6 text-center text-gray-400">Loading…</div>
      ) : requests.length === 0 ? (
        <div className="p-6 text-center text-gray-500">No pending approvals</div>
      ) : (
        <div className="space-y-3">
          {requests.map(r => (
            <div key={r.requestId || r.id} className="p-4 rounded-xl bg-[#1a1208]/90 border border-[#2a1f0d] flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xl">
              <div className="min-w-0 space-y-1.5 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-semibold text-gray-100">{r.billSnapshot?.serialNo || r.billSnapshot?.billSerial || r.billId || r.localBillId}</p>
                  {r.type === 'cancellation' ? (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-500/20 text-red-400 border border-red-500/30">
                      Cancellation Request
                    </span>
                  ) : (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-green-500/20 text-green-400 border border-green-500/30">
                      Transaction Approval
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-gray-500">Requested by: {r.requestedByName || r.requestedBy || '—'} • {getRelativeTime(r.createdAt)}</p>
                <p className="text-[12px] text-gray-300 font-semibold mt-1">Amount: {formatPKR(r.billSnapshot?.totalAmount || r.billSnapshot?.total || 0)}</p>
                
                {r.type === 'cancellation' && (
                  <div className="mt-3 p-3 rounded-lg bg-[#0f0a05] border border-[#2a1f0d] text-[12px] space-y-2">
                    <div className="flex items-start gap-1.5">
                      <span className="text-[10px] font-bold text-amber-500 uppercase tracking-wider shrink-0 mt-0.5">Cashier:</span>
                      <p className="text-gray-300 italic">"{r.cashierCancelReason || 'No reason'}" <span className="text-[10px] text-gray-500">({r.requestedByName || 'Cashier'})</span></p>
                    </div>
                    {r.managerCancelReason && (
                      <div className="flex items-start gap-1.5 pt-1.5 border-t border-[#2a1f0d]/50">
                        <span className="text-[10px] font-bold text-amber-500 uppercase tracking-wider shrink-0 mt-0.5">Manager:</span>
                        <p className="text-gray-300 italic">"{r.managerCancelReason}"</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 self-end md:self-center shrink-0">
                {r.type === 'cancellation' ? (
                  <>
                    <button
                      onClick={async () => {
                        const defaultReason = r.managerCancelReason || r.cashierCancelReason || '';
                        const res = prompt('Confirm final cancellation clearance? You can edit or enter a final clearance comment:', defaultReason);
                        if (res === null) return;
                        if (!res.trim()) {
                          alert('Clearance comment/reason is required!');
                          return;
                        }
                        try {
                          const result = await managerService.processSuperApprovalRequest(r.requestId || r.id, 'approve', res.trim());
                          if (result && result.success) { alert('Bill cancelled and cleared successfully'); load(); }
                          else alert(result.error || 'Clearance failed');
                        } catch (err) { console.error(err); alert('Clearance failed'); }
                      }}
                      className="px-3.5 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-bold transition-colors shadow-lg shadow-red-900/20 active:scale-95 flex items-center gap-1.5"
                    >
                      <Check className="w-3.5 h-3.5" /> Clear Bill
                    </button>
                    <button
                      onClick={async () => {
                        const reason = prompt('Reject cancellation? Enter override reason to restore the bill to active status:');
                        if (reason === null) return;
                        try {
                          const result = await managerService.processSuperApprovalRequest(r.requestId || r.id, 'reject', reason.trim() || 'Rejected by Super Admin');
                          if (result && result.success) { alert('Cancellation rejected, bill restored to active status'); load(); }
                          else alert(result.error || 'Rejection failed');
                        } catch (err) { console.error(err); alert('Rejection failed'); }
                      }}
                      className="px-3 py-1.5 rounded-lg border border-[#2a1f0d] bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-semibold transition-colors active:scale-95"
                      title="Restore Bill"
                    >
                      <X className="w-3.5 h-3.5" /> Reject
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={async () => {
                        if (!confirm('Approve this transaction request?')) return;
                        try {
                          const res = await managerService.processSuperApprovalRequest(r.requestId || r.id, 'approve', 'Approved by super-admin');
                          if (res && res.success) { alert('Approved'); load(); }
                          else alert(res.error || 'Approve failed');
                        } catch (err) { console.error(err); alert('Approve failed'); }
                      }}
                      className="px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 text-white text-xs font-bold transition-colors active:scale-95"
                      title="Approve"
                    ><Check className="w-3.5 h-3.5" /></button>
                    <button
                      onClick={async () => {
                        const reason = prompt('Enter rejection reason:');
                        if (reason == null) return;
                        if (!reason.trim()) return alert('Reason required');
                        try {
                          const res = await managerService.processSuperApprovalRequest(r.requestId || r.id, 'reject', reason);
                          if (res && res.success) { alert('Rejected'); load(); }
                          else alert(res.error || 'Reject failed');
                        } catch (err) { console.error(err); alert('Reject failed'); }
                      }}
                      className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-bold transition-colors active:scale-95"
                      title="Reject"
                    ><X className="w-3.5 h-3.5" /></button>
                  </>
                )}
                <button onClick={() => window.open(`/manager/bills?search=${r.billId || r.localBillId || ''}`, '_self')} className="px-2.5 py-1.5 rounded-lg border border-[#2a1f0d] hover:bg-amber-500/10 hover:text-amber-400 transition-colors text-amber-500 text-xs font-semibold">View</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default SuperApprovals;
