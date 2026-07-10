/** Cashier-cancelled bills — local tombstone until Firebase confirms (survives refresh). */

import { getBillSerialKey } from './serialMatch';

const OPTIMISTIC_CANCELLED_LS = 'aone_optimistic_cancelled_v1';

const norm = (v) => String(v || '').trim().toUpperCase();

export const loadOptimisticCancelledBillKeys = () => {
  const serials = new Set();
  const billIds = new Set();
  try {
    const raw = localStorage.getItem(OPTIMISTIC_CANCELLED_LS);
    if (!raw) return { serials, billIds };
    const parsed = JSON.parse(raw);
    (parsed.serials || []).forEach((s) => {
      const key = getBillSerialKey({ billSerial: s }) || norm(s).replace(/^#+/, '');
      if (key) serials.add(key);
    });
    (parsed.billIds || []).forEach((id) => billIds.add(String(id).trim()));
  } catch { /* ignore */ }
  return { serials, billIds };
};

export const recordOptimisticCancelledBill = ({ serial, billId, localId, storeId } = {}) => {
  const prev = loadOptimisticCancelledBillKeys();
  const serials = new Set(prev.serials);
  const billIds = new Set(prev.billIds);
  const s = getBillSerialKey({ billSerial: serial }) || norm(serial).replace(/^#+/, '');
  [billId, localId].filter(Boolean).forEach((id) => billIds.add(String(id).trim()));
  if (s) serials.add(s);
  try {
    localStorage.setItem(OPTIMISTIC_CANCELLED_LS, JSON.stringify({
      serials: [...serials],
      billIds: [...billIds],
      storeId: storeId || '',
      at: Date.now(),
    }));
  } catch { /* ignore */ }
  return { serials, billIds };
};

export const clearOptimisticCancelledBill = ({ serial, billId, localId } = {}) => {
  const prev = loadOptimisticCancelledBillKeys();
  const serials = new Set(prev.serials);
  const billIds = new Set(prev.billIds);
  const s = getBillSerialKey({ billSerial: serial }) || norm(serial).replace(/^#+/, '');
  if (s) serials.delete(s);
  [billId, localId].filter(Boolean).forEach((id) => billIds.delete(String(id).trim()));
  try {
    if (!serials.size && !billIds.size) {
      localStorage.removeItem(OPTIMISTIC_CANCELLED_LS);
    } else {
      localStorage.setItem(OPTIMISTIC_CANCELLED_LS, JSON.stringify({
        serials: [...serials],
        billIds: [...billIds],
        at: Date.now(),
      }));
    }
  } catch { /* ignore */ }
};

export const isOrderInOptimisticCancelledIndex = (order, index = null) => {
  if (!order) return false;
  const idx = index || loadOptimisticCancelledBillKeys();
  const serial = getBillSerialKey(order);
  const ids = [
    order.id,
    order.localId,
    order.firebaseId,
    order.billId,
  ].filter(Boolean).map((x) => String(x).trim());
  if (serial && idx.serials?.has(serial)) return true;
  return ids.some((id) => idx.billIds?.has(id));
};

const VISIBLE_CANCELLED_LS = 'aone_cashier_visible_cancelled_v1';

const visibleCancelledKey = (order) => {
  const serial = getBillSerialKey(order);
  if (serial) return `s:${serial}`;
  const id = order?.id || order?.localId || order?.firebaseId;
  return id ? `i:${String(id).trim()}` : null;
};

/** Keep cancelled row in Cashier tab until Ack/Flag (survives refresh). */
export const recordVisibleCancelledBill = (order) => {
  if (!order) return;
  const key = visibleCancelledKey(order);
  if (!key) return;
  try {
    const raw = localStorage.getItem(VISIBLE_CANCELLED_LS);
    const map = raw ? JSON.parse(raw) : {};
    map[key] = { ...order, savedAt: Date.now() };
    localStorage.setItem(VISIBLE_CANCELLED_LS, JSON.stringify(map));
  } catch { /* ignore */ }
};

export const loadVisibleCancelledBills = () => {
  try {
    const raw = localStorage.getItem(VISIBLE_CANCELLED_LS);
    if (!raw) return [];
    const map = JSON.parse(raw);
    return Object.values(map || {}).filter(Boolean);
  } catch {
    return [];
  }
};

export const removeVisibleCancelledBill = ({ serial, billId, localId, order } = {}) => {
  try {
    const raw = localStorage.getItem(VISIBLE_CANCELLED_LS);
    if (!raw) return;
    const map = JSON.parse(raw);
    const keys = new Set();
    const fromOrder = order ? visibleCancelledKey(order) : null;
    if (fromOrder) keys.add(fromOrder);
    const s = getBillSerialKey({ billSerial: serial }) || norm(serial).replace(/^#+/, '');
    if (s) keys.add(`s:${s}`);
    [billId, localId].filter(Boolean).forEach((id) => keys.add(`i:${String(id).trim()}`));
    keys.forEach((k) => { delete map[k]; });
    if (!Object.keys(map).length) localStorage.removeItem(VISIBLE_CANCELLED_LS);
    else localStorage.setItem(VISIBLE_CANCELLED_LS, JSON.stringify(map));
  } catch { /* ignore */ }
};
