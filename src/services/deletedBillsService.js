// Track voided/cancelled bills — IndexedDB + Firestore + instant cashier broadcast

import {
  collection, addDoc, serverTimestamp, getDocs, query, where, limit,
} from 'firebase/firestore';
import { db as firebaseDb } from './firebase';
import { BROADCAST_CHANNELS } from '../config/channelConfig';

const DB_NAME = 'pos_deletedBills_v1';
const STORE_NAME = 'deletedBills';
const DB_VERSION = 1;

let _db = null;

const parseTs = (v) => {
  if (!v) return 0;
  if (v?.toDate) return v.toDate().getTime();
  if (typeof v === 'object' && typeof v.seconds === 'number') return v.seconds * 1000;
  const ms = new Date(v).getTime();
  return Number.isFinite(ms) ? ms : 0;
};

const openDB = () => new Promise((resolve, reject) => {
  if (_db) { resolve(_db); return; }
  const req = indexedDB.open(DB_NAME, DB_VERSION);
  req.onupgradeneeded = (e) => {
    const db = e.target.result;
    if (!db.objectStoreNames.contains(STORE_NAME)) {
      const store = db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
      store.createIndex('billSerial', 'billSerial', { unique: false });
      store.createIndex('storeId', 'storeId', { unique: false });
      store.createIndex('deletedAt', 'deletedAt', { unique: false });
      store.createIndex('firestoreId', 'firestoreId', { unique: false });
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

const broadcastDeletedBill = (storeId, record) => {
  try {
    const ch = new BroadcastChannel(BROADCAST_CHANNELS.DELETED_BILLS);
    ch.postMessage({ type: 'deleted_bill', storeId, record, at: Date.now() });
    ch.close();
  } catch { /* ignore */ }
};

const mergeDeletedRows = (rows) => {
  const map = new Map();
  (rows || []).forEach((raw) => {
    const r = {
      ...raw,
      id: raw.firestoreId || raw.id,
      firestoreId: raw.firestoreId || (typeof raw.id === 'string' && raw.id.length > 12 ? raw.id : null),
      localId: raw.localId ?? (typeof raw.id === 'number' ? raw.id : null),
      billSerial: raw.billSerial || raw.serialNo || '—',
      deletedAtMs: parseTs(raw.deletedAt || raw.timestamp),
    };
    const key = `${r.billSerial}_${r.deletedAtMs || r.firestoreId || r.localId || r.id}`;
    const prev = map.get(key);
    if (!prev || (r.firestoreId && !prev.firestoreId) || (r.deletedAtMs || 0) > (prev.deletedAtMs || 0)) {
      map.set(key, r);
    }
  });
  return Array.from(map.values()).sort((a, b) => (b.deletedAtMs || 0) - (a.deletedAtMs || 0));
};

/** All deleted bills for store id(s) — IndexedDB first (instant), then Firestore */
export const getDeletedBillsForStores = async (storeIds, limitCount = 200) => {
  const idSet = new Set((Array.isArray(storeIds) ? storeIds : [storeIds]).filter(Boolean).map(String));
  if (!idSet.size) return [];

  let idbRows = [];
  try {
    const idb = await openDB();
    const tx = idb.transaction(STORE_NAME, 'readonly');
    const all = await idbGetAll(tx.objectStore(STORE_NAME));
    idbRows = all.filter((r) => idSet.has(String(r.storeId || '')));
  } catch { /* ignore */ }

  let remoteRows = [];
  if (navigator.onLine && firebaseDb) {
    try {
      const ids = [...idSet].slice(0, 10);
      const q = query(
        collection(firebaseDb, 'deletedBills'),
        where('storeId', 'in', ids),
        limit(limitCount),
      );
      const snap = await getDocs(q);
      remoteRows = snap.docs.map((d) => ({ id: d.id, firestoreId: d.id, ...d.data() }));
    } catch {
      for (const sid of [...idSet].slice(0, 5)) {
        try {
          const q = query(
            collection(firebaseDb, 'deletedBills'),
            where('storeId', '==', sid),
            limit(limitCount),
          );
          const snap = await getDocs(q);
          remoteRows.push(...snap.docs.map((d) => ({ id: d.id, firestoreId: d.id, ...d.data() })));
        } catch { /* ignore */ }
      }
    }
  }

  return mergeDeletedRows([...idbRows, ...remoteRows]);
};

/** @deprecated use getDeletedBillsForStores */
export const getDeletedBills = async (storeId, limitCount = 100) =>
  getDeletedBillsForStores([storeId], limitCount);

export const patchDeletedBillLocal = async (localKey, patch) => {
  if (localKey == null) return false;
  try {
    const idb = await openDB();
    const tx = idb.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const all = await idbGetAll(store);
    const row = all.find((r) =>
      r.id === localKey
      || r.localId === localKey
      || r.firestoreId === localKey
      || String(r.id) === String(localKey),
    );
    if (!row) return false;
    await idbPut(store, { ...row, ...patch });
    broadcastDeletedBill(row.storeId, { ...row, ...patch });
    return true;
  } catch {
    return false;
  }
};

export const recordBillDeletion = async (billData, storeId, isOnline, reason = 'deleted', meta = {}) => {
  try {
    const record = {
      billSerial: billData.serialNo || billData.billSerial || '---',
      serialNo: billData.serialNo || billData.billSerial || '---',
      billId: billData.billId || billData.orderId || null,
      orderId: billData.orderId || billData.billId || null,
      storeId,
      items: billData.items || [],
      itemCount: billData.items?.length || billData.itemCount || 0,
      totalAmount: billData.totalAmount || billData.grandTotal || 0,
      grandTotal: billData.grandTotal || billData.totalAmount || 0,
      subtotal: billData.subtotal || 0,
      totalQty: billData.totalQty || 0,
      totalDiscount: billData.totalDiscount || 0,
      billDiscount: billData.billDiscount || 0,
      cashierExtraDiscount: billData.cashierExtraDiscount || 0,
      paymentType: billData.paymentType || billData.paymentMethod || '',
      customer: {
        name: billData.customer?.name || 'Unknown',
        phone: billData.customer?.phone || '',
        city: billData.customer?.city || '',
      },
      billerName: billData.billerName || 'Unknown',
      billerId: billData.billerId || null,
      deletedBy: meta.deletedBy || 'biller',
      deletedByName: meta.deletedByName || billData.billerName || 'Unknown',
      deletedById: meta.deletedById || billData.billerId || null,
      reason: reason || 'deleted',
      deleteReason: reason || 'deleted',
      billStartTime: billData.billStartTime?.toISOString?.() || billData.billStartTime || null,
      billEndTime: billData.billEndTime?.toISOString?.() || billData.billEndTime || null,
      deletedAt: new Date().toISOString(),
      timestamp: isOnline ? serverTimestamp() : new Date().toISOString(),
      synced: false,
      cashierAcknowledged: false,
      cashierFlagged: false,
    };

    const idb = await openDB();
    const tx = idb.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const localId = await idbAdd(store, { ...record, synced: false });

    let firestoreId = null;
    if (isOnline && firebaseDb) {
      const ref = await addDoc(collection(firebaseDb, 'deletedBills'), record);
      firestoreId = ref.id;
      const txWrite = idb.transaction(STORE_NAME, 'readwrite');
      await idbPut(txWrite.objectStore(STORE_NAME), {
        ...record,
        id: localId,
        localId,
        firestoreId,
        synced: true,
      });
    }

    const payload = {
      ...record,
      id: firestoreId || localId,
      localId,
      firestoreId,
      deletedAtMs: Date.now(),
    };
    broadcastDeletedBill(storeId, payload);
    return payload;
  } catch (err) {
    console.error('[recordBillDeletion]', err);
    return null;
  }
};

export const syncDeletedBills = async () => {
  try {
    if (!navigator.onLine || !firebaseDb) return { synced: 0, failed: 0 };
    const idb = await openDB();
    const tx = idb.transaction(STORE_NAME, 'readonly');
    const localDeleted = await idbGetAll(tx.objectStore(STORE_NAME));
    const results = { synced: 0, failed: 0 };

    for (const record of localDeleted) {
      if (record.synced && record.firestoreId) continue;
      try {
        const { id, localId, firestoreId, synced, ...rest } = record;
        const ref = await addDoc(collection(firebaseDb, 'deletedBills'), {
          ...rest,
          syncedAt: new Date().toISOString(),
        });
        const txWrite = idb.transaction(STORE_NAME, 'readwrite');
        await idbPut(txWrite.objectStore(STORE_NAME), {
          ...record,
          firestoreId: ref.id,
          synced: true,
        });
        broadcastDeletedBill(record.storeId, { ...record, firestoreId: ref.id, synced: true });
        results.synced++;
      } catch (err) {
        console.error(`[syncDeletedBills] Failed for ${record.billSerial}:`, err);
        results.failed++;
      }
    }
    return results;
  } catch (err) {
    console.error('[syncDeletedBills]', err);
    return { synced: 0, failed: 0 };
  }
};
