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

  const load = async () => {
    setLoading(true);
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
    setLoading(false);
  };

  useEffect(() => { load(); }, [sortOrder, hideDuplicates, roleFilter, startDate, endDate]);

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
        <div className="space-y-2">
          {requests.map(r => (
            <div key={r.requestId || r.id} className="p-3 rounded-xl bg-[#1a1208] border border-[#2a1f0d] flex items-start justify-between">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-100">{r.billId || r.localBillId || (r.billSnapshot?.serialNo)}</p>
                <p className="text-[10px] text-gray-500">Requested by: {r.requestedByName || r.requestedBy || r.requestedByRole || '—'} • {getRelativeTime(r.createdAt)}</p>
                <p className="text-[12px] text-gray-300 mt-2">Amount: {formatPKR(r.billSnapshot?.totalAmount || r.billSnapshot?.total || 0)}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={async () => {
                    if (!confirm('Approve this bill?')) return;
                    try {
                      const res = await managerService.processSuperApprovalRequest(r.requestId || r.id, 'approve', 'Approved by super-admin');
                      if (res && res.success) { alert('Approved'); load(); }
                      else alert(res.error || 'Approve failed');
                    } catch (err) { console.error(err); alert('Approve failed'); }
                  }}
                  className="px-3 py-1 rounded-lg bg-green-600 text-white"
                  title="Approve"
                ><Check className="w-4 h-4" /></button>
                <button
                  onClick={async () => {
                    const reason = prompt('Enter cancel reason:');
                    if (reason == null) return;
                    if (!reason || reason.trim().length === 0) return alert('Reason required');
                    try {
                      const res = await managerService.processSuperApprovalRequest(r.requestId || r.id, 'cancel', reason);
                      if (res && res.success) { alert('Cancelled'); load(); }
                      else alert(res.error || 'Cancel failed');
                    } catch (err) { console.error(err); alert('Cancel failed'); }
                  }}
                  className="px-3 py-1 rounded-lg bg-red-600 text-white"
                  title="Cancel"
                ><X className="w-4 h-4" /></button>
                <button onClick={() => window.open(`/manager/bills?search=${r.billId || r.localBillId || ''}`, '_self')} className="px-2 py-1 rounded-lg border border-[#2a1f0d] text-amber-400">View</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default SuperApprovals;
