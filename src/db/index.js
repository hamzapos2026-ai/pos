// File: src/db/index.js
// Purpose: Dexie IndexedDB — offline-first bills, orders, sync queue
// ✅ Auto-recovery when schema upgrade fails (primary key change)

import Dexie from 'dexie';

const DB_NAME = 'aone_pos_db';

/** Full store schema — primary keys must NEVER change across versions. */
const ALL_STORES = {
  drafts: 'key, userId, storeId, tabId, version, timestamp',
  settings_cache: 'key, storeId, updatedAt',
  held_bills: '++id, holdId, billerId, storeId, heldAt, reason, totalAmount',
  returns: '++id, returnId, originalBillId, billerId, storeId, processedAt, refundAmount',
  shifts: '++id, shiftId, managerId, storeId, status, openedAt, closedAt, openingBalance',
  cash_transactions: '++id, txId, shiftId, storeId, type, amount, reason, createdAt',
  activity_logs_local: '++id, action, userId, storeId, timestamp, synced',
  deleted_records: '++id, originalId, type, reason, deletedAt, deletedBy, synced',
  sync_queue_local: '++id, type, data, attempts, status, createdAt, lastAttempt',
  products: '++id, barcode, name, price, storeId, isActive',
  customer_credits: '++id, customerId, storeId, outstanding, limit',
  users: '++id, uid, email, name, role, storeId, active, synced',
  roles: '++id, roleId, name, permissions, synced',
  sessions: '++id, sessionId, userId, deviceId, loginTime, lastActive',
  settings: '++id, key, storeId, value, synced',
  bills: '++id, billId, billSerial, storeId, billerId, customerId, totalAmount, discountAmount, finalAmount, status, createdAt, updatedAt, synced',
  orders: '&localId, billId, storeId, billerId, status, savedAt, serialNo, dateKey, firebaseId, syncStatus, synced',
  bill_items: '++id, billId, itemId, productName, serialId, price, qty, discount, discountType, total, salespersonId, salespersonName, commissionPercent, commissionType, commissionFixed, createdAt',
  customers: '++id, customerId, name, nameLower, phone, email, city, market, purchaseCount, totalSpent, createdAt, updatedAt, synced',
  processed_orders: 'orderId, customerId, amount, status',
  payments: '++id, paymentId, billId, amount, paymentType, paymentMethod, reference, createdAt, synced',
  expenses: '++id, expenseId, category, amount, description, billerId, storeId, date, synced',
  logs: '++id, logId, action, userId, storeId, details, timestamp, synced',
  sync_queue: '++id, queueId, type, operation, data, priority, attempts, status, createdAt, lastAttempt, synced',
  approval_requests: '++id, requestId, billId, localBillId, status, requestedBy, storeId, createdAt',
  manager_approved_orders: '++id, requestId, billId, approvedBy, approvedAt, storeId, createdAt',
  super_approval_requests: '++id, requestId, parentRequestId, billId, localBillId, status, requestedBy, storeId, createdAt',
  super_admin_approved_orders: '++id, requestId, billId, approvedBy, approvedAt, storeId, createdAt',
  manager_cancelled_orders: '++id, requestId, billId, cancelledBy, cancelledAt, storeId, reason, createdAt',
  super_admin_cancelled_orders: '++id, requestId, billId, cancelledBy, cancelledAt, storeId, reason, createdAt',
  commission_transactions:
    '++id, txId, orderId, localOrderId, salespersonId, storeId, syncStatus, synced, createdAt, updatedAt',
  failedSync: '++id, queueId, type, localId, billSerial, status, failedAt, lastError',
  serial_claims: '++id, serial, counter, storeId, deviceId, claimedAt',
};

let db;
let initPromise = null;

try {
  db = new Dexie(DB_NAME);

  // Legacy version chain (must remain for browsers already on these versions)
  db.version(5).stores({
    drafts: ALL_STORES.drafts,
    settings_cache: ALL_STORES.settings_cache,
    held_bills: ALL_STORES.held_bills,
    returns: ALL_STORES.returns,
    shifts: ALL_STORES.shifts,
    cash_transactions: ALL_STORES.cash_transactions,
    activity_logs_local: ALL_STORES.activity_logs_local,
    deleted_records: ALL_STORES.deleted_records,
    sync_queue_local: ALL_STORES.sync_queue_local,
    products: ALL_STORES.products,
    customer_credits: ALL_STORES.customer_credits,
    users: ALL_STORES.users,
    roles: ALL_STORES.roles,
    sessions: ALL_STORES.sessions,
    settings: ALL_STORES.settings,
    bills: ALL_STORES.bills,
    orders: ALL_STORES.orders,
    bill_items: ALL_STORES.bill_items,
    customers: '++id, customerId, name, phone, email, city, market, address, creditLimit, outstandingBalance, createdAt, updatedAt, synced',
    payments: ALL_STORES.payments,
    expenses: ALL_STORES.expenses,
    logs: ALL_STORES.logs,
    sync_queue: ALL_STORES.sync_queue,
  });

  db.version(6).stores({
    drafts: ALL_STORES.drafts,
    settings_cache: ALL_STORES.settings_cache,
    held_bills: ALL_STORES.held_bills,
    returns: ALL_STORES.returns,
    shifts: ALL_STORES.shifts,
    cash_transactions: ALL_STORES.cash_transactions,
    activity_logs_local: ALL_STORES.activity_logs_local,
    deleted_records: ALL_STORES.deleted_records,
    sync_queue_local: ALL_STORES.sync_queue_local,
    products: ALL_STORES.products,
    customer_credits: ALL_STORES.customer_credits,
    users: ALL_STORES.users,
    roles: ALL_STORES.roles,
    sessions: ALL_STORES.sessions,
    settings: ALL_STORES.settings,
    bills: ALL_STORES.bills,
    orders: ALL_STORES.orders,
    bill_items: ALL_STORES.bill_items,
    customers: ALL_STORES.customers,
    processed_orders: ALL_STORES.processed_orders,
    payments: ALL_STORES.payments,
    expenses: ALL_STORES.expenses,
    logs: ALL_STORES.logs,
    sync_queue: ALL_STORES.sync_queue,
  });

  db.version(7).stores({
    approval_requests: ALL_STORES.approval_requests,
    manager_approved_orders: ALL_STORES.manager_approved_orders,
  });

  db.version(8).stores({
    super_approval_requests: ALL_STORES.super_approval_requests,
    super_admin_approved_orders: ALL_STORES.super_admin_approved_orders,
  });

  db.version(9).stores({
    manager_cancelled_orders: ALL_STORES.manager_cancelled_orders,
    super_admin_cancelled_orders: ALL_STORES.super_admin_cancelled_orders,
  });

  db.version(10).stores({
    commission_transactions: ALL_STORES.commission_transactions,
  });

  // v11 — consolidated schema snapshot (no primary key changes)
  db.version(11).stores(ALL_STORES);

  // v12 — failed sync archive + offline serial claim audit
  db.version(12).stores({
    failedSync: ALL_STORES.failedSync,
    serial_claims: ALL_STORES.serial_claims,
  });
} catch (err) {
  console.error('[Dexie] Initialization failed:', err?.name, err?.message);
  db = new Dexie(DB_NAME);
}

const isUpgradeError = (err) => {
  const msg = `${err?.message || ''} ${err?.inner?.message || ''}`;
  return (
    err?.name === 'UpgradeError'
    || err?.inner?.name === 'UpgradeError'
    || /changing primary key/i.test(msg)
    || err?.name === 'VersionError'
  );
};

const readIdbStore = async (storeName) => {
  try {
    if (typeof indexedDB === 'undefined') return [];
    let currentVersion = null;
    if (typeof indexedDB.databases === 'function') {
      const dbs = await indexedDB.databases();
      const entry = dbs.find((d) => d.name === DB_NAME);
      currentVersion = entry?.version ?? null;
    }
    if (!currentVersion) return [];

    return new Promise((resolve) => {
      const req = indexedDB.open(DB_NAME, currentVersion);
      req.onerror = () => resolve([]);
      req.onsuccess = (e) => {
        const idb = e.target.result;
        if (!idb.objectStoreNames.contains(storeName)) {
          idb.close();
          resolve([]);
          return;
        }
        const tx = idb.transaction(storeName, 'readonly');
        const getAllReq = tx.objectStore(storeName).getAll();
        getAllReq.onsuccess = () => {
          idb.close();
          resolve(getAllReq.result || []);
        };
        getAllReq.onerror = () => {
          idb.close();
          resolve([]);
        };
      };
    });
  } catch {
    return [];
  }
};

const exportPendingBeforeReset = async () => {
  const [orders, queue] = await Promise.all([
    readIdbStore('orders'),
    readIdbStore('sync_queue'),
  ]);

  const pendingOrders = (orders || []).filter((o) => {
    const id = o?.localId || o?.id;
    if (!id) return false;
    return !o.firebaseId && o.syncStatus !== 'synced' && !o.synced;
  }).map((o) => ({
    ...o,
    localId: o.localId || o.id || `local_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    syncStatus: o.syncStatus || 'pending',
    synced: false,
  }));

  return { pendingOrders, queueItems: queue || [] };
};

const importRecoveredData = async (pendingOrders, queueItems) => {
  if (pendingOrders.length > 0) {
    await db.orders.bulkPut(pendingOrders);
    console.log(`[Dexie] ♻️ Restored ${pendingOrders.length} pending order(s) after recovery`);
  }
  if (queueItems.length > 0) {
    try {
      await db.sync_queue.bulkPut(queueItems);
    } catch { /* ignore */ }
  }
};

const recoverDatabase = async () => {
  console.warn('[Dexie] Incompatible local schema — recovering (preserving pending bills)...');
  const { pendingOrders, queueItems } = await exportPendingBeforeReset();

  try { db.close(); } catch { /* ignore */ }
  try { await Dexie.delete(DB_NAME); } catch (e) {
    console.warn('[Dexie] delete failed:', e?.message);
  }

  await db.open();
  await importRecoveredData(pendingOrders, queueItems);

  if (pendingOrders.length > 0 && navigator.onLine) {
    try {
      const { syncOfflineOrders } = await import('../services/localSyncService.js');
      setTimeout(() => {
        syncOfflineOrders().catch((e) => console.warn('[Dexie] post-recovery sync failed:', e?.message));
      }, 500);
    } catch { /* ignore */ }
  }

  return db;
};

export const initDatabase = async () => {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      if (!db.isOpen()) await db.open();
      console.log('[Dexie] Database opened successfully');
      return db;
    } catch (err) {
      if (isUpgradeError(err)) {
        try {
          return await recoverDatabase();
        } catch (recoverErr) {
          console.error('[Dexie] Recovery failed:', recoverErr?.name, recoverErr?.message);
          initPromise = null;
          return null;
        }
      }
      console.error('[Dexie] Failed to open database:', err?.name, err?.message);
      initPromise = null;
      return null;
    }
  })();

  return initPromise;
};

/** Ensure DB is open — safe to call from any service before Dexie ops. */
export const ensureDbReady = async () => {
  if (db.isOpen()) return db;
  return initDatabase();
};

export { db };
export default db;
