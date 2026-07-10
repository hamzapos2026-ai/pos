/** Cashier Cancelled tab display helpers */

import { isCashierOrderCancelled } from './cashierOrderUtils';

export const isPlaceholderSerial = (value) => {
  const v = String(value || '').trim();
  return !v || /^-+$/.test(v) || v === '—' || /^n\/a$/i.test(v);
};

export const resolveCancelBillSerial = (order) => {
  if (!order) return '';
  for (const key of ['billSerial', 'serialNo']) {
    const v = String(order[key] || '').trim();
    if (!isPlaceholderSerial(v)) return v;
  }
  return '';
};

export const resolveCancelBillReason = (order) => {
  const raw = String(order?.cashierCancelReason || order?.cancelReason || '').trim();
  if (!raw || raw === 'deleted' || raw === 'bill_cleared') return '';
  return raw;
};

export const resolveCancelCashierName = (order) =>
  String(order?.cancelledByName || order?.cashierCancelledBy || '').trim();

export const resolveCancelBillDate = (order) =>
  order?.cashierCancelledAt || order?.cancelledAt || order?.updatedAt || null;

/** Real cashier-cancelled bills — valid serial, not biller draft clear */
export const isCashierCancelledBillRow = (order) => {
  if (!order || !isCashierOrderCancelled(order)) return false;
  if (order.isDeleted || order.deleted) return false;
  const serial = resolveCancelBillSerial(order);
  if (!serial) return false;
  if (String(order.billerName || '').toLowerCase() === 'bill_cleared') return false;
  return true;
};

/** Resolve Firestore doc id (never local_* placeholder). */
export const resolveFirestoreOrderId = (order) => {
  const candidates = [order?.firebaseId, order?.id, order?.localId]
    .map((v) => String(v || '').trim())
    .filter(Boolean);
  return candidates.find((id) => !id.startsWith('local_')) || candidates[0] || null;
};

/** Cancelled bill visible in cashier tab — until Ack or Flag */
export const isVisibleCancelledBillRow = (order) =>
  isCashierCancelledBillRow(order)
  && !order?.cashierCancelAcknowledged
  && !order?.cashierCancelFlagged;
