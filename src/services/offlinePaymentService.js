// src/services/offlinePaymentService.js
// ✅ PRODUCTION v3.0 — Complete Offline Payment System
// ✨ Offline-first: IndexedDB → sync_queue → Firebase
// ✨ Manual review for mismatches
// ✨ Auto-sync background worker compatible

const DB_NAME = "cashier_offline_payments";
const DB_VERSION = 2;
const STORES = {
  PAYMENTS: "payments",          // All offline payments
  SYNC_QUEUE: "sync_queue",      // Pending sync items
  MANUAL_REVIEW: "manual_review", // Mismatch / failed items
  CUSTOMERS: "customers",         // Offline customers cache
};

// ══════════════════════════════════════════════════════════════
// DEVICE ID (Persistent)
// ══════════════════════════════════════════════════════════════
const getDeviceId = () => {
  try {
    let id = localStorage.getItem("aone_device_id");
    if (!id) {
      id = `DEV_${Date.now()}_${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
      localStorage.setItem("aone_device_id", id);
    }
    return id;
  } catch {
    return "DEV_UNKNOWN";
  }
};

// ══════════════════════════════════════════════════════════════
// IndexedDB SETUP
// ══════════════════════════════════════════════════════════════
const openDB = () =>
  new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;

      // Payments store
      if (!db.objectStoreNames.contains(STORES.PAYMENTS)) {
        const store = db.createObjectStore(STORES.PAYMENTS, { keyPath: "localId" });
        store.createIndex("status", "status", { unique: false });
        store.createIndex("billId", "billId", { unique: false });
        store.createIndex("storeId", "storeId", { unique: false });
        store.createIndex("savedAt", "savedAt", { unique: false });
      }

      // Sync queue
      if (!db.objectStoreNames.contains(STORES.SYNC_QUEUE)) {
        const store = db.createObjectStore(STORES.SYNC_QUEUE, { keyPath: "queueId" });
        store.createIndex("type", "type", { unique: false });
        store.createIndex("status", "status", { unique: false });
        store.createIndex("retryCount", "retryCount", { unique: false });
        store.createIndex("createdAt", "createdAt", { unique: false });
      }

      // Manual review
      if (!db.objectStoreNames.contains(STORES.MANUAL_REVIEW)) {
        const store = db.createObjectStore(STORES.MANUAL_REVIEW, { keyPath: "localId" });
        store.createIndex("storeId", "storeId", { unique: false });
        store.createIndex("flaggedAt", "flaggedAt", { unique: false });
      }

      // Customers cache
      if (!db.objectStoreNames.contains(STORES.CUSTOMERS)) {
        db.createObjectStore(STORES.CUSTOMERS, { keyPath: "phone" });
      }
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
  });

// ══════════════════════════════════════════════════════════════
// CORE: SAVE OFFLINE PAYMENT
// ══════════════════════════════════════════════════════════════

/**
 * Save offline payment + add to sync queue
 * @param {Object} paymentData
 * @returns {Object} { localId, queueId, success }
 */
export const saveOfflinePayment = async (paymentData) => {
  try {
    const db = await openDB();
    const localId = `op_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const queueId = `q_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const now = new Date().toISOString();

    // 1. Build payment record
    const paymentRecord = {
      localId,
      type: "payment",
      billId: paymentData.billId,
      billSerial: paymentData.billSerial || "",
      enteredAmount: Number(paymentData.enteredAmount) || 0,
      paymentMethod: paymentData.paymentMethod || "Cash",
      cashierId: paymentData.cashierId || "",
      cashierName: paymentData.cashierName || "Cashier",
      storeId: paymentData.storeId || "default",
      branchId: paymentData.storeId || "default", // alias for branchId
      userId: paymentData.cashierId || "",
      customer: paymentData.customer || {},
      items: paymentData.items || [],
      isOffline: true,
      savedAt: now,
      timestamp: Date.now(),
      status: "offline_unsynced",
      deviceId: getDeviceId(),
      syncAttempts: 0,
    };

    // 2. Save to payments store
    await new Promise((resolve, reject) => {
      const tx = db.transaction([STORES.PAYMENTS, STORES.SYNC_QUEUE], "readwrite");
      tx.objectStore(STORES.PAYMENTS).put(paymentRecord);

      // 3. Add to sync_queue
      tx.objectStore(STORES.SYNC_QUEUE).put({
        queueId,
        type: "payment",
        targetLocalId: localId,
        targetCollection: "payments",
        status: "pending",
        retryCount: 0,
        maxRetries: 5,
        createdAt: now,
        timestamp: Date.now(),
        deviceId: getDeviceId(),
      });

      tx.oncomplete = () => resolve();
      tx.onerror = (e) => reject(e.target.error);
    });

    console.log(`[Offline] ✅ Payment saved: ${localId} → queued: ${queueId}`);
    return { localId, queueId, success: true, record: paymentRecord };
  } catch (err) {
    console.error("[Offline] Save failed:", err);
    return { success: false, error: err.message };
  }
};

// ══════════════════════════════════════════════════════════════
// MANUAL OFFLINE BILL (When QR/bill not found)
// ══════════════════════════════════════════════════════════════

/**
 * Save a manually-entered offline bill + payment
 * Used when QR scan fails and cashier types bill info manually
 */
export const saveManualOfflineBill = async (billData) => {
  try {
    const db = await openDB();
    const localId = `mob_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const queueId = `q_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const now = new Date().toISOString();

    const billRecord = {
      localId,
      type: "manual_bill",
      billSerial: billData.billSerial || `MANUAL-${Date.now()}`,
      enteredAmount: Number(billData.amount) || 0,
      paymentMethod: billData.paymentMethod || "Cash",
      cashierId: billData.cashierId || "",
      cashierName: billData.cashierName || "Cashier",
      storeId: billData.storeId || "default",
      branchId: billData.storeId || "default",
      userId: billData.cashierId || "",
      customer: billData.customer || { name: "Walk-in" },
      items: billData.items || [],
      notes: billData.notes || "",
      isOffline: true,
      isManualEntry: true,
      savedAt: now,
      timestamp: Date.now(),
      status: "offline_unsynced",
      deviceId: getDeviceId(),
      syncAttempts: 0,
    };

    await new Promise((resolve, reject) => {
      const tx = db.transaction([STORES.PAYMENTS, STORES.SYNC_QUEUE], "readwrite");
      tx.objectStore(STORES.PAYMENTS).put(billRecord);
      tx.objectStore(STORES.SYNC_QUEUE).put({
        queueId,
        type: "manual_bill",
        targetLocalId: localId,
        targetCollection: "bills", // Goes to bills collection
        status: "pending",
        retryCount: 0,
        maxRetries: 5,
        createdAt: now,
        timestamp: Date.now(),
        deviceId: getDeviceId(),
      });
      tx.oncomplete = () => resolve();
      tx.onerror = (e) => reject(e.target.error);
    });

    console.log(`[Offline] ✅ Manual bill saved: ${localId}`);
    return { localId, queueId, success: true, record: billRecord };
  } catch (err) {
    console.error("[Offline] Manual bill save failed:", err);
    return { success: false, error: err.message };
  }
};

// ══════════════════════════════════════════════════════════════
// SYNC QUEUE OPERATIONS
// ══════════════════════════════════════════════════════════════

/**
 * Get all pending sync queue items (sorted by oldest first)
 */
export const getPendingSyncItems = async () => {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORES.SYNC_QUEUE, "readonly");
      const req = tx.objectStore(STORES.SYNC_QUEUE).getAll();
      req.onsuccess = (e) => {
        const items = (e.target.result || [])
          .filter((i) => i.status === "pending" && i.retryCount < (i.maxRetries || 5))
          .sort((a, b) => a.timestamp - b.timestamp);
        resolve(items);
      };
      req.onerror = () => resolve([]);
    });
  } catch {
    return [];
  }
};

/**
 * Get pending offline payments (backward compatibility)
 */
export const getPendingOfflinePayments = async () => {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORES.PAYMENTS, "readonly");
      const req = tx.objectStore(STORES.PAYMENTS).getAll();
      req.onsuccess = (e) =>
        resolve((e.target.result || []).filter((r) => r.status === "offline_unsynced"));
      req.onerror = () => resolve([]);
    });
  } catch {
    return [];
  }
};

/**
 * Mark queue item as synced + update payment status
 */
export const markSynced = async (queueId, targetLocalId) => {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORES.SYNC_QUEUE, STORES.PAYMENTS], "readwrite");
      const queueStore = tx.objectStore(STORES.SYNC_QUEUE);
      const paymentStore = tx.objectStore(STORES.PAYMENTS);

      // Update queue
      const qReq = queueStore.get(queueId);
      qReq.onsuccess = (e) => {
        const item = e.target.result;
        if (item) {
          item.status = "synced";
          item.syncedAt = new Date().toISOString();
          queueStore.put(item);
        }
      };

      // Update payment
      if (targetLocalId) {
        const pReq = paymentStore.get(targetLocalId);
        pReq.onsuccess = (e) => {
          const payment = e.target.result;
          if (payment) {
            payment.status = "synced";
            payment.syncedAt = new Date().toISOString();
            paymentStore.put(payment);
          }
        };
      }

      tx.oncomplete = () => resolve();
      tx.onerror = (e) => reject(e.target.error);
    });
  } catch (err) {
    console.error("[Offline] markSynced failed:", err);
  }
};

/** Alias for backward compatibility */
export const markOfflinePaymentSynced = async (localId) => {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORES.PAYMENTS, "readwrite");
      const store = tx.objectStore(STORES.PAYMENTS);
      const req = store.get(localId);
      req.onsuccess = (e) => {
        const record = e.target.result;
        if (record) {
          record.status = "synced";
          record.syncedAt = new Date().toISOString();
          store.put(record);
        }
        resolve();
      };
      req.onerror = () => resolve();
    });
  } catch {}
};

/**
 * Increment retry count on sync failure
 */
export const incrementRetry = async (queueId, errorMsg = "") => {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORES.SYNC_QUEUE, "readwrite");
      const store = tx.objectStore(STORES.SYNC_QUEUE);
      const req = store.get(queueId);
      req.onsuccess = (e) => {
        const item = e.target.result;
        if (item) {
          item.retryCount = (item.retryCount || 0) + 1;
          item.lastError = errorMsg;
          item.lastTriedAt = new Date().toISOString();
          // If max retries exceeded, mark as failed
          if (item.retryCount >= (item.maxRetries || 5)) {
            item.status = "failed";
          }
          store.put(item);
        }
        resolve();
      };
      req.onerror = () => resolve();
    });
  } catch {}
};

// ══════════════════════════════════════════════════════════════
// MANUAL REVIEW QUEUE
// ══════════════════════════════════════════════════════════════

/**
 * Move payment to manual review queue
 */
export const moveToManualReview = async (localId, reason) => {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction([STORES.PAYMENTS, STORES.MANUAL_REVIEW], "readwrite");
      const paymentStore = tx.objectStore(STORES.PAYMENTS);
      const reviewStore = tx.objectStore(STORES.MANUAL_REVIEW);
      const req = paymentStore.get(localId);
      req.onsuccess = (e) => {
        const record = e.target.result;
        if (record) {
          record.status = "manual_review";
          record.reviewReason = reason;
          record.flaggedAt = new Date().toISOString();
          paymentStore.put(record);
          // Also copy to review store for fast access
          reviewStore.put({ ...record });
        }
        resolve();
      };
      req.onerror = () => resolve();
    });
  } catch {}
};

/**
 * Get all items in manual review queue
 * @param {string} storeId - Optional filter by store
 */
export const getManualReviewQueue = async (storeId = null) => {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORES.MANUAL_REVIEW, "readonly");
      const req = tx.objectStore(STORES.MANUAL_REVIEW).getAll();
      req.onsuccess = (e) => {
        let items = e.target.result || [];
        if (storeId) {
          items = items.filter((i) => i.storeId === storeId);
        }
        resolve(items);
      };
      req.onerror = () => resolve([]);
    });
  } catch {
    return [];
  }
};

/**
 * Resolve manual review item
 * @param {string} localId
 * @param {string} decision - "approve" | "reject" | "investigate"
 */
export const resolveManualReview = async (localId, decision) => {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction([STORES.PAYMENTS, STORES.MANUAL_REVIEW], "readwrite");
      const paymentStore = tx.objectStore(STORES.PAYMENTS);
      const reviewStore = tx.objectStore(STORES.MANUAL_REVIEW);

      const req = paymentStore.get(localId);
      req.onsuccess = (e) => {
        const record = e.target.result;
        if (record) {
          record.status = `resolved_${decision}`;
          record.resolvedAt = new Date().toISOString();
          paymentStore.put(record);
          // Remove from review queue
          reviewStore.delete(localId);
        }
        resolve();
      };
      req.onerror = () => resolve();
    });
  } catch {}
};

// ══════════════════════════════════════════════════════════════
// STATS & UTILITIES
// ══════════════════════════════════════════════════════════════

/**
 * Get sync statistics
 */
export const getSyncStats = async () => {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction([STORES.PAYMENTS, STORES.SYNC_QUEUE], "readonly");
      const stats = {
        pending: 0,
        synced: 0,
        failed: 0,
        manualReview: 0,
        totalAmount: 0,
      };

      const paymentReq = tx.objectStore(STORES.PAYMENTS).getAll();
      paymentReq.onsuccess = (e) => {
        const payments = e.target.result || [];
        payments.forEach((p) => {
          if (p.status === "offline_unsynced") stats.pending++;
          else if (p.status === "synced") stats.synced++;
          else if (p.status === "manual_review") stats.manualReview++;
          else if (p.status?.startsWith("failed")) stats.failed++;
          stats.totalAmount += Number(p.enteredAmount) || 0;
        });
        resolve(stats);
      };
      paymentReq.onerror = () => resolve(stats);
    });
  } catch {
    return { pending: 0, synced: 0, failed: 0, manualReview: 0, totalAmount: 0 };
  }
};

/**
 * Clear all synced records (cleanup)
 */
export const clearSyncedRecords = async (olderThanDays = 7) => {
  try {
    const cutoff = Date.now() - olderThanDays * 24 * 60 * 60 * 1000;
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction([STORES.PAYMENTS, STORES.SYNC_QUEUE], "readwrite");
      const paymentStore = tx.objectStore(STORES.PAYMENTS);
      const queueStore = tx.objectStore(STORES.SYNC_QUEUE);

      const paymentReq = paymentStore.getAll();
      paymentReq.onsuccess = (e) => {
        (e.target.result || [])
          .filter((p) => p.status === "synced" && p.timestamp < cutoff)
          .forEach((p) => paymentStore.delete(p.localId));
      };

      const queueReq = queueStore.getAll();
      queueReq.onsuccess = (e) => {
        (e.target.result || [])
          .filter((q) => q.status === "synced" && q.timestamp < cutoff)
          .forEach((q) => queueStore.delete(q.queueId));
      };

      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {}
};

// ══════════════════════════════════════════════════════════════
// DEFAULT EXPORT
// ══════════════════════════════════════════════════════════════

export default {
  saveOfflinePayment,
  saveManualOfflineBill,
  getPendingSyncItems,
  getPendingOfflinePayments,
  markSynced,
  markOfflinePaymentSynced,
  incrementRetry,
  moveToManualReview,
  getManualReviewQueue,
  resolveManualReview,
  getSyncStats,
  clearSyncedRecords,
};