// Robust Firestore orders fetch — missing createdAt, missing composite indexes, stale PWA cache

import {
  collection, query, where, orderBy, limit, onSnapshot, getDocs, startAfter,
} from '../services/firebase';
import { db as firestore } from '../services/firebase';
import { getDocsFromServer } from 'firebase/firestore';
import { getHasInternet } from './networkReachability';
import { matchesCashierPendingQueue } from './cashierOrderUtils';
import {
  HYBRID_FALLBACK_POLL_MS,
  CASHIER_LISTENER_LIMIT,
  BILLER_TOP5_LISTENER_LIMIT,
  CASHIER_INITIAL_LIMIT,
  CASHIER_FULL_LIMIT,
  ADMIN_ORDERS_LIMIT,
  CASH_FLOW_ORDERS_LIMIT,
  PAYMENT_STATS_ORDERS_LIMIT,
  DASHBOARD_RECENT_ORDERS_LIMIT,
  BILLS_CONTROL_PAGE_SIZE,
  REPORT_PAGE_SIZE,
} from './firebaseQuotaConfig';

/** Default caps — keeps Spark quota safe (admin/manager/reports). */
export const DEFAULT_FETCH_ORDERS_LIMIT = ADMIN_ORDERS_LIMIT;
export { ADMIN_ORDERS_LIMIT, CASH_FLOW_ORDERS_LIMIT, PAYMENT_STATS_ORDERS_LIMIT, DASHBOARD_RECENT_ORDERS_LIMIT };
export { CASHIER_INITIAL_LIMIT, CASHIER_FULL_LIMIT };
export { BILLS_CONTROL_PAGE_SIZE, REPORT_PAGE_SIZE };
export { HYBRID_FALLBACK_POLL_MS };

const toDocData = (d) => ({ id: d.id, ...d.data() });

const filterCashierQueue = (rows) =>
  (rows || []).filter((o) => matchesCashierPendingQueue(o));

export const upsertOrdersIntoMap = (map, docs, normalizer) => {
  for (const d of docs) {
    const raw = toDocData(d);
    const normalized = normalizer ? normalizer(raw) : raw;
    if (normalized) map.set(d.id, normalized);
  }
};

/** Server-first fetch with plain-query fallback (no orderBy). */
export const fetchOrdersFallback = async ({
  storeId,
  storeIds = null,
  limitCount = DEFAULT_FETCH_ORDERS_LIMIT,
  normalizer,
} = {}) => {
  const results = new Map();
  const mergeSnap = (snap) => upsertOrdersIntoMap(results, snap.docs, normalizer);

  const ids = Array.isArray(storeIds) && storeIds.length > 0
    ? storeIds.slice(0, 10)
    : (storeId ? [storeId] : null);

  const runSorted = async (getDocsFn) => {
    if (ids?.length === 1) {
      const sortedQ = query(
        collection(firestore, 'orders'),
        where('storeId', '==', ids[0]),
        orderBy('createdAt', 'desc'),
        limit(limitCount),
      );
      mergeSnap(await getDocsFn(sortedQ));
    } else if (ids?.length > 1) {
      const sortedQ = query(
        collection(firestore, 'orders'),
        where('storeId', 'in', ids),
        orderBy('createdAt', 'desc'),
        limit(limitCount),
      );
      mergeSnap(await getDocsFn(sortedQ));
    } else {
      const sortedQ = query(
        collection(firestore, 'orders'),
        orderBy('createdAt', 'desc'),
        limit(limitCount),
      );
      mergeSnap(await getDocsFn(sortedQ));
    }
  };

  const runPlain = async (getDocsFn) => {
    if (ids?.length === 1) {
      const plainQ = query(
        collection(firestore, 'orders'),
        where('storeId', '==', ids[0]),
        limit(limitCount),
      );
      mergeSnap(await getDocsFn(plainQ));
    } else if (ids?.length > 1) {
      const plainQ = query(
        collection(firestore, 'orders'),
        where('storeId', 'in', ids),
        limit(limitCount),
      );
      mergeSnap(await getDocsFn(plainQ));
    } else {
      const plainQ = query(collection(firestore, 'orders'), limit(limitCount));
      mergeSnap(await getDocsFn(plainQ));
    }
  };

  if (getHasInternet()) {
    try {
      await runSorted(getDocsFromServer);
    } catch (err) {
      console.warn('[ordersQuery] server sorted fetch failed:', err?.message || err);
      try {
        await runPlain(getDocsFromServer);
      } catch (plainErr) {
        console.warn('[ordersQuery] server plain fetch failed:', plainErr?.message || plainErr);
      }
    }
  } else {
    try {
      await runPlain(getDocs);
    } catch (err) {
      console.warn('[ordersQuery] cache fetch failed:', err?.message || err);
    }
  }

  return Array.from(results.values());
};

const mergeSnapIntoMap = (map, snap, normalizer) => {
  upsertOrdersIntoMap(map, snap.docs, normalizer);
};

/** Fast server fetch — cashier pending queue only. */
export const fetchCashierPendingOrders = async ({
  storeId,
  storeIds = null,
  limitCount = CASHIER_INITIAL_LIMIT,
  sorted = true,
  normalizer,
} = {}) => {
  const results = new Map();
  const ids = Array.isArray(storeIds) && storeIds.length > 0
    ? storeIds.slice(0, 10)
    : (storeId ? [storeId] : []);

  const mergeSnap = (snap) => mergeSnapIntoMap(results, snap, normalizer);

  const runStore = async (getDocsFn, sid, useSorted) => {
    // Primary: pending_payment + createdAt — only unpaid queue (1500/day safe).
    // Fallback: newest orders — catches edge-case statuses before paymentStatus is set.
    if (useSorted) {
      try {
        mergeSnap(await getDocsFn(query(
          collection(firestore, 'orders'),
          where('storeId', '==', sid),
          where('paymentStatus', '==', 'pending_payment'),
          orderBy('createdAt', 'desc'),
          limit(limitCount),
        )));
        return;
      } catch { /* index building — broad query below */ }
      try {
        mergeSnap(await getDocsFn(query(
          collection(firestore, 'orders'),
          where('storeId', '==', sid),
          orderBy('createdAt', 'desc'),
          limit(limitCount),
        )));
        return;
      } catch { /* plain query below */ }
    }
    try {
      mergeSnap(await getDocsFn(query(
        collection(firestore, 'orders'),
        where('storeId', '==', sid),
        limit(limitCount),
      )));
    } catch { /* non-critical */ }
  };

  const run = async (getDocsFn) => {
    for (const sid of ids) {
      await runStore(getDocsFn, sid, sorted);
    }
  };

  if (getHasInternet()) {
    try { await run(getDocsFromServer); } catch { /* ignore */ }
    if (!results.size) {
      try { await run(getDocs); } catch { /* ignore */ }
    }
  } else {
    try { await run(getDocs); } catch { /* ignore */ }
  }

  return filterCashierQueue(Array.from(results.values()));
};

/** Super Admin — pending cashier queue across all branches (same logic as cashier screen). */
export const fetchElevatedAdminPendingBills = async ({
  storeIds = [],
  limitPerStore = 200,
  normalizer,
} = {}) => {
  const results = new Map();
  const ids = (storeIds || []).filter(Boolean);
  for (const sid of ids) {
    try {
      const rows = await fetchCashierPendingOrders({
        storeId: sid,
        limitCount: limitPerStore,
        sorted: true,
        normalizer,
      });
      rows.forEach((o) => results.set(o.id || o.localId, o));
    } catch { /* non-critical per branch */ }
  }
  return Array.from(results.values());
};

/** Cancelled bills for cashier tab — loaded after first paint. */
export const fetchCashierCancelledOrders = async ({
  storeId,
  storeIds = null,
  limitCount = 300,
} = {}) => {
  const results = new Map();
  const ids = Array.isArray(storeIds) && storeIds.length > 0
    ? storeIds.slice(0, 10)
    : (storeId ? [storeId] : []);

  const run = async (getDocsFn) => {
    for (const sid of ids) {
      try {
        const snap = await getDocsFn(query(
          collection(firestore, 'orders'),
          where('storeId', '==', sid),
          where('paymentStatus', '==', 'cancelled'),
          limit(limitCount),
        ));
        snap.docs.forEach((d) => results.set(d.id, { id: d.id, ...d.data() }));
      } catch { /* ignore */ }
    }
  };

  if (getHasInternet()) {
    try { await run(getDocsFromServer); } catch { /* ignore */ }
  }
  if (!results.size) {
    try { await run(getDocs); } catch { /* ignore */ }
  }
  return Array.from(results.values());
};

/**
 * Realtime listener — pending bills only (not entire store history).
 * Much faster than subscribeOrdersHybrid for 1000+ bill shops.
 */
export const subscribeCashierPendingOrders = ({
  storeId = null,
  storeIds = null,
  limitCount = CASHIER_FULL_LIMIT,
  normalizer,
  onData,
  onDelta,
  onRemoved,
  onError,
} = {}) => {
  const listenerLimit = Math.min(limitCount, CASHIER_LISTENER_LIMIT);
  let cancelled = false;
  const perStore = new Map();

  const emit = () => {
    if (cancelled || typeof onData !== 'function') return;
    const combined = new Map();
    perStore.forEach((storeMap) => {
      storeMap.forEach((o, id) => combined.set(id, o));
    });
    const rows = filterCashierQueue(Array.from(combined.values()));
    // Skip empty emit — caller keeps local cache until server data arrives.
    if (!rows.length) return;
    onData(rows);
  };

  const ids = Array.isArray(storeIds) && storeIds.length > 0
    ? storeIds.slice(0, 10)
    : (storeId ? [storeId] : []);

  const unsubs = [];

  const attachListener = (buildQ, sid, { onFail, filterQueue = true } = {}) => {
    try {
      const unsub = onSnapshot(
        buildQ(),
        (snap) => {
          const storeMap = perStore.get(sid) || new Map();

          if (typeof onDelta === 'function' || typeof onRemoved === 'function') {
            const delta = [];
            const removed = [];
            for (const change of snap.docChanges()) {
              if (change.type === 'removed') {
                removed.push({ id: change.doc.id, ...change.doc.data() });
                storeMap.delete(change.doc.id);
                continue;
              }
              const raw = toDocData(change.doc);
              const normalized = normalizer ? normalizer(raw) : raw;
              if (matchesCashierPendingQueue(normalized)) {
                storeMap.set(change.doc.id, normalized);
                if (change.type === 'added' || change.type === 'modified') {
                  delta.push(normalized);
                }
              } else {
                storeMap.delete(change.doc.id);
                if (change.type === 'modified') removed.push(normalized);
              }
            }
            if (delta.length) onDelta?.(delta);
            if (removed.length) onRemoved?.(removed);
          } else {
            upsertOrdersIntoMap(storeMap, snap.docs, normalizer);
            if (filterQueue) {
              const filtered = new Map();
              storeMap.forEach((o, id) => {
                if (matchesCashierPendingQueue(o)) filtered.set(id, o);
              });
              perStore.set(sid, filtered);
            } else {
              perStore.set(sid, storeMap);
            }
            emit();
            return;
          }

          if (filterQueue) {
            const filtered = new Map();
            storeMap.forEach((o, id) => {
              if (matchesCashierPendingQueue(o)) filtered.set(id, o);
            });
            perStore.set(sid, filtered);
          } else {
            perStore.set(sid, storeMap);
          }
          // onDelta path — skip full onData emit (avoids double upsert + lag)
          if (!onDelta) emit();
        },
        (err) => {
          console.warn('[ordersQuery] cashier pending listener:', sid, err?.message || err);
          if (typeof onFail === 'function') onFail();
          else onError?.(err);
        },
      );
      unsubs.push(unsub);
      return true;
    } catch (err) {
      console.warn('[ordersQuery] cashier pending listener setup:', sid, err?.message || err);
      if (typeof onFail === 'function') onFail();
      return false;
    }
  };

  for (const sid of ids) {
    // Primary: pending-only realtime — paid bills never occupy listener slots.
    attachListener(() => query(
      collection(firestore, 'orders'),
      where('storeId', '==', sid),
      where('paymentStatus', '==', 'pending_payment'),
      orderBy('createdAt', 'desc'),
      limit(listenerLimit),
    ), sid, {
      onFail: () => attachListener(() => query(
        collection(firestore, 'orders'),
        where('storeId', '==', sid),
        orderBy('createdAt', 'desc'),
        limit(listenerLimit),
      ), sid, {
        onFail: () => attachListener(() => query(
          collection(firestore, 'orders'),
          where('storeId', '==', sid),
          limit(listenerLimit),
        ), sid),
      }),
    });
  }

  if (!unsubs.length) {
    onError?.(new Error('no_cashier_pending_listener'));
  }

  return () => {
    cancelled = true;
    unsubs.forEach((u) => { try { u(); } catch { /* ignore */ } });
  };
};

/** Fast recent orders for biller Top 5 — server-first by createdAt. */
export const fetchRecentOrdersByStore = async ({
  storeId,
  limitCount = BILLER_TOP5_LISTENER_LIMIT,
} = {}) => {
  if (!storeId) return [];
  const buildQ = () => query(
    collection(firestore, 'orders'),
    where('storeId', '==', storeId),
    orderBy('createdAt', 'desc'),
    limit(limitCount),
  );
  try {
    if (getHasInternet()) {
      const snap = await getDocsFromServer(buildQ());
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    }
  } catch { /* fallback */ }
  try {
    const snap = await getDocs(buildQ());
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch {
    return [];
  }
};

/**
 * Realtime listener + periodic server refresh.
 * Fixes Netlify/PWA showing fewer bills than Firebase when cache or indexes are stale.
 */
export const subscribeOrdersHybrid = ({
  storeId = null,
  storeIds = null,
  limitCount = DEFAULT_FETCH_ORDERS_LIMIT,
  normalizer,
  onData,
  onError,
} = {}) => {
  let cancelled = false;
  const ordersMap = new Map();

  const emit = () => {
    if (!cancelled) onData(Array.from(ordersMap.values()));
  };

  const mergeSnap = (snap) => {
    upsertOrdersIntoMap(ordersMap, snap.docs, normalizer);
    emit();
  };

  const ids = Array.isArray(storeIds) && storeIds.length > 0
    ? storeIds.slice(0, 10)
    : (storeId ? [storeId] : null);

  const runServerFallback = async () => {
    if (cancelled || !getHasInternet()) return;
    try {
      const orders = await fetchOrdersFallback({
        storeId: ids?.length === 1 ? ids[0] : null,
        storeIds: ids?.length > 1 ? ids : null,
        limitCount,
        normalizer,
      });
      orders.forEach((o) => {
        const key = o.id || o.localId;
        if (key) ordersMap.set(key, o);
      });
      emit();
    } catch (err) {
      console.warn('[ordersQuery] periodic fallback failed:', err?.message || err);
    }
  };

  let unsub = () => {};
  let listenerHealthy = false;
  try {
    let sortedQ;
    if (ids?.length === 1) {
      sortedQ = query(
        collection(firestore, 'orders'),
        where('storeId', '==', ids[0]),
        orderBy('createdAt', 'desc'),
        limit(limitCount),
      );
    } else if (ids?.length > 1) {
      sortedQ = query(
        collection(firestore, 'orders'),
        where('storeId', 'in', ids),
        orderBy('createdAt', 'desc'),
        limit(limitCount),
      );
    } else {
      sortedQ = query(
        collection(firestore, 'orders'),
        orderBy('createdAt', 'desc'),
        limit(limitCount),
      );
    }

    unsub = onSnapshot(
      sortedQ,
      (snap) => {
        listenerHealthy = true;
        mergeSnap(snap);
      },
      (err) => {
        console.warn('[ordersQuery] listener error:', err?.message || err);
        listenerHealthy = false;
        runServerFallback();
        onError?.(err);
      },
    );
  } catch (err) {
    console.warn('[ordersQuery] listener setup failed:', err?.message || err);
    runServerFallback();
    onError?.(err);
  }

  // Rare heal poll — only when listener never delivered data (stale PWA cache).
  const poll = setInterval(() => {
    if (!listenerHealthy) runServerFallback();
  }, HYBRID_FALLBACK_POLL_MS);

  return () => {
    cancelled = true;
    clearInterval(poll);
    try { unsub(); } catch { /* ignore */ }
  };
};

/** On-demand report page — no onSnapshot (admin Reports & Analytics). */
export const CASH_FLOW_POLL_MS = 5 * 60 * 1000;
export const CASH_FLOW_FETCH_DAYS = 90;

const _isBrowserOnline = () => {
  if (typeof navigator === 'undefined') return true;
  return navigator.onLine !== false;
};

const _resolveScopeIds = ({ storeId, storeIds, branchId } = {}) => {
  if (Array.isArray(storeIds) && storeIds.length > 0) return storeIds.slice(0, 10);
  const scope = storeId || branchId;
  return scope ? [String(scope)] : null;
};

export const fetchReportOrdersPage = async ({
  storeId = null,
  storeIds = null,
  branchId = null,
  dateFrom = null,
  dateTo = null,
  cursor = null,
  pageSize = REPORT_PAGE_SIZE,
  normalizer,
} = {}) => {
  if (!firestore || !_isBrowserOnline()) {
    return { orders: [], lastDoc: null, hasMore: false };
  }

  const ids = _resolveScopeIds({ storeId, storeIds, branchId });
  const from = dateFrom instanceof Date ? dateFrom : (dateFrom ? new Date(dateFrom) : null);
  const to = dateTo instanceof Date ? dateTo : (dateTo ? new Date(dateTo) : null);

  const buildQ = (withDate = true) => {
    const constraints = [];
    if (ids?.length === 1) constraints.push(where('storeId', '==', ids[0]));
    else if (ids?.length > 1) constraints.push(where('storeId', 'in', ids));
    if (withDate && from) constraints.push(where('createdAt', '>=', from));
    if (withDate && to) constraints.push(where('createdAt', '<=', to));
    constraints.push(orderBy('createdAt', 'desc'));
    if (cursor) constraints.push(startAfter(cursor));
    constraints.push(limit(pageSize));
    return query(collection(firestore, 'orders'), ...constraints);
  };

  try {
    const snap = await getDocs(buildQ(true));
    const orders = snap.docs.map((d) => {
      const raw = { id: d.id, ...d.data() };
      return normalizer ? normalizer(raw) : raw;
    });
    const lastDoc = snap.docs[snap.docs.length - 1] || null;
    return {
      orders,
      lastDoc,
      hasMore: snap.docs.length >= pageSize,
    };
  } catch (err) {
    console.warn('[ordersQuery] fetchReportOrdersPage fallback:', err?.message || err);
    try {
      const plainConstraints = [];
      if (ids?.length === 1) plainConstraints.push(where('storeId', '==', ids[0]));
      else if (ids?.length > 1) plainConstraints.push(where('storeId', 'in', ids));
      plainConstraints.push(limit(Math.max(pageSize, 100)));
      const snap = await getDocs(query(collection(firestore, 'orders'), ...plainConstraints));
      let rows = snap.docs.map((d) => {
        const raw = { id: d.id, ...d.data() };
        return normalizer ? normalizer(raw) : raw;
      });
      if (from || to) {
        rows = rows.filter((o) => {
          const ts = o.createdAt?.toDate?.() || new Date(o.createdAt || 0);
          if (from && ts < from) return false;
          if (to && ts > to) return false;
          return true;
        });
      }
      rows.sort((a, b) => {
        const at = a.createdAt?.toDate?.() || new Date(a.createdAt || 0);
        const bt = b.createdAt?.toDate?.() || new Date(b.createdAt || 0);
        return bt - at;
      });
      const slice = rows.slice(0, pageSize);
      return { orders: slice, lastDoc: null, hasMore: rows.length > pageSize };
    } catch (inner) {
      console.error('[ordersQuery] fetchReportOrdersPage failed:', inner?.message || inner);
      return { orders: [], lastDoc: null, hasMore: false };
    }
  }
};

/** One-shot cash flow snapshot — replaces 3 onSnapshot listeners (admin Cash Flow). */
export const fetchCashFlowSnapshot = async ({
  storeId = null,
  branchId = null,
  since = null,
  todayFrom = null,
  ordersLimit = CASH_FLOW_ORDERS_LIMIT,
  txLimit = 500,
} = {}) => {
  if (!firestore || !_isBrowserOnline()) {
    return { orders: [], registers: [], transactions: [] };
  }

  const cutoff = since instanceof Date
    ? since
    : (() => {
      const d = todayFrom ? new Date(todayFrom) : new Date();
      if (!since && !todayFrom) {
        d.setDate(d.getDate() - CASH_FLOW_FETCH_DAYS);
      }
      d.setHours(0, 0, 0, 0);
      return d;
    })();
  const scopeId = storeId || branchId;

  const parseOrderDate = (o) => {
    const raw = o?.createdAt || o?.savedAt || o?.billEndTime;
    if (raw?.toDate) return raw.toDate();
    if (raw?.seconds) return new Date(raw.seconds * 1000);
    return new Date(raw || 0);
  };

  const filterSince = (rows, field = 'createdAt') => rows.filter((r) => {
    const raw = r[field] || r.timestamp || r.createdAt || r.savedAt;
    const dt = raw?.toDate?.() || new Date(raw || 0);
    return dt >= cutoff;
  });

  let orders = [];
  try {
    const ordersQ = scopeId
      ? query(
        collection(firestore, 'orders'),
        where('storeId', '==', scopeId),
        where('createdAt', '>=', cutoff),
        orderBy('createdAt', 'desc'),
        limit(ordersLimit),
      )
      : query(
        collection(firestore, 'orders'),
        where('createdAt', '>=', cutoff),
        orderBy('createdAt', 'desc'),
        limit(ordersLimit),
      );
    const ordersSnap = await getDocs(ordersQ);
    orders = filterSince(ordersSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
  } catch (err) {
    console.warn('[ordersQuery] cash flow sorted fetch:', err?.message || err);
  }

  if (!orders.length) {
    try {
      const fallback = await fetchOrdersFallback({
        storeId: scopeId || null,
        limitCount: ordersLimit,
      });
      orders = fallback.filter((o) => parseOrderDate(o) >= cutoff);
    } catch (err) {
      console.warn('[ordersQuery] cash flow fallback:', err?.message || err);
    }
  }

  const registersQ = scopeId
    ? query(collection(firestore, 'registers'), where('branchId', '==', scopeId))
    : query(collection(firestore, 'registers'), limit(200));

  const txQ = scopeId
    ? query(
      collection(firestore, 'cashTransactions'),
      where('branchId', '==', scopeId),
      where('createdAt', '>=', cutoff),
      orderBy('createdAt', 'desc'),
      limit(txLimit),
    )
    : query(
      collection(firestore, 'cashTransactions'),
      where('createdAt', '>=', cutoff),
      orderBy('createdAt', 'desc'),
      limit(txLimit),
    );

  try {
    const [registersSnap, txSnap] = await Promise.all([
      getDocs(registersQ).catch(() => getDocs(query(collection(firestore, 'registers'), limit(200)))),
      getDocs(txQ).catch(async () => {
        const fallback = scopeId
          ? query(collection(firestore, 'cashTransactions'), where('branchId', '==', scopeId), orderBy('timestamp', 'desc'), limit(txLimit))
          : query(collection(firestore, 'cashTransactions'), orderBy('timestamp', 'desc'), limit(txLimit));
        return getDocs(fallback);
      }),
    ]);

    const registers = registersSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const transactions = filterSince(
      txSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
      'timestamp',
    );

    return { orders, registers, transactions };
  } catch (err) {
    console.error('[ordersQuery] fetchCashFlowSnapshot error:', err?.message || err);
    return { orders, registers: [], transactions: [] };
  }
};

/** Bills Control — paginated on-demand fetch (no onSnapshot). */
export const fetchBillsControlPage = async ({
  storeId = null,
  storeIds = null,
  branchId = null,
  statusFilter = 'all',
  cursor = null,
  pageSize = BILLS_CONTROL_PAGE_SIZE,
  normalizer,
} = {}) => {
  if (!firestore || !_isBrowserOnline()) {
    return { orders: [], lastDoc: null, hasMore: false };
  }

  const ids = _resolveScopeIds({ storeId, storeIds, branchId });

  const buildQ = () => {
    const constraints = [];
    if (ids?.length === 1) constraints.push(where('storeId', '==', ids[0]));
    else if (ids?.length > 1) constraints.push(where('storeId', 'in', ids));
    if (statusFilter && statusFilter !== 'all') {
      if (statusFilter === 'paid') {
        constraints.push(where('paymentStatus', '==', 'paid'));
      } else {
        constraints.push(where('status', '==', statusFilter));
      }
    }
    constraints.push(orderBy('createdAt', 'desc'));
    if (cursor) constraints.push(startAfter(cursor));
    constraints.push(limit(pageSize));
    return query(collection(firestore, 'orders'), ...constraints);
  };

  try {
    const snap = await getDocs(buildQ());
    const orders = snap.docs.map((d) => {
      const raw = { id: d.id, ...d.data() };
      return normalizer ? normalizer(raw) : raw;
    });
    const lastDoc = snap.docs[snap.docs.length - 1] || null;
    return { orders, lastDoc, hasMore: snap.docs.length >= pageSize };
  } catch (err) {
    console.warn('[ordersQuery] fetchBillsControlPage fallback:', err?.message || err);
    try {
      const fallback = ids?.length === 1
        ? query(collection(firestore, 'orders'), where('storeId', '==', ids[0]), orderBy('createdAt', 'desc'), limit(pageSize))
        : query(collection(firestore, 'orders'), orderBy('createdAt', 'desc'), limit(pageSize));
      const snap = await getDocs(fallback);
      let orders = snap.docs.map((d) => {
        const raw = { id: d.id, ...d.data() };
        return normalizer ? normalizer(raw) : raw;
      });
      if (statusFilter && statusFilter !== 'all') {
        orders = orders.filter((o) => {
          if (statusFilter === 'paid') return String(o.paymentStatus || '').toLowerCase() === 'paid';
          return String(o.status || '').toLowerCase() === statusFilter;
        });
      }
      return { orders, lastDoc: null, hasMore: snap.docs.length >= pageSize };
    } catch {
      return { orders: [], lastDoc: null, hasMore: false };
    }
  }
};

/** Commission report — date-range on-demand fetch. */
export const fetchCommissionsReport = async ({
  storeId = null,
  branchId = null,
  dateFrom = null,
  dateTo = null,
  limitCount = 100,
} = {}) => {
  if (!getHasInternet() || !firestore) return [];
  const scopeId = storeId || branchId;
  const from = dateFrom instanceof Date ? dateFrom : (dateFrom ? new Date(dateFrom) : null);
  const to = dateTo instanceof Date ? dateTo : (dateTo ? new Date(dateTo) : null);

  const constraints = [];
  if (scopeId) constraints.push(where('storeId', '==', scopeId));
  if (from) constraints.push(where('createdAt', '>=', from));
  if (to) constraints.push(where('createdAt', '<=', to));
  constraints.push(orderBy('createdAt', 'desc'), limit(limitCount));

  try {
    const snap = await getDocs(query(collection(firestore, 'commissions'), ...constraints));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (err) {
    console.warn('[ordersQuery] fetchCommissionsReport fallback:', err?.message || err);
    try {
      const snap = await getDocs(query(collection(firestore, 'commissions'), orderBy('createdAt', 'desc'), limit(limitCount)));
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    } catch {
      return [];
    }
  }
};
