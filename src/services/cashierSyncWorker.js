// src/services/cashierSyncWorker.js
// ✨ NEW: Background sync worker for cashier offline payments
// Runs every 15s when online, processes sync_queue items

import {
  collection, addDoc, doc, updateDoc, getDoc, serverTimestamp,
} from "firebase/firestore";
import { db } from "./firebase";
import {
  getPendingSyncItems,
  markSynced,
  incrementRetry,
  moveToManualReview,
} from "./offlinePaymentService";
import { logCashierAction } from "./cashierAuditService";

const SYNC_INTERVAL_MS = 15000; // 15 seconds
let syncTimer = null;
let isSyncing = false;
let lastSyncAt = 0;

// ══════════════════════════════════════════════════════════════
// GET PAYMENT RECORD BY LOCAL ID
// ══════════════════════════════════════════════════════════════
const getPaymentRecord = async (localId) => {
  try {
    const dbReq = indexedDB.open("cashier_offline_payments", 2);
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

  try {
    // 1. Check if bill exists in Firebase
    const billSnap = await getDoc(doc(db, "orders", payment.billId));

    if (!billSnap.exists()) {
      // Bill not in Firebase — move to manual review
      await moveToManualReview(payment.localId, "Bill not found in Firebase");
      return { success: false, error: "Bill not found", needsReview: true };
    }

    const bill = billSnap.data();
    const actualAmount = bill.totalAmount || 0;

    // 2. Verify amount matches
    if (Number(payment.enteredAmount) !== actualAmount) {
      await moveToManualReview(
        payment.localId,
        `Amount mismatch: offline=${payment.enteredAmount}, actual=${actualAmount}`
      );
      return { success: false, error: "Amount mismatch", needsReview: true };
    }

    // 3. Update bill to paid
    await updateDoc(doc(db, "orders", payment.billId), {
      status: "paid",
      paymentType: payment.paymentMethod,
      paidAt: serverTimestamp(),
      paidBy: payment.cashierId,
      paidByName: payment.cashierName,
      amountReceived: actualAmount,
      changeGiven: 0,
      isOfflineSync: true,
      offlineSavedAt: payment.savedAt,
      offlineDeviceId: payment.deviceId,
      cashierHandover: true,
    });

    // 4. Add to payments collection (parallel)
    await addDoc(collection(db, "payments"), {
      billId: payment.billId,
      billSerial: payment.billSerial,
      amount: actualAmount,
      paymentMethod: payment.paymentMethod,
      cashierId: payment.cashierId,
      cashierName: payment.cashierName,
      branchId: payment.storeId,
      storeId: payment.storeId,
      userId: payment.cashierId,
      customer: payment.customer || {},
      isOffline: true,
      offlineSavedAt: payment.savedAt,
      syncedAt: serverTimestamp(),
      deviceId: payment.deviceId,
      timestamp: serverTimestamp(),
    });

    // 5. Add to cashierActions collection
    await addDoc(collection(db, "cashierActions"), {
      actionType: "PAID_OFFLINE_SYNC",
      orderId: payment.billId,
      billSerial: payment.billSerial,
      serialNo: payment.billSerial,
      storeId: payment.storeId,
      branchId: payment.storeId,
      cashierId: payment.cashierId,
      cashierName: payment.cashierName,
      userId: payment.cashierId,
      totalAmount: actualAmount,
      paymentType: payment.paymentMethod,
      customer: payment.customer || {},
      items: payment.items || [],
      offlineSavedAt: payment.savedAt,
      isOfflineSync: true,
      deviceId: payment.deviceId,
      timestamp: serverTimestamp(),
    });

    // 6. Audit log
    await logCashierAction({
      action: "OFFLINE_PAYMENT_SYNCED",
      orderId: payment.billId,
      billSerial: payment.billSerial,
      userId: payment.cashierId,
      userName: payment.cashierName,
      storeId: payment.storeId,
      amount: actualAmount,
      paymentType: payment.paymentMethod,
      metadata: {
        localId: payment.localId,
        queueId: queueItem.queueId,
        deviceId: payment.deviceId,
        offlineSavedAt: payment.savedAt,
        syncDurationMs: Date.now() - new Date(payment.savedAt).getTime(),
      },
    });

    console.log(`[SyncWorker] ✅ Synced payment: ${payment.billSerial}`);
    return { success: true };
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
      status: "paid",
      paymentType: bill.paymentMethod,
      paidAt: serverTimestamp(),
      paidBy: bill.cashierId,
      paidByName: bill.cashierName,
      amountReceived: bill.enteredAmount,
      changeGiven: 0,
      branchId: bill.storeId,
      storeId: bill.storeId,
      userId: bill.cashierId,
      cashierId: bill.cashierId,
      isManualEntry: true,
      isOffline: true,
      offlineSavedAt: bill.savedAt,
      offlineDeviceId: bill.deviceId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
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
  if (!navigator.onLine) {
    return;
  }

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
          await markSynced(item.queueId, null); // Remove from queue
          reviewed++;
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