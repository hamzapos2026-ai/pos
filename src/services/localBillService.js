// File: src/services/localBillService.js
// ✅ PRODUCTION FINAL v2 — Atomic Counter + Idempotent Writes
// ✅ FIXED: Counter advances in same transaction as order write
// ✅ FIXED: Idempotent write using localId as Firebase doc ID
// ✅ FIXED: _saving race condition cleared on all paths
// ✅ FIXED: localId dedup check before Firebase write
// ✅ FIXED: isDeleted always set to false (Top 5 listener compatibility)
// ✅ FIXED: syncStatus properly tracked: pending → syncing → synced

import {
  collection, addDoc, query, where,
  getDocs, serverTimestamp,
  doc, setDoc, limit, runTransaction,
} from "firebase/firestore";
import { db as firebaseDb } from "./firebase";
import { db, initDatabase } from "../db/index";
import { extractSerialNumber } from "./serialService";
import { canUserAccessBranch } from './authService';

// ══════════════════════════════════════════════════════════════
// CONSTANTS
// ══════════════════════════════════════════════════════════════
const GLOBAL_COUNTER_PATH = "globalCounters/billSerial";
const ORDERS_CHANNEL = "aone_pos_orders";

// ══════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════
const generateLocalId = () => {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return `local_${crypto.randomUUID()}`;
    }
  } catch (e) {}
  return `local_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
};

const _broadcast = (payload) => {
  try {
    if (typeof BroadcastChannel === "undefined") return;
    const ch = new BroadcastChannel(ORDERS_CHANNEL);
    ch.postMessage(payload);
    ch.close();
  } catch {}
};

const checkDuplicateBill = async (billId) => {
  if (!billId) return false;
  try {
    const record = await db.orders.where("billId").equals(billId).first();
    if (record) return true;

    if (!navigator.onLine) return false;
    const snap = await getDocs(query(
      collection(firebaseDb, "orders"),
      where("billId", "==", billId),
      limit(1),
    ));
    return !snap.empty;
  } catch (err) {
    console.error("[checkDuplicateBill]", err);
    return false;
  }
};

const saveToDexie = async (orderData) => {
  const localId = orderData.localId || generateLocalId();
  await db.orders.put({ ...orderData, localId });
  return localId;
};

const updateDexieRecord = async (localId, updates) => {
  const record = await db.orders.where("localId").equals(localId).first();
  if (!record) return null;
  return db.orders.put({ ...record, ...updates });
};

// ══════════════════════════════════════════════════════════════
// ATOMIC: Write order + Advance counter in ONE transaction
// ══════════════════════════════════════════════════════════════
const _atomicWriteOrderAndCounter = async (orderData, localId, realSerial) => {
  const serialNumber = extractSerialNumber(realSerial);
  
  await runTransaction(firebaseDb, async (transaction) => {
    const orderRef = doc(firebaseDb, "orders", localId);
    const counterRef = doc(firebaseDb, GLOBAL_COUNTER_PATH);

    // 1️⃣ READ counter first (transactions require all reads before writes)
    const counterSnap = await transaction.get(counterRef);
    const currentCounter = counterSnap.exists() 
      ? (Number(counterSnap.data().lastNumber) || 0) 
      : 0;

    // 2️⃣ WRITE order document
    transaction.set(orderRef, {
      ...orderData,
      localId,
      isDeleted: orderData.isDeleted ?? false,  // ✅ Critical for Top 5 listener
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      syncStatus: 'synced',
      synced: true,
      syncedAt: serverTimestamp(),
    }, { merge: true });

    // 3️⃣ ADVANCE counter only if this serial is higher
    if (serialNumber > currentCounter) {
      const storeCode = realSerial.split('-')[0] || '';
      
      const counterUpdate = {
        lastNumber: serialNumber,
        lastSerial: realSerial,
        lastStoreCode: storeCode,
        lastUpdatedAt: serverTimestamp(),
        lastUpdatedBy: orderData.billerId || 'system',
      };

      // Include createdAt only on first-ever write
      if (!counterSnap.exists()) {
        counterUpdate.createdAt = serverTimestamp();
      }
      
      transaction.set(counterRef, counterUpdate, { merge: true });
      
      console.log(`[saveOrder] 🔢 Counter advanced: ${currentCounter} → ${serialNumber}`);
    } else {
      console.log(`[saveOrder] ℹ️ Counter unchanged: ${currentCounter} (serial ${serialNumber} not higher)`);
    }
  });
};

// ══════════════════════════════════════════════════════════════
// MAIN SAVE FUNCTION
// ══════════════════════════════════════════════════════════════
export const saveOrder = async (orderData, isOnline) => {
  try {
    // ENFORCE: user must have access to the target branch/store
    try {
      const storeId = orderData.storeId || orderData.store || orderData.branchId;
      if (storeId) {
        const allowed = await canUserAccessBranch(storeId);
        if (!allowed) {
          return { success: false, error: 'forbidden_branch' };
        }
      }
    } catch (e) {
      console.warn('[saveOrder] branch access check failed:', e?.message || e);
    }
    // ── Duplicate check ──
    const billId = orderData.billId;
    const isDupe = await checkDuplicateBill(billId);
    if (isDupe) {
      console.warn(`[saveOrder] Duplicate bill: ${billId}`);
      return { success: false, duplicate: true };
    }

    // ── Build base record ──
    const pkOffset = 5 * 60 * 60 * 1000;
    const pkNow = new Date(Date.now() + pkOffset);
    const dateKey = pkNow.toISOString().split("T")[0].replace(/-/g, "");
    
    const toBeSaved = {
      ...orderData,
      dateKey,
      savedAt: new Date().toISOString(),
      status: orderData.status || "pending",
      syncStatus: isOnline ? "syncing" : "pending",
      isDeleted: false,  // ✅ Critical: ensures Top 5 listener picks it up
      isActiveOrder: true, // Active order for PWA dashboard views
      isArchived: false,   // Not archived yet
      syncedAt: null,
    };

    const localId = await saveToDexie(toBeSaved);
    // Immediately broadcast a NEW_LOCAL_ORDER so UI (Top5) can update optimistically
    try {
      _broadcast({ type: 'NEW_LOCAL_ORDER', order: { ...toBeSaved, localId }, localId, timestamp: Date.now() });
    } catch { }
    const realSerial = orderData.billSerial || orderData.serialNo || "----";

    // ══════════════════════════════════════════════════════════
    // OFFLINE PATH — Enqueue for background sync
    // ══════════════════════════════════════════════════════════
    if (!isOnline) {
      try {
        await db.sync_queue.add({
          queueId: localId,
          type: 'orders',
          operation: 'add',
          data: { ...toBeSaved, localId },
          priority: 1,
          attempts: 0,
          status: 'pending',
          createdAt: new Date().toISOString(),
        });
        console.log(`[saveOrder] 📡 Offline — queued ${realSerial}`);
      } catch (sqErr) {
        console.warn('[saveOrder] Failed to enqueue:', sqErr?.message);
      }

      // Broadcast for local-only Top 5 refresh
      _broadcast({
        type: 'ORDER_SAVED_OFFLINE',
        localId,
        billSerial: realSerial,
        savedAt: new Date().toISOString(),
      });

      return {
        success: true,
        id: localId,
        serialNo: realSerial,
        offline: true,
      };
    }

    // ══════════════════════════════════════════════════════════
    // ONLINE PATH — Atomic write (order + counter)
    // ══════════════════════════════════════════════════════════
    try {
      // Mark as _saving to block sync worker race
      await updateDexieRecord(localId, { _saving: true });

      // Idempotency check — already synced?
      const existingSnap = await getDocs(query(
        collection(firebaseDb, "orders"),
        where("localId", "==", localId),
        limit(1)
      ));

      if (!existingSnap.empty) {
        const existingDoc = existingSnap.docs[0];
        console.log(`[saveOrder] ✅ Already synced via localId: ${localId}`);

        await updateDexieRecord(localId, {
          firebaseId: existingDoc.id,
          synced: true,
          syncStatus: 'synced',
          _saving: false,
        });

        // Clean queue
        try {
          const queued = await db.sync_queue.where('queueId').equals(localId).first();
          if (queued) await db.sync_queue.delete(queued.id);
        } catch {}

        return {
          success: true,
          id: existingDoc.id,
          serialNo: realSerial,
          offline: false,
          alreadySynced: true,
        };
      }

      // ✅ ATOMIC TRANSACTION: order + counter together
      await _atomicWriteOrderAndCounter(toBeSaved, localId, realSerial);

      const firebaseId = localId;

      // Mark locally as synced
      await updateDexieRecord(localId, {
        firebaseId,
        syncedAt: new Date().toISOString(),
        synced: true,
        syncStatus: 'synced',
        _saving: false,
      });

      // Clean queue
      try {
        const queued = await db.sync_queue.where('queueId').equals(localId).first();
        if (queued) await db.sync_queue.delete(queued.id);
      } catch {}

      // Broadcast for Top 5 refresh
      _broadcast({
        type: 'SYNC_COMPLETE',
        localId,
        billSerial: realSerial,
        firebaseId,
        syncedAt: new Date().toISOString(),
      });

      console.log(`[saveOrder] ✅ Synced ${realSerial} + counter updated`);

      return {
        success: true,
        id: firebaseId,
        serialNo: realSerial,
        offline: false,
      };

    } catch (fbErr) {
      console.warn("[saveOrder] Firebase write failed, will retry:", fbErr?.code || fbErr?.message);
      
      // Clear _saving so sync worker can pick it up
      await updateDexieRecord(localId, { 
        _saving: false,
        syncStatus: 'failed',
      }).catch(() => {});

      // Enqueue for retry
      try {
        await db.sync_queue.add({
          queueId: localId,
          type: 'orders',
          operation: 'add',
          data: { ...toBeSaved, localId },
          priority: 1,
          attempts: 0,
          status: 'pending',
          createdAt: new Date().toISOString(),
        });
      } catch (sqErr) {
        console.warn('[saveOrder] Re-enqueue failed:', sqErr?.message);
      }

      return {
        success: true,
        id: localId,
        serialNo: realSerial,
        offline: true,
      };
    }
  } catch (err) {
    console.error("[saveOrder]", err);
    return { success: false, error: err.message };
  }
};

// ══════════════════════════════════════════════════════════════
// QUERY FUNCTIONS — UNCHANGED
// ══════════════════════════════════════════════════════════════
export const getOfflineOrdersCount = async () => {
  try {
    return await db.orders.filter((order) => !order.firebaseId).count();
  } catch (err) {
    console.error("[getOfflineOrdersCount]", err && err.name, err && err.message);
    if (err && (err.name === 'DatabaseClosedError' || err.name === 'UpgradeError' || String(err).includes('VersionError'))) {
      try {
        await initDatabase();
        return await db.orders.filter((order) => !order.firebaseId).count();
      } catch (retryErr) {
        console.error('[localBillService] retry failed after initDatabase:', retryErr && retryErr.name, retryErr && retryErr.message);
      }
    }
    return 0;
  }
};

export const getOfflineOrders = async () => {
  try {
    return await db.orders.filter((order) => !order.firebaseId).toArray();
  } catch (err) {
    console.error("[getOfflineOrders]", err && err.name, err && err.message);
    if (err && (err.name === 'DatabaseClosedError' || err.name === 'UpgradeError' || String(err).includes('VersionError'))) {
      try { await initDatabase(); return await db.orders.filter((order) => !order.firebaseId).toArray(); } catch (retryErr) { console.error('[localBillService] retry failed after initDatabase:', retryErr && retryErr.name, retryErr && retryErr.message); }
    }
    return [];
  }
};

export const getOrderById = async (id) => {
  try {
    return await db.orders.where("localId").equals(id).first();
  } catch (err) {
    console.error("[getOrderById]", err && err.name, err && err.message);
    if (err && (err.name === 'DatabaseClosedError' || err.name === 'UpgradeError' || String(err).includes('VersionError'))) {
      try { await initDatabase(); return await db.orders.where("localId").equals(id).first(); } catch (retryErr) { console.error('[localBillService] retry failed after initDatabase:', retryErr && retryErr.name, retryErr && retryErr.message); }
    }
    return null;
  }
};

export const getRecentOrders = async (storeId, limitCount = 20) => {
  try {
    const all = await db.orders.where("storeId").equals(storeId).toArray();
    return all
      .filter(o => !o.isDeleted)
      .sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt))
      .slice(0, limitCount);
  } catch (err) {
    console.error("[getRecentOrders]", err && err.name, err && err.message);
    if (err && (err.name === 'DatabaseClosedError' || err.name === 'UpgradeError' || String(err).includes('VersionError'))) {
      try { await initDatabase(); const all = await db.orders.where("storeId").equals(storeId).toArray(); return all.filter(o => !o.isDeleted).sort((a,b)=> new Date(b.savedAt)-new Date(a.savedAt)).slice(0, limitCount); } catch (retryErr) { console.error('[localBillService] retry failed after initDatabase:', retryErr && retryErr.name, retryErr && retryErr.message); }
    }
    return [];
  }
};

export const deleteLocalOrder = async (localId) => {
  try {
    if (!localId) return { success: false, error: 'missing_localId' };
    await db.orders.where('localId').equals(localId).delete();
    try { await db.sync_queue.where('queueId').equals(localId).delete(); } catch {}
    return { success: true };
  } catch (err) {
    console.error('[deleteLocalOrder]', err);
    return { success: false, error: err.message };
  }
};

export const getLastCompletedBill = async (billerId, storeId) => {
  try {
    const bills = await db.orders
      .filter((order) => order.billerId === billerId && order.storeId === storeId)
      .toArray();
    return bills.sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt))[0] || null;
  } catch (err) {
    console.error("[getLastCompletedBill]", err);
    return null;
  }
};

export const getBillBySerial = async (serial, storeId) => {
  try {
    const localBill = await db.orders.where("serialNo").equals(serial).first();
    if (localBill && localBill.storeId === storeId) return localBill;

    if (navigator.onLine) {
      try {
        const snap = await getDocs(query(
          collection(firebaseDb, "orders"),
          where("serialNo", "==", serial),
          where("storeId", "==", storeId),
          limit(1),
        ));
        if (!snap.empty) {
          return { ...snap.docs[0].data(), firebaseId: snap.docs[0].id };
        }
      } catch (firebaseErr) {
        console.warn('[getBillBySerial] Firebase query failed:', firebaseErr.message);
      }
    }

    return null;
  } catch (err) {
    console.error("[getBillBySerial]", err);
    return null;
  }
};

export const getTodayBillerStats = async (billerId, storeId) => {
  try {
    const all = await db.orders.where("storeId").equals(storeId).toArray();
    const today = new Date().toISOString().split('T')[0];
    const todayBills = all.filter((order) =>
      order.billerId === billerId &&
      order.savedAt?.startsWith(today)
    );
    const count = todayBills.length;
    const total = todayBills.reduce((sum, b) => sum + (b.totalAmount || 0), 0);
    return { billCount: count, totalAmount: total, avgBill: count > 0 ? total / count : 0 };
  } catch (err) {
    console.error("[getTodayBillerStats]", err);
    return { billCount: 0, totalAmount: 0, avgBill: 0 };
  }
};

export const searchBillsByCustomer = async (phone, storeId) => {
  try {
    const all = await db.orders.where("storeId").equals(storeId).toArray();
    return all.filter((order) => order.customer?.phone === phone);
  } catch (err) {
    console.error("[searchBillsByCustomer]", err);
    return [];
  }
};

export const updateBillStatus = async (localId, status) => {
  try {
    const record = await db.orders.where("localId").equals(localId).first();
    if (!record) return { success: false, error: "Record not found" };
    await db.orders.put({ ...record, status, updatedAt: new Date().toISOString() });
    return { success: true };
  } catch (err) {
    console.error("[updateBillStatus]", err);
    return { success: false, error: err.message };
  }
};

export default {
  saveOrder,
  getOfflineOrders,
  getOfflineOrdersCount,
  getOrderById,
  getRecentOrders,
  getLastCompletedBill,
  getBillBySerial,
  getTodayBillerStats,
  searchBillsByCustomer,
  updateBillStatus,
  deleteLocalOrder,
};