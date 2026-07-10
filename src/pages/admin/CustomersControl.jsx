// src/pages/admin/CustomersControl.jsx
// ✅ PRODUCTION READY — Firebase Live Sync + Offline/Online Support

import { useState, useEffect, useCallback, useMemo, useRef, startTransition } from 'react';
import {
  UserCheck, Search, Phone, MapPin, Download,
  ShoppingBag, Edit, Trash2, X, Filter,
  ChevronUp, ChevronDown, RefreshCw, Eye,
  Calendar, TrendingUp, Users, Wallet,
  Wifi, WifiOff, Loader2, AlertTriangle,
  ChevronLeft, ChevronRight, MoreHorizontal,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import {
  searchCustomers,
  browseCustomers,
  loadCustomerOrders,
  loadOrdersForCustomerMetrics,
  backfillCustomerPersonaBatch,
  CUSTOMER_SEARCH_PAGE_SIZE,
  deleteCustomerById,
  updateCustomerFields,
} from '../../services/customerAdminService';
import { cn } from '../../utils/cn';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import PageHeader from '../../components/admin/PageHeader';
import EmptyState from '../../components/admin/EmptyState';
import StatCard from '../../components/admin/StatCard';
import Badge from '../../components/ui/Badge';
import { useLanguage } from '../../hooks/useLanguage';
import { isWalkIn, phoneDigitsKey, isAutoNumberName, getCustomerDisplayName } from '../../utils/customerHelpers';
import { mapCustomerRowPersona, applyCustomerFilters, countCustomerFilters } from '../../utils/customerFilterUtils';
import CustomerGlassFilterPanel from '../../components/shared/CustomerGlassFilterPanel';
import CustomerPersonaDetailPanel from '../../components/shared/CustomerPersonaDetailPanel';
import {
  customersTableShell, customersTableHead, customersTableRow, customersTh, customersTd,
  glassActionBtn,
} from '../../components/shared/customerTableTheme';
import PaginationBar from '../../components/ui/PaginationBar';
import { glassIcon } from '../../components/shared/glassUiTheme';
import useStoresMap, {
  buildStoreIdAliases,
  orderMatchesStore,
  resolveStoreName,
  getStoreDisplayName,
  resolveEffectiveStoreId,
} from '../../hooks/useStoresMap';

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════
const fmt = (v) => `Rs ${Number(v || 0).toLocaleString()}`;

const isWalkinCustomerRecord = (cust) => {
  if (cust?.isWalking === true) return true;
  const name = (cust?.name || '').trim();
  const phone = (cust?.phone || cust?.phoneNormalized || '').trim();
  return isWalkIn({ name, phone });
};

const getCustomerType = (cust) => {
  if (cust?.isWalkin || cust?.customerType === 'walkin') return 'walkin';
  const name = (cust?.name || '').trim();
  if (isAutoNumberName(name) || cust?.isAutoNamed) return 'auto';
  if (isWalkIn({ name, phone: cust?.phone || '' })) return 'walkin';
  return 'registered';
};

const TYPE_BADGE = {
  walkin: { label: 'Walk-in', cls: 'bg-blue-500/15 text-blue-500' },
  auto: { label: 'Phone-only', cls: 'bg-violet-500/15 text-violet-400' },
  registered: { label: 'Named', cls: 'bg-emerald-500/15 text-emerald-500' },
};

const PERSONA_BADGE = {
  vip: { label: 'VIP', cls: 'bg-amber-500/20 text-amber-400' },
  repeat: { label: 'Repeat', cls: 'bg-sky-500/15 text-sky-400' },
  credit: { label: 'Credit', cls: 'bg-orange-500/15 text-orange-400' },
  inactive: { label: 'Inactive', cls: 'bg-gray-500/15 text-gray-400' },
  recovery: { label: 'Recovery', cls: 'bg-rose-500/15 text-rose-400' },
};

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

const getCustomerStoreId = (cust) => String(cust?.storeId || 'default').trim() || 'default';

const getOrderStoreId = (order) =>
  String(order?.storeId || order?.branchId || 'default').trim() || 'default';

const recordMatchesBranch = (recordStoreId, aliases) => {
  if (!aliases) return true;
  const sid = String(recordStoreId || 'default').trim() || 'default';
  const set = aliases instanceof Set ? aliases : new Set([...(aliases || [])].filter(Boolean));
  if (!set.size) return true;
  if (set.has(sid)) return true;
  const lower = sid.toLowerCase();
  for (const a of set) {
    if (String(a).toLowerCase() === lower) return true;
  }
  return false;
};

/** When duplicate Customer N labels exist in one branch, renumber for display. */
const reconcileBranchAutoNames = (rows) => {
  const walkin = rows.filter((r) => r.isWalkin);
  const rest = rows.filter((r) => !r.isWalkin);
  const byStore = new Map();

  rest.forEach((r) => {
    const sid = r.storeId || 'default';
    if (!byStore.has(sid)) byStore.set(sid, []);
    byStore.get(sid).push(r);
  });

  const out = [...walkin];
  byStore.forEach((storeRows) => {
    const autoRows = storeRows.filter((r) => {
      const pk = phoneDigitsKey(r.phone);
      return pk.length >= 10 && (isAutoNumberName(r.name) || r.isAutoNamed);
    });
    const counts = {};
    autoRows.forEach((r) => {
      const n = (r.name || '').trim().toLowerCase();
      counts[n] = (counts[n] || 0) + 1;
    });
    const hasDup = Object.values(counts).some((n) => n > 1);
    if (hasDup) {
      autoRows.sort(
        (a, b) =>
          getTimestamp(a.createdAt || a.lastOrderDate) -
          getTimestamp(b.createdAt || b.lastOrderDate)
      );
      autoRows.forEach((r, i) => {
        r.name = `Customer ${i + 1}`;
      });
    }
    out.push(...storeRows);
  });
  return out;
};

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
  if (info.phone && info.phone.length >= 7) return false;
  const name = (info.name || '').replace(/\s+/g, ' ').trim();
  if (!name) return true;
  return isWalkIn({ name, phone: '' });
};

const SORT_OPTIONS = [
  { key: 'totalSpent', label: 'Total Spent', dir: 'desc' },
  { key: 'purchaseCount', label: 'Total Orders', dir: 'desc' },
  { key: 'name', label: 'Name A→Z', dir: 'asc' },
  { key: 'name', label: 'Name Z→A', dir: 'desc' },
  { key: 'lastOrderDate', label: 'Last Purchase', dir: 'desc' },
];

const DEFAULT_PAGE_SIZE = 50;

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
  const { user } = useAuth();
  const isOnline = useOnlineStatus();
  const { t, isRTL } = useLanguage();
  const storesMap = useStoresMap();

  // ── Data state ─────────────────────────────────────────────
  const [customers, setCustomers] = useState([]);
  const [rawCustomerDocs, setRawCustomerDocs] = useState([]);
  const [orderSnapshot, setOrderSnapshot] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchLastDoc, setSearchLastDoc] = useState(null);
  const [searchHasMore, setSearchHasMore] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState(null);
  const [dataSource, setDataSource] = useState('idle');

  // ── Filter / sort state ────────────────────────────────────
  const [search, setSearch] = useState('');
  const [branchFilter, setBranchFilter] = useState('all');
  const [cityFilter, setCityFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [visitFilter, setVisitFilter] = useState('all');
  const [personaFilter, setPersonaFilter] = useState('all');
  const [sortKey, setSortKey] = useState('totalSpent');
  const [sortDir, setSortDir] = useState('desc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  // ── UI state ───────────────────────────────────────────────
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [editForm, setEditForm] = useState({ name: '', phone: '', city: '' });
  const [editSaving, setEditSaving] = useState(false);
  const [viewingCustomer, setViewingCustomer] = useState(null);
  const [viewOrders, setViewOrders] = useState([]);
  const [viewLoading, setViewLoading] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  // ── Refs ───────────────────────────────────────────────────
  const searchTimerRef = useRef(null);
  const customersLoadedRef = useRef(false);
  const customerDocsRef = useRef([]);
  const backfillRanRef = useRef(false);

  const branchAliases = useMemo(() => {
    if (branchFilter === 'all') return null;
    return buildStoreIdAliases(branchFilter, storesMap);
  }, [branchFilter, storesMap]);

  const branches = useMemo(
    () =>
      Object.values(storesMap || {}).sort((a, b) =>
        getStoreDisplayName(a).localeCompare(getStoreDisplayName(b))
      ),
    [storesMap]
  );

  // ═══════════════════════════════════════════════════════════
  // PROCESS ORDERS → BUILD CUSTOMER METRICS
  // ═══════════════════════════════════════════════════════════
  const processOrdersIntoMetrics = useCallback((orders) => {
    const emptyMetric = () => ({ count: 0, spent: 0, lastDate: null, firstDate: null });
    const bumpOrderMetric = (bucket, orderDate, total) => {
      bucket.count += 1;
      bucket.spent += total;
      const ts = getTimestamp(orderDate);
      if (!bucket.firstDate || ts < getTimestamp(bucket.firstDate)) {
        bucket.firstDate = orderDate;
      }
      if (ts > getTimestamp(bucket.lastDate)) {
        bucket.lastDate = orderDate;
      }
    };

    const metricsById = {};
    const metricsByPhone = {};
    const walkinMetrics = emptyMetric();

    orders.forEach((order) => {
      if (order.isDeleted || order.deleted) return;

      const total = Number(
        order.grandTotal || order.totalAmount || order.total || 0
      );
      const info = getOrderCustomerInfo(order);
      const orderDate = order.createdAt || order.savedAt || null;

      if (isWalkinOrder(info)) {
        bumpOrderMetric(walkinMetrics, orderDate, total);
        return;
      }

      if (info.id) {
        if (!metricsById[info.id]) metricsById[info.id] = emptyMetric();
        bumpOrderMetric(metricsById[info.id], orderDate, total);
      }

      const phoneKey = info.phone ? phoneDigitsKey(info.phone) : '';
      if (phoneKey && phoneKey.length >= 10) {
        if (!metricsByPhone[phoneKey]) metricsByPhone[phoneKey] = emptyMetric();
        bumpOrderMetric(metricsByPhone[phoneKey], orderDate, total);
      }
    });

    return { metricsById, metricsByPhone, walkinMetrics };
  }, []);

  // ═══════════════════════════════════════════════════════════
  // BUILD FINAL CUSTOMER LIST
  // ═══════════════════════════════════════════════════════════
  const buildCustomerList = useCallback(
    (customerDocs, orders, { branchAliases: aliases, storesMap: sm, branchFilter: bf } = {}) => {
      const scopedOrders = aliases
        ? orders.filter((o) => orderMatchesStore(o, aliases))
        : orders;
      const scopedDocs = aliases
        ? customerDocs.filter((c) => recordMatchesBranch(getCustomerStoreId(c), aliases))
        : customerDocs;

      const { metricsById, metricsByPhone, walkinMetrics } =
        processOrdersIntoMetrics(scopedOrders);

      const normalCustomers = [];
      const docPhones = new Set();
      const docIds = new Set();

      const branchSid = (rawSid) =>
        resolveEffectiveStoreId(rawSid, sm || {}) || rawSid || 'default';

      const dedupeCustomerDocs = (docs) => {
        const byKey = new Map();
        const noPhone = [];
        docs.forEach((cust) => {
          if (isWalkinCustomerRecord(cust)) return;
          const sid = branchSid(getCustomerStoreId(cust));
          const key = phoneDigitsKey(cust.phone || cust.phoneNormalized);
          const dedupeKey = key.length >= 10 ? `${sid}:${key}` : `id:${cust.id}`;
          if (key.length < 10) {
            noPhone.push(cust);
            return;
          }
          if (!byKey.has(dedupeKey)) {
            byKey.set(dedupeKey, cust);
            return;
          }
          const prev = byKey.get(dedupeKey);
          const pick = getTimestamp(prev.createdAt) <= getTimestamp(cust.createdAt) ? prev : cust;
          byKey.set(dedupeKey, pick);
        });
        return [...byKey.values(), ...noPhone];
      };

      dedupeCustomerDocs(scopedDocs).forEach((cust) => {
        if (isWalkinCustomerRecord(cust)) return;

        const name = cust.name || 'Unknown';
        const phone = normalizePhone(cust.phone || cust.phoneNormalized || '');
        const sid = branchSid(getCustomerStoreId(cust));
        const phoneKey = phone.length >= 7 ? phoneDigitsKey(phone) : '';
        if (phoneKey) docPhones.add(`${sid}:${phoneKey}`);
        if (cust.id) docIds.add(cust.id);

        const m =
          metricsById[cust.id] ||
          (phoneKey ? metricsByPhone[phoneKey] : null) ||
          { count: 0, spent: 0, lastDate: null, firstDate: null };

        const row = mapCustomerRowPersona({
          id: cust.id,
          name,
          phone: cust.phone || cust.phoneNormalized || '',
          city: cust.city || '',
          market: cust.market || '',
          email: cust.email || '',
          storeId: sid,
          branchName: resolveStoreName(sid, sm || {}, sid),
          isAutoNamed: cust.isAutoNamed || isAutoNumberName(name),
          createdAt: cust.createdAt || null,
          isWalkin: false,
          fromOrdersOnly: false,
          ...cust,
        }, m);
        row.customerType = getCustomerType(row);
        normalCustomers.push(row);
      });

      // Orders-only profiles (Customer 1,2,3… or named — not yet in customers collection)
      const orderOnlyMap = new Map();

      scopedOrders.forEach((order) => {
        if (order.isDeleted || order.deleted) return;

        const info = getOrderCustomerInfo(order);
        if (isWalkinOrder(info)) return;

        const rawName = (
          order.customer?.name ||
          order.customerName ||
          ''
        ).trim();
        const phone = normalizePhone(
          order.customer?.phone ||
          order.customerPhone ||
          order.customer?.phoneNormalized ||
          ''
        );
        const orderStoreId = branchSid(getOrderStoreId(order));
        const phoneKey = phone.length >= 7 ? phoneDigitsKey(phone) : '';
        const docKey = phoneKey ? `${orderStoreId}:${phoneKey}` : '';

        if (!rawName && !phone) return;
        if (info.id && docIds.has(info.id)) return;
        if (docKey && docPhones.has(docKey)) return;

        const key = phoneKey
          ? `p:${orderStoreId}:${phoneKey}`
          : `n:${orderStoreId}:${rawName.toLowerCase()}`;
        const total = Number(
          order.grandTotal || order.totalAmount || order.total || 0
        );
        const orderDate = order.createdAt || order.savedAt || null;

        if (orderOnlyMap.has(key)) {
          const ex = orderOnlyMap.get(key);
          ex.purchaseCount += 1;
          ex.totalSpent += total;
          const ts = getTimestamp(orderDate);
          if (ts > getTimestamp(ex.lastOrderDate)) ex.lastOrderDate = orderDate;
          return;
        }

        const row = mapCustomerRowPersona({
          id: `order-only-${key.replace(/[^a-z0-9]/gi, '_')}`,
          name: rawName || (phone ? `Customer (${phone})` : 'Unknown'),
          phone: order.customer?.phone || order.customerPhone || phone,
          city: order.customer?.city || '',
          market: order.customer?.market || '',
          email: '',
          storeId: orderStoreId,
          branchName: resolveStoreName(orderStoreId, sm || {}, orderStoreId),
          isAutoNamed: isAutoNumberName(rawName),
          createdAt: null,
          isWalkin: false,
          fromOrdersOnly: true,
        }, { count: 1, spent: total, lastDate: orderDate });
        row.customerType = getCustomerType(row);
        orderOnlyMap.set(key, row);
      });

      normalCustomers.push(...orderOnlyMap.values());

      const branchLabel = aliases
        ? resolveStoreName(bf, sm || {}, 'Branch')
        : 'All Branches';

      const masterWalkin = {
        id: 'virtual-walkin',
        name: 'Walk-in Customer',
        phone: '',
        city: branchLabel,
        market: '',
        email: '',
        storeId: aliases ? (resolveEffectiveStoreId(bf, sm || {}) || bf) : '',
        branchName: branchLabel,
        isWalkin: true,
        customerType: 'walkin',
        isAutoNamed: false,
        fromOrdersOnly: false,
        createdAt: null,
        purchaseCount: walkinMetrics.count,
        totalSpent: walkinMetrics.spent,
        lastOrderDate: walkinMetrics.lastDate,
      };

      return reconcileBranchAutoNames([masterWalkin, ...normalCustomers]);
    },
    [processOrdersIntoMetrics]
  );

  const branchScopeId = useMemo(() => {
    if (branchFilter === 'all') return null;
    return resolveEffectiveStoreId(branchFilter, storesMap) || branchFilter;
  }, [branchFilter, storesMap]);

  const runCustomerSearch = useCallback(async (term, cursor = null) => {
    const q = String(term || '').trim();

    setSearchLoading(true);
    setSyncing(true);
    try {
      const scopeId = branchScopeId;
      const useSearch = q.length >= 3;
      const { customers: rows, lastDoc, hasMore } = useSearch
        ? await searchCustomers({
          term: q,
          storeId: scopeId,
          branchId: scopeId,
          cursor,
          pageSize: CUSTOMER_SEARCH_PAGE_SIZE,
        })
        : await browseCustomers({
          storeId: scopeId,
          branchId: scopeId,
          cursor,
        });

      customerDocsRef.current = cursor
        ? [...(customerDocsRef.current || []), ...rows]
        : rows;
      setRawCustomerDocs(customerDocsRef.current);
      customersLoadedRef.current = true;
      setSearchLastDoc(lastDoc);
      setSearchHasMore(hasMore);
      setDataSource('server');
      setLastSyncTime(new Date());
    } catch (err) {
      console.error('[Customers] search error:', err);
      toast.error('Failed to load customers');
    } finally {
      setSearchLoading(false);
      setSyncing(false);
      setLoading(false);
    }
  }, [branchScopeId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const orders = await loadOrdersForCustomerMetrics({
        storeId: branchScopeId,
      });
      if (!cancelled) setOrderSnapshot(orders);
    })();
    return () => { cancelled = true; };
  }, [branchScopeId, branchFilter]);

  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      customerDocsRef.current = [];
      void runCustomerSearch(search, null);
    }, 300);
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [search, branchScopeId, branchFilter, runCustomerSearch]);

  // ═══════════════════════════════════════════════════════════
  // REBUILD CUSTOMERS WHEN DATA OR BRANCH CHANGES
  // ═══════════════════════════════════════════════════════════
  useEffect(() => {
    if (!customersLoadedRef.current && rawCustomerDocs.length === 0) return;
    const builtList = buildCustomerList(rawCustomerDocs, orderSnapshot, {
      branchAliases,
      storesMap,
      branchFilter,
    });
    setCustomers(builtList);
    if (customersLoadedRef.current) {
      setLoading(false);
    }
  }, [rawCustomerDocs, orderSnapshot, branchAliases, storesMap, branchFilter, buildCustomerList]);

  useEffect(() => {
    if (backfillRanRef.current || !customers.length || !navigator.onLine) return;
    if (!orderSnapshot.length && !rawCustomerDocs.length) return;
    backfillRanRef.current = true;
    backfillCustomerPersonaBatch(customers).catch((err) => {
      console.warn('[Customers] persona backfill:', err?.message);
      backfillRanRef.current = false;
    });
  }, [customers, orderSnapshot.length, rawCustomerDocs.length]);

  // ═══════════════════════════════════════════════════════════
  // FORCE REFRESH
  // ═══════════════════════════════════════════════════════════
  const forceRefresh = useCallback(async () => {
    customerDocsRef.current = [];
    toast.success('Refreshing customers...');
    const orders = await loadOrdersForCustomerMetrics({ storeId: branchScopeId });
    setOrderSnapshot(orders);
    await runCustomerSearch(search, null);
  }, [runCustomerSearch, search, branchScopeId]);

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
  const filterCounts = useMemo(
    () => countCustomerFilters(customers, {}, { getCustomerType }),
    [customers],
  );

  const filtered = useMemo(() => {
    const list = applyCustomerFilters(customers, {
      typeFilter,
      visitFilter,
      personaFilter,
      cityFilter,
      search,
      getCustomerType,
      normalizePhone,
    });

    const walkin = list.filter((c) => c.isWalkin);
    let rest = list.filter((c) => !c.isWalkin);

    rest.sort((a, b) => {
      let av = a[sortKey] ?? '';
      let bv = b[sortKey] ?? '';
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
  }, [customers, search, cityFilter, typeFilter, visitFilter, personaFilter, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginated = useMemo(
    () => filtered.slice((page - 1) * pageSize, page * pageSize),
    [filtered, page, pageSize]
  );

  useEffect(() => {
    setPage(1);
  }, [search, cityFilter, branchFilter, typeFilter, visitFilter, personaFilter, sortKey, sortDir]);

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
    async (customer) => {
      setViewingCustomer(customer);
      setViewLoading(true);

      if (customer.isWalkin) {
        setViewOrders([]);
        setViewLoading(false);
        return;
      }

      try {
        const orders = await loadCustomerOrders({
          customerId: customer.id,
          storeId: customer.storeId || branchScopeId,
          branchId: branchScopeId,
        });
        setViewOrders(orders);
      } catch (err) {
        console.error('[Customers] view orders:', err);
        setViewOrders([]);
      } finally {
        setViewLoading(false);
      }
    },
    [branchScopeId],
  );

  // ═══════════════════════════════════════════════════════════
  // DELETE CUSTOMER
  // ═══════════════════════════════════════════════════════════
  const handleDelete = useCallback(async (id, isWalkin, fromOrdersOnly) => {
    if (isWalkin) {
      toast.error('Cannot delete master walk-in.');
      return;
    }
    if (fromOrdersOnly) {
      toast.error('This profile is from orders only — save as a customer first to delete.');
      return;
    }
    if (!window.confirm('⚠️ Customer archive ho jayega — Backup → Archive se restore ho sakta hai. Continue?')) return;

    setDeletingId(id);
    try {
      await deleteCustomerById(id, {
        deletedBy: { uid: user?.uid, email: user?.email },
        reason: 'deleted_from_customers_admin',
      });
      toast.success('Customer archive ho gaya ✓');
    } catch (e) {
      toast.error('Delete failed: ' + e.message);
    } finally {
      setDeletingId(null);
    }
  }, [user]);

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

      await updateCustomerFields(editingCustomer.id, updates);
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
        getCustomerType(c),
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
    const auto = registered.filter((c) => getCustomerType(c) === 'auto');
    return {
      total: customers.length,
      withPhone: registered.filter((c) => c.phone).length,
      autoCount: auto.length,
      walkinSales: walkin?.totalSpent || 0,
      registeredSales: registered.reduce((s, c) => s + c.totalSpent, 0),
      totalOrders: customers.reduce((s, c) => s + (c.purchaseCount || 0), 0),
    };
  }, [customers]);

  const CustomerTypeBadge = ({ customer }) => {
    const type = getCustomerType(customer);
    const badge = TYPE_BADGE[type] || TYPE_BADGE.registered;
    return (
      <Badge className={cn('text-[10px] py-0 px-1.5 border-0 shrink-0', badge.cls)}>
        {customer.isWalkin ? 'WALK-IN' : badge.label}
      </Badge>
    );
  };

  const PersonaBadges = ({ customer }) => {
    if (customer.isWalkin) return null;
    const tags = [];
    if (customer.vipStatus) tags.push(PERSONA_BADGE.vip);
    if (customer.isRepeatCustomer) tags.push(PERSONA_BADGE.repeat);
    if (customer.hasCredit || customer.pendingAmount > 0) tags.push(PERSONA_BADGE.credit);
    if (customer.inactiveStatus) tags.push(PERSONA_BADGE.inactive);
    if (customer.recoveryRiskStatus) tags.push(PERSONA_BADGE.recovery);
    if (!tags.length) return null;
    return (
      <span className="flex flex-wrap gap-1">
        {tags.map((b) => (
          <Badge key={b.label} className={cn('text-[9px] py-0 px-1 border-0', b.cls)}>{b.label}</Badge>
        ))}
      </span>
    );
  };

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
    <div dir={isRTL ? 'rtl' : 'ltr'} className="p-4 sm:p-6 max-w-[1600px] mx-auto">
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

            {/* Persona Foundation */}
            {!viewingCustomer.isWalkin && (
              <div className={cn('p-4 border-b shrink-0 overflow-y-auto max-h-[40vh]', isDark ? 'border-[#2a1f0d]' : 'border-amber-100')}>
                <CustomerPersonaDetailPanel
                  customer={viewingCustomer}
                  isDark={isDark}
                  fmt={fmt}
                  fmtDate={fmtDate}
                />
              </div>
            )}

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
        title={t('admin.customersPage.title', 'Customer Database')}
        description={t('admin.customersPage.subtitle', 'Manage customer records across all branches')}
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
              {syncing ? t('network.syncing', 'Syncing...') : t('common.refresh', 'Refresh')}
            </Button>
            <Button
              variant="primary"
              leftIcon={<Download className="w-4 h-4" />}
              onClick={handleExport}
              disabled={filtered.length === 0}
            >
              {t('admin.customersPage.exportCsv', 'Export CSV')}
            </Button>
          </div>
        }
      />

      {/* ── STAT CARDS ─────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4 mb-6">
        <StatCard
          label="Total Profiles"
          value={stats.total}
          icon={Users}
          color="amber"
        />
        <StatCard
          label="Phone-only"
          value={stats.autoCount}
          icon={UserCheck}
          color="purple"
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
          label="All Other Sales"
          value={fmt(stats.registeredSales)}
          icon={Wallet}
          color="purple"
        />
      </div>

      {/* ── FILTERS — glass dropdowns ─────────────────── */}
      <CustomerGlassFilterPanel
        search={search}
        onSearchChange={(v) => startTransition(() => setSearch(v))}
        searchLoading={searchLoading}
        branchFilter={branchFilter}
        branches={branches.map((b) => ({ id: b.id, label: getStoreDisplayName(b) || b.id }))}
        onBranchChange={(v) => startTransition(() => setBranchFilter(v))}
        cityFilter={cityFilter}
        cities={cities}
        onCityChange={(v) => startTransition(() => setCityFilter(v))}
        showCity={cities.length > 0}
        typeFilter={typeFilter}
        onTypeFilterChange={(v) => startTransition(() => setTypeFilter(v))}
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
        counts={filterCounts}
        hasActiveFilters={Boolean(
          search || cityFilter || branchFilter !== 'all' || typeFilter !== 'all'
          || visitFilter !== 'all' || personaFilter !== 'all',
        )}
        onClear={() => {
          startTransition(() => {
            setSearch('');
            setCityFilter('');
            setBranchFilter('all');
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
        className="mb-4"
      />

      {/* ── TABLE ──────────────────────────────────────── */}
      {loading || searchLoading ? (
        <div className="flex flex-col items-center justify-center py-16">
          <Loader2 className="w-10 h-10 animate-spin text-amber-500 mb-4" />
          <p
            className={cn(
              'text-sm',
              isDark ? 'text-gray-400' : 'text-gray-500'
            )}
          >
            {searchLoading ? 'Searching customers...' : 'Loading customer data...'}
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={UserCheck}
          title="No customers found"
          description={
            search.trim().length > 0 && search.trim().length < 3
              ? 'No match in loaded list — type 3+ characters for full search'
              : search || cityFilter
                ? 'Try adjusting your search or filters'
                : 'Customers will appear here when online'
          }
        />
      ) : (
        <>
          {/* Desktop Table */}
          <div className={cn(customersTableShell(isDark), 'hidden md:block')}>
            <div className="overflow-x-auto max-h-[65vh] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className={cn('sticky top-0 z-10 backdrop-blur-xl', customersTableHead(isDark))}>
                  <tr>
                    <th className={cn(customersTh(isDark), 'w-12')} />
                    <th className={customersTh(isDark)}>
                      <button type="button" onClick={() => handleSort('name')} className="hover:text-amber-400 transition-colors inline-flex items-center">
                        Customer <SortIcon k="name" />
                      </button>
                    </th>
                    <th className={cn(customersTh(isDark), 'hidden lg:table-cell')}>Type</th>
                    <th className={cn(customersTh(isDark), 'hidden md:table-cell')}>Branch</th>
                    <th className={customersTh(isDark)}>Contact</th>
                    <th className={cn(customersTh(isDark), 'text-center')}>Visits</th>
                    <th className={cn(customersTh(isDark), 'text-end hidden lg:table-cell')}>First Visit</th>
                    <th
                      className={cn(customersTh(isDark), 'text-end cursor-pointer hover:text-amber-400')}
                      onClick={() => handleSort('purchaseCount')}
                    >
                      Orders <SortIcon k="purchaseCount" />
                    </th>
                    <th
                      className={cn(customersTh(isDark), 'text-end cursor-pointer hover:text-amber-400')}
                      onClick={() => handleSort('totalSpent')}
                    >
                      Spent <SortIcon k="totalSpent" />
                    </th>
                    <th
                      className={cn(customersTh(isDark), 'text-end cursor-pointer hover:text-amber-400')}
                      onClick={() => handleSort('lastOrderDate')}
                    >
                      Last Visit <SortIcon k="lastOrderDate" />
                    </th>
                    <th className={cn(customersTh(isDark), 'text-end')}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginated.map((c) => (
                    <tr
                      key={c.id}
                      className={customersTableRow(isDark, { walkin: c.isWalkin, active: deletingId === c.id })}
                    >
                      {/* Avatar */}
                      <td className={customersTd(isDark)}>
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
                      <td className={customersTd(isDark)}>
                        <div className="flex flex-col gap-1">
                          <span
                            className={cn(
                              'font-bold text-base flex items-center gap-2 flex-wrap',
                              isDark ? 'text-white' : 'text-gray-900'
                            )}
                          >
                            {getCustomerDisplayName(c)}
                            <CustomerTypeBadge customer={c} />
                            <PersonaBadges customer={c} />
                          </span>
                          <span className="text-xs text-gray-500">
                            {c.isWalkin
                              ? 'All walk-in bills combined'
                              : isAutoNumberName(c.name)
                                ? `${c.name} · no name entered at bill`
                                : c.fromOrdersOnly
                                  ? 'From order history'
                                  : `ID …${String(c.id).slice(-8)}`}
                          </span>
                        </div>
                      </td>

                      {/* Type */}
                      <td className={cn(customersTd(isDark), 'hidden lg:table-cell')}>
                        <CustomerTypeBadge customer={c} />
                      </td>

                      {/* Branch */}
                      <td className={cn(customersTd(isDark), 'hidden md:table-cell')}>
                        <span className="text-xs text-gray-500 flex items-center gap-1 max-w-[8rem] truncate" title={c.branchName || c.storeId || ''}>
                          <MapPin className="w-3 h-3 shrink-0 text-stone-500" />
                          {c.isWalkin ? (c.branchName || 'All') : (c.branchName || c.storeId || '—')}
                        </span>
                      </td>

                      {/* Contact */}
                      <td className={customersTd(isDark)}>
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

                      {/* Visits */}
                      <td className={cn(customersTd(isDark), 'text-center')}>
                        <span className={cn(
                          'inline-flex min-w-[2rem] justify-center px-2 py-0.5 rounded-lg text-xs font-bold',
                          isDark ? 'bg-white/5 text-amber-300' : 'bg-amber-50 text-amber-700',
                        )}
                        >
                          {c.visitCount ?? c.purchaseCount ?? 0}
                        </span>
                      </td>

                      {/* First visit */}
                      <td className={cn(customersTd(isDark), 'text-end text-sm hidden lg:table-cell', isDark ? 'text-gray-400' : 'text-gray-500')}>
                        {fmtDate(c.firstVisit || c.createdAt)}
                      </td>

                      {/* Orders */}
                      <td className={cn(customersTd(isDark), 'text-end font-semibold')}>
                        {(c.purchaseCount || 0).toLocaleString()}
                      </td>

                      {/* Spent */}
                      <td className={cn(customersTd(isDark), 'text-end font-bold', isDark ? 'text-emerald-400' : 'text-emerald-600')}>
                        {fmt(c.totalSpent)}
                      </td>

                      {/* Last visit */}
                      <td className={cn(customersTd(isDark), 'text-end text-sm', isDark ? 'text-gray-400' : 'text-gray-500')}>
                        {fmtDate(c.lastVisit || c.lastOrderDate)}
                      </td>

                      {/* Actions */}
                      <td className={cn(customersTd(isDark), 'text-end')}>
                        <div className="inline-flex gap-1 justify-end">
                          <button
                            type="button"
                            onClick={() => viewCustomerOrders(c)}
                            title="View Orders"
                            className={glassActionBtn('view')}
                          >
                            <Eye className={cn('w-3.5 h-3.5', glassIcon())} />
                          </button>
                          {!c.isWalkin && !c.fromOrdersOnly && (
                            <>
                              <button
                                type="button"
                                onClick={() => openEdit(c)}
                                title="Edit"
                                className={glassActionBtn('edit')}
                              >
                                <Edit className={cn('w-3.5 h-3.5', glassIcon())} />
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  handleDelete(c.id, c.isWalkin, c.fromOrdersOnly)
                                }
                                disabled={deletingId === c.id}
                                title="Delete"
                                className={glassActionBtn('delete')}
                              >
                                {deletingId === c.id ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin text-rose-400" />
                                ) : (
                                  <Trash2 className={cn('w-3.5 h-3.5', glassIcon())} />
                                )}
                              </button>
                            </>
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
              pageSizeOptions={[20, 50, 100]}
              onPageSizeChange={(n) => {
                setPageSize(n);
                setPage(1);
              }}
              variant="glass"
            />
            {!isOnline && (
              <p className="text-center text-[10px] text-stone-600 py-1 border-t border-white/[0.04]">
                Offline mode — showing cached data
              </p>
            )}
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
                    <div className="flex items-center gap-2 flex-wrap">
                      <p
                        className={cn(
                          'font-bold truncate',
                          isDark ? 'text-white' : 'text-gray-900'
                        )}
                      >
                        {getCustomerDisplayName(c)}
                      </p>
                      <CustomerTypeBadge customer={c} />
                    </div>
                    <p className="text-xs text-gray-500 truncate">
                      {[c.branchName, c.phone || 'No phone', c.city || 'No city'].filter(Boolean).join(' · ')}
                      {c.fromOrdersOnly ? ' · from orders' : ''}
                    </p>
                  </div>
                </div>

                {/* Stats grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
                  <div
                    className={cn(
                      'rounded-lg p-2 text-center',
                      isDark ? 'bg-[#0f0a05]' : 'bg-amber-50'
                    )}
                  >
                    <p className="text-[9px] text-gray-500 uppercase">Visits</p>
                    <p className={cn('text-sm font-bold', isDark ? 'text-amber-300' : 'text-amber-700')}>
                      {c.visitCount ?? c.purchaseCount ?? 0}
                    </p>
                  </div>
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
                      {fmtDate(c.lastVisit || c.lastOrderDate)}
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
                  {!c.isWalkin && !c.fromOrdersOnly && (
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
                        onClick={() => handleDelete(c.id, c.isWalkin, c.fromOrdersOnly)}
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

          {/* Mobile pagination */}
          {totalPages > 1 && (
            <PaginationBar
              page={page}
              totalPages={totalPages}
              totalItems={filtered.length}
              pageSize={pageSize}
              onPageChange={setPage}
              compact
              variant="glass"
              className="md:hidden rounded-2xl border border-white/[0.08] mt-3"
            />
          )}
        </>
      )}
    </div>
  );
};

export default CustomersControl;