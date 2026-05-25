// File: src/services/managerService.js
// Purpose: Manager module — HYBRID service layer (Firebase + IDB)
// FIXED v3.0: getCashSummary AllTime, cashFromBills, bills auto-include
// Author: A One Jewelry POS — Manager Module v3.0

import {
  collection, doc, getDocs, getDoc, addDoc, updateDoc,
  query, where, orderBy, limit, serverTimestamp,
  writeBatch, Timestamp,
} from './firebase';
import * as firebaseSvc from './firebase';
const firestore = (firebaseSvc && (firebaseSvc.db || (firebaseSvc.default && firebaseSvc.default.db))) || {};
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
import { db as localDB } from '../db/index';
import {
  COLLECTION_NAMES, SHIFT_STATUS, CASH_TX_TYPES,
  APPROVAL_STATUS, APPROVAL_TYPES, BILL_STATUS, SYNC_STATUS,
  PAYMENT_STATUS,
} from '../utils/constants';
import * as authService from './authService';

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

  let paidAmount = Number(order.paidAmount || order.amountReceived || 0);
  if (paidAmount === 0 && total > 0) {
    const ps = String(order.paymentStatus || '').toLowerCase();
    if (['paid', 'completed', 'fully_paid'].includes(ps)) paidAmount = total;
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

  const computedPaymentStatus = order.paymentStatus ||
    (paidAmount >= total && total > 0 ? 'paid'
      : paidAmount > 0 ? 'partial' : 'unpaid');

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
const getManagerContext = async () => {
  const auth = authService && authService.getCurrentUserData ? authService : (authService && authService.default ? authService.default : authService);
  const user = auth && auth.getCurrentUserData ? await auth.getCurrentUserData() : null;
  if (!user) {
    return {
      uid: 'unknown', name: 'Unknown',
      branchIds: [], primaryBranch: null,
      isSuperAdmin: false, isAdmin: false,
    };
  }
  const branchIds =
    user.storeIds?.length > 0
      ? user.storeIds
      : user.primaryStore ? [user.primaryStore] : [];

  return {
    uid: user.uid,
    name: user.name || user.displayName || user.email,
    email: user.email,
    branchIds,
    primaryBranch: user.primaryStore || branchIds[0] || null,
    isSuperAdmin:
      user.roles?.includes('superAdmin') || user.role === 'superAdmin',
    isAdmin:
      user.roles?.includes('admin') || user.role === 'admin',
  };
};

// ============================================================
// FETCH ALL ORDERS — HYBRID
// ============================================================
const fetchAllOrders = async (options = {}) => {
  const { lim = 10000, useCache = true } = options;

  if (isFirebaseReadyFn() && isOnline()) {
    try {
      const q = query(
        collection(firestore, COLLECTION_NAMES.orders),
        orderBy('createdAt', 'desc'),
        limit(lim)
      );
      const snap = await getDocs(q);
      const orders = snap.docs.map(d =>
        normalizeOrder({ id: d.id, ...d.data() })
      );
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
        // Cleanup: remove local orders that were previously synced but
        // no longer exist on the server (deleted remotely).
        try {
          const remoteIds = new Set(orders.map(o => o.id || o.localId).filter(Boolean));
          const localOrders = await localDB.orders.toArray();
          for (const lo of localOrders) {
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
    const idbOrders = await localDB.orders.toArray();
    return idbOrders.map(normalizeOrder).filter(Boolean);
  } catch { return []; }
};

// ============================================================
// FETCH COLLECTION — HYBRID
// ============================================================
const fetchCollection = async (collectionName, idbStoreName, options = {}) => {
  const { lim = 1000, orderField = 'createdAt' } = options;

  if (isFirebaseReadyFn() && isOnline()) {
    try {
      const q = query(
        collection(firestore, collectionName),
        orderBy(orderField, 'desc'),
        limit(lim)
      );
      const snap = await getDocs(q);
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
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
    if (idbStoreName && localDB[idbStoreName])
      return await localDB[idbStoreName].toArray();
    return [];
  } catch { return []; }
};

// ============================================================
// SECTION 1: DASHBOARD SUMMARY
// ============================================================
export const getDashboardSummary = async (filters = {}) => {
  try {
    const ctx = await getManagerContext();
    const restrictBranches =
      !ctx.isSuperAdmin && !ctx.isAdmin && ctx.branchIds.length > 0;
    const branchIds = filters.branchId
      ? [filters.branchId]
      : restrictBranches ? ctx.branchIds : [];

    const today = todayKey();
    const fromDateStr = filters.from || today;
    const toDateStr   = filters.to   || today;
    const fromTs = new Date(fromDateStr).getTime();
    const toTs   = new Date(toDateStr).getTime() + 86400000 - 1;

    const [allOrders, allExpenses, allReturns, allCash] = await Promise.all([
      fetchAllOrders({ lim: 10000 }),
      fetchCollection('expenses', 'expenses'),
      fetchCollection(COLLECTION_NAMES.returns, 'returns'),
      fetchCollection(
        COLLECTION_NAMES.cashTransactions, 'cash_transactions',
        { orderField: 'timestamp' }
      ),
    ]);

    const filterByBranchDate = (items, dateField) =>
      items.filter(item => {
        if (!item || item.deleted || item.isDeleted) return false;
        if (
          branchIds.length &&
          !branchIds.includes(item.storeId || item.branchId)
        ) return false;
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
        if (['paid', 'completed', 'fully_paid'].includes(ps)) paid = total;
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
      branches: branchIds,
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
    const restrict =
      !ctx.isSuperAdmin && !ctx.isAdmin && ctx.branchIds.length > 0;
    const branchIds = filters.branchId
      ? [filters.branchId]
      : restrict ? ctx.branchIds : [];

    let all = await fetchAllOrders({ lim: filters.limit || 10000 });

    if (branchIds.length > 0)
      all = all.filter(o => branchIds.includes(o.storeId));

    if (filters.status && filters.status !== 'all')
      all = all.filter(o => o.status === filters.status);

    if (filters.paymentStatus) {
      all = all.filter(o => {
        const total = Number(o.totalAmount || 0);
        const paid  = Number(o.paidAmount  || 0);
        const out   = total - paid;
        if (filters.paymentStatus === PAYMENT_STATUS.paid)
          return out <= 0 && total > 0;
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

export const getBillDetails = async (idOrLocalId) => {
  try {
    if (isFirebaseReadyFn() && isOnline()) {
      try {
        const snap = await getDoc(
          doc(firestore, COLLECTION_NAMES.orders, idOrLocalId)
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
        query(collection(firestore, 'payments'), where('billId', '==', billId))
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

    await localDB.orders.put({
      ...bill, ...updates,
      updatedAt: nowISO(), syncStatus: SYNC_STATUS.pending, synced: 0,
    });

    if (isFirebaseReadyFn() && isOnline()) {
      try {
        await updateDoc(
          doc(firestore, COLLECTION_NAMES.orders, bill.id || bill.localId),
          { ...updates, updatedAt: serverTimestamp(), updatedBy: ctx.uid }
        );
      } catch {
        await queueSync('bill', 'update', { id: bill.id, localId, updates });
      }
    } else {
      await queueSync('bill', 'update', { id: bill.id, localId, updates });
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
          doc(firestore, COLLECTION_NAMES.orders, localBillId)
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
    };

    await localDB.orders.put({
      ...bill, ...updates, syncStatus: SYNC_STATUS.pending, synced: 0,
    });

    if (isFirebaseReadyFn() && isOnline()) {
      try {
        await updateDoc(
          doc(firestore, COLLECTION_NAMES.orders, bill.id || bill.localId),
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
        const spRow = await localDB.settings.get('salesperson');
        const spConfig = spRow ? (spRow.value || spRow) : {};
        if (spConfig.enableCommission === false) {
          // Commission disabled by admin; skip any commission bookkeeping
          // continue with payment flow
        } else {
          // proceed into existing commission logic
          
          const items = bill.items || bill.bill_items || [];
          const totalBill = Number(bill.totalAmount || bill.grandTotal || 0) || 0;
          const agentTotals = {}; // salespersonId -> total commission for full bill

          items.forEach((it) => {
            try {
              const unit = Number(it.price || 0);
              const qty = Number(it.qty || 1) || 1;
              const disc = Number(it.discount || 0);
              const discType = it.discountType || 'percent';
              const discAmt = discType === 'percent' ? Math.round((unit * Math.min(100, Math.max(0, disc))) / 100) : Math.min(unit, disc);
              const lineTotal = Math.max(0, (unit - discAmt) * qty);

              const spId = it.salespersonId || null;
              if (!spId) return;

              let commission = 0;
              if (String(it.commissionType || '').toLowerCase() === 'fixed') {
                commission = Number(it.commissionFixed || 0) * qty;
              } else {
                const pct = Number(it.commissionPercent ?? bill.commissionPercent ?? bill.commission ?? 0) || 0;
                commission = Math.round((lineTotal * Math.max(0, Math.min(100, pct))) / 100);
              }

              if (!agentTotals[spId]) agentTotals[spId] = 0;
              agentTotals[spId] += commission;
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
            const unit = Number(it.price || 0);
            const qty = Number(it.qty || 1) || 1;
            const disc = Number(it.discount || 0);
            const discType = it.discountType || 'percent';
            const discAmt = discType === 'percent' ? Math.round((unit * Math.min(100, Math.max(0, disc))) / 100) : Math.min(unit, disc);
            const lineTotal = Math.max(0, (unit - discAmt) * qty);

            const spId = it.salespersonId || null;
            if (!spId) return;

            let commission = 0;
            if (String(it.commissionType || '').toLowerCase() === 'fixed') {
              commission = Number(it.commissionFixed || 0) * qty;
            } else {
              const pct = Number(it.commissionPercent ?? bill.commissionPercent ?? bill.commission ?? 0) || 0;
              commission = Math.round((lineTotal * Math.max(0, Math.min(100, pct))) / 100);
            }

            if (!agentTotals[spId]) agentTotals[spId] = 0;
            agentTotals[spId] += commission;
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
          await addDoc(collection(firestore, COLLECTION_NAMES.cashTransactions), {
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
    const restrict =
      !ctx.isSuperAdmin && !ctx.isAdmin && ctx.branchIds.length > 0;
    const branchIds = branchId
      ? [branchId]
      : restrict ? ctx.branchIds : [];

    let all = await fetchCollection(COLLECTION_NAMES.customers, 'customers');
    if (branchIds.length > 0)
      all = all.filter(c => !c.storeId || branchIds.includes(c.storeId));

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
      const orders = await fetchAllOrders({ lim: 10000 });
      const agg = {};
      const metricsByPhone = {};
      let walkin = { purchaseCount: 0, totalSpent: 0, lastOrder: null };

      orders.forEach(o => {
        if (branchIds.length && o.storeId && !branchIds.includes(o.storeId)) return;
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
    const customer = {
      customerId: generateId('cus'),
      name: data.name,
      nameLower: (data.name || '').toLowerCase(),
      phone: data.phone || '', email: data.email || '',
      city: data.city || '', address: data.address || '',
      creditLimit: Number(data.creditLimit || 0),
      outstandingBalance: 0, purchaseCount: 0, totalSpent: 0,
      storeId: data.storeId || ctx.primaryBranch,
      createdAt: nowISO(), updatedAt: nowISO(), synced: 0,
    };
    await localDB.customers.add(customer);

    if (isFirebaseReadyFn() && isOnline()) {
      try {
        await addDoc(collection(firestore, COLLECTION_NAMES.customers), {
          ...customer,
          createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
        });
      } catch {
        await queueSync('customer', 'create', customer);
      }
    } else {
      await queueSync('customer', 'create', customer);
    }

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
            collection(firestore, COLLECTION_NAMES.customers),
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
    const all = await fetchAllOrders({ lim: 10000 });
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
        await addDoc(collection(firestore, 'expenses'), {
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
    const restrict =
      !ctx.isSuperAdmin && !ctx.isAdmin && ctx.branchIds.length > 0;
    const branchIds = filters.branchId
      ? [filters.branchId]
      : restrict ? ctx.branchIds : [];

    let all = await fetchCollection('expenses', 'expenses');

    if (branchIds.length > 0)
      all = all.filter(e => branchIds.includes(e.storeId));
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

/**
 * ✅ FIXED: listCashTransactions
 * - Bills ka cash bhi include hota hai (orders collection se)
 * - All Time by default (no forced today filter)
 */
export const listCashTransactions = async (branchId = null, filters = {}) => {
  try {
    const ctx = await getManagerContext();
    const restrict =
      !ctx.isSuperAdmin && !ctx.isAdmin && ctx.branchIds.length > 0;
    const branchIds = branchId
      ? [branchId]
      : restrict ? ctx.branchIds : [];

    // ── Manual cash transactions ──────────────────────────
    let manual = await fetchCollection(
      COLLECTION_NAMES.cashTransactions, 'cash_transactions',
      { orderField: 'timestamp' }
    );

    if (branchIds.length > 0)
      manual = manual.filter(c => branchIds.includes(c.storeId));
    if (filters.type)
      manual = manual.filter(c => c.type === filters.type);

    // ── Bill-based cash (from orders) ──────────────────────
    // Only include if type filter allows 'receive' or is not set
    let billBased = [];
    const typeOk = !filters.type || filters.type === 'receive';

    if (typeOk) {
      const allOrders = await fetchAllOrders({ lim: 10000 });
      billBased = allOrders
        .filter(o => {
          if (o.deleted || o.isDeleted) return false;
          // Only cash orders
          const method = String(o.paymentMethod || 'cash').toLowerCase();
          if (method !== 'cash') return false;
          // Branch filter
          if (branchIds.length && !branchIds.includes(o.storeId)) return false;
          return true;
        })
        .map(o => ({
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
    }

    // ── Merge & dedup ──────────────────────────────────────
    // Avoid double-counting: if a manual tx has billId, skip bill-based entry
    const manualBillIds = new Set(
      manual.filter(m => m.billId).map(m => m.billId)
    );
    const filteredBillBased = billBased.filter(
      b => !manualBillIds.has(b.billId)
    );

    let all = [...manual, ...filteredBillBased];

    // ── Date filter ────────────────────────────────────────
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
    const tx = {
      txId: generateId('cash'),
      type: data.type || 'receive',
      amount: Number(data.amount || 0),
      reason: data.reason || '',
      storeId: data.storeId || ctx.primaryBranch,
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
        await addDoc(collection(firestore, COLLECTION_NAMES.cashTransactions), {
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
    const ctx = await getManagerContext();
    const restrict =
      !ctx.isSuperAdmin && !ctx.isAdmin && ctx.branchIds.length > 0;
    const branchIds = branchId
      ? [branchId]
      : restrict ? ctx.branchIds : [];

    // ✅ If no dateKey → All Time
    const fromTs = dateKey ? new Date(dateKey).getTime() : 0;
    const toTs   = dateKey
      ? new Date(dateKey).getTime() + 86400000 - 1
      : Date.now() + 86400000;

    // All manual cash transactions
    const allCash = await fetchCollection(
      COLLECTION_NAMES.cashTransactions, 'cash_transactions',
      { orderField: 'timestamp' }
    );

    const filteredCash = allCash.filter(c => {
      if (branchIds.length && !branchIds.includes(c.storeId)) return false;
      const ts = parseDate(c.createdAt || c.timestamp).getTime();
      return ts >= fromTs && ts <= toTs;
    });

    // All cash bills
    const allOrders = await fetchAllOrders({ lim: 10000 });
    const cashBills = allOrders.filter(o => {
      if (o.deleted || o.isDeleted) return false;
      const method = String(o.paymentMethod || 'cash').toLowerCase();
      if (method !== 'cash') return false;
      if (branchIds.length && !branchIds.includes(o.storeId)) return false;
      const ts = parseDate(o.savedAt || o.createdAt).getTime();
      return ts >= fromTs && ts <= toTs;
    });

    // Active shift
    const shifts = await localDB.shifts.toArray();
    const activeShift = shifts.find(
      s =>
        s.status === SHIFT_STATUS.open &&
        (branchIds.length === 0 || branchIds.includes(s.storeId))
    );
    const openingBalance = activeShift
      ? Number(activeShift.openingBalance || 0)
      : 0;

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

// ============================================================
// SECTION 7: SALESPERSONS
// ============================================================
export const getSalespersons = async () => {
  try {
    const ctx = await getManagerContext();
    const all = await fetchCollection(COLLECTION_NAMES.users, 'users');

    return all.filter(u => {
      const isSP =
        u.roles?.includes('salesperson') ||
        u.role === 'salesperson' ||
        Number(u.commissionEarned || 0) > 0 ||
        Number(u.commissionPending || 0) > 0;
      if (!isSP) return false;
      if (ctx.isSuperAdmin || ctx.isAdmin) return true;
      if (ctx.branchIds.length === 0) return true;
      return (
        ctx.branchIds.includes(u.storeId) ||
        u.storeIds?.some(s => ctx.branchIds.includes(s))
      );
    });
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
    const restrict =
      !ctx.isSuperAdmin && !ctx.isAdmin && ctx.branchIds.length > 0;
    const branchIds = filters.branchId
      ? [filters.branchId]
      : restrict ? ctx.branchIds : [];

    let all = await fetchCollection(
      COLLECTION_NAMES.returns, 'returns',
      { orderField: 'processedAt' }
    );

    if (branchIds.length > 0)
      all = all.filter(r => branchIds.includes(r.storeId));
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
        await addDoc(collection(firestore, 'shifts'), {
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
          collection(firestore, 'shifts'),
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
    const restrict =
      !ctx.isSuperAdmin && !ctx.isAdmin && ctx.branchIds.length > 0;
    const branchIds = filters.branchId
      ? [filters.branchId]
      : restrict ? ctx.branchIds : [];

    let data = [];

    switch (type) {
      case 'sales': {
        let all = await fetchAllOrders();
        if (branchIds.length)
          all = all.filter(o => branchIds.includes(o.storeId));
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
        let all = await fetchAllOrders();
        if (branchIds.length)
          all = all.filter(o => branchIds.includes(o.storeId));
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
        let all = await fetchAllOrders();
        if (branchIds.length)
          all = all.filter(o => branchIds.includes(o.storeId));
        data = all.filter(o => Number(o.discountAmount || 0) > 0);
        break;
      }
      case 'managerApproved': {
        // fetch managerApprovedOrders collection
        try {
          const items = await fetchCollection('managerApprovedOrders', null, { lim: 2000 });
          data = items.filter(i => {
            if (branchIds.length && i.storeId && !branchIds.includes(i.storeId)) return false;
            if (filters.from) {
              const ts = new Date(filters.from).getTime();
              if (parseDate(i.approvedAt || i.createdAt).getTime() < ts) return false;
            }
            if (filters.to) {
              const ts = new Date(filters.to).getTime() + 86400000 - 1;
              if (parseDate(i.approvedAt || i.createdAt).getTime() > ts) return false;
            }
            return true;
          });
        } catch { data = []; }
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
    const restrict =
      !ctx.isSuperAdmin && !ctx.isAdmin && ctx.branchIds.length > 0;
    const branchIds = filters.branchId
      ? [filters.branchId]
      : restrict ? ctx.branchIds : [];

    let all = await localDB.activity_logs_local.toArray();

    if (isFirebaseReady() && isOnline()) {
      try {
        const q = query(
          collection(firestore, COLLECTION_NAMES.activityLogs),
          orderBy('timestamp', 'desc'),
          limit(500)
        );
        const snap   = await getDocs(q);
        const fbLogs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        const seen   = new Set(all.map(l => l.logId));
        fbLogs.forEach(l => { if (!seen.has(l.logId)) all.push(l); });
      } catch { }
    }

    if (branchIds.length > 0)
      all = all.filter(l => !l.storeId || branchIds.includes(l.storeId));
    if (filters.userId)
      all = all.filter(l => l.userId === filters.userId);
    if (filters.action)
      all = all.filter(l => l.action === filters.action);
    if (filters.from) {
      const ts = new Date(filters.from).getTime();
      all = all.filter(l => parseDate(l.timestamp).getTime() >= ts);
    }
    if (filters.to) {
      const ts = new Date(filters.to).getTime() + 86400000 - 1;
      all = all.filter(l => parseDate(l.timestamp).getTime() <= ts);
    }

    return all
      .sort(
        (a, b) =>
          parseDate(b.timestamp).getTime() -
          parseDate(a.timestamp).getTime()
      )
      .slice(0, filters.limit || 500);
  } catch { return []; }
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
      type,
      note: note || '',
      status: APPROVAL_STATUS.pending,
      requestedBy: ctx.uid,
      requestedByName: ctx.name,
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
        await addDoc(collection(firestore, COLLECTION_NAMES.approvalRequests), { ...request, createdAt: serverTimestamp() });
      } catch { /* keep queued */ }
    }

    return { success: true, request };
  } catch (err) {
    return { success: false, error: err.message };
  }
};

export const getApprovalRequests = async (filters = {}) => {
  try {
    let items = await fetchCollection(COLLECTION_NAMES.approvalRequests, null, { lim: 1000 });
    if (!Array.isArray(items)) items = [];
    if (filters.status) items = items.filter(i => i.status === filters.status);
    if (filters.storeId) items = items.filter(i => i.storeId === filters.storeId);
    if (filters.requestedBy) items = items.filter(i => i.requestedBy === filters.requestedBy);
    return items.sort((a, b) => (a.createdAt || '').toString() < (b.createdAt || '').toString() ? 1 : -1);
  } catch (err) {
    return [];
  }
};

export const processApprovalRequest = async (requestDocIdOrRequestId, action = 'approve', reason = '') => {
  try {
    const ctx = await getManagerContext();

    // Find request either by Firestore doc id or by requestId field
    let request = null;
    if (isFirebaseReady() && isOnline()) {
      try {
        // try doc id
        const snap = await getDoc(doc(firestore, COLLECTION_NAMES.approvalRequests, requestDocIdOrRequestId));
        if (snap.exists()) request = { id: snap.id, ...snap.data() };
      } catch { /* ignore */ }
      if (!request) {
        const q = query(collection(firestore, COLLECTION_NAMES.approvalRequests), where('requestId', '==', requestDocIdOrRequestId), limit(1));
        try {
          const snap2 = await getDocs(q);
          if (!snap2.empty) request = { id: snap2.docs[0].id, ...snap2.docs[0].data() };
        } catch { /* ignore */ }
      }
    }

    // Fallback: try reading from local sync queue (best-effort)
    if (!request) {
      const qItems = await localDB.sync_queue.toArray().catch(() => []);
      request = qItems.map(i => i.data).find(d => d && (d.requestId === requestDocIdOrRequestId || d.id === requestDocIdOrRequestId));
    }

    // Fallback: try local approval_requests store
    if (!request && localDB.approval_requests) {
      try {
        const localReq = await localDB.approval_requests
          .where('requestId').equals(requestDocIdOrRequestId).first();
        if (localReq) request = localReq;
      } catch { /* ignore */ }
    }

    if (!request) throw new Error('Approval request not found');

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
    if (isFirebaseReady() && isOnline() && request.id) {
      try {
        await updateDoc(doc(firestore, COLLECTION_NAMES.approvalRequests, request.id), { ...updates, updatedAt: serverTimestamp() });
      } catch {
        await queueSync('approval_request', 'update', { requestId: request.requestId || request.id, ...updates });
      }
    } else {
      await queueSync('approval_request', 'update', { requestId: request.requestId || request.id, ...updates });
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
            // Update original order status if exists
            if (request.billId) {
              const orderRef = doc(firestore, COLLECTION_NAMES.orders, request.billId);
              await updateDoc(orderRef, { status: BILL_STATUS.pending_superadmin, managerApprovedBy: ctx.uid, managerApprovedAt: serverTimestamp() });
            }
            // Create a manager-specific copy for easy reporting
            await addDoc(collection(firestore, 'managerApprovedOrders'), {
              ...managerApprovedData,
              approvedAt: serverTimestamp(),
            });
          } catch {
            await queueSync('manager_approved_order', 'create', managerApprovedData);
          }

          try {
            await addDoc(collection(firestore, COLLECTION_NAMES.superApprovalRequests), { ...superReq, createdAt: serverTimestamp() });
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
            await addDoc(collection(firestore, COLLECTION_NAMES.managerCancelledOrders), { ...cancelledRecord, cancelledAt: serverTimestamp() });
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
        const snap = await getDoc(doc(firestore, COLLECTION_NAMES.superApprovalRequests, requestIdOrDocId));
        if (snap.exists()) request = { id: snap.id, ...snap.data() };
      } catch { }
      if (!request) {
        try {
          const q = query(collection(firestore, COLLECTION_NAMES.superApprovalRequests), where('requestId', '==', requestIdOrDocId), limit(1));
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
      try { await updateDoc(doc(firestore, COLLECTION_NAMES.superApprovalRequests, request.id), { ...updates, updatedAt: serverTimestamp() }); } catch { await queueSync('super_approval_request', 'update', { requestId: request.requestId || request.id, ...updates }); }
    } else {
      await queueSync('super_approval_request', 'update', { requestId: request.requestId || request.id, ...updates });
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
              await updateDoc(doc(firestore, COLLECTION_NAMES.orders, request.billId), { status: BILL_STATUS.completed, superApprovedBy: ctx.uid, superApprovedAt: serverTimestamp() });
            }
            await addDoc(collection(firestore, COLLECTION_NAMES.superAdminApprovedOrders), {
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
              await updateDoc(doc(firestore, COLLECTION_NAMES.orders, request.billId), { status: BILL_STATUS.cancelled, superCancelledBy: ctx.uid, superCancelledAt: serverTimestamp(), cancelReason: updates.cancelReason });
            }
            await addDoc(collection(firestore, COLLECTION_NAMES.superAdminCancelledOrders), {
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
    const restrict =
      !ctx.isSuperAdmin && !ctx.isAdmin && ctx.branchIds.length > 0;
    const branchIds = filters.branchId
      ? [filters.branchId]
      : restrict ? ctx.branchIds : [];

    const allUsers = await fetchCollection(COLLECTION_NAMES.users, 'users');
    const branchUsers = allUsers.filter(
      u =>
        branchIds.length === 0 ||
        branchIds.includes(u.storeId) ||
        u.storeIds?.some(s => branchIds.includes(s))
    );

    const allOrders = await fetchAllOrders();

    return branchUsers
      .map(u => {
        const userOrders = allOrders.filter(
          o =>
            o.billerId === u.uid &&
            (branchIds.length === 0 || branchIds.includes(o.storeId))
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
  collectPayment,
  searchCustomers, addCustomer, updateCustomer, getCustomerHistory,
  addExpense, listExpenses, approveExpense, rejectExpense,
  listCashTransactions, addCashTransaction,
  markCashTransactionReconciled, getCashSummary,
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