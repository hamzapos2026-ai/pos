// File: src/pages/manager/Customers.jsx
// Purpose: Customer management — Firebase live sync + offline + walk-in fix

import React, {
  useState, useEffect, useCallback, useRef, useMemo,
} from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users, Plus, Edit3, X, Loader2, History,
  Wifi, WifiOff, RefreshCw, ShoppingBag,
  AlertTriangle, Search, ChevronLeft, ChevronRight,
  UserCheck, UserX,
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
  collection, doc, onSnapshot, getDocs,
  addDoc, updateDoc, query, orderBy,
  limit, startAfter, serverTimestamp, where,
} from 'firebase/firestore';
import { db } from '../../services/firebase';
import {
  formatPKR, getInitials, truncate,
} from '../../utils/managerHelpers';
import ExportMenu from '../../components/manager/ExportMenu';

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

const PAGE_SIZE = 20;

// ═══════════════════════════════════════════════════════════
// GET STORE ID — from auth/session/localStorage
// ═══════════════════════════════════════════════════════════
const getStoreId = () => {
  // Try multiple sources where your app stores storeId
  try {
    // Option 1: localStorage
    const stored = localStorage.getItem('storeId') ||
                   localStorage.getItem('currentStoreId') ||
                   localStorage.getItem('branchId');
    if (stored) return stored;

    // Option 2: sessionStorage
    const session = sessionStorage.getItem('storeId');
    if (session) return session;

    // Option 3: from manager auth user object
    const managerUser = JSON.parse(
      localStorage.getItem('managerUser') ||
      localStorage.getItem('user') || '{}'
    );
    if (managerUser?.storeId) return managerUser.storeId;
    if (managerUser?.branchId) return managerUser.branchId;
  } catch { /* ignore */ }
  return null;
};

// ═══════════════════════════════════════════════════════════
// ONLINE STATUS HOOK
// ═══════════════════════════════════════════════════════════
const useOnlineStatus = () => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  useEffect(() => {
    const on  = () => { setIsOnline(true);  toast.success('Back online — syncing…', { icon: '🟢' }); };
    const off = () => { setIsOnline(false); toast('Offline — cached data shown', { icon: '🔴' }); };
    window.addEventListener('online',  on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online',  on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return isOnline;
};

// ═══════════════════════════════════════════════════════════
// SYNC STATUS BAR
// ═══════════════════════════════════════════════════════════
const SyncBar = ({ isOnline, dataSource, syncing, lastSync }) => (
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
      {!isOnline ? 'Offline'
        : syncing ? 'Syncing…'
        : dataSource === 'live' ? 'Live'
        : 'Cached'}
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
const CustomerForm = ({ isOpen, onClose, customer, isOnline }) => {
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
    if (!form.name?.trim()) { toast.error('Name is required'); return; }
    setSaving(true);
    try {
      const storeId = getStoreId();
      const payload = {
        name:        form.name.trim(),
        nameLower:   form.name.trim().toLowerCase(),
        phone:       form.phone.trim(),
        phoneNormalized: normalizePhone(form.phone),
        email:       form.email.trim(),
        city:        form.city.trim(),
        address:     form.address.trim(),
        creditLimit: Number(form.creditLimit) || 0,
        updatedAt:   serverTimestamp(),
        ...(storeId ? { storeId } : {}),
      };

      if (customer?.id) {
        await updateDoc(doc(db, 'customers', customer.id), payload);
        toast.success('Customer updated');
      } else {
        await addDoc(collection(db, 'customers'), {
          ...payload,
          createdAt:    serverTimestamp(),
          isWalking:    false,
          isAutoNamed:  false,
          isAutoSerial: false,
          market:       '',
          billerId:     '',
        });
        toast.success('Customer added');
      }
      onClose();
    } catch (err) {
      console.error(err);
      toast.error(err.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const fields = [
    { key: 'name',    label: 'Name *',  placeholder: 'Full name'         },
    { key: 'phone',   label: 'Phone',   placeholder: '03XX-XXXXXXX'      },
    { key: 'email',   label: 'Email',   placeholder: 'email@example.com' },
    { key: 'city',    label: 'City',    placeholder: 'Karachi'           },
    { key: 'address', label: 'Address', placeholder: 'Street, area…'    },
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
                {customer ? 'Edit Customer' : 'Add Customer'}
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
                <label className="text-xs text-gray-400 mb-1 block">Credit Limit</label>
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
                  Changes will sync when back online
                </div>
              )}
            </div>

            <div className="p-3 border-t border-[#2a1f0d] flex gap-2">
              <button onClick={onClose} disabled={saving}
                className="flex-1 rounded-xl border border-[#2a1f0d] bg-[#1a1208] py-2.5 text-sm text-gray-400">
                Cancel
              </button>
              <button onClick={handleSubmit} disabled={saving}
                className="flex-1 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 py-2.5 text-sm font-semibold text-[#1a1208] disabled:opacity-50 flex items-center justify-center gap-2">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                {customer ? 'Update' : 'Add Customer'}
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
const HistoryModal = ({ customer, onClose, allOrders }) => {
  const orders = useMemo(() => {
    if (!customer) return [];

    const custId     = (customer.id || customer.customerId || '').trim();
    const custPhone  = normalizePhone(customer.phone);
    const custNameLc = (customer.name || '').toLowerCase().trim();
    const isWalkin   = isWalkinCustomer(customer);

    const matched = new Map();

    allOrders.forEach((order) => {
      if (order.isDeleted || order.deleted) return;

      const info          = getOrderMatchInfo(order);
      const orderIsWalkin = isWalkinFromOrder(order);

      if (isWalkin) {
        // Walk-in customer → match walk-in orders only
        if (orderIsWalkin) matched.set(order.id, order);
        return;
      }

      // Regular customer → must NOT be walk-in order
      if (orderIsWalkin) return;

      const byId = custId && info.custId === custId;

      const byPhone =
        custPhone.length >= 7 &&
        info.phone.length >= 7 &&
        (info.phone === custPhone ||
          info.phone.includes(custPhone) ||
          custPhone.includes(info.phone));

      const byName =
        custNameLc &&
        custNameLc.length > 3 &&
        info.name === custNameLc;

      if (byId || byPhone || byName) matched.set(order.id, order);
    });

    return [...matched.values()].sort(
      (a, b) =>
        getTimestamp(b.createdAt || b.savedAt) -
        getTimestamp(a.createdAt || a.savedAt)
    );
  }, [customer, allOrders]);

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
                  {customer.phone || 'No phone'} • {customer.city || 'No city'}
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
              { label: 'Bills', value: stats.billCount,             cls: 'bg-[#1a1208] border-[#2a1f0d]',       text: 'text-gray-100'  },
              { label: 'Spent', value: formatPKR(stats.totalSpent), cls: 'bg-[#1a1208] border-[#2a1f0d]',       text: 'text-gray-100'  },
              { label: 'Paid',  value: formatPKR(stats.totalPaid),  cls: 'bg-green-500/5 border-green-500/20',  text: 'text-green-400' },
              { label: 'Due',   value: formatPKR(stats.totalDue),   cls: 'bg-red-500/5 border-red-500/20',      text: 'text-red-400'   },
            ].map((s) => (
              <div key={s.label} className={`rounded-lg p-2.5 border ${s.cls}`}>
                <p className="text-[9px] text-gray-500 uppercase mb-1">{s.label}</p>
                <p className={`text-sm font-bold ${s.text}`}>{s.value}</p>
              </div>
            ))}
          </div>

          {/* Orders list */}
          <div className="flex-1 overflow-y-auto p-4">
            <p className="text-xs font-semibold text-gray-400 mb-2">
              Bill History ({orders.length})
            </p>

            {orders.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12">
                <ShoppingBag className="w-10 h-10 text-gray-700 mb-2" />
                <p className="text-sm text-gray-600">No bills found</p>
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
                            {o.items.length > 2 && ` +${o.items.length - 2} more`}
                          </p>
                        )}
                      </div>
                      <div className="text-right ml-4 shrink-0">
                        <p className="text-sm font-semibold text-gray-100">
                          {formatPKR(total)}
                        </p>
                        {due > 0 && (
                          <p className="text-[10px] text-red-400">
                            Due {formatPKR(due)}
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
            {orders.length} bills loaded from memory
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
  const isOnline = useOnlineStatus();
  const storeId  = useMemo(() => getStoreId(), []);

  // ── Data ────────────────────────────────────────────────
  const [rawCustomers, setRawCustomers] = useState([]);
  const [allOrders,    setAllOrders]    = useState([]);
  const [customers,    setCustomers]    = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [syncing,      setSyncing]      = useState(false);
  const [dataSource,   setDataSource]   = useState('loading');
  const [lastSync,     setLastSync]     = useState(null);

  // ── Filters ─────────────────────────────────────────────
  const [search,      setSearch]      = useState('');
  const [typeFilter,  setTypeFilter]  = useState('all'); // 'all' | 'regular' | 'walkin'
  const [page,        setPage]        = useState(1);

  // ── UI ───────────────────────────────────────────────────
  const [formOpen,   setFormOpen]   = useState(false);
  const [editing,    setEditing]    = useState(null);
  const [historyFor, setHistoryFor] = useState(null);

  // ── Refs ─────────────────────────────────────────────────
  const unsubCustRef   = useRef(null);
  const unsubOrdersRef = useRef(null);
  const ordersReadyRef = useRef(false);

  // ═══════════════════════════════════════════════════════
  // BUILD METRICS — attach order stats to each customer
  // ═══════════════════════════════════════════════════════
  const buildMetrics = useCallback((custDocs, orders) => {
    // ── Index orders ──────────────────────────────────────
    const byId    = new Map(); // custId   → metrics
    const byPhone = new Map(); // phone    → metrics
    let walkinM   = { count: 0, spent: 0, lastDate: null, lastOrder: null };

    const bump = (map, key, order, total, date) => {
      if (!map.has(key)) map.set(key, { count: 0, spent: 0, lastDate: null, lastOrder: null });
      const m = map.get(key);
      m.count++;
      m.spent += total;
      if (getTimestamp(date) > getTimestamp(m.lastDate)) {
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
      const m = byId.get(c.id) || (phone.length >= 7 ? byPhone.get(phone) : null) || { count: 0, spent: 0, lastDate: null, lastOrder: null };

      mapped.push({
        ...c,
        isWalkin: false,
        purchaseCount: m.count,
        totalSpent: m.spent,
        lastOrderDate: m.lastDate,
        lastOrder: m.lastOrder
          ? {
              serialNo: m.lastOrder.serialNo || m.lastOrder.billSerial || m.lastOrder.id?.slice(-8),
              total: Number(m.lastOrder.grandTotal || m.lastOrder.totalAmount || 0),
            }
          : null,
      });
    });

    // If any walk-in customer docs exist OR we saw walk-in orders, expose a single virtual Walk-in row
    if (hasWalkinDoc || walkinM.count > 0) {
      const v = {
        id: 'virtual-walkin',
        name: 'Walk-in Customer',
        isWalkin: true,
        phone: '—',
        city: '',
        purchaseCount: walkinM.count,
        totalSpent: walkinM.spent,
        lastOrderDate: walkinM.lastDate,
        lastOrder: walkinM.lastOrder
          ? {
              serialNo: walkinM.lastOrder.serialNo || walkinM.lastOrder.billSerial || walkinM.lastOrder.id?.slice(-8),
              total: Number(walkinM.lastOrder.grandTotal || walkinM.lastOrder.totalAmount || 0),
            }
          : null,
      };
      return [v, ...mapped];
    }

    return mapped;
  }, []);

  // ═══════════════════════════════════════════════════════
  // LOAD ALL ORDERS — batched, storeId-scoped
  // ═══════════════════════════════════════════════════════
  const loadAllOrders = useCallback(async () => {
    const all   = [];
    let lastDoc = null;
    let more    = true;

    while (more) {
      // Build query — filter by storeId if available
      const constraints = storeId
        ? [where('storeId', '==', storeId), orderBy('createdAt', 'desc'), limit(500)]
        : [orderBy('createdAt', 'desc'), limit(500)];

      if (lastDoc) constraints.push(startAfter(lastDoc));

      const snap = await getDocs(query(collection(db, 'orders'), ...constraints));
      snap.docs.forEach((d) => all.push({ id: d.id, ...d.data() }));

      if (snap.docs.length < 500) more = false;
      else lastDoc = snap.docs[snap.docs.length - 1];
    }
    return all;
  }, [storeId]);

  // ═══════════════════════════════════════════════════════
  // START LIVE SYNC
  // ═══════════════════════════════════════════════════════
  const startSync = useCallback(() => {
    setSyncing(true);
    setLoading(true);
    ordersReadyRef.current = false;

    // ── Customers listener ────────────────────────────────
    if (unsubCustRef.current) unsubCustRef.current();

    // Build customer query — storeId scoped if available
    const custQuery = storeId
      ? query(collection(db, 'customers'), where('storeId', '==', storeId))
      : collection(db, 'customers');

    unsubCustRef.current = onSnapshot(
      custQuery,
      { includeMetadataChanges: true },
      (snap) => {
        const fromCache  = snap.metadata.fromCache;
        const hasPending = snap.metadata.hasPendingWrites;

        // ✅ Include ALL customers including walk-in
        // We'll categorize them via isWalkinCustomer()
        const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

        setRawCustomers(docs);
        setDataSource(hasPending ? 'pending' : fromCache ? 'cache' : 'live');
        setSyncing(false);
        setLastSync(new Date());

        console.log(`[Customers] ${docs.length} loaded (${fromCache ? 'cache' : 'server'})`);
      },
      (err) => {
        console.error('[Customers]', err);
        toast.error('Customer sync error');
        setSyncing(false);
      }
    );

    // ── Orders: load all then listen for recent ───────────
    loadAllOrders()
      .then((orders) => {
        setAllOrders(orders);
        ordersReadyRef.current = true;
        setLoading(false);
        setLastSync(new Date());

        console.log(`[Orders] ${orders.length} loaded`);

        // Live listener for recent 100 orders
        if (unsubOrdersRef.current) unsubOrdersRef.current();

        const recentQ = storeId
          ? query(
              collection(db, 'orders'),
              where('storeId', '==', storeId),
              orderBy('createdAt', 'desc'),
              limit(100)
            )
          : query(
              collection(db, 'orders'),
              orderBy('createdAt', 'desc'),
              limit(100)
            );

        unsubOrdersRef.current = onSnapshot(
          recentQ,
          { includeMetadataChanges: true },
          (snap) => {
            if (!snap.metadata.fromCache) {
              setAllOrders((prev) => {
                const map = new Map(prev.map((o) => [o.id, o]));
                snap.docs.forEach((d) => map.set(d.id, { id: d.id, ...d.data() }));
                return [...map.values()];
              });
              setLastSync(new Date());
            }
          }
        );
      })
      .catch((err) => {
        console.error('[Orders load]', err);
        setLoading(false);
        setSyncing(false);
      });
  }, [loadAllOrders, storeId]);

  useEffect(() => {
    startSync();
    return () => {
      if (unsubCustRef.current)   unsubCustRef.current();
      if (unsubOrdersRef.current) unsubOrdersRef.current();
    };
  }, [startSync]);

  // Rebuild whenever raw data changes
  useEffect(() => {
    if (!ordersReadyRef.current) return;
    setCustomers(buildMetrics(rawCustomers, allOrders));
  }, [rawCustomers, allOrders, buildMetrics]);

  // ═══════════════════════════════════════════════════════
  // FORCE REFRESH
  // ═══════════════════════════════════════════════════════
  const forceRefresh = useCallback(() => {
    if (unsubCustRef.current)   unsubCustRef.current();
    if (unsubOrdersRef.current) unsubOrdersRef.current();
    startSync();
    toast.success('Refreshing…');
  }, [startSync]);

  // ═══════════════════════════════════════════════════════
  // FILTER + PAGINATE
  // ═══════════════════════════════════════════════════════
  const filtered = useMemo(() => {
    let list = [...customers];

    // Type filter
    if (typeFilter === 'regular') list = list.filter((c) => !c.isWalkin);
    if (typeFilter === 'walkin')  list = list.filter((c) => c.isWalkin);

    // Search
    if (search.trim()) {
      const s  = search.toLowerCase().trim();
      const ph = search.replace(/\D/g, '');
      list = list.filter((c) =>
        c.name?.toLowerCase().includes(s) ||
        (ph.length >= 3 && normalizePhone(c.phone).includes(ph)) ||
        c.email?.toLowerCase().includes(s) ||
        c.city?.toLowerCase().includes(s)
      );
    }

    // Sort: walk-in first, then by total spent
    list.sort((a, b) => {
      if (a.isWalkin && !b.isWalkin) return -1;
      if (!a.isWalkin && b.isWalkin) return 1;
      return (b.totalSpent || 0) - (a.totalSpent || 0);
    });

    return list;
  }, [customers, search, typeFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated  = useMemo(
    () => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filtered, page]
  );

  useEffect(() => { setPage(1); }, [search, typeFilter]);

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

      {/* ── HEADER ──────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold text-gray-100 flex items-center gap-2">
            <Users className="w-5 h-5 text-amber-500" />
            Customers
            <span className="text-xs font-normal text-gray-500">
              ({filtered.length})
            </span>
          </h2>
          {!loading && (
            <p className="text-[10px] text-gray-600 mt-0.5">
              {counts.regular} registered • {counts.walkin} walk-in •{' '}
              {allOrders.length.toLocaleString()} orders loaded
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <SyncBar
            isOnline={isOnline}
            dataSource={dataSource}
            syncing={syncing}
            lastSync={lastSync}
          />
          <button
            onClick={forceRefresh}
            disabled={syncing || loading}
            title="Refresh"
            className="p-2 rounded-xl border border-[#2a1f0d] bg-[#1a1208] text-gray-400 hover:text-amber-400 disabled:opacity-40"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
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
            className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 px-3 py-2 text-xs font-semibold text-[#1a1208]"
          >
            <Plus className="w-3.5 h-3.5" /> Add Customer
          </button>
        </div>
      </div>

      {/* ── SEARCH + TYPE FILTER ────────────────────────── */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, phone, email, city…"
            className="w-full rounded-xl border border-[#2a1f0d] bg-[#1a1208] pl-9 pr-9 py-2.5 text-sm text-gray-200 placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-amber-500/40"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Type tabs */}
        <div className="flex gap-1 p-1 rounded-xl border border-[#2a1f0d] bg-[#1a1208]">
          {[
            { key: 'all',     label: `All (${counts.total})`,         icon: Users     },
            { key: 'regular', label: `Regular (${counts.regular})`,   icon: UserCheck },
            { key: 'walkin',  label: `Walk-in (${counts.walkin})`,    icon: UserX     },
          ].map((t) => (
            <button
              key={t.key}
              onClick={() => setTypeFilter(t.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors
                ${typeFilter === t.key
                  ? 'bg-amber-500 text-[#1a1208]'
                  : 'text-gray-500 hover:text-gray-300'}`}
            >
              <t.icon className="w-3 h-3" />
              <span className="hidden sm:inline">{t.label}</span>
              <span className="sm:hidden">{t.label.split(' ')[0]}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── LOADING ─────────────────────────────────────── */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-amber-500 mb-3" />
          <p className="text-sm text-gray-500">Loading customers & orders…</p>
          {allOrders.length > 0 && (
            <p className="text-xs text-gray-600 mt-1">
              {allOrders.length.toLocaleString()} orders loaded…
            </p>
          )}
        </div>

      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16">
          <Users className="w-10 h-10 text-gray-700 mb-3" />
          <p className="text-sm text-gray-500">
            {search
              ? `No customers matching "${search}"`
              : 'No customers found'}
          </p>
        </div>

      ) : (
        <>
          {/* ── DESKTOP TABLE ────────────────────────────── */}
          <div className="hidden md:block rounded-2xl border border-[#2a1f0d] bg-[#12100a] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-[#1a1208] text-gray-500 text-xs uppercase">
                  <tr>
                    <th className="text-start px-4 py-3">Customer</th>
                    <th className="text-start px-4 py-3">Phone</th>
                    <th className="text-start px-4 py-3">Email</th>
                    <th className="text-end   px-4 py-3">Last Bill</th>
                    <th className="text-center px-4 py-3">Bills</th>
                    <th className="text-end   px-4 py-3">Total Spent</th>
                    <th className="text-end   px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginated.map((c) => (
                    <tr
                      key={c.id}
                      className={`border-t border-[#2a1f0d] hover:bg-[#1a1208]/50 transition-colors
                        ${c.isWalkin ? 'bg-blue-500/3' : ''}`}
                    >
                      {/* Customer */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className={`h-8 w-8 rounded-lg flex items-center justify-center text-xs font-bold shrink-0
                            ${c.isWalkin
                              ? 'bg-blue-500/15 text-blue-400'
                              : 'bg-amber-500/15 text-amber-400'}`}>
                            {c.isWalkin ? 'W' : getInitials(c.name)}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <p className="text-sm font-medium text-gray-100 truncate">
                                {truncate(c.name, 20)}
                              </p>
                              {c.isWalkin && (
                                <span className="text-[8px] px-1 py-0.5 rounded bg-blue-500/15 text-blue-400 font-medium shrink-0">
                                  WALK-IN
                                </span>
                              )}
                            </div>
                            <p className="text-[10px] text-gray-500">{c.city || '—'}</p>
                          </div>
                        </div>
                      </td>

                      {/* Phone */}
                      <td className="px-4 py-3">
                        <span className="text-xs text-gray-400">{c.phone || '—'}</span>
                      </td>

                      {/* Email */}
                      <td className="px-4 py-3">
                        <span className="text-xs text-gray-400">
                          {truncate(c.email, 22) || '—'}
                        </span>
                      </td>

                      {/* Last Bill */}
                      <td className="px-4 py-3 text-end">
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
                      <td className="px-4 py-3 text-center">
                        <span className="text-xs text-gray-300">
                          {(c.purchaseCount || 0).toLocaleString()}
                        </span>
                      </td>

                      {/* Spent */}
                      <td className="px-4 py-3 text-end">
                        <span className="text-xs font-semibold text-emerald-400">
                          {formatPKR(c.totalSpent || 0)}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          <button
                            onClick={() => setHistoryFor(c)}
                            className="p-1.5 rounded-lg text-blue-400 hover:bg-blue-500/10"
                            title="View history"
                          >
                            <History className="w-3.5 h-3.5" />
                          </button>
                          {/* Only allow editing non-walk-in customers */}
                          {!c.isWalkin && (
                            <button
                              onClick={() => { setEditing(c); setFormOpen(true); }}
                              className="p-1.5 rounded-lg text-amber-500 hover:bg-amber-500/10"
                              title="Edit"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="p-3 text-center text-[10px] text-gray-600 border-t border-[#2a1f0d]">
              {filtered.length} customers • {allOrders.length.toLocaleString()} orders
              {!isOnline && ' • Offline'}
            </div>
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
                      <p className="text-sm font-bold text-gray-100 truncate">{c.name}</p>
                      {c.isWalkin && (
                        <span className="text-[8px] px-1 py-0.5 rounded bg-blue-500/15 text-blue-400 font-medium shrink-0">
                          WALK-IN
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500">{c.phone || '—'}</p>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 mb-2.5">
                  <div className="rounded-lg bg-[#0a0805] p-2 text-center">
                    <p className="text-[9px] text-gray-500 uppercase">Bills</p>
                    <p className="text-sm font-bold text-gray-200">
                      {(c.purchaseCount || 0).toLocaleString()}
                    </p>
                  </div>
                  <div className="rounded-lg bg-emerald-500/5 p-2 text-center">
                    <p className="text-[9px] text-gray-500 uppercase">Spent</p>
                    <p className="text-xs font-bold text-emerald-400">
                      {formatPKR(c.totalSpent || 0)}
                    </p>
                  </div>
                  <div className="rounded-lg bg-[#0a0805] p-2 text-center">
                    <p className="text-[9px] text-gray-500 uppercase">Last</p>
                    <p className="text-xs text-gray-300">
                      {fmtDate(c.lastOrderDate)}
                    </p>
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => setHistoryFor(c)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-blue-500/10 text-blue-400 text-xs"
                  >
                    <History className="w-3.5 h-3.5" /> History
                  </button>
                  {!c.isWalkin && (
                    <button
                      onClick={() => { setEditing(c); setFormOpen(true); }}
                      className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-amber-500/10 text-amber-400 text-xs"
                    >
                      <Edit3 className="w-3.5 h-3.5" /> Edit
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* ── PAGINATION ───────────────────────────────── */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-2">
              <button
                disabled={page === 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="p-2 rounded-lg border border-[#2a1f0d] bg-[#1a1208] text-gray-400 disabled:opacity-40 hover:text-amber-400"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let p;
                if (totalPages <= 5)        p = i + 1;
                else if (page <= 3)         p = i + 1;
                else if (page >= totalPages - 2) p = totalPages - 4 + i;
                else                        p = page - 2 + i;
                return (
                  <button key={p} onClick={() => setPage(p)}
                    className={`w-8 h-8 rounded-lg text-xs font-medium transition-colors
                      ${page === p
                        ? 'bg-amber-500 text-[#1a1208]'
                        : 'border border-[#2a1f0d] bg-[#1a1208] text-gray-400 hover:text-amber-400'}`}>
                    {p}
                  </button>
                );
              })}
              <button
                disabled={page === totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="p-2 rounded-lg border border-[#2a1f0d] bg-[#1a1208] text-gray-400 disabled:opacity-40 hover:text-amber-400"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              <span className="text-xs text-gray-600">{page}/{totalPages}</span>
            </div>
          )}
        </>
      )}

      {/* ── MODALS ──────────────────────────────────────── */}
      <CustomerForm
        isOpen={formOpen}
        onClose={() => { setFormOpen(false); setEditing(null); }}
        customer={editing}
        isOnline={isOnline}
      />
      <HistoryModal
        customer={historyFor}
        onClose={() => setHistoryFor(null)}
        allOrders={allOrders}
      />
    </div>
  );
};

export default Customers;