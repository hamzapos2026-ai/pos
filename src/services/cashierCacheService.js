/** Profile-scoped IndexedDB cache for cashier pending bills */

import { getBillSerialKey } from '../utils/serialMatch';
import { isCashierOrderPaid } from '../utils/cashierOrderUtils';
import { isOrderInOptimisticCancelledIndex } from '../utils/cashierCancelledIndex';

const IDB = 'cashier_offline';
const IDB_S = 'bills';
const CASHIER_LS_PREFIX = 'cashier_pending_v2';

const openIDB = () =>
  new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB, 1);
    req.onupgradeneeded = (e) => e.target.result.createObjectStore(IDB_S, { keyPath: 'id' });
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
  });

export const cashierCacheKey = (storeId, uid) => `${storeId || 'default'}_${uid || 'anon'}`;

const lsPendingKey = (storeId, uid) => `${CASHIER_LS_PREFIX}_${storeId}_${uid}`;

const _isPaidInIndex = (o, paidIndex) => {
  if (!o || !paidIndex) return false;
  if (isCashierOrderPaid(o, paidIndex)) return true;
  const serial = getBillSerialKey(o);
  const id = String(o.id || o.localId || '').trim();
  if (serial && paidIndex.serials?.has(serial)) return true;
  if (id && paidIndex.billIds?.has(id)) return true;
  return false;
};

export const clearCashierOfflineCache = async (storeId, uid) => {
  try {
    const d = await openIDB();
    d.transaction(IDB_S, 'readwrite').objectStore(IDB_S).delete(cashierCacheKey(storeId, uid));
  } catch {}
};

export const clearAllCashierOfflineCache = async () => {
  try {
    const d = await openIDB();
    d.transaction(IDB_S, 'readwrite').objectStore(IDB_S).clear();
  } catch {}
};

/** Wipe stale pending list caches — online boot repaints from Firebase. */
export const purgeCashierPendingCaches = async (storeIds, uid) => {
  const unique = [...new Set((storeIds || []).filter(Boolean))];
  for (const sid of unique) {
    try { localStorage.removeItem(lsPendingKey(sid, uid)); } catch { /* ignore */ }
    await clearCashierOfflineCache(sid, uid).catch(() => {});
  }
};

/** Remove paid serials from cached pending list (PWA / Chromebook stale cache). */
export const scrubCashierCachePaidBills = async (storeId, uid, paidIndex) => {
  if (!paidIndex) return;

  try {
    const d = await openIDB();
    const key = cashierCacheKey(storeId, uid);
    await new Promise((resolve) => {
      const tx = d.transaction(IDB_S, 'readwrite');
      const store = tx.objectStore(IDB_S);
      const req = store.get(key);
      req.onsuccess = (e) => {
        const row = e.target.result;
        if (!row?.bills?.length) {
          resolve();
          return;
        }
        const bills = row.bills.filter((b) => !_isPaidInIndex(b, paidIndex));
        if (bills.length === 0) store.delete(key);
        else store.put({ ...row, bills, at: Date.now() });
        resolve();
      };
      req.onerror = () => resolve();
    });
  } catch {}
};

/** Strip paid bills from localStorage pending cache (survives refresh on localhost). */
export const scrubLsPendingPaidBills = (storeIds, uid, paidIndex) => {
  if (!paidIndex || !uid) return;
  const unique = [...new Set((storeIds || []).filter(Boolean))];
  for (const sid of unique) {
    try {
      const raw = localStorage.getItem(lsPendingKey(sid, uid));
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      const bills = Array.isArray(parsed?.bills) ? parsed.bills : [];
      const filtered = bills.filter((b) => !_isPaidInIndex(b, paidIndex));
      if (filtered.length === 0) {
        localStorage.removeItem(lsPendingKey(sid, uid));
      } else if (filtered.length !== bills.length) {
        localStorage.setItem(lsPendingKey(sid, uid), JSON.stringify({ bills: filtered, at: Date.now() }));
      }
    } catch { /* ignore */ }
  }
};

/** Remove cashier-cancelled bills from pending caches (never resurrect on refresh). */
export const scrubLsPendingCancelledBills = (storeIds, uid, cancelledIndex = null) => {
  if (!uid) return;
  const unique = [...new Set((storeIds || []).filter(Boolean))];
  for (const sid of unique) {
    try {
      const raw = localStorage.getItem(lsPendingKey(sid, uid));
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      const bills = Array.isArray(parsed?.bills) ? parsed.bills : [];
      const filtered = bills.filter((b) => !isOrderInOptimisticCancelledIndex(b, cancelledIndex));
      if (filtered.length === 0) {
        localStorage.removeItem(lsPendingKey(sid, uid));
      } else if (filtered.length !== bills.length) {
        localStorage.setItem(lsPendingKey(sid, uid), JSON.stringify({ bills: filtered, at: Date.now() }));
      }
    } catch { /* ignore */ }
  }
};

export const scrubCashierCacheCancelledBills = async (storeId, uid, cancelledIndex = null) => {
  try {
    const d = await openIDB();
    const key = cashierCacheKey(storeId, uid);
    await new Promise((resolve) => {
      const tx = d.transaction(IDB_S, 'readwrite');
      const store = tx.objectStore(IDB_S);
      const req = store.get(key);
      req.onsuccess = (e) => {
        const row = e.target.result;
        if (!row?.bills?.length) {
          resolve();
          return;
        }
        const bills = row.bills.filter((b) => !isOrderInOptimisticCancelledIndex(b, cancelledIndex));
        if (bills.length === 0) store.delete(key);
        else store.put({ ...row, bills, at: Date.now() });
        resolve();
      };
      req.onerror = () => resolve();
    });
  } catch { /* ignore */ }
};
