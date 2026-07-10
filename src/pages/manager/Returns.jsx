// File: src/pages/manager/Returns.jsx
// Purpose: Sale returns management with approval workflow & refund processing

import React, { useState, useCallback, useMemo } from 'react';
import { RotateCcw, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import managerService from '../../services/managerService';
import { formatPKR, getRelativeTime } from '../../utils/managerHelpers';
import useManagerData from '../../hooks/useManagerData';
import { useLanguage } from '../../hooks/useLanguage';
import DataTable from '../../components/manager/DataTable';
import AdvancedFilters from '../../components/manager/AdvancedFilters';
import ExportMenu from '../../components/manager/ExportMenu';
import StatCard from '../../components/manager/StatCard';
import ConfirmDialog from '../../components/manager/ConfirmDialog';

const Returns = () => {
  const { t } = useLanguage();
  const [filters, setFilters] = useState({ search: '', status: '', from: '', to: '' });
  const [confirmApprove, setConfirmApprove] = useState(null);
  const [confirmReject, setConfirmReject] = useState(null);
  const [rejectReason, setRejectReason] = useState('');

  const loader = useCallback(() => managerService.listReturns(filters), [filters]);
  const { data, loading, refresh } = useManagerData(loader, [filters]);

  const returns = useMemo(() => {
    let list = data || [];
    if (filters.search) {
      const q = filters.search.toLowerCase();
      list = list.filter(r =>
        (r.returnId || '').toLowerCase().includes(q) ||
        (r.originalBillId || '').toLowerCase().includes(q) ||
        (r.reason || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [data, filters.search]);

  const stats = useMemo(() => {
    const totalRefund = returns.reduce((s, r) => s + Number(r.refundAmount || 0), 0);
    const pending = returns.filter(r => r.status === 'pending' || !r.status).length;
    const approved = returns.filter(r => r.status === 'approved').length;
    const rejected = returns.filter(r => r.status === 'rejected').length;
    return { totalRefund, pending, approved, rejected, count: returns.length };
  }, [returns]);

  const handleApprove = async () => {
    if (!confirmApprove) return;
    const res = await managerService.approveReturn(confirmApprove.returnId);
    if (res.success) { toast.success(t('manager.returnsPage.approvedSuccess', 'Return approved & refund processed')); refresh(); }
    else toast.error(res.error);
    setConfirmApprove(null);
  };

  const handleReject = async () => {
    if (!confirmReject || !rejectReason.trim()) {
      toast.error(t('manager.common.reasonRequired', 'Reason required'));
      return;
    }
    const res = await managerService.rejectReturn(confirmReject.returnId, rejectReason);
    if (res.success) { toast.success(t('manager.returnsPage.rejectedSuccess', 'Return rejected')); refresh(); }
    setConfirmReject(null);
    setRejectReason('');
  };

  const STATUS_COLORS = {
    pending: 'bg-orange-500/15 text-orange-400',
    approved: 'bg-green-500/15 text-green-400',
    rejected: 'bg-red-500/15 text-red-400',
  };

  const statusLabel = (status) => {
    if (status === 'approved') return t('manager.common.approved', 'Approved');
    if (status === 'rejected') return t('manager.common.rejected', 'Rejected');
    return t('manager.common.pending', 'Pending');
  };

  const columns = useMemo(() => [
    {
      label: t('manager.common.returnId', 'Return ID'), field: 'returnId',
      render: (r) => (
        <div>
          <p className="text-sm font-medium text-gray-100">{(r.returnId || '').slice(-10)}</p>
          <p className="text-[10px] text-gray-500">{getRelativeTime(r.processedAt || r.createdAt)}</p>
        </div>
      ),
    },
    {
      label: t('manager.common.originalBill', 'Original Bill'), field: 'originalBillId',
      render: (r) => <span className="text-xs text-gray-400 font-mono">{(r.originalBillId || '').slice(-10) || '—'}</span>,
    },
    {
      label: t('manager.common.reason', 'Reason'), field: 'reason',
      render: (r) => <span className="text-xs text-gray-300">{r.reason || '—'}</span>
    },
    {
      label: t('manager.common.refund', 'Refund'), field: 'refundAmount', align: 'right',
      render: (r) => <span className="text-sm font-bold text-red-400">{formatPKR(r.refundAmount || 0)}</span>,
    },
    {
      label: t('manager.common.status', 'Status'), field: 'status', sortable: false,
      render: (r) => (
        <span className={'text-[10px] px-2 py-0.5 rounded-full ' + (STATUS_COLORS[r.status] || STATUS_COLORS.pending)}>
          {statusLabel(r.status || 'pending')}
        </span>
      ),
    },
    {
      label: t('manager.common.action', 'Action'), sortable: false, align: 'right',
      render: (r) => (r.status === 'pending' || !r.status) && (
        <div className="flex gap-1 justify-end">
          <button onClick={() => setConfirmApprove(r)} className="p-1.5 rounded-lg text-green-400 hover:bg-green-500/10"><CheckCircle className="w-3.5 h-3.5" /></button>
          <button onClick={() => setConfirmReject(r)} className="p-1.5 rounded-lg text-red-400 hover:bg-red-500/10"><XCircle className="w-3.5 h-3.5" /></button>
        </div>
      ),
    },
  ], [t]);

  const mobileCard = (r) => (
    <div className="p-3 rounded-xl border border-[#2a1f0d] bg-[#1a1208]">
      <div className="flex justify-between items-start mb-2">
        <div>
          <p className="text-sm font-bold text-gray-100">{(r.returnId || '').slice(-10)}</p>
          <p className="text-[10px] text-gray-500">{t('manager.common.billNo', 'Bill #')}: {(r.originalBillId || '').slice(-8) || '—'}</p>
          <p className="text-[10px] text-gray-500">{getRelativeTime(r.processedAt || r.createdAt)}</p>
        </div>
        <span className={'text-[10px] px-2 py-0.5 rounded-full ' + (STATUS_COLORS[r.status] || STATUS_COLORS.pending)}>{statusLabel(r.status || 'pending')}</span>
      </div>
      <p className="text-xs text-gray-400 mb-2">{r.reason || t('manager.returnsPage.noReason', 'No reason given')}</p>
      <p className="text-sm font-bold text-red-400">{t('manager.returnsPage.refundLabel', 'Refund: {{amount}}', { amount: formatPKR(r.refundAmount || 0) })}</p>
      {(r.status === 'pending' || !r.status) && (
        <div className="flex gap-2 mt-2">
          <button onClick={() => setConfirmApprove(r)} className="flex-1 py-1.5 rounded-lg bg-green-500/15 text-green-400 text-xs">{t('manager.common.approve', 'Approve')}</button>
          <button onClick={() => setConfirmReject(r)} className="flex-1 py-1.5 rounded-lg bg-red-500/15 text-red-400 text-xs">{t('manager.common.reject', 'Reject')}</button>
        </div>
      )}
    </div>
  );

  const exportRows = returns.map(r => ({
    ReturnID: r.returnId, OriginalBill: r.originalBillId, Reason: r.reason,
    Refund: Number(r.refundAmount || 0), Status: r.status || 'pending',
    Date: (r.processedAt || r.createdAt || '').slice(0, 10),
  }));

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <h2 className="text-xl font-bold text-gray-100 flex items-center gap-2">
          <RotateCcw className="w-5 h-5 text-amber-500" /> {t('manager.returnsPage.title', 'Sale Returns')}
        </h2>
        <ExportMenu data={exportRows} filename={'returns_' + new Date().toISOString().slice(0, 10)} />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label={t('manager.returnsPage.totalReturns', 'Total Returns')} value={stats.count} icon={RotateCcw} color="purple" loading={loading} />
        <StatCard label={t('manager.returnsPage.refundAmount', 'Refund Amount')} value={stats.totalRefund} prefix="Rs " icon={RotateCcw} color="red" loading={loading} />
        <StatCard label={t('manager.common.pending', 'Pending')} value={stats.pending} icon={Loader2} color="orange" loading={loading} />
        <StatCard label={t('manager.common.approved', 'Approved')} value={stats.approved} icon={CheckCircle} color="green" loading={loading} />
      </div>

      <AdvancedFilters
        searchValue={filters.search}
        onSearchChange={(v) => setFilters(f => ({ ...f, search: v }))}
        searchPlaceholder={t('manager.returnsPage.searchPh', 'Search returns…')}
        dateFrom={filters.from}
        dateTo={filters.to}
        onDateChange={(d) => setFilters(f => ({ ...f, from: d.from, to: d.to }))}
        onReset={() => setFilters({ search: '', status: '', from: '', to: '' })}
        resultCount={returns.length}
        customFilters={[{
          key: 'status', label: t('manager.common.status', 'Status'), value: filters.status,
          options: [
            { value: 'pending', label: t('manager.common.pending', 'Pending') },
            { value: 'approved', label: t('manager.common.approved', 'Approved') },
            { value: 'rejected', label: t('manager.common.rejected', 'Rejected') },
          ],
          onChange: (v) => setFilters(f => ({ ...f, status: v })),
        }]}
      />

      <DataTable
        columns={columns}
        data={returns}
        loading={loading}
        emptyMessage={t('manager.returnsPage.noReturns', 'No returns found')}
        rowKey="returnId"
        mobileCardRenderer={mobileCard}
        pageSize={25}
      />

      <ConfirmDialog
        isOpen={!!confirmApprove}
        onClose={() => setConfirmApprove(null)}
        onConfirm={handleApprove}
        title={t('manager.returnsPage.approveTitle', 'Approve Return?')}
        message={t('manager.returnsPage.approveMsg', 'This will process a refund of {{amount}}', { amount: formatPKR(confirmApprove?.refundAmount || 0) })}
        subMessage={t('manager.returnsPage.approveSub', 'A cash transaction will be automatically created.')}
        confirmText={t('manager.returnsPage.approveConfirm', 'Approve & Refund')}
        confirmIcon={CheckCircle}
        confirmColor="green"
      />

      <ConfirmDialog
        isOpen={!!confirmReject}
        onClose={() => { setConfirmReject(null); setRejectReason(''); }}
        onConfirm={handleReject}
        title={t('manager.returnsPage.rejectTitle', 'Reject Return?')}
        message={t('manager.returnsPage.rejectMsg', 'Please provide a reason for rejection')}
        confirmText={t('manager.returnsPage.rejectConfirm', 'Reject Return')}
        confirmIcon={XCircle}
        confirmColor="red"
        inputs={[{
          key: 'reason', label: t('manager.returnsPage.rejectReasonLabel', 'Rejection Reason'), value: rejectReason,
          placeholder: t('manager.returnsPage.rejectReasonPh', 'Why is this being rejected?'),
          onChange: setRejectReason,
        }]}
      />
    </div>
  );
};

export default Returns;
