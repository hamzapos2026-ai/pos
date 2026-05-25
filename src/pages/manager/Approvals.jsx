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
    setProcessingId(req.requestId || req.id);
    try {
      const res = await managerService.processApprovalRequest(req.requestId || req.id, action, action === 'reject' ? 'Rejected by manager' : 'Approved by manager');
      if (res.success) {
        toast.success(`${action === 'approve' ? 'Approved' : 'Rejected'} successfully`);
        await load();
      } else {
        toast.error(res.error || 'Action failed');
      }
    } catch (err) {
      console.error('[Approvals] process:', err);
      toast.error('Action failed');
    } finally { setProcessingId(null); }
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
                <tr key={r.requestId || r.id} className="border-t border-[#22180f]">
                  <td className="py-2 text-gray-200">{r.billSnapshot?.serialNo || r.billId || '—'}</td>
                  <td className="py-2 text-gray-200">{Number(r.billSnapshot?.totalAmount || 0).toLocaleString('en-PK')}</td>
                  <td className="py-2 text-gray-200">{r.requestedByName || r.requestedBy}</td>
                  <td className="py-2 text-gray-200">{fmtDate(r.createdAt || r.createdAt)}</td>
                  <td className="py-2">
                    <div className="flex gap-2">
                      <button
                        disabled={processingId === (r.requestId || r.id)}
                        onClick={() => handleAction(r, 'approve')}
                        className="px-2 py-1 rounded-md bg-green-600 text-white flex items-center gap-2"
                      >
                        <Check size={14} /> Approve
                      </button>
                      <button
                        disabled={processingId === (r.requestId || r.id)}
                        onClick={() => handleAction(r, 'reject')}
                        className="px-2 py-1 rounded-md bg-red-600 text-white flex items-center gap-2"
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
