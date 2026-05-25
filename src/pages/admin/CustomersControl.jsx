// src/pages/admin/CustomersControl.jsx
// ✅ PRODUCTION READY — Firebase Live Sync + Offline/Online Support

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  UserCheck, Search, Phone, MapPin, Download,
  ShoppingBag, Edit, Trash2, X, Filter,
  ChevronUp, ChevronDown, RefreshCw, Eye,
  Calendar, TrendingUp, Users, Wallet,
  Wifi, WifiOff, Loader2, AlertTriangle,
  ChevronLeft, ChevronRight, MoreHorizontal,
} from 'lucide-react';
import {
  collection, getDocs, deleteDoc, doc,
  updateDoc, query, where, orderBy,
  limit, startAfter, onSnapshot,
  getCountFromServer, writeBatch,
  enableNetwork, disableNetwork,
  getDocsFromCache, getDocsFromServer,
} from 'firebase/firestore';
import toast from 'react-hot-toast';
import { db } from '../../services/firebase';
import { cn } from '../../utils/cn';
import { useTheme } from '../../context/ThemeContext';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import PageHeader from '../../components/admin/PageHeader';
import EmptyState from '../../components/admin/EmptyState';
import StatCard from '../../components/admin/StatCard';
import Badge from '../../components/ui/Badge';

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════
const fmt = (v) => `Rs ${Number(v || 0).toLocaleString()}`;

const fmtDate = (v) => {
  if (!v) return '—';
  try {
    const d = v?.toDate ? v.toDate() : new Date(v);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('en-PK', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return '—';
  }
};

const getTimestamp = (v) => {
  if (!v) return 0;
  try {
    const d = v?.toDate ? v.toDate() : new Date(v);
    return d.getTime() || 0;
  } catch {
    return 0;
  }
};

const normalizePhone = (p) => (p || '').replace(/[\s\-\(\)]/g, '').trim();

const getOrderCustomerInfo = (order) => ({
  id: order.customerId || order.customer?.id || order.customer?.customerId || '',
  phone: normalizePhone(
    order.customer?.phone ||
    order.customerPhone ||
    order.customer?.phoneNormalized ||
    ''
  ),
  name: (
    order.customer?.name ||
    order.customerName ||
    ''
  ).toLowerCase().trim(),
  rawPhone: order.customer?.phone || order.customerPhone || '',
});

const isWalkinOrder = (info) => {
  return (
    !info.phone &&
    (!info.name ||
      info.name === 'walk-in' ||
      info.name === 'walk-in customer' ||
      info.name.includes('walk-in') ||
      info.name === 'walking' ||
      info.name === 'walkin')
  );
};

const SORT_OPTIONS = [
  { key: 'totalSpent', label: 'Total Spent', dir: 'desc' },
  { key: 'purchaseCount', label: 'Total Orders', dir: 'desc' },
  { key: 'name', label: 'Name A→Z', dir: 'asc' },
  { key: 'name', label: 'Name Z→A', dir: 'desc' },
  { key: 'lastOrderDate', label: 'Last Purchase', dir: 'desc' },
];

const PAGE_SIZE = 50;

// ═══════════════════════════════════════════════════════════════
// ONLINE STATUS HOOK
// ═══════════════════════════════════════════════════════════════
const useOnlineStatus = () => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [wasOffline, setWasOffline] = useState(false);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      if (wasOffline) {
        toast.success('Back online — syncing data...', { icon: '🟢' });
        setWasOffline(false);
      }
    };
    const handleOffline = () => {
      setIsOnline(false);
      setWasOffline(true);
      toast('You are offline — showing cached data', { icon: '🔴' });
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [wasOffline]);

  return isOnline;
};

// ═══════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════
const CustomersControl = () => {
  const { isDark } = useTheme();
  const isOnline = useOnlineStatus();

  // ── Data state ─────────────────────────────────────────────
  const [customers, setCustomers] = useState([]);
  const [allOrders, setAllOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState(null);
  const [dataSource, setDataSource] = useState('loading'); // 'cache' | 'server' | 'live'

  // ── Filter / sort state ────────────────────────────────────
  const [search, setSearch] = useState('');
  const [cityFilter, setCityFilter] = useState('');
  const [sortKey, setSortKey] = useState('totalSpent');
  const [sortDir, setSortDir] = useState('desc');
  const [page, setPage] = useState(1);

  // ── UI state ───────────────────────────────────────────────
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [editForm, setEditForm] = useState({ name: '', phone: '', city: '' });
  const [editSaving, setEditSaving] = useState(false);
  const [viewingCustomer, setViewingCustomer] = useState(null);
  const [viewOrders, setViewOrders] = useState([]);
  const [viewLoading, setViewLoading] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  // ── Refs ───────────────────────────────────────────────────
  const unsubCustomersRef = useRef(null);
  const unsubOrdersRef = useRef(null);
  const ordersLoadedRef = useRef(false);
  const customersLoadedRef = useRef(false);

  // ═══════════════════════════════════════════════════════════
  // PROCESS ORDERS → BUILD CUSTOMER METRICS
  // ═══════════════════════════════════════════════════════════
  const processOrdersIntoMetrics = useCallback((orders) => {
    const metricsById = {};
    const metricsByPhone = {};
    const walkinMetrics = { count: 0, spent: 0, lastDate: null };

    orders.forEach((order) => {
      if (order.isDeleted || order.deleted) return;

      const total = Number(
        order.grandTotal || order.totalAmount || order.total || 0
      );
      const info = getOrderCustomerInfo(order);
      const orderDate = order.createdAt || order.savedAt || null;

      if (isWalkinOrder(info)) {
        walkinMetrics.count++;
        walkinMetrics.spent += total;
        const ts = getTimestamp(orderDate);
        if (ts > getTimestamp(walkinMetrics.lastDate)) {
          walkinMetrics.lastDate = orderDate;
        }
        return;
      }

      // By customer ID
      if (info.id) {
        if (!metricsById[info.id]) {
          metricsById[info.id] = { count: 0, spent: 0, lastDate: null };
        }
        metricsById[info.id].count++;
        metricsById[info.id].spent += total;
        const ts = getTimestamp(orderDate);
        if (ts > getTimestamp(metricsById[info.id].lastDate)) {
          metricsById[info.id].lastDate = orderDate;
        }
      }

      // By phone
      if (info.phone && info.phone.length >= 7) {
        if (!metricsByPhone[info.phone]) {
          metricsByPhone[info.phone] = { count: 0, spent: 0, lastDate: null };
        }
        metricsByPhone[info.phone].count++;
        metricsByPhone[info.phone].spent += total;
        const ts = getTimestamp(orderDate);
        if (ts > getTimestamp(metricsByPhone[info.phone].lastDate)) {
          metricsByPhone[info.phone].lastDate = orderDate;
        }
      }
    });

    return { metricsById, metricsByPhone, walkinMetrics };
  }, []);

  // ═══════════════════════════════════════════════════════════
  // BUILD FINAL CUSTOMER LIST
  // ═══════════════════════════════════════════════════════════
  const buildCustomerList = useCallback(
    (customerDocs, orders) => {
      const { metricsById, metricsByPhone, walkinMetrics } =
        processOrdersIntoMetrics(orders);

      const normalCustomers = [];

      customerDocs.forEach((cust) => {
        const name = cust.name || 'Unknown';
        const phone = normalizePhone(cust.phone || cust.phoneNormalized || '');
        const isWalkin =
          name.toLowerCase().includes('walk-in') ||
          name.toLowerCase().includes('walkin') ||
          cust.isWalking;

        if (isWalkin) return;

        const m =
          metricsById[cust.id] ||
          (phone && phone.length >= 7 ? metricsByPhone[phone] : null) ||
          { count: 0, spent: 0, lastDate: null };

        normalCustomers.push({
          id: cust.id,
          name: cust.name || 'Unknown',
          phone: cust.phone || cust.phoneNormalized || '',
          city: cust.city || '',
          market: cust.market || '',
          email: cust.email || '',
          isAutoNamed: cust.isAutoNamed || false,
          createdAt: cust.createdAt || null,
          purchaseCount: m.count,
          totalSpent: m.spent,
          lastOrderDate: m.lastDate,
          isWalkin: false,
        });
      });

      const masterWalkin = {
        id: 'virtual-walkin',
        name: 'Walk-in Customer',
        phone: '',
        city: 'All Branches',
        market: '',
        email: '',
        isWalkin: true,
        isAutoNamed: false,
        createdAt: null,
        purchaseCount: walkinMetrics.count,
        totalSpent: walkinMetrics.spent,
        lastOrderDate: walkinMetrics.lastDate,
      };

      return [masterWalkin, ...normalCustomers];
    },
    [processOrdersIntoMetrics]
  );

  // ═══════════════════════════════════════════════════════════
  // LIVE FIREBASE LISTENERS (Real-time sync)
  // ═══════════════════════════════════════════════════════════
  const startLiveSync = useCallback(() => {
    // ── Customers listener ────────────────────────────────
    if (unsubCustomersRef.current) unsubCustomersRef.current();

    unsubCustomersRef.current = onSnapshot(
      collection(db, 'customers'),
      { includeMetadataChanges: true },
      (snapshot) => {
        const source = snapshot.metadata.fromCache ? 'cache' : 'server';
        const hasPending = snapshot.metadata.hasPendingWrites;

        const customerDocs = snapshot.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        }));

        // Update customers with current orders
        setAllOrders((currentOrders) => {
          const builtList = buildCustomerList(customerDocs, currentOrders);
          setCustomers(builtList);
          return currentOrders;
        });

        if (!customersLoadedRef.current) {
          customersLoadedRef.current = true;
        }

        setDataSource(hasPending ? 'pending' : source === 'cache' ? 'cache' : 'live');
        setSyncing(false);

        console.log(
          `[Customers] ${customerDocs.length} loaded from ${source}` +
          (hasPending ? ' (pending writes)' : '')
        );
      },
      (error) => {
        console.error('[Customers Listener Error]', error);
        toast.error('Customer sync error: ' + error.message);
      }
    );

    // ── Orders listener (batched) ─────────────────────────
    if (unsubOrdersRef.current) unsubOrdersRef.current();

    // For large collections, we load orders initially then listen for changes
    const loadAllOrders = async () => {
      const allOrd = [];
      let lastDoc = null;
      let hasMore = true;
      let batchNum = 0;

      while (hasMore) {
        const constraints = [
          collection(db, 'orders'),
          orderBy('createdAt', 'desc'),
          limit(500),
        ];

        if (lastDoc) {
          constraints.splice(2, 0, startAfter(lastDoc));
        }

        const q = query(...constraints);

        try {
          const snap = await getDocs(q);
          snap.docs.forEach((d) =>
            allOrd.push({ id: d.id, ...d.data() })
          );

          batchNum++;
          if (batchNum % 2 === 0) {
            // Update UI every 2 batches
            setAllOrders([...allOrd]);
          }

          if (snap.docs.length < 500) {
            hasMore = false;
          } else {
            lastDoc = snap.docs[snap.docs.length - 1];
          }
        } catch (err) {
          console.error(`[Orders Batch ${batchNum}]`, err);
          hasMore = false;
        }
      }

      return allOrd;
    };

    // Initial load
    loadAllOrders().then((allOrd) => {
      setAllOrders(allOrd);
      ordersLoadedRef.current = true;
      setLoading(false);
      setLastSyncTime(new Date());

      console.log(`[Orders] ${allOrd.length} total orders loaded`);

      // Now listen for NEW orders (real-time)
      const recentQuery = query(
        collection(db, 'orders'),
        orderBy('createdAt', 'desc'),
        limit(50)
      );

      unsubOrdersRef.current = onSnapshot(
        recentQuery,
        { includeMetadataChanges: true },
        (snapshot) => {
          if (!snapshot.metadata.fromCache) {
            const changes = snapshot.docChanges();
            let hasNewData = false;

            changes.forEach((change) => {
              if (change.type === 'added' || change.type === 'modified') {
                hasNewData = true;
              }
            });

            if (hasNewData && ordersLoadedRef.current) {
              // Merge new/updated orders
              setAllOrders((prev) => {
                const ordersMap = new Map(prev.map((o) => [o.id, o]));

                snapshot.docs.forEach((d) => {
                  ordersMap.set(d.id, { id: d.id, ...d.data() });
                });

                const updated = [...ordersMap.values()];
                setLastSyncTime(new Date());
                setDataSource('live');
                return updated;
              });
            }
          }
        },
        (error) => {
          console.error('[Orders Listener Error]', error);
        }
      );
    });
  }, [buildCustomerList]);

  // ═══════════════════════════════════════════════════════════
  // REBUILD CUSTOMERS WHEN ORDERS CHANGE
  // ═══════════════════════════════════════════════════════════
  useEffect(() => {
    if (!ordersLoadedRef.current || !customersLoadedRef.current) return;

    // Get current customer docs from snapshot
    const customerDocs = customers
      .filter((c) => !c.isWalkin)
      .map((c) => ({
        id: c.id,
        name: c.name,
        phone: c.phone,
        city: c.city,
        market: c.market,
        email: c.email,
        isAutoNamed: c.isAutoNamed,
        createdAt: c.createdAt,
        phoneNormalized: c.phone,
      }));

    if (customerDocs.length > 0) {
      const builtList = buildCustomerList(customerDocs, allOrders);
      setCustomers(builtList);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allOrders]);

  // ═══════════════════════════════════════════════════════════
  // START SYNC ON MOUNT
  // ═══════════════════════════════════════════════════════════
  useEffect(() => {
    startLiveSync();

    return () => {
      if (unsubCustomersRef.current) unsubCustomersRef.current();
      if (unsubOrdersRef.current) unsubOrdersRef.current();
    };
  }, [startLiveSync]);

  // ═══════════════════════════════════════════════════════════
  // FORCE REFRESH
  // ═══════════════════════════════════════════════════════════
  const forceRefresh = useCallback(async () => {
    setSyncing(true);
    ordersLoadedRef.current = false;
    customersLoadedRef.current = false;

    // Cleanup old listeners
    if (unsubCustomersRef.current) unsubCustomersRef.current();
    if (unsubOrdersRef.current) unsubOrdersRef.current();

    setLoading(true);

    // Restart
    startLiveSync();
    toast.success('Refreshing all data...');
  }, [startLiveSync]);

  // ═══════════════════════════════════════════════════════════
  // UNIQUE CITIES
  // ═══════════════════════════════════════════════════════════
  const cities = useMemo(() => {
    const set = new Set();
    customers.forEach((c) => {
      if (c.city && !c.isWalkin) set.add(c.city);
    });
    return [...set].sort();
  }, [customers]);

  // ═══════════════════════════════════════════════════════════
  // FILTER + SORT + PAGINATE
  // ═══════════════════════════════════════════════════════════
  const filtered = useMemo(() => {
    let list = [...customers];

    if (search.trim().length >= 1) {
      const s = search.toLowerCase().trim();
      const ph = search.replace(/\D/g, '');
      list = list.filter(
        (c) =>
          c.name?.toLowerCase().includes(s) ||
          (ph.length >= 3 && normalizePhone(c.phone).includes(ph)) ||
          c.city?.toLowerCase().includes(s) ||
          c.market?.toLowerCase().includes(s) ||
          c.email?.toLowerCase().includes(s)
      );
    }

    if (cityFilter) {
      list = list.filter(
        (c) =>
          c.isWalkin || c.city?.toLowerCase() === cityFilter.toLowerCase()
      );
    }

    // Walk-in always first
    const walkin = list.filter((c) => c.isWalkin);
    let rest = list.filter((c) => !c.isWalkin);

    rest.sort((a, b) => {
      let av = a[sortKey] ?? '';
      let bv = b[sortKey] ?? '';

      // Handle dates
      if (sortKey === 'lastOrderDate') {
        av = getTimestamp(av);
        bv = getTimestamp(bv);
      }

      if (typeof av === 'string') av = av.toLowerCase();
      if (typeof bv === 'string') bv = bv.toLowerCase();

      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });

    return [...walkin, ...rest];
  }, [customers, search, cityFilter, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = useMemo(
    () => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filtered, page]
  );

  useEffect(() => {
    setPage(1);
  }, [search, cityFilter, sortKey, sortDir]);

  const handleSort = (key) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  // ═══════════════════════════════════════════════════════════
  // VIEW CUSTOMER ORDERS — MULTI-STRATEGY MATCHING
  // ═══════════════════════════════════════════════════════════
  const viewCustomerOrders = useCallback(
    (customer) => {
      setViewingCustomer(customer);
      setViewLoading(true);

      // Filter from already-loaded orders (no extra Firebase calls!)
      const phone = normalizePhone(customer.phone);
      let matched = [];

      if (customer.isWalkin) {
        matched = allOrders.filter((order) => {
          if (order.isDeleted || order.deleted) return false;
          const info = getOrderCustomerInfo(order);
          return isWalkinOrder(info);
        });
      } else {
        const matchedMap = new Map();

        allOrders.forEach((order) => {
          if (order.isDeleted || order.deleted) return;
          const info = getOrderCustomerInfo(order);

          // Match by ID
          if (info.id && info.id === customer.id) {
            matchedMap.set(order.id, order);
            return;
          }

          // Match by phone
          if (
            phone &&
            phone.length >= 7 &&
            info.phone &&
            (info.phone === phone ||
              info.phone.includes(phone) ||
              phone.includes(info.phone))
          ) {
            matchedMap.set(order.id, order);
            return;
          }

          // Match by name (last resort, exact only)
          if (
            customer.name &&
            info.name &&
            info.name === customer.name.toLowerCase().trim() &&
            !isWalkinOrder(info)
          ) {
            matchedMap.set(order.id, order);
          }
        });

        matched = [...matchedMap.values()];
      }

      // Sort by date desc
      matched.sort(
        (a, b) =>
          getTimestamp(b.createdAt || b.savedAt) -
          getTimestamp(a.createdAt || a.savedAt)
      );

      setViewOrders(matched.slice(0, 200));
      setViewLoading(false);

      if (matched.length === 0) {
        toast(`No orders found for ${customer.name}`, { icon: 'ℹ️' });
      }
    },
    [allOrders]
  );

  // ═══════════════════════════════════════════════════════════
  // DELETE CUSTOMER
  // ═══════════════════════════════════════════════════════════
  const handleDelete = useCallback(async (id, isWalkin) => {
    if (isWalkin) {
      toast.error('Cannot delete master walk-in.');
      return;
    }
    if (!window.confirm('⚠️ Permanently delete this customer?')) return;

    setDeletingId(id);
    try {
      await deleteDoc(doc(db, 'customers', id));
      // Live listener will auto-remove from state
      toast.success('Customer deleted');
    } catch (e) {
      toast.error('Delete failed: ' + e.message);
    } finally {
      setDeletingId(null);
    }
  }, []);

  // ═══════════════════════════════════════════════════════════
  // EDIT CUSTOMER
  // ═══════════════════════════════════════════════════════════
  const openEdit = useCallback((customer) => {
    setEditingCustomer(customer);
    setEditForm({
      name: customer.name || '',
      phone: customer.phone || '',
      city: customer.city || '',
    });
  }, []);

  const saveEdit = useCallback(async () => {
    if (!editingCustomer) return;
    setEditSaving(true);

    try {
      const updates = {
        name: editForm.name.trim() || 'Unknown',
        phone: editForm.phone.trim(),
        city: editForm.city.trim(),
      };

      await updateDoc(doc(db, 'customers', editingCustomer.id), updates);
      // Live listener will auto-update state
      toast.success('Customer updated');
      setEditingCustomer(null);
    } catch (e) {
      toast.error('Update failed: ' + e.message);
    } finally {
      setEditSaving(false);
    }
  }, [editingCustomer, editForm]);

  // ═══════════════════════════════════════════════════════════
  // EXPORT CSV
  // ═══════════════════════════════════════════════════════════
  const handleExport = useCallback(() => {
    const headers = [
      'Type', 'ID', 'Name', 'Phone', 'City',
      'Market', 'Email', 'Total Orders', 'Total Spent', 'Last Order',
    ];

    const rows = filtered.map((c) =>
      [
        c.isWalkin ? 'Walk-in' : 'Registered',
        c.isWalkin ? 'N/A' : c.id,
        c.name,
        c.phone || '-',
        c.city || '-',
        c.market || '-',
        c.email || '-',
        c.purchaseCount,
        c.totalSpent,
        fmtDate(c.lastOrderDate),
      ]
        .map((v) => `"${v}"`)
        .join(',')
    );

    const csv = [
      'data:text/csv;charset=utf-8,',
      headers.join(','),
      ...rows,
    ].join('\n');

    const link = document.createElement('a');
    link.setAttribute('href', encodeURI(csv));
    link.setAttribute('download', `customers_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success(`Exported ${filtered.length} customers`);
  }, [filtered]);

  // ── Stats ──────────────────────────────────────────────────
  const stats = useMemo(() => {
    const walkin = customers.find((c) => c.isWalkin);
    const registered = customers.filter((c) => !c.isWalkin);
    return {
      total: customers.length,
      withPhone: registered.filter((c) => c.phone).length,
      walkinSales: walkin?.totalSpent || 0,
      registeredSales: registered.reduce((s, c) => s + c.totalSpent, 0),
      totalOrders: allOrders.length,
    };
  }, [customers, allOrders]);

  // ── Sort icon ──────────────────────────────────────────────
  const SortIcon = ({ k }) =>
    sortKey === k ? (
      sortDir === 'asc' ? (
        <ChevronUp className="w-3.5 h-3.5 inline ml-1" />
      ) : (
        <ChevronDown className="w-3.5 h-3.5 inline ml-1" />
      )
    ) : null;

  // ═══════════════════════════════════════════════════════════
  // SYNC STATUS BAR
  // ═══════════════════════════════════════════════════════════
  const SyncStatusBar = () => (
    <div
      className={cn(
        'flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium',
        isOnline
          ? dataSource === 'live'
            ? isDark
              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
              : 'bg-emerald-50 text-emerald-600 border border-emerald-200'
            : dataSource === 'cache'
            ? isDark
              ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
              : 'bg-amber-50 text-amber-600 border border-amber-200'
            : isDark
            ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
            : 'bg-blue-50 text-blue-600 border border-blue-200'
          : isDark
          ? 'bg-red-500/10 text-red-400 border border-red-500/20'
          : 'bg-red-50 text-red-600 border border-red-200'
      )}
    >
      {isOnline ? (
        <>
          {syncing ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <Wifi className="w-3 h-3" />
          )}
          <span>
            {dataSource === 'live'
              ? 'Live'
              : dataSource === 'cache'
              ? 'Cached'
              : syncing
              ? 'Syncing...'
              : 'Connected'}
          </span>
        </>
      ) : (
        <>
          <WifiOff className="w-3 h-3" />
          <span>Offline</span>
        </>
      )}
      {lastSyncTime && (
        <span className="opacity-60">
          • {lastSyncTime.toLocaleTimeString()}
        </span>
      )}
    </div>
  );

  // ═══════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════
  return (
    <div className="p-4 sm:p-6 max-w-[1600px] mx-auto">
      {/* ── EDIT MODAL ─────────────────────────────────── */}
      {editingCustomer && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div
            className={cn(
              'rounded-2xl border p-6 w-full max-w-md',
              isDark
                ? 'bg-[#0f0a05] border-[#2a1f0d]'
                : 'bg-white border-amber-200'
            )}
          >
            <div className="flex items-center justify-between mb-4">
              <h3
                className={cn(
                  'text-xl font-bold',
                  isDark ? 'text-white' : 'text-gray-900'
                )}
              >
                Edit Customer
              </h3>
              <button
                onClick={() => setEditingCustomer(null)}
                className={cn(
                  'p-1 rounded-lg transition-colors',
                  isDark
                    ? 'hover:bg-white/10 text-gray-400'
                    : 'hover:bg-black/5 text-gray-500'
                )}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 mb-6">
              {[
                { label: 'Name', key: 'name', placeholder: 'e.g. Ahmed Khan' },
                {
                  label: 'Phone',
                  key: 'phone',
                  placeholder: 'e.g. 03001234567',
                },
                { label: 'City', key: 'city', placeholder: 'e.g. Karachi' },
              ].map(({ label, key, placeholder }) => (
                <div key={key}>
                  <label
                    className={cn(
                      'block text-sm font-semibold mb-1',
                      isDark ? 'text-gray-300' : 'text-gray-700'
                    )}
                  >
                    {label}
                  </label>
                  <Input
                    value={editForm[key] || ''}
                    onChange={(e) =>
                      setEditForm((p) => ({ ...p, [key]: e.target.value }))
                    }
                    placeholder={placeholder}
                  />
                </div>
              ))}
            </div>

            {!isOnline && (
              <div
                className={cn(
                  'flex items-center gap-2 p-2 rounded-lg mb-4 text-xs',
                  isDark
                    ? 'bg-amber-500/10 text-amber-400'
                    : 'bg-amber-50 text-amber-600'
                )}
              >
                <AlertTriangle className="w-3.5 h-3.5" />
                Changes will sync when back online
              </div>
            )}

            <div className="flex justify-end gap-3">
              <Button
                variant="ghost"
                onClick={() => setEditingCustomer(null)}
                disabled={editSaving}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={saveEdit}
                disabled={editSaving}
              >
                {editSaving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin mr-1" />
                    Saving...
                  </>
                ) : (
                  'Save Changes'
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── VIEW ORDERS MODAL ──────────────────────────── */}
      {viewingCustomer && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div
            className={cn(
              'rounded-2xl border w-full max-w-2xl max-h-[85vh] flex flex-col',
              isDark
                ? 'bg-[#0f0a05] border-[#2a1f0d]'
                : 'bg-white border-amber-200'
            )}
          >
            {/* Header */}
            <div
              className={cn(
                'flex items-center justify-between p-4 border-b shrink-0',
                isDark ? 'border-[#2a1f0d]' : 'border-amber-100'
              )}
            >
              <div className="flex items-center gap-3">
                <div
                  className={cn(
                    'w-10 h-10 rounded-full font-bold flex items-center',
                    'justify-center text-white text-sm',
                    viewingCustomer.isWalkin
                      ? 'bg-gradient-to-br from-blue-400 to-blue-600'
                      : 'bg-gradient-to-br from-amber-400 to-amber-600'
                  )}
                >
                  {viewingCustomer.isWalkin
                    ? 'W'
                    : (viewingCustomer.name || '?')[0].toUpperCase()}
                </div>
                <div>
                  <h3
                    className={cn(
                      'text-lg font-bold',
                      isDark ? 'text-white' : 'text-gray-900'
                    )}
                  >
                    {viewingCustomer.name}
                  </h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {viewingCustomer.phone || 'No phone'} •{' '}
                    {viewingCustomer.city || 'Unknown city'} •{' '}
                    {viewOrders.length} orders
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setViewingCustomer(null);
                  setViewOrders([]);
                }}
                className={cn(
                  'p-1.5 rounded-lg',
                  isDark
                    ? 'hover:bg-white/10 text-gray-400'
                    : 'hover:bg-black/5 text-gray-500'
                )}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Summary Stats */}
            {viewOrders.length > 0 && (
              <div
                className={cn(
                  'grid grid-cols-3 gap-2 p-4 border-b shrink-0',
                  isDark ? 'border-[#2a1f0d]' : 'border-amber-100'
                )}
              >
                <div
                  className={cn(
                    'rounded-lg p-2 text-center',
                    isDark ? 'bg-[#1a1208]' : 'bg-amber-50'
                  )}
                >
                  <p className="text-[10px] text-gray-500 uppercase">
                    Total Orders
                  </p>
                  <p
                    className={cn(
                      'text-lg font-bold',
                      isDark ? 'text-white' : 'text-gray-900'
                    )}
                  >
                    {viewOrders.length}
                  </p>
                </div>
                <div
                  className={cn(
                    'rounded-lg p-2 text-center',
                    isDark ? 'bg-emerald-500/5' : 'bg-emerald-50'
                  )}
                >
                  <p className="text-[10px] text-gray-500 uppercase">
                    Total Spent
                  </p>
                  <p
                    className={cn(
                      'text-lg font-bold',
                      isDark ? 'text-emerald-400' : 'text-emerald-600'
                    )}
                  >
                    {fmt(
                      viewOrders.reduce(
                        (s, o) =>
                          s +
                          Number(
                            o.grandTotal || o.totalAmount || o.total || 0
                          ),
                        0
                      )
                    )}
                  </p>
                </div>
                <div
                  className={cn(
                    'rounded-lg p-2 text-center',
                    isDark ? 'bg-blue-500/5' : 'bg-blue-50'
                  )}
                >
                  <p className="text-[10px] text-gray-500 uppercase">
                    Avg Order
                  </p>
                  <p
                    className={cn(
                      'text-lg font-bold',
                      isDark ? 'text-blue-400' : 'text-blue-600'
                    )}
                  >
                    {fmt(
                      viewOrders.reduce(
                        (s, o) =>
                          s +
                          Number(
                            o.grandTotal || o.totalAmount || o.total || 0
                          ),
                        0
                      ) / viewOrders.length
                    )}
                  </p>
                </div>
              </div>
            )}

            {/* Orders list */}
            <div className="overflow-y-auto flex-1 p-4">
              {viewLoading ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 animate-spin text-amber-500 mb-2" />
                  <p className="text-sm text-gray-500">Loading orders...</p>
                </div>
              ) : viewOrders.length === 0 ? (
                <div className="text-center py-12">
                  <ShoppingBag className="w-12 h-12 text-gray-600 mx-auto mb-3" />
                  <p
                    className={cn(
                      'text-sm',
                      isDark ? 'text-gray-500' : 'text-gray-400'
                    )}
                  >
                    No orders found for this customer
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {viewOrders.map((order) => (
                    <div
                      key={order.id}
                      className={cn(
                        'rounded-xl border p-3',
                        isDark
                          ? 'bg-[#1a1208] border-[#2a1f0d]'
                          : 'bg-amber-50 border-amber-100'
                      )}
                    >
                      {/* Order header */}
                      <div className="flex items-center justify-between mb-2">
                        <span
                          className={cn(
                            'font-mono text-sm font-bold',
                            isDark ? 'text-amber-400' : 'text-amber-600'
                          )}
                        >
                          #
                          {order.serialNo ||
                            order.billSerial ||
                            order.id.slice(-8)}
                        </span>
                        <div className="flex items-center gap-2">
                          {order.paymentMethod && (
                            <Badge
                              className={cn(
                                'text-[9px] py-0 px-1.5 border-0',
                                isDark
                                  ? 'bg-blue-500/20 text-blue-400'
                                  : 'bg-blue-100 text-blue-600'
                              )}
                            >
                              {order.paymentMethod}
                            </Badge>
                          )}
                          <span
                            className={cn(
                              'text-xs',
                              isDark ? 'text-gray-400' : 'text-gray-500'
                            )}
                          >
                            {fmtDate(order.createdAt || order.savedAt)}
                          </span>
                        </div>
                      </div>

                      {/* Items */}
                      <div className="space-y-1 mb-2">
                        {(order.items || []).slice(0, 10).map((item, i) => (
                          <div
                            key={i}
                            className="flex justify-between text-xs"
                          >
                            <span
                              className={cn(
                                isDark ? 'text-gray-300' : 'text-gray-700'
                              )}
                            >
                              {item.productName ||
                                item.name ||
                                `Item ${item.serialId || i + 1}`}
                            </span>
                            <span
                              className={cn(
                                'font-medium',
                                isDark ? 'text-gray-200' : 'text-gray-800'
                              )}
                            >
                              {item.qty || item.quantity || 1} × Rs{' '}
                              {Number(
                                item.price || item.salePrice || 0
                              ).toLocaleString()}
                              {' = '}
                              <span
                                className={cn(
                                  isDark
                                    ? 'text-emerald-400'
                                    : 'text-emerald-600'
                                )}
                              >
                                Rs{' '}
                                {Number(
                                  item.total ||
                                    (item.price || item.salePrice || 0) *
                                      (item.qty || item.quantity || 1)
                                ).toLocaleString()}
                              </span>
                            </span>
                          </div>
                        ))}
                        {(order.items || []).length > 10 && (
                          <p className="text-xs text-gray-500 italic">
                            +{order.items.length - 10} more items...
                          </p>
                        )}
                      </div>

                      {/* Discount row */}
                      {Number(order.discount || 0) > 0 && (
                        <div
                          className={cn(
                            'flex justify-between text-xs border-t pt-1',
                            isDark
                              ? 'border-[#2a1f0d] text-red-400'
                              : 'border-amber-200 text-red-500'
                          )}
                        >
                          <span>Discount</span>
                          <span>-Rs {Number(order.discount).toLocaleString()}</span>
                        </div>
                      )}

                      {/* Total */}
                      <div
                        className={cn(
                          'flex justify-between text-sm font-bold border-t pt-2 mt-1',
                          isDark
                            ? 'border-[#2a1f0d] text-white'
                            : 'border-amber-200 text-gray-900'
                        )}
                      >
                        <span>Total</span>
                        <span
                          className={cn(
                            isDark ? 'text-emerald-400' : 'text-emerald-600'
                          )}
                        >
                          {fmt(
                            order.grandTotal || order.totalAmount || order.total
                          )}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            <div
              className={cn(
                'p-3 text-center text-xs border-t shrink-0',
                isDark
                  ? 'text-gray-500 border-[#2a1f0d]'
                  : 'text-gray-400 border-amber-100'
              )}
            >
              Showing {viewOrders.length} orders
              {viewOrders.length >= 200 && ' (max 200)'}
            </div>
          </div>
        </div>
      )}

      {/* ── PAGE HEADER ────────────────────────────────── */}
      <PageHeader
        icon={UserCheck}
        title="Customer Database"
        description={`${customers.length} customers • ${stats.totalOrders.toLocaleString()} orders processed`}
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <SyncStatusBar />
            <Button
              variant="ghost"
              leftIcon={
                syncing ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4" />
                )
              }
              onClick={forceRefresh}
              disabled={syncing || loading}
            >
              {syncing ? 'Syncing...' : 'Refresh'}
            </Button>
            <Button
              variant="primary"
              leftIcon={<Download className="w-4 h-4" />}
              onClick={handleExport}
              disabled={filtered.length === 0}
            >
              Export CSV
            </Button>
          </div>
        }
      />

      {/* ── STAT CARDS ─────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
        <StatCard
          label="Total Profiles"
          value={stats.total}
          icon={Users}
          color="amber"
        />
        <StatCard
          label="With Phone"
          value={stats.withPhone}
          icon={Phone}
          color="green"
        />
        <StatCard
          label="Walk-in Sales"
          value={fmt(stats.walkinSales)}
          icon={ShoppingBag}
          color="blue"
        />
        <StatCard
          label="Registered Sales"
          value={fmt(stats.registeredSales)}
          icon={Wallet}
          color="purple"
        />
      </div>

      {/* ── FILTERS ────────────────────────────────────── */}
      <div
        className={cn(
          'rounded-2xl border mb-4 p-4',
          isDark
            ? 'bg-[#0f0a05] border-[#2a1f0d]'
            : 'bg-white border-amber-200'
        )}
      >
        <div className="flex flex-col sm:flex-row gap-3">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, phone, city, email..."
            leftIcon={<Search className="w-4 h-4" />}
            className="flex-1"
          />

          <select
            value={cityFilter}
            onChange={(e) => setCityFilter(e.target.value)}
            className={cn(
              'rounded-xl border px-3 py-2 text-sm min-w-[140px]',
              isDark
                ? 'bg-[#1a1208] border-[#2a1f0d] text-white'
                : 'bg-white border-amber-200 text-gray-800'
            )}
          >
            <option value="">All Cities</option>
            {cities.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          <select
            value={`${sortKey}:${sortDir}`}
            onChange={(e) => {
              const [k, d] = e.target.value.split(':');
              setSortKey(k);
              setSortDir(d);
            }}
            className={cn(
              'rounded-xl border px-3 py-2 text-sm min-w-[160px]',
              isDark
                ? 'bg-[#1a1208] border-[#2a1f0d] text-white'
                : 'bg-white border-amber-200 text-gray-800'
            )}
          >
            {SORT_OPTIONS.map((o, i) => (
              <option key={i} value={`${o.key}:${o.dir}`}>
                Sort: {o.label}
              </option>
            ))}
          </select>

          {(search || cityFilter) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearch('');
                setCityFilter('');
              }}
            >
              <X className="w-4 h-4 mr-1" /> Clear
            </Button>
          )}
        </div>

        <p
          className={cn(
            'text-xs mt-2',
            isDark ? 'text-gray-500' : 'text-gray-400'
          )}
        >
          Showing {paginated.length} of {filtered.length} customers
          {search ? ` matching "${search}"` : ''}
          {!isOnline && ' (offline mode)'}
        </p>
      </div>

      {/* ── TABLE ──────────────────────────────────────── */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-16">
          <Loader2 className="w-10 h-10 animate-spin text-amber-500 mb-4" />
          <p
            className={cn(
              'text-sm',
              isDark ? 'text-gray-400' : 'text-gray-500'
            )}
          >
            Loading customer data & orders...
          </p>
          <p className="text-xs text-gray-500 mt-1">
            {allOrders.length > 0
              ? `${allOrders.length.toLocaleString()} orders loaded so far...`
              : 'Connecting to Firebase...'}
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={UserCheck}
          title="No customers found"
          description={
            search || cityFilter
              ? 'Try adjusting your search or filters'
              : 'No customer data available'
          }
        />
      ) : (
        <>
          {/* Desktop Table */}
          <div
            className={cn(
              'rounded-2xl border overflow-hidden hidden md:block',
              isDark
                ? 'bg-[#0f0a05] border-[#2a1f0d]'
                : 'bg-white border-amber-200'
            )}
          >
            <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead
                  className={cn(
                    'sticky top-0 z-10',
                    isDark ? 'bg-[#1a1208]' : 'bg-amber-50'
                  )}
                >
                  <tr
                    className={cn(
                      isDark ? 'text-gray-400' : 'text-gray-600'
                    )}
                  >
                    <th className="text-start px-4 py-3 w-12" />
                    <th className="text-start px-4 py-3 font-semibold">
                      <button
                        onClick={() => handleSort('name')}
                        className="hover:text-amber-500 transition-colors"
                      >
                        Customer <SortIcon k="name" />
                      </button>
                    </th>
                    <th className="text-start px-4 py-3 font-semibold">
                      Contact
                    </th>
                    <th
                      className="text-end px-4 py-3 font-semibold cursor-pointer hover:text-amber-500 transition-colors"
                      onClick={() => handleSort('purchaseCount')}
                    >
                      Orders <SortIcon k="purchaseCount" />
                    </th>
                    <th
                      className="text-end px-4 py-3 font-semibold cursor-pointer hover:text-amber-500 transition-colors"
                      onClick={() => handleSort('totalSpent')}
                    >
                      Total Spent <SortIcon k="totalSpent" />
                    </th>
                    <th
                      className="text-end px-4 py-3 font-semibold cursor-pointer hover:text-amber-500 transition-colors"
                      onClick={() => handleSort('lastOrderDate')}
                    >
                      Last Order <SortIcon k="lastOrderDate" />
                    </th>
                    <th className="text-end px-4 py-3 font-semibold">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {paginated.map((c) => (
                    <tr
                      key={c.id}
                      className={cn(
                        'border-t transition-colors',
                        isDark
                          ? 'border-[#2a1f0d] hover:bg-[#1a1208]/50'
                          : 'border-amber-100 hover:bg-amber-50/50',
                        c.isWalkin &&
                          (isDark ? 'bg-[#1a1208]' : 'bg-blue-50/30'),
                        deletingId === c.id && 'opacity-50'
                      )}
                    >
                      {/* Avatar */}
                      <td className="px-4 py-3">
                        <div
                          className={cn(
                            'w-10 h-10 rounded-full font-bold flex items-center',
                            'justify-center text-white text-sm',
                            c.isWalkin
                              ? 'bg-gradient-to-br from-blue-400 to-blue-600'
                              : 'bg-gradient-to-br from-amber-400 to-amber-600'
                          )}
                        >
                          {c.isWalkin
                            ? 'W'
                            : (c.name || '?')[0].toUpperCase()}
                        </div>
                      </td>

                      {/* Name */}
                      <td className="px-4 py-3">
                        <div className="flex flex-col">
                          <span
                            className={cn(
                              'font-bold text-base flex items-center gap-2',
                              isDark ? 'text-white' : 'text-gray-900'
                            )}
                          >
                            {c.name}
                            {c.isWalkin && (
                              <Badge className="text-[10px] py-0 px-1.5 bg-blue-500/20 text-blue-500 border-0">
                                MASTER
                              </Badge>
                            )}
                            {c.isAutoNamed && !c.isWalkin && (
                              <Badge className="text-[10px] py-0 px-1.5 bg-gray-500/20 text-gray-400 border-0">
                                AUTO
                              </Badge>
                            )}
                          </span>
                          <span className="text-xs text-gray-500 mt-0.5">
                            {c.isWalkin
                              ? 'Aggregated'
                              : `...${c.id.slice(-8)}`}
                          </span>
                        </div>
                      </td>

                      {/* Contact */}
                      <td className="px-4 py-3">
                        <div className="space-y-1 text-sm">
                          <div
                            className={cn(
                              'flex items-center gap-2',
                              isDark ? 'text-gray-300' : 'text-gray-700'
                            )}
                          >
                            <Phone className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                            <span>{c.phone || '—'}</span>
                          </div>
                          <div
                            className={cn(
                              'flex items-center gap-2',
                              isDark ? 'text-gray-300' : 'text-gray-700'
                            )}
                          >
                            <MapPin className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                            <span>{c.city || '—'}</span>
                          </div>
                        </div>
                      </td>

                      {/* Orders */}
                      <td
                        className={cn(
                          'px-4 py-3 text-end font-semibold text-base',
                          isDark ? 'text-gray-200' : 'text-gray-800'
                        )}
                      >
                        {c.purchaseCount.toLocaleString()}
                      </td>

                      {/* Spent */}
                      <td
                        className={cn(
                          'px-4 py-3 text-end font-bold text-base',
                          isDark ? 'text-emerald-400' : 'text-emerald-600'
                        )}
                      >
                        {fmt(c.totalSpent)}
                      </td>

                      {/* Last order */}
                      <td
                        className={cn(
                          'px-4 py-3 text-end text-sm',
                          isDark ? 'text-gray-400' : 'text-gray-500'
                        )}
                      >
                        {fmtDate(c.lastOrderDate)}
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3 text-end">
                        <div className="inline-flex gap-1 justify-end">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => viewCustomerOrders(c)}
                            title="View Orders"
                          >
                            <Eye className="w-4 h-4 text-sky-500" />
                          </Button>
                          {!c.isWalkin && (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => openEdit(c)}
                                title="Edit"
                              >
                                <Edit className="w-4 h-4 text-amber-500" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() =>
                                  handleDelete(c.id, c.isWalkin)
                                }
                                disabled={deletingId === c.id}
                                title="Delete"
                              >
                                {deletingId === c.id ? (
                                  <Loader2 className="w-4 h-4 animate-spin text-rose-400" />
                                ) : (
                                  <Trash2 className="w-4 h-4 text-rose-500" />
                                )}
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Table Footer */}
            <div
              className={cn(
                'p-3 text-center text-xs border-t',
                isDark
                  ? 'text-gray-500 border-[#2a1f0d]'
                  : 'text-gray-400 border-amber-100'
              )}
            >
              {filtered.length} customers •{' '}
              {stats.totalOrders.toLocaleString()} orders loaded
              {!isOnline && ' • Offline mode'}
            </div>
          </div>

          {/* ── MOBILE CARDS ─────────────────────────────── */}
          <div className="md:hidden space-y-3">
            {paginated.map((c) => (
              <div
                key={c.id}
                className={cn(
                  'rounded-xl border p-4',
                  isDark
                    ? 'bg-[#1a1208] border-[#2a1f0d]'
                    : 'bg-white border-amber-200',
                  c.isWalkin &&
                    (isDark ? 'border-blue-500/30' : 'border-blue-300'),
                  deletingId === c.id && 'opacity-50'
                )}
              >
                {/* Top row */}
                <div className="flex items-center gap-3 mb-3">
                  <div
                    className={cn(
                      'w-11 h-11 rounded-full font-bold flex items-center',
                      'justify-center text-white text-sm shrink-0',
                      c.isWalkin
                        ? 'bg-gradient-to-br from-blue-400 to-blue-600'
                        : 'bg-gradient-to-br from-amber-400 to-amber-600'
                    )}
                  >
                    {c.isWalkin ? 'W' : (c.name || '?')[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p
                        className={cn(
                          'font-bold truncate',
                          isDark ? 'text-white' : 'text-gray-900'
                        )}
                      >
                        {c.name}
                      </p>
                      {c.isWalkin && (
                        <Badge className="text-[9px] py-0 px-1 bg-blue-500/20 text-blue-500 border-0 shrink-0">
                          MASTER
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 truncate">
                      {c.phone || 'No phone'} • {c.city || 'No city'}
                    </p>
                  </div>
                </div>

                {/* Stats grid */}
                <div className="grid grid-cols-3 gap-2 mb-3">
                  <div
                    className={cn(
                      'rounded-lg p-2 text-center',
                      isDark ? 'bg-[#0f0a05]' : 'bg-amber-50'
                    )}
                  >
                    <p className="text-[9px] text-gray-500 uppercase">
                      Orders
                    </p>
                    <p
                      className={cn(
                        'text-sm font-bold',
                        isDark ? 'text-white' : 'text-gray-900'
                      )}
                    >
                      {c.purchaseCount.toLocaleString()}
                    </p>
                  </div>
                  <div
                    className={cn(
                      'rounded-lg p-2 text-center',
                      isDark ? 'bg-emerald-500/5' : 'bg-emerald-50'
                    )}
                  >
                    <p className="text-[9px] text-gray-500 uppercase">
                      Spent
                    </p>
                    <p
                      className={cn(
                        'text-sm font-bold',
                        isDark ? 'text-emerald-400' : 'text-emerald-600'
                      )}
                    >
                      {fmt(c.totalSpent)}
                    </p>
                  </div>
                  <div
                    className={cn(
                      'rounded-lg p-2 text-center',
                      isDark ? 'bg-[#0f0a05]' : 'bg-gray-50'
                    )}
                  >
                    <p className="text-[9px] text-gray-500 uppercase">
                      Last
                    </p>
                    <p
                      className={cn(
                        'text-xs font-medium',
                        isDark ? 'text-gray-300' : 'text-gray-700'
                      )}
                    >
                      {fmtDate(c.lastOrderDate)}
                    </p>
                  </div>
                </div>

                {/* Action buttons */}
                <div className="flex gap-2">
                  <button
                    onClick={() => viewCustomerOrders(c)}
                    className={cn(
                      'flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium',
                      isDark
                        ? 'bg-sky-500/10 text-sky-400'
                        : 'bg-sky-50 text-sky-600'
                    )}
                  >
                    <Eye className="w-3.5 h-3.5" /> Orders
                  </button>
                  {!c.isWalkin && (
                    <>
                      <button
                        onClick={() => openEdit(c)}
                        className={cn(
                          'flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium',
                          isDark
                            ? 'bg-amber-500/10 text-amber-400'
                            : 'bg-amber-50 text-amber-600'
                        )}
                      >
                        <Edit className="w-3.5 h-3.5" /> Edit
                      </button>
                      <button
                        onClick={() => handleDelete(c.id, c.isWalkin)}
                        disabled={deletingId === c.id}
                        className={cn(
                          'px-3 flex items-center justify-center py-2 rounded-lg text-xs font-medium',
                          isDark
                            ? 'bg-rose-500/10 text-rose-400'
                            : 'bg-rose-50 text-rose-600'
                        )}
                      >
                        {deletingId === c.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* ── PAGINATION ───────────────────────────────── */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-6">
              <Button
                variant="ghost"
                size="sm"
                disabled={page === 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>

              {Array.from(
                { length: Math.min(7, totalPages) },
                (_, i) => {
                  let p;
                  if (totalPages <= 7) {
                    p = i + 1;
                  } else if (page <= 4) {
                    p = i + 1;
                  } else if (page >= totalPages - 3) {
                    p = totalPages - 6 + i;
                  } else {
                    p = page - 3 + i;
                  }
                  return (
                    <button
                      key={p}
                      onClick={() => setPage(p)}
                      className={cn(
                        'w-8 h-8 rounded-lg text-sm font-medium transition-colors',
                        page === p
                          ? 'bg-amber-500 text-white'
                          : isDark
                          ? 'text-gray-400 hover:bg-white/10'
                          : 'text-gray-600 hover:bg-amber-50'
                      )}
                    >
                      {p}
                    </button>
                  );
                }
              )}

              <Button
                variant="ghost"
                size="sm"
                disabled={page === totalPages}
                onClick={() =>
                  setPage((p) => Math.min(totalPages, p + 1))
                }
              >
                <ChevronRight className="w-4 h-4" />
              </Button>

              <span
                className={cn(
                  'text-xs ml-2',
                  isDark ? 'text-gray-500' : 'text-gray-400'
                )}
              >
                Page {page} of {totalPages}
              </span>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default CustomersControl;