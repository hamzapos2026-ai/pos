// File: src/pages/admin/BillsControl.jsx
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  ShoppingBag, Eye, Trash2, RotateCcw, Download,
  Clock, FileText, CheckCircle2, Wifi, Database,
  AlertTriangle, FileCheck, Coins, DollarSign, Check, RefreshCw, MoreVertical, Zap, WifiOff,
} from 'lucide-react';
import {
  collection, doc, updateDoc, deleteDoc,
  serverTimestamp, query, orderBy, limit, getDocs,
  addDoc,
} from '../../services/firebase';
import { db, isFirebaseReady } from '../../services/firebase';
import { toast } from 'react-hot-toast';
import { cn } from '../../utils/cn';
import { motion, AnimatePresence } from 'framer-motion';
import Button from '../../components/ui/Button';
import DataTable from '../../components/manager/DataTable';
import InvoicePrint from '../../components/biller/InvoicePrint';
import { useSettings } from '../../context/SettingsContext';
import { useAuth } from '../../context/AuthContext';
import { softArchiveOrder, permanentDeleteOrder, PERMANENT_DELETE_PHRASE } from '../../services/archiveService';
import { useTheme } from '../../context/ThemeContext';
import { useLanguage } from '../../hooks/useLanguage';
import { useNetwork } from '../../context/NetworkContext';
import DatePresetBar from '../../components/shared/DatePresetBar';
import { resolveDatePresetRange } from '../../utils/datePresetUtils';
import { normalizeStoreForInvoice, normalizeOrderForInvoice, buildInvoicePrintProps } from '../../utils/invoiceUtils';
import BillsAdvancedToolbar from '../../components/shared/BillsAdvancedToolbar';
import {
  DEFAULT_BILLS_FILTERS,
  applyBillsFilters,
  getBillsFilterStats,
  prepareBillsForDisplay,
  getBillSerialSortKey,
  dedupeBillsBySerial,
  isPendingCashier,
  isDualModeBillRow,
  getOfflineChannelBadge,
} from '../../utils/billsFilterUtils';
import { getBillPaymentStatus, getBillStatusInfo, getBillWorkflowStatusBadge } from '../../utils/managerHelpers';
import { normalizeOrder } from '../../services/managerService';
import useStoresMap, { resolveStoreLabel } from '../../hooks/useStoresMap';
import { resolveUserBranchIds, resolveUserPrimaryBranch, expandBranchIds, isElevatedRole, resolveAdminDataScope } from '../../utils/branchAccess';
import { fetchBillsControlPage, fetchElevatedAdminPendingBills, BILLS_CONTROL_PAGE_SIZE } from '../../utils/ordersQueryUtils';
import { BILLS_PAGE_SIZE_OPTIONS } from '../../utils/paginationConstants';
import { BILLS_CONTROL_POLL_MS } from '../../utils/firebaseQuotaConfig';
import { mergeCloudWithLocalOrders } from '../../utils/billsMergeUtils';
import { getUnsyncedLocalOrdersForStores } from '../../services/localBillService';
import {
  formatBillDateTime, getBillDisplayTimestamp, getBillPaidByDisplay,
  getBillPaidAtTimestamp, getBillSerialDisplay,
} from '../../utils/billsListHelpers';
import { buildSettlePatch, buildRestorePendingPatch, isCashierPaidPendingManager } from '../../utils/cashierOrderUtils';
import { logBillSettled } from '../../services/activityLogger';
import useBillRowAlerts from '../../hooks/useBillRowAlerts';
import {
  getBillRowHighlightClass,
  getBillCardHighlightClass,
  getBillRemovedBadge,
  getBillEditedBadge,
} from '../../utils/billRowStyles';

const resolveBillActor = (userData) => {
  const roles = Array.isArray(userData?.roles) ? userData.roles : [userData?.primaryRole || userData?.role].filter(Boolean);
  const role = roles.find((r) => ['superAdmin', 'superadmin', 'admin'].includes(r))
    || userData?.primaryRole || userData?.role || 'admin';
  return {
    userId: userData?.uid || '',
    userName: userData?.name || userData?.displayName || 'Admin',
    role,
  };
};

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

const paymentLabel = (row) => {
  const ps = String(row.paymentStatus || '').toLowerCase();
  if (ps === 'pending_approval') return 'MGR APPROVAL';
  if (ps === 'pending_payment') return 'PENDING CASHIER';
  if (ps === 'paid') return 'PAID';
  if (ps === 'unpaid' || !ps) return 'UNPAID';
  return ps.replace(/_/g, ' ').toUpperCase();
};

const paymentVariant = (row) => {
  const ps = String(row.paymentStatus || '').toLowerCase();
  if (ps === 'paid') return 'success';
  if (ps === 'pending_payment' || ps === 'pending_approval') return 'warning';
  return 'warning';
};

// ── Status Badge ───────────────────────────────────────────────
const StatusBadge = ({ variant, children }) => {
  const variants = {
    success: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25',
    warning: 'bg-amber-500/15   text-amber-400   border-amber-500/25',
    destructive: 'bg-rose-500/15    text-rose-400    border-rose-500/25',
    info: 'bg-blue-500/15    text-blue-400    border-blue-500/25',
    purple: 'bg-violet-500/15  text-violet-400  border-violet-500/25',
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
const ActionMenu = ({ row, onView, onApprove, onMarkPaid, onConfirmCashier, onReset, onSoftDelete, onHardDelete, canHardDelete = false }) => {
  const { t } = useLanguage();
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
  const needsConfirm = isCashierPaidPendingManager(row);

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
                <Eye className="w-3.5 h-3.5 text-amber-500" /> {t('admin.billsPage.viewDetails', 'View Details')}
              </button>

              {!isDel && (row.status === 'pending' || row.paymentStatus === 'unpaid' || !row.paymentStatus) && (
                <button
                  onClick={() => { setOpen(false); onApprove(); }}
                  className="w-full text-left px-2.5 py-1.5 text-xs text-emerald-400 hover:bg-emerald-500/10 rounded-lg transition-all flex items-center gap-2"
                >
                  <Check className="w-3.5 h-3.5 text-emerald-500" /> {t('admin.billsPage.approve', 'Approve')}
                </button>
              )}

              {needsConfirm && (
                <button
                  onClick={() => { setOpen(false); onConfirmCashier(); }}
                  className="w-full text-left px-2.5 py-1.5 text-xs text-sky-400 hover:bg-sky-500/10 rounded-lg transition-all flex items-center gap-2"
                >
                  <CheckCircle2 className="w-3.5 h-3.5 text-sky-500" /> {t('bills.confirmCashierPayment', 'Confirm Payment')}
                </button>
              )}

              {!isDel && hasOut && !needsConfirm && (
                <button
                  onClick={() => { setOpen(false); onMarkPaid(); }}
                  className="w-full text-left px-2.5 py-1.5 text-xs text-emerald-400 hover:bg-emerald-500/10 rounded-lg transition-all flex items-center gap-2"
                >
                  <Coins className="w-3.5 h-3.5 text-emerald-500" /> {t('admin.billsPage.markPaid', 'Mark Paid')}
                </button>
              )}

              {!isDel && row.paymentStatus === 'paid' && (
                <button
                  onClick={() => { setOpen(false); onReset(); }}
                  className="w-full text-left px-2.5 py-1.5 text-xs text-amber-400 hover:bg-amber-500/10 rounded-lg transition-all flex items-center gap-2"
                >
                  <RefreshCw className="w-3.5 h-3.5 text-amber-500" /> {t('admin.billsPage.resetPending', 'Reset Pending')}
                </button>
              )}

              <div className="my-1 border-t border-[#2a1f0d]" />

              {!isDel && (
                <button
                  onClick={() => { setOpen(false); onSoftDelete(); }}
                  className="w-full text-left px-2.5 py-1.5 text-xs text-rose-400 hover:bg-rose-500/10 rounded-lg transition-all flex items-center gap-2"
                >
                  <Trash2 className="w-3.5 h-3.5 text-rose-500" /> {t('admin.billsPage.cancelBill', 'Cancel Bill')}
                </button>
              )}

              {isDel && (
                <>
                  <button
                    onClick={() => { setOpen(false); onReset(); }}
                    className="w-full text-left px-2.5 py-1.5 text-xs text-emerald-400 hover:bg-emerald-500/10 rounded-lg transition-all flex items-center gap-2"
                  >
                    <RotateCcw className="w-3.5 h-3.5 text-emerald-500" /> {t('admin.billsPage.restore', 'Restore')}
                  </button>
                  {canHardDelete && (
                    <button
                      onClick={() => { setOpen(false); onHardDelete?.(); }}
                      className="w-full text-left px-2.5 py-1.5 text-xs text-rose-400 hover:bg-rose-500/10 rounded-lg transition-all flex items-center gap-2"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-rose-500" /> {t('admin.billsPage.eraseForever', 'Erase Forever')}
                    </button>
                  )}
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const BillsControl = ({ scopeOverride = null, managerMode = false } = {}) => {
  const { settings } = useSettings();
  const { user, userData, isSuperAdmin } = useAuth();
  const { isDark } = useTheme();
  const { t, isRTL } = useLanguage();
  const { isOnline } = useNetwork();
  const storesMap = useStoresMap();
  const elevated = managerMode ? false : isElevatedRole(userData);
  // Permanent delete — SIRF Super Admin. (Manager/Admin ke liye nahi.)
  const canHardDelete = !!isSuperAdmin;
  const adminScope = useMemo(
    () => scopeOverride || resolveAdminDataScope(userData, storesMap),
    [scopeOverride, userData, storesMap],
  );
  const storeListenIds = useMemo(() => {
    if (managerMode) return adminScope.storeIds || [];
    if (elevated || !adminScope.storeIds) return [];
    return adminScope.storeIds;
  }, [managerMode, elevated, adminScope.storeIds]);
  const branchScope = useMemo(() => {
    if (elevated) return [];
    return resolveUserBranchIds(userData);
  }, [userData, elevated]);
  const branchAliasScope = useMemo(() => {
    if (elevated) return [];
    if (managerMode && adminScope.storeIds?.length) {
      return expandBranchIds(adminScope.storeIds, storesMap);
    }
    const primary = resolveUserPrimaryBranch(userData);
    return expandBranchIds(
      [...new Set([primary, ...branchScope].filter(Boolean))],
      storesMap,
    );
  }, [userData, branchScope, storesMap, elevated, managerMode, adminScope.storeIds]);
  const invoiceStore = normalizeStoreForInvoice({
    name: settings?.shop?.name || settings?.store?.name,
    address: settings?.shop?.address || settings?.store?.address,
    phone: settings?.shop?.phone || settings?.store?.phone,
    email: settings?.shop?.email,
    tagline: settings?.shop?.tagline,
    ntn: settings?.shop?.ntn,
  });
  const [bills, setBills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [liveAt, setLiveAt] = useState(null);
  const [billsCursor, setBillsCursor] = useState(null);
  const [hasMoreBills, setHasMoreBills] = useState(false);
  const [cloudStatusFilter, setCloudStatusFilter] = useState('all');
  const billsMountedRef = useRef(true);
  const cloudBillsRef = useRef([]);
  const [filters, setFilters] = useState({ ...DEFAULT_BILLS_FILTERS, showAdvanced: false });

  useEffect(() => {
    if (elevated && !managerMode) {
      setFilters((prev) => (prev.showAll ? prev : { ...prev, showAll: true }));
    }
  }, [elevated, managerMode]);
  const [selectedBill, setSelectedBill] = useState(null);
  const [invoiceSeq, setInvoiceSeq] = useState(0);
  const openBillInvoice = useCallback((row) => {
    setInvoiceSeq((n) => n + 1);
    setSelectedBill(row);
  }, []);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteReason, setDeleteReason] = useState('');
  const [submittingDelete, setSubmittingDelete] = useState(false);
  const [hardDeleteTarget, setHardDeleteTarget] = useState(null);
  const [hardConfirm, setHardConfirm] = useState('');
  const [submittingHardDelete, setSubmittingHardDelete] = useState(false);
  const [loadingAction, setLoadingAction] = useState(null);

  const loadBills = useCallback(async (cursor = null, { silent = false } = {}) => {
    if (!isFirebaseReady() || !db) {
      if (!silent) setLoading(false);
      return;
    }
    if (!silent) setLoading(true);
    try {
      const scopeStore = storeListenIds[0] || adminScope.storeId || null;
      const { orders, lastDoc, hasMore } = await fetchBillsControlPage({
        storeIds: storeListenIds.length ? storeListenIds : adminScope.storeIds,
        storeId: scopeStore,
        branchId: adminScope.branchId || scopeStore,
        statusFilter: cloudStatusFilter,
        cursor,
        pageSize: BILLS_CONTROL_PAGE_SIZE,
        normalizer: (raw) => normalizeOrder(raw),
      });

      let mergedCloud = orders;
      if (elevated && !cursor) {
        const branchIds = Object.keys(storesMap || {}).filter(Boolean);
        if (branchIds.length) {
          const pendingRows = await fetchElevatedAdminPendingBills({
            storeIds: branchIds,
            limitPerStore: 250,
            normalizer: (raw) => normalizeOrder(raw),
          });
          const map = new Map();
          mergedCloud.forEach((o) => map.set(o.id || o.localId, o));
          pendingRows.forEach((o) => map.set(o.id || o.localId, o));
          mergedCloud = [...map.values()];
        }
      }

      const localScopeIds = elevated
        ? Object.keys(storesMap || {}).filter(Boolean)
        : (storeListenIds.length ? storeListenIds : null);
      const localOrders = await getUnsyncedLocalOrdersForStores(
        localScopeIds?.length ? localScopeIds : null,
      ).catch(() => []);
      if (cursor) {
        const map = new Map();
        cloudBillsRef.current.forEach((o) => map.set(o.id || o.localId, o));
        mergedCloud.forEach((o) => map.set(o.id || o.localId, o));
        cloudBillsRef.current = [...map.values()];
      } else {
        cloudBillsRef.current = mergedCloud;
      }
      const merged = mergeCloudWithLocalOrders(cloudBillsRef.current, localOrders);
      let enriched = merged;
      try {
        const { fetchAndApplyCloudPayments } = await import('../../services/paymentReconciliationService');
        const { from } = resolveDatePresetRange(filters.datePreset || 'today', filters.dateFrom, filters.dateTo);
        enriched = await fetchAndApplyCloudPayments(merged, {
          storeIds: storeListenIds.length ? storeListenIds : adminScope.storeIds,
          since: from,
        });
      } catch { /* non-critical */ }
      if (!billsMountedRef.current) return;
      setBills(prepareBillsForDisplay(enriched.filter(Boolean)));
      setBillsCursor(lastDoc);
      setHasMoreBills(hasMore);
      setLiveAt(Date.now());
    } catch (err) {
      console.error('[BillsControl] loadBills:', err);
    } finally {
      if (billsMountedRef.current && !silent) setLoading(false);
    }
  }, [storeListenIds, adminScope, userData, cloudStatusFilter, filters.datePreset, filters.dateFrom, filters.dateTo, elevated, storesMap]);

  const silentRefreshBills = useCallback(() => {
    if (!isOnline || document.hidden) return;
    void loadBills(null, { silent: true });
  }, [isOnline, loadBills]);

  useEffect(() => {
    billsMountedRef.current = true;
    void loadBills(null);
    return () => { billsMountedRef.current = false; };
  }, [storeListenIds, cloudStatusFilter, loadBills, storesMap]);

  const prevOnlineRef = useRef(isOnline);
  useEffect(() => {
    if (!prevOnlineRef.current && isOnline) {
      void loadBills(null, { silent: false });
    }
    prevOnlineRef.current = isOnline;
  }, [isOnline, loadBills]);

  useEffect(() => {
    if (!isOnline) return undefined;
    const timer = setInterval(silentRefreshBills, BILLS_CONTROL_POLL_MS);
    return () => clearInterval(timer);
  }, [isOnline, silentRefreshBills]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') silentRefreshBills();
    };
    const onCloudUpdated = () => silentRefreshBills();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('aone:bills-cloud-updated', onCloudUpdated);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('aone:bills-cloud-updated', onCloudUpdated);
    };
  }, [silentRefreshBills]);

  const filtered = useMemo(
    () => applyBillsFilters(bills, { ...filters, branchScope: branchAliasScope }),
    [bills, filters, branchAliasScope]
  );

  const filterStats = useMemo(
    () => getBillsFilterStats(filtered, filtered),
    [filtered],
  );
  const loadedBillCount = useMemo(
    () => dedupeBillsBySerial(bills).length,
    [bills],
  );

  const { newBillIds, newBillCount, dismissBill, dismissAll, fraudSummary } = useBillRowAlerts(bills, { enabled: true });
  const getRowClassName = useCallback(
    (row, idx) => getBillRowHighlightClass(row, { newBillIds, idx }),
    [newBillIds],
  );

  const handleResetFilters = useCallback(() => {
    setFilters({ ...DEFAULT_BILLS_FILTERS, showAdvanced: filters.showAdvanced });
  }, [filters.showAdvanced]);
  const handleApprove = useCallback(async (row) => {
    if (!confirm(t('admin.billsPage.approveConfirm', 'Approve this bill?'))) return;
    setLoadingAction(row.id);
    try {
      await updateDoc(doc(db, 'orders', row.id), {
        status: 'approved',
        approvedAt: serverTimestamp(),
      });
      toast.success(t('admin.billsPage.billApproved', 'Bill approved'));
    } catch (e) { toast.error(e.message); }
    finally { setLoadingAction(null); }
  }, [t]);

  const handleConfirmCashier = useCallback(async (row) => {
    if (!confirm(t('bills.confirmCashierPayment', 'Confirm cashier payment?'))) return;
    const total = Number(row.grandTotal || row.totalAmount || row.total || 0);
    const actor = resolveBillActor(userData);
    setLoadingAction(row.id);
    try {
      await updateDoc(doc(db, 'orders', row.id), {
        ...buildSettlePatch({ ...actor, amount: total, keepCashierPaidBy: true }),
        paidAt: serverTimestamp(),
      });
      await logBillSettled(actor, row, { confirmCashier: true });
      toast.success(t('admin.billsPage.billApproved', 'Payment confirmed'));
    } catch (e) { toast.error(e.message); }
    finally { setLoadingAction(null); }
  }, [t, userData]);

  const handleMarkPaid = useCallback(async (row) => {
    if (!confirm(t('admin.billsPage.markPaidConfirm', 'Mark this bill as paid?'))) return;
    const total = Number(row.grandTotal || row.totalAmount || row.total || 0);
    const actor = resolveBillActor(userData);
    setLoadingAction(row.id);
    try {
      await updateDoc(doc(db, 'orders', row.id), {
        ...buildSettlePatch({ ...actor, amount: total, keepCashierPaidBy: false }),
        paidAt: serverTimestamp(),
      });
      await logBillSettled(actor, row, { confirmCashier: false });
      toast.success(t('admin.billsPage.markedPaid', 'Marked as Paid ✓'));
    } catch (e) { toast.error(e.message); }
    finally { setLoadingAction(null); }
  }, [t, userData]);

  const handleRestore = useCallback(async (row) => {
    setLoadingAction(row.id);
    try {
      const total = Number(row.grandTotal || row.totalAmount || row.total || 0);
      await updateDoc(doc(db, 'orders', row.id), {
        ...buildRestorePendingPatch({ total, approved: row.status === 'approved' || row.status === 'pending' }),
        restoredAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
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
        ...buildRestorePendingPatch({ total, approved: true }),
        updatedAt: serverTimestamp(),
      });
      toast.success('Reset ✓');
    } catch (e) { toast.error(e.message); }
    finally { setLoadingAction(null); }
  }, []);

  const executeSoftDelete = useCallback(async () => {
    if (!deleteTarget || !deleteReason.trim()) { toast.error('Reason required'); return; }
    setSubmittingDelete(true);
    try {
      const target = bills.find((b) => b.id === deleteTarget.id);
      await softArchiveOrder(deleteTarget.id, {
        deletedBy: { uid: user?.uid, email: user?.email },
        reason: deleteReason.trim(),
        billRow: target,
      });
      toast.success('Bill archive ho gaya — Backup → Archive se restore karo');
      setDeleteTarget(null);
      setDeleteReason('');
    } catch (e) { toast.error(e.message); }
    finally { setSubmittingDelete(false); }
  }, [deleteTarget, deleteReason, bills, user]);

  const executeHardDelete = useCallback(async () => {
    if (!hardDeleteTarget) return;
    if (!canHardDelete) { toast.error(t('admin.billsPage.hardDeleteNoPerm', 'Permission nahi')); return; }
    if (String(hardConfirm || '').trim().toUpperCase() !== PERMANENT_DELETE_PHRASE) {
      toast.error(`${t('admin.billsPage.hardDeleteTypeToConfirm', 'Likho')}: ${PERMANENT_DELETE_PHRASE}`);
      return;
    }
    setSubmittingHardDelete(true);
    try {
      const target = bills.find((b) => b.id === hardDeleteTarget.id) || hardDeleteTarget.row;
      await permanentDeleteOrder(target || { id: hardDeleteTarget.id }, {
        deletedBy: { uid: user?.uid, email: user?.email, name: userData?.name },
        reason: 'permanent_delete_from_bills',
      });
      setBills((prev) => prev.filter((b) => b.id !== hardDeleteTarget.id));
      toast.success(t('admin.billsPage.hardDeleteDone', 'Bill hamesha ke liye delete ho gaya'));
      setHardDeleteTarget(null);
      setHardConfirm('');
    } catch (e) { toast.error(e.message); }
    finally { setSubmittingHardDelete(false); }
  }, [hardDeleteTarget, hardConfirm, canHardDelete, bills, user, userData, t]);

  const handleExport = useCallback(() => {
    if (!filtered.length) { toast.error('No data'); return; }
    const rows = filtered.map(b => [
      getBillSerialDisplay(b),
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
      label: t('admin.billsPage.colSerial', 'Serial'),
      field: 'billSerial',
      width: '200px',
      sortable: true,
      sortValue: (row) => getBillSerialSortKey(row) || row.billSerial || row.serialNo || row.id,
      render: (row) => {
        const serial = getBillSerialDisplay(row);
        const { date, time } = formatBillDateTime(getBillDisplayTimestamp(row));
        return (
          <div className="min-w-0">
            <p className="font-mono font-semibold text-[13px] text-gray-100 whitespace-nowrap leading-tight" title={serial}>
              {serial}
            </p>
            <p className="text-[11px] text-slate-500 mt-0.5">{date}</p>
            <p className="text-[11px] text-amber-400/90 font-mono">{time}</p>
          </div>
        );
      },
    },
    {
      label: t('bills.colPaidBy', 'Paid By'),
      field: 'paidByName',
      width: '110px',
      sortable: true,
      sortValue: (row) => getBillPaidByDisplay(row),
      render: (row) => {
        const paidAt = getBillPaidAtTimestamp(row);
        const { date, time } = formatBillDateTime(paidAt);
        const name = isPendingCashier(row)
          ? t('bills.awaitingCashier', 'Awaiting')
          : getBillPaidByDisplay(row);
        return (
          <div className="min-w-0 text-xs leading-tight">
            <p className="text-gray-200 truncate">{name}</p>
            {paidAt && date !== '—' && (
              <>
                <p className="text-[10px] text-slate-500 mt-0.5">{date}</p>
                <p className="text-[10px] text-emerald-400/90 font-mono">{time}</p>
              </>
            )}
          </div>
        );
      },
    },
    {
      label: t('bills.colStore', 'Store / Branch'),
      field: 'storeId',
      width: '100px',
      sortable: true,
      sortValue: (row) => resolveStoreLabel(row, storesMap),
      render: (row) => (
        <div className="min-w-0">
          <p className="text-[13px] text-gray-200 truncate">{resolveStoreLabel(row, storesMap)}</p>
        </div>
      ),
    },
    {
      label: t('admin.billsPage.colCustomer', 'Customer'),
      field: 'customerName',
      width: '100px',
      sortable: true,
      sortValue: (row) => row.customer?.name || row.customerName || 'Walk-in',
      render: (row) => (
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-gray-200 truncate">
            {row.customer?.name || row.customerName || 'Walk-in'}
          </p>
          {row.billerName && (
            <p className="text-[11px] text-slate-500 truncate">{row.billerName}</p>
          )}
        </div>
      ),
    },
    {
      label: t('admin.billsPage.colAmount', 'Amount'),
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
      label: t('payment.title', 'Payment'),
      field: 'paymentStatus',
      width: '100px',
      sortable: true,
      sortValue: (row) => row.deleted || row.isDeleted ? 'deleted' : (row.paymentStatus || 'unpaid'),
      render: (row) => {
        const removed = getBillRemovedBadge(row);
        const edited = getBillEditedBadge(row);
        const ps = getBillPaymentStatus(row);
        const workflow = getBillWorkflowStatusBadge(row);
        const payVariant = ps.color === 'green' ? 'success' : ps.color === 'red' ? 'destructive' : 'warning';
        return (
          <div className="flex flex-wrap gap-1 items-center max-w-[110px]">
            {removed ? (
              <StatusBadge variant="destructive">{removed.label}</StatusBadge>
            ) : (
              <StatusBadge variant={payVariant}>{ps.label}</StatusBadge>
            )}
            {edited && (
              <StatusBadge variant="purple">{edited.label}</StatusBadge>
            )}
            {!removed && workflow && (
              <StatusBadge variant="info">{workflow.label}</StatusBadge>
            )}
            {!removed && isDualModeBillRow(row) && (
              <StatusBadge variant="purple">{t('bills.dualMode', 'Dual Mode')}</StatusBadge>
            )}
            {!removed && (() => {
              const offlineBadge = getOfflineChannelBadge(row);
              if (!offlineBadge) return null;
              return (
                <StatusBadge variant="warning">
                  {t(offlineBadge.labelKey, offlineBadge.label)}
                </StatusBadge>
              );
            })()}
            {!removed && !edited && newBillIds.has(row.id) && (
              <StatusBadge variant="warning">NEW</StatusBadge>
            )}
          </div>
        );
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
        const serial = getBillSerialDisplay(row);
        return (
          <ActionMenu
            row={row}
            canHardDelete={canHardDelete}
            onView={() => openBillInvoice(row)}
            onApprove={() => handleApprove(row)}
            onMarkPaid={() => handleMarkPaid(row)}
            onConfirmCashier={() => handleConfirmCashier(row)}
            onReset={() => isDel ? handleRestore(row) : handleResetPending(row)}
            onSoftDelete={() => setDeleteTarget({ id: row.id, type: 'soft', serial })}
            onHardDelete={() => { setHardConfirm(''); setHardDeleteTarget({ id: row.id, serial, row }); }}
          />
        );
      },
    },
  ], [loadingAction, handleApprove, handleMarkPaid, handleConfirmCashier, handleRestore, handleResetPending, storesMap, t, newBillIds, openBillInvoice, canHardDelete]);

  const mobileCard = useCallback((row) => {
    const removed = getBillRemovedBadge(row);
    const edited = getBillEditedBadge(row);
    const total = Number(row.grandTotal || row.totalAmount || row.total || 0);
    const paid = Number(row.paidAmount || 0);
    const out = total - paid;
    return (
      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        onClick={() => {
          dismissBill(row);
          openBillInvoice(row);
        }}
        className={getBillCardHighlightClass(row, { newBillIds })}
      >
        <div className="flex items-center justify-between gap-2 mb-1.5 flex-wrap">
          <span className="text-[11px] font-semibold text-gray-100 font-mono break-all leading-tight">
            {getBillSerialDisplay(row)}
          </span>
          <div className="flex items-center gap-1 shrink-0">
            {removed ? (
              <StatusBadge variant="destructive">{removed.label}</StatusBadge>
            ) : (
              <StatusBadge variant={paymentVariant(row)}>{paymentLabel(row)}</StatusBadge>
            )}
            {edited && <StatusBadge variant="purple">{edited.label}</StatusBadge>}
          </div>
        </div>
        <p className="text-[11px] text-gray-300 truncate mb-1">
          {row.customer?.name || row.customerName || 'Walk-in'}
        </p>
        <div className="flex items-center justify-between text-[10px]">
          <span className="text-gray-200 font-medium font-mono">{fmt(total)}</span>
          {out > 0 && !removed && (
            <span className="text-rose-400 font-medium">Due {fmt(out)}</span>
          )}
        </div>
      </motion.div>
    );
  }, [newBillIds, dismissBill, openBillInvoice]);

  return (
    <div dir={isRTL ? 'rtl' : 'ltr'} className={cn(
      managerMode ? 'p-0 max-w-none space-y-3' : 'p-2 sm:p-3 lg:p-4 max-w-[1600px] mx-auto space-y-3',
    )}>

      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 className="text-base sm:text-lg font-bold text-gray-100 flex items-center gap-2">
            <ShoppingBag className="w-4 h-4 text-amber-500" />
            {t('admin.pages.bills.title', 'Bills Control')}
            {liveAt && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/25">
                Updated {new Date(liveAt).toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
            {loading && <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />}
          </h1>
          <p className="text-[10px] text-slate-500 mt-0.5">
            {filterStats.shown.toLocaleString()} / {loadedBillCount.toLocaleString()} {t('manager.bills', 'bills')} • Rs {filterStats.shownValue.toLocaleString()}
          </p>
        </div>
        <Button
          variant="primary"
          leftIcon={<Download className="w-4 h-4" />}
          onClick={handleExport}
          disabled={!filtered.length}
        >
          {t('admin.billsPage.exportCsv', 'Export CSV')}
        </Button>
        <select
          value={cloudStatusFilter}
          onChange={(e) => setCloudStatusFilter(e.target.value)}
          className="rounded-lg border border-[#2a1f0d] bg-[#0f0a05] text-gray-200 text-xs px-2 py-1.5"
        >
          <option value="all">All</option>
          <option value="pending_payment">Pending</option>
          <option value="paid">Paid</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <Button variant="ghost" onClick={() => loadBills(null)} disabled={loading}>
          <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
        </Button>
        {hasMoreBills && billsCursor && (
          <Button variant="secondary" size="sm" onClick={() => loadBills(billsCursor)} disabled={loading}>
            Load More (50)
          </Button>
        )}
      </div>

      <DatePresetBar
        datePreset={filters.datePreset || 'today'}
        onPresetChange={(preset) => setFilters((f) => ({ ...f, datePreset: preset, dateFrom: preset === 'custom' ? f.dateFrom : '', dateTo: preset === 'custom' ? f.dateTo : '' }))}
        customFrom={filters.dateFrom || ''}
        customTo={filters.dateTo || ''}
        onCustomFromChange={(v) => setFilters((f) => ({ ...f, datePreset: 'custom', dateFrom: v }))}
        onCustomToChange={(v) => setFilters((f) => ({ ...f, datePreset: 'custom', dateTo: v }))}
        isDark={isDark}
      />

      {/* ── Stats ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-2">
        <StatCard label={t('admin.billsPage.totalBills', 'Total Bills')} value={filterStats.total} icon={ShoppingBag} color="amber" />
        <StatCard label={t('bills.pendingCashier', 'Pending Cashier')} value={filterStats.pendingCashier} icon={Clock} color="red" />
        <StatCard label={t('bills.pendingMgrCashier', 'Cashier Paid · Mgr Pending')} value={filterStats.pendingMgrCashier} icon={CheckCircle2} color="blue" />
        <StatCard label={t('bills.dualMode', 'Dual Mode')} value={filterStats.dualMode} icon={Zap} color="purple" />
        <StatCard label={t('bills.cashierOfflinePay', 'Cashier Offline Pay')} value={filterStats.offline} icon={WifiOff} color="amber" />
        <StatCard label={t('bills.paid', 'Confirmed')} value={filterStats.paid} icon={CheckCircle2} color="green" />
        <StatCard label={t('admin.billsPage.totalValue', 'Shown Value')} value={filterStats.shownValue} icon={DollarSign} color="blue" />
      </div>

      <BillsAdvancedToolbar
        filters={filters}
        onChange={setFilters}
        onReset={handleResetFilters}
        bills={bills}
        shownCount={filtered.length}
        totalCount={bills.length}
        shownValue={filterStats.shownValue}
        isLoading={loading}
        liveAt={liveAt}
        showLive
        showShowAll
        hideDatePreset
        t={t}
      />

      {newBillCount > 0 && (
        <div className="bill-alert-banner">
          <div className="flex items-center gap-2 min-w-0">
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
            <p className="text-xs text-red-100 font-semibold truncate">
              {newBillCount} fraud alert{newBillCount > 1 ? 's' : ''}
              {fraudSummary ? ` — ${fraudSummary}` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={dismissAll}
            className="shrink-0 text-[10px] font-bold px-2.5 py-1 rounded-lg border border-amber-500/40 text-amber-300 hover:bg-amber-500/10"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* ── Data Table ─────────────────────────────────────────── */}
      <div className="w-full overflow-hidden">
        <DataTable
          columns={columns}
          data={filtered}
          loading={loading}
          emptyMessage={t('admin.billsPage.noBills', 'No bills found')}
          emptySubtext={t('admin.usersPage.noFilterMatch', 'Try adjusting filters')}
          rowKey="id"
          defaultSortField="billSerial"
          defaultSortDir="desc"
          onRowClick={(row) => {
            dismissBill(row);
            openBillInvoice(row);
          }}
          getRowClassName={getRowClassName}
          mobileCardRenderer={mobileCard}
          pageSize={25}
          pageSizeOptions={BILLS_PAGE_SIZE_OPTIONS}
          paginationResetKey={`${filters.quick}|${filters.paymentStatus}|${filters.branchId}|${filters.search}`}
          enableVirtualization={false}
          maxHeight="600px"
          billsTableMode={true}
          striped={false}
          hoverable={false}
          rowEstimateSize={72}
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
                  Archive Bill
                </h3>
              </div>
              <p className="text-xs text-slate-400 mb-4">
                Bill <strong className="text-gray-200">#{deleteTarget.serial}</strong> archive hogi — permanent delete nahi. Restore: Admin → Backup → Archive tab.
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
                  onClick={executeSoftDelete}
                  className="flex-1 rounded-xl bg-rose-500 hover:bg-rose-600 py-2.5 text-xs font-semibold text-white disabled:opacity-40"
                >
                  {submittingDelete ? 'Processing...' : 'Archive Bill'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Permanent Delete Modal ─────────────────────────────── */}
      <AnimatePresence>
        {hardDeleteTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-md rounded-2xl border border-rose-500/40 bg-gradient-to-b from-[#1a1208] to-[#0f0a05] p-5 shadow-2xl"
            >
              <div className="flex items-center gap-2 pb-3 border-b border-rose-500/20 mb-4">
                <AlertTriangle className="w-5 h-5 text-rose-500" />
                <h3 className="text-sm font-semibold text-rose-300">
                  {t('admin.billsPage.hardDeleteTitle', 'Permanent Delete')}
                </h3>
              </div>
              <p className="text-xs text-slate-400 mb-2">
                {t('admin.billsPage.hardDeleteDesc1', 'Bill')}{' '}
                <strong className="text-gray-200">#{hardDeleteTarget.serial}</strong>{' '}
                {t('admin.billsPage.hardDeleteDesc2', 'hamesha ke liye delete ho jayega — restore nahi ho sakta.')}
              </p>
              <p className="text-[11px] text-rose-400/90 mb-3">
                {t('admin.billsPage.hardDeleteWarn', 'Ye action wapas nahi ho sakta. Confirm karne ke liye niche likho:')}{' '}
                <span className="font-mono font-bold">{PERMANENT_DELETE_PHRASE}</span>
              </p>
              <input
                value={hardConfirm}
                onChange={(e) => setHardConfirm(e.target.value)}
                placeholder={PERMANENT_DELETE_PHRASE}
                className="w-full rounded-xl border border-rose-500/30 bg-[#0f0a05] p-3 text-xs text-gray-200 placeholder-slate-600 uppercase outline-none focus:border-rose-500/60 mb-4"
              />
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  className="flex-1"
                  disabled={submittingHardDelete}
                  onClick={() => { setHardDeleteTarget(null); setHardConfirm(''); }}
                >
                  {t('common.cancel', 'Cancel')}
                </Button>
                <button
                  disabled={String(hardConfirm).trim().toUpperCase() !== PERMANENT_DELETE_PHRASE || submittingHardDelete}
                  onClick={executeHardDelete}
                  className="flex-1 rounded-xl bg-rose-600 hover:bg-rose-700 py-2.5 text-xs font-semibold text-white disabled:opacity-40"
                >
                  {submittingHardDelete
                    ? t('admin.billsPage.processing', 'Processing...')
                    : t('admin.billsPage.eraseForever', 'Erase Forever')}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Bill invoice — same UI as Biller ─────────────────── */}
      {selectedBill && (
        <InvoicePrint
          key={`adm-inv-${invoiceSeq}-${selectedBill.billSerial || selectedBill.serialNo || selectedBill.id}`}
          {...buildInvoicePrintProps({
            order: selectedBill,
            store: invoiceStore,
            onClose: () => setSelectedBill(null),
            settings,
            extra: { isReprint: true },
          })}
        />
      )}
    </div>
  );
};

export default BillsControl;