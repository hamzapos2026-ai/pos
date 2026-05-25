// File: src/services/deletedBillsService.js
// Purpose: Track voided/cancelled bills for audit using native IndexedDB
// Features: Record deletion, get deleted bills, offline sync
// Offline: Yes
// Dependencies: firebase/firestore, ./firebase

import { collection, addDoc, serverTimestamp, getDocs, query, where, limit, orderBy } from "firebase/firestore";
import { db as firebaseDb } from "./firebase";

const DB_NAME = "pos_deletedBills_v1";
const STORE_NAME = "deletedBills";
const DB_VERSION = 1;

// ─── Native IndexedDB helpers ─────────────────────────────────
let _db = null;

const openDB = () => new Promise((resolve, reject) => {
  if (_db) { resolve(_db); return; }
  const req = indexedDB.open(DB_NAME, DB_VERSION);
  req.onupgradeneeded = (e) => {
    const db = e.target.result;
    if (!db.objectStoreNames.contains(STORE_NAME)) {
      const store = db.createObjectStore(STORE_NAME, {
        keyPath: "id",
        autoIncrement: true,
      });
      store.createIndex("billSerial", "billSerial", { unique: false });
      store.createIndex("storeId", "storeId", { unique: false });
      store.createIndex("deletedAt", "deletedAt", { unique: false });
    }
  };
  req.onsuccess = (e) => { _db = e.target.result; resolve(_db); };
  req.onerror = (e) => reject(e.target.error);
});

const idbAdd = (store, data) => new Promise((resolve, reject) => {
  const req = store.add(data);
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});

const idbGetAll = (store) => new Promise((resolve, reject) => {
  const req = store.getAll();
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});

const idbPut = (store, data) => new Promise((resolve, reject) => {
  const req = store.put(data);
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});

/**
 * Record bill deletion/void/cancellation
 */
export const recordBillDeletion = async (billData, storeId, isOnline, reason = "deleted") => {
  try {
    const record = {
      billSerial: billData.serialNo || billData.billSerial || "---",
      billId: billData.billId || null,
      storeId,
      items: billData.items || [],
      totalAmount: billData.totalAmount || 0,
      totalQty: billData.totalQty || 0,
      totalDiscount: billData.totalDiscount || 0,
      customer: {
        name: billData.customer?.name || "Unknown",
        phone: billData.customer?.phone || "",
        city: billData.customer?.city || "",
      },
      billerName: billData.billerName || "Unknown",
      billerId: billData.billerId || null,
      reason: reason || "deleted",
      billStartTime: billData.billStartTime?.toISOString?.() || billData.billStartTime || null,
      billEndTime: billData.billEndTime?.toISOString?.() || billData.billEndTime || null,
      deletedAt: new Date().toISOString(),
      timestamp: isOnline ? serverTimestamp() : new Date().toISOString(),
      synced: isOnline,
    };

    // Save to IndexedDB (always)
    const idb = await openDB();
    const tx = idb.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    await idbAdd(store, { ...record, synced: false });

    // Save to Firebase if online
    if (isOnline) {
      await addDoc(collection(firebaseDb, "deletedBills"), record);
      console.log(`[deletedBills] Recorded void: ${record.billSerial}`);
    }

    return record;
  } catch (err) {
    console.error("[recordBillDeletion]", err);
    return null;
  }
};

/**
 * Get all deleted bills for a store (for reconciliation)
 */
export const getDeletedBills = async (storeId, limitCount = 100) => {
  try {
    // Try IndexedDB first
    const idb = await openDB();
    const tx = idb.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const all = await idbGetAll(store);
    const filtered = all.filter(r => r.storeId === storeId);
    
    // Also try Firebase if online
    if (navigator.onLine) {
      const q = query(
        collection(firebaseDb, "deletedBills"),
        where("storeId", "==", storeId),
        limit(limitCount)
      );
      const snapshot = await getDocs(q);
      return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    }
    
    return filtered.slice(0, limitCount);
  } catch (err) {
    console.error("[getDeletedBills]", err);
    return [];
  }
};

/**
 * Sync deleted bills from local to Firestore
 */
export const syncDeletedBills = async () => {
  try {
    const idb = await openDB();
    const tx = idb.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const localDeleted = await idbGetAll(store);

    const results = { synced: 0, failed: 0 };

    for (const record of localDeleted) {
      try {
        if (!record.synced) {
          await addDoc(collection(firebaseDb, "deletedBills"), {
            ...record,
            syncedAt: new Date().toISOString(),
          });

          // Mark as synced in IndexedDB
          const txWrite = _db.transaction(STORE_NAME, "readwrite");
          const storeWrite = txWrite.objectStore(STORE_NAME);
          await idbPut(storeWrite, { ...record, synced: true });
          results.synced++;
        }
      } catch (err) {
        console.error(`[syncDeletedBills] Failed for ${record.billSerial}:`, err);
        results.failed++;
      }
    }

    return results;
  } catch (err) {
    console.error("[syncDeletedBills]", err);
    return { synced: 0, failed: 0 };
  }
};