// src/services/cashierSyncWorker.js
// ✨ NEW: Background sync worker for cashier offline payments
// Runs every 15s when online, processes sync_queue items

import {
  collection, addDoc, doc, serverTimestamp,
} from "firebase/firestore";
import { db } from "./firebase";
import {
  getPendingSyncItems,
  markSynced,
  incrementRetry,
  moveToManualReview,
} from "./offlinePaymentService";
import { reconcilePayment } from "./paymentReconciliationService";
import { logCashierAction } from "./cashierAuditService";
import { toFirebaseCashierPaymentPatch } from "./billPaymentWriteService";
const SYNC_INTERVAL_MS = 15000; // 15 seconds
let syncTimer = null;
let isSyncing = false;
let lastSyncAt = 0;

// ══════════════════════════════════════════════════════════════
// GET PAYMENT RECORD BY LOCAL ID
// ══════════════════════════════════════════════════════════════
const getPaymentRecord = async (localId) => {
  try {
    const dbReq = indexedDB.open("cashier_offline_payments", 3);
    return new Promise((resolve) => {
      dbReq.onsuccess = (e) => {
        const idb = e.target.result;
        const tx = idb.transaction("payments", "readonly");
        const req = tx.objectStore("payments").get(localId);
        req.onsuccess = (e) => resolve(e.target.result || null);
        req.onerror = () => resolve(null);
      };
      dbReq.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
};

// ══════════════════════════════════════════════════════════════
// SYNC A PAYMENT TO FIREBASE
// ══════════════════════════════════════════════════════════════
const syncPaymentItem = async (queueItem) => {
  const payment = await getPaymentRecord(queueItem.targetLocalId);
  if (!payment) {
    console.warn(`[SyncWorker] Payment record not found: ${queueItem.targetLocalId}`);
    return { success: false, error: "Record not found" };
  }

  if (payment.status === 'manual_review' || payment.cashierEscalated === true) {
    return { success: false, needsReview: true, alreadyReviewed: true };
  }

  if (payment.status === 'synced') {
    return { success: true, alreadySynced: true };
  }

  try {
    const result = await reconcilePayment(payment);

    if (result.success) {
      console.log(`[SyncWorker] ✅ Reconciled payment: ${payment.billSerial}`);
      return { success: true };
    }

    if (result.needsRetry) {
      console.log(`[SyncWorker] ⏳ Payment pending bill sync: ${payment.billSerial}`);
      return { success: false, needsRetry: true, error: result.reason };
    }

    if (result.needsReview) {
      try {
        const { findBillForPayment } = await import('./paymentReconciliationService');
        const { isCashierCollected } = await import('../utils/cashierOrderUtils');
        const bill = await findBillForPayment(payment);
        if (bill?.instantPayTrusted || isCashierCollected(bill)) {
          console.log(`[SyncWorker] ✅ Already paid (trusted) — skip review: ${payment.billSerial}`);
          return { success: true, trustedSkip: true };
        }
      } catch { /* ignore */ }

      const reviewMsg = result.details
        ? `${result.reason || 'review'}: ${result.details}`
        : (result.reason || 'Reconciliation failed');
      await moveToManualReview(payment.localId, reviewMsg);
      return { success: false, error: result.reason, needsReview: true };
    }

    return { success: false, error: result.error || "Sync failed" };
  } catch (err) {
    console.error(`[SyncWorker] Sync error for ${payment.billSerial}:`, err);
    return { success: false, error: err.message };
  }
};

// ══════════════════════════════════════════════════════════════
// SYNC A MANUAL BILL TO FIREBASE
// ══════════════════════════════════════════════════════════════
const syncManualBillItem = async (queueItem) => {
  const bill = await getPaymentRecord(queueItem.targetLocalId);
  if (!bill) {
    return { success: false, error: "Record not found" };
  }

  try {
    // 1. Create new bill in orders collection
    const orderRef = await addDoc(collection(db, "orders"), {
      billSerial: bill.billSerial,
      serialNo: bill.billSerial,
      customer: bill.customer || { name: "Walk-in" },
      items: bill.items || [],
      totalAmount: bill.enteredAmount,
      grandTotal: bill.enteredAmount,
      subtotal: bill.enteredAmount,
      totalDiscount: 0,
      totalQty: (bill.items || []).reduce((s, i) => s + (i.qty || 1), 0),
      ...toFirebaseCashierPaymentPatch({
        amount: bill.enteredAmount,
        paymentType: bill.paymentMethod,
        cashierId: bill.cashierId,
        cashierName: bill.cashierName,
      }),
      paidAt: serverTimestamp(),
      cashierPaidAt: serverTimestamp(),
      branchId: bill.storeId,
      storeId: bill.storeId,
      userId: bill.cashierId,
      cashierId: bill.cashierId,
      isManualEntry: true,
      isOffline: true,
      offlineSavedAt: bill.savedAt,
      offlineDeviceId: bill.deviceId,
      createdAt: serverTimestamp(),
      timestamp: serverTimestamp(),
    });

    // 2. Add to payments collection
    await addDoc(collection(db, "payments"), {
      billId: orderRef.id,
      billSerial: bill.billSerial,
      amount: bill.enteredAmount,
      paymentMethod: bill.paymentMethod,
      cashierId: bill.cashierId,
      cashierName: bill.cashierName,
      branchId: bill.storeId,
      storeId: bill.storeId,
      userId: bill.cashierId,
      isManualEntry: true,
      isOffline: true,
      offlineSavedAt: bill.savedAt,
      syncedAt: serverTimestamp(),
      deviceId: bill.deviceId,
      timestamp: serverTimestamp(),
    });

    // 3. Audit log
    await logCashierAction({
      action: "MANUAL_OFFLINE_BILL_SYNCED",
      orderId: orderRef.id,
      billSerial: bill.billSerial,
      userId: bill.cashierId,
      userName: bill.cashierName,
      storeId: bill.storeId,
      amount: bill.enteredAmount,
      paymentType: bill.paymentMethod,
      metadata: {
        localId: bill.localId,
        deviceId: bill.deviceId,
        notes: bill.notes,
      },
    });

    console.log(`[SyncWorker] ✅ Synced manual bill: ${bill.billSerial}`);
    return { success: true };
  } catch (err) {
    console.error(`[SyncWorker] Manual bill sync error:`, err);
    return { success: false, error: err.message };
  }
};

// ══════════════════════════════════════════════════════════════
// MAIN SYNC LOOP
// ══════════════════════════════════════════════════════════════
export const runSync = async () => {
  if (isSyncing) {
    console.log("[SyncWorker] Already syncing, skip");
    return;
  }
  // Always process — Dexie bills match on same PC even when biller is offline

  isSyncing = true;
  lastSyncAt = Date.now();

  try {
    const pending = await getPendingSyncItems();
    if (pending.length === 0) {
      isSyncing = false;
      return;
    }

    console.log(`[SyncWorker] 🔄 Processing ${pending.length} items...`);

    let synced = 0;
    let failed = 0;
    let reviewed = 0;

    for (const item of pending) {
      try {
        let result;
        if (item.type === "payment") {
          result = await syncPaymentItem(item);
        } else if (item.type === "manual_bill") {
          result = await syncManualBillItem(item);
        } else {
          console.warn(`[SyncWorker] Unknown type: ${item.type}`);
          continue;
        }

        if (result.success) {
          await markSynced(item.queueId, item.targetLocalId);
          synced++;
        } else if (result.needsReview) {
          await markSynced(item.queueId, null);
          reviewed++;
        } else if (result.alreadyReviewed) {
          await markSynced(item.queueId, null);
        } else if (result.needsRetry) {
          // Bill not synced yet — keep in queue, no retry penalty
          console.log(`[SyncWorker] Waiting for bill: ${item.targetLocalId}`);
        } else {
          await incrementRetry(item.queueId, result.error);
          failed++;
        }
      } catch (err) {
        console.error(`[SyncWorker] Item error:`, err);
        await incrementRetry(item.queueId, err.message);
        failed++;
      }
    }

    console.log(
      `[SyncWorker] ✅ Done: ${synced} synced, ${failed} failed, ${reviewed} need review`
    );

    if (synced > 0) {
      try {
        const { reconcilePaidBillsAcrossDevices } = await import('./paidBillIndexService');
        let storeId = null;
        for (const item of pending) {
          const payment = await getPaymentRecord(item.targetLocalId);
          storeId = payment?.storeId || payment?.branchId || null;
          if (storeId) break;
        }
        if (storeId) await reconcilePaidBillsAcrossDevices(storeId);
      } catch { /* non-critical */ }
    }

    // Dispatch event for UI to update
    window.dispatchEvent(
      new CustomEvent("cashier-sync-complete", {
        detail: { synced, failed, reviewed, total: pending.length },
      })
    );
  } catch (err) {
    console.error("[SyncWorker] Loop error:", err);
  } finally {
    isSyncing = false;
  }
};

// ══════════════════════════════════════════════════════════════
// START / STOP WORKER
// ══════════════════════════════════════════════════════════════
export const startSyncWorker = () => {
  if (syncTimer) {
    console.log("[SyncWorker] Already running");
    return;
  }
  console.log(`[SyncWorker] ▶️ Starting (interval: ${SYNC_INTERVAL_MS}ms)`);

  // Run immediately
  runSync();

  // Then on interval
  syncTimer = setInterval(() => {
    runSync();
  }, SYNC_INTERVAL_MS);

  // Also run on reconnect
  window.addEventListener("online", () => {
    console.log("[SyncWorker] 🌐 Back online, running sync...");
    runSync();
  });
};

export const stopSyncWorker = () => {
  if (syncTimer) {
    clearInterval(syncTimer);
    syncTimer = null;
    console.log("[SyncWorker] ⏹️ Stopped");
  }
};

export const getSyncWorkerStatus = () => ({
  running: !!syncTimer,
  isSyncing,
  lastSyncAt,
  intervalMs: SYNC_INTERVAL_MS,
});

export default {
  runSync,
  startSyncWorker,
  stopSyncWorker,
  getSyncWorkerStatus,
};