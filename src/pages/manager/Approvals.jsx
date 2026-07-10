import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'react-hot-toast';
import {
  Check, X, RefreshCw, Loader2, Clock, User, Building2,
  FileText, CheckCircle, XCircle, AlertTriangle, Inbox,
  ShoppingCart, Receipt, ArrowRight,
} from 'lucide-react';
import managerService from '../../services/managerService';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../hooks/useLanguage';
import { isElevatedRole, resolveUserBranchIds } from '../../utils/branchAccess';
import useStoresMap, { resolveBranchLabels, resolveStoreName } from '../../hooks/useStoresMap';
import { formatPKR } from '../../utils/managerHelpers';
import ConfirmDialog from '../../components/manager/ConfirmDialog';
import { APPROVAL_TYPE_LABELS } from '../../utils/constants';

const toTs = (v) => {
  if (!v) return 0;
  if (typeof v?.toDate === 'function') {
    try { return v.toDate().getTime(); } catch { return 0; }
  }
  if (v?.seconds) return v.seconds * 1000;
  const d = new Date(v);
  return isNaN(d.getTime()) ? 0 : d.getTime();
};

const fmtDate = (v) => {
  const ts = toTs(v);
  if (!ts) return '—';
  return new Date(ts).toLocaleString('en-PK', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });
};

const requestKey = (r) => {
  const key = r.requestId || r.firestoreId || r.id;
  return key != null ? String(key) : '';
};

const resolveApprovalLookupId = (r) => {
  const raw = r?.requestId ?? r?.firestoreId ?? r?.id;
  if (raw == null) return null;
  if (typeof raw === 'string') return raw.trim() || null;
  if (typeof raw === 'number' && Number.isFinite(raw)) return String(raw);
  return null;
};

const typeMeta = (type) => {
  if (type === 'cancellation') {
    return { label: 'Bill Cancellation', color: 'red', icon: XCircle };
  }
  const label = APPROVAL_TYPE_LABELS[type] || (type ? String(type) : 'General Approval');
  return { label, color: 'amber', icon: FileText };
};

const resolveRequestSource = (r) => {
  const role = String(r.requestedByRole || r.requesterRole || '').toLowerCase();
  if (role === 'cashier') {
    return { key: 'cashier', label: 'Cashier', icon: Receipt, chip: 'bg-sky-500/15 text-sky-300 border-sky-500/30' };
  }
  if (role === 'biller') {
    return { key: 'biller', label: 'Biller', icon: ShoppingCart, chip: 'bg-violet-500/15 text-violet-300 border-violet-500/30' };
  }
  if (role === 'manager') {
    return { key: 'manager', label: 'Manager', icon: User, chip: 'bg-slate-500/15 text-slate-300 border-slate-500/30' };
  }
  if (r.billerId) {
    return { key: 'biller', label: 'Biller', icon: ShoppingCart, chip: 'bg-violet-500/15 text-violet-300 border-violet-500/30' };
  }
  const note = String(r.note || r.reason || '').toLowerCase();
  if (note.includes('cashier')) {
    return { key: 'cashier', label: 'Cashier', icon: Receipt, chip: 'bg-sky-500/15 text-sky-300 border-sky-500/30' };
  }
  return { key: 'staff', label: 'Staff', icon: User, chip: 'bg-zinc-500/15 text-zinc-300 border-zinc-500/30' };
};

const describeRequestPath = (r) => {
  const source = resolveRequestSource(r);
  const type = r.type || r.details?.type || 'approval';
  const meta = typeMeta(type);

  if (type === 'cancellation') {
    return `${source.label} → Cancel bill → Needs your decision`;
  }
  if (type === 'largeBill' || type === 'approval' || !type) {
    return `${source.label} → Checkout bill → Approve for cashier payment`;
  }
  if (type === 'discount') {
    return `${source.label} → Extra discount → Over limit approval`;
  }
  return `${source.label} → ${meta.label}`;
};

const extractNote = (r) =>
  r.cashierCancelReason
  || r.reason
  || r.note
  || r.details?.note
  || r.details?.reason
  || '';

const Approvals = () => {
  const { userData } = useAuth();
  const { t } = useLanguage();
  const storesMap = useStoresMap();

  const branchLabel = useMemo(() => {
    if (!userData || isElevatedRole(userData)) return null;
    const ids = resolveUserBranchIds(userData);
    return ids.length > 0 ? resolveBranchLabels(ids, storesMap) : null;
  }, [userData, storesMap]);

  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processingKey, setProcessingKey] = useState(null);
  const [sortOrder, setSortOrder] = useState('newest');
  const [hideDuplicates, setHideDuplicates] = useState(true);
  const [roleFilter, setRoleFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const [confirm, setConfirm] = useState(null);
  const [reasonInput, setReasonInput] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      let items = await managerService.getApprovalRequests({ status: 'pending' }) || [];
      items = items.map((it) => ({ ...it, _ts: toTs(it.createdAt) }));

      if (hideDuplicates) {
        const map = new Map();
        for (const it of items) {
          const key = it.billId || it.localBillId || it.billSnapshot?.serialNo || requestKey(it);
          if (!key) continue;
          const prev = map.get(key);
          if (!prev || (it._ts || 0) > (prev._ts || 0)) map.set(key, it);
        }
        items = Array.from(map.values());
      }

      if (roleFilter !== 'all') {
        const rf = roleFilter.toLowerCase();
        items = items.filter((it) => resolveRequestSource(it).key === rf);
      }

      if (typeFilter !== 'all') {
        items = items.filter((it) => {
          const tpe = it.type || it.details?.type || 'approval';
          if (typeFilter === 'cancellation') return tpe === 'cancellation';
          if (typeFilter === 'discount') return tpe === 'discount';
          if (typeFilter === 'largeBill') return tpe === 'largeBill' || !it.type;
          return true;
        });
      }

      if (startDate) {
        const s = new Date(`${startDate}T00:00:00`).getTime();
        items = items.filter((it) => (it._ts || 0) >= s);
      }
      if (endDate) {
        const e = new Date(`${endDate}T23:59:59`).getTime();
        items = items.filter((it) => (it._ts || 0) <= e);
      }

      items.sort((a, b) =>
        sortOrder === 'newest' ? (b._ts - a._ts) : (a._ts - b._ts),
      );

      setRequests(items);
    } catch (err) {
      console.error('[Approvals] load:', err);
      toast.error(t('manager.approvalsPage.loadFailed', 'Failed to load approval requests'));
    } finally {
      setLoading(false);
    }
  }, [hideDuplicates, roleFilter, typeFilter, startDate, endDate, sortOrder, t]);

  useEffect(() => { load(); }, [load]);

  const openConfirm = (req, action) => {
    setReasonInput('');
    setConfirm({ req, action });
  };

  const closeConfirm = () => {
    if (processingKey) return;
    setConfirm(null);
    setReasonInput('');
  };

  const runAction = async () => {
    if (!confirm?.req) return;
    const { req, action } = confirm;
    const key = requestKey(req);

    let reason = reasonInput.trim();
    if (req.type === 'cancellation') {
      if (action === 'approve' && !reason) {
        toast.error(t('manager.approvalsPage.reasonRequiredCancel', 'Reason is required to confirm cancellation!'));
        return;
      }
      if (action === 'reject' && !reason) {
        reason = t('manager.approvalsPage.rejectedByManager', 'Rejected by manager');
      }
    } else {
      reason = action === 'reject'
        ? (reason || t('manager.approvalsPage.rejectedByManager', 'Rejected by manager'))
        : t('manager.approvalsPage.approvedByManager', 'Approved by manager');
    }

    setProcessingKey(key);
    const toastId = toast.loading(
      action === 'approve'
        ? t('manager.approvalsPage.processingApprove', 'Approving…')
        : t('manager.approvalsPage.processingReject', 'Rejecting…'),
    );

    try {
      const docId = resolveApprovalLookupId(req);
      if (!docId) {
        toast.error(t('manager.approvalsPage.actionFailed', 'Action failed — missing request id'), { id: toastId });
        return;
      }
      const res = await managerService.processApprovalRequest(docId, action, reason);

      if (res?.success) {
        setRequests((prev) => prev.filter((r) => requestKey(r) !== key));
        const successMsg = req.type === 'cancellation'
          ? (action === 'approve'
            ? t('manager.approvalsPage.cancellationConfirmed', 'Cancellation confirmed — sent to Super Admin')
            : t('manager.approvalsPage.cancellationRejected', 'Cancellation request rejected'))
          : (action === 'approve'
            ? t('manager.approvalsPage.approvedSuccess', 'Approved successfully')
            : t('manager.approvalsPage.rejectedSuccess', 'Rejected successfully'));
        toast.success(String(successMsg), { id: toastId, duration: 4000 });
        setConfirm(null);
        setReasonInput('');
      } else {
        toast.error(String(res?.error || t('manager.approvalsPage.actionFailed', 'Action failed')), { id: toastId });
      }
    } catch (err) {
      console.error('[Approvals] process:', err);
      toast.error(String(err?.message || t('manager.approvalsPage.actionFailed', 'Action failed')), { id: toastId });
    } finally {
      setProcessingKey(null);
    }
  };

  const confirmTitle = useMemo(() => {
    if (!confirm) return '';
    const isCancel = confirm.req?.type === 'cancellation';
    if (confirm.action === 'approve') {
      return isCancel
        ? t('manager.approvalsPage.confirmCancelTitle', 'Confirm bill cancellation?')
        : t('manager.approvalsPage.approveTitle', 'Approve this request?');
    }
    return isCancel
      ? t('manager.approvalsPage.rejectCancelTitle', 'Reject cancellation request?')
      : t('manager.approvalsPage.rejectTitle', 'Reject this request?');
  }, [confirm, t]);

  const confirmMessage = useMemo(() => {
    if (!confirm?.req) return '';
    const serial = confirm.req.billSnapshot?.serialNo || confirm.req.billId || '—';
    const amt = formatPKR(Number(confirm.req.billSnapshot?.totalAmount || confirm.req.billSnapshot?.total || 0));
    return t('manager.approvalsPage.confirmBody', 'Bill {{serial}} · {{amount}} · by {{name}}', {
      serial,
      amount: amt,
      name: confirm.req.requestedByName || confirm.req.requestedBy || 'Staff',
    });
  }, [confirm, t]);

  const needsReason = confirm?.req?.type === 'cancellation';

  const stats = useMemo(() => {
    const fromCashier = requests.filter((r) => resolveRequestSource(r).key === 'cashier').length;
    const fromBiller = requests.filter((r) => resolveRequestSource(r).key === 'biller').length;
    const cancellations = requests.filter((r) => r.type === 'cancellation').length;
    return { fromCashier, fromBiller, cancellations };
  }, [requests]);

  const rolePills = [
    { id: 'all', label: t('manager.approvalsPage.allRoles', 'All roles') },
    { id: 'cashier', label: 'Cashier' },
    { id: 'biller', label: 'Biller' },
  ];

  const typePills = [
    { id: 'all', label: t('manager.approvalsPage.allTypes', 'All types') },
    { id: 'cancellation', label: t('manager.approvalsPage.typeCancel', 'Cancellations') },
    { id: 'largeBill', label: t('manager.approvalsPage.typeBill', 'Bill checkout') },
    { id: 'discount', label: t('manager.approvalsPage.typeDiscount', 'Discounts') },
  ];

  return (
    <div className="space-y-4 max-w-5xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="h-10 w-10 rounded-xl bg-amber-500/15 flex items-center justify-center">
              <CheckCircle className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-100">
                {t('manager.approvalsPage.title', 'Approvals')}
              </h2>
              {!loading && (
                <p className="text-xs text-amber-500/80 font-medium">
                  {requests.length} {t('manager.approvalsPage.pending', 'pending')}
                </p>
              )}
            </div>
          </div>
          <p className="text-sm text-gray-400 mt-2 max-w-xl leading-relaxed">
            {t('manager.approvalsPage.subtitleShort', 'Review requests from your branch — each card shows who sent it (Cashier or Biller) and what they need.')}
          </p>
          {branchLabel && (
            <p className="text-xs text-amber-500/90 mt-1 flex items-center gap-1">
              <Building2 className="w-3 h-3" />
              {t('manager.approvalsPage.branchScope', 'Your branch')}: {branchLabel}
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="flex items-center gap-2 self-start rounded-xl border border-[#2a1f0d] bg-[#1a1208] px-4 py-2 text-sm font-semibold text-amber-400 hover:bg-amber-500/10 transition-all disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          {t('manager.common.refresh', 'Refresh')}
        </button>
      </div>

      {/* Quick stats */}
      {!loading && requests.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[
            { label: t('manager.approvalsPage.statTotal', 'Pending'), value: requests.length, color: 'text-amber-400' },
            { label: 'Cashier', value: stats.fromCashier, color: 'text-sky-400' },
            { label: 'Biller', value: stats.fromBiller, color: 'text-violet-400' },
            { label: t('manager.approvalsPage.typeCancel', 'Cancellations'), value: stats.cancellations, color: 'text-red-400' },
          ].map((s) => (
            <div key={s.label} className="rounded-xl border border-[#22180f] bg-[#111]/80 px-3 py-2.5">
              <p className="text-[10px] uppercase tracking-wide text-gray-500">{s.label}</p>
              <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="space-y-2 p-3 rounded-xl border border-[#22180f] bg-[#111]/80">
        <div className="flex flex-wrap gap-1.5">
          <span className="text-[10px] uppercase text-gray-500 self-center me-1">{t('manager.approvalsPage.filterFrom', 'From')}</span>
          {rolePills.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setRoleFilter(p.id)}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all ${
                roleFilter === p.id
                  ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                  : 'bg-[#0a0805] border-[#2a1f0d] text-gray-400 hover:text-gray-200'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          <span className="text-[10px] uppercase text-gray-500 self-center me-1">{t('manager.approvalsPage.filterType', 'Type')}</span>
          {typePills.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setTypeFilter(p.id)}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all ${
                typeFilter === p.id
                  ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                  : 'bg-[#0a0805] border-[#2a1f0d] text-gray-400 hover:text-gray-200'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-[#22180f]/80">
        <select
          value={sortOrder}
          onChange={(e) => setSortOrder(e.target.value)}
          className="rounded-lg border border-[#2a1f0d] bg-[#0a0805] text-xs text-gray-300 px-2 py-1.5"
        >
          <option value="newest">{t('manager.approvalsPage.mostRecent', 'Most recent')}</option>
          <option value="oldest">{t('manager.approvalsPage.oldestFirst', 'Oldest first')}</option>
        </select>
        <input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          className="rounded-lg border border-[#2a1f0d] bg-[#0a0805] text-xs text-gray-300 px-2 py-1.5"
        />
        <input
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          className="rounded-lg border border-[#2a1f0d] bg-[#0a0805] text-xs text-gray-300 px-2 py-1.5"
        />
        <label className="flex items-center gap-1.5 text-xs text-gray-400 ms-auto cursor-pointer">
          <input
            type="checkbox"
            checked={hideDuplicates}
            onChange={(e) => setHideDuplicates(e.target.checked)}
            className="rounded"
          />
          {t('manager.approvalsPage.hideDuplicates', 'Hide duplicates')}
        </label>
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <Loader2 className="w-8 h-8 text-amber-500 animate-spin" />
          <p className="text-sm text-gray-500">{t('manager.approvalsPage.loading', 'Loading…')}</p>
        </div>
      ) : requests.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3 rounded-2xl border border-dashed border-[#2a1f0d] bg-[#0a0805]/50">
          <Inbox className="w-12 h-12 text-gray-600" />
          <p className="text-gray-400 font-medium">{t('manager.approvalsPage.noApprovals', 'No pending approvals')}</p>
          <p className="text-xs text-gray-600 text-center max-w-xs">
            {t('manager.approvalsPage.noApprovalsHint', 'When cashier or biller sends a cancellation or special request, it will appear here.')}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <AnimatePresence mode="popLayout">
            {requests.map((r, idx) => {
              const key = requestKey(r);
              const busy = processingKey === key;
              const meta = typeMeta(r.type || r.details?.type);
              const TypeIcon = meta.icon;
              const source = resolveRequestSource(r);
              const SourceIcon = source.icon;
              const pathLine = describeRequestPath(r);
              const serial = r.billSnapshot?.serialNo || r.billId || '—';
              const amount = Number(r.billSnapshot?.totalAmount || r.billSnapshot?.total || r.details?.amount || 0);
              const storeName = resolveStoreName(r.storeId, storesMap);
              const note = extractNote(r);

              return (
                <motion.div
                  key={key}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -20, scale: 0.98 }}
                  transition={{ delay: idx * 0.03 }}
                  className={`rounded-2xl border bg-gradient-to-br from-[#1a1208] to-[#0f0a05] p-4 transition-all ${
                    busy ? 'border-amber-500/40 opacity-80' : 'border-[#22180f] hover:border-amber-500/25'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                    <div className="flex-1 min-w-0 space-y-2">
                      {/* Source path — who sent & why */}
                      <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-gray-400">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-bold uppercase border ${source.chip}`}>
                          <SourceIcon className="w-3 h-3" />
                          {source.label}
                        </span>
                        <ArrowRight className="w-3 h-3 text-gray-600 shrink-0" />
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-semibold border ${
                          meta.color === 'red'
                            ? 'bg-red-500/10 text-red-400 border-red-500/25'
                            : 'bg-amber-500/10 text-amber-400 border-amber-500/25'
                        }`}>
                          <TypeIcon className="w-3 h-3" />
                          {meta.label}
                        </span>
                      </div>
                      <p className="text-xs text-gray-300 leading-snug">{pathLine}</p>

                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-base font-bold text-gray-100 font-mono">{serial}</span>
                        <span className="text-sm font-semibold text-emerald-400">{formatPKR(amount)}</span>
                      </div>

                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-400">
                        <span className="flex items-center gap-1">
                          <User className="w-3 h-3 text-amber-500" />
                          {r.requestedByName || r.billerName || r.requestedBy || '—'}
                        </span>
                        <span className="flex items-center gap-1">
                          <Building2 className="w-3 h-3" />
                          {storeName}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {fmtDate(r.createdAt)}
                        </span>
                      </div>

                      {note && (
                        <p className="text-xs text-red-400/90 bg-red-500/5 border border-red-500/10 rounded-lg px-3 py-2">
                          <span className="font-semibold not-italic text-red-300/90">{t('manager.approvalsPage.reasonLabel', 'Reason')}: </span>
                          {note}
                        </p>
                      )}
                    </div>

                    <div className="flex gap-2 shrink-0 sm:flex-col sm:w-36">
                      <button
                        type="button"
                        disabled={busy || !!processingKey}
                        onClick={() => openConfirm(r, 'approve')}
                        className={`flex-1 flex items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-xs font-bold text-white transition-all active:scale-95 disabled:opacity-40 ${
                          r.type === 'cancellation'
                            ? 'bg-red-600 hover:bg-red-500 shadow-lg shadow-red-900/30'
                            : 'bg-emerald-600 hover:bg-emerald-500 shadow-lg shadow-emerald-900/20'
                        }`}
                      >
                        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                        {r.type === 'cancellation'
                          ? t('manager.approvalsPage.confirmCancel', 'Confirm Cancel')
                          : t('manager.common.approve', 'Approve')}
                      </button>
                      <button
                        type="button"
                        disabled={busy || !!processingKey}
                        onClick={() => openConfirm(r, 'reject')}
                        className="flex-1 flex items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-xs font-bold bg-[#2a2520] hover:bg-zinc-700 text-gray-200 border border-[#3a3020] transition-all active:scale-95 disabled:opacity-40"
                      >
                        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}
                        {t('manager.common.reject', 'Reject')}
                      </button>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      <ConfirmDialog
        isOpen={Boolean(confirm)}
        onClose={closeConfirm}
        onConfirm={runAction}
        loading={Boolean(processingKey)}
        title={confirmTitle}
        message={confirmMessage}
        subMessage={
          confirm?.req?.type === 'cancellation' && confirm?.action === 'approve'
            ? t('manager.approvalsPage.cancelEscalateHint', 'Bill will be marked cancelled and sent to Super Admin for final approval.')
            : undefined
        }
        confirmText={
          confirm?.action === 'approve'
            ? (confirm?.req?.type === 'cancellation'
              ? t('manager.approvalsPage.confirmCancel', 'Confirm Cancel')
              : t('manager.common.approve', 'Approve'))
            : t('manager.common.reject', 'Reject')
        }
        cancelText={t('common.cancel', 'Cancel')}
        confirmColor={confirm?.action === 'approve' ? (confirm?.req?.type === 'cancellation' ? 'red' : 'green') : 'orange'}
        confirmIcon={confirm?.action === 'approve' ? CheckCircle : XCircle}
        icon={confirm?.req?.type === 'cancellation' ? AlertTriangle : CheckCircle}
        inputs={needsReason ? [{
          key: 'reason',
          label: t('manager.approvalsPage.reasonLabel', 'Reason'),
          type: 'text',
          placeholder: t('manager.approvalsPage.reasonPlaceholder', 'Enter reason (required)'),
          value: reasonInput,
          onChange: setReasonInput,
        }] : []}
      />
    </div>
  );
};

export default Approvals;
