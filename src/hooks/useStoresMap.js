import { useState, useEffect } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db, isFirebaseReady } from '../services/firebase';
import { STORES, dbGetAll } from '../services/indexedDBService';
export const getStoreDisplayName = (store) => {
  if (!store) return '';
  const raw = store.storeName || store.name || store.branchName || store.label || '';
  return String(raw)
    .replace(/^A One Jewelry\s*-\s*/i, '')
    .replace(/^A One Jewellery\s*-\s*/i, '')
    .trim();
};

const storeAliasKeys = (store) => {
  if (!store) return [];
  return [
    store.id,
    store.shortCode,
    store.storeCode,
    store.branchCode,
    store.code,
    store.legacyId,
  ].filter(Boolean).map((k) => String(k).trim());
};

/** Find store doc by Firebase id OR legacy code (JM-1, AON, etc.). */
export const findStoreRecord = (storeId, storesMap = {}) => {
  const key = String(storeId || '').trim();
  if (!key) return null;
  if (storesMap[key]) return storesMap[key];
  for (const store of Object.values(storesMap)) {
    if (store && storeAliasKeys(store).includes(key)) return store;
  }
  return null;
};

/** Firebase document id for queries (maps JM-1 / shortCode → weXNq…). */
export const resolveEffectiveStoreId = (storeId, storesMap = {}) => {
  const key = String(storeId || '').trim();
  if (!key) return '';
  const hit = findStoreRecord(key, storesMap);
  return hit?.id || key;
};

/** All ids that may appear on orders.storeId for one branch (JM-1, JMJ, Firebase id, …). */
export const buildStoreIdAliases = (storeId, storesMap = {}, extraIds = []) => {
  const primary = resolveEffectiveStoreId(storeId, storesMap);
  const hit = findStoreRecord(storeId, storesMap);
  const keys = new Set([
    String(storeId || '').trim(),
    primary,
    hit?.id,
    ...storeAliasKeys(hit),
    ...extraIds,
  ].filter(Boolean));
  return keys;
};

/** True when order belongs to any alias for this branch. */
export const orderMatchesStore = (order, aliases) => {
  if (!order) return false;
  const sid = String(order.storeId || order.branchId || '').trim();
  if (!sid) return false;
  const set = aliases instanceof Set
    ? aliases
    : new Set((Array.isArray(aliases) ? aliases : [...(aliases || [])]).filter(Boolean));
  if (!set.size) return true;
  if (set.has(sid)) return true;
  // Case-insensitive short-code match (JM-1 vs jm-1)
  const lower = sid.toLowerCase();
  for (const a of set) {
    if (String(a).toLowerCase() === lower) return true;
  }
  return false;
};

/** Resolve storeId / row → display name (never raw Firebase id when name exists). */
export const resolveStoreName = (storeIdOrRow, storesMap = {}, fallback = '') => {
  const sid = typeof storeIdOrRow === 'string'
    ? storeIdOrRow
    : (storeIdOrRow?.storeId || storeIdOrRow?.branchId || '');
  if (!sid) return fallback || '—';

  const store = findStoreRecord(sid, storesMap);
  const name = getStoreDisplayName(store);
  if (name) return name;
  return fallback || sid;
};

/** @deprecated alias — same as resolveStoreName for row objects */
export const resolveStoreLabel = (row, storesMap = {}, fallback = '') =>
  resolveStoreName(row, storesMap, fallback);

const BRANCH_LABEL_RE = /^[A-Z]{1,4}-\d+$/i;

const pickBranchLabel = (...fields) => {
  for (const field of fields) {
    const s = String(field || '').trim();
    if (BRANCH_LABEL_RE.test(s)) return s.toUpperCase();
  }
  return '';
};

/**
 * Branch label for bill serial prefix (JM-2 → JM2).
 * Prefers JM-X labels from user + store record over shortCode (JMJ on wrong branch).
 */
export const resolveSerialBranchHint = (storeId, storesMap = {}, user = null) => {
  const fromUser = pickBranchLabel(
    user?.primaryStore,
    ...(Array.isArray(user?.storeIds) ? user.storeIds : []),
    user?.storeId,
    storeId,
  );
  if (fromUser) return fromUser;

  const store = findStoreRecord(storeId, storesMap);
  if (store) {
    const fromFields = pickBranchLabel(
      store.legacyId,
      store.branchCode,
      store.code,
      store.id,
    );
    if (fromFields) return fromFields;

    const display = getStoreDisplayName(store);
    if (BRANCH_LABEL_RE.test(display)) return display.toUpperCase();

    const nameMatch = String(store.storeName || store.name || '').match(/\b([A-Z]{1,4}-\d+)\b/i);
    if (nameMatch) return nameMatch[1].toUpperCase();
  }

  return String(storeId || '').trim();
};

/** Multiple branch ids → "J1, A One" */
export const resolveBranchLabels = (branchIds = [], storesMap = {}) => {
  const ids = (branchIds || []).filter(Boolean);
  if (!ids.length) return '—';
  return ids.map((id) => resolveStoreName(id, storesMap, id)).join(', ');
};

const mapFromRows = (rows = []) => {
  const map = {};
  rows.forEach((s) => {
    if (s?.id) map[s.id] = { ...s, id: s.id };
  });
  return map;
};

/** Sync stores map from IndexedDB — for services (manager, local bills). */
export const loadStoresMapFromCache = async () => {
  try {
    const rows = await dbGetAll(STORES.STORES_CACHE);
    return mapFromRows(rows);
  } catch {
    return {};
  }
};

export default function useStoresMap() {
  const [storesMap, setStoresMap] = useState({});

  useEffect(() => {
    let cancelled = false;
    let unsub = () => {};

    const apply = (map) => {
      if (!cancelled && map && Object.keys(map).length) {
        setStoresMap(map);
      }
    };

    dbGetAll(STORES.STORES_CACHE)
      .then((rows) => apply(mapFromRows(rows)))
      .catch(() => {});

    if (isFirebaseReady() && db) {
      unsub = onSnapshot(
        collection(db, 'stores'),
        (snap) => {
          const map = {};
          snap.docs.forEach((d) => {
            map[d.id] = { id: d.id, ...d.data() };
          });
          apply(map);
        },
        () => {},
      );
    }

    return () => {
      cancelled = true;
      try { unsub(); } catch { /* ignore */ }
    };
  }, []);

  return storesMap;
}
