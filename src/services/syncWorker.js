// src/services/syncWorker.js
// ✅ PRODUCTION FINAL v2 - Background sync with atomic counter updates
// ✅ FIXED: Order + counter written in single transaction
// ✅ FIXED: Uses localId as Firestore doc ID (consistent with localBillService)
// ✅ FIXED: isDeleted always set
// ✅ FIXED: Race condition with _saving flag respected

import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  serverTimestamp,
  getDoc,
  runTransaction,
} from "firebase/firestore";
import { db } from "./firebase";
import { extractSerialNumber } from "./serialService";

// ══════════════════════════════════════════════════════════════
// CONFIG
// ══════════════════════════════════════════════════════════════
const SYNC_INTERVAL_MS = 30_000;
const MAX_BATCH_SIZE = 20;
const MAX_RETRIES = 5;
const RETRY_DELAYS = [1000, 3000, 10000, 30000, 60000];
const GLOBAL_COUNTER_PATH = "globalCounters/billSerial";
const ORDERS_CHANNEL = "aone_pos_orders";
const SYNC_CHANNEL = "aone_pos_sync";

// ══════════════════════════════════════════════════════════════
// STATE
// ══════════════════════════════════════════════════════════════
let _workerInterval = null;
let _isProcessing = false;

// ══════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════
const _log = (type, msg, data = {}) => {
  console.log(`[syncWorker:${type}]`, msg, data);
};

const _getDB = async () => {
  try {
    const { db: idb } = await import("../db/index");
    return idb;
  } catch (err) {
    _log("ERROR", "Failed to load IDB", { error: err?.message });
    return null;
  }
};

const _broadcast = (channel, payload) => {
  try {
    if (typeof BroadcastChannel === "undefined") return;
    const ch = new BroadcastChannel(channel);
    ch.postMessage(payload);
    ch.close();
  } catch {}
};

// ══════════════════════════════════════════════════════════════
// GET PENDING ITEMS
// ══════════════════════════════════════════════════════════════
const _getPendingItems = async () => {
  const idb = await _getDB();
  if (!idb) return [];
  
  try {
    return await idb.sync_queue
      .filter((item) => item.status === "pending" || item.status === "failed")
      .limit(MAX_BATCH_SIZE)
      .toArray();
  } catch (err) {
    _log("ERROR", "getPendingItems failed", { error: err?.message });
    return [];
  }
};

// ══════════════════════════════════════════════════════════════
// ATOMIC WRITE: Order + Counter in single transaction
// ══════════════════════════════════════════════════════════════
const _atomicWriteOrder = async (data, docId) => {
  const serial = data.billSerial || data.serialNo || data.serial;
  const serialNum = serial ? extractSerialNumber(serial) : 0;
  
  await runTransaction(db, async (transaction) => {
    const orderRef = doc(db, "orders", docId);
    const counterRef = doc(db, GLOBAL_COUNTER_PATH);
    
    // 1️⃣ Read counter first
    let counterSnap = null;
    let currentCounter = 0;
    if (serialNum > 0) {
      counterSnap = await transaction.get(counterRef);
      currentCounter = counterSnap.exists() 
        ? (Number(counterSnap.data().lastNumber) || 0) 
        : 0;
    }
    
    // 2️⃣ Write order
    transaction.set(orderRef, {
      ...data,
      localId: docId,
      isDeleted: data.isDeleted ?? false,
      syncedAt: serverTimestamp(),
      syncStatus: 'synced',
      synced: true,
      ...((!data.createdAt) && { createdAt: serverTimestamp() }),
      updatedAt: serverTimestamp(),
    }, { merge: true });
    
    // 3️⃣ Advance counter if needed
    if (serialNum > 0 && serialNum > currentCounter) {
      const storeCode = serial.split('-')[0] || '';
      const counterUpdate = {
        lastNumber: serialNum,
        lastSerial: serial,
        lastStoreCode: storeCode,
        lastUpdatedAt: serverTimestamp(),
        lastUpdatedBy: data.billerId || data.billerName || 'system',
      };
      
      if (!counterSnap?.exists()) {
        counterUpdate.createdAt = serverTimestamp();
      }
      
      transaction.set(counterRef, counterUpdate, { merge: true });
      _log("INFO", `🔢 Counter advanced: ${currentCounter} → ${serialNum}`);
    }
  });
};

// ══════════════════════════════════════════════════════════════
// PROCESS SINGLE QUEUE ITEM
// ══════════════════════════════════════════════════════════════
const _processQueueItem = async (item, idb) => {
  const { id, type, operation, data } = item;
  const localId = data?.localId || data?.id || id;
  
  try {
    // ✅ Check if local record has _saving flag (race protection)
    if (type === "orders" && localId) {
      try {
        const localRec = await idb.orders.where("localId").equals(localId).first();
        if (localRec?._saving) {
          _log("WARN", `Skipping ${localId} — currently being saved`);
          return false;
        }
      } catch {}
    }
    
    // Mark as syncing
    await idb.sync_queue.update(id, {
      status: "syncing",
      lastAttempt: new Date().toISOString(),
    });
    
    let success = false;
    
    if (operation === "add" || operation === "set") {
      // ✅ Use localId as Firestore doc ID (consistent with localBillService)
      const docId = localId;
      
      // Check for duplicate
      const existing = await getDoc(doc(db, type, docId));
      if (existing.exists()) {
        _log("WARN", `Already exists: ${docId}`, { type });
        success = true;
      } else {
        // ✅ Use atomic transaction for orders
        if (type === 'orders') {
          await _atomicWriteOrder(data, docId);
        } else {
          await setDoc(
            doc(db, type, docId),
            {
              ...data,
              localId: docId,
              syncedAt: serverTimestamp(),
              syncStatus: "synced",
              synced: true,
            },
            { merge: true }
          );
        }
        success = true;
      }
    } else if (operation === "delete") {
      await deleteDoc(doc(db, type, data.id || data.docId || localId));
      success = true;
    }
    
    if (success) {
      // Remove from queue
      await idb.sync_queue.delete(id);
      
      // Update local order
      if (localId && type === "orders") {
        try {
          await idb.orders.where("localId").equals(localId).modify({
            firebaseId: localId,
            synced: true,
            syncedAt: new Date().toISOString(),
            syncStatus: "synced",
          });
        } catch {}
      }
      
      _log("SUCCESS", `Synced ${type}`, { docId: localId, operation });
      
      // Broadcast on both channels
      _broadcast(SYNC_CHANNEL, {
        type: "SYNC_COMPLETE",
        itemType: type,
        docId: localId,
        operation,
        syncedAt: new Date().toISOString(),
      });
      
      _broadcast(ORDERS_CHANNEL, {
        type: "SYNC_COMPLETE",
        localId,
        billSerial: data?.billSerial || data?.serialNo,
        firebaseId: localId,
        syncedAt: new Date().toISOString(),
      });
      
      return true;
    }
    
    return false;
    
  } catch (err) {
    _log("ERROR", `Failed to process ${id}`, { error: err?.message });
    
    const attempts = (item.attempts || 0) + 1;
    const delayIndex = Math.min(attempts - 1, RETRY_DELAYS.length - 1);
    const delay = RETRY_DELAYS[delayIndex];
    
    if (attempts >= MAX_RETRIES) {
      await idb.sync_queue.update(id, {
        status: "dead_letter",
        attempts,
        lastError: err?.message,
      });
      _log("ERROR", `Dead letter: ${id}`, { attempts });
      
      _broadcast(SYNC_CHANNEL, {
        type: "SYNC_FAILED",
        docId: localId,
        error: err?.message,
      });
    } else {
      await idb.sync_queue.update(id, {
        status: "pending",
        attempts,
        nextRetry: new Date(Date.now() + delay).toISOString(),
        lastError: err?.message,
      });
      _log("WARN", `Retry scheduled: ${id}`, { attempts, delay });
    }
    
    return false;
  }
};

// ══════════════════════════════════════════════════════════════
// MAIN PROCESS LOOP
// ══════════════════════════════════════════════════════════════
const _processQueue = async () => {
  if (_isProcessing) {
    _log("WARN", "Already processing");
    return;
  }
  
  if (!navigator.onLine) return;
  
  _isProcessing = true;
  
  try {
    const idb = await _getDB();
    if (!idb) return;
    
    const items = await _getPendingItems();
    if (!items.length) return;
    
    // Sort: priority desc, createdAt asc
    items.sort((a, b) => {
      if (a.priority !== b.priority) {
        return (b.priority || 0) - (a.priority || 0);
      }
      return new Date(a.createdAt) - new Date(b.createdAt);
    });
    
    _log("INFO", `Processing ${items.length} items`);
    
    let successCount = 0;
    let failCount = 0;
    
    for (const item of items) {
      // Skip if not ready for retry
      if (item.nextRetry && new Date(item.nextRetry) > new Date()) {
        continue;
      }
      
      const success = await _processQueueItem(item, idb);
      if (success) successCount++;
      else failCount++;
    }
    
    _log("INFO", `Batch complete: ${successCount} synced, ${failCount} failed`);
    
    _broadcast(SYNC_CHANNEL, {
      type: "SYNC_BATCH_COMPLETE",
      successCount,
      failCount,
      processedAt: new Date().toISOString(),
    });
    
  } catch (err) {
    _log("ERROR", "Fatal error", { error: err?.message });
  } finally {
    _isProcessing = false;
  }
};

// ══════════════════════════════════════════════════════════════
// PUBLIC API
// ══════════════════════════════════════════════════════════════
export const startSyncWorker = (intervalMs = SYNC_INTERVAL_MS) => {
  if (_workerInterval) {
    _log("WARN", "Worker already running");
    return () => stopSyncWorker();
  }
  
  _log("INFO", "Starting sync worker", { intervalMs });
  
  setTimeout(_processQueue, 3000);
  _workerInterval = setInterval(_processQueue, intervalMs);
  
  if (typeof window !== "undefined") {
    window.addEventListener("online", _processQueue);
  }
  
  return () => stopSyncWorker();
};

export const stopSyncWorker = () => {
  if (_workerInterval) {
    clearInterval(_workerInterval);
    _workerInterval = null;
    _log("INFO", "Worker stopped");
  }
  
  if (typeof window !== "undefined") {
    window.removeEventListener("online", _processQueue);
  }
};

export const triggerSync = () => _processQueue();

export const getPendingCount = async () => {
  const idb = await _getDB();
  if (!idb) return 0;
  
  try {
    return await idb.sync_queue
      .filter((item) => item.status === "pending" || item.status === "failed")
      .count();
  } catch {
    return 0;
  }
};

export default {
  startSyncWorker,
  stopSyncWorker,
  triggerSync,
  getPendingCount,
};