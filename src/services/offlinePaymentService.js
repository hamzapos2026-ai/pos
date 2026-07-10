// src/services/offlinePaymentService.js
// ✅ PRODUCTION v3.0 — Complete Offline Payment System
// ✨ Offline-first: IndexedDB → sync_queue → Firebase
// ✨ Manual review for mismatches
// ✨ Auto-sync background worker compatible

import { getDeviceId } from '../utils/billIdGenerator';

const DB_NAME = "cashier_offline_payments";
const DB_VERSION = 3;
const STORES = {
  PAYMENTS: "payments",          // All offline payments
  SYNC_QUEUE: "sync_queue",      // Pending sync items
  MANUAL_REVIEW: "manual_review", // Mismatch / failed items
  CUSTOMERS: "customers",         // Offline customers cache
};

const notifyBillsCloudUpdated = () => {
  try {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('aone:bills-cloud-updated'));
    }
  } catch { /* ignore */ }
};

// ══════════════════════════════════════════════════════════════
// DEVICE ID (Persistent)
// ══════════════════════════════════════════════════════════════
const _getOfflinePaymentDeviceId = () => {
  try {
    return getDeviceId();
  } catch {
    return 'DEV_UNKNOWN';
  }
};

// ══════════════════════════════════════════════════════════════
// IndexedDB SETUP
// ══════════════════════════════════════════════════════════════
let dbPromise = null;

const openDB = () => {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;

      // Payments store
      if (!db.objectStoreNames.contains(STORES.PAYMENTS)) {
        const store = db.createObjectStore(STORES.PAYMENTS, { keyPath: "localId" });
        store.createIndex("status", "status", { unique: false });
        store.createIndex("billId", "billId", { unique: false });
        store.createIndex("billSerial", "billSerial", { unique: false });
        store.createIndex("storeId", "storeId", { unique: false });
        store.createIndex("savedAt", "savedAt", { unique: false });
      } else {
        const store = e.target.transaction.objectStore(STORES.PAYMENTS);
        if (!store.indexNames.contains("billSerial")) {
          store.createIndex("billSerial", "billSerial", { unique: false });
        }
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
    req.onerror = (e) => {
      dbPromise = null;
      reject(e.target.error);
    };
    req.onblocked = () => {
      dbPromise = null;
    };
  });
  return dbPromise;
};

const _idbIndexGetAll = (store, indexName, key) => new Promise((resolve) => {
  try {
    const req = store.index(indexName).getAll(key);
    req.onsuccess = (ev) => resolve(ev.target.result || []);
    req.onerror = () => resolve([]);
  } catch {
    resolve([]);
  }
});

const _hasActivePayment = (records = []) => records.some(
  (p) => p.status === "offline_unsynced" || p.status === "synced" || p.status === "manual_review",
);

const _findExistingPayments = async (db, { billId, billSerial }) => {
  const found = new Map();
  const tx = db.transaction(STORES.PAYMENTS, "readonly");
  const store = tx.objectStore(STORES.PAYMENTS);
  if (billId) {
    const byId = await _idbIndexGetAll(store, "billId", billId);
    byId.forEach((p) => found.set(p.localId, p));
  }
  const serialUpper = String(billSerial || "").trim().toUpperCase();
  if (serialUpper && store.indexNames.contains("billSerial")) {
    const bySerial = await _idbIndexGetAll(store, "billSerial", serialUpper);
    bySerial.forEach((p) => found.set(p.localId, p));
  }
  return [...found.values()];
};

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
    const existing = await _findExistingPayments(db, {
      billId: paymentData.billId,
      billSerial: paymentData.billSerial,
    });
    if (_hasActivePayment(existing)) {
      console.warn('[Offline] Duplicate blocked — payment already exists for', paymentData.billSerial || paymentData.billId);
      return { success: false, duplicate: true, error: 'Payment already saved for this bill' };
    }

    const localId = `op_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const queueId = `q_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const now = new Date().toISOString();

    // 1. Build payment record
    const paymentRecord = {
      localId,
      type: "payment",
      billId: paymentData.billId,
      billSerial: String(paymentData.billSerial || "").trim().toUpperCase(),
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
      receiptPay: Boolean(paymentData.receiptPay),
      qrVerified: Boolean(paymentData.qrVerified),
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
        maxRetries: 10,
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
        maxRetries: 10,
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
          .filter((i) => i.status === "pending" && i.retryCount < (i.maxRetries || 10))
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
 * Push one payment to Firebase immediately (online cashier pay).
 * Netlify / other devices update via Firestore — no redeploy needed.
 */
export const syncPaymentToFirebaseNow = async (paymentOrLocalId, queueId = null) => {
  try {
    const db = await openDB();
    let payment = paymentOrLocalId;
    if (typeof paymentOrLocalId === 'string') {
      payment = await new Promise((resolve) => {
        const tx = db.transaction(STORES.PAYMENTS, 'readonly');
        const req = tx.objectStore(STORES.PAYMENTS).get(paymentOrLocalId);
        req.onsuccess = (e) => resolve(e.target.result || null);
        req.onerror = () => resolve(null);
      });
    }
    if (!payment?.localId) return { success: false, error: 'payment_not_found' };

    const { reconcilePayment } = await import('./paymentReconciliationService');
    const result = await reconcilePayment(payment);

    if (result.success) {
      let qid = queueId;
      if (!qid) {
        const items = await getPendingSyncItems();
        qid = items.find((i) => i.targetLocalId === payment.localId)?.queueId;
      }
      if (qid) await markSynced(qid, payment.localId);
      console.log(`[Offline] ☁️ Payment synced to Firebase: ${payment.billSerial || payment.localId}`);
      notifyBillsCloudUpdated();
    }

    return result;
  } catch (err) {
    console.warn('[Offline] syncPaymentToFirebaseNow:', err?.message);
    return { success: false, error: err?.message };
  }
};

/** Push one saved offline payment to Firebase ASAP (full reconcile or orphan queue). */
export const pushOfflinePaymentToCloud = async (payment, queueId = null) => {
  if (!payment?.localId) return { success: false, error: 'payment_not_found' };
  const { getHasInternet } = await import('../utils/networkReachability');
  if (!getHasInternet()) return { success: false, offline: true };

  const result = await syncPaymentToFirebaseNow(payment, queueId);
  if (result.success) return result;

  if (result.needsRetry) {
    try {
      const { syncOrphanPaymentToCloud } = await import('./paymentReconciliationService');
      await syncOrphanPaymentToCloud(payment);
    } catch { /* non-critical */ }
  }
  return result;
};

/** Flush all unsynced payments to Firebase — run on cashier login when online. */
export const flushPendingPaymentsToFirebase = async () => {
  const pending = await getPendingOfflinePayments();
  if (!pending.length) return { synced: 0, failed: 0 };

  let synced = 0;
  let failed = 0;
  const queue = await getPendingSyncItems();

  for (const payment of pending) {
    const qItem = queue.find((q) => q.targetLocalId === payment.localId);
    const result = await syncPaymentToFirebaseNow(payment, qItem?.queueId);
    if (result.success) synced += 1;
    else failed += 1;
  }

  if (synced > 0) {
    console.log(`[Offline] ☁️ Flushed ${synced} payment(s) to Firebase`);
    notifyBillsCloudUpdated();
  }
  return { synced, failed };
};

/** Serials + billIds that already have a saved payment (unsynced or synced). */
export const getOfflinePaidBillKeys = async () => {
  const serials = new Set();
  const billIds = new Set();
  try {
    const raw = localStorage.getItem('aone_optimistic_paid_v1');
    if (raw) {
      const parsed = JSON.parse(raw);
      const { getBillSerialKey } = await import('../utils/serialMatch');
      (parsed.serials || []).forEach((s) => {
        const key = getBillSerialKey({ billSerial: s }) || String(s).trim().toUpperCase().replace(/^#+/, '');
        if (key) serials.add(key);
      });
      (parsed.billIds || []).forEach((id) => billIds.add(String(id).trim()));
    }
  } catch { /* ignore */ }
  try {
    const db = await openDB();
    const rows = await new Promise((resolve) => {
      const tx = db.transaction(STORES.PAYMENTS, "readonly");
      const req = tx.objectStore(STORES.PAYMENTS).getAll();
      req.onsuccess = (e) => resolve(e.target.result || []);
      req.onerror = () => resolve([]);
    });
    const { getBillSerialKey } = await import('../utils/serialMatch');
    for (const p of rows) {
      const serial = getBillSerialKey(p) || String(p.billSerial || '').trim().toUpperCase().replace(/^#+/, '');
      const billId = String(p.billId || '').trim();
      // Cashier instant-pay / escalated review — never show again in pending queue
      if (
        p.status === "offline_unsynced"
        || p.status === "synced"
        || p.status === "manual_review"
        || p.cashierEscalated === true
      ) {
        if (serial) serials.add(serial);
        if (billId) billIds.add(billId);
      }
    }
  } catch { /* ignore */ }
  return { serials, billIds };
};

/** Clear stuck manual_review / queue rows so re-pay works (e.g. #000127). */
export const clearStuckPaymentsForBill = async ({ billSerial, billId } = {}) => {
  const serial = String(billSerial || "").trim().toUpperCase();
  const bid = String(billId || "").trim();
  if (!serial && !bid) return { cleared: 0 };
  try {
    const db = await openDB();
    let cleared = 0;
    await new Promise((resolve) => {
      const tx = db.transaction([STORES.PAYMENTS, STORES.MANUAL_REVIEW, STORES.SYNC_QUEUE], "readwrite");
      const paymentStore = tx.objectStore(STORES.PAYMENTS);
      const reviewStore = tx.objectStore(STORES.MANUAL_REVIEW);
      const queueStore = tx.objectStore(STORES.SYNC_QUEUE);
      const req = paymentStore.getAll();
      req.onsuccess = (e) => {
        (e.target.result || []).forEach((p) => {
          const pSerial = String(p.billSerial || "").trim().toUpperCase();
          const pBid = String(p.billId || "").trim();
          const match = (serial && pSerial === serial) || (bid && pBid === bid);
          if (!match) return;
          if (p.status === "manual_review" || p.status === "offline_unsynced") {
            paymentStore.delete(p.localId);
            reviewStore.delete(p.localId);
            cleared += 1;
          }
        });
        const qReq = queueStore.getAll();
        qReq.onsuccess = (ev) => {
          (ev.target.result || []).forEach((q) => {
            if (!q.targetLocalId) return;
            paymentStore.get(q.targetLocalId).onsuccess = (pr) => {
              const p = pr.target.result;
              if (!p) {
                queueStore.delete(q.queueId);
                return;
              }
              const pSerial = String(p.billSerial || "").trim().toUpperCase();
              const pBid = String(p.billId || "").trim();
              if ((serial && pSerial === serial) || (bid && pBid === bid)) {
                queueStore.delete(q.queueId);
              }
            };
          });
        };
        resolve();
      };
      req.onerror = () => resolve();
    });
    return { cleared };
  } catch {
    return { cleared: 0 };
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

/** Alias for backward compatibility — also clears sync queue so worker won't re-process */
export const markOfflinePaymentSynced = async (localId, queueId = null) => {
  try {
    if (queueId) {
      await markSynced(queueId, localId);
      return;
    }
    const db = await openDB();
    await new Promise((resolve) => {
      const tx = db.transaction([STORES.SYNC_QUEUE, STORES.PAYMENTS], "readwrite");
      const queueStore = tx.objectStore(STORES.SYNC_QUEUE);
      const paymentStore = tx.objectStore(STORES.PAYMENTS);
      const qReq = queueStore.getAll();
      qReq.onsuccess = (e) => {
        (e.target.result || []).forEach((item) => {
          if (item.targetLocalId === localId && item.status === "pending") {
            item.status = "synced";
            item.syncedAt = new Date().toISOString();
            queueStore.put(item);
          }
        });
        const pReq = paymentStore.get(localId);
        pReq.onsuccess = (ev) => {
          const record = ev.target.result;
          if (record) {
            record.status = "synced";
            record.syncedAt = new Date().toISOString();
            paymentStore.put(record);
          }
        };
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      };
      qReq.onerror = () => resolve();
    });
  } catch { /* ignore */ }
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
          if (item.retryCount >= (item.maxRetries || 10)) {
            item.status = "failed";
            store.put(item);
            void moveToManualReview(item.targetLocalId, errorMsg || 'Max sync retries exceeded');
          } else {
            store.put(item);
          }
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

/** Bill not synced yet — auto-retry when biller comes online (not a manager action). */
export const isWaitingForBillSync = (reason = '') => {
  const r = String(reason).toLowerCase();
  return (
    r.includes('bill not found')
    || r.includes('waiting for biller')
    || r.includes('not yet synced')
    || r.includes('will retry when bill arrives')
  );
};

/** Wrong serial/amount — cashier may correct once and re-enter. */
export const isAmountMismatchReview = (reason = '') => {
  const r = String(reason).toLowerCase();
  return r.includes('amount') || r.includes('mismatch') || r.includes('fraud');
};

/** Remove failed payment so cashier can re-enter correct serial/amount once. */
export const releasePaymentForCorrection = async (localId) => {
  if (!localId) return { success: false };
  try {
    const db = await openDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(
        [STORES.PAYMENTS, STORES.MANUAL_REVIEW, STORES.SYNC_QUEUE],
        'readwrite',
      );
      tx.objectStore(STORES.PAYMENTS).delete(localId);
      tx.objectStore(STORES.MANUAL_REVIEW).delete(localId);
      const qStore = tx.objectStore(STORES.SYNC_QUEUE);
      const qReq = qStore.getAll();
      qReq.onsuccess = (e) => {
        (e.target.result || []).forEach((q) => {
          if (q.targetLocalId === localId) qStore.delete(q.queueId);
        });
      };
      tx.oncomplete = () => resolve();
      tx.onerror = (e) => reject(e.target.error);
    });
    return { success: true };
  } catch (err) {
    console.warn('[Offline] releasePaymentForCorrection:', err?.message);
    return { success: false, error: err?.message };
  }
};

/**
 * Move payment to manual review queue
 */
export const moveToManualReview = async (localId, reason) => {
  try {
    const db = await openDB();
    let record = null;
    let skipped = false;
    await new Promise((resolve) => {
      const tx = db.transaction([STORES.PAYMENTS, STORES.MANUAL_REVIEW], "readwrite");
      const paymentStore = tx.objectStore(STORES.PAYMENTS);
      const reviewStore = tx.objectStore(STORES.MANUAL_REVIEW);
      const req = paymentStore.get(localId);
      req.onsuccess = (e) => {
        record = e.target.result;
        if (!record) {
          resolve();
          return;
        }
        if (
          record.status === 'manual_review'
          && (record.cashierEscalated || !isWaitingForBillSync(record.reviewReason))
        ) {
          skipped = true;
          resolve();
          return;
        }
        record.status = "manual_review";
        record.reviewReason = reason;
        record.flaggedAt = new Date().toISOString();
        if (!isWaitingForBillSync(reason)) {
          record.cashierEscalated = true;
        }
        paymentStore.put(record);
        reviewStore.put({ ...record });
        resolve();
      };
      req.onerror = () => resolve();
    });

    if (skipped || !record) return;

    // Only flag fraud for real mismatches — not "bill not found / waiting for biller sync"
    if (!isWaitingForBillSync(reason)) {
      try {
        const { flagFraudReview, FRAUD_REASONS } = await import('./paymentReconciliationService.js');
        const { getHasInternet } = await import('../utils/networkReachability.js');
        if (getHasInternet()) {
          await flagFraudReview({
            payment: record,
            reason: FRAUD_REASONS.AMOUNT_MISMATCH,
            details: reason,
            storeId: record.storeId,
          });
        }
      } catch { /* non-critical */ }
    }
  } catch {}
};

/** Mark payment synced and remove from manual review (auto-match after biller sync). */
export const completeManualReviewSync = async (localId) => {
  try {
    const db = await openDB();
    await new Promise((resolve) => {
      const tx = db.transaction([STORES.PAYMENTS, STORES.MANUAL_REVIEW], 'readwrite');
      const paymentStore = tx.objectStore(STORES.PAYMENTS);
      const reviewStore = tx.objectStore(STORES.MANUAL_REVIEW);
      const req = paymentStore.get(localId);
      req.onsuccess = (e) => {
        const record = e.target.result;
        if (record) {
          record.status = 'synced';
          record.syncedAt = new Date().toISOString();
          record.autoMatchedAt = new Date().toISOString();
          paymentStore.put(record);
        }
        reviewStore.delete(localId);
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
/** Cashier-visible queue: only bills waiting for biller sync — not amount/serial mismatches. */
export const isCashierVisibleReviewItem = (item) => {
  if (!item) return false;
  if (item.cashierEscalated === true) return false;
  if (isAmountMismatchReview(item.reviewReason)) return false;
  if (!isWaitingForBillSync(item.reviewReason)) return false;
  return true;
};

const _matchesReviewStore = (item, storeId, storeAliases = null) => {
  if (!storeId) return true;
  const sid = item?.storeId || item?.branchId || '';
  if (!sid) return true;
  if (sid === storeId) return true;
  if (storeAliases instanceof Set && storeAliases.has(sid)) return true;
  return false;
};

/** One-time: mark old mismatch review rows as cashier-escalated (hide from cashier forever). */
export const escalateLegacyReviewItems = async () => {
  try {
    const db = await openDB();
    await new Promise((resolve) => {
      const tx = db.transaction([STORES.PAYMENTS, STORES.MANUAL_REVIEW], 'readwrite');
      const paymentStore = tx.objectStore(STORES.PAYMENTS);
      const reviewStore = tx.objectStore(STORES.MANUAL_REVIEW);
      const req = reviewStore.getAll();
      req.onsuccess = (e) => {
        (e.target.result || []).forEach((item) => {
          if (item.cashierEscalated) return;
          if (!isWaitingForBillSync(item.reviewReason) || isAmountMismatchReview(item.reviewReason)) {
            const patched = { ...item, cashierEscalated: true };
            reviewStore.put(patched);
            const payReq = paymentStore.get(item.localId);
            payReq.onsuccess = (ev) => {
              const pay = ev.target.result;
              if (pay) {
                pay.cashierEscalated = true;
                paymentStore.put(pay);
              }
            };
          }
        });
        resolve();
      };
      req.onerror = () => resolve();
    });
  } catch { /* non-critical */ }
};

export const getManualReviewQueue = async (storeId = null, { cashierView = false, storeAliases = null } = {}) => {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORES.MANUAL_REVIEW, "readonly");
      const req = tx.objectStore(STORES.MANUAL_REVIEW).getAll();
      req.onsuccess = (e) => {
        let items = (e.target.result || []).filter((i) => {
          const st = String(i?.status || '').toLowerCase();
          return !st.startsWith('resolved_') && st !== 'synced';
        });
        if (storeId) {
          items = items.filter((i) => _matchesReviewStore(i, storeId, storeAliases));
        }
        if (cashierView) {
          items = items.filter(isCashierVisibleReviewItem);
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

/**
 * Reset failed sync queue item for manual retry
 */
export const resetSyncQueueItem = async (queueId) => {
  if (!queueId) return false;
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORES.SYNC_QUEUE, 'readwrite');
      const store = tx.objectStore(STORES.SYNC_QUEUE);
      const req = store.get(queueId);
      req.onsuccess = (e) => {
        const item = e.target.result;
        if (item) {
          item.status = 'pending';
          item.retryCount = 0;
          item.lastError = '';
          store.put(item);
        }
        resolve(Boolean(item));
      };
      req.onerror = () => resolve(false);
    });
  } catch {
    return false;
  }
};

export default {
  saveOfflinePayment,
  saveManualOfflineBill,
  getPendingSyncItems,
  getPendingOfflinePayments,
  getOfflinePaidBillKeys,
  syncPaymentToFirebaseNow,
  pushOfflinePaymentToCloud,
  flushPendingPaymentsToFirebase,
  markSynced,
  markOfflinePaymentSynced,
  incrementRetry,
  moveToManualReview,
  isWaitingForBillSync,
  isAmountMismatchReview,
  isCashierVisibleReviewItem,
  releasePaymentForCorrection,
  completeManualReviewSync,
  getManualReviewQueue,
  escalateLegacyReviewItems,
  resolveManualReview,
  resetSyncQueueItem,
  getSyncStats,
  clearSyncedRecords,
};