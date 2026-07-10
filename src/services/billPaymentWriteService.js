/**
 * Single write path for bill payment status — Firebase + local Dexie stay aligned.
 * All roles (cashier, biller, manager, admin) should use these helpers.
 */

import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db as firestore } from './firebase';
import {
  buildCashierPaymentPatch,
  buildSettlePatch,
  buildCashierCancelPatch,
  CASHIER_PAYMENT_STATUS,
} from '../utils/cashierOrderUtils';
import { markBillPaidLocally } from './localBillService';
import { getHasInternet } from '../utils/networkReachability';

/** Firebase patch for cashier collection — always sets status + paymentStatus together */
export const toFirebaseCashierPaymentPatch = (ctx = {}) => ({
  ...buildCashierPaymentPatch(ctx),
  updatedAt: serverTimestamp(),
});

/** Update one or more Firebase order docs with the same cashier payment patch */
export const writeCashierPaymentToFirebase = async (orderIds, ctx = {}) => {
  const ids = [...new Set((Array.isArray(orderIds) ? orderIds : [orderIds]).filter(Boolean))];
  if (!ids.length || !firestore) return { success: false, updated: [] };

  const patch = toFirebaseCashierPaymentPatch(ctx);
  const updated = [];
  for (const id of ids) {
    try {
      await updateDoc(doc(firestore, 'orders', id), patch);
      updated.push(id);
    } catch (err) {
      console.warn('[billPaymentWrite] Firebase update skip', id, err?.message);
    }
  }
  return { success: updated.length > 0, updated };
};

/**
 * Full cashier payment: local Dexie + Firebase (all doc IDs for same serial).
 * @param {object} opts
 * @param {object} [opts.order] — local order row
 * @param {string[]} [opts.orderIds] — Firebase doc IDs (duplicate serial docs)
 */
export const applyCashierPayment = async ({
  order = null,
  orderIds = [],
  amount = 0,
  paymentType = 'Cash',
  cashierId = '',
  cashierName = '',
  extra = {},
} = {}) => {
  const ctx = { amount, paymentType, cashierId, cashierName, ...extra };
  const ids = [...new Set([
    ...orderIds,
    order?.id,
    order?.firebaseId,
    order?.localId,
  ].filter(Boolean))];

  if (order) {
    await markBillPaidLocally(order, {
      paidAmount: amount,
      amountReceived: amount,
      paymentType,
      paidBy: cashierId,
      paidByName: cashierName,
      ...extra,
    }).catch(() => {});
  }

  if (getHasInternet() && ids.length) {
    await writeCashierPaymentToFirebase(ids, ctx);
  }

  return { success: true, status: CASHIER_PAYMENT_STATUS, orderIds: ids };
};

/** Manager / super-admin settle */
export const writeManagerSettleToFirebase = async (orderId, ctx = {}) => {
  if (!orderId || !firestore) return { success: false };
  const patch = { ...buildSettlePatch(ctx), updatedAt: serverTimestamp() };
  await updateDoc(doc(firestore, 'orders', orderId), patch);
  return { success: true };
};

/** Cashier cancel */
export const writeCashierCancelToFirebase = async (orderId, ctx = {}) => {
  if (!orderId || !firestore) return { success: false };
  const patch = { ...buildCashierCancelPatch(ctx), updatedAt: serverTimestamp() };
  await updateDoc(doc(firestore, 'orders', orderId), patch);
  return { success: true };
};

export default {
  toFirebaseCashierPaymentPatch,
  writeCashierPaymentToFirebase,
  applyCashierPayment,
  writeManagerSettleToFirebase,
  writeCashierCancelToFirebase,
};
