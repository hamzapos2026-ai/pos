import React, { useEffect, useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import { Check, X } from 'lucide-react';
import managerService from '../../services/managerService';
import { useAuth } from '../../context/AuthContext';

const fmtDate = (v) => {
  try {
    if (!v) return '--';
    let d;
    if (v && typeof v.toDate === 'function') {
      try { d = v.toDate(); } catch { d = new Date(v); }
    } else if (v && typeof v === 'object' && typeof v.seconds === 'number') {
      d = new Date(v.seconds * 1000);
    } else {
      d = new Date(v);
    }
    if (!d || isNaN(d.getTime())) return '--';
    return d.toLocaleString('en-PK');
  } catch { return '--'; }
};

const Approvals = () => {
  const { user } = useAuth();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [processingId, setProcessingId] = useState(null);
  const [sortOrder, setSortOrder] = useState('newest');
  const [hideDuplicates, setHideDuplicates] = useState(true);
  const [roleFilter, setRoleFilter] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      let items = await managerService.getApprovalRequests({ status: 'pending' }) || [];

      items = items.map(it => ({
        ...it,
        _ts: it.createdAt && typeof it.createdAt.toDate === 'function'
          ? it.createdAt.toDate().getTime()
          : (it.createdAt && it.createdAt.seconds ? it.createdAt.seconds * 1000 : 0)
      }));

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

      // Role filter
      if (roleFilter && roleFilter !== 'all') {
        const rf = roleFilter.toLowerCase();
        items = items.filter(it => {
          const role = (it.requestedByRole || it.requesterRole || (it.requestedBy && it.requestedBy.role) || '').toString().toLowerCase();
          return role === rf;
        });
      }

      // Date range
      if (startDate) {
        const s = new Date(`${startDate}T00:00:00`).getTime();
        items = items.filter(it => (it._ts || 0) >= s);
      }
      if (endDate) {
        const e = new Date(`${endDate}T23:59:59`).getTime();
        items = items.filter(it => (it._ts || 0) <= e);
      }

      items.sort((a,b) => sortOrder === 'newest' ? (b._ts - a._ts) : (a._ts - b._ts));

      setRequests(items || []);
    } catch (err) {
      console.error('[Approvals] load:', err);
      toast.error('Failed to load approval requests');
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [sortOrder, hideDuplicates, roleFilter, startDate, endDate]);

  const handleAction = async (req, action) => {
    if (!req) return;
    
    let reason = '';
    if (req.type === 'cancellation') {
      if (action === 'approve') {
        const resReason = prompt('Confirm cancellation for this bill? Enter manager reason/justification:');
        if (resReason === null) return;
        if (!resReason.trim()) {
          toast.error('Reason is required to confirm cancellation!');
          return;
        }
        reason = resReason.trim();
      } else {
        const rejReason = prompt('Reject cashier cancellation request? Enter rejection reason:');
        if (rejReason === null) return;
        reason = rejReason.trim() || 'Rejected by manager';
      }
    } else {
      reason = action === 'reject' ? 'Rejected by manager' : 'Approved by manager';
    }

    setProcessingId(req.requestId || req.id);
    try {
      const res = await managerService.processApprovalRequest(req.requestId || req.id, action, reason);
      if (res.success) {
        toast.success(req.type === 'cancellation'
          ? (action === 'approve' ? 'Cancellation confirmed and escalated' : 'Cancellation request rejected')
          : `${action === 'approve' ? 'Approved' : 'Rejected'} successfully`
        );
        await load();
      } else {
        toast.error(res.error || 'Action failed');
      }
    } catch (err) {
      console.error('[Approvals] process:', err);
      toast.error('Action failed');
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-100">Approvals</h2>
        <div className="flex items-center gap-2">
          <select value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} className="bg-[#0f0b07] text-sm text-gray-300 rounded-md px-2 py-1">
            <option value="newest">Most recent</option>
            <option value="oldest">Oldest first</option>
          </select>
          <label className="flex items-center gap-2 text-sm text-gray-400">
            <input type="checkbox" checked={hideDuplicates} onChange={(e) => setHideDuplicates(e.target.checked)} />
            Hide duplicates
          </label>
          <button onClick={load} className="px-3 py-1 rounded-md bg-amber-500 text-black font-semibold">Refresh</button>
        </div>
      </div>

      <div className="bg-[#111] border border-[#22180f] rounded-xl p-3">
        {loading ? (
          <p className="text-gray-400">Loading...</p>
        ) : requests.length === 0 ? (
          <p className="text-gray-400">No pending approvals.</p>
        ) : (
          <table className="w-full table-auto text-sm">
            <thead>
              <tr className="text-left text-gray-400">
                <th className="py-2">Bill</th>
                <th className="py-2">Total</th>
                <th className="py-2">Requested By</th>
                <th className="py-2">Created</th>
                <th className="py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((r) => (
                <tr key={r.requestId || r.id} className="border-t border-[#22180f] hover:bg-white/[0.02]">
                  <td className="py-2.5 text-gray-200">
                    <div>
                      <span className="font-semibold">{r.billSnapshot?.serialNo || r.billId || '—'}</span>
                      {r.type === 'cancellation' && (
                        <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-500/20 text-red-400 border border-red-500/30">
                          Cancellation Request
                        </span>
                      )}
                    </div>
                    {r.type === 'cancellation' && r.cashierCancelReason && (
                      <div className="text-[11px] text-red-400/90 mt-1 italic">
                        Reason: {r.cashierCancelReason}
                      </div>
                    )}
                  </td>
                  <td className="py-2.5 text-gray-200">{Number(r.billSnapshot?.totalAmount || r.billSnapshot?.total || 0).toLocaleString('en-PK')}</td>
                  <td className="py-2.5 text-gray-200">
                    <div>{r.requestedByName || r.requestedBy}</div>
                    <div className="text-[10px] text-gray-500 capitalize">{r.requestedByRole || 'cashier'}</div>
                  </td>
                  <td className="py-2.5 text-gray-200">{fmtDate(r.createdAt || r.createdAt)}</td>
                  <td className="py-2.5">
                    <div className="flex gap-2">
                      <button
                        disabled={processingId === (r.requestId || r.id)}
                        onClick={() => handleAction(r, 'approve')}
                        className={`px-2 py-1 rounded-md text-white flex items-center gap-1 text-xs font-semibold active:scale-95 transition-all ${
                          r.type === 'cancellation'
                            ? 'bg-red-600 hover:bg-red-700'
                            : 'bg-green-600 hover:bg-green-700'
                        }`}
                      >
                        <Check size={14} /> {r.type === 'cancellation' ? 'Confirm Cancel' : 'Approve'}
                      </button>
                      <button
                        disabled={processingId === (r.requestId || r.id)}
                        onClick={() => handleAction(r, 'reject')}
                        className="px-2 py-1 rounded-md bg-zinc-700 hover:bg-zinc-600 text-white flex items-center gap-1 text-xs font-semibold active:scale-95 transition-all"
                      >
                        <X size={14} /> Reject
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default Approvals;
