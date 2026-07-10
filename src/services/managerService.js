// File: src/services/managerService.js
// Purpose: Manager module — HYBRID service layer (Firebase + IDB)
// FIXED v3.0: getCashSummary AllTime, cashFromBills, bills auto-include
// Author: A One Jewelry POS — Manager Module v3.0

import {
  collection, doc, getDocs, getDoc, addDoc, setDoc, updateDoc,
  query, where, orderBy, limit, serverTimestamp,
  writeBatch, Timestamp, onSnapshot,
} from './firebase';
import * as firebaseSvc from './firebase';
const isFirebaseReadyFn = () => {
  try {
    const fn = firebaseSvc && firebaseSvc.isFirebaseReady;
    if (typeof fn === 'function') return fn();
  } catch (e) { /* ignore mock proxy errors */ }
  try {
    const fn2 = firebaseSvc && firebaseSvc.default && firebaseSvc.default.isFirebaseReady;
    if (typeof fn2 === 'function') return fn2();
  } catch (e) { /* ignore */ }
  return false;
};

// Backwards-compatible wrapper used across the codebase
const isFirebaseReady = () => {
  try { return !!isFirebaseReadyFn(); } catch { return false; }
};

/** Lazy Firestore instance — avoid capturing `{}` at module load before init completes. */
const getFirestoreDb = () => {
  const db = firebaseSvc?.db ?? firebaseSvc?.default?.db ?? null;
  return db && typeof db === 'object' ? db : null;
};

/** Firestore doc()/collection() path segments must be strings — never Dexie numbers or objects. */
const firestorePathId = (value) => {
  if (value == null) return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return null;
};

const mapFirestoreDoc = (d) => {
  const data = typeof d.data === 'function' ? d.data() : (d.data || {});
  const docId = firestorePathId(d.id);
  return { ...data, firestoreId: docId, id: docId };
};

const orderDocRef = (orderId) => {
  const id = firestorePathId(orderId);
  const db = getFirestoreDb();
  if (!id || !db) return null;
  return doc(db, COLLECTION_NAMES.orders, id);
};

const resolveApprovalOrderId = (request = {}) =>
  firestorePathId(request.billId)
  || firestorePathId(request.localBillId)
  || firestorePathId(request.billSnapshot?.billId)
  || firestorePathId(request.billSnapshot?.orderId);

import { db as localDB } from '../db/index';
import { fetchOrdersFallback, subscribeOrdersHybrid, DEFAULT_FETCH_ORDERS_LIMIT, CASH_FLOW_ORDERS_LIMIT } from '../utils/ordersQueryUtils';
import {
  ACTIVITY_LOGS_DOC_LIMIT,
  MANAGER_COLLECTION_FETCH_LIMIT,
  MANAGER_CASH_TX_LIMIT,
  MANAGER_REPORTS_ORDERS_LIMIT,
} from '../utils/firebaseQuotaConfig';
import { getSetting, hydrateSettings } from './settingsStore';
import { calcOrderItemCommission, buildAgentMap } from './commissionService';
import {
  COLLECTION_NAMES, SHIFT_STATUS, CASH_TX_TYPES,
  APPROVAL_STATUS, APPROVAL_TYPES, BILL_STATUS, SYNC_STATUS,
  PAYMENT_STATUS,
} from '../utils/constants';
import * as authService from './authService';
import {
  MANAGER_ACTIVITY_SOURCES,
  normalizeManagerActivityLog,
  activityLogMatchesBranch,
} from '../utils/activityLogNormalizer';
import {
  resolveUserBranchIds,
  resolveUserPrimaryBranch,
  getBranchScopeFromContext,
  filterByBranchScope,
  itemMatchesBranchScope,
  userMatchesBranchScope,
  expandBranchIds,
} from '../utils/branchAccess';
import { isSuperAdminUser } from '../utils/superAdminUtils';
import { loadStoresMapFromCache } from '../hooks/useStoresMap';
import { isReportPaidBill, isManagerSettled, isCashierOrderCancelled } from '../utils/cashierOrderUtils';
import { buildCustomerDocId } from '../utils/customerHelpers';

// ============================================================
// HELPERS
// ============================================================
const generateId = (prefix = 'id') =>
  `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

const nowISO = () => new Date().toISOString();
const todayKey = () => new Date().toISOString().slice(0, 10);

const parseDate = (v) => {
  if (!v) return new Date(0);
  if (typeof v?.toDate === 'function') return v.toDate();
  if (v?.seconds) return new Date(v.seconds * 1000);
  if (typeof v === 'number') return new Date(v);
  return new Date(v || 0);
};

const toISOStr = (v) => {
  try {
    const d = parseDate(v);
    if (isNaN(d.getTime())) return nowISO();
    return d.toISOString();
  } catch { return nowISO(); }
};

const isOnline = () =>
  typeof navigator !== 'undefined' && navigator.onLine;

// ============================================================
// NORMALIZE ORDER
// ============================================================
const normalizeOrder = (order) => {
  if (!order) return null;

  const total = Number(
    order.grandTotal || order.totalAmount ||
    order.total || order.subtotal || 0
  );

  const rawPs = String(order.paymentStatus || '').toLowerCase();
  const awaitingCashier = rawPs === 'pending_payment' || rawPs === 'pending_approval';
  const statusLower = String(order.status || '').toLowerCase();
  const cashierConfirmed =
    ['paid', 'completed', 'settled', 'cashier_paid'].includes(statusLower) ||
    rawPs === 'paid' ||
    rawPs === 'cashier_paid' ||
    (order.paidAt && order.isActiveOrder === false && rawPs !== 'pending_payment' && rawPs !== 'pending_approval');

  // Never treat biller-side amountReceived as cashier payment while pending
  let paidAmount = Number(order.paidAmount || 0);
  if (paidAmount === 0 && !awaitingCashier && cashierConfirmed) {
    paidAmount = Number(order.amountReceived || 0);
  }
  if (paidAmount === 0 && !awaitingCashier && total > 0) {
    if (['paid', 'completed', 'fully_paid', 'cashier_paid'].includes(rawPs)) paidAmount = total;
    else if (['paid', 'completed', 'settled', 'cashier_paid', 'manager_approved'].includes(statusLower)) {
      paidAmount = total;
    }
  }

  let paymentMethod = order.paymentMethod || order.paymentType || 'cash';
  if (!paymentMethod || paymentMethod === 'null' || paymentMethod === null)
    paymentMethod = 'cash';
  // Normalize common placeholders (e.g. 'n/a') to a sensible default
  let _pm = String(paymentMethod).toLowerCase().trim();
  if (['n/a', 'na', 'not applicable', 'none'].includes(_pm)) _pm = 'cash';
  paymentMethod = _pm;

  const customerName =
    order.customer?.name || order.customerName || 'Walk-in';
  const customerPhone =
    order.customer?.phone || order.customerPhone || '';

  const savedAt  = toISOStr(order.savedAt  || order.billEndTime   || order.createdAt);
  const createdAt = toISOStr(order.createdAt || order.savedAt || order.billStartTime);

  const managerSettled =
    order.managerConfirmed === true ||
    statusLower === 'manager_approved' ||
    order.managerPaid === true ||
    (statusLower === 'paid' && rawPs === 'paid' && !order.paidBy);

  const computedPaymentStatus = managerSettled
    ? 'paid'
    : (statusLower === 'cashier_paid' || rawPs === 'cashier_paid'
      ? 'cashier_paid'
      : (cashierConfirmed && order.paidBy
        ? 'cashier_paid'
        : (awaitingCashier
          ? order.paymentStatus
          : (order.paymentStatus ||
            (paidAmount >= total && total > 0 ? 'paid'
              : paidAmount > 0 ? 'partial' : 'unpaid')))));

  return {
    ...order,
    localId: order.localId || order.id,
    billId: order.billId || order.id,
    serialNo: order.serialNo || order.billSerial,
    totalAmount: total,
    paidAmount,
    outstandingAmount: Math.max(0, total - paidAmount),
    discountAmount: Number(
      order.discountAmount || order.totalDiscount || order.discount || 0
    ),
    paymentMethod,
    paymentStatus: computedPaymentStatus,
    status: order.status || 'completed',
    customerName,
    customerPhone,
    savedAt,
    createdAt,
    dateKey: order.dateKey || savedAt.slice(0, 10).replace(/-/g, ''),
    storeId: order.storeId || order.branchId || null,
  };
};

// ============================================================
// QUEUE SYNC
// ============================================================
const queueSync = async (type, operation, data) => {
  try {
    await localDB.sync_queue.add({
      queueId: generateId('sync'),
      type, operation, data,
      priority: 1, attempts: 0, status: 'pending',
      createdAt: nowISO(), synced: 0,
    });
  } catch { /* silent */ }
};

// ============================================================
// ACTIVITY LOG
// ============================================================
const logActivity = async (action, details = {}) => {
  try {
    const user = await authService.getCurrentUserData();
    const log = {
      logId: generateId('log'),
      action,
      userId: user?.uid || 'unknown',
      userName: user?.name || user?.displayName || 'Unknown',
      storeId: user?.primaryStore || details.storeId || null,
      details,
      timestamp: nowISO(),
      synced: 0,
    };
    await localDB.activity_logs_local.add(log);
    await queueSync('activity_log', 'create', log);
    return log;
  } catch { /* silent */ }
};

// ============================================================
// MANAGER CONTEXT
// ============================================================
/** Build manager scope from context — alias-expanded branch ids + stores map. */
const buildScope = (ctx, filterBranchId = null) => {
  const storesMap = ctx?.storesMap || {};
  const scope = getBranchScopeFromContext(ctx, filterBranchId);
  return { ...scope, storesMap };
};

const getManagerContext = async () => {
  const auth = authService && authService.getCurrentUserData ? authService : (authService && authService.default ? authService.default : authService);
  const user = auth && auth.getCurrentUserData ? await auth.getCurrentUserData() : null;
  const storesMap = await loadStoresMapFromCache();
  if (!user) {
    return {
      uid: 'unknown', name: 'Unknown',
      branchIds: [], primaryBranch: null,
      isSuperAdmin: false, isAdmin: false,
      restrictBranches: true,
      storesMap,
    };
  }
  const primary = resolveUserPrimaryBranch(user);
  const rawBranchIds = resolveUserBranchIds(user);
  const branchIds = expandBranchIds(
    [...new Set([primary, ...rawBranchIds].filter(Boolean))],
    storesMap,
  );
  const isSuperAdmin = isSuperAdminUser(user);
  const isAdmin =
    user.roles?.includes('admin') || user.role === 'admin';

  return {
    uid: user.uid,
    name: user.name || user.displayName || user.email,
    email: user.email,
    branchIds,
    primaryBranch: primary,
    role: user.role || user.roles?.[0] || '',
    primaryRole: user.roles?.[0] || user.role || '',
    isSuperAdmin,
    isAdmin,
    restrictBranches: !isSuperAdmin && !isAdmin,
    storesMap,
  };
};

// ============================================================
// FETCH ALL ORDERS — HYBRID
// ============================================================
const fetchAllOrders = async (options = {}) => {
  const { lim = DEFAULT_FETCH_ORDERS_LIMIT, useCache = true, branchId: filterBranchId } = options;
  const ctx = await getManagerContext();
  const scope = buildScope(ctx, filterBranchId);
  const branchIds = scope.restrict ? (scope.branchIds || []) : null;
  const singleStore = branchIds?.length === 1 ? branchIds[0] : null;
  const multiStore = branchIds?.length > 1 ? branchIds : null;

  if (isFirebaseReadyFn() && isOnline()) {
    try {
      let orders = (await fetchOrdersFallback({
        storeId: singleStore,
        storeIds: multiStore,
        limitCount: lim,
        normalizer: (raw) => normalizeOrder(raw),
      })).filter(Boolean);

      if (scope.restrict) {
        orders = filterByBranchScope(orders, scope);
      }

      if (useCache && orders.length > 0) {
        try {
          await localDB.orders.bulkPut(
            orders.map(o => ({
              ...o,
              localId: o.localId || o.id,
              syncStatus: 'synced',
              synced: 1,
            }))
          );
        } catch { }
        try {
          const remoteIds = new Set(orders.map(o => o.id || o.localId).filter(Boolean));
          const localOrders = await localDB.orders.toArray();
          for (const lo of localOrders) {
            if (scope.restrict && !itemMatchesBranchScope(scope, lo.storeId)) continue;
            const localKey = lo.localId || lo.id || lo.billId;
            const wasSynced = lo.synced === 1 || lo.syncStatus === 'synced' || lo.synced === true;
            if (wasSynced && localKey && !remoteIds.has(localKey)) {
              try { await localDB.orders.where('localId').equals(localKey).delete(); } catch { }
            }
          }
        } catch { /* ignore cleanup errors */ }
      }
      return orders;
    } catch (err) {
      console.warn('[ManagerService] Firebase orders fetch failed:', err?.message);
    }
  }

  try {
    let idbOrders = await localDB.orders.toArray();
    if (scope.restrict) {
      idbOrders = filterByBranchScope(idbOrders, scope);
    }
    return idbOrders.map(normalizeOrder).filter(Boolean);
  } catch { return []; }
};

// ============================================================
// FETCH COLLECTION — HYBRID
// ============================================================
const fetchCollection = async (collectionName, idbStoreName, options = {}) => {
  const { lim = MANAGER_COLLECTION_FETCH_LIMIT, orderField = 'createdAt', scope = null } = options;

  const applyScope = (items) => {
    if (!scope?.restrict || !items?.length) return items || [];
    return filterByBranchScope(items, scope, { storesMap: scope.storesMap });
  };

  const fetchScopedFromFirebase = async () => {
    const ids = (scope?.branchIds || []).slice(0, 10);
    const merged = new Map();
    const dbRef = getFirestoreDb();
    if (!dbRef) return [];

    for (const sid of ids) {
      try {
        const snap = await getDocs(query(
          collection(dbRef, collectionName),
          where('storeId', '==', sid),
          orderBy(orderField, 'desc'),
          limit(lim),
        ));
        snap.docs.forEach((d) => {
          const row = mapFirestoreDoc(d);
          const key = row.id || row.localId;
          if (key) merged.set(key, row);
        });
      } catch {
        try {
          const snap = await getDocs(query(
            collection(dbRef, collectionName),
            where('storeId', '==', sid),
            limit(lim),
          ));
          snap.docs.forEach((d) => {
            const row = mapFirestoreDoc(d);
            const key = row.id || row.localId;
            if (key) merged.set(key, row);
          });
        } catch { /* index may be missing */ }
      }
    }
    return [...merged.values()];
  };

  if (isFirebaseReadyFn() && isOnline()) {
    try {
      let items = [];
      if (scope?.restrict && scope.branchIds?.length) {
        items = await fetchScopedFromFirebase();
      } else {
        const q = query(
          collection(getFirestoreDb(), collectionName),
          orderBy(orderField, 'desc'),
          limit(lim),
        );
        const snap = await getDocs(q);
        items = snap.docs.map((d) => mapFirestoreDoc(d));
      }
      items = applyScope(items);
      try {
        if (items.length > 0 && idbStoreName && localDB[idbStoreName]) {
          await localDB[idbStoreName].bulkPut(items);
        }
      } catch { }
      // Cleanup for certain collections: remove locally-synced records
      // that no longer exist remotely so manager UIs reflect deletions.
      try {
        const cleanupFor = ['users', 'customers', 'returns', 'expenses', 'cash_transactions'];
        if (cleanupFor.includes(idbStoreName) && items.length > 0 && localDB[idbStoreName]) {
          const remoteKeys = new Set(items.map(i => i.uid || i.customerId || i.returnId || i.expenseId || i.txId || i.id || i.localId).filter(Boolean));
          const localArr = await localDB[idbStoreName].toArray();
          for (const lo of localArr) {
            const candidates = [lo.uid, lo.customerId, lo.returnId, lo.expenseId, lo.txId, lo.localId, lo.id];
            const localKey = candidates.find(Boolean);
            const wasSynced = lo.synced === 1 || lo._syncStatus === 'synced' || lo.synced === true;
            if (wasSynced && localKey && !remoteKeys.has(localKey)) {
              try {
                // Attempt deletion via common indexed fields
                if (lo.uid) await localDB[idbStoreName].where('uid').equals(lo.uid).delete();
                else if (lo.customerId) await localDB[idbStoreName].where('customerId').equals(lo.customerId).delete();
                else if (lo.returnId) await localDB[idbStoreName].where('returnId').equals(lo.returnId).delete();
                else if (lo.expenseId) await localDB[idbStoreName].where('expenseId').equals(lo.expenseId).delete();
                else if (lo.txId) await localDB[idbStoreName].where('txId').equals(lo.txId).delete();
                else if (typeof lo.id !== 'undefined') await localDB[idbStoreName].delete(lo.id);
                else if (lo.localId) await localDB[idbStoreName].where('localId').equals(lo.localId).delete();
              } catch { /* ignore per-item cleanup errors */ }
            }
          }
        }
      } catch { /* ignore cleanup errors */ }
      return items;
    } catch { /* silent */ }
  }

  try {
    if (idbStoreName && localDB[idbStoreName]) {
      return applyScope(await localDB[idbStoreName].toArray());
    }
    return [];
  } catch { return []; }
};

// ============================================================
// SECTION 1: DASHBOARD SUMMARY
// ============================================================
export const getDashboardSummary = async (filters = {}) => {
  try {
    const ctx = await getManagerContext();
    const scope = buildScope(ctx, filters.branchId);

    const today = todayKey();
    const fromDateStr = filters.from || today;
    const toDateStr   = filters.to   || today;
    const fromTs = new Date(fromDateStr).getTime();
    const toTs   = new Date(toDateStr).getTime() + 86400000 - 1;

    const [allOrders, allExpenses, allReturns, allCash] = await Promise.all([
      fetchAllOrders({ lim: DEFAULT_FETCH_ORDERS_LIMIT, branchId: filters.branchId }),
      fetchCollection('expenses', 'expenses', { scope }),
      fetchCollection(COLLECTION_NAMES.returns, 'returns', { scope }),
      fetchCollection(
        COLLECTION_NAMES.cashTransactions, 'cash_transactions',
        { orderField: 'timestamp', scope }
      ),
    ]);

    const filterByBranchDate = (items, dateField) =>
      items.filter(item => {
        if (!item || item.deleted || item.isDeleted) return false;
        if (!itemMatchesBranchScope(scope, item.storeId || item.branchId)) return false;
        const ts = parseDate(
          item[dateField] || item.createdAt || item.savedAt
        ).getTime();
        return ts >= fromTs && ts <= toTs;
      });

    const branchOrders   = filterByBranchDate(allOrders,   'savedAt');
    const branchExpenses = filterByBranchDate(allExpenses, 'date');
    const branchReturns  = filterByBranchDate(allReturns,  'processedAt');
    const branchCash     = filterByBranchDate(allCash,     'createdAt');

    let totalSales = 0, totalPaid = 0, totalOutstanding = 0, totalDiscount = 0;
    let billCount = 0, paidBillCount = 0, creditBillCount = 0;
    let cashCollected = 0, digitalCollected = 0;
    const billerStats = {}, salespersonStats = {};
    const paymentMethodStats = {}, dailyTrend = {};

    branchOrders.forEach(o => {
      const total = Number(o.totalAmount || 0);
      let paid = Number(o.paidAmount || 0);
      if (paid === 0 && total > 0) {
        const ps = String(o.paymentStatus || '').toLowerCase();
        const st = String(o.status || '').toLowerCase();
        if (['paid', 'completed', 'fully_paid', 'cashier_paid'].includes(ps)) paid = total;
        else if (['paid', 'completed', 'settled', 'cashier_paid', 'manager_approved'].includes(st)) {
          paid = total;
        }
      }
      const outstanding = Math.max(0, total - paid);
      const discount    = Number(o.discountAmount || 0);
      let method = String(o.paymentMethod || 'cash').toLowerCase();
      if (!method || method === 'null') method = 'cash';

      const dateK = (o.savedAt || o.createdAt || '').slice(0, 10);

      totalSales      += total;
      totalPaid       += paid;
      totalOutstanding+= outstanding;
      totalDiscount   += discount;
      billCount++;
      if (outstanding === 0 && total > 0) paidBillCount++;
      if (outstanding > 0) creditBillCount++;
      if (method === 'cash') cashCollected += paid;
      else digitalCollected += paid;

      const billerId = o.billerId || 'unknown';
      if (!billerStats[billerId]) {
        billerStats[billerId] = {
          billerId, billerName: o.billerName || billerId,
          count: 0, totalSales: 0,
        };
      }
      billerStats[billerId].count++;
      billerStats[billerId].totalSales += total;

      const spId = o.salespersonId;
      if (spId) {
        if (!salespersonStats[spId]) {
          salespersonStats[spId] = {
            salespersonId: spId, name: o.salespersonName || spId,
            count: 0, totalSales: 0, commission: 0,
          };
        }
        salespersonStats[spId].count++;
        salespersonStats[spId].totalSales += total;
        salespersonStats[spId].commission += Number(o.commissionAmount || 0);
      }

      paymentMethodStats[method] =
        (paymentMethodStats[method] || 0) + (paid > 0 ? paid : total);

      if (dateK) {
        if (!dailyTrend[dateK])
          dailyTrend[dateK] = { date: dateK, sales: 0, bills: 0 };
        dailyTrend[dateK].sales += total;
        dailyTrend[dateK].bills++;
      }
    });

    const totalExpenses = branchExpenses.reduce(
      (s, e) => s + Number(e.amount || 0), 0
    );
    const totalReturnAmount = branchReturns.reduce(
      (s, r) => s + Number(r.refundAmount || 0), 0
    );

    let cashInHand = cashCollected - totalExpenses;
    branchCash.forEach(c => {
      const amt = Number(c.amount || 0);
      if (['receive', 'deposit'].includes(c.type))          cashInHand += amt;
      if (['handover', 'withdrawal', 'transfer'].includes(c.type)) cashInHand -= amt;
    });

    return {
      success: true,
      summary: {
        totalSales, totalPaid, totalOutstanding, totalDiscount,
        totalExpenses, totalReturnAmount,
        cashCollected, digitalCollected, cashInHand,
        billCount, paidBillCount, creditBillCount,
        returnCount: branchReturns.length,
        expenseCount: branchExpenses.length,
      },
      charts: {
        dailyTrend: Object.values(dailyTrend).sort(
          (a, b) => a.date.localeCompare(b.date)
        ),
        paymentMethods: Object.entries(paymentMethodStats).map(
          ([method, amount]) => ({ method, amount })
        ),
        topBillers: Object.values(billerStats)
          .sort((a, b) => b.totalSales - a.totalSales).slice(0, 5),
        topSalespersons: Object.values(salespersonStats)
          .sort((a, b) => b.totalSales - a.totalSales).slice(0, 5),
      },
      branches: scope.branchIds.length ? scope.branchIds : ctx.branchIds,
      dateRange: { from: fromDateStr, to: toDateStr },
    };
  } catch (err) {
    console.error('[ManagerService] getDashboardSummary:', err);
    return { success: false, error: err.message, summary: {}, charts: {} };
  }
};

// ============================================================
// SECTION 2: BILLS
// ============================================================
export const getBills = async (filters = {}) => {
  try {
    const ctx = await getManagerContext();
    const scope = buildScope(ctx, filters.branchId);

    let all = await fetchAllOrders({ lim: filters.limit || DEFAULT_FETCH_ORDERS_LIMIT });

    try {
      const { fetchAndApplyCloudPayments } = await import('./paymentReconciliationService');
      const since = filters.from ? new Date(filters.from) : null;
      all = await fetchAndApplyCloudPayments(all, {
        storeIds: scope.branchIds || [],
        since,
      });
    } catch { /* non-critical */ }

    // Default view: active bills awaiting cashier or manager (not fully settled)
    const hasActiveFilters = filters.status || filters.paymentStatus || filters.from || filters.to || filters.search || filters.customerId || filters.billerId || filters.showAll;
    if (!hasActiveFilters) {
      all = all.filter(o => {
        if (o.isArchived || o.isDeleted || o.deleted) return false;
        if (o.status === 'cancelled') return false;
        if (isManagerSettled(o)) return false;
        if (isCashierOrderCancelled(o)) return false;
        return true;
      });
    } else if (!filters.showAll) {
      all = all.filter(o => !o.isArchived);
    }

    all = filterByBranchScope(all, scope);

    if (filters.status && filters.status !== 'all')
      all = all.filter(o => o.status === filters.status);

    if (filters.paymentStatus) {
      all = all.filter(o => {
        const rawPs = String(o.paymentStatus || '').toLowerCase();
        if (filters.paymentStatus === 'pending_cashier') {
          return rawPs === 'pending_payment' || rawPs === 'pending_approval';
        }
        const total = Number(o.totalAmount || 0);
        const paid  = Number(o.paidAmount  || 0);
        const out   = total - paid;
        if (filters.paymentStatus === PAYMENT_STATUS.paid)
          return out <= 0 && total > 0 && rawPs === 'paid';
        if (filters.paymentStatus === PAYMENT_STATUS.partial)
          return paid > 0 && out > 0;
        if (filters.paymentStatus === PAYMENT_STATUS.unpaid)
          return paid === 0 && total > 0;
        return true;
      });
    }

    if (filters.billerId)
      all = all.filter(o => o.billerId === filters.billerId);
    if (filters.customerId)
      all = all.filter(o => o.customerId === filters.customerId);

    if (filters.from) {
      const ts = new Date(filters.from).getTime();
      all = all.filter(
        o => parseDate(o.savedAt || o.createdAt).getTime() >= ts
      );
    }
    if (filters.to) {
      const ts = new Date(filters.to).getTime() + 86400000 - 1;
      all = all.filter(
        o => parseDate(o.savedAt || o.createdAt).getTime() <= ts
      );
    }

    if (filters.search) {
      const q = filters.search.toLowerCase();
      all = all.filter(o =>
        (o.serialNo     || '').toString().toLowerCase().includes(q) ||
        (o.localId || o.id || '').toLowerCase().includes(q) ||
        (o.customerName || '').toLowerCase().includes(q) ||
        (o.customerPhone|| '').includes(q)
      );
    }

    all.sort((a, b) =>
      parseDate(b.savedAt || b.createdAt).getTime() -
      parseDate(a.savedAt || a.createdAt).getTime()
    );

    const total  = all.length;
    const offset = filters.offset || 0;
    const lim    = filters.limit  || 100;
    const items  = all.slice(offset, offset + lim);

    return { success: true, items, total, hasMore: offset + lim < total };
  } catch (err) {
    console.error('[ManagerService] getBills:', err);
    return { success: false, items: [], total: 0, error: err.message };
  }
};

/** Real-time Firestore subscription — normalized orders for manager/admin bills UI */
export const subscribeToOrdersLive = (callback, onError) => {
  if (!isFirebaseReadyFn()) return () => {};
  let innerUnsub = () => {};
  let cancelled = false;

  (async () => {
    try {
      const ctx = await getManagerContext();
      if (cancelled) return;
      const scope = buildScope(ctx);
      const branchIds = scope.restrict ? (scope.branchIds || []) : null;
      const singleStore = branchIds?.length === 1 ? branchIds[0] : null;
      const multiStore = branchIds?.length > 1 ? branchIds : null;

      innerUnsub = subscribeOrdersHybrid({
        storeId: singleStore,
        storeIds: multiStore,
        limitCount: DEFAULT_FETCH_ORDERS_LIMIT,
        normalizer: (raw) => normalizeOrder(raw),
        onData: async (orders) => {
          try {
            const liveCtx = await getManagerContext();
            const liveScope = buildScope(liveCtx);
            callback(filterByBranchScope(orders.filter(Boolean), liveScope));
          } catch {
            callback(orders.filter(Boolean));
          }
        },
        onError: onError || ((err) => console.warn('[subscribeToOrdersLive]', err)),
      });
    } catch (err) {
      console.warn('[subscribeToOrdersLive] setup failed:', err);
      onError?.(err);
    }
  })();

  return () => {
    cancelled = true;
    try { innerUnsub(); } catch { /* ignore */ }
  };
};

/** Apply getBills filters to a pre-fetched normalized order list */
export const filterOrdersList = async (orders, filters = {}) => {
  try {
    const ctx = await getManagerContext();
    const scope = buildScope(ctx, filters.branchId);

    let all = (orders || []).map((o) =>
      o.totalAmount !== undefined ? o : normalizeOrder(o)
    ).filter(Boolean);

    const hasActiveFilters = filters.status || filters.paymentStatus || filters.from || filters.to || filters.search || filters.customerId || filters.billerId || filters.showAll;
    if (!hasActiveFilters) {
      all = all.filter(o => {
        if (o.isArchived || o.isDeleted || o.deleted) return false;
        if (o.status === 'cancelled') return false;
        if (isManagerSettled(o)) return false;
        if (isCashierOrderCancelled(o)) return false;
        return true;
      });
    } else if (!filters.showAll) {
      all = all.filter(o => !o.isArchived);
    }

    all = filterByBranchScope(all, scope);

    if (filters.status && filters.status !== 'all')
      all = all.filter(o => o.status === filters.status);

    if (filters.paymentStatus) {
      all = all.filter(o => {
        const rawPs = String(o.paymentStatus || '').toLowerCase();
        if (filters.paymentStatus === 'pending_cashier') {
          return rawPs === 'pending_payment' || rawPs === 'pending_approval';
        }
        const total = Number(o.totalAmount || 0);
        const paid  = Number(o.paidAmount  || 0);
        const out   = total - paid;
        if (filters.paymentStatus === PAYMENT_STATUS.paid)
          return out <= 0 && total > 0 && rawPs === 'paid';
        if (filters.paymentStatus === PAYMENT_STATUS.partial)
          return paid > 0 && out > 0;
        if (filters.paymentStatus === PAYMENT_STATUS.unpaid)
          return paid === 0 && total > 0;
        return true;
      });
    }

    if (filters.billerId)
      all = all.filter(o => o.billerId === filters.billerId);
    if (filters.customerId)
      all = all.filter(o => o.customerId === filters.customerId);

    if (filters.from) {
      const ts = new Date(filters.from).getTime();
      all = all.filter(o => parseDate(o.savedAt || o.createdAt).getTime() >= ts);
    }
    if (filters.to) {
      const ts = new Date(filters.to).getTime() + 86400000 - 1;
      all = all.filter(o => parseDate(o.savedAt || o.createdAt).getTime() <= ts);
    }

    if (filters.search) {
      const q = filters.search.toLowerCase();
      all = all.filter(o =>
        (o.serialNo || '').toString().toLowerCase().includes(q) ||
        (o.billSerial || '').toString().toLowerCase().includes(q) ||
        (o.localId || o.id || '').toLowerCase().includes(q) ||
        (o.customerName || '').toLowerCase().includes(q) ||
        (o.customerPhone || '').includes(q)
      );
    }

    all.sort((a, b) =>
      parseDate(b.savedAt || b.createdAt).getTime() -
      parseDate(a.savedAt || a.createdAt).getTime()
    );

    return { success: true, items: all, total: all.length, hasMore: false };
  } catch (err) {
    return { success: false, items: [], total: 0, error: err.message };
  }
};

export const getBillDetails = async (idOrLocalId) => {
  try {
    if (isFirebaseReadyFn() && isOnline()) {
      try {
        const snap = await getDoc(
          doc(getFirestoreDb(), COLLECTION_NAMES.orders, idOrLocalId)
        );
        if (snap.exists()) {
          const bill = normalizeOrder({ id: snap.id, ...snap.data() });
          return {
            ...bill,
            paymentHistory: await getBillPayments(bill.billId || bill.id),
            activityLogs:   await getBillActivity(bill.billId  || bill.id),
          };
        }
      } catch { }
    }

    let bill = await localDB.orders.where('localId').equals(idOrLocalId).first()
      || await localDB.orders.where('billId').equals(idOrLocalId).first();
    if (!bill) return null;

    const normalized = normalizeOrder(bill);
    return {
      ...normalized,
      paymentHistory: await getBillPayments(normalized.billId),
      activityLogs:   await getBillActivity(normalized.billId),
    };
  } catch { return null; }
};

const getBillPayments = async (billId) => {
  try {
    if (isFirebaseReadyFn() && isOnline()) {
      const snap = await getDocs(
        query(collection(getFirestoreDb(), 'payments'), where('billId', '==', billId))
      );
      return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    }
    return await localDB.payments.where('billId').equals(billId).toArray();
  } catch { return []; }
};

const getBillActivity = async (billId) => {
  try {
    const all = await localDB.activity_logs_local.toArray();
    return all.filter(
      l => l.details?.billId === billId || l.details?.localId === billId
    );
  } catch { return []; }
};

export const updateBill = async (localId, updates) => {
  try {
    const ctx  = await getManagerContext();
    const bill =
      await localDB.orders.where('localId').equals(localId).first() ||
      await localDB.orders.where('billId').equals(localId).first();
    if (!bill) throw new Error('Bill not found');

    const finalStatus = updates.status || bill.status;
    const finalPayment = updates.paymentStatus || bill.paymentStatus;
    const isFinished = ['paid', 'completed', 'cancelled', 'manager_approved', 'cashier_paid'].includes(String(finalStatus).toLowerCase()) ||
                       ['paid', 'cashier_paid'].includes(String(finalPayment).toLowerCase());
                       
    const statusUpdates = {
      ...updates,
      ...(isFinished ? { isActiveOrder: false } : {}),
    };

    await localDB.orders.put({
      ...bill, ...statusUpdates,
      updatedAt: nowISO(), syncStatus: SYNC_STATUS.pending, synced: 0,
    });

    if (isFirebaseReadyFn() && isOnline()) {
      try {
        await updateDoc(
          doc(getFirestoreDb(), COLLECTION_NAMES.orders, bill.id || bill.localId),
          { ...statusUpdates, updatedAt: serverTimestamp(), updatedBy: ctx.uid }
        );
      } catch {
        await queueSync('bill', 'update', { id: bill.id, localId, updates: statusUpdates });
      }
    } else {
      await queueSync('bill', 'update', { id: bill.id, localId, updates: statusUpdates });
    }

    await logActivity('BILL_UPDATED', {
      localId, billId: bill.billId,
      changes: Object.keys(updates),
    });
    return { success: true };
  } catch (err) {
    console.error('[ManagerService] collectPayment error:', err);
    return { success: false, error: err?.message || String(err) };
  }
};

// ============================================================
// SECTION 3: PAYMENT COLLECTION
// ============================================================
export const collectPayment = async ({
  localBillId, amount,
  paymentMethod = 'cash', note = '', reference = '',
}) => {
  try {
    if (!amount || amount <= 0) throw new Error('Invalid amount');

    const ctx = await getManagerContext();
    let bill =
      await localDB.orders.where('localId').equals(localBillId).first() ||
      await localDB.orders.where('billId').equals(localBillId).first();

    if (!bill && isFirebaseReady() && isOnline()) {
      try {
        const snap = await getDoc(
          doc(getFirestoreDb(), COLLECTION_NAMES.orders, localBillId)
        );
        if (snap.exists()) bill = { id: snap.id, ...snap.data() };
      } catch { }
    }
    if (!bill) throw new Error('Bill not found');

    const total = Number(bill.totalAmount || bill.grandTotal || 0);
    let currentPaid = Number(bill.paidAmount || 0);
    if (currentPaid === 0 && total > 0) {
      const ps = String(bill.paymentStatus || '').toLowerCase();
      if (['paid', 'completed'].includes(ps)) currentPaid = total;
    }
    const outstanding = Math.max(0, total - currentPaid);
    if (amount > outstanding + 0.0001)
      throw new Error(`Amount exceeds outstanding (Rs ${outstanding})`);

    const newPaid       = currentPaid + Number(amount);
    const newOutstanding = total - newPaid;
    const updates = {
      paidAmount: newPaid, outstandingAmount: newOutstanding,
      paymentStatus: newOutstanding <= 0 ? PAYMENT_STATUS.paid : PAYMENT_STATUS.partial,
      lastPaymentAt: nowISO(), updatedAt: nowISO(),
      ...(newOutstanding <= 0 ? { isActiveOrder: false } : {}),
    };

    await localDB.orders.put({
      ...bill, ...updates, syncStatus: SYNC_STATUS.pending, synced: 0,
    });

    if (isFirebaseReadyFn() && isOnline()) {
      try {
        await updateDoc(
          doc(getFirestoreDb(), COLLECTION_NAMES.orders, bill.id || bill.localId),
          { ...updates, updatedAt: serverTimestamp() }
        );
      } catch {
        await queueSync('bill', 'update', { id: bill.id, updates });
      }
    } else {
      await queueSync('bill', 'update', { id: bill.id, updates });
    }

    const payment = {
      paymentId: generateId('pay'),
      billId: bill.billId || bill.id || bill.localId,
      localBillId,
      amount: Number(amount),
      enteredAmount: Number(amount),
      paymentType: 'collection', paymentMethod, reference, note,
      collectedBy: ctx.uid, collectedByName: ctx.name,
      storeId: bill.storeId, createdAt: nowISO(), synced: 0,
    };
    await localDB.payments.add(payment);
    await queueSync('payment', 'create', payment);

    // Record commission for salespersons based on item-level assignments (supports multiple agents)
    try {
      // Respect admin toggle: if salesperson commission disabled, skip recording
      try {
        await hydrateSettings();
        const spConfig = getSetting('salesperson', {}) || {};
        if (spConfig.enableCommission === false) {
          // Commission disabled by admin; skip any commission bookkeeping
          // continue with payment flow
        } else {
          // proceed into existing commission logic
          
          const items = bill.items || bill.bill_items || [];
          const totalBill = Number(bill.totalAmount || bill.grandTotal || 0) || 0;
          const agentTotals = {};
          const agentRegistry = buildAgentMap(spConfig.agents || []);

          items.forEach((it) => {
            try {
              const spId = it.salespersonId || null;
              if (!spId) return;
              const { rawComm } = calcOrderItemCommission(it, agentRegistry);
              if (!agentTotals[spId]) agentTotals[spId] = 0;
              agentTotals[spId] += rawComm;
            } catch (e) { /* ignore per-item errors */ }
          });

          // If no agents found but legacy bill-level salesperson exists, keep backward-compatible behavior
          if (Object.keys(agentTotals).length === 0) {
            const spId = bill.salespersonId || bill.salesperson || null;
            const percent = Number(bill.commissionPercent || bill.commission || 0);
            if (spId && percent > 0 && totalBill > 0) {
              const commissionAmount = (Number(amount) * percent) / 100;
              agentTotals[spId] = commissionAmount;
            }
          }

          // Allocate commission proportionally to the collected `amount` (partial payments supported)
          const proportion = totalBill > 0 ? (Number(amount) / totalBill) : 0;
          for (const [spId, fullCommission] of Object.entries(agentTotals)) {
            try {
              const earned = Math.round(Number(fullCommission || 0) * proportion);
              if (earned <= 0) continue;
              const user = await localDB.users.where('uid').equals(spId).first();
              if (user) {
                const updated = {
                  uid: user.uid,
                  commissionEarned: Number(user.commissionEarned || 0) + earned,
                  commissionPending: Number(user.commissionPending || 0) + earned,
                };
                await localDB.users.put({ ...user, ...updated });
              } else {
                await localDB.users.put({ uid: spId, commissionEarned: earned, commissionPending: earned });
              }

              // write a simple log for audit
              try {
                if (localDB.logs) {
                  await localDB.logs.add({ logId: generateId('log'), action: 'commission_recorded', amount: earned, userId: spId, timestamp: nowISO() });
                }
              } catch { /* ignore */ }

              try {
                const { recordCommissionTransaction } = await import('./commissionService');
                const spItem = (bill.items || []).find((i) => i.salespersonId === spId);
                await recordCommissionTransaction({
                  orderId: bill.firebaseId || bill.billId,
                  localOrderId: bill.localId || bill.billId,
                  salespersonId: spId,
                  salespersonName: spItem?.salespersonName || bill.salespersonName || '',
                  saleAmount: Number(amount),
                  commissionPercent: Number(spItem?.commissionPercent || bill.commissionPercent || 0),
                  commissionAmount: earned,
                  storeId: bill.storeId,
                });
              } catch { /* ignore ledger errors */ }
            } catch (e) { /* ignore per-agent errors */ }
          }

        }
      } catch (e) {
        /* if settings lookup fails, fall back to original commission behavior below */
        // proceed into existing commission logic
        const items = bill.items || bill.bill_items || [];
        const totalBill = Number(bill.totalAmount || bill.grandTotal || 0) || 0;
        const agentTotals = {}; // salespersonId -> total commission for full bill

        items.forEach((it) => {
          try {
            const spId = it.salespersonId || null;
            if (!spId) return;
            const { rawComm } = calcOrderItemCommission(it, {});
            if (!agentTotals[spId]) agentTotals[spId] = 0;
            agentTotals[spId] += rawComm;
          } catch (e) { /* ignore per-item errors */ }
        });

        if (Object.keys(agentTotals).length === 0) {
          const spId = bill.salespersonId || bill.salesperson || null;
          const percent = Number(bill.commissionPercent || bill.commission || 0);
          if (spId && percent > 0 && totalBill > 0) {
            const commissionAmount = (Number(amount) * percent) / 100;
            agentTotals[spId] = commissionAmount;
          }
        }

        // Allocate commission proportionally to the collected `amount` (partial payments supported)
        const proportion = totalBill > 0 ? (Number(amount) / totalBill) : 0;
        for (const [spId, fullCommission] of Object.entries(agentTotals)) {
          try {
            const earned = Math.round(Number(fullCommission || 0) * proportion);
            if (earned <= 0) continue;
            const user = await localDB.users.where('uid').equals(spId).first();
            if (user) {
              const updated = {
                uid: user.uid,
                commissionEarned: Number(user.commissionEarned || 0) + earned,
                commissionPending: Number(user.commissionPending || 0) + earned,
              };
              await localDB.users.put({ ...user, ...updated });
            } else {
              await localDB.users.put({ uid: spId, commissionEarned: earned, commissionPending: earned });
            }

            // write a simple log for audit
            try {
              if (localDB.logs) {
                await localDB.logs.add({ logId: generateId('log'), action: 'commission_recorded', amount: earned, userId: spId, timestamp: nowISO() });
              }
            } catch { /* ignore */ }
          } catch (e) { /* ignore per-agent errors */ }
        }
      }
    } catch (err) {
      /* ignore commission errors */
    }

    if (paymentMethod === 'cash') {
      const cashTx = {
        txId: generateId('cash'),
        type: 'receive',
        amount: Number(amount),
        reason: `Payment — Bill ${bill.serialNo || bill.id}`,
        storeId: bill.storeId,
        billId: bill.billId || bill.id,
        isFromBill: true,                     // ✅ flag for summary
        userId: ctx.uid, userName: ctx.name,
        createdAt: nowISO(), synced: 0,
      };
      await localDB.cash_transactions.add(cashTx);
      if (isFirebaseReady() && isOnline()) {
        try {
          await addDoc(collection(getFirestoreDb(), COLLECTION_NAMES.cashTransactions), {
            ...cashTx, timestamp: serverTimestamp(),
          });
        } catch {
          await queueSync('cash_transaction', 'create', cashTx);
        }
      } else {
        await queueSync('cash_transaction', 'create', cashTx);
      }
    }

    await logActivity('PAYMENT_COLLECTED', {
      billId: bill.billId, amount, paymentMethod,
    });

    void import('./customerPersonaService').then(({ applyPaymentTransaction }) =>
      applyPaymentTransaction({
        bill,
        customer: bill.customer || { name: bill.customerName, phone: bill.customerPhone },
        storeId: bill.storeId,
        branchId: bill.branchId || bill.storeId,
        paidAmount: Number(amount),
        outstandingAfter: newOutstanding,
        paymentMethod,
        isCredit: String(paymentMethod || '').toLowerCase().includes('credit'),
        userId: ctx.uid,
        collectedBy: ctx.uid,
      }),
    );

    return { success: true, paymentId: payment.paymentId, newPaid, newOutstanding };
  } catch (err) {
    console.error('[ManagerService] markCommissionPaid error:', err);
    return { success: false, error: err?.message || String(err) };
  }
};

// ============================================================
// SECTION 4: CUSTOMERS
// ============================================================
export const searchCustomers = async (queryStr = '', branchId = null) => {
  try {
    const ctx = await getManagerContext();
    const scope = buildScope(ctx, branchId);

    let all = await fetchCollection(COLLECTION_NAMES.customers, 'customers', { scope });
    all = filterByBranchScope(all, scope);

    if (queryStr) {
      const q = queryStr.toLowerCase().trim();
      all = all.filter(c =>
        (c.name     || '').toLowerCase().includes(q) ||
        (c.nameLower|| '').includes(q) ||
        (c.phone    || '').includes(q) ||
        (c.email    || '').toLowerCase().includes(q)
      );
    }

    // Augment customers with computed stats (purchaseCount, totalSpent)
    // so manager view matches aggregated totals (similar to super-admin).
    try {
      const orders = await fetchAllOrders({ lim: DEFAULT_FETCH_ORDERS_LIMIT });
      const agg = {};
      const metricsByPhone = {};
      let walkin = { purchaseCount: 0, totalSpent: 0, lastOrder: null };

      orders.forEach(o => {
        if (!itemMatchesBranchScope(scope, o.storeId)) return;
        const total = Number(o.totalAmount || o.total || 0);
        const cid = o.customerId || (o.customer && (o.customer.customerId || o.customer.id)) || null;
        const phoneRaw = o.customer?.phone || o.customerPhone || '';
        const phoneKey = (phoneRaw || '').replace(/\D/g, '');
        const name = (o.customer?.name || o.customerName || '').toLowerCase().trim();

        const isWalkin = !cid && (!phoneRaw || !phoneRaw.trim()) && (!name || name.includes('walk-in'));

        const ts = parseDate(o.savedAt || o.createdAt).getTime();

        if (isWalkin) {
          walkin.purchaseCount += 1;
          walkin.totalSpent += total;
          if (!walkin.lastOrder || ts > walkin.lastOrder._ts) {
            walkin.lastOrder = { serialNo: o.serialNo || o.billSerial || (o.id || '').slice(-8), total, savedAt: o.savedAt || o.createdAt, _ts: ts };
          }
          return;
        }

        if (cid) {
          if (!agg[cid]) agg[cid] = { purchaseCount: 0, totalSpent: 0, lastOrder: null };
          agg[cid].purchaseCount += 1;
          agg[cid].totalSpent += total;
          if (!agg[cid].lastOrder || ts > agg[cid].lastOrder._ts) {
            agg[cid].lastOrder = { serialNo: o.serialNo || o.billSerial || (o.id || '').slice(-8), total, savedAt: o.savedAt || o.createdAt, _ts: ts };
          }
        }

        if (phoneKey) {
          if (!metricsByPhone[phoneKey]) metricsByPhone[phoneKey] = { purchaseCount: 0, totalSpent: 0, lastOrder: null, cid: cid || null };
          metricsByPhone[phoneKey].purchaseCount += 1;
          metricsByPhone[phoneKey].totalSpent += total;
          if (!metricsByPhone[phoneKey].lastOrder || ts > metricsByPhone[phoneKey].lastOrder._ts) {
            metricsByPhone[phoneKey].lastOrder = { serialNo: o.serialNo || o.billSerial || (o.id || '').slice(-8), total, savedAt: o.savedAt || o.createdAt, _ts: ts };
          }
        }
      });

      // Map customers and attach aggregated stats; ensure customerId exists
      all = all.map(c => {
        const cidKey = c.customerId || c.id;
        const phoneKey = (c.phone || '').replace(/\D/g, '');
        const byCid = agg[cidKey];
        const byPhone = phoneKey ? metricsByPhone[phoneKey] : null;
        return {
          ...c,
          customerId: cidKey,
          purchaseCount: (byCid && byCid.purchaseCount) || (byPhone && byPhone.purchaseCount) || 0,
          totalSpent: (byCid && byCid.totalSpent) || (byPhone && byPhone.totalSpent) || Number(c.totalSpent || 0),
          lastOrder: (byCid && byCid.lastOrder) || (byPhone && byPhone.lastOrder) || null,
          lastOrderDate: ((byCid && byCid.lastOrder && byCid.lastOrder.savedAt) || (byPhone && byPhone.lastOrder && byPhone.lastOrder.savedAt)) || c.lastOrderDate || null,
        };
      });
      // Remove individual walk-in records (they are aggregated into master row)
      all = all.filter(c => {
        const name = (c.name || '').toLowerCase();
        return !(name.includes('walk-in') || c.isWalkin);
      });

      // Insert master Walk-in row at top
      const masterWalkin = {
        customerId: 'virtual-walkin',
        name: 'Walk-in Customer',
        phone: '',
        city: 'All Branches',
        purchaseCount: walkin.purchaseCount,
        totalSpent: walkin.totalSpent,
        lastOrder: walkin.lastOrder || null,
        lastOrderDate: walkin.lastOrder?.savedAt || null,
        isWalkin: true,
      };

      all = [masterWalkin, ...all];
    } catch (e) {
      // If aggregation fails, fall back to stored fields
    }

    return all.sort(
      (a, b) =>
        parseDate(b.updatedAt || b.createdAt).getTime() -
        parseDate(a.updatedAt || a.createdAt).getTime()
    );
  } catch { return []; }
};

export const addCustomer = async (data) => {
  try {
    const ctx = await getManagerContext();
    const scope = {
      tenantId: 'aone',
      storeId: data.storeId || ctx.primaryBranch,
      branchId: data.storeId || ctx.primaryBranch,
      userId: ctx.uid,
    };
    const { mergeCustomerPersona } = await import('../repositories/customerRepository');
    const { buildEmptyPersona } = await import('../utils/customerPersonaSchema');
    const personaSeed = buildEmptyPersona(scope);
    const result = await mergeCustomerPersona({
      customer: data,
      scope,
      personaPatch: {
        ...personaSeed,
        email: data.email || '',
        creditLimit: Number(data.creditLimit || 0),
        address: data.address || '',
      },
    });

    const customer = {
      customerId: result?.customerId || generateId('cus'),
      name: data.name,
      nameLower: (data.name || '').toLowerCase(),
      phone: data.phone || '', email: data.email || '',
      city: data.city || '', address: data.address || '',
      creditLimit: Number(data.creditLimit || 0),
      outstandingBalance: 0, purchaseCount: 0, totalSpent: 0,
      storeId: scope.storeId,
      tenantId: scope.tenantId,
      branchId: scope.branchId,
      createdAt: nowISO(), updatedAt: nowISO(), synced: result?.offline ? 0 : 1,
    };
    await localDB.customers.add(customer);

    await logActivity('CUSTOMER_ADDED', {
      customerId: customer.customerId, name: customer.name,
    });
    return { success: true, customer };
  } catch (err) {
    return { success: false, error: err.message };
  }
};

export const updateCustomer = async (id, updates) => {
  try {
    const customer = await localDB.customers.get(id);
    if (!customer) throw new Error('Customer not found');

    await localDB.customers.put({
      ...customer, ...updates,
      nameLower: updates.name
        ? updates.name.toLowerCase()
        : customer.nameLower,
      updatedAt: nowISO(), synced: 0,
    });

    if (isFirebaseReady() && isOnline() && customer.customerId) {
      try {
        const snap = await getDocs(
          query(
            collection(getFirestoreDb(), COLLECTION_NAMES.customers),
            where('customerId', '==', customer.customerId)
          )
        );
        if (!snap.empty)
          await updateDoc(snap.docs[0].ref, {
            ...updates, updatedAt: serverTimestamp(),
          });
      } catch {
        await queueSync('customer', 'update', { id, updates });
      }
    } else {
      await queueSync('customer', 'update', { id, updates });
    }

    await logActivity('CUSTOMER_UPDATED', {
      customerId: customer.customerId,
    });
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
};

export const getCustomerHistory = async (customerId) => {
  try {
    const all = await fetchAllOrders({ lim: DEFAULT_FETCH_ORDERS_LIMIT });
    let customerBills = [];

    if (!customerId || customerId === 'virtual-walkin') {
      // Walk-in: orders without a registered customer (phone/name indicates walk-in)
      customerBills = all.filter(o => {
        const phone = o.customer?.phone || o.customerPhone || '';
        const name = (o.customer?.name || o.customerName || '').toLowerCase().trim();
        const isWalkin = !phone && (!name || name.includes('walk-in'));
        return isWalkin;
      });
    } else {
      customerBills = all.filter(
        o => o.customerId === customerId || o.customer?.customerId === customerId
      );
    }

    customerBills = customerBills.sort(
      (a, b) => parseDate(b.savedAt).getTime() - parseDate(a.savedAt).getTime()
    );

    const totalSpent = customerBills.reduce(
      (s, b) => s + Number(b.totalAmount || 0), 0
    );
    const totalPaid = customerBills.reduce(
      (s, b) => s + Number(b.paidAmount || 0), 0
    );

    return {
      bills: customerBills,
      stats: {
        billCount: customerBills.length,
        totalSpent, totalPaid,
        totalOutstanding: totalSpent - totalPaid,
      },
    };
  } catch {
    return { bills: [], stats: {} };
  }
};

// ============================================================
// SECTION 5: EXPENSES
// ============================================================
export const addExpense = async (data) => {
  try {
    const ctx = await getManagerContext();
    const expense = {
      expenseId: generateId('exp'),
      amount: Number(data.amount || 0),
      category: data.category || 'misc',
      description: data.description || '',
      storeId: data.storeId || ctx.primaryBranch,
      billerId: ctx.uid, createdByName: ctx.name,
      status: data.status || 'pending',
      date: data.date || nowISO(),
      createdAt: nowISO(), synced: 0,
    };
    await localDB.expenses.add(expense);

    if (isFirebaseReadyFn() && isOnline()) {
      try {
        await addDoc(collection(getFirestoreDb(), 'expenses'), {
          ...expense, createdAt: serverTimestamp(),
        });
      } catch {
        await queueSync('expense', 'create', expense);
      }
    } else {
      await queueSync('expense', 'create', expense);
    }

    await logActivity('EXPENSE_ADDED', {
      expenseId: expense.expenseId, amount: expense.amount,
    });
    return { success: true, expense };
  } catch (err) {
    return { success: false, error: err.message };
  }
};

export const listExpenses = async (filters = {}) => {
  try {
    const ctx = await getManagerContext();
    const scope = buildScope(ctx, filters.branchId);

    let all = await fetchCollection('expenses', 'expenses', { scope });

    all = filterByBranchScope(all, scope);

    if (filters.status)
      all = all.filter(e => e.status === filters.status);
    if (filters.category)
      all = all.filter(e => e.category === filters.category);
    if (filters.from) {
      const ts = new Date(filters.from).getTime();
      all = all.filter(
        e => parseDate(e.date || e.createdAt).getTime() >= ts
      );
    }
    if (filters.to) {
      const ts = new Date(filters.to).getTime() + 86400000 - 1;
      all = all.filter(
        e => parseDate(e.date || e.createdAt).getTime() <= ts
      );
    }

    return all.sort(
      (a, b) =>
        parseDate(b.createdAt).getTime() - parseDate(a.createdAt).getTime()
    );
  } catch { return []; }
};

export const approveExpense = async (expenseId) => {
  try {
    const ctx = await getManagerContext();
    const expense = await localDB.expenses
      .where('expenseId').equals(expenseId).first();
    if (!expense) throw new Error('Expense not found');

    const updates = {
      status: 'approved',
      approvedBy: ctx.uid, approvedByName: ctx.name,
      approvedAt: nowISO(),
    };
    await localDB.expenses.update(expense.id, { ...updates, synced: 0 });
    await queueSync('expense', 'update', { expenseId, ...updates });
    await logActivity('EXPENSE_APPROVED', { expenseId });
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
};

export const rejectExpense = async (expenseId, reason = '') => {
  try {
    const ctx = await getManagerContext();
    const expense = await localDB.expenses
      .where('expenseId').equals(expenseId).first();
    if (!expense) throw new Error('Expense not found');

    await localDB.expenses.update(expense.id, {
      status: 'rejected',
      rejectedBy: ctx.uid, rejectedReason: reason,
      rejectedAt: nowISO(), synced: 0,
    });
    await queueSync('expense', 'update', {
      expenseId, status: 'rejected', reason,
    });
    await logActivity('EXPENSE_REJECTED', { expenseId, reason });
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
};

// ============================================================
// SECTION 6: CASH FLOW — FULLY FIXED
// ============================================================

/** Shared cash-flow fetch — one orders + one cash_transactions read per page load. */
const fetchCashFlowRaw = async (branchId = null) => {
  const ctx = await getManagerContext();
  const scope = buildScope(ctx, branchId);

  const manual = filterByBranchScope(
    await fetchCollection(
      COLLECTION_NAMES.cashTransactions, 'cash_transactions',
      { orderField: 'timestamp', scope, lim: MANAGER_CASH_TX_LIMIT },
    ),
    scope,
  );

  const allOrders = await fetchAllOrders({
    lim: CASH_FLOW_ORDERS_LIMIT,
    branchId: branchId || undefined,
  });

  const shifts = await localDB.shifts.toArray();
  const activeShift = shifts.find(
    (s) =>
      s.status === SHIFT_STATUS.open
      && itemMatchesBranchScope(scope, s.storeId, { allowMissing: !scope.restrict }),
  );
  const openingBalance = activeShift
    ? Number(activeShift.openingBalance || 0)
    : 0;

  return { scope, manual, allOrders, activeShift, openingBalance };
};

const buildBillCashTransactions = (allOrders, scope) =>
  allOrders
    .filter((o) => {
      if (o.deleted || o.isDeleted) return false;
      const method = String(o.paymentMethod || 'cash').toLowerCase();
      if (method !== 'cash') return false;
      return itemMatchesBranchScope(scope, o.storeId);
    })
    .map((o) => ({
      txId: `bill_${o.id || o.localId}`,
      type: 'receive',
      amount: Number(o.paidAmount || o.totalAmount || 0),
      reason: `Bill #${o.serialNo || o.billSerial || o.id?.slice(0, 8)}`,
      storeId: o.storeId,
      billId: o.billId || o.id,
      isFromBill: true,
      userId: o.billerId || '',
      userName: o.billerName || o.cashierName || 'Cashier',
      createdAt: o.savedAt || o.createdAt,
      timestamp: o.savedAt || o.createdAt,
      reconciled: true,
      synced: o.synced !== false,
    }));

/**
 * ✅ FIXED: listCashTransactions
 * - Bills ka cash bhi include hota hai (orders collection se)
 * - All Time by default (no forced today filter)
 */
export const listCashTransactions = async (branchId = null, filters = {}) => {
  try {
    const { scope, manual, allOrders } = await fetchCashFlowRaw(branchId);

    let filteredManual = manual;
    if (filters.type)
      filteredManual = filteredManual.filter(c => c.type === filters.type);

    let billBased = [];
    const typeOk = !filters.type || filters.type === 'receive';
    if (typeOk) {
      billBased = buildBillCashTransactions(allOrders, scope);
    }

    const manualBillIds = new Set(
      filteredManual.filter(m => m.billId).map(m => m.billId)
    );
    const filteredBillBased = billBased.filter(
      b => !manualBillIds.has(b.billId)
    );

    let all = [...filteredManual, ...filteredBillBased];

    if (filters.from) {
      const ts = new Date(filters.from).getTime();
      all = all.filter(
        c => parseDate(c.createdAt || c.timestamp).getTime() >= ts
      );
    }
    if (filters.to) {
      const ts = new Date(filters.to).getTime() + 86400000 - 1;
      all = all.filter(
        c => parseDate(c.createdAt || c.timestamp).getTime() <= ts
      );
    }

    return all.sort(
      (a, b) =>
        parseDate(b.createdAt || b.timestamp).getTime() -
        parseDate(a.createdAt || a.timestamp).getTime()
    );
  } catch (err) {
    console.error('[ManagerService] listCashTransactions:', err);
    return [];
  }
};

/**
 * ✅ FIXED: addCashTransaction
 * - Cash receive / handover / transfer between users
 */
export const addCashTransaction = async (data) => {
  try {
    const ctx = await getManagerContext();
    const scope = buildScope(ctx);
    const storeId = data.storeId || ctx.primaryBranch;
    if (scope.restrict && storeId && !itemMatchesBranchScope(scope, storeId)) {
      throw new Error('Cannot record cash for another branch');
    }
    const tx = {
      txId: generateId('cash'),
      type: data.type || 'receive',
      amount: Number(data.amount || 0),
      reason: data.reason || '',
      storeId: storeId || ctx.primaryBranch,
      toUserId: data.toUserId || null,          // for transfer
      toUserName: data.toUserName || null,
      userId: ctx.uid, userName: ctx.name,
      isFromBill: false,
      reconciled: false,
      createdAt: nowISO(), synced: 0,
    };

    await localDB.cash_transactions.add(tx);

    if (isFirebaseReady() && isOnline()) {
      try {
        await addDoc(collection(getFirestoreDb(), COLLECTION_NAMES.cashTransactions), {
          ...tx, timestamp: serverTimestamp(),
        });
      } catch {
        await queueSync('cash_transaction', 'create', tx);
      }
    } else {
      await queueSync('cash_transaction', 'create', tx);
    }

    await logActivity('CASH_TX_CREATED', {
      txId: tx.txId, type: tx.type, amount: tx.amount,
    });
    return { success: true, transaction: tx };
  } catch (err) {
    return { success: false, error: err.message };
  }
};

export const markCashTransactionReconciled = async (txId) => {
  try {
    const ctx = await getManagerContext();
    const tx = await localDB.cash_transactions
      .where('txId').equals(txId).first();
    if (!tx) throw new Error('Transaction not found');

    await localDB.cash_transactions.update(tx.id, {
      reconciled: true,
      reconciledAt: nowISO(), reconciledBy: ctx.uid,
      synced: 0,
    });
    await queueSync('cash_transaction', 'update', {
      txId, reconciled: true,
    });
    await logActivity('CASH_TX_RECONCILED', { txId });
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
};

/**
 * ✅ FIXED: getCashSummary
 * - dateKey null ho to All Time
 * - cashFromBills alag track hota hai
 * - billsCount include hai
 */
export const getCashSummary = async (branchId = null, dateKey = null) => {
  try {
    const { scope, manual, allOrders, activeShift, openingBalance } = await fetchCashFlowRaw(branchId);

    const fromTs = dateKey ? new Date(dateKey).getTime() : 0;
    const toTs = dateKey
      ? new Date(dateKey).getTime() + 86400000 - 1
      : Date.now() + 86400000;

    const filteredCash = manual.filter((c) => {
      const ts = parseDate(c.createdAt || c.timestamp).getTime();
      return ts >= fromTs && ts <= toTs;
    });

    const cashBills = allOrders.filter((o) => {
      if (o.deleted || o.isDeleted) return false;
      const method = String(o.paymentMethod || 'cash').toLowerCase();
      if (method !== 'cash') return false;
      if (!itemMatchesBranchScope(scope, o.storeId)) return false;
      const ts = parseDate(o.savedAt || o.createdAt).getTime();
      return ts >= fromTs && ts <= toTs;
    });

    // Calculate from manual transactions
    let received = 0, paid = 0, transferred = 0, expenses = 0;
    let manualCount = 0;

    filteredCash.forEach(t => {
      const amt = Number(t.amount || 0);
      switch (t.type) {
        case 'receive':
        case 'deposit':
          // Only count non-bill receives here
          // Bill-based are counted separately below
          if (!t.isFromBill && !t.billId) {
            received += amt;
          }
          manualCount++;
          break;
        case 'handover':
        case 'withdrawal': paid     += amt; manualCount++; break;
        case 'transfer':   transferred += amt; manualCount++; break;
        case 'expense':    expenses  += amt; manualCount++; break;
      }
    });

    // Cash from bills
    const cashFromBills = cashBills.reduce(
      (s, o) => s + Number(o.paidAmount || o.totalAmount || 0), 0
    );
    const billsCount = cashBills.length;

    // Total received = manual receives + bill cash
    const totalReceived = received + cashFromBills;
    const closingBalance =
      openingBalance + totalReceived - paid - transferred - expenses;

    return {
      openingBalance,
      received: totalReceived,
      cashFromBills,
      billsCount,
      paid,
      transferred,
      expenses,
      closingBalance,
      transactionCount: filteredCash.length + billsCount,
      manualCount,
      activeShift: activeShift || null,
    };
  } catch (err) {
    console.error('[ManagerService] getCashSummary:', err);
    return {};
  }
};

/** Cash Flow page — single Firebase round-trip for transactions + shift meta. */
export const listCashFlowPageData = async (branchId = null, filters = {}) => {
  try {
    const { scope, manual, allOrders, activeShift, openingBalance } = await fetchCashFlowRaw(branchId);

    let filteredManual = manual;
    if (filters.type)
      filteredManual = filteredManual.filter((c) => c.type === filters.type);

    let billBased = [];
    const typeOk = !filters.type || filters.type === 'receive';
    if (typeOk) {
      billBased = buildBillCashTransactions(allOrders, scope);
    }

    const manualBillIds = new Set(
      filteredManual.filter((m) => m.billId).map((m) => m.billId),
    );
    let all = [...filteredManual, ...billBased.filter((b) => !manualBillIds.has(b.billId))];

    if (filters.from) {
      const ts = new Date(filters.from).getTime();
      all = all.filter((c) => parseDate(c.createdAt || c.timestamp).getTime() >= ts);
    }
    if (filters.to) {
      const ts = new Date(filters.to).getTime() + 86400000 - 1;
      all = all.filter((c) => parseDate(c.createdAt || c.timestamp).getTime() <= ts);
    }

    const transactions = all.sort(
      (a, b) =>
        parseDate(b.createdAt || b.timestamp).getTime()
        - parseDate(a.createdAt || a.timestamp).getTime(),
    );

    return {
      transactions,
      openingBalance,
      activeShift: activeShift || null,
    };
  } catch (err) {
    console.error('[ManagerService] listCashFlowPageData:', err);
    return { transactions: [], openingBalance: 0, activeShift: null };
  }
};

// ============================================================
// SECTION 7: SALESPERSONS
// ============================================================
export const getSalespersons = async () => {
  try {
    const ctx = await getManagerContext();
    const { buildManagerSalespersonList } = await import('./commissionService');
    const list = await buildManagerSalespersonList();

    if (!ctx.restrictBranches) {
      return list;
    }

    return list.filter((u) => userMatchesBranchScope(
      { restrict: true, branchIds: ctx.branchIds },
      u,
    ));
  } catch { return []; }
};

export const markCommissionPaid = async (uid, amount, branchId, note = '') => {
  try {
    const ctx  = await getManagerContext();
    // use dynamic import to ensure test mocks are respected at runtime
    const runtimeDbModule = await import('../db/index');
    const runtimeDB = (runtimeDbModule && runtimeDbModule.db) || localDB;
    const user = await runtimeDB.users.where('uid').equals(uid).first();
    if (!user) throw new Error('Salesperson not found');

    const pending = Number(user.commissionPending || 0);
    // If amount is not provided, pay full pending
    if (amount == null) amount = pending;
    amount = Number(amount || 0);
    if (amount <= 0) throw new Error('Invalid amount');
    if (amount > pending + 0.001) throw new Error(`Amount exceeds pending (Rs ${pending})`);

    // Use put to support test/mock stores which key on `uid`
    try {
      await runtimeDB.users.put({ ...user,
        commissionPending: pending - amount,
        commissionPaid: Number(user.commissionPaid || 0) + amount,
        lastCommissionPaidAt: nowISO(), synced: 0,
      });
      const u2 = await runtimeDB.users.where('uid').equals(uid).first();
    } catch {
      try { await runtimeDB.users.update && await runtimeDB.users.update(user.id, {
        commissionPending: pending - amount,
        commissionPaid: Number(user.commissionPaid || 0) + amount,
        lastCommissionPaidAt: nowISO(), synced: 0,
      }); } catch { }
    }

    const tx = {
      txId: generateId('cash'),
      type: 'handover',
      amount,
      reason:
        `Commission payout to ${user.name || user.displayName}` +
        (note ? ` - ${note}` : ''),
      storeId: branchId || ctx.primaryBranch,
      userId: ctx.uid, toUserId: uid,
      isFromBill: false,
      createdAt: nowISO(), synced: 0,
    };
    await runtimeDB.cash_transactions.add(tx);
    await queueSync('user', 'update', { uid, commissionPending: pending - amount });
    await queueSync('cash_transaction', 'create', tx);
    await logActivity('COMMISSION_PAID', { uid, amount });

    return { success: true, amount };
  } catch (err) {
    return { success: false, error: err.message };
  }
};

// ============================================================
// SECTION 8: RETURNS
// ============================================================
export const listReturns = async (filters = {}) => {
  try {
    const ctx = await getManagerContext();
    const scope = buildScope(ctx, filters.branchId);

    let all = await fetchCollection(
      COLLECTION_NAMES.returns, 'returns',
      { orderField: 'processedAt', scope }
    );

    all = filterByBranchScope(all, scope);

    if (filters.status)
      all = all.filter(r => r.status === filters.status);

    return all.sort(
      (a, b) =>
        parseDate(b.processedAt || b.createdAt).getTime() -
        parseDate(a.processedAt || a.createdAt).getTime()
    );
  } catch { return []; }
};

export const approveReturn = async (returnId) => {
  try {
    const ctx = await getManagerContext();
    const ret = await localDB.returns
      .where('returnId').equals(returnId).first();
    if (!ret) throw new Error('Return not found');

    await localDB.returns.update(ret.id, {
      status: 'approved',
      approvedBy: ctx.uid, approvedAt: nowISO(), synced: 0,
    });

    if (Number(ret.refundAmount) > 0) {
      const tx = {
        txId: generateId('cash'),
        type: 'handover',
        amount: Number(ret.refundAmount),
        reason: `Refund for return ${returnId}`,
        storeId: ret.storeId,
        userId: ctx.uid,
        isFromBill: false,
        createdAt: nowISO(), synced: 0,
      };
      await localDB.cash_transactions.add(tx);
      await queueSync('cash_transaction', 'create', tx);
    }

    await queueSync('return', 'update', { returnId, status: 'approved' });
    await logActivity('RETURN_APPROVED', {
      returnId, refundAmount: ret.refundAmount,
    });

    void import('./customerPersonaService').then(({ applyReturnTransaction }) =>
      applyReturnTransaction({
        customer: ret.customer,
        storeId: ret.storeId,
        branchId: ret.storeId,
        refundAmount: ret.refundAmount,
        userId: ctx.uid,
      }),
    );

    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
};

export const rejectReturn = async (returnId, reason = '') => {
  try {
    const ctx = await getManagerContext();
    const ret = await localDB.returns
      .where('returnId').equals(returnId).first();
    if (!ret) throw new Error('Return not found');

    await localDB.returns.update(ret.id, {
      status: 'rejected',
      rejectedBy: ctx.uid, rejectedReason: reason,
      rejectedAt: nowISO(), synced: 0,
    });
    await queueSync('return', 'update', {
      returnId, status: 'rejected',
    });
    await logActivity('RETURN_REJECTED', { returnId, reason });
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
};

// ============================================================
// SECTION 9: SHIFTS
// ============================================================
export const getActiveShift = async (branchId = null) => {
  try {
    const ctx    = await getManagerContext();
    const target = branchId || ctx.primaryBranch;
    const all    = await localDB.shifts.toArray();
    return all.find(
      s =>
        s.status === SHIFT_STATUS.open &&
        (!target || s.storeId === target)
    ) || null;
  } catch { return null; }
};

export const openShift = async ({
  managerId, storeId, openingBalance = 0,
}) => {
  try {
    const ctx      = await getManagerContext();
    const existing = await getActiveShift(storeId);
    if (existing)
      throw new Error('A shift is already open for this branch');

    const shift = {
      shiftId: generateId('shift'),
      managerId: managerId || ctx.uid,
      storeId: storeId || ctx.primaryBranch,
      status: SHIFT_STATUS.open,
      openingBalance: Number(openingBalance),
      openedAt: nowISO(), openedBy: ctx.uid, synced: 0,
    };
    await localDB.shifts.add(shift);

    if (isFirebaseReady() && isOnline()) {
      try {
        await addDoc(collection(getFirestoreDb(), 'shifts'), {
          ...shift, openedAt: serverTimestamp(),
        });
      } catch {
        await queueSync('shift', 'create', shift);
      }
    } else {
      await queueSync('shift', 'create', shift);
    }

    await logActivity('SHIFT_OPENED', {
      shiftId: shift.shiftId, openingBalance,
    });
    return { success: true, shift };
  } catch (err) {
    return { success: false, error: err.message };
  }
};

export const closeShift = async (shiftId, closingBalance = 0) => {
  try {
    const ctx   = await getManagerContext();
    const shift = await localDB.shifts
      .where('shiftId').equals(shiftId).first();
    if (!shift) throw new Error('Shift not found');

    const cashSummary = await getCashSummary(
      shift.storeId, shift.openedAt.slice(0, 10)
    );
    const expectedBalance = cashSummary.closingBalance || 0;
    const variance        = Number(closingBalance) - expectedBalance;

    await localDB.shifts.update(shift.id, {
      status: SHIFT_STATUS.closed,
      closingBalance: Number(closingBalance),
      expectedBalance, variance,
      closedAt: nowISO(), closedBy: ctx.uid, synced: 0,
    });

    if (isFirebaseReady() && isOnline()) {
      try {
        const q   = query(
          collection(getFirestoreDb(), 'shifts'),
          where('shiftId', '==', shiftId)
        );
        const snap = await getDocs(q);
        if (!snap.empty) {
          await updateDoc(snap.docs[0].ref, {
            status: SHIFT_STATUS.closed,
            closingBalance: Number(closingBalance),
            expectedBalance, variance,
            closedAt: serverTimestamp(),
            closedBy: ctx.uid,
          });
        }
      } catch {
        await queueSync('shift', 'update', { shiftId, closingBalance, variance });
      }
    } else {
      await queueSync('shift', 'update', { shiftId, closingBalance, variance });
    }

    await logActivity('SHIFT_CLOSED', { shiftId, closingBalance, variance });
    return { success: true, variance };
  } catch (err) {
    return { success: false, error: err.message };
  }
};

// ============================================================
// SECTION 10: REPORTS
// ============================================================
export const generateReport = async (type, filters = {}) => {
  try {
    const ctx = await getManagerContext();
    const scope = buildScope(ctx, filters.branchId);

    let data = [];

    switch (type) {
      case 'sales': {
        let all = await fetchAllOrders({
          branchId: filters.branchId,
          lim: MANAGER_REPORTS_ORDERS_LIMIT,
        });
        all = filterByBranchScope(all, scope);
        all = all.filter(isReportPaidBill);
        if (filters.from) {
          const ts = new Date(filters.from).getTime();
          all = all.filter(
            o => parseDate(o.savedAt || o.createdAt || o.paidAt).getTime() >= ts
          );
        }
        if (filters.to) {
          const ts = new Date(filters.to).getTime() + 86400000 - 1;
          all = all.filter(
            o => parseDate(o.savedAt || o.createdAt || o.paidAt).getTime() <= ts
          );
        }
        if (filters.billerId)
          all = all.filter(o => o.billerId === filters.billerId);
        data = all;
        break;
      }
      case 'expense':
        data = await listExpenses(filters);
        break;
      case 'cash':
        data = await listCashTransactions(filters.branchId, filters);
        break;
      case 'credit': {
        let all = await fetchAllOrders({
          branchId: filters.branchId,
          lim: MANAGER_REPORTS_ORDERS_LIMIT,
        });
        all = filterByBranchScope(all, scope);
        data = all.filter(
          o => Number(o.totalAmount || 0) - Number(o.paidAmount || 0) > 0
        );
        break;
      }
      case 'return':
        data = await listReturns(filters);
        break;
      case 'commission':
        data = await getSalespersons();
        break;
      case 'discount': {
        let all = await fetchAllOrders({
          branchId: filters.branchId,
          lim: MANAGER_REPORTS_ORDERS_LIMIT,
        });
        all = filterByBranchScope(all, scope);
        data = all.filter(
          (o) => Number(o.totalDiscount ?? o.discountAmount ?? o.billDiscount ?? 0) > 0,
        );
        break;
      }
    }

    return data;
  } catch { return []; }
};

// ============================================================
// SECTION 11: ACTIVITY LOGS
// ============================================================
export const getActivityLogs = async (filters = {}) => {
  try {
    const ctx = await getManagerContext();
    const scope = buildScope(ctx, filters.branchId);

    const seen = new Set();
    const all = [];

    const pushLog = (log) => {
      if (!log?.logId) return;
      if (seen.has(log.logId)) return;
      seen.add(log.logId);
      all.push(log);
    };

    // Offline / local queue
    try {
      const localRows = await localDB.activity_logs_local.toArray();
      localRows.forEach((row) => {
        pushLog(normalizeManagerActivityLog(row, 'offline'));
      });
    } catch (e) {
      console.warn('[ManagerService] local activity logs:', e?.message);
    }

    // Firebase — same sources as admin Audit Logs (manager read allowed in rules)
    if (isFirebaseReady() && isOnline()) {
      const lim = filters.limit || ACTIVITY_LOGS_DOC_LIMIT;
      await Promise.all(
        MANAGER_ACTIVITY_SOURCES.map(async ({ key, collection: colName, orderField }) => {
          try {
            const q = query(
              collection(getFirestoreDb(), colName),
              orderBy(orderField, 'desc'),
              limit(lim),
            );
            const snap = await getDocs(q);
            snap.docs.forEach((docSnap) => {
              pushLog(
                normalizeManagerActivityLog(
                  { _id: docSnap.id, ...docSnap.data() },
                  key,
                ),
              );
            });
          } catch (e) {
            console.warn(`[ManagerService] activity source ${key}:`, e?.message);
          }
        }),
      );
    }

    // Resolve user names from local cache
    let usersById = {};
    try {
      const users = await localDB.users.toArray();
      users.forEach((u) => {
        if (u.uid) {
          usersById[u.uid] = u.name || u.displayName || u.email || u.uid;
        }
      });
    } catch { /* ignore */ }

    let filtered = all.map((log) => ({
      ...log,
      userName:
        log.userName ||
        usersById[log.userId] ||
        log.userId ||
        'Unknown',
      timestamp: toISOStr(log.timestamp),
    }));

    if (scope.restrict && !scope.branchIds.length) {
      return [];
    }

    filtered = filtered.filter((l) => activityLogMatchesBranch(l, scope.branchIds));

    if (filters.userId)
      filtered = filtered.filter((l) => l.userId === filters.userId);
    if (filters.action)
      filtered = filtered.filter((l) => l.action === filters.action);
    if (filters.from) {
      const ts = new Date(filters.from).getTime();
      filtered = filtered.filter(
        (l) => parseDate(l.timestamp).getTime() >= ts,
      );
    }
    if (filters.to) {
      const ts = new Date(filters.to).getTime() + 86400000 - 1;
      filtered = filtered.filter(
        (l) => parseDate(l.timestamp).getTime() <= ts,
      );
    }

    return filtered
      .sort(
        (a, b) =>
          parseDate(b.timestamp).getTime() -
          parseDate(a.timestamp).getTime(),
      )
      .slice(0, filters.limit || 500);
  } catch (e) {
    console.error('[ManagerService] getActivityLogs:', e);
    return [];
  }
};

// ============================================================
// SECTION 12: APPROVALS
// ============================================================
export const submitBillForManagerApproval = async (localBillId, type = APPROVAL_TYPES.largeBill, note = '') => {
  try {
    const ctx = await getManagerContext();
    let bill = await localDB.orders.where('localId').equals(localBillId).first()
      || await localDB.orders.where('billId').equals(localBillId).first();
    if (!bill) throw new Error('Bill not found');

    const request = {
      requestId: generateId('apr'),
      billId: bill.billId || bill.id || localBillId,
      localBillId,
      type: type || APPROVAL_TYPES.largeBill,
      note: note || '',
      status: APPROVAL_STATUS.pending,
      requestedBy: ctx.uid,
      requestedByName: ctx.name,
      requestedByRole: ctx.primaryRole || ctx.role || 'biller',
      storeId: bill.storeId || ctx.primaryBranch,
      billSnapshot: {
        serialNo: bill.serialNo || bill.id,
        totalAmount: Number(bill.totalAmount || bill.total || 0),
        paymentMethod: bill.paymentMethod || bill.paymentType || 'cash',
      },
      createdAt: nowISO(),
      synced: 0,
    };

    // mark bill pending locally
    try {
      await localDB.orders.update(bill.id, { status: BILL_STATUS.pending, syncStatus: SYNC_STATUS.pending, synced: 0 });
    } catch { /* ignore */ }

    // queue for sync and write activity
    await queueSync('approval_request', 'create', request);
    try { if (localDB.approval_requests) await localDB.approval_requests.add(request); } catch { /* ignore */ }
    await logActivity('APPROVAL_REQUEST_CREATED', { requestId: request.requestId, billId: request.billId });

    if (isFirebaseReady() && isOnline()) {
      try {
        await addDoc(collection(getFirestoreDb(), COLLECTION_NAMES.approvalRequests), { ...request, createdAt: serverTimestamp() });
      } catch { /* keep queued */ }
    }

    return { success: true, request };
  } catch (err) {
    return { success: false, error: err.message };
  }
};

export const getApprovalRequests = async (filters = {}) => {
  try {
    const ctx = await getManagerContext();
    const scope = buildScope(ctx, filters.storeId || filters.branchId);
    const statusFilter = filters.status || null;
    const lim = 150;

    if (scope.restrict && !scope.branchIds?.length) return [];

    const sortItems = (rows) =>
      (rows || []).sort(
        (a, b) =>
          parseDate(b.createdAt).getTime() - parseDate(a.createdAt).getTime(),
      );

    let items = [];

    if (isFirebaseReadyFn() && isOnline()) {
      try {
        const col = collection(getFirestoreDb(), COLLECTION_NAMES.approvalRequests);
        const mapSnap = (snap) => snap.docs.map(mapFirestoreDoc);

        const fetchBranchPlain = async (branchIds) => {
          const constraints =
            branchIds.length === 1
              ? [where('storeId', '==', branchIds[0])]
              : [where('storeId', 'in', branchIds.slice(0, 10))];
          const q = query(col, ...constraints, limit(lim * 4));
          let rows = mapSnap(await getDocs(q));
          if (statusFilter) rows = rows.filter((i) => i.status === statusFilter);
          return sortItems(rows).slice(0, lim);
        };

        if (scope.restrict) {
          items = await fetchBranchPlain(scope.branchIds);
        } else {
          items = await fetchCollection(
            COLLECTION_NAMES.approvalRequests,
            'approval_requests',
            { lim, scope },
          );
        }

        if (items.length > 0 && localDB.approval_requests) {
          try {
            await localDB.approval_requests.bulkPut(
              items.map((i) => ({ ...i, synced: 1 })),
            );
          } catch { /* ignore cache */ }
        }
      } catch {
        items = await fetchCollection(
          COLLECTION_NAMES.approvalRequests,
          'approval_requests',
          { lim, scope },
        );
      }
    } else {
      items = await fetchCollection(
        COLLECTION_NAMES.approvalRequests,
        'approval_requests',
        { lim, scope },
      );
    }

    if (!Array.isArray(items)) items = [];
    if (statusFilter) items = items.filter((i) => i.status === statusFilter);
    if (filters.requestedBy) items = items.filter((i) => i.requestedBy === filters.requestedBy);
    items = filterByBranchScope(items, scope);
    return sortItems(items);
  } catch {
    return [];
  }
};

export const processApprovalRequest = async (requestDocIdOrRequestId, action = 'approve', reason = '') => {
  try {
    const ctx = await getManagerContext();
    const lookupKey = firestorePathId(requestDocIdOrRequestId)
      ?? (requestDocIdOrRequestId != null && typeof requestDocIdOrRequestId !== 'object'
        ? String(requestDocIdOrRequestId).trim() || null
        : null);

    // Find request either by requestId field or Firestore doc id
    let request = null;
    if (isFirebaseReady() && isOnline()) {
      if (lookupKey) {
        try {
          const q = query(
            collection(getFirestoreDb(), COLLECTION_NAMES.approvalRequests),
            where('requestId', '==', lookupKey),
            limit(1),
          );
          const snap2 = await getDocs(q);
          if (!snap2.empty) request = mapFirestoreDoc(snap2.docs[0]);
        } catch { /* ignore */ }
      }
      const docIdTry = firestorePathId(lookupKey);
      if (!request && docIdTry) {
        try {
          const snap = await getDoc(doc(getFirestoreDb(), COLLECTION_NAMES.approvalRequests, docIdTry));
          if (snap.exists()) request = mapFirestoreDoc(snap);
        } catch { /* ignore */ }
      }
    }

    // Fallback: try reading from local sync queue (best-effort)
    if (!request && lookupKey) {
      const qItems = await localDB.sync_queue.toArray().catch(() => []);
      request = qItems.map(i => i.data).find(d => d && (d.requestId === lookupKey || d.id === lookupKey));
    }

    // Fallback: try local approval_requests store
    if (!request && localDB.approval_requests) {
      try {
        if (lookupKey) {
          const localReq = await localDB.approval_requests
            .where('requestId').equals(lookupKey).first();
          if (localReq) request = localReq;
        }
        if (!request && typeof requestDocIdOrRequestId === 'number') {
          const localReq = await localDB.approval_requests.get(requestDocIdOrRequestId);
          if (localReq) request = localReq;
        }
      } catch { /* ignore */ }
    }

    if (!request) throw new Error('Approval request not found');

    const scope = buildScope(ctx);
    if (scope.restrict) {
      const reqBranch = request.storeId || request.branchId || '';
      if (!reqBranch || !itemMatchesBranchScope(scope, reqBranch)) {
        throw new Error('This approval belongs to another branch');
      }
    }

    const updates = {};
    if (action === 'approve') {
      updates.status = APPROVAL_STATUS.approved;
      updates.approvedBy = ctx.uid;
      updates.approvedByName = ctx.name;
      updates.approvedAt = nowISO();
      updates.reason = reason || '';
    } else if (action === 'reject') {
      updates.status = APPROVAL_STATUS.rejected;
      updates.rejectedBy = ctx.uid;
      updates.rejectedByName = ctx.name;
      updates.rejectedAt = nowISO();
      updates.rejectedReason = reason || '';
    } else if (action === 'cancel') {
      updates.status = APPROVAL_STATUS.cancelled;
      updates.cancelledBy = ctx.uid;
      updates.cancelledByName = ctx.name;
      updates.cancelledAt = nowISO();
      updates.cancelReason = reason || '';
    } else {
      throw new Error('Unknown action');
    }

    // Update Firestore request doc if possible
    const firestoreDocId = firestorePathId(request.firestoreId) || firestorePathId(request.id);
    const db = getFirestoreDb();
    if (isFirebaseReady() && isOnline() && firestoreDocId && db) {
      try {
        await updateDoc(
          doc(db, COLLECTION_NAMES.approvalRequests, firestoreDocId),
          { ...updates, updatedAt: serverTimestamp() },
        );
      } catch (err) {
        await queueSync('approval_request', 'update', { requestId: request.requestId || firestoreDocId, ...updates });
        const msg = String(err?.message || '');
        if (msg.includes('indexOf') || msg.includes('Invalid document reference')) {
          throw new Error('Invalid approval record — refresh the page and try again');
        }
        if (msg.includes('permission') || msg.includes('insufficient')) {
          throw new Error('Permission denied — deploy Firestore rules (manager update on approvalRequests)');
        }
        throw new Error(msg || 'Could not update approval request');
      }
    } else {
      await queueSync('approval_request', 'update', { requestId: request.requestId || firestoreDocId || lookupKey, ...updates });
    }

    if (localDB.approval_requests) {
      try {
        const localReq = await localDB.approval_requests
          .where('requestId').equals(request.requestId || request.id).first();
        if (localReq?.id) {
          await localDB.approval_requests.update(localReq.id, { ...updates, synced: 1 });
        }
      } catch { /* ignore */ }
    }

    // Special handling for cancellation requests
    if (request.type === 'cancellation') {
      if (updates.status === APPROVAL_STATUS.approved) {
        // Manager confirms cancellation -> moves to "manager_cancelled", escalates to Super Admin
        const managerReason = reason || 'Confirmed by manager';
        
        // 1. Update local order status if exists
        try {
          const local = await localDB.orders.where('localId').equals(request.localBillId).first()
            || await localDB.orders.where('billId').equals(request.localBillId).first();
          if (local) {
            await localDB.orders.update(local.id, {
              status: 'manager_cancelled',
              isActiveOrder: false,
              managerCancelReason: managerReason,
              managerCancelledBy: ctx.name,
              managerCancelledAt: nowISO()
            });
          }
        } catch { }

        // 2. Update Firestore order if online
        const orderRef = orderDocRef(resolveApprovalOrderId(request));
        if (isFirebaseReady() && isOnline() && orderRef) {
          try {
            await updateDoc(orderRef, {
              status: 'manager_cancelled',
              isActiveOrder: false,
              managerCancelReason: managerReason,
              managerCancelledBy: ctx.name,
              managerCancelledAt: serverTimestamp()
            });
          } catch { }
        }

        // 3. Create a super-admin approval request so super-admin can finalize
        const superReq = {
          requestId: generateId('superreq'),
          parentRequestId: request.requestId || request.id || null,
          type: 'cancellation',
          billId: request.billId || null,
          localBillId: request.localBillId || null,
          status: APPROVAL_STATUS.pending,
          requestedBy: ctx.uid,
          requestedByName: ctx.name,
          requestedByRole: 'manager',
          storeId: request.storeId || ctx.primaryBranch,
          cashierCancelReason: request.cashierCancelReason || request.reason || '',
          managerCancelReason: managerReason,
          billSnapshot: request.billSnapshot || request.bill || {},
          createdAt: nowISO(),
        };

        if (localDB.super_approval_requests) {
          try {
            await localDB.super_approval_requests.add({
              ...superReq,
              synced: isFirebaseReady() && isOnline() ? 1 : 0,
            });
          } catch { }
        }

        if (isFirebaseReady() && isOnline()) {
          try {
            await addDoc(collection(getFirestoreDb(), COLLECTION_NAMES.superApprovalRequests), {
              ...superReq,
              createdAt: serverTimestamp()
            });
          } catch {
            await queueSync('super_approval_request', 'create', superReq);
          }
        } else {
          await queueSync('super_approval_request', 'create', superReq);
        }
      } else if (updates.status === APPROVAL_STATUS.rejected) {
        // Manager rejects cancellation -> reset order back to pending/active
        try {
          const local = await localDB.orders.where('localId').equals(request.localBillId).first()
            || await localDB.orders.where('billId').equals(request.localBillId).first();
          if (local) {
            await localDB.orders.update(local.id, {
              status: 'pending',
              isActiveOrder: true,
              managerRejectionReason: reason || 'Rejected by manager',
              managerRejectedBy: ctx.name,
              managerRejectedAt: nowISO()
            });
          }
        } catch { }

        const rejectOrderRef = orderDocRef(resolveApprovalOrderId(request));
        if (isFirebaseReady() && isOnline() && rejectOrderRef) {
          try {
            await updateDoc(rejectOrderRef, {
              status: 'pending',
              isActiveOrder: true,
              managerRejectionReason: reason || 'Rejected by manager',
              managerRejectedBy: ctx.name,
              managerRejectedAt: serverTimestamp()
            });
          } catch { }
        }
      }

      await logActivity('APPROVAL_REQUEST_PROCESSED', { requestId: request.requestId || request.id, action, by: ctx.uid });
      return { success: true };
    }

    // If approved, update the original bill and copy to manager-specific collection
    if (updates.status === APPROVAL_STATUS.approved) {
      try {
        // 1. Update local order status
        try {
          const local = await localDB.orders.where('localId').equals(request.localBillId).first()
            || await localDB.orders.where('billId').equals(request.localBillId).first();
          if (local) {
            // mark as manager-approved and pending super-admin
            await localDB.orders.update(local.id, { status: BILL_STATUS.pending_superadmin, managerApprovedBy: ctx.uid, managerApprovedAt: nowISO(), syncStatus: SYNC_STATUS.pending, synced: 0 });
          }
        } catch { /* ignore */ }

        // 2. Add manager approved order locally and queue for sync
        const managerApprovedData = {
          requestId: request.requestId || null,
          billId: request.billId || null,
          approvedBy: ctx.uid,
          approvedByName: ctx.name,
          storeId: request.storeId || ctx.primaryBranch,
          billSnapshot: request.billSnapshot || {},
          approvedAt: nowISO(),
        };

        if (localDB.manager_approved_orders) {
          try {
            await localDB.manager_approved_orders.add({
              ...managerApprovedData,
              synced: isFirebaseReady() && isOnline() ? 1 : 0,
            });
          } catch { /* ignore */ }
        }

        // 3. Create a super-admin approval request so super-admin can finalize
        const superReq = {
          requestId: generateId('superreq'),
          parentRequestId: request.requestId || request.id || null,
          billId: request.billId || null,
          localBillId: request.localBillId || null,
          status: APPROVAL_STATUS.pending,
          requestedBy: ctx.uid,
          requestedByName: ctx.name,
          storeId: request.storeId || ctx.primaryBranch,
          billSnapshot: request.billSnapshot || request.bill || {},
          createdAt: nowISO(),
        };

        if (localDB.super_approval_requests) {
          try {
            await localDB.super_approval_requests.add({
              ...superReq,
              synced: isFirebaseReady() && isOnline() ? 1 : 0,
            });
          } catch { /* ignore */ }
        }

        // 4. Update Firestore order and add collections if online
        if (isFirebaseReady() && isOnline()) {
          try {
            const approveOrderRef = orderDocRef(resolveApprovalOrderId(request));
            if (approveOrderRef) {
              await updateDoc(approveOrderRef, {
                status: BILL_STATUS.pending_superadmin,
                managerApprovedBy: ctx.uid,
                managerApprovedAt: serverTimestamp(),
              });
            }
            // Create a manager-specific copy for easy reporting
            await addDoc(collection(getFirestoreDb(), 'managerApprovedOrders'), {
              ...managerApprovedData,
              approvedAt: serverTimestamp(),
            });
          } catch {
            await queueSync('manager_approved_order', 'create', managerApprovedData);
          }

          try {
            await addDoc(collection(getFirestoreDb(), COLLECTION_NAMES.superApprovalRequests), { ...superReq, createdAt: serverTimestamp() });
          } catch {
            await queueSync('super_approval_request', 'create', superReq);
          }
        } else {
          // If offline, queue them for sync
          await queueSync('manager_approved_order', 'create', managerApprovedData);
          await queueSync('super_approval_request', 'create', superReq);
        }
      } catch (err) { /* ignore non-fatal errors */ }
    }
    // If cancelled by manager, mark order cancelled and record to managerCancelledOrders
    if (updates.status === APPROVAL_STATUS.cancelled) {
      try {
        // Update local order status to cancelled
        try {
          const local = await localDB.orders.where('localId').equals(request.localBillId).first()
            || await localDB.orders.where('billId').equals(request.localBillId).first();
          if (local) {
            await localDB.orders.update(local.id, { status: BILL_STATUS.cancelled, cancelledBy: ctx.uid, cancelledAt: nowISO(), cancelReason: updates.cancelReason, syncStatus: SYNC_STATUS.pending, synced: 0 });
          }
        } catch { }

        // Record cancelled order in Firestore and local DB
        const cancelledRecord = {
          requestId: request.requestId || null,
          billId: request.billId || null,
          cancelledBy: ctx.uid,
          cancelledByName: ctx.name,
          storeId: request.storeId || ctx.primaryBranch,
          reason: updates.cancelReason || '',
          billSnapshot: request.billSnapshot || {},
          cancelledAt: nowISO(),
        };
        if (isFirebaseReadyFn() && isOnline()) {
          try {
            await addDoc(collection(getFirestoreDb(), COLLECTION_NAMES.managerCancelledOrders), { ...cancelledRecord, cancelledAt: serverTimestamp() });
          } catch {
            await queueSync('manager_cancelled_order', 'create', cancelledRecord);
          }
        } else {
          await queueSync('manager_cancelled_order', 'create', cancelledRecord);
        }
        try { if (localDB.manager_cancelled_orders) await localDB.manager_cancelled_orders.add({ ...cancelledRecord, synced: isFirebaseReadyFn() && isOnline() ? 1 : 0 }); } catch { }
      } catch { /* ignore */ }
    }

    await logActivity('APPROVAL_REQUEST_PROCESSED', { requestId: request.requestId || request.id, action, by: ctx.uid });
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
};
export const getPendingApprovals = async () => {
  try {
    const [pendingExpenses, pendingReturns] = await Promise.all([
      listExpenses({ status: 'pending' }),
      listReturns({ status: 'pending' }),
    ]);
    return {
      expenses: pendingExpenses,
      returns: pendingReturns,
      total: pendingExpenses.length + pendingReturns.length,
    };
  } catch {
    return { expenses: [], returns: [], total: 0 };
  }
};

// ============================================================
// SUPER-ADMIN APPROVALS
// ============================================================
export const getSuperApprovalRequests = async (filters = {}) => {
  try {
    // hybrid read
    const items = await fetchCollection(COLLECTION_NAMES.superApprovalRequests, 'super_approval_requests');
    let results = items || [];
    if (filters.status) results = results.filter(i => i.status === filters.status);
    if (filters.storeId) results = results.filter(i => i.storeId === filters.storeId);
    if (filters.requestedBy) results = results.filter(i => i.requestedBy === filters.requestedBy);
    return results.sort((a, b) => (a.createdAt || '').toString() < (b.createdAt || '').toString() ? 1 : -1);
  } catch (err) { return []; }
};

export const processSuperApprovalRequest = async (requestIdOrDocId, action = 'approve', reason = '') => {
  try {
    const ctx = await getManagerContext();
    let request = null;
    if (isFirebaseReadyFn() && isOnline()) {
      try {
        const snap = await getDoc(doc(getFirestoreDb(), COLLECTION_NAMES.superApprovalRequests, requestIdOrDocId));
        if (snap.exists()) request = { id: snap.id, ...snap.data() };
      } catch { }
      if (!request) {
        try {
          const q = query(collection(getFirestoreDb(), COLLECTION_NAMES.superApprovalRequests), where('requestId', '==', requestIdOrDocId), limit(1));
          const snap2 = await getDocs(q);
          if (!snap2.empty) request = { id: snap2.docs[0].id, ...snap2.docs[0].data() };
        } catch { }
      }
    }

    if (!request) {
      try { request = await localDB.super_approval_requests.where('requestId').equals(requestIdOrDocId).first(); } catch { }
    }
    if (!request) throw new Error('Super-admin approval request not found');

    const updates = {};
    if (action === 'approve') {
      updates.status = APPROVAL_STATUS.approved;
      updates.approvedBy = ctx.uid; updates.approvedByName = ctx.name; updates.approvedAt = nowISO(); updates.reason = reason || '';
    } else if (action === 'reject') {
      updates.status = APPROVAL_STATUS.rejected;
      updates.rejectedBy = ctx.uid; updates.rejectedByName = ctx.name; updates.rejectedAt = nowISO(); updates.rejectedReason = reason || '';
    } else if (action === 'cancel') {
      updates.status = APPROVAL_STATUS.cancelled;
      updates.cancelledBy = ctx.uid; updates.cancelledByName = ctx.name; updates.cancelledAt = nowISO(); updates.cancelReason = reason || '';
    } else throw new Error('Unknown action');

    if (isFirebaseReadyFn() && isOnline() && request.id) {
      try { await updateDoc(doc(getFirestoreDb(), COLLECTION_NAMES.superApprovalRequests, request.id), { ...updates, updatedAt: serverTimestamp() }); } catch { await queueSync('super_approval_request', 'update', { requestId: request.requestId || request.id, ...updates }); }
    } else {
      await queueSync('super_approval_request', 'update', { requestId: request.requestId || request.id, ...updates });
    }

    // Special handling for cancellation requests
    if (request.type === 'cancellation') {
      if (updates.status === APPROVAL_STATUS.approved) {
        // Super Admin confirms/clears cancellation -> set status: "cancelled", isDeleted: true, isActiveOrder: false
        const superReason = reason || 'Cleared by Super Admin';
        const finalReason = superReason || request.managerCancelReason || request.cashierCancelReason || 'Cancelled';

        // 1. Update local order
        try {
          const local = await localDB.orders.where('localId').equals(request.localBillId).first()
            || await localDB.orders.where('billId').equals(request.localBillId).first();
          if (local) {
            await localDB.orders.update(local.id, {
              status: 'cancelled',
              isDeleted: true,
              isActiveOrder: false,
              superAdminCancelReason: superReason,
              superAdminCancelledBy: ctx.name,
              superAdminCancelledAt: nowISO(),
              cancelReason: finalReason,
              cancelledBy: ctx.name,
              cancelledAt: nowISO()
            });
          }
        } catch { }

        // 2. Update Firestore order if online
        if (isFirebaseReady() && isOnline() && request.billId) {
          try {
            await updateDoc(doc(getFirestoreDb(), COLLECTION_NAMES.orders, request.billId), {
              status: 'cancelled',
              isDeleted: true,
              isActiveOrder: false,
              superAdminCancelReason: superReason,
              superAdminCancelledBy: ctx.name,
              superAdminCancelledAt: serverTimestamp(),
              cancelReason: finalReason,
              cancelledBy: ctx.name,
              cancelledAt: serverTimestamp()
            });
          } catch { }
        }

        // 3. Write copy to deletedBills
        const deletedRecord = {
          originalOrderId: request.billId || request.localBillId,
          billSerial: request.billSnapshot?.billSerial || request.billSnapshot?.serialNo || '—',
          serialNo: request.billSnapshot?.serialNo || request.billSnapshot?.billSerial || '—',
          storeId: request.storeId || 'default',
          orderSnapshot: request.billSnapshot || {},
          cashierCancelReason: request.cashierCancelReason || '',
          managerCancelReason: request.managerCancelReason || '',
          superAdminCancelReason: superReason,
          reason: finalReason,
          cancelledAt: nowISO(),
          cancelledBy: ctx.name,
        };

        if (isFirebaseReady() && isOnline()) {
          try {
            await addDoc(collection(getFirestoreDb(), 'deletedBills'), {
              ...deletedRecord,
              cancelledAt: serverTimestamp()
            });
          } catch {
            await queueSync('deleted_bill', 'create', deletedRecord);
          }
        } else {
          await queueSync('deleted_bill', 'create', deletedRecord);
        }

        try {
          if (localDB.deleted_bills) {
            await localDB.deleted_bills.add({
              ...deletedRecord,
              synced: isFirebaseReady() && isOnline() ? 1 : 0
            });
          }
        } catch { }
      } else if (updates.status === APPROVAL_STATUS.rejected) {
        // Super Admin rejects cancellation -> reset order back to pending/active
        try {
          const local = await localDB.orders.where('localId').equals(request.localBillId).first()
            || await localDB.orders.where('billId').equals(request.localBillId).first();
          if (local) {
            await localDB.orders.update(local.id, {
              status: 'pending',
              isActiveOrder: true,
              superAdminRejectionReason: reason || 'Rejected by Super Admin',
              superAdminRejectedBy: ctx.name,
              superAdminRejectedAt: nowISO()
            });
          }
        } catch { }

        if (isFirebaseReady() && isOnline() && request.billId) {
          try {
            await updateDoc(doc(getFirestoreDb(), COLLECTION_NAMES.orders, request.billId), {
              status: 'pending',
              isActiveOrder: true,
              superAdminRejectionReason: reason || 'Rejected by Super Admin',
              superAdminRejectedBy: ctx.name,
              superAdminRejectedAt: serverTimestamp()
            });
          } catch { }
        }
      }

      await logActivity('SUPER_APPROVAL_REQUEST_PROCESSED', { requestId: request.requestId || request.id, action, by: ctx.uid });
      return { success: true };
    }

    // If approved by super-admin, finalize bill and add to super-admin approved collection
    if (updates.status === APPROVAL_STATUS.approved) {
      try {
        // 1. update local order to completed
        try {
          const local = await localDB.orders.where('localId').equals(request.localBillId).first() || await localDB.orders.where('billId').equals(request.localBillId).first();
          if (local) {
            await localDB.orders.update(local.id, { status: BILL_STATUS.completed, superApprovedBy: ctx.uid, superApprovedAt: nowISO(), syncStatus: SYNC_STATUS.pending, synced: 0 });
          }
        } catch { }

        // 2. Add approved order locally and queue for sync
        const superApprovedRecord = {
          requestId: request.requestId || null,
          billId: request.billId || null,
          approvedBy: ctx.uid,
          approvedByName: ctx.name,
          storeId: request.storeId || ctx.primaryBranch,
          billSnapshot: request.billSnapshot || {},
          approvedAt: nowISO(),
        };

        try {
          if (localDB.super_admin_approved_orders) {
            await localDB.super_admin_approved_orders.add({
              ...superApprovedRecord,
              synced: isFirebaseReadyFn() && isOnline() ? 1 : 0,
            });
          }
        } catch { }

        // 3. Update Firestore order and add collections if online
        if (isFirebaseReadyFn() && isOnline()) {
          try {
            if (request.billId) {
              await updateDoc(doc(getFirestoreDb(), COLLECTION_NAMES.orders, request.billId), { status: BILL_STATUS.completed, superApprovedBy: ctx.uid, superApprovedAt: serverTimestamp() });
            }
            await addDoc(collection(getFirestoreDb(), COLLECTION_NAMES.superAdminApprovedOrders), {
              ...superApprovedRecord,
              approvedAt: serverTimestamp(),
            });
          } catch {
            await queueSync('super_admin_approved_order', 'create', superApprovedRecord);
          }
        } else {
          await queueSync('super_admin_approved_order', 'create', superApprovedRecord);
        }
      } catch { /* ignore finalization errors */ }
    }
    // If cancelled by super-admin, mark order cancelled and record to super-admin cancelled collection
    if (updates.status === APPROVAL_STATUS.cancelled) {
      try {
        // 1. Update local order status to cancelled
        try {
          const local = await localDB.orders.where('localId').equals(request.localBillId).first() || await localDB.orders.where('billId').equals(request.localBillId).first();
          if (local) {
            await localDB.orders.update(local.id, { status: BILL_STATUS.cancelled, superCancelledBy: ctx.uid, superCancelledAt: nowISO(), cancelReason: updates.cancelReason, syncStatus: SYNC_STATUS.pending, synced: 0 });
          }
        } catch { }

        // 2. Record cancelled order in local DB and queue for sync
        const cancelledRecord = {
          requestId: request.requestId || null,
          billId: request.billId || null,
          cancelledBy: ctx.uid,
          cancelledByName: ctx.name,
          storeId: request.storeId || ctx.primaryBranch,
          reason: updates.cancelReason || '',
          billSnapshot: request.billSnapshot || {},
          cancelledAt: nowISO(),
        };

        try {
          if (localDB.super_admin_cancelled_orders) {
            await localDB.super_admin_cancelled_orders.add({
              ...cancelledRecord,
              synced: isFirebaseReadyFn() && isOnline() ? 1 : 0,
            });
          }
        } catch { }

        // 3. Update Firestore order and add collection if online
        if (isFirebaseReadyFn() && isOnline()) {
          try {
            if (request.billId) {
              await updateDoc(doc(getFirestoreDb(), COLLECTION_NAMES.orders, request.billId), { status: BILL_STATUS.cancelled, superCancelledBy: ctx.uid, superCancelledAt: serverTimestamp(), cancelReason: updates.cancelReason });
            }
            await addDoc(collection(getFirestoreDb(), COLLECTION_NAMES.superAdminCancelledOrders), {
              ...cancelledRecord,
              cancelledAt: serverTimestamp(),
            });
          } catch {
            await queueSync('super_admin_cancelled_order', 'create', cancelledRecord);
          }
        } else {
          await queueSync('super_admin_cancelled_order', 'create', cancelledRecord);
        }
      } catch { /* ignore */ }
    }

    await logActivity('SUPER_APPROVAL_REQUEST_PROCESSED', { requestId: request.requestId || request.id, action, by: ctx.uid });
    return { success: true };
  } catch (err) { return { success: false, error: err.message }; }
};

// ============================================================
// SECTION 13: USER MONITORING
// ============================================================
export const getUserPerformance = async (filters = {}) => {
  try {
    const ctx = await getManagerContext();
    const scope = buildScope(ctx, filters.branchId);

    const allUsers = await fetchCollection(COLLECTION_NAMES.users, 'users');
    const branchUsers = allUsers.filter((u) => userMatchesBranchScope(scope, u));

    const allOrders = await fetchAllOrders();

    return branchUsers
      .map(u => {
        const userOrders = allOrders.filter(
          o =>
            o.billerId === u.uid &&
            itemMatchesBranchScope(scope, o.storeId)
        );
        const totalSales     = userOrders.reduce((s, o) => s + Number(o.totalAmount  || 0), 0);
        const totalDiscount  = userOrders.reduce((s, o) => s + Number(o.discountAmount|| 0), 0);
        const totalCollected = userOrders.reduce((s, o) => s + Number(o.paidAmount    || 0), 0);
        return {
          uid: u.uid,
          name: u.name || u.displayName,
          role: u.role || u.roles?.[0],
          billCount: userOrders.length,
          totalSales, totalDiscount, totalCollected,
          avgBillValue: userOrders.length
            ? totalSales / userOrders.length : 0,
          lastLogin: u.lastLogin,
          isActive: u.isActive !== false,
        };
      })
      .sort((a, b) => b.totalSales - a.totalSales);
  } catch { return []; }
};

// ============================================================
// DEFAULT EXPORT
// ============================================================
const managerService = {
  getDashboardSummary,
  getBills, getBillDetails, updateBill,
  subscribeToOrdersLive, filterOrdersList,
  collectPayment,
  searchCustomers, addCustomer, updateCustomer, getCustomerHistory,
  addExpense, listExpenses, approveExpense, rejectExpense,
  listCashTransactions, addCashTransaction,
  markCashTransactionReconciled, getCashSummary, listCashFlowPageData,
  getSalespersons, markCommissionPaid,
  listReturns, approveReturn, rejectReturn,
  getActiveShift, openShift, closeShift,
  generateReport,
  getActivityLogs,
  getPendingApprovals,
  submitBillForManagerApproval,
  getApprovalRequests,
  processApprovalRequest,
  getSuperApprovalRequests,
  processSuperApprovalRequest,
  getUserPerformance,
};

export default managerService;

export { normalizeOrder };