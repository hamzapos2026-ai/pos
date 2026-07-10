// src/services/indexedDBService.js
// ✅ MASTER PROMPT COMPLIANT v2.1
// ✅ Tables: users, roles, bills, bill_items,
//            sessions, sync_queue, logs, payments, settings
// ✅ Offline-first PRIMARY source of truth
// ✅ FIX: Added aliases for userSyncService compatibility

const DB_NAME = "aone_pos_v2";
const DB_VERSION = 2;

export const STORES = {
  USERS: "users",
  ROLES: "roles",
  BILLS: "bills",
  BILL_ITEMS: "bill_items",
  SESSIONS: "sessions",
  SYNC_QUEUE: "sync_queue",
  LOGS: "logs",
  PAYMENTS: "payments",
  SETTINGS: "settings",
  DRAFTS: "bill_drafts",
  ORDERS: "offline_orders",
  CUSTOMERS: "customers_cache",
  STORES_CACHE: "stores_cache",
};

let _db = null;

export const openDB = () => new Promise((resolve, reject) => {
  if (_db) { resolve(_db); return; }

  const request = indexedDB.open(DB_NAME, DB_VERSION);

  request.onupgradeneeded = (e) => {
    const db = e.target.result;

    if (!db.objectStoreNames.contains(STORES.USERS)) {
      const s = db.createObjectStore(STORES.USERS, { keyPath: "uid" });
      s.createIndex("email", "email", { unique: false });
      s.createIndex("primaryStore", "primaryStore", { unique: false });
      s.createIndex("_syncStatus", "_syncStatus", { unique: false });
      s.createIndex("isDeleted", "isDeleted", { unique: false });
    }

    if (!db.objectStoreNames.contains(STORES.ROLES)) {
      db.createObjectStore(STORES.ROLES, { keyPath: "key" });
    }

    if (!db.objectStoreNames.contains(STORES.BILLS)) {
      const s = db.createObjectStore(STORES.BILLS, { keyPath: "billId" });
      s.createIndex("storeId", "storeId", { unique: false });
      s.createIndex("serialNo", "serialNo", { unique: false });
      s.createIndex("createdAt", "createdAt", { unique: false });
      s.createIndex("_syncStatus", "_syncStatus", { unique: false });
    }

    if (!db.objectStoreNames.contains(STORES.BILL_ITEMS)) {
      const s = db.createObjectStore(STORES.BILL_ITEMS, {
        keyPath: "itemId", autoIncrement: true,
      });
      s.createIndex("billId", "billId", { unique: false });
    }

    if (!db.objectStoreNames.contains(STORES.SESSIONS)) {
      const s = db.createObjectStore(STORES.SESSIONS, { keyPath: "sessionId" });
      s.createIndex("uid", "uid", { unique: false });
      s.createIndex("createdAt", "createdAt", { unique: false });
    }

    if (!db.objectStoreNames.contains(STORES.SYNC_QUEUE)) {
      const s = db.createObjectStore(STORES.SYNC_QUEUE, {
        keyPath: "queueId", autoIncrement: true,
      });
      s.createIndex("priority", "priority", { unique: false });
      s.createIndex("status", "status", { unique: false });
      s.createIndex("createdAt", "createdAt", { unique: false });
      s.createIndex("type", "type", { unique: false });
    }

    if (!db.objectStoreNames.contains(STORES.LOGS)) {
      const s = db.createObjectStore(STORES.LOGS, {
        keyPath: "logId", autoIncrement: true,
      });
      s.createIndex("uid", "uid", { unique: false });
      s.createIndex("action", "action", { unique: false });
      s.createIndex("createdAt", "createdAt", { unique: false });
    }

    if (!db.objectStoreNames.contains(STORES.PAYMENTS)) {
      const s = db.createObjectStore(STORES.PAYMENTS, { keyPath: "paymentId" });
      s.createIndex("billId", "billId", { unique: false });
      s.createIndex("createdAt", "createdAt", { unique: false });
    }

    if (!db.objectStoreNames.contains(STORES.SETTINGS)) {
      db.createObjectStore(STORES.SETTINGS, { keyPath: "key" });
    }

    if (!db.objectStoreNames.contains(STORES.STORES_CACHE)) {
      db.createObjectStore(STORES.STORES_CACHE, { keyPath: "id" });
    }

    if (!db.objectStoreNames.contains(STORES.DRAFTS)) {
      const s = db.createObjectStore(STORES.DRAFTS, { keyPath: "draftId" });
      s.createIndex("storeId", "storeId", { unique: false });
      s.createIndex("userId", "userId", { unique: false });
      s.createIndex("savedAt", "savedAt", { unique: false });
    }

    if (!db.objectStoreNames.contains(STORES.ORDERS)) {
      const s = db.createObjectStore(STORES.ORDERS, { keyPath: "localId" });
      s.createIndex("storeId", "storeId", { unique: false });
      s.createIndex("status", "status", { unique: false });
      s.createIndex("savedAt", "savedAt", { unique: false });
    }

    if (!db.objectStoreNames.contains(STORES.CUSTOMERS)) {
      const s = db.createObjectStore(STORES.CUSTOMERS, { keyPath: "id" });
      s.createIndex("storeId", "storeId", { unique: false });
      s.createIndex("phone", "phone", { unique: false });
    }
  };

  request.onsuccess = (e) => {
    _db = e.target.result;

    _db.onversionchange = () => {
      _db.close();
      _db = null;
      console.warn("[IDB] Version change — DB closed, reload required");
    };

    resolve(_db);
  };

  request.onerror = (e) => {
    console.error("[IndexedDB] open error:", e.target.error);
    reject(e.target.error);
  };

  request.onblocked = () => {
    console.warn("[IndexedDB] upgrade blocked — close other tabs");
  };
});

// ══════════════════════════════════════════════════════════════
// GENERIC CRUD
// ══════════════════════════════════════════════════════════════
const _tx = async (storeName, mode = "readonly") => {
  const db = await openDB();
  return db.transaction(storeName, mode).objectStore(storeName);
};

const _promisify = (request) => new Promise((resolve, reject) => {
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

export const dbPut = async (storeName, record) => {
  try {
    const store = await _tx(storeName, "readwrite");
    return _promisify(store.put(record));
  } catch (err) {
    console.error(`[IDB] dbPut ${storeName}:`, err);
    throw err;
  }
};

export const dbGet = async (storeName, key) => {
  try {
    const store = await _tx(storeName);
    return _promisify(store.get(key));
  } catch (err) {
    console.error(`[IDB] dbGet ${storeName}/${key}:`, err);
    return null;
  }
};

export const dbGetAll = async (storeName) => {
  try {
    const store = await _tx(storeName);
    return _promisify(store.getAll());
  } catch (err) {
    console.error(`[IDB] dbGetAll ${storeName}:`, err);
    return [];
  }
};

export const dbDelete = async (storeName, key) => {
  if (key === undefined || key === null || key === '') {
    console.warn(`[IDB] dbDelete ${storeName}: skipped — invalid key`);
    return false;
  }
  try {
    const store = await _tx(storeName, "readwrite");
    return _promisify(store.delete(key));
  } catch (err) {
    console.error(`[IDB] dbDelete ${storeName}/${key}:`, err);
    return false;
  }
};

export const dbClear = async (storeName) => {
  try {
    const store = await _tx(storeName, "readwrite");
    return _promisify(store.clear());
  } catch (err) {
    console.error(`[IDB] dbClear ${storeName}:`, err);
    return false;
  }
};

export const dbCount = async (storeName) => {
  try {
    const store = await _tx(storeName);
    return _promisify(store.count());
  } catch {
    return 0;
  }
};

// ══════════════════════════════════════════════════════════════
// SYNC QUEUE API
// Master Prompt §5: FIFO, retry, backoff, dead-letter
// ══════════════════════════════════════════════════════════════

/**
 * Add operation to sync queue
 * Priority: 1=highest (users/payments), 5=lowest (logs)
 */
export const addToSyncQueue = async (op) => {
  try {
    const store = await _tx(STORES.SYNC_QUEUE, "readwrite");
    return _promisify(store.add({
      status: "pending",
      attempts: 0,
      priority: op.priority || 3,
      createdAt: Date.now(),
      nextRetry: Date.now(),
      ...op,
    }));
  } catch (err) {
    console.error("[IDB] addToSyncQueue:", err);
    return null;
  }
};

/**
 * Get pending sync operations — FIFO order, priority-first
 * Filters out dead-letter and max-retry items
 */
export const getPendingSyncOps = async () => {
  try {
    const store = await _tx(STORES.SYNC_QUEUE);
    const all = await _promisify(store.getAll());
    return all
      .filter((op) =>
        (op.status === "pending" || op.status === "failed") &&
        (op.attempts || 0) < 5 &&
        (op.nextRetry || 0) <= Date.now()
      )
      .sort((a, b) => {
        if (a.priority !== b.priority) return (a.priority || 3) - (b.priority || 3);
        return (a.createdAt || 0) - (b.createdAt || 0);
      });
  } catch {
    return [];
  }
};

/**
 * Update sync operation status
 */
export const updateSyncOpStatus = async (queueId, status, extra = {}) => {
  try {
    const store = await _tx(STORES.SYNC_QUEUE, "readwrite");
    const op = await _promisify(store.get(queueId));
    if (!op) return false;
    await _promisify(store.put({ ...op, status, updatedAt: Date.now(), ...extra }));
    return true;
  } catch {
    return false;
  }
};

/**
 * Increment attempt count with exponential backoff
 * Moves to dead_letter after 5 attempts
 */
export const incrementSyncAttempt = async (queueId, error = null) => {
  try {
    const store = await _tx(STORES.SYNC_QUEUE, "readwrite");
    const op = await _promisify(store.get(queueId));
    if (!op) return;

    const attempts = (op.attempts || 0) + 1;

    // Exponential backoff: 5s, 15s, 45s, 2min, 5min
    const BACKOFF = [5000, 15000, 45000, 120000, 300000];
    const delay = BACKOFF[Math.min(attempts - 1, BACKOFF.length - 1)];

    const status = attempts >= 5 ? "dead_letter" : "failed";

    await _promisify(store.put({
      ...op,
      attempts,
      status,
      lastError: error?.message || String(error || ""),
      lastAttemptAt: Date.now(),
      nextRetry: Date.now() + delay,
    }));
  } catch (err) {
    console.warn("[IDB] incrementSyncAttempt:", err);
  }
};

/**
 * Remove sync operation (after successful sync)
 */
export const removeSyncOp = async (queueId) => {
  try {
    const store = await _tx(STORES.SYNC_QUEUE, "readwrite");
    return _promisify(store.delete(queueId));
  } catch {
    return false;
  }
};

/**
 * Get sync queue statistics
 */
export const getSyncQueueStats = async () => {
  try {
    const all = await dbGetAll(STORES.SYNC_QUEUE);
    return {
      total: all.length,
      pending: all.filter((o) => o.status === "pending").length,
      syncing: all.filter((o) => o.status === "syncing").length,
      synced: all.filter((o) => o.status === "synced").length,
      failed: all.filter((o) => o.status === "failed").length,
      deadLetter: all.filter((o) => o.status === "dead_letter").length,
    };
  } catch {
    return { total: 0, pending: 0, syncing: 0, synced: 0, failed: 0, deadLetter: 0 };
  }
};

// ══════════════════════════════════════════════════════════════
// ✅ ALIASES — userSyncService compatibility
// Same functions, different names — zero duplication
// ══════════════════════════════════════════════════════════════
export const getPendingSyncItems = getPendingSyncOps;
export const markSyncFailed = incrementSyncAttempt;
export const updateSyncQueueItem = updateSyncOpStatus;

// ══════════════════════════════════════════════════════════════
// LOGS API
// ══════════════════════════════════════════════════════════════
export const logAction = async (action, details = {}) => {
  try {
    const store = await _tx(STORES.LOGS, "readwrite");
    await _promisify(store.add({
      action,
      details,
      uid: details.uid || "system",
      createdAt: Date.now(),
    }));
  } catch (err) {
    console.warn("[IDB] logAction:", err);
  }
};

// ══════════════════════════════════════════════════════════════
// SETTINGS CACHE
// ══════════════════════════════════════════════════════════════
export const setCachedSetting = async (key, value) => {
  try {
    const store = await _tx(STORES.SETTINGS, "readwrite");
    await _promisify(store.put({ key, value, savedAt: Date.now() }));
  } catch { /* ignore */ }
};

export const getCachedSetting = async (key) => {
  try {
    const store = await _tx(STORES.SETTINGS);
    const item = await _promisify(store.get(key));
    return item?.value ?? null;
  } catch {
    return null;
  }
};

// ══════════════════════════════════════════════════════════════
// SESSION HELPERS
// Master Prompt §10: Persistent login, session in IndexedDB
// ══════════════════════════════════════════════════════════════
export const saveSession = async (sessionData) => {
  try {
    await dbPut(STORES.SESSIONS, {
      sessionId: sessionData.uid || sessionData.sessionId,
      ...sessionData,
      savedAt: Date.now(),
      expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000, // 30 days
    });
    return true;
  } catch {
    return false;
  }
};

export const getSession = async (uid) => {
  try {
    const session = await dbGet(STORES.SESSIONS, uid);
    if (!session) return null;
    if (session.expiresAt && session.expiresAt < Date.now()) {
      await dbDelete(STORES.SESSIONS, uid);
      return null;
    }
    return session;
  } catch {
    return null;
  }
};

export const clearSession = async (uid) => {
  try {
    await dbDelete(STORES.SESSIONS, uid);
    return true;
  } catch {
    return false;
  }
};

// ══════════════════════════════════════════════════════════════
// LEGACY API (backward compat — DO NOT REMOVE)
// ══════════════════════════════════════════════════════════════
export const saveDraftBill = async (draftId, data) => {
  try {
    await dbPut(STORES.DRAFTS, { draftId, savedAt: Date.now(), ...data });
    return true;
  } catch { return false; }
};

export const getDraftBill = async (draftId) => {
  try { return await dbGet(STORES.DRAFTS, draftId); }
  catch { return null; }
};

export const deleteDraftBill = async (draftId) => {
  try { await dbDelete(STORES.DRAFTS, draftId); return true; }
  catch { return false; }
};

export const getAllDrafts = async (storeId, userId) => {
  try {
    const all = await dbGetAll(STORES.DRAFTS);
    return all.filter((d) => d.storeId === storeId && d.userId === userId);
  } catch { return []; }
};

export const saveOfflineOrder = async (orderData) => {
  try {
    const localId = `offline_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    await dbPut(STORES.ORDERS, {
      localId,
      status: "pending_sync",
      savedAt: Date.now(),
      ...orderData,
    });
    return localId;
  } catch { return null; }
};

export const getPendingOrders = async () => {
  try {
    const all = await dbGetAll(STORES.ORDERS);
    return all.filter((o) => o.status === "pending_sync");
  } catch { return []; }
};

export const markOrderSynced = async (localId, firebaseId) => {
  try {
    const order = await dbGet(STORES.ORDERS, localId);
    if (!order) return false;
    await dbPut(STORES.ORDERS, {
      ...order,
      status: "synced",
      firebaseId,
      syncedAt: Date.now(),
    });
    return true;
  } catch { return false; }
};

export const getOfflineOrdersCount = async () => {
  try { return (await getPendingOrders()).length; }
  catch { return 0; }
};

// Legacy alias names
export const markSyncOpDone = removeSyncOp;
export const incrementSyncRetry = incrementSyncAttempt;

// ══════════════════════════════════════════════════════════════
// DEFAULT EXPORT
// ══════════════════════════════════════════════════════════════
export default {
  openDB,
  STORES,
  // CRUD
  dbPut, dbGet, dbGetAll, dbDelete, dbClear, dbCount,
  // Sync queue
  addToSyncQueue,
  getPendingSyncOps,
  getPendingSyncItems,   // alias
  updateSyncOpStatus,
  updateSyncQueueItem,   // alias
  incrementSyncAttempt,
  markSyncFailed,        // alias
  removeSyncOp,
  getSyncQueueStats,
  // Logs
  logAction,
  // Settings
  setCachedSetting,
  getCachedSetting,
  // Sessions
  saveSession,
  getSession,
  clearSession,
  // Legacy
  saveDraftBill,
  getDraftBill,
  deleteDraftBill,
  getAllDrafts,
  saveOfflineOrder,
  getPendingOrders,
  markOrderSynced,
  getOfflineOrdersCount,
  markSyncOpDone,
  incrementSyncRetry,
};