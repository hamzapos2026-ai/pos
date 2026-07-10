/**
 * On-demand customer search + order fetch (no onSnapshot).
 */

import {
  collection, query, where, orderBy, limit, startAfter, getDocs,
} from './firebase';
import { db as firestore } from './firebase';
import { getHasInternet } from '../utils/networkReachability';
import { CUSTOMERS_BROWSE_PAGE_SIZE, CUSTOMERS_ORDERS_MAX_BATCHES } from '../utils/firebaseQuotaConfig';
import { fetchOrdersFallback } from '../utils/ordersQueryUtils';

export const CUSTOMER_SEARCH_PAGE_SIZE = 25;
export const CUSTOMER_METRICS_ORDERS_LIMIT = 500;

const _scopeIds = ({ storeId, storeIds, branchId } = {}) => {
  if (Array.isArray(storeIds) && storeIds.length) return storeIds.slice(0, 10);
  const scope = storeId || branchId;
  return scope ? [String(scope)] : null;
};

const _activeCustomers = (list) =>
  (list || []).filter((c) => c.isArchived !== true && c.isDeleted !== true);

/** Paginated browse — no search term required (branch-scoped, capped). */
export const browseCustomers = async ({
  storeId = null,
  storeIds = null,
  branchId = null,
  cursor = null,
  pageSize = CUSTOMERS_BROWSE_PAGE_SIZE,
} = {}) => {
  if (!getHasInternet() || !firestore) {
    return { customers: [], lastDoc: null, hasMore: false };
  }

  const ids = _scopeIds({ storeId, storeIds, branchId });

  const runPlain = () => {
    const constraints = [limit(pageSize)];
    if (cursor) constraints.push(startAfter(cursor));
    if (ids?.length === 1) {
      return query(
        collection(firestore, 'customers'),
        where('storeId', '==', ids[0]),
        ...constraints,
      );
    }
    return query(collection(firestore, 'customers'), ...constraints);
  };

  try {
    const snap = await getDocs(runPlain());
    let customers = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    if (ids?.length > 1) {
      customers = customers.filter((c) => ids.includes(String(c.storeId || c.branchId || '')));
    }
    customers.sort((a, b) => String(a.nameLower || a.name || '').localeCompare(
      String(b.nameLower || b.name || ''),
    ));
    customers = _activeCustomers(customers);
    const lastDoc = snap.docs[snap.docs.length - 1] || null;
    return {
      customers,
      lastDoc,
      hasMore: snap.docs.length >= pageSize,
    };
  } catch (err) {
    console.warn('[customerQuery] browse failed:', err?.message || err);
    return { customers: [], lastDoc: null, hasMore: false };
  }
};

export const searchCustomers = async ({
  term = '',
  storeId = null,
  storeIds = null,
  branchId = null,
  cursor = null,
  pageSize = CUSTOMER_SEARCH_PAGE_SIZE,
} = {}) => {
  const q = String(term || '').trim();
  if (q.length < 3 || !getHasInternet() || !firestore) {
    return { customers: [], lastDoc: null, hasMore: false };
  }

  const ids = _scopeIds({ storeId, storeIds, branchId });
  const lower = q.toLowerCase();
  const digits = q.replace(/\D/g, '');

  const buildNameQ = () => {
    const constraints = [
      where('nameLower', '>=', lower),
      where('nameLower', '<=', `${lower}\uf8ff`),
      orderBy('nameLower'),
      limit(pageSize),
    ];
    if (ids?.length === 1) constraints.unshift(where('storeId', '==', ids[0]));
    if (cursor) constraints.push(startAfter(cursor));
    return query(collection(firestore, 'customers'), ...constraints);
  };

  const buildPhoneQ = () => {
    if (digits.length < 3) return null;
    const constraints = [
      where('phoneNormalized', '>=', digits),
      where('phoneNormalized', '<=', `${digits}\uf8ff`),
      orderBy('phoneNormalized'),
      limit(pageSize),
    ];
    if (ids?.length === 1) constraints.unshift(where('storeId', '==', ids[0]));
    return query(collection(firestore, 'customers'), ...constraints);
  };

  try {
    const snap = await getDocs(buildNameQ());
    let customers = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    let lastDoc = snap.docs[snap.docs.length - 1] || null;

    if (!customers.length && buildPhoneQ()) {
      const phoneSnap = await getDocs(buildPhoneQ());
      customers = phoneSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      lastDoc = phoneSnap.docs[phoneSnap.docs.length - 1] || null;
    }

    if (ids?.length > 1) {
      customers = customers.filter((c) => ids.includes(String(c.storeId || c.branchId || '')));
    }
    customers = _activeCustomers(customers);

    return {
      customers,
      lastDoc,
      hasMore: customers.length >= pageSize,
    };
  } catch (err) {
    console.warn('[customerQuery] search failed:', err?.message || err);
    try {
      const plain = ids?.length === 1
        ? query(collection(firestore, 'customers'), where('storeId', '==', ids[0]), limit(100))
        : query(collection(firestore, 'customers'), limit(100));
      const snap = await getDocs(plain);
      const lowerTerm = lower;
      const customers = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((c) => {
          const name = String(c.name || '').toLowerCase();
          const phone = String(c.phone || c.phoneNormalized || '').replace(/\D/g, '');
          return name.includes(lowerTerm) || (digits.length >= 3 && phone.includes(digits));
        })
        .slice(0, pageSize);
      return { customers, lastDoc: null, hasMore: false };
    } catch {
      return { customers: [], lastDoc: null, hasMore: false };
    }
  }
};

/** Load orders for visit/spent metrics (old bills + new persona). Online Firestore, offline Dexie. */
export const loadOrdersForCustomerMetrics = async ({
  storeId = null,
  storeIds = null,
} = {}) => {
  const limitCount = CUSTOMER_METRICS_ORDERS_LIMIT * Math.max(1, CUSTOMERS_ORDERS_MAX_BATCHES || 1);

  if (getHasInternet() && firestore) {
    try {
      const rows = await fetchOrdersFallback({ storeId, storeIds, limitCount });
      if (rows.length) return rows;
    } catch (err) {
      console.warn('[customerQuery] metrics orders fetch failed:', err?.message || err);
    }
  }

  try {
    const { loadStoreOrdersForMetrics } = await import('./localBillService');
    const ids = Array.isArray(storeIds) && storeIds.length
      ? storeIds
      : (storeId ? [storeId] : []);
    if (ids.length) return await loadStoreOrdersForMetrics(ids);
  } catch (err) {
    console.warn('[customerQuery] local metrics orders failed:', err?.message || err);
  }

  return [];
};

export const loadCustomerOrders = async ({
  customerId,
  storeId = null,
  storeIds = null,
  branchId = null,
  limitCount = 25,
} = {}) => {
  if (!customerId || !getHasInternet() || !firestore) return [];

  const ids = _scopeIds({ storeId, storeIds, branchId });

  const runQ = (field) => {
    const constraints = [
      where(field, '==', customerId),
      orderBy('createdAt', 'desc'),
      limit(limitCount),
    ];
    if (ids?.length === 1) constraints.unshift(where('storeId', '==', ids[0]));
    return query(collection(firestore, 'orders'), ...constraints);
  };

  try {
    let snap;
    try {
      snap = await getDocs(runQ('customerId'));
    } catch {
      snap = await getDocs(runQ('customer.id'));
    }
    const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    if (ids?.length > 1) {
      return rows.filter((o) => ids.includes(String(o.storeId || o.branchId || '')));
    }
    return rows;
  } catch (err) {
    console.warn('[customerQuery] loadCustomerOrders failed:', err?.message || err);
    return [];
  }
};

export default {
  searchCustomers,
  browseCustomers,
  loadCustomerOrders,
  loadOrdersForCustomerMetrics,
  CUSTOMER_SEARCH_PAGE_SIZE,
};
