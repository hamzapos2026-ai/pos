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
  getDocs, getDoc, serverTimestamp,
  doc, setDoc, limit, runTransaction,
} from "firebase/firestore";
import { db as firebaseDb } from "./firebase";
import { db, initDatabase, ensureDbReady } from "../db/index";
import { extractSerialNumber } from "./serialService";
import { canUserAccessBranch } from './authService';
import {
  isCashierOrderPaid, isCashierOrderCancelled, isCashierPendingBill,
  buildCashierPaymentPatch, CASHIER_PAYMENT_STATUS,
} from '../utils/cashierOrderUtils';
import { getHasInternet } from '../utils/networkReachability';
import { compareSerialsDesc, findOrdersBySerialInput, resolveUniqueSerialMatch, normalizeSerial, serialMatches, getBillSerialKey } from '../utils/serialMatch';
import { orderMatchesStore } from '../hooks/useStoresMap';
import { buildBillChannelPatch, broadcastCashierInstantOrder, normalizeInstantCashierOrder } from '../utils/billChannelUtils';
import { isOrderSaveable } from '../utils/invoiceUtils';

const _normalizeStoreIds = (storeIdOrIds) => {
  const ids = Array.isArray(storeIdOrIds) ? storeIdOrIds : [storeIdOrIds];
  return [...new Set(ids.filter(Boolean).map((id) => String(id).trim()))];
};

const _orderMatchesStoreIds = (order, storeIdOrIds) => {
  const ids = _normalizeStoreIds(storeIdOrIds);
  if (!ids.length) return false;
  return orderMatchesStore(order, ids);
};

/** Dexie read scoped to branch aliases — never loads other branches. */
const _loadOrdersForStoreScope = async (storeIdOrIds) => {
  await ensureDbReady();
  const ids = _normalizeStoreIds(storeIdOrIds);
  if (!ids.length) return [];
  const merged = new Map();
  for (const sid of ids) {
    try {
      const rows = await db.orders.where('storeId').equals(sid).toArray();
      rows.forEach((o) => {
        const key = o.localId || o.id || o.billId;
        if (key) merged.set(key, o);
      });
      const branchRows = await db.orders.where('branchId').equals(sid).toArray();
      branchRows.forEach((o) => {
        const key = o.localId || o.id || o.billId;
        if (key) merged.set(key, o);
      });
    } catch { /* ignore per-id */ }
  }
  let scoped = [...merged.values()].filter((o) => _orderMatchesStoreIds(o, ids));
  if (!scoped.length) {
    try {
      const pending = await db.orders.filter((o) => isCashierPendingBill(o)).toArray();
      scoped = pending.filter((o) => _orderMatchesStoreIds(o, ids));
    } catch { /* ignore */ }
  }
  return scoped;
};

/** Customer visit metrics — branch-scoped orders from Dexie. */
export const loadStoreOrdersForMetrics = _loadOrdersForStoreScope;

// ══════════════════════════════════════════════════════════════
// CONSTANTS
// ══════════════════════════════════════════════════════════════
const GLOBAL_COUNTER_PATH = "globalCounters/billSerial";
const ORDERS_CHANNEL = "aone_pos_orders";
// Offline-first guard: a flaky/ambiguous network must never hang a save.
// The order is already persisted to Dexie; if Firestore stalls we queue for retry.
const ONLINE_WRITE_TIMEOUT_MS = 6000;

/** Reject after `ms` if `promise` hasn't settled. */
const _withTimeout = (promise, ms, label = "operation") =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    Promise.resolve(promise).then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });

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

    if (!getHasInternet()) return false;
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

/** Block two bills with the same serial (multi-PC / double-save lifetime guard). */
export const checkDuplicateSerial = async (serial, storeId, excludeLocalId = '') => {
  const key = getBillSerialKey({ billSerial: serial });
  if (!key) return false;
  try {
    await ensureDbReady();
    const local = await db.orders.toArray();
    const localHit = local.find((o) => {
      if (excludeLocalId && o.localId === excludeLocalId) return false;
      if (o.isDeleted || o.deleted) return false;
      if (storeId && o.storeId && o.storeId !== storeId) return false;
      return getBillSerialKey(o) === key;
    });
    if (localHit) return true;

    if (!getHasInternet()) return false;

    const candidates = new Set([serial, key]);
    for (const candidate of candidates) {
      for (const field of ['billSerial', 'serialNo']) {
        try {
          const snap = await getDocs(query(
            collection(firebaseDb, 'orders'),
            where(field, '==', candidate),
            limit(8),
          ));
          const hit = snap.docs.some((d) => {
            if (excludeLocalId && (d.id === excludeLocalId || d.data()?.localId === excludeLocalId)) {
              return false;
            }
            const data = d.data();
            if (data?.isDeleted || data?.deleted) return false;
            if (storeId && data?.storeId && data.storeId !== storeId) return false;
            return getBillSerialKey(data) === key;
          });
          if (hit) return true;
        } catch { /* index may be missing */ }
      }
    }
    return false;
  } catch (err) {
    console.warn('[checkDuplicateSerial]', err?.message);
    return false;
  }
};

const _isFirestoreSentinel = (value) => {
  if (!value || typeof value !== 'object') return false;
  if (value._methodName === 'serverTimestamp') return true;
  if (value._delegate?.type === 'serverTimestamp') return true;
  return false;
};

/** Replace Firestore sentinels with ISO strings before IndexedDB write. */
const sanitizeForDexie = (data) => {
  const out = { ...data };
  for (const key of Object.keys(out)) {
    if (_isFirestoreSentinel(out[key])) {
      out[key] = new Date().toISOString();
    }
  }
  return out;
};

const saveToDexie = async (orderData) => {
  await ensureDbReady();
  const localId = orderData.localId || generateLocalId();
  await db.orders.put({ ...sanitizeForDexie(orderData), localId });
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
    const wasOffline = orderData.wasSavedOffline === true || orderData.savedOffline === true || orderData.offlineBill === true;
    const wasDual = orderData.wasDualModeCheckout === true
      || orderData.dualModeCheckout === true;
    const wasBillerPay = orderData.wasBillerOfflinePayment === true || orderData.billerPaidOffline === true;
    const wasCashierPay = orderData.wasCashierOfflinePayment === true || orderData.isOfflineSync === true;
    transaction.set(orderRef, {
      ...orderData,
      localId,
      wasSavedOffline: wasOffline,
      wasDualModeCheckout: wasDual,
      wasBillerOfflinePayment: wasBillerPay,
      wasCashierOfflinePayment: wasCashierPay,
      savedOffline: wasOffline,
      offlineBill: wasOffline,
      offlinePending: false,
      sendToCashier: wasDual ? false : (orderData.sendToCashier !== false),
      dualModeCheckout: wasDual,
      dualMode: wasDual,
      billerPaidAtBiller: wasDual ? Boolean(orderData.billerPaidAtBiller || Number(orderData.amountReceived) > 0) : orderData.billerPaidAtBiller,
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
// INSTANT PERSIST — sync broadcast first, Dexie + shop LAN in background
// ══════════════════════════════════════════════════════════════
export const persistPendingOrderInstant = (orderPayload, { broadcast = true } = {}) => {
  if (!isOrderSaveable(orderPayload)) {
    console.warn('[persistPendingOrderInstant] blocked empty bill');
    return orderPayload?.localId || null;
  }
  const localId = orderPayload.localId || generateLocalId();
  const payload = normalizeInstantCashierOrder({ ...orderPayload, localId });
  if (!payload) return localId;

  if (broadcast) {
    try {
      broadcastCashierInstantOrder(payload);
      _broadcast({
        type: 'NEW_LOCAL_ORDER',
        order: payload,
        localId,
        billSerial: payload.billSerial || payload.serialNo,
        storeId: payload.storeId || payload.branchId,
        timestamp: Date.now(),
      });
    } catch { /* ignore */ }
  }

  void (async () => {
    try {
      await ensureDbReady();
      const channelPatch = buildBillChannelPatch({
        online: orderPayload.syncStatus === 'syncing' || orderPayload.syncStatus === 'synced',
        dualModeCheckout: payload.dualModeCheckout === true || payload.wasDualModeCheckout === true,
      });
      const toSave = sanitizeForDexie({
        ...payload,
        localId,
        dateKey: payload.dateKey || payload.dateStr || new Date().toISOString().split('T')[0],
        savedAt: new Date().toISOString(),
        status: payload.status || 'pending',
        syncStatus: payload.syncStatus || 'pending',
        isDeleted: false,
        isActiveOrder: true,
        isArchived: false,
        ...channelPatch,
      });
      await saveToDexie(toSave);
      import('./shopApiService.js')
        .then((m) => m.shopApiCreateOrder({ ...toSave, localId }))
        .catch(() => {});
    } catch (err) {
      console.warn('[persistPendingOrderInstant]', err?.message || err);
    }
  })();

  return localId;
};

// ══════════════════════════════════════════════════════════════
// MAIN SAVE FUNCTION
// ══════════════════════════════════════════════════════════════
export const saveOrder = async (orderData, isOnline) => {
  try {
    if (!isOrderSaveable(orderData)) {
      console.warn('[saveOrder] blocked empty bill');
      return { success: false, error: 'empty_bill' };
    }
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

    const realSerialEarly = orderData.billSerial || orderData.serialNo || '';
    const storeId = orderData.storeId || orderData.store || orderData.branchId;
    if (realSerialEarly && await checkDuplicateSerial(realSerialEarly, storeId, orderData.localId)) {
      console.warn(`[saveOrder] Duplicate serial blocked: ${realSerialEarly}`);
      return { success: false, duplicate: true, error: 'duplicate_serial' };
    }

    // ── Build base record ──
    const pkOffset = 5 * 60 * 60 * 1000;
    const pkNow = new Date(Date.now() + pkOffset);
    const dateKey = pkNow.toISOString().split("T")[0].replace(/-/g, "");
    
    const channelPatch = buildBillChannelPatch({
      online: isOnline,
      dualModeCheckout: orderData.wasDualModeCheckout === true || orderData.dualModeCheckout === true,
    });
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
      wasSavedOffline: orderData.wasSavedOffline ?? channelPatch.wasSavedOffline,
      wasDualModeCheckout: orderData.wasDualModeCheckout ?? channelPatch.wasDualModeCheckout,
      savedOffline: orderData.wasSavedOffline ?? channelPatch.wasSavedOffline,
      offlineBill: orderData.wasSavedOffline ?? channelPatch.wasSavedOffline,
      offlinePending: orderData.wasSavedOffline ? true : channelPatch.offlinePending,
      dualModeCheckout: orderData.dualModeCheckout ?? channelPatch.dualModeCheckout,
    };

    const localId = await saveToDexie(toBeSaved);
    // Immediately broadcast a NEW_LOCAL_ORDER so UI (Top5) can update optimistically
    try {
      _broadcast({ type: 'NEW_LOCAL_ORDER', order: { ...toBeSaved, localId }, localId, timestamp: Date.now() });
    } catch { }
    const realSerial = orderData.billSerial || orderData.serialNo || "----";

    // Shop LAN server — shared DB for multi-PC same branch (biller offline + cashier other PC)
    try {
      const { shopApiCreateOrder } = await import('./shopApiService.js');
      await shopApiCreateOrder({ ...toBeSaved, localId });
    } catch (shopErr) {
      if (shopErr?.message !== 'shop_api_not_configured') {
        console.warn('[saveOrder] shop API push skipped:', shopErr?.message || shopErr);
      }
    }

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
        order: { ...toBeSaved, localId },
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

      // Idempotency check — already synced? (time-boxed)
      const existingSnap = await _withTimeout(
        getDocs(query(
          collection(firebaseDb, "orders"),
          where("localId", "==", localId),
          limit(1)
        )),
        ONLINE_WRITE_TIMEOUT_MS,
        "idempotency-check",
      );

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

      // ✅ ATOMIC TRANSACTION: order + counter together (time-boxed)
      await _withTimeout(
        _atomicWriteOrderAndCounter(toBeSaved, localId, realSerial),
        ONLINE_WRITE_TIMEOUT_MS,
        "atomic-order-write",
      );

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

      // Broadcast for Top 5 refresh + instant cashier on same PC
      _broadcast({
        type: 'SYNC_COMPLETE',
        localId,
        billSerial: realSerial,
        firebaseId,
        syncedAt: new Date().toISOString(),
        order: { ...toBeSaved, localId, firebaseId, billSerial: realSerial, serialNo: realSerial },
      });
      _broadcast({
        type: 'NEW_LOCAL_ORDER',
        order: { ...toBeSaved, localId, firebaseId, billSerial: realSerial, serialNo: realSerial, syncStatus: 'synced', synced: true },
        localId,
        billSerial: realSerial,
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

/** Unsynced Dexie orders for admin/manager merge (by store scope). */
export const getUnsyncedLocalOrdersForStores = async (storeIdOrIds) => {
  try {
    await ensureDbReady();
    const all = await _loadOrdersForStoreScope(storeIdOrIds);
    return all.filter((o) => {
      if (o.isDeleted || o.deleted) return false;
      const st = String(o.syncStatus || '').toLowerCase();
      if (st === 'synced' || o.synced === true) return false;
      return !o.firebaseId || st === 'pending' || st === 'syncing' || st === 'failed';
    });
  } catch (err) {
    console.warn('[getUnsyncedLocalOrdersForStores]', err?.message || err);
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

const _parseTS = (ts) => {
  if (!ts) return 0;
  if (ts?.toDate) return ts.toDate().getTime();
  if (typeof ts === 'object' && typeof ts.seconds === 'number') return ts.seconds * 1000;
  const ms = new Date(ts).getTime();
  return isNaN(ms) ? 0 : ms;
};

/** All local bills for biller Top 5 — no status/deleted filter; sorted by serial in UI. */
export const getBillerTop5OrdersLocal = async (storeId, billerId = null) => {
  try {
    const all = await _loadOrdersForStoreScope(storeId);

    return all.filter((o) => {
      if (billerId && o.billerId && o.billerId !== billerId) return false;
      return !!(o.serialNo || o.billSerial || o.billNo);
    }).sort((a, b) => {
      const ta = _parseTS(a.savedAt) || _parseTS(a.createdAt) || _parseTS(a.billerSubmittedAt) || 0;
      const tb = _parseTS(b.savedAt) || _parseTS(b.createdAt) || _parseTS(b.billerSubmittedAt) || 0;
      if (tb !== ta) return tb - ta;
      const na = extractSerialNumber(a.serialNo || a.billSerial || a.billNo) || 0;
      const nb = extractSerialNumber(b.serialNo || b.billSerial || b.billNo) || 0;
      if (nb !== na) return nb - na;
      return compareSerialsDesc(
        a.serialNo || a.billSerial || a.billNo,
        b.serialNo || b.billSerial || b.billNo,
      );
    });
  } catch (err) {
    console.error('[getBillerTop5OrdersLocal]', err && err.name, err && err.message);
    if (err && (err.name === 'DatabaseClosedError' || err.name === 'UpgradeError' || String(err).includes('VersionError'))) {
      try {
        await initDatabase();
        return getBillerTop5OrdersLocal(storeId, billerId);
      } catch (retryErr) {
        console.error('[localBillService] retry failed after initDatabase:', retryErr && retryErr.name, retryErr && retryErr.message);
      }
    }
    return [];
  }
};

export const getRecentOrders = async (storeId, limitCount = 20) => {
  try {
    const all = await _loadOrdersForStoreScope(storeId);

    return all
      .filter((o) => isCashierPendingBill(o))
      .sort((a, b) => (_parseTS(b.savedAt) || _parseTS(b.createdAt)) - (_parseTS(a.savedAt) || _parseTS(a.createdAt)))
      .slice(0, limitCount);
  } catch (err) {
    console.error("[getRecentOrders]", err && err.name, err && err.message);
    if (err && (err.name === 'DatabaseClosedError' || err.name === 'UpgradeError' || String(err).includes('VersionError'))) {
      try {
        await initDatabase();
        return getRecentOrders(storeId, limitCount);
      } catch (retryErr) {
        console.error('[localBillService] retry failed after initDatabase:', retryErr && retryErr.name, retryErr && retryErr.message);
      }
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

const _isSyncQueued = (o) => {
  const syncSt = String(o?.syncStatus || '').toLowerCase();
  return (syncSt === 'pending' || syncSt === 'syncing') && o?.synced !== true;
};

const _mapCashierBill = (o, source = 'dexie') => ({
  ...o,
  id: o.id || o.localId || o.firebaseId,
  localId: o.localId || o.id,
  billSerial: o.billSerial || o.serialNo,
  isLocalOnly: source === 'dexie' && _isSyncQueued(o),
  offlinePending: _isSyncQueued(o),
  source,
});

/** Find any bill in Dexie by serial (partial OK) — includes already-paid (for payment sync). */
export const findBillRecordBySerial = async (storeId, serialInput) => {
  const q = String(serialInput || '').trim();
  if (!q) return null;
  try {
    await ensureDbReady();
    const scoped = (await _loadOrdersForStoreScope(storeId)).filter(
      (o) => !o.isDeleted && !o.deleted,
    );
    const hits = findOrdersBySerialInput(scoped, q);
    const pick = resolveUniqueSerialMatch(scoped, q) || (hits.length === 1 ? hits[0] : null);
    return pick ? _mapCashierBill(pick, 'dexie') : null;
  } catch (err) {
    console.error('[findBillRecordBySerial]', err);
    return null;
  }
};

/** Find unpaid bill by serial (partial OK: 000082) — Dexie first, then Firebase. */
export const findCashierBillBySerial = async (storeId, serialInput) => {
  const q = String(serialInput || '').trim();
  if (!q) return null;

  try {
    try {
      const { shopApiFindBySerial } = await import('./shopApiService.js');
      const shopHit = await shopApiFindBySerial(storeId, q);
      if (shopHit && isCashierPendingBill(shopHit)) return shopHit;
    } catch { /* fall through */ }

    const local = await getPendingOrdersForCashier(storeId);
    const localHits = findOrdersBySerialInput(local, q);
    const localPick = resolveUniqueSerialMatch(local, q)
      || (localHits.length === 1 ? localHits[0] : null);
    if (localPick && isCashierPendingBill(localPick)) {
      return _mapCashierBill(localPick, 'dexie');
    }

    if (!getHasInternet() || !firebaseDb) return null;

    const norm = normalizeSerial(q);
    for (const field of ['serialNo', 'billSerial']) {
      try {
        const snap = await getDocs(query(
          collection(firebaseDb, 'orders'),
          where('storeId', '==', storeId),
          where(field, '==', norm),
          limit(5),
        ));
        if (!snap.empty) {
          const doc = snap.docs.find((d) => {
            const data = d.data();
            return isCashierPendingBill({ id: d.id, ...data });
          });
          if (doc) return _mapCashierBill({ id: doc.id, ...doc.data() }, 'firebase');
        }
      } catch { /* index may be missing */ }
    }

    for (const ps of ['pending_payment', 'pending_approval']) {
      try {
        const snap = await getDocs(query(
          collection(firebaseDb, 'orders'),
          where('storeId', '==', storeId),
          where('paymentStatus', '==', ps),
          limit(400),
        ));
        const remote = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        const hits = findOrdersBySerialInput(remote, q);
        const pick = resolveUniqueSerialMatch(hits, q) || (hits.length === 1 ? hits[0] : null);
        if (pick && isCashierPendingBill(pick)) {
          return _mapCashierBill(pick, 'firebase');
        }
      } catch { /* composite index */ }
    }

    try {
      const snap = await getDocs(query(
        collection(firebaseDb, 'orders'),
        where('storeId', '==', storeId),
        where('status', '==', 'approved'),
        limit(200),
      ));
      const remote = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const hits = findOrdersBySerialInput(remote, q);
      const pick = resolveUniqueSerialMatch(hits, q) || (hits.length === 1 ? hits[0] : null);
      if (pick && isCashierPendingBill(pick)) {
        return _mapCashierBill(pick, 'firebase');
      }
    } catch { /* non-critical */ }

    return null;
  } catch (err) {
    console.error('[findCashierBillBySerial]', err);
    return null;
  }
};

export const getBillBySerial = async (serial, storeId) => {
  const found = await findCashierBillBySerial(storeId, serial);
  return found || null;
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

export const updateBillStatus = async (localId, status, extra = {}) => {
  try {
    const record = await db.orders.where("localId").equals(localId).first();
    if (!record) return { success: false, error: "Record not found" };

    const isPaid = status === 'paid' || status === 'cashier_paid' || status === CASHIER_PAYMENT_STATUS;
    const patch = isPaid
      ? buildCashierPaymentPatch({
          amount: Number(extra.paidAmount || extra.amountReceived || record.totalAmount || 0),
          paymentType: extra.paymentType || record.paymentType,
          cashierId: extra.paidBy || record.paidBy,
          cashierName: extra.paidByName || record.paidByName,
        })
      : { status, paymentStatus: extra.paymentStatus || record.paymentStatus };

    await db.orders.put({
      ...record,
      ...patch,
      ...extra,
      updatedAt: new Date().toISOString(),
    });
    return { success: true };
  } catch (err) {
    console.error("[updateBillStatus]", err);
    return { success: false, error: err.message };
  }
};

/** Mark paid in Dexie by localId, firebaseId, or serial (cashier payment cleanup). */
export const markBillPaidLocally = async (order, extra = {}) => {
  try {
    await ensureDbReady();
    let record = null;

    if (order?.localId) {
      record = await db.orders.where("localId").equals(order.localId).first();
    }
    if (!record && order?.id) {
      record = await db.orders.where("firebaseId").equals(order.id).first();
    }
    if (!record && (order?.billSerial || order?.serialNo)) {
      const needle = order.billSerial || order.serialNo;
      const all = await db.orders.toArray();
      record = all.find(
        (o) => serialMatches(needle, o.billSerial) || serialMatches(needle, o.serialNo),
      ) || null;
    }

    if (!record) {
      try {
        const { shopApiPayOrder } = await import('./shopApiService.js');
        const shopRes = await shopApiPayOrder({
          orderId: order?.id || order?.localId,
          billSerial: order?.billSerial || order?.serialNo,
          amount: Number(extra.paidAmount || extra.amountReceived || order?.totalAmount || 0),
          paymentMethod: extra.paymentType || 'Cash',
          cashierId: extra.paidBy || '',
          cashierName: extra.paidByName || 'Cashier',
        });
        if (shopRes?.success) return { success: true, shopOnly: true };
      } catch { /* ignore */ }
      return { success: false, skipped: true };
    }

    await db.orders.put({
      ...record,
      ...buildCashierPaymentPatch({
        amount: Number(extra.paidAmount || extra.amountReceived || record.totalAmount || 0),
        paymentType: extra.paymentType || record.paymentType,
        cashierId: extra.paidBy || record.paidBy,
        cashierName: extra.paidByName || record.paidByName,
      }),
      ...extra,
      updatedAt: new Date().toISOString(),
    });

    try {
      const { shopApiPayOrder } = await import('./shopApiService.js');
      await shopApiPayOrder({
        orderId: record.localId || record.id,
        billSerial: record.billSerial || record.serialNo,
        amount: Number(extra.paidAmount || extra.amountReceived || record.totalAmount || 0),
        paymentMethod: extra.paymentType || 'Cash',
        cashierId: extra.paidBy || '',
        cashierName: extra.paidByName || 'Cashier',
      });
    } catch { /* local dexie OK */ }

    return { success: true };
  } catch (err) {
    console.error("[markBillPaidLocally]", err);
    return { success: false, error: err.message };
  }
};

/** Mark cancelled in Dexie by localId, firebaseId, or serial. */
export const markBillCancelledLocally = async (order, extra = {}) => {
  try {
    await ensureDbReady();
    let record = null;

    if (order?.localId) {
      record = await db.orders.where("localId").equals(order.localId).first();
    }
    if (!record && order?.id) {
      record = await db.orders.where("firebaseId").equals(order.id).first();
    }
    if (!record && (order?.billSerial || order?.serialNo)) {
      const needle = order.billSerial || order.serialNo;
      const all = await db.orders.toArray();
      record = all.find(
        (o) => serialMatches(needle, o.billSerial) || serialMatches(needle, o.serialNo),
      ) || null;
    }

    if (!record) return { success: false, skipped: true };

    await db.orders.put({
      ...record,
      status: "cancelled",
      paymentStatus: "cancelled",
      isActiveOrder: false,
      isDeleted: false,
      ...extra,
      updatedAt: new Date().toISOString(),
    });
    return { success: true };
  } catch (err) {
    console.error("[markBillCancelledLocally]", err);
    return { success: false, error: err.message };
  }
};

/** Biller offline saves not yet on Firebase — safe to show cashier when same PC / offline. */
export const getUnsyncedOrdersForCashier = async (storeIdOrIds) => {
  try {
    const pending = await getPendingOrdersForCashier(storeIdOrIds);
    return pending.filter(
      (o) => !o.firebaseId && o.syncStatus !== "synced" && o.sendToCashier !== false,
    );
  } catch (err) {
    console.error("[getUnsyncedOrdersForCashier]", err);
    return [];
  }
};

/** When online: align Dexie with Firebase so stale SYNC bills don't reappear offline. */
export const reconcileLocalOrdersWithFirebase = async (storeIdOrIds) => {
  if (!getHasInternet()) return { cleaned: 0 };
  try {
    await ensureDbReady();
    const candidates = (await _loadOrdersForStoreScope(storeIdOrIds)).filter(
      (o) => isCashierPendingBill(o),
    );

    let cleaned = 0;

    const fetchRemoteBySerial = async (serial) => {
      if (!serial) return null;
      for (const field of ["billSerial", "serialNo"]) {
        const q = query(
          collection(firebaseDb, "orders"),
          where(field, "==", serial),
          limit(1),
        );
        const snap = await getDocs(q);
        if (!snap.empty) {
          return { id: snap.docs[0].id, ...snap.docs[0].data() };
        }
      }
      return null;
    };

    for (const local of candidates) {
      try {
        let remote = null;
        if (local.firebaseId) {
          const snap = await getDoc(doc(firebaseDb, "orders", local.firebaseId));
          if (snap.exists()) remote = { id: snap.id, ...snap.data() };
        }
        if (!remote) {
          remote = await fetchRemoteBySerial(local.billSerial || local.serialNo);
        }

        if (!remote) continue;

        const settled = isCashierOrderPaid(remote) || isCashierOrderCancelled(remote);
        if (!settled) {
          // Exists on Firebase and still pending — mark synced, cashier gets it from listeners
          await db.orders.put({
            ...local,
            firebaseId: remote.id,
            syncStatus: "synced",
            updatedAt: new Date().toISOString(),
          });
          cleaned += 1;
          continue;
        }

        const patch = isCashierOrderCancelled(remote)
          ? { status: "cancelled", paymentStatus: "cancelled", isActiveOrder: false }
          : buildCashierPaymentPatch({
            amount: Number(remote.totalAmount || remote.paidAmount || 0),
            paymentType: remote.paymentType || "Cash",
            cashierId: remote.paidBy || "",
            cashierName: remote.paidByName || "",
          });

        await db.orders.put({
          ...local,
          ...patch,
          firebaseId: remote.id,
          syncStatus: "synced",
          isActiveOrder: false,
          updatedAt: new Date().toISOString(),
        });
        cleaned += 1;
      } catch (err) {
        console.warn("[reconcileLocalOrdersWithFirebase] skip", local.localId, err?.message);
      }
    }

    try {
      const { purgePaidBillsFromDexie } = await import('./paidBillIndexService');
      await purgePaidBillsFromDexie(storeId);
    } catch { /* non-critical */ }

    return { cleaned };
  } catch (err) {
    console.error("[reconcileLocalOrdersWithFirebase]", err);
    return { cleaned: 0, error: err.message };
  }
};

/** Pending bills from Dexie for cashier (biller offline saves + unsynced). */
export const getPendingOrdersForCashier = async (storeIdOrIds, { skipShopApi = false } = {}) => {
  try {
    const all = await _loadOrdersForStoreScope(storeIdOrIds);

    const local = all
      .filter((o) => isCashierPendingBill(o))
      .map((o) => ({
        ...o,
        id: o.localId || o.firebaseId,
        billSerial: o.billSerial || o.serialNo,
        isLocalOnly: _isSyncQueued(o),
        offlinePending: _isSyncQueued(o),
      }));

    if (!skipShopApi) {
      try {
        const { shopApiGetPendingOrders, mergeShopWithLocal } = await import('./shopApiService.js');
        const primarySid = _normalizeStoreIds(storeIdOrIds)[0];
        const shop = await shopApiGetPendingOrders(primarySid);
        if (shop?.length) return mergeShopWithLocal(shop, local);
      } catch (shopErr) {
        if (shopErr?.message !== 'shop_api_not_configured') {
          console.warn('[getPendingOrdersForCashier] shop API:', shopErr?.message);
        }
      }
    }

    return local;
  } catch (err) {
    console.error("[getPendingOrdersForCashier]", err);
    if (err && (err.name === "DatabaseClosedError" || err.name === "UpgradeError" || String(err).includes("VersionError"))) {
      try {
        await initDatabase();
        return getPendingOrdersForCashier(storeId);
      } catch (retryErr) {
        console.error("[getPendingOrdersForCashier] retry failed:", retryErr);
      }
    }
    return [];
  }
};

export default {
  persistPendingOrderInstant,
  saveOrder,
  getOfflineOrders,
  getOfflineOrdersCount,
  getOrderById,
  getRecentOrders,
  getBillerTop5OrdersLocal,
  getLastCompletedBill,
  getBillBySerial,
  findCashierBillBySerial,
  findBillRecordBySerial,
  getTodayBillerStats,
  searchBillsByCustomer,
  updateBillStatus,
  markBillPaidLocally,
  markBillCancelledLocally,
  getUnsyncedLocalOrdersForStores,
  getPendingOrdersForCashier,
  getUnsyncedOrdersForCashier,
  reconcileLocalOrdersWithFirebase,
  deleteLocalOrder,
};