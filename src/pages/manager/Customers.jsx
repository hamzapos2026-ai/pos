// File: src/pages/manager/Customers.jsx
// Purpose: Customer management — Firebase live sync + offline + walk-in fix

import React, {
  useState, useEffect, useCallback, useRef, useMemo, startTransition,
} from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users, Plus, Edit3, X, Loader2, History,
  Wifi, WifiOff, RefreshCw, ShoppingBag,
  AlertTriangle, MapPin,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import {
  searchCustomers,
  browseCustomers,
  loadCustomerOrders,
  loadOrdersForCustomerMetrics,
  saveCustomer,
  CUSTOMER_SEARCH_PAGE_SIZE,
} from '../../services/customerAdminService';
import CustomerGlassFilterPanel from '../../components/shared/CustomerGlassFilterPanel';
import CustomerPersonaDetailPanel from '../../components/shared/CustomerPersonaDetailPanel';
import {
  customersTableShell, customersTableHead, customersTableRow, customersTh, customersTd,
  glassActionBtn,
} from '../../components/shared/customerTableTheme';
import PaginationBar from '../../components/ui/PaginationBar';
import { glassBtnGhost, glassBtnPrimary, glassIcon } from '../../components/shared/glassUiTheme';
import { formatPKR, getInitials, truncate } from '../../utils/managerHelpers';
import ExportMenu from '../../components/manager/ExportMenu';
import { useLanguage } from '../../hooks/useLanguage';
import { useAuth } from '../../context/AuthContext';
import {
  resolveUserBranchIds,
  resolveUserPrimaryBranch,
  isElevatedRole,
} from '../../utils/branchAccess';
import { mapCustomerRowPersona, applyCustomerFilters, countCustomerFilters } from '../../utils/customerFilterUtils';
import { getCustomerDisplayName } from '../../utils/customerHelpers';
import { cn } from '../../utils/cn';
import useStoresMap, { resolveStoreName, resolveEffectiveStoreId } from '../../hooks/useStoresMap';

// ═══════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════
const normalizePhone = (p) => (p || '').replace(/[\s\-\(\)]/g, '').trim();

const getTimestamp = (v) => {
  if (!v) return 0;
  try {
    const d = v?.toDate ? v.toDate() : new Date(v);
    return isNaN(d.getTime()) ? 0 : d.getTime();
  } catch { return 0; }
};

const fmtDate = (v) => {
  if (!v) return '—';
  try {
    const d = v?.toDate ? v.toDate() : new Date(v);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('en-PK', {
      day: '2-digit', month: 'short', year: 'numeric',
    });
  } catch { return '—'; }
};

// ── Detect walk-in from ORDER data ─────────────────────────
// Walk-in orders have customer.phone = "" (empty)
// The customer doc may have a real phone — we check order-level
const isWalkinFromOrder = (order) => {
  const orderPhone = (
    order.customer?.phone ?? order.customerPhone ?? ''
  ).toString().trim();

  const orderName = (
    order.customer?.name || order.customerName || ''
  ).toLowerCase().trim();

  // Walk-in = empty phone in order OR name contains walk-in
  return (
    orderPhone === '' ||
    orderName === 'walk-in' ||
    orderName === 'walk-in customer' ||
    orderName.includes('walk-in') ||
    orderName === 'walkin' ||
    orderName === 'walking'
  );
};

// ── Check if a CUSTOMER DOC is the walk-in profile ─────────
const isWalkinCustomer = (c) => {
  const name = (c.name || '').toLowerCase().trim();
  return (
    c.isWalking === true ||
    name === 'walk-in' ||
    name === 'walk-in customer' ||
    name.includes('walk-in') ||
    name === 'walkin' ||
    name === 'walking'
  );
};

// ── Extract customer info from order for matching ───────────
const getOrderMatchInfo = (order) => ({
  custId: (
    order.customerId ||
    order.customer?.id ||
    order.customer?.customerId || ''
  ).trim(),
  phone: normalizePhone(
    order.customer?.phone ||
    order.customerPhone ||
    order.customer?.phoneNormalized || ''
  ),
  name: (order.customer?.name || order.customerName || '').toLowerCase().trim(),
});

const DEFAULT_PAGE_SIZE = 20;

const SORT_OPTIONS = [
  { key: 'totalSpent', label: 'Total Spent', dir: 'desc' },
  { key: 'purchaseCount', label: 'Total Bills', dir: 'desc' },
  { key: 'name', label: 'Name A→Z', dir: 'asc' },
  { key: 'name', label: 'Name Z→A', dir: 'desc' },
  { key: 'lastOrderDate', label: 'Last Visit', dir: 'desc' },
];

// ═══════════════════════════════════════════════════════════
// ONLINE STATUS HOOK
// ═══════════════════════════════════════════════════════════
const useOnlineStatus = () => {
  const { t } = useLanguage();
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  useEffect(() => {
    const on  = () => { setIsOnline(true);  toast.success(t('manager.common.backOnline', 'Back online — syncing…'), { icon: '🟢' }); };
    const off = () => { setIsOnline(false); toast(t('manager.common.offlineCached', 'Offline — cached data shown'), { icon: '🔴' }); };
    window.addEventListener('online',  on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online',  on);
      window.removeEventListener('offline', off);
    };
  }, [t]);
  return isOnline;
};

// ═══════════════════════════════════════════════════════════
// SYNC STATUS BAR
// ═══════════════════════════════════════════════════════════
const SyncBar = ({ isOnline, dataSource, syncing, lastSync, t }) => (
  <div className={`
    flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-medium border
    ${isOnline
      ? dataSource === 'live'
        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
        : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
      : 'bg-red-500/10 text-red-400 border-red-500/20'}
  `}>
    {isOnline
      ? syncing
        ? <Loader2 className="w-2.5 h-2.5 animate-spin" />
        : <Wifi className="w-2.5 h-2.5" />
      : <WifiOff className="w-2.5 h-2.5" />}
    <span>
      {!isOnline ? t('manager.common.offline', 'Offline')
        : syncing ? t('manager.common.syncing', 'Syncing…')
        : dataSource === 'live' ? t('manager.common.live', 'Live')
        : t('manager.common.cached', 'Cached')}
    </span>
    {lastSync && (
      <span className="opacity-50 ml-1">
        {lastSync.toLocaleTimeString()}
      </span>
    )}
  </div>
);

// ═══════════════════════════════════════════════════════════
// CUSTOMER FORM MODAL
// ═══════════════════════════════════════════════════════════
const CustomerForm = ({ isOpen, onClose, customer, isOnline, storeId }) => {
  const { t } = useLanguage();
  const emptyForm = {
    name: '', phone: '', email: '',
    city: '', address: '', creditLimit: 0,
  };
  const [form, setForm]     = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setForm(customer
        ? { ...emptyForm, ...customer }
        : emptyForm
      );
    }
  }, [customer, isOpen]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async () => {
    if (!form.name?.trim()) { toast.error(t('manager.common.nameRequired', 'Name is required')); return; }
    setSaving(true);
    try {
      if (!storeId) {
        toast.error(t('manager.customersPage.branchRequired', 'Branch assignment required'));
        return;
      }
      const payload = {
        name:        form.name.trim(),
        phone:       form.phone.trim(),
        email:       form.email.trim(),
        city:        form.city.trim(),
        address:     form.address.trim(),
        creditLimit: Number(form.creditLimit) || 0,
      };

      await saveCustomer({
        customer,
        form: payload,
        storeId,
        scope: { storeId, userId: '' },
      });
      toast.success(
        customer
          ? t('manager.customersPage.customerUpdated', 'Customer updated')
          : t('manager.customersPage.customerAdded', 'Customer added'),
      );
      onClose();
    } catch (err) {
      console.error(err);
      toast.error(err.message || t('manager.common.failedToSave', 'Failed to save'));
    } finally {
      setSaving(false);
    }
  };

  const fields = [
    { key: 'name',    label: t('manager.customersPage.nameLabel', 'Name *'),  placeholder: t('manager.customersPage.fullNamePh', 'Full name') },
    { key: 'phone',   label: t('manager.common.phone', 'Phone'),   placeholder: t('manager.customersPage.phonePh', '03XX-XXXXXXX') },
    { key: 'email',   label: t('manager.common.email', 'Email'),   placeholder: t('manager.customersPage.emailPh', 'email@example.com') },
    { key: 'city',    label: t('manager.common.city', 'City'),    placeholder: t('manager.customersPage.cityPh', 'Karachi') },
    { key: 'address', label: t('manager.common.address', 'Address'), placeholder: t('manager.customersPage.addressPh', 'Street, area…') },
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
          <motion.div
            initial={{ scale: 0.95, y: 16 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.95, y: 16 }}
            className="w-full max-w-md rounded-2xl border border-[#2a1f0d] bg-[#12100a] shadow-2xl"
          >
            <div className="flex justify-between items-center p-4 border-b border-[#2a1f0d]">
              <h3 className="text-base font-bold text-gray-100">
                {customer ? t('manager.customersPage.editCustomer', 'Edit Customer') : t('manager.customersPage.addCustomer', 'Add Customer')}
              </h3>
              <button onClick={onClose}
                className="p-2 rounded-lg hover:bg-[#2a1f0d] text-gray-400">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 space-y-3">
              {fields.map((f) => (
                <div key={f.key}>
                  <label className="text-xs text-gray-400 mb-1 block">{f.label}</label>
                  <input
                    value={form[f.key] || ''}
                    onChange={set(f.key)}
                    placeholder={f.placeholder}
                    className="w-full rounded-xl border border-[#2a1f0d] bg-[#0a0805] px-3 py-2 text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                  />
                </div>
              ))}
              <div>
                <label className="text-xs text-gray-400 mb-1 block">{t('manager.common.creditLimit', 'Credit Limit')}</label>
                <input
                  type="number"
                  value={form.creditLimit || 0}
                  onChange={(e) => setForm((f) => ({ ...f, creditLimit: Number(e.target.value) }))}
                  className="w-full rounded-xl border border-[#2a1f0d] bg-[#0a0805] px-3 py-2 text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                />
              </div>
              {!isOnline && (
                <div className="flex items-center gap-2 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-400">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  {t('manager.customersPage.syncWhenOnline', 'Changes will sync when back online')}
                </div>
              )}
            </div>

            <div className="p-3 border-t border-[#2a1f0d] flex gap-2">
              <button onClick={onClose} disabled={saving}
                className="flex-1 rounded-xl border border-[#2a1f0d] bg-[#1a1208] py-2.5 text-sm text-gray-400">
                {t('manager.common.cancel', 'Cancel')}
              </button>
              <button onClick={handleSubmit} disabled={saving}
                className="flex-1 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 py-2.5 text-sm font-semibold text-[#1a1208] disabled:opacity-50 flex items-center justify-center gap-2">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                {customer ? t('manager.common.update', 'Update') : t('manager.customersPage.addCustomer', 'Add Customer')}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

// ═══════════════════════════════════════════════════════════
// HISTORY MODAL
// ═══════════════════════════════════════════════════════════
const HistoryModal = ({ customer, onClose, branchIds = [] }) => {
  const { t } = useLanguage();
  const [orders, setOrders] = useState([]);
  const [loadingOrders, setLoadingOrders] = useState(false);

  useEffect(() => {
    if (!customer) {
      setOrders([]);
      return;
    }
    let cancelled = false;
    setLoadingOrders(true);
    (async () => {
      if (customer.isWalkin || customer.id === 'virtual-walkin') {
        if (!cancelled) {
          setOrders([]);
          setLoadingOrders(false);
        }
        return;
      }
      const rows = await loadCustomerOrders({
        customerId: customer.id,
        storeIds: branchIds,
        storeId: branchIds[0] || customer.storeId,
        branchId: branchIds[0] || customer.storeId,
      });
      if (!cancelled) {
        setOrders(rows);
        setLoadingOrders(false);
      }
    })();
    return () => { cancelled = true; };
  }, [customer, branchIds]);

  const stats = useMemo(() => {
    let totalSpent = 0, totalPaid = 0, totalDue = 0;
    orders.forEach((o) => {
      const total = Number(o.grandTotal || o.totalAmount || o.total || 0);
      const paid  = Number(o.paidAmount ?? total);
      totalSpent += total;
      totalPaid  += paid;
      totalDue   += Math.max(0, total - paid);
    });
    return { billCount: orders.length, totalSpent, totalPaid, totalDue };
  }, [orders]);

  if (!customer) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      >
        <motion.div
          initial={{ scale: 0.95 }} animate={{ scale: 1 }}
          className="w-full max-w-2xl max-h-[88vh] overflow-hidden rounded-2xl border border-[#2a1f0d] bg-[#12100a] flex flex-col"
        >
          {/* Header */}
          <div className="flex justify-between items-center p-4 border-b border-[#2a1f0d] shrink-0">
            <div className="flex items-center gap-3">
              <div className={`h-10 w-10 rounded-xl flex items-center justify-center font-bold text-sm
                ${isWalkinCustomer(customer)
                  ? 'bg-blue-500/15 text-blue-400'
                  : 'bg-amber-500/15 text-amber-400'}`}>
                {isWalkinCustomer(customer) ? 'W' : getInitials(customer.name)}
              </div>
              <div>
                <h3 className="text-base font-bold text-gray-100">{customer.name}</h3>
                <p className="text-[10px] text-gray-500">
                  {customer.phone || t('manager.common.noPhone', 'No phone')} • {customer.city || t('manager.common.noCity', 'No city')}
                </p>
              </div>
            </div>
            <button onClick={onClose}
              className="p-2 rounded-lg hover:bg-[#2a1f0d] text-gray-400">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-4 gap-2 p-4 border-b border-[#2a1f0d] shrink-0">
            {[
              { label: t('manager.common.bills', 'bills'), value: stats.billCount,             cls: 'bg-[#1a1208] border-[#2a1f0d]',       text: 'text-gray-100'  },
              { label: t('manager.common.spent', 'Spent'), value: formatPKR(stats.totalSpent), cls: 'bg-[#1a1208] border-[#2a1f0d]',       text: 'text-gray-100'  },
              { label: t('manager.common.paid', 'Paid'),  value: formatPKR(stats.totalPaid),  cls: 'bg-green-500/5 border-green-500/20',  text: 'text-green-400' },
              { label: t('manager.common.due', 'Due'),   value: formatPKR(stats.totalDue),   cls: 'bg-red-500/5 border-red-500/20',      text: 'text-red-400'   },
            ].map((s) => (
              <div key={s.label} className={`rounded-lg p-2.5 border ${s.cls}`}>
                <p className="text-[9px] text-gray-500 uppercase mb-1">{s.label}</p>
                <p className={`text-sm font-bold ${s.text}`}>{s.value}</p>
              </div>
            ))}
          </div>

          {!customer.isWalkin && !isWalkinCustomer(customer) && (
            <div className="px-4 pb-2 border-b border-[#2a1f0d] shrink-0 overflow-y-auto max-h-[38vh]">
              <CustomerPersonaDetailPanel
                customer={customer}
                isDark
                fmt={formatPKR}
                fmtDate={fmtDate}
              />
            </div>
          )}

          {/* Orders list */}
          <div className="flex-1 overflow-y-auto p-4">
            <p className="text-xs font-semibold text-gray-400 mb-2">
              {t('manager.customersPage.billHistory', 'Bill History ({{count}})', { count: orders.length })}
            </p>

            {orders.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12">
                <ShoppingBag className="w-10 h-10 text-gray-700 mb-2" />
                <p className="text-sm text-gray-600">{t('manager.customersPage.noBillsFound', 'No bills found')}</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {orders.map((o) => {
                  const total = Number(o.grandTotal || o.totalAmount || o.total || 0);
                  const paid  = Number(o.paidAmount ?? total);
                  const due   = Math.max(0, total - paid);
                  return (
                    <div key={o.id}
                      className="flex justify-between items-start p-2.5 rounded-lg bg-[#1a1208] border border-[#2a1f0d]">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-gray-200 font-medium">
                          {o.serialNo || o.billSerial || o.id?.slice(-8)}
                        </p>
                        <p className="text-[10px] text-gray-500">
                          {fmtDate(o.createdAt || o.savedAt)}
                        </p>
                        {(o.items || []).length > 0 && (
                          <p className="text-[9px] text-gray-600 mt-0.5 truncate max-w-[220px]">
                            {o.items.slice(0, 2).map(
                              (it) => it.productName || it.name || 'Item'
                            ).join(', ')}
                            {o.items.length > 2 && ` ${t('manager.common.moreItems', '+{{count}} more', { count: o.items.length - 2 })}`}
                          </p>
                        )}
                      </div>
                      <div className="text-right ml-4 shrink-0">
                        <p className="text-sm font-semibold text-gray-100">
                          {formatPKR(total)}
                        </p>
                        {due > 0 && (
                          <p className="text-[10px] text-red-400">
                            {t('manager.customersPage.dueLabel', 'Due {{amount}}', { amount: formatPKR(due) })}
                          </p>
                        )}
                        {o.paymentStatus && (
                          <p className={`text-[9px] mt-0.5 ${
                            o.paymentStatus === 'paid'
                              ? 'text-green-500'
                              : 'text-amber-500'
                          }`}>
                            {o.paymentStatus}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="p-3 text-center text-[10px] text-gray-600 border-t border-[#2a1f0d] shrink-0">
            {t('manager.customersPage.billsLoaded', '{{count}} bills loaded from memory', { count: orders.length })}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

// ═══════════════════════════════════════════════════════════
// MAIN CUSTOMERS PAGE
// ═══════════════════════════════════════════════════════════
const Customers = () => {
  const { t } = useLanguage();
  const { userData } = useAuth();
  const isOnline = useOnlineStatus();
  const branchIds = useMemo(() => {
    if (isElevatedRole(userData)) return [];
    return resolveUserBranchIds(userData);
  }, [userData]);
  const primaryStoreId = useMemo(
    () => resolveUserPrimaryBranch(userData),
    [userData],
  );
  const { storesMap } = useStoresMap();
  const branchRestricted = !isElevatedRole(userData);
  const hasBranchAccess = !branchRestricted || branchIds.length > 0;

  // ── Data ────────────────────────────────────────────────
  const [rawCustomers, setRawCustomers] = useState([]);
  const [orderSnapshot, setOrderSnapshot] = useState([]);
  const [customers,    setCustomers]    = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [syncing,      setSyncing]      = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchLastDoc, setSearchLastDoc] = useState(null);
  const [searchHasMore, setSearchHasMore] = useState(false);
  const [dataSource,   setDataSource]   = useState('idle');
  const [lastSync,     setLastSync]     = useState(null);

  // ── Filters ─────────────────────────────────────────────
  const [search,      setSearch]      = useState('');
  const [typeFilter,  setTypeFilter]  = useState('all');
  const [visitFilter, setVisitFilter] = useState('all');
  const [personaFilter, setPersonaFilter] = useState('all');
  const [cityFilter,  setCityFilter]  = useState('');
  const [sortKey,     setSortKey]     = useState('totalSpent');
  const [sortDir,     setSortDir]     = useState('desc');
  const [page,        setPage]        = useState(1);
  const [pageSize,    setPageSize]    = useState(DEFAULT_PAGE_SIZE);

  // ── UI ───────────────────────────────────────────────────
  const [formOpen,   setFormOpen]   = useState(false);
  const [editing,    setEditing]    = useState(null);
  const [historyFor, setHistoryFor] = useState(null);

  // ── Refs ─────────────────────────────────────────────────
  const searchTimerRef = useRef(null);

  // ═══════════════════════════════════════════════════════
  // BUILD METRICS — attach order stats to each customer
  // ═══════════════════════════════════════════════════════
  const buildMetrics = useCallback((custDocs, orders, sm = {}) => {
    const resolveSid = (c) =>
      resolveEffectiveStoreId(c?.storeId || c?.branchId, sm) || c?.storeId || c?.branchId || 'default';
    const branchLabel = (sid) => resolveStoreName(sid, sm, sid);

    // ── Index orders ──────────────────────────────────────
    const byId    = new Map(); // custId   → metrics
    const byPhone = new Map(); // phone    → metrics
    let walkinM   = { count: 0, spent: 0, lastDate: null, lastOrder: null };

    const bump = (map, key, order, total, date) => {
      if (!map.has(key)) {
        map.set(key, { count: 0, spent: 0, lastDate: null, firstDate: null, lastOrder: null });
      }
      const m = map.get(key);
      m.count++;
      m.spent += total;
      const ts = getTimestamp(date);
      if (!m.firstDate || ts < getTimestamp(m.firstDate)) m.firstDate = date;
      if (ts > getTimestamp(m.lastDate)) {
        m.lastDate  = date;
        m.lastOrder = order;
      }
    };

    orders.forEach((order) => {
      if (order.isDeleted || order.deleted) return;
      const total = Number(order.grandTotal || order.totalAmount || order.total || 0);
      const date  = order.createdAt || order.savedAt || null;
      const info  = getOrderMatchInfo(order);
      const walkin = isWalkinFromOrder(order);

      if (walkin) {
        walkinM.count++;
        walkinM.spent += total;
        if (getTimestamp(date) > getTimestamp(walkinM.lastDate)) {
          walkinM.lastDate  = date;
          walkinM.lastOrder = order;
        }
        return;
      }

      if (info.custId) bump(byId,    info.custId, order, total, date);
      if (info.phone.length >= 7) bump(byPhone, info.phone, order, total, date);
    });

    // ── Map metrics to customer docs and collapse multiple walk-in profiles
    const mapped = [];
    let hasWalkinDoc = false;

    custDocs.forEach((c) => {
      const isWalkin = isWalkinCustomer(c);
      if (isWalkin) { hasWalkinDoc = true; return; }

      const phone = normalizePhone(c.phone);
      const sid = resolveSid(c);
      const m = byId.get(c.id) || (phone.length >= 7 ? byPhone.get(phone) : null)
        || { count: 0, spent: 0, lastDate: null, firstDate: null, lastOrder: null };

      mapped.push(mapCustomerRowPersona({
        ...c,
        storeId: sid,
        branchName: branchLabel(sid),
        isWalkin: false,
        lastOrder: m.lastOrder
          ? {
              serialNo: m.lastOrder.serialNo || m.lastOrder.billSerial || m.lastOrder.id?.slice(-8),
              total: Number(m.lastOrder.grandTotal || m.lastOrder.totalAmount || 0),
            }
          : null,
      }, m));
    });

    // If any walk-in customer docs exist OR we saw walk-in orders, expose a single virtual Walk-in row
    if (hasWalkinDoc || walkinM.count > 0) {
      const v = mapCustomerRowPersona({
        id: 'virtual-walkin',
        name: t('manager.common.walkInCustomer', 'Walk-in Customer'),
        isWalkin: true,
        phone: '—',
        city: '',
        storeId: primaryStoreId || resolveSid(custDocs[0]) || 'default',
        branchName: branchLabel(primaryStoreId || resolveSid(custDocs[0])),
        purchaseCount: walkinM.count,
        totalSpent: walkinM.spent,
        lastOrderDate: walkinM.lastDate,
        lastOrder: walkinM.lastOrder
          ? {
              serialNo: walkinM.lastOrder.serialNo || walkinM.lastOrder.billSerial || walkinM.lastOrder.id?.slice(-8),
              total: Number(walkinM.lastOrder.grandTotal || walkinM.lastOrder.totalAmount || 0),
            }
          : null,
      }, walkinM);
      return [v, ...mapped];
    }

    return mapped;
  }, [t, primaryStoreId]);

  const runCustomerSearch = useCallback(async (term, cursor = null) => {
    const q = String(term || '').trim();
    setSearchLoading(true);
    setSyncing(true);
    try {
      const scopeId = branchIds[0] || primaryStoreId || null;
      const useSearch = q.length >= 3;
      const { customers: rows, lastDoc, hasMore } = useSearch
        ? await searchCustomers({
          term: q,
          storeIds: branchIds.length ? branchIds : null,
          storeId: scopeId,
          branchId: scopeId,
          cursor,
          pageSize: CUSTOMER_SEARCH_PAGE_SIZE,
        })
        : await browseCustomers({
          storeIds: branchIds.length ? branchIds : null,
          storeId: scopeId,
          branchId: scopeId,
          cursor,
        });
      setRawCustomers((prev) => (cursor ? [...prev, ...rows] : rows));
      setSearchLastDoc(lastDoc);
      setSearchHasMore(hasMore);
      setDataSource('server');
      setLastSync(new Date());
    } catch (err) {
      console.error('[Customers] search:', err);
      toast.error(t('manager.customersPage.syncError', 'Customer search failed'));
    } finally {
      setSearchLoading(false);
      setSyncing(false);
      setLoading(false);
    }
  }, [branchIds, primaryStoreId, t]);

  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      void runCustomerSearch(search, null);
    }, 300);
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [search, branchIds, primaryStoreId, runCustomerSearch]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const scopeId = branchIds[0] || primaryStoreId || null;
      const orders = await loadOrdersForCustomerMetrics({
        storeId: scopeId,
        storeIds: branchIds.length ? branchIds : null,
      });
      if (!cancelled) setOrderSnapshot(orders);
    })();
    return () => { cancelled = true; };
  }, [branchIds, primaryStoreId]);

  useEffect(() => {
    setCustomers(buildMetrics(rawCustomers, orderSnapshot, storesMap));
  }, [rawCustomers, orderSnapshot, buildMetrics, storesMap]);

  const forceRefresh = useCallback(async () => {
    const scopeId = branchIds[0] || primaryStoreId || null;
    const orders = await loadOrdersForCustomerMetrics({
      storeId: scopeId,
      storeIds: branchIds.length ? branchIds : null,
    });
    setOrderSnapshot(orders);
    void runCustomerSearch(search, null);
    toast.success(t('manager.customersPage.refreshing', 'Refreshing…'));
  }, [runCustomerSearch, search, t, branchIds, primaryStoreId]);

  // ═══════════════════════════════════════════════════════
  // FILTER + PAGINATE
  // ═══════════════════════════════════════════════════════
  const getManagerCustomerType = useCallback((c) => {
    if (c.isWalkin) return 'walkin';
    const name = (c.name || '').trim();
    if (/^customer\s+\d+$/i.test(name) || c.isAutoNamed) return 'auto';
    return 'registered';
  }, []);

  const cities = useMemo(() => {
    const set = new Set();
    customers.forEach((c) => {
      const city = (c.city || '').trim();
      if (city) set.add(city);
    });
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [customers]);

  const filterCounts = useMemo(
    () => countCustomerFilters(customers, {}, { getCustomerType: getManagerCustomerType }),
    [customers, getManagerCustomerType],
  );

  const filtered = useMemo(() => {
    const list = applyCustomerFilters(customers, {
      typeFilter: typeFilter === 'regular' ? 'registered' : typeFilter,
      visitFilter,
      personaFilter,
      search,
      cityFilter,
      getCustomerType: getManagerCustomerType,
      normalizePhone,
    });

    const sorted = [...list].sort((a, b) => {
      if (a.isWalkin && !b.isWalkin) return -1;
      if (!a.isWalkin && b.isWalkin) return 1;
      let av = a[sortKey] ?? '';
      let bv = b[sortKey] ?? '';
      if (sortKey === 'lastOrderDate') {
        av = getTimestamp(av);
        bv = getTimestamp(bv);
      } else if (typeof av === 'string') {
        av = av.toLowerCase();
        bv = String(bv).toLowerCase();
      }
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return sorted;
  }, [customers, search, cityFilter, typeFilter, visitFilter, personaFilter, sortKey, sortDir, getManagerCustomerType]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginated  = useMemo(
    () => filtered.slice((page - 1) * pageSize, page * pageSize),
    [filtered, page, pageSize]
  );

  useEffect(() => {
    setPage(1);
  }, [search, cityFilter, typeFilter, visitFilter, personaFilter, sortKey, sortDir, pageSize]);

  // Summary counts
  const counts = useMemo(() => ({
    total:   customers.length,
    regular: customers.filter((c) => !c.isWalkin).length,
    walkin:  customers.filter((c) =>  c.isWalkin).length,
  }), [customers]);

  // ═══════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════
  return (
    <div className="space-y-4">

      {!hasBranchAccess && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          {t('manager.customersPage.noBranchAccess', 'No branch assigned — contact Super Admin to link your account to A One or J1.')}
        </div>
      )}

      {/* ── HEADER ──────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold text-gray-100 flex items-center gap-2">
            <Users className="w-5 h-5 text-amber-500" />
            {t('manager.customersPage.title', 'Customers')}
            <span className="text-xs font-normal text-gray-500">
              ({filtered.length})
            </span>
          </h2>
          {!loading && (
            <p className="text-[10px] text-gray-600 mt-0.5">
              {t('manager.customersPage.summary', '{{regular}} registered • {{walkin}} walk-in', {
                regular: counts.regular,
                walkin: counts.walkin,
              })}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <SyncBar
            isOnline={isOnline}
            dataSource={dataSource}
            syncing={syncing}
            lastSync={lastSync}
            t={t}
          />
          <button
            onClick={forceRefresh}
            disabled={syncing || loading}
            title={t('manager.common.refresh', 'Refresh')}
            className={glassBtnGhost}
          >
            <RefreshCw className={cn('w-3.5 h-3.5', glassIcon(), syncing && 'animate-spin')} />
          </button>
          <ExportMenu
            data={filtered.map((c) => ({
              Type:       c.isWalkin ? 'Walk-in' : 'Registered',
              Name:       c.name,
              Phone:      c.phone,
              Email:      c.email,
              City:       c.city,
              Bills:      c.purchaseCount,
              TotalSpent: c.totalSpent,
              LastOrder:  fmtDate(c.lastOrderDate),
            }))}
            filename="customers"
          />
          <button
            onClick={() => { setEditing(null); setFormOpen(true); }}
            className={glassBtnPrimary}
          >
            <Plus className={cn('w-3.5 h-3.5', glassIcon())} /> {t('manager.customersPage.addCustomer', 'Add Customer')}
          </button>
        </div>
      </div>

      {/* ── FILTERS — glass dropdowns ─────────────────── */}
      <CustomerGlassFilterPanel
        search={search}
        onSearchChange={(v) => startTransition(() => setSearch(v))}
        searchLoading={searchLoading}
        showBranch={false}
        cityFilter={cityFilter}
        cities={cities}
        onCityChange={(v) => startTransition(() => setCityFilter(v))}
        showCity={cities.length > 0}
        typeFilter={typeFilter === 'regular' ? 'registered' : typeFilter}
        onTypeFilterChange={(k) => startTransition(() => setTypeFilter(k === 'registered' ? 'regular' : k))}
        visitFilter={visitFilter}
        onVisitFilterChange={(v) => startTransition(() => setVisitFilter(v))}
        personaFilter={personaFilter}
        onPersonaFilterChange={(v) => startTransition(() => setPersonaFilter(v))}
        sortValue={`${sortKey}:${sortDir}`}
        onSortChange={(v) => {
          const [k, d] = v.split(':');
          startTransition(() => {
            setSortKey(k);
            setSortDir(d);
          });
        }}
        sortOptions={SORT_OPTIONS}
        counts={{
          ...filterCounts,
          type: {
            all: filterCounts.type?.all ?? counts.total,
            walkin: counts.walkin,
            registered: counts.regular,
            auto: filterCounts.type?.auto ?? 0,
          },
        }}
        hasActiveFilters={Boolean(
          search || cityFilter || typeFilter !== 'all'
          || visitFilter !== 'all' || personaFilter !== 'all',
        )}
        onClear={() => {
          startTransition(() => {
            setSearch('');
            setCityFilter('');
            setTypeFilter('all');
            setVisitFilter('all');
            setPersonaFilter('all');
            setSortKey('totalSpent');
            setSortDir('desc');
          });
        }}
        filteredCount={filtered.length}
        paginatedCount={paginated.length}
        searchHasMore={searchHasMore}
        onLoadMore={() => runCustomerSearch(search, searchLastDoc)}
        isOnline={isOnline}
      />

      {/* ── LOADING ─────────────────────────────────────── */}
      {loading || searchLoading ? (
        <div className="flex flex-col items-center justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-amber-500 mb-3" />
          <p className="text-sm text-gray-500">
            {searchLoading
              ? t('manager.customersPage.searching', 'Searching customers...')
              : t('manager.customersPage.loading', 'Loading customers…')}
          </p>
        </div>

      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16">
          <Users className="w-10 h-10 text-gray-700 mb-3" />
          <p className="text-sm text-gray-500">
            {search.trim().length > 0 && search.trim().length < 3
              ? t('manager.customersPage.minChars', 'No match in loaded list — type 3+ chars for full search')
              : search
                ? t('manager.customersPage.noMatch', 'No customers matching "{{query}}"', { query: search })
                : t('manager.customersPage.searchHint', 'Customers load automatically when online')}
          </p>
        </div>

      ) : (
        <>
          {/* ── DESKTOP TABLE ────────────────────────────── */}
          <div className={cn(customersTableShell(true), 'hidden md:block')}>
            <div className="overflow-x-auto max-h-[65vh] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className={cn('sticky top-0 z-10 backdrop-blur-xl', customersTableHead(true))}>
                  <tr>
                    <th className={customersTh(true)}>{t('manager.common.customer', 'Customer')}</th>
                    <th className={cn(customersTh(true), 'hidden md:table-cell')}>{t('manager.common.branch', 'Branch')}</th>
                    <th className={customersTh(true)}>{t('manager.common.phone', 'Phone')}</th>
                    <th className={cn(customersTh(true), 'hidden lg:table-cell')}>{t('manager.common.email', 'Email')}</th>
                    <th className={cn(customersTh(true), 'text-center')}>{t('manager.common.visits', 'Visits')}</th>
                    <th className={cn(customersTh(true), 'text-end')}>{t('manager.common.lastBill', 'Last Bill')}</th>
                    <th className={cn(customersTh(true), 'text-center')}>{t('manager.common.bills', 'Bills')}</th>
                    <th className={cn(customersTh(true), 'text-end')}>{t('manager.common.totalSpent', 'Total Spent')}</th>
                    <th className={cn(customersTh(true), 'text-end hidden xl:table-cell')}>{t('manager.common.firstVisit', 'First Visit')}</th>
                    <th className={cn(customersTh(true), 'text-end')}>{t('manager.common.lastVisit', 'Last Visit')}</th>
                    <th className={cn(customersTh(true), 'text-end')}>{t('manager.common.actions', 'Actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {paginated.map((c) => (
                    <tr
                      key={c.id}
                      className={customersTableRow(true, { walkin: c.isWalkin })}
                    >
                      {/* Customer */}
                      <td className={customersTd(true)}>
                        <div className="flex items-center gap-2.5">
                          <div className={`h-8 w-8 rounded-lg flex items-center justify-center text-xs font-bold shrink-0
                            ${c.isWalkin
                              ? 'bg-blue-500/15 text-blue-400'
                              : 'bg-amber-500/15 text-amber-400'}`}>
                            {c.isWalkin ? 'W' : getInitials(c.name)}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <p className="text-sm font-medium text-gray-100 truncate">
                                {truncate(getCustomerDisplayName(c), 20)}
                              </p>
                              {c.isWalkin && (
                                <span className="text-[8px] px-1 py-0.5 rounded bg-blue-500/15 text-blue-400 font-medium shrink-0">
                                  {t('manager.common.walkInBadge', 'WALK-IN')}
                                </span>
                              )}
                              {c.vipStatus && (
                                <span className="text-[8px] px-1 py-0.5 rounded bg-amber-500/15 text-amber-400 font-bold shrink-0">VIP</span>
                              )}
                              {c.isRepeatCustomer && !c.isWalkin && (
                                <span className="text-[8px] px-1 py-0.5 rounded bg-sky-500/15 text-sky-400 font-bold shrink-0">REPEAT</span>
                              )}
                              {c.hasCredit && (
                                <span className="text-[8px] px-1 py-0.5 rounded bg-orange-500/15 text-orange-400 font-bold shrink-0">CREDIT</span>
                              )}
                            </div>
                            <p className="text-[10px] text-gray-500">{c.city || '—'}</p>
                          </div>
                        </div>
                      </td>

                      {/* Branch */}
                      <td className={cn(customersTd(true), 'hidden md:table-cell')}>
                        <span className="text-xs text-gray-500 flex items-center gap-1 max-w-[7rem] truncate" title={c.branchName || ''}>
                          <MapPin className="w-3 h-3 shrink-0 text-stone-500" />
                          {c.branchName || c.storeId || '—'}
                        </span>
                      </td>

                      {/* Phone */}
                      <td className={customersTd(true)}>
                        <span className="text-xs text-gray-400">{c.phone || '—'}</span>
                      </td>

                      {/* Email */}
                      <td className={cn(customersTd(true), 'hidden lg:table-cell')}>
                        <span className="text-xs text-gray-400">
                          {truncate(c.email, 22) || '—'}
                        </span>
                      </td>

                      {/* Visits */}
                      <td className={cn(customersTd(true), 'text-center')}>
                        <span className="inline-flex min-w-[2rem] justify-center px-2 py-0.5 rounded-lg text-xs font-bold bg-white/5 text-amber-300">
                          {c.visitCount ?? c.purchaseCount ?? 0}
                        </span>
                      </td>

                      {/* Last Bill */}
                      <td className={cn(customersTd(true), 'text-end')}>
                        {c.lastOrder ? (
                          <div>
                            <p className="text-xs font-medium text-gray-200">
                              #{c.lastOrder.serialNo}
                            </p>
                            <p className="text-[10px] text-gray-500">
                              {formatPKR(c.lastOrder.total)}
                            </p>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-600">—</span>
                        )}
                      </td>

                      {/* Bills */}
                      <td className={cn(customersTd(true), 'text-center')}>
                        <span className="text-xs text-gray-300">
                          {(c.purchaseCount || 0).toLocaleString()}
                        </span>
                      </td>

                      {/* Spent */}
                      <td className={cn(customersTd(true), 'text-end')}>
                        <span className="text-xs font-semibold text-emerald-400">
                          {formatPKR(c.totalSpent || 0)}
                        </span>
                      </td>

                      {/* First Visit */}
                      <td className={cn(customersTd(true), 'text-end text-xs text-gray-500 hidden xl:table-cell')}>
                        {fmtDate(c.firstVisit || c.createdAt)}
                      </td>

                      {/* Last Visit */}
                      <td className={cn(customersTd(true), 'text-end text-xs text-gray-500')}>
                        {fmtDate(c.lastVisit || c.lastOrderDate)}
                      </td>

                      {/* Actions */}
                      <td className={customersTd(true)}>
                        <div className="flex justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => setHistoryFor(c)}
                            className={glassActionBtn('view')}
                            title={t('manager.common.viewHistory', 'View history')}
                          >
                            <History className={cn('w-3.5 h-3.5', glassIcon())} />
                          </button>
                          {!c.isWalkin && (
                            <button
                              type="button"
                              onClick={() => { setEditing(c); setFormOpen(true); }}
                              className={glassActionBtn('edit')}
                              title={t('manager.common.edit', 'Edit')}
                            >
                              <Edit3 className={cn('w-3.5 h-3.5', glassIcon())} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <PaginationBar
              page={page}
              totalPages={totalPages}
              totalItems={filtered.length}
              pageSize={pageSize}
              onPageChange={setPage}
              pageSizeOptions={[10, 20, 50]}
              onPageSizeChange={(n) => {
                setPageSize(n);
                setPage(1);
              }}
              variant="glass"
            />
          </div>

          {/* ── MOBILE CARDS ─────────────────────────────── */}
          <div className="md:hidden space-y-2.5">
            {paginated.map((c) => (
              <div key={c.id}
                className={`p-3 rounded-xl border bg-[#1a1208]
                  ${c.isWalkin
                    ? 'border-blue-500/25'
                    : 'border-[#2a1f0d]'}`}>
                <div className="flex items-center gap-3 mb-2.5">
                  <div className={`h-10 w-10 rounded-lg flex items-center justify-center font-bold text-sm shrink-0
                    ${c.isWalkin
                      ? 'bg-blue-500/15 text-blue-400'
                      : 'bg-amber-500/15 text-amber-400'}`}>
                    {c.isWalkin ? 'W' : getInitials(c.name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-bold text-gray-100 truncate">{getCustomerDisplayName(c)}</p>
                      {c.isWalkin && (
                        <span className="text-[8px] px-1 py-0.5 rounded bg-blue-500/15 text-blue-400 font-medium shrink-0">
                          {t('manager.common.walkInBadge', 'WALK-IN')}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 truncate">
                      {[c.branchName, c.phone || '—'].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2.5">
                  <div className="rounded-lg bg-[#0a0805] p-2 text-center">
                    <p className="text-[9px] text-gray-500 uppercase">{t('manager.common.visits', 'Visits')}</p>
                    <p className="text-sm font-bold text-amber-300/90">
                      {c.visitCount ?? c.purchaseCount ?? 0}
                    </p>
                  </div>
                  <div className="rounded-lg bg-[#0a0805] p-2 text-center">
                    <p className="text-[9px] text-gray-500 uppercase">{t('manager.common.bills', 'Bills')}</p>
                    <p className="text-sm font-bold text-gray-200">
                      {(c.purchaseCount || 0).toLocaleString()}
                    </p>
                  </div>
                  <div className="rounded-lg bg-emerald-500/5 p-2 text-center">
                    <p className="text-[9px] text-gray-500 uppercase">{t('manager.common.spent', 'Spent')}</p>
                    <p className="text-xs font-bold text-emerald-400">
                      {formatPKR(c.totalSpent || 0)}
                    </p>
                  </div>
                  <div className="rounded-lg bg-[#0a0805] p-2 text-center">
                    <p className="text-[9px] text-gray-500 uppercase">{t('manager.common.lastVisit', 'Last Visit')}</p>
                    <p className="text-xs text-gray-300">
                      {fmtDate(c.lastVisit || c.lastOrderDate)}
                    </p>
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setHistoryFor(c)}
                    className={cn(glassActionBtn('view'), 'flex-1 gap-1.5 text-xs')}
                  >
                    <History className={cn('w-3.5 h-3.5', glassIcon())} /> {t('manager.common.history', 'History')}
                  </button>
                  {!c.isWalkin && (
                    <button
                      type="button"
                      onClick={() => { setEditing(c); setFormOpen(true); }}
                      className={cn(glassActionBtn('edit'), 'flex-1 gap-1.5 text-xs')}
                    >
                      <Edit3 className={cn('w-3.5 h-3.5', glassIcon())} /> {t('manager.common.edit', 'Edit')}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {totalPages > 1 && (
            <PaginationBar
              page={page}
              totalPages={totalPages}
              totalItems={filtered.length}
              pageSize={pageSize}
              onPageChange={setPage}
              compact
              variant="glass"
              className="md:hidden rounded-2xl border border-white/[0.08]"
            />
          )}
        </>
      )}

      {/* ── MODALS ──────────────────────────────────────── */}
      <CustomerForm
        isOpen={formOpen}
        onClose={() => { setFormOpen(false); setEditing(null); }}
        customer={editing}
        isOnline={isOnline}
        storeId={primaryStoreId}
      />
      <HistoryModal
        customer={historyFor}
        onClose={() => setHistoryFor(null)}
        branchIds={branchIds}
      />
    </div>
  );
};

export default Customers;