/**
 * Payment Reconciliation Service
 * Bills and payments are independent — matching runs after sync.
 * Match criteria: billId, amount, branchId (storeId).
 */

import {
  collection, addDoc, doc, getDoc, getDocs, query, where,
  updateDoc, serverTimestamp, limit, orderBy, onSnapshot,
} from 'firebase/firestore';
import { getDocsFromServer } from 'firebase/firestore';
import { db as firestore } from './firebase';
import { COLLECTION_NAMES } from '../utils/constants';
import { buildCashierOfflinePaymentPatch } from '../utils/billChannelUtils';
import { buildCashierPaymentPatch, isCashierCollected } from '../utils/cashierOrderUtils';
import { DELIVERY_STATUS, getDeliveryStatus } from '../utils/deliveryStatus';
import { getOrderDisplayTotal } from '../utils/invoiceUtils';
import { logCashierAction } from './cashierAuditService';
import { getHasInternet } from '../utils/networkReachability';
import { getFraudReasonLabel } from '../utils/reconciliationHints';
import { filterResolvedFromPayload } from '../utils/reconciliationDismissedStore';

export const MATCH_STATUS = {
  MATCHED: 'matched',
  REVIEW_REQUIRED: 'review_required',
  FRAUD: 'fraud',
  PENDING: 'pending',
};

export const FRAUD_REASONS = {
  BILL_ID_MISMATCH: 'bill_id_mismatch',
  AMOUNT_MISMATCH: 'amount_mismatch',
  DUPLICATE_PAYMENT: 'duplicate_payment',
  DUPLICATE_BILL: 'duplicate_bill',
  BILL_NOT_FOUND: 'bill_not_found',
  BRANCH_MISMATCH: 'branch_mismatch',
};

const COL = {
  payments: COLLECTION_NAMES.payments,
  orders: COLLECTION_NAMES.orders,
  matches: 'payment_matches',
  fraudReviews: 'fraud_reviews',
};

const _norm = (v) => String(v || '').trim().toUpperCase();
const _amount = (v) => Math.round(Number(v) || 0);

/** Same total cashier UI uses — avoids false amount_mismatch on discounted bills. */
export const getBillPaymentAmount = (bill) => _amount(getOrderDisplayTotal(bill));

const _storeAliasKeys = (store) => {
  if (!store) return [];
  return [store.id, store.shortCode, store.storeCode, store.branchCode, store.code, store.legacyId]
    .filter(Boolean)
    .map((k) => String(k).trim());
};

const _branchesMatch = async (paymentBranch, billBranch) => {
  const a = String(paymentBranch || '').trim();
  const b = String(billBranch || '').trim();
  if (!a || !b || a === 'default' || b === 'default') return true;
  if (a === b) return true;
  try {
    const { getStoreById } = await import('./storeService');
    const [pStore, bStore] = await Promise.all([getStoreById(a), getStoreById(b)]);
    const keys = new Set([a, b, ..._storeAliasKeys(pStore), ..._storeAliasKeys(bStore)]);
    return keys.has(a) && keys.has(b);
  } catch {
    return a === b;
  }
};

const _isLocalDexieBill = (bill) => Boolean(
  bill?.isLocalOnly
  || bill?.source === 'dexie'
  || (bill?.localId && !bill?.firebaseId)
  || String(bill?.id || '').startsWith('local_'),
);

const _findFirestoreBill = async (payment, branchId, serial, serialInput) => {
  if (!getHasInternet() || !firestore) return null;

  const billId = payment.billId;
  if (billId && !String(billId).startsWith('local_') && !String(billId).startsWith('op_') && !String(billId).includes('BIL-')) {
    try {
      const direct = await getDoc(doc(firestore, COL.orders, billId));
      if (direct.exists()) return { id: direct.id, ...direct.data() };
    } catch { /* ignore */ }
  }

  const candidates = [...new Set([payment.billSerial, serialInput, serial].filter(Boolean))];
  const { findOrdersBySerialInput } = await import('../utils/serialMatch');

  for (const field of ['billSerial', 'serialNo']) {
    for (const candidate of candidates) {
      try {
        const withStore = branchId && branchId !== 'default'
          ? query(
            collection(firestore, COL.orders),
            where('storeId', '==', branchId),
            where(field, '==', candidate),
            limit(5),
          )
          : null;
        if (withStore) {
          const snap = await getDocs(withStore);
          if (!snap.empty) {
            const match = snap.docs[0];
            return { id: match.id, ...match.data() };
          }
        }
      } catch { /* composite index — try without storeId */ }

      try {
        const snap = await getDocs(query(
          collection(firestore, COL.orders),
          where(field, '==', candidate),
          limit(8),
        ));
        const hits = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((o) => !branchId || branchId === 'default' || o.storeId === branchId || o.branchId === branchId);
        if (hits.length === 1) return hits[0];
        const resolved = findOrdersBySerialInput(hits, serialInput || candidate);
        if (resolved.length === 1) return resolved[0];
      } catch { /* non-critical */ }
    }
  }

  // Newest-first scan — unordered pending limit(300) missed bills in large queues (372+).
  if (branchId && branchId !== 'default') {
    try {
      const snap = await getDocs(query(
        collection(firestore, COL.orders),
        where('storeId', '==', branchId),
        orderBy('createdAt', 'desc'),
        limit(120),
      ));
      const remote = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const hits = findOrdersBySerialInput(remote, serialInput || serial);
      if (hits.length === 1) return hits[0];
    } catch { /* non-critical */ }
  }

  return null;
};

/** Find bill — Firestore first when online (accurate amount), then local Dexie for offline biller. */
export const findBillForPayment = async (payment) => {
  const billId = payment.billId;
  const serialInput = payment.billSerial || payment.billId || '';
  const serial = _norm(serialInput);
  const branchId = payment.storeId || payment.branchId || 'default';

  if (getHasInternet() && firestore) {
    const cloud = await _findFirestoreBill(payment, branchId, serial, serialInput);
    if (cloud) return cloud;
  }

  try {
    const { shopApiFindBySerial } = await import('./shopApiService.js');
    const shop = await shopApiFindBySerial(branchId, serialInput);
    if (shop) return shop;
  } catch { /* non-critical */ }

  try {
    const { findBillRecordBySerial } = await import('./localBillService');
    const local = await findBillRecordBySerial(branchId, serialInput);
    if (local) return local;
  } catch { /* non-critical */ }

  return null;
};

/** Check for duplicate payment in Firestore */
const _findDuplicatePayment = async (payment, excludeLocalId = '') => {
  try {
    const branchId = payment.storeId || payment.branchId;
    const q = payment.billId
      ? query(collection(firestore, COL.payments), where('billId', '==', payment.billId), limit(10))
      : query(
          collection(firestore, COL.payments),
          where('billSerial', '==', payment.billSerial),
          limit(10),
        );
    const snap = await getDocs(q);
    return snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((p) => p.localId !== excludeLocalId && p.deviceId !== payment.deviceId);
  } catch {
    return [];
  }
};

export const createMatchRecord = async ({
  payment,
  bill,
  status,
  reason = '',
  storeId,
}) => {
  if (!firestore) return null;
  return addDoc(collection(firestore, COL.matches), {
    paymentLocalId: payment.localId || '',
    paymentId: payment.firebasePaymentId || '',
    billId: bill?.id || payment.billId || '',
    billSerial: payment.billSerial || bill?.billSerial || bill?.serialNo || '',
    paymentAmount: _amount(payment.enteredAmount),
    billAmount: _amount(bill?.totalAmount || bill?.grandTotal || payment.enteredAmount),
    branchId: storeId || payment.storeId || payment.branchId || 'default',
    storeId: storeId || payment.storeId || 'default',
    cashierId: payment.cashierId || '',
    cashierName: payment.cashierName || '',
    billerName: bill?.createdByName || bill?.billerName || bill?.biller || payment.billerName || '',
    billerId: bill?.createdBy || bill?.billerId || payment.billerId || '',
    status,
    reason,
    matchedAt: status === MATCH_STATUS.MATCHED ? serverTimestamp() : null,
    createdAt: serverTimestamp(),
    deviceId: payment.deviceId || '',
    isOffline: Boolean(payment.isOffline),
  });
};

export const flagFraudReview = async ({
  payment,
  bill = null,
  reason,
  details = '',
  storeId,
}) => {
  if (!firestore) return null;

  const record = await addDoc(collection(firestore, COL.fraudReviews), {
    type: 'payment_reconciliation',
    reason,
    details,
    paymentLocalId: payment.localId || '',
    billId: payment.billId || bill?.id || '',
    billSerial: payment.billSerial || bill?.billSerial || bill?.serialNo || '',
    paymentAmount: _amount(payment.enteredAmount),
    billAmount: bill ? _amount(bill.totalAmount || bill.grandTotal) : null,
    branchId: storeId || payment.storeId || 'default',
    storeId: storeId || payment.storeId || 'default',
    cashierId: payment.cashierId || '',
    cashierName: payment.cashierName || '',
    billerName: bill?.createdByName || bill?.billerName || bill?.biller || payment.billerName || '',
    billerId: bill?.createdBy || bill?.billerId || payment.billerId || '',
    deviceId: payment.deviceId || '',
    status: 'open',
    severity: reason === FRAUD_REASONS.AMOUNT_MISMATCH ? 'high' : 'medium',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  await logCashierAction({
    action: 'FRAUD_REVIEW_FLAGGED',
    orderId: payment.billId || '',
    billSerial: payment.billSerial || '',
    userId: payment.cashierId || '',
    userName: payment.cashierName || '',
    storeId: storeId || payment.storeId || '',
    amount: payment.enteredAmount,
    metadata: { reason, details, fraudReviewId: record.id },
  }).catch(() => {});

  return record;
};

/**
 * Attempt to match payment → bill.
 * @returns {{ status, reason?, bill?, needsRetry? }}
 */
export const attemptPaymentMatch = async (payment) => {
  const branchId = payment.storeId || payment.branchId || 'default';
  const payAmount = _amount(payment.enteredAmount);

  const dupes = await _findDuplicatePayment(payment, payment.localId);
  if (dupes.length > 0) {
    return {
      status: MATCH_STATUS.FRAUD,
      reason: FRAUD_REASONS.DUPLICATE_PAYMENT,
      details: `Found ${dupes.length} existing payment(s) for this bill`,
    };
  }

  const bill = await findBillForPayment(payment);
  if (!bill) {
    return {
      status: MATCH_STATUS.PENDING,
      reason: FRAUD_REASONS.BILL_NOT_FOUND,
      needsRetry: true,
      details: 'Bill not yet synced — will retry when bill arrives',
    };
  }

  const billBranch = bill.storeId || bill.branchId || 'default';
  const branchOk = await _branchesMatch(branchId, billBranch);
  if (!branchOk) {
    return {
      status: MATCH_STATUS.FRAUD,
      reason: FRAUD_REASONS.BRANCH_MISMATCH,
      bill,
      details: `Payment branch ${branchId} ≠ bill branch ${billBranch}`,
    };
  }

  const billAmount = getBillPaymentAmount(bill);
  if (payAmount !== billAmount) {
    return {
      status: MATCH_STATUS.FRAUD,
      reason: FRAUD_REASONS.AMOUNT_MISMATCH,
      bill,
      details: `Payment Rs.${payAmount} ≠ bill Rs.${billAmount}`,
    };
  }

  if (isCashierCollected(bill)) {
    const stillPendingOnCloud = !_isLocalDexieBill(bill)
      && (String(bill.paymentStatus || '').toLowerCase() === 'pending_payment'
        || String(bill.paymentStatus || '').toLowerCase() === 'pending_approval'
        || bill.isActiveOrder === true);
    return {
      status: MATCH_STATUS.MATCHED,
      bill,
      alreadyApplied: !stillPendingOnCloud,
      forceCloudHeal: stillPendingOnCloud,
      details: stillPendingOnCloud
        ? 'Payment exists but bill still pending on cloud — will heal'
        : 'Bill already has cashier payment — linking payment record only',
    };
  }

  if (bill.status === 'paid' && bill.paymentStatus === 'paid' && !bill.isOfflineSync) {
    return {
      status: MATCH_STATUS.FRAUD,
      reason: FRAUD_REASONS.DUPLICATE_BILL,
      bill,
      details: 'Bill already fully paid',
    };
  }

  return { status: MATCH_STATUS.MATCHED, bill };
};

/** Write payment to Firestore as independent entity */
export const syncPaymentToFirestore = async (payment, extra = {}) => {
  const ref = await addDoc(collection(firestore, COL.payments), {
    localId: payment.localId,
    billId: payment.billId || '',
    billSerial: payment.billSerial || '',
    amount: _amount(payment.enteredAmount),
    paymentMethod: payment.paymentMethod || 'Cash',
    cashierId: payment.cashierId || '',
    cashierName: payment.cashierName || '',
    branchId: payment.storeId || payment.branchId || 'default',
    storeId: payment.storeId || 'default',
    userId: payment.cashierId || '',
    customer: payment.customer || {},
    isOffline: true,
    offlineSavedAt: payment.savedAt,
    deviceId: payment.deviceId || '',
    receiptPay: Boolean(payment.receiptPay),
    qrVerified: Boolean(payment.qrVerified),
    matchStatus: extra.matchStatus || MATCH_STATUS.MATCHED,
    reconciliationStatus: extra.reconciliationStatus || MATCH_STATUS.MATCHED,
    pendingBill: Boolean(extra.pendingBill),
    syncedAt: serverTimestamp(),
    timestamp: serverTimestamp(),
  });
  return ref.id;
};

/** Cashier online but bill not in cloud yet — queue payment for cross-device match (Netlify / multi-PC). */
export const syncOrphanPaymentToCloud = async (payment) => {
  if (!getHasInternet() || !firestore || !payment?.localId) return null;
  try {
    const snap = await getDocs(query(
      collection(firestore, COL.payments),
      where('localId', '==', payment.localId),
      limit(1),
    ));
    if (!snap.empty) return snap.docs[0].id;
  } catch { /* fall through to create */ }

  return syncPaymentToFirestore(payment, {
    matchStatus: MATCH_STATUS.PENDING,
    reconciliationStatus: 'pending_bill',
    pendingBill: true,
  });
};

/** Cloud payments waiting for biller bill sync (mobile cashier → laptop biller). */
export const fetchCloudPendingPaymentsForBill = async ({ billSerial, storeId }) => {
  if (!getHasInternet() || !firestore) return [];
  const serial = _norm(billSerial);
  if (!serial) return [];

  try {
    const snap = await getDocs(query(
      collection(firestore, COL.payments),
      where('reconciliationStatus', '==', 'pending_bill'),
      limit(40),
    ));
    return snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((p) => {
        const pSerial = _norm(p.billSerial || p.billId);
        if (pSerial !== serial) return false;
        const pStore = p.storeId || p.branchId || 'default';
        return !storeId || pStore === storeId || pStore === 'default';
      })
      .map((p) => ({
        localId: p.localId || p.id,
        billId: p.billId || '',
        billSerial: p.billSerial || '',
        enteredAmount: p.amount ?? p.enteredAmount,
        paymentMethod: p.paymentMethod || 'Cash',
        cashierId: p.cashierId || '',
        cashierName: p.cashierName || '',
        storeId: p.storeId || p.branchId || storeId,
        savedAt: p.offlineSavedAt || p.savedAt,
        deviceId: p.deviceId || '',
        receiptPay: Boolean(p.receiptPay),
        qrVerified: Boolean(p.qrVerified),
        status: 'offline_unsynced',
        _fromCloud: true,
        _cloudDocId: p.id,
      }));
  } catch (err) {
    console.warn('[reconcile] cloud pending payments:', err?.message);
    return [];
  }
};

const ORDERS_CHANNEL = 'aone_pos_orders';

/** Biller: toast only — do not flip Top5 to paid appearance. */
export const notifyBillerCashierPayment = async ({
  billSerial, amount, cashierName, localId, storeId,
}) => {
  const serial = String(billSerial || '').trim();
  if (!serial) return;

  try {
    const { db: localDB, ensureDbReady } = await import('../db/index');
    const { serialMatches } = await import('../utils/serialMatch');
    await ensureDbReady();
    const all = await localDB.orders.toArray();
    const record = all.find(
      (o) => serialMatches(serial, o.billSerial) || serialMatches(serial, o.serialNo),
    );
    if (record) {
      await localDB.orders.put({
        ...record,
        cashierPaymentReceived: true,
        cashierPaymentAmount: _amount(amount),
        cashierPaymentBy: cashierName || 'Cashier',
        cashierPaymentAt: new Date().toISOString(),
      });
    }
  } catch { /* non-critical */ }

  try {
    if (typeof BroadcastChannel !== 'undefined') {
      const ch = new BroadcastChannel(ORDERS_CHANNEL);
      ch.postMessage({
        type: 'CASHIER_PAYMENT_RECEIVED',
        billSerial: serial,
        amount: _amount(amount),
        cashierName: cashierName || 'Cashier',
        localId,
        storeId,
        timestamp: Date.now(),
      });
      ch.close();
    }
  } catch { /* non-critical */ }
};

/** Apply matched payment to bill (Dexie local bill OR Firestore) */
export const applyMatchedPayment = async (payment, bill, options = {}) => {
  const { billerNotifyOnly = false } = options;
  const amount = getBillPaymentAmount(bill) || _amount(payment.enteredAmount);
  const deliveryStatus = DELIVERY_STATUS.PAYMENT_VERIFIED;
  const patch = {
    ...buildCashierPaymentPatch({
      amount,
      paymentType: payment.paymentMethod || 'Cash',
      cashierId: payment.cashierId,
      cashierName: payment.cashierName,
    }),
    ...buildCashierOfflinePaymentPatch(),
    offlineSavedAt: payment.savedAt,
    offlineDeviceId: payment.deviceId,
    cashierHandover: true,
    matchStatus: MATCH_STATUS.MATCHED,
    reconciliationStatus: MATCH_STATUS.MATCHED,
    deliveryStatus,
    offlineSyncPending: true,
    isActiveOrder: false,
  };

  if (_isLocalDexieBill(bill)) {
    if (billerNotifyOnly) {
      const { db: localDB, ensureDbReady } = await import('../db/index');
      const { serialMatches } = await import('../utils/serialMatch');
      await ensureDbReady();
      let record = bill.localId
        ? await localDB.orders.where('localId').equals(bill.localId).first()
        : null;
      if (!record && (bill.billSerial || bill.serialNo)) {
        const needle = bill.billSerial || bill.serialNo;
        const all = await localDB.orders.toArray();
        record = all.find(
          (o) => serialMatches(needle, o.billSerial) || serialMatches(needle, o.serialNo),
        ) || null;
      }
      if (record) {
        await localDB.orders.put({
          ...record,
          cashierPaymentReceived: true,
          cashierPaymentAmount: amount,
          cashierPaymentBy: payment.cashierName || 'Cashier',
          cashierPaymentAt: new Date().toISOString(),
          offlineSyncPending: false,
        });
      }
      return bill.localId || bill.id;
    }
    const { markBillPaidLocally } = await import('./localBillService');
    await markBillPaidLocally(bill, {
      ...patch,
      paymentType: payment.paymentMethod || 'Cash',
      paidBy: payment.cashierId,
      paidByName: payment.cashierName,
      amountReceived: amount,
      paidAmount: amount,
      offlineSyncPending: true,
    });
    return bill.localId || bill.id;
  }

  const billId = bill.id || bill.firebaseId || payment.billId;
  const stillPending = String(bill.paymentStatus || '').toLowerCase() === 'pending_payment'
    || String(bill.paymentStatus || '').toLowerCase() === 'pending_approval'
    || bill.isActiveOrder === true;

  await updateDoc(doc(firestore, COL.orders, billId), {
    ...patch,
    paidAt: serverTimestamp(),
    cashierPaidAt: serverTimestamp(),
    offlineSyncPending: false,
    ...(stillPending ? { healedOnPaymentApply: true } : {}),
  });

  void import('../services/customerPersonaService').then(({ applyPaymentTransaction }) =>
    applyPaymentTransaction({
      bill,
      customer: bill.customer || { name: bill.customerName, phone: bill.customerPhone },
      storeId: payment.storeId || bill.storeId,
      branchId: payment.branchId || bill.branchId || bill.storeId,
      paidAmount: amount,
      outstandingAfter: payment.outstandingAfter ?? bill.balanceDue,
      paymentMethod: payment.paymentMethod || bill.paymentMethod,
      isCredit: String(payment.paymentMethod || bill.paymentMethod || '').toLowerCase().includes('credit'),
      cashierId: payment.cashierId,
      userId: payment.cashierId,
    }),
  );

  return billId;
};

/**
 * Full reconciliation for one offline payment.
 * Called from cashierSyncWorker.
 */
export const reconcilePayment = async (payment) => {
  const match = await attemptPaymentMatch(payment);

  if (!getHasInternet() || !firestore) {
    if (match.status === MATCH_STATUS.MATCHED) {
      if (!match.alreadyApplied) {
        await applyMatchedPayment(payment, match.bill);
      }
      return { success: true, localOnly: true };
    }
    if (match.status === MATCH_STATUS.PENDING && match.needsRetry) {
      return { success: false, needsRetry: true, reason: match.reason };
    }
    return { success: false, offline: true };
  }

  if (match.status === MATCH_STATUS.PENDING && match.needsRetry) {
    if (getHasInternet() && firestore) {
      try {
        await syncOrphanPaymentToCloud(payment);
      } catch (err) {
        console.warn('[reconcile] orphan cloud queue:', err?.message);
      }
    }
    return { success: false, needsRetry: true, reason: match.reason };
  }

  if (match.status === MATCH_STATUS.FRAUD) {
    await flagFraudReview({
      payment,
      bill: match.bill,
      reason: match.reason,
      details: match.details,
      storeId: payment.storeId,
    });
    await createMatchRecord({
      payment,
      bill: match.bill,
      status: MATCH_STATUS.FRAUD,
      reason: match.reason,
      storeId: payment.storeId,
    });
    return { success: false, needsReview: true, reason: match.reason, details: match.details };
  }

  if (match.status === MATCH_STATUS.MATCHED) {
    const billOnCloud = match.bill && !_isLocalDexieBill(match.bill) && (match.bill.firebaseId || match.bill.id);
    let firebasePaymentId = null;
    if (billOnCloud) {
      firebasePaymentId = await syncPaymentToFirestore(payment);
    }
    const billerNotifyOnly = _isLocalDexieBill(match.bill) && !match.forceCloudHeal;
    if (!match.alreadyApplied || match.forceCloudHeal) {
      await applyMatchedPayment(payment, match.bill, { billerNotifyOnly });
    }
    await createMatchRecord({
      payment: { ...payment, firebasePaymentId },
      bill: match.bill,
      status: MATCH_STATUS.MATCHED,
      storeId: payment.storeId,
    });

    await notifyBillerCashierPayment({
      billSerial: payment.billSerial,
      amount: payment.enteredAmount,
      cashierName: payment.cashierName,
      localId: match.bill?.localId || payment.billId,
      storeId: payment.storeId,
    });

    await addDoc(collection(firestore, 'cashierActions'), {
      actionType: 'PAID_OFFLINE_SYNC',
      orderId: match.bill.id || payment.billId,
      billSerial: payment.billSerial,
      serialNo: payment.billSerial,
      storeId: payment.storeId,
      branchId: payment.storeId,
      cashierId: payment.cashierId,
      cashierName: payment.cashierName,
      userId: payment.cashierId,
      totalAmount: _amount(payment.enteredAmount),
      paymentType: payment.paymentMethod,
      isOfflineSync: true,
      deviceId: payment.deviceId,
      timestamp: serverTimestamp(),
    });

    await logCashierAction({
      action: 'OFFLINE_PAYMENT_SYNCED',
      orderId: match.bill.id || payment.billId,
      billSerial: payment.billSerial,
      userId: payment.cashierId,
      userName: payment.cashierName,
      storeId: payment.storeId,
      amount: payment.enteredAmount,
      paymentType: payment.paymentMethod,
      metadata: { localId: payment.localId, deviceId: payment.deviceId },
    }).catch(() => {});

    try {
      const { purgePaidBillsFromDexie } = await import('./paidBillIndexService');
      await purgePaidBillsFromDexie(payment.storeId || payment.branchId);
    } catch { /* non-critical */ }

    return { success: true };
  }

  return { success: false, error: 'Unknown match status' };
};

const _paymentMatchesBill = (payment, { billId, billSerial, storeId, localId }) => {
  const serial = _norm(billSerial);
  const pSerial = _norm(payment.billSerial || payment.billId);
  const pBranch = payment.storeId || payment.branchId || 'default';
  const matchSerial = serial && pSerial === serial;
  const matchId = localId && (payment.billId === localId || payment.billId === billId);
  const matchBranch = !storeId || pBranch === storeId || pBranch === 'default';
  return (matchSerial || matchId) && matchBranch;
};

/** After a bill syncs, retry matching pending payments for same serial/branch */
export const reconcileAfterBillSync = async ({ billId, billSerial, storeId, localId }) => {
  if (!getHasInternet()) return { matched: 0 };

  try {
    const {
      getPendingOfflinePayments,
      getManualReviewQueue,
      isWaitingForBillSync,
      completeManualReviewSync,
      markSynced,
    } = await import('./offlinePaymentService');

    const pending = await getPendingOfflinePayments();
    const manualReview = await getManualReviewQueue(storeId);
    const waitingManual = manualReview.filter(
      (p) => isWaitingForBillSync(p.reviewReason),
    );

    const cloudPending = await fetchCloudPendingPaymentsForBill({ billSerial, storeId });

    const seen = new Set();
    const relevant = [...pending, ...waitingManual, ...cloudPending].filter((p) => {
      if (seen.has(p.localId)) return false;
      if (!_paymentMatchesBill(p, { billId, billSerial, storeId, localId })) return false;
      seen.add(p.localId);
      return true;
    });

    let matched = 0;
    for (const payment of relevant) {
      const result = await reconcilePayment({ ...payment, billId: billId || localId });
      if (result.success) {
        matched++;
        await notifyBillerCashierPayment({
          billSerial,
          amount: payment.enteredAmount,
          cashierName: payment.cashierName,
          localId: localId || billId,
          storeId,
        });
        if (payment.status === 'manual_review') {
          await completeManualReviewSync(payment.localId);
        } else if (!payment._fromCloud) {
          const queueItems = await import('./offlinePaymentService').then((m) => m.getPendingSyncItems());
          const qItem = queueItems.find((q) => q.targetLocalId === payment.localId);
          if (qItem) await markSynced(qItem.queueId, payment.localId);
        }
      }
    }
    return { matched };
  } catch (err) {
    console.warn('[reconcile] afterBillSync failed:', err?.message);
    return { matched: 0 };
  }
};

/** Dashboard aggregates for admin/manager */
const _matchesStoreScope = (storeIds, item, storeAliases = []) => {
  if (!storeIds?.length) return true;
  const allowed = new Set([
    ...storeIds.map((id) => String(id).trim()),
    ...(Array.isArray(storeAliases) ? storeAliases : []).map((id) => String(id).trim()),
  ]);
  const sid = String(item?.storeId || item?.branchId || '').trim();
  if (!sid || sid === 'default') return storeIds.length === 1;
  if (allowed.has(sid)) return true;
  const lower = sid.toLowerCase();
  for (const a of allowed) {
    if (String(a).toLowerCase() === lower) return true;
  }
  return false;
};

const _paymentFromReviewItem = (item = {}) => ({
  localId: item.localId || item.paymentLocalId || (item.id ? `cloud_${item.id}` : ''),
  billId: item.billId || '',
  billSerial: item.billSerial || item.serialNo || '',
  enteredAmount: item.paymentAmount ?? item.enteredAmount ?? item.amount ?? 0,
  storeId: item.storeId || item.branchId || '',
  branchId: item.branchId || item.storeId || '',
  cashierId: item.cashierId || '',
  cashierName: item.cashierName || '',
  paymentMethod: item.paymentMethod || 'Cash',
  source: 'cloud_retry',
});

const _filterByScope = (rows, storeIds, storeAliases) => {
  if (!storeIds?.length) return rows;
  return (rows || []).filter((r) => _matchesStoreScope(storeIds, r, storeAliases));
};

const _resolveScope = (scope) => {
  if (scope == null) return { storeIds: null, storeAliases: [], elevated: true };
  if (Array.isArray(scope)) return { storeIds: scope.length ? scope : null, storeAliases: [], elevated: !scope.length };
  if (typeof scope === 'string') return { storeIds: [scope], storeAliases: [], elevated: false };
  return {
    storeIds: scope.storeIds ?? (scope.storeId ? [scope.storeId] : null),
    storeAliases: scope.storeAliases ?? [],
    elevated: Boolean(scope.elevated),
  };
};

const _dedupeKey = (item) => {
  const local = item?.localId || item?.paymentLocalId;
  if (local) return `local:${local}`;
  if (item?.id) return `id:${item.id}`;
  const serial = String(item?.billSerial || item?.serialNo || '').trim().toUpperCase();
  const amt = Math.round(Number(item?.amount || item?.enteredAmount || item?.paymentAmount) || 0);
  return `fallback:${serial}:${amt}:${item?.savedAt || item?.createdAt || ''}`;
};

const _dedupeList = (items = []) => {
  const map = new Map();
  for (const item of items) {
    const key = _dedupeKey(item);
    const prev = map.get(key);
    if (!prev) {
      map.set(key, item);
      continue;
    }
    // Prefer cloud doc (has Firestore id) over local duplicate
    const score = (x) => (x?.id && !String(x.id).startsWith('local_') ? 2 : 0) + (x?.source === 'cloud' ? 1 : 0);
    if (score(item) > score(prev)) map.set(key, item);
  }
  return [...map.values()];
};

const OPEN_MATCH_STATUSES = new Set([
  MATCH_STATUS.FRAUD,
  MATCH_STATUS.PENDING,
  MATCH_STATUS.REVIEW_REQUIRED,
]);

const OPEN_FRAUD_REVIEW_STATUSES = new Set(['open', 'investigating']);

const _isOpenMatch = (m) => OPEN_MATCH_STATUSES.has(String(m?.status || '').toLowerCase());

/** Local IDB manual review row hatao — cloud dismiss ke baad wapas na dikhe */
const _cleanupLocalReviewItem = async (localId, decision = 'reject') => {
  if (!localId) return;
  try {
    const { resolveManualReview } = await import('./offlinePaymentService');
    const mapped = decision === 'approve' ? 'approve' : decision === 'reject' ? 'reject' : 'reject';
    await resolveManualReview(localId, mapped);
  } catch { /* non-critical */ }
};

/** payment_matches rows close karo — dismissed fraud review ke baad FRAUD match wapas na aaye */
const _resolveRelatedMatchRecords = async (item, decision, userName) => {
  if (!firestore) return { success: false, error: 'Cloud offline' };
  const localId = item?.localId || item?.paymentLocalId;
  const matchStatus = decision === 'approve'
    ? MATCH_STATUS.MATCHED
    : decision === 'reject'
      ? 'rejected'
      : 'dismissed';

  const patch = {
    status: matchStatus,
    resolvedAt: serverTimestamp(),
    resolvedBy: userName,
    updatedAt: serverTimestamp(),
  };

  let updated = 0;
  const errors = [];

  if (item?.source === 'cloud_match' && item?.id) {
    try {
      await updateDoc(doc(firestore, COL.matches, item.id), patch);
      updated += 1;
    } catch (err) {
      errors.push(err?.message || 'match id update fail');
    }
  }

  if (localId) {
    try {
      const q = query(
        collection(firestore, COL.matches),
        where('paymentLocalId', '==', localId),
        limit(25),
      );
      const snap = await getDocs(q);
      const openDocs = snap.docs.filter((d) => _isOpenMatch(d.data()));
      await Promise.all(openDocs.map((d) => updateDoc(d.ref, patch)));
      updated += openDocs.length;
    } catch (err) {
      console.warn('[reconcile] match cleanup:', err?.message);
      errors.push(err?.message || 'match query fail');
    }
  }

  if (errors.length && updated === 0) return { success: false, error: errors[0] };
  return { success: true, updated };
};

/** payments collection pending rows close — offline list se hatane ke liye */
const _closeCloudPaymentRecords = async (item, decision, userName) => {
  if (!firestore) return { success: true };
  const localId = item?.localId || item?.paymentLocalId;
  const paymentId = item?.paymentId || item?.firebasePaymentId;
  const status = decision === 'approve' ? MATCH_STATUS.MATCHED : 'dismissed';
  const patch = {
    reconciliationStatus: status,
    matchStatus: status,
    pendingBill: false,
    resolvedAt: serverTimestamp(),
    resolvedBy: userName,
    updatedAt: serverTimestamp(),
  };

  const tryUpdate = async (ref) => {
    try {
      await updateDoc(ref, patch);
      return true;
    } catch {
      return false;
    }
  };

  let updated = 0;
  if (paymentId) {
    if (await tryUpdate(doc(firestore, COL.payments, paymentId))) updated += 1;
  }
  if (localId) {
    try {
      const q = query(collection(firestore, COL.payments), where('localId', '==', localId), limit(15));
      const snap = await getDocs(q);
      for (const d of snap.docs) {
        if (await tryUpdate(d.ref)) updated += 1;
      }
    } catch { /* index may be missing */ }
  }
  return { success: true, updated };
};

export const ISSUE_TYPES = {
  FRAUD: 'fraud',
  DUPLICATE: 'duplicate',
  OFFLINE: 'offline',
  SYNC_FAILED: 'sync_failed',
};

const _isDuplicateReason = (reason = '') => {
  const r = String(reason).toLowerCase();
  return r.includes('duplicate')
    || r === FRAUD_REASONS.DUPLICATE_PAYMENT
    || r === FRAUD_REASONS.DUPLICATE_BILL;
};

const _normalizeIssueItem = (raw, issueType, source = 'cloud') => ({
  id: raw.id || raw.localId || raw.queueId || '',
  localId: raw.localId || raw.paymentLocalId || '',
  queueId: raw.queueId || '',
  issueType,
  source,
  deviceOnly: source === 'local' || raw.deviceOnly === true,
  billSerial: raw.billSerial || raw.serialNo || '',
  billId: raw.billId || '',
  reason: raw.reason || raw.reviewReason || raw.lastError || raw.status || '',
  reasonLabel: issueType === ISSUE_TYPES.SYNC_FAILED
    ? String(raw.lastError || 'Sync queue fail')
    : getFraudReasonLabel(raw.reason || raw.reviewReason || raw.reason),
  details: raw.details || raw.reviewNote || raw.lastError || '',
  paymentAmount: raw.paymentAmount ?? raw.enteredAmount ?? raw.amount ?? null,
  paymentMethod: raw.paymentMethod || 'Cash',
  cashierName: raw.cashierName || '—',
  cashierId: raw.cashierId || '',
  billerName: raw.billerName || raw.biller || raw.createdByName || raw.billerSubmittedBy || '—',
  billerId: raw.billerId || raw.createdBy || '',
  fraudByName: raw.cashierName || raw.flaggedByName || raw.flaggedBy || '—',
  storeId: raw.storeId || raw.branchId || '',
  severity: raw.severity || (issueType === ISSUE_TYPES.FRAUD ? 'high' : 'medium'),
  status: raw.status || 'open',
  createdAt: raw.createdAt || raw.flaggedAt || raw.savedAt || raw.timestamp || raw.lastTriedAt,
});

const _splitReviewToIssues = (items = []) => {
  const fraudIssues = [];
  const duplicateIssues = [];
  for (const item of items) {
    const norm = _normalizeIssueItem(
      item,
      _isDuplicateReason(item.reason || item.reviewReason) ? ISSUE_TYPES.DUPLICATE : ISSUE_TYPES.FRAUD,
      item.source || 'cloud',
    );
    if (_isDuplicateReason(item.reason || item.reviewReason)) duplicateIssues.push(norm);
    else fraudIssues.push(norm);
  }
  return { fraudIssues, duplicateIssues };
};

const _buildDashboardPayload = ({
  reviewItems = [],
  unsyncedRaw = [],
  syncFailuresRaw = [],
  fraudMatches = [],
  duplicateMatches = [],
}) => {
  const { fraudIssues: reviewFraud, duplicateIssues: reviewDup } = _splitReviewToIssues(reviewItems);

  const fraudIssues = _dedupeList([
    ...reviewFraud,
    ...fraudMatches.map((m) => _normalizeIssueItem(m, ISSUE_TYPES.FRAUD, m.source || 'cloud_match')),
  ]);

  const duplicateIssues = _dedupeList([
    ...reviewDup,
    ...duplicateMatches.map((m) => _normalizeIssueItem(m, ISSUE_TYPES.DUPLICATE, m.source || 'cloud_match')),
  ]);

  const offlineIssues = _dedupeList(
    unsyncedRaw.map((p) => _normalizeIssueItem(
      { ...p, reason: p.reason || 'offline_unsynced', reviewReason: 'bill_not_found' },
      ISSUE_TYPES.OFFLINE,
      p.source || 'local',
    )),
  );

  const syncFailures = _dedupeList(
    syncFailuresRaw.map((s) => _normalizeIssueItem(
      {
        ...s,
        billSerial: s.billSerial || s.targetSerial || '',
        reason: s.lastError || 'sync_failed',
      },
      ISSUE_TYPES.SYNC_FAILED,
      s.source || 'payment_queue',
    )),
  );

  return {
    fraudIssues,
    duplicateIssues,
    offlineIssues,
    syncFailures,
    stats: {
      fraud: fraudIssues.length,
      duplicates: duplicateIssues.length,
      offline: offlineIssues.length,
      syncFailed: syncFailures.length,
      total: fraudIssues.length + duplicateIssues.length + offlineIssues.length + syncFailures.length,
    },
  };
};

const _pickBillerName = (bill = {}) =>
  bill.createdByName || bill.billerName || bill.biller || bill.submittedByName || bill.submittedBy || '';

/** Firestore se biller/serial enrich — purani fraud rows ke liye */
const _enrichDashboardIssues = async (payload = {}) => {
  if (!getHasInternet() || !firestore) return payload;

  const all = [
    ...(payload.fraudIssues || []),
    ...(payload.duplicateIssues || []),
    ...(payload.offlineIssues || []),
    ...(payload.syncFailures || []),
  ];
  const billIds = [...new Set(all.map((i) => i.billId).filter((id) => id && !String(id).startsWith('local_') && !String(id).startsWith('op_')))];
  const billMeta = new Map();

  await Promise.all(billIds.slice(0, 80).map(async (id) => {
    try {
      const snap = await getDoc(doc(firestore, COL.orders, id));
      if (!snap.exists()) return;
      const d = snap.data();
      billMeta.set(id, {
        billerName: _pickBillerName(d),
        billSerial: d.serialNo || d.billSerial || d.serial || '',
        storeId: d.storeId || d.branchId || '',
        cashierName: d.cashierPaymentBy || d.paidByName || d.cashierName || '',
      });
    } catch { /* ignore */ }
  }));

  const serialOnly = all.filter((i) => !i.billId && i.billSerial).slice(0, 15);
  await Promise.all(serialOnly.map(async (item) => {
    try {
      const bill = await findBillForPayment({
        billSerial: item.billSerial,
        storeId: item.storeId,
        branchId: item.storeId,
      });
      if (!bill) return;
      billMeta.set(`serial:${item.billSerial}`, {
        billerName: _pickBillerName(bill),
        billSerial: bill.serialNo || bill.billSerial || item.billSerial,
        storeId: bill.storeId || bill.branchId || item.storeId,
        cashierName: bill.cashierPaymentBy || bill.paidByName || bill.cashierName || '',
        billId: bill.id || bill.firebaseId || '',
      });
    } catch { /* ignore */ }
  }));

  const enrichList = (list = []) => list.map((item) => {
    const meta = item.billId
      ? billMeta.get(item.billId)
      : billMeta.get(`serial:${item.billSerial}`);
    const billerName = (item.billerName && item.billerName !== '—')
      ? item.billerName
      : (meta?.billerName || item.billerName);
    const cashierName = (item.cashierName && item.cashierName !== '—')
      ? item.cashierName
      : (meta?.cashierName || item.cashierName);
    return {
      ...item,
      billId: item.billId || meta?.billId || item.billId,
      billerName: billerName || '—',
      cashierName: cashierName || '—',
      fraudByName: cashierName || item.fraudByName || '—',
      billSerial: item.billSerial || meta?.billSerial || '',
      storeId: item.storeId || meta?.storeId || item.storeId,
    };
  });

  const fraudIssues = enrichList(payload.fraudIssues);
  const duplicateIssues = enrichList(payload.duplicateIssues);
  const offlineIssues = enrichList(payload.offlineIssues);
  const syncFailures = enrichList(payload.syncFailures);
  const total = fraudIssues.length + duplicateIssues.length + offlineIssues.length + syncFailures.length;

  return {
    ...payload,
    fraudIssues,
    duplicateIssues,
    offlineIssues,
    syncFailures,
    stats: {
      fraud: fraudIssues.length,
      duplicates: duplicateIssues.length,
      offline: offlineIssues.length,
      syncFailed: syncFailures.length,
      total,
    },
  };
};

const _loadLocalReconciliationData = async (storeIds = null, storeAliases = []) => {
  const empty = _buildDashboardPayload({});

  try {
    const { getPendingOfflinePayments, getPendingSyncItems, getManualReviewQueue } = await import('./offlinePaymentService');
    const { db: localDB } = await import('../db/index');

    const branchFilter = storeIds?.length === 1 ? storeIds[0] : null;
    const [localPayments, paymentQueue, manualReview] = await Promise.all([
      getPendingOfflinePayments(),
      getPendingSyncItems(),
      getManualReviewQueue(branchFilter, { storeAliases }),
    ]);

    let mainSyncFailures = [];
    try {
      const queue = await localDB.sync_queue.toArray();
      mainSyncFailures = queue.filter(
        (q) => q.status === 'failed' || Number(q.attempts || 0) >= 5,
      );
    } catch { /* ignore */ }

    const localFiltered = localPayments.filter((p) => _matchesStoreScope(storeIds, p, storeAliases));
    const paymentSyncFailures = paymentQueue.filter(
      (q) => q.status === 'failed' || q.retryCount >= (q.maxRetries || 5),
    );

    const syncFailuresRaw = [
      ...paymentSyncFailures.map((q) => ({ ...q, source: 'payment_queue' })),
      ...mainSyncFailures.map((q) => ({ ...q, source: 'sync_queue' })),
    ];

    const reviewItems = _dedupeList([
      ...manualReview.map((r) => ({ ...r, source: 'local' })),
      ...localFiltered
        .filter((p) => p.status === 'manual_review')
        .map((p) => ({
          ...p,
          reason: p.reviewReason || 'manual_review',
          details: p.reviewNote || 'Cashier manual review',
          source: 'local',
        })),
    ]);

    const reviewIds = new Set(reviewItems.map((r) => r.localId).filter(Boolean));

    const unsyncedRaw = _dedupeList(
      localFiltered
        .filter((p) => p.status === 'offline_unsynced' && !reviewIds.has(p.localId))
        .map((p) => ({ ...p, source: 'local', deviceOnly: true })),
    );

    return filterResolvedFromPayload({
      ...(await _enrichDashboardIssues(_buildDashboardPayload({ reviewItems, unsyncedRaw, syncFailuresRaw }))),
      offline: true,
    });
  } catch (err) {
    console.warn('[reconcile] local dashboard load failed:', err?.message);
    return { ...empty, offline: true, error: err?.message };
  }
};

export const getReconciliationDashboardData = async (scope = null) => {
  const { storeIds, storeAliases, elevated } = _resolveScope(scope);
  const branchFilter = storeIds?.length === 1 ? storeIds[0] : null;
  // Manager + Super Admin: online par sirf cloud — same data dono ko
  const useLocalDeviceData = false;

  const empty = _buildDashboardPayload({});

  if (!getHasInternet() || !firestore) {
    return _loadLocalReconciliationData(storeIds, storeAliases);
  }

  try {
    const loadCollection = async (name, orderField = 'createdAt') => {
      try {
        const q = query(collection(firestore, name), orderBy(orderField, 'desc'), limit(150));
        const getFn = getHasInternet() ? getDocsFromServer : getDocs;
        const snap = await getFn(q);
        const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        return _filterByScope(rows, storeIds, storeAliases);
      } catch {
        return [];
      }
    };

    const [matches, fraudReviews, payments] = await Promise.all([
      loadCollection(COL.matches),
      loadCollection(COL.fraudReviews),
      loadCollection(COL.payments, 'timestamp'),
    ]);

    const cloudUnsynced = payments
      .filter((p) => {
        const isPending = p.reconciliationStatus === 'pending_bill'
          || p.matchStatus === MATCH_STATUS.PENDING
          || (p.pendingBill === true && !p.matchedAt);
        return isPending && !p.matchedAt;
      })
      .map((p) => ({ ...p, source: 'cloud' }));

    const pendingMatches = matches
      .filter((m) => m.status === MATCH_STATUS.PENDING || m.status === MATCH_STATUS.REVIEW_REQUIRED)
      .map((m) => ({
        ...m,
        localId: m.paymentLocalId,
        amount: m.paymentAmount,
        enteredAmount: m.paymentAmount,
        reason: m.reason || 'bill_not_found',
        source: 'cloud_match',
      }));

    const fraudMatches = matches
      .filter((m) => m.status === MATCH_STATUS.FRAUD && !_isDuplicateReason(m.reason))
      .map((m) => ({
        ...m,
        localId: m.paymentLocalId,
        amount: m.paymentAmount,
        enteredAmount: m.paymentAmount,
        source: 'cloud_match',
      }));

    const duplicateMatches = matches
      .filter((m) => _isDuplicateReason(m.reason) && _isOpenMatch(m))
      .map((m) => ({
        ...m,
        localId: m.paymentLocalId,
        amount: m.paymentAmount,
        enteredAmount: m.paymentAmount,
        source: 'cloud_match',
      }));

    const reviewItems = _dedupeList([
      ...fraudReviews
        .filter((f) => OPEN_FRAUD_REVIEW_STATUSES.has(String(f.status || '').toLowerCase()))
        .map((f) => ({ ...f, source: 'cloud' })),
    ]);

    let localReviewItems = [];
    let localUnsynced = [];
    let syncFailuresRaw = [];

    if (useLocalDeviceData) {
      const { getPendingOfflinePayments, getPendingSyncItems, getManualReviewQueue } = await import('./offlinePaymentService');
      const [localPayments, localQueue, manualReview] = await Promise.all([
        getPendingOfflinePayments(),
        getPendingSyncItems(),
        getManualReviewQueue(branchFilter, { storeAliases }),
      ]);

      const localFiltered = localPayments.filter((p) => _matchesStoreScope(storeIds, p, storeAliases));

      localReviewItems = [
        ...manualReview.map((r) => ({ ...r, source: 'local' })),
        ...localFiltered
          .filter((p) => p.status === 'manual_review')
          .map((p) => ({
            ...p,
            reason: p.reviewReason || 'manual_review',
            details: p.reviewNote || 'Cashier manual review',
            source: 'local',
          })),
      ];

      localUnsynced = localFiltered
        .filter((p) => p.status === 'offline_unsynced')
        .map((p) => ({ ...p, source: 'local', deviceOnly: true }));

      syncFailuresRaw = localQueue
        .filter((q) => q.status === 'failed' || q.retryCount >= (q.maxRetries || 5))
        .map((q) => ({ ...q, source: 'payment_queue' }));
    }

    const allReviewItems = _dedupeList([...reviewItems, ...localReviewItems]);
    const reviewIds = new Set(allReviewItems.map((r) => r.localId).filter(Boolean));

    const unsyncedRaw = _dedupeList([
      ...cloudUnsynced,
      ...pendingMatches,
      ...localUnsynced,
    ]).filter((p) => !reviewIds.has(p.localId));

    return filterResolvedFromPayload(await _enrichDashboardIssues(_buildDashboardPayload({
      reviewItems: allReviewItems,
      unsyncedRaw,
      syncFailuresRaw,
      fraudMatches,
      duplicateMatches,
    })));
  } catch (err) {
    console.error('[reconcile] dashboard load failed:', err);
    return { ...empty, error: err.message };
  }
};

/**
 * Live cloud sync — manager approve/reject super admin ko turant dikhe, vice versa.
 * @returns unsubscribe
 */
export const watchReconciliationDashboardData = (scope, onUpdate, onError, opts = {}) => {
  const getPaused = opts.getPaused || (() => false);
  if (!firestore || !getHasInternet()) {
    getReconciliationDashboardData(scope).then(onUpdate).catch((e) => onError?.(e));
    return () => {};
  }

  let debounceTimer = null;
  let active = true;
  const unsubscribers = [];

  const refresh = () => {
    if (getPaused()) return;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      if (!active || getPaused()) return;
      try {
        const data = await getReconciliationDashboardData(scope);
        if (active) onUpdate(data);
      } catch (err) {
        if (active) onError?.(err);
      }
    }, 350);
  };

  const watchCol = (name, orderField = 'createdAt') => {
    try {
      const q = query(collection(firestore, name), orderBy(orderField, 'desc'), limit(150));
      const unsub = onSnapshot(
        q,
        () => refresh(),
        (err) => {
          console.warn('[reconcile] watch error:', name, err?.message);
          onError?.(err);
        },
      );
      unsubscribers.push(unsub);
    } catch (err) {
      console.warn('[reconcile] watch setup:', name, err?.message);
    }
  };

  watchCol(COL.matches);
  watchCol(COL.fraudReviews);
  watchCol(COL.payments, 'timestamp');

  refresh();

  return () => {
    active = false;
    clearTimeout(debounceTimer);
    unsubscribers.forEach((u) => u());
  };
};

/** Cloud fraud review — dismiss / reject / investigate */
export const resolveFraudReview = async (reviewId, { decision = 'dismiss', userId = '', userName = '', userRole = '', note = '' } = {}) => {
  if (!reviewId) return { success: false, error: 'Review ID missing' };
  if (!firestore) return { success: false, error: 'Cloud offline — pehle online aao' };
  const statusMap = {
    approve: 'resolved_approve',
    reject: 'resolved_reject',
    dismiss: 'dismissed',
    investigate: 'investigating',
  };
  try {
    await updateDoc(doc(firestore, COL.fraudReviews, reviewId), {
      status: statusMap[decision] || 'resolved',
      resolvedAt: serverTimestamp(),
      resolvedBy: userName,
      resolvedById: userId,
      resolvedByRole: userRole || '',
      resolutionNote: note,
      updatedAt: serverTimestamp(),
    });
    return { success: true };
  } catch (err) {
    console.warn('[reconcile] resolveFraudReview:', err?.message);
    return { success: false, error: err?.message || 'Cloud update fail — permission?' };
  }
};

/** Open fraud_reviews close by payment local id */
const _closeCloudFraudReviewsForPayment = async (paymentLocalId, decision, userName, userId, userRole = '', note = '') => {
  if (!firestore || !paymentLocalId) return { success: true };
  const statusMap = {
    approve: 'resolved_approve',
    reject: 'resolved_reject',
    dismiss: 'dismissed',
  };
  const targetStatus = statusMap[decision] || 'dismissed';
  try {
    const q = query(
      collection(firestore, COL.fraudReviews),
      where('paymentLocalId', '==', paymentLocalId),
      limit(20),
    );
    const snap = await getDocs(q);
    const openDocs = snap.docs.filter((d) =>
      OPEN_FRAUD_REVIEW_STATUSES.has(String(d.data()?.status || '').toLowerCase()),
    );
    if (!openDocs.length) return { success: true };
    await Promise.all(openDocs.map((d) => updateDoc(d.ref, {
      status: targetStatus,
      resolvedAt: serverTimestamp(),
      resolvedBy: userName,
      resolvedById: userId,
      resolvedByRole: userRole || '',
      resolutionNote: note,
      updatedAt: serverTimestamp(),
    })));
    return { success: true };
  } catch (err) {
    return { success: false, error: err?.message || 'Fraud review close fail' };
  }
};

/** Manager confirm — cashier paid, manager settle */
export const confirmReconciliationBill = async (bill, userData) => {
  if (!firestore || !bill?.id) throw new Error('Bill missing');
  const { buildSettlePatch } = await import('../utils/cashierOrderUtils');
  const { logBillSettled } = await import('./activityLogger');
  const total = getBillPaymentAmount(bill);
  const actor = {
    userId: userData?.uid || '',
    userName: userData?.name || userData?.displayName || 'Manager',
    role: userData?.primaryRole || userData?.role || 'manager',
  };
  await updateDoc(doc(firestore, COL.orders, bill.id), {
    ...buildSettlePatch({ ...actor, amount: total, keepCashierPaidBy: true }),
    paidAt: serverTimestamp(),
  });
  await logBillSettled(actor, bill, { confirmCashier: true });
  return true;
};

/** Review row action — local manual review or cloud fraud */
const _finalizeCloudResolution = async (item, decision, userName) => {
  const matchRes = await _resolveRelatedMatchRecords(item, decision, userName);
  if (matchRes?.success === false) return matchRes;
  await _closeCloudPaymentRecords(item, decision, userName);
  await _cleanupLocalReviewItem(item.localId || item.paymentLocalId, decision);
  return { success: true };
};

export const handleReconciliationReview = async (item, decision, userData) => {
  const userName = userData?.name || userData?.displayName || 'Admin';
  const userId = userData?.uid || '';
  const userRole = userData?.primaryRole || userData?.role || '';
  const isCloudSource = item.source === 'cloud' || item.source === 'cloud_match';

  const runCloudRetry = async () => {
    const { getPendingOfflinePayments } = await import('./offlinePaymentService');
    const pending = await getPendingOfflinePayments();
    const lid = item.localId || item.paymentLocalId;
    let pay = lid ? pending.find((p) => p.localId === lid) : null;
    if (!pay) pay = _paymentFromReviewItem(item);
    return reconcilePayment(pay);
  };

  if (decision === 'retry' && isCloudSource) {
    const result = await runCloudRetry();
    if (result?.success) {
      if (item.source === 'cloud' && item.id) {
        const closed = await resolveFraudReview(item.id, {
          decision: 'dismiss',
          userId,
          userName,
          userRole,
          note: 'Retry successful — matched',
        });
        if (closed?.success === false) return closed;
      } else if (item.source === 'cloud_match' && item.id && firestore) {
        try {
          await updateDoc(doc(firestore, COL.matches, item.id), {
            status: MATCH_STATUS.MATCHED,
            resolvedAt: serverTimestamp(),
            resolvedBy: userName,
            updatedAt: serverTimestamp(),
          });
        } catch { /* non-critical */ }
      }
      await _closeCloudFraudReviewsForPayment(item.localId || item.paymentLocalId, 'dismiss', userName, userId, userRole, 'Retry matched');
      return await _finalizeCloudResolution(item, 'approve', userName);
    }
    if (result?.needsRetry) {
      return { success: false, error: 'Bill abhi sync nahi — Force Sync dabao, phir Retry' };
    }
    return {
      success: false,
      error: result?.details || getFraudReasonLabel(result?.reason) || 'Match nahi hui',
    };
  }

  const cloudDecision = decision === 'reject' ? 'reject' : decision === 'approve' ? 'approve' : 'dismiss';

  if (item.source === 'cloud' && item.id) {
    if (decision === 'approve' && item.billId && firestore) {
      try {
        const { toFirebaseCashierPaymentPatch } = await import('./billPaymentWriteService');
        await updateDoc(doc(firestore, COL.orders, item.billId), {
          ...toFirebaseCashierPaymentPatch({
            amount: item.paymentAmount,
            paymentType: item.paymentMethod || 'Cash',
            cashierId: item.cashierId || userId,
            cashierName: item.cashierName || userName,
          }),
          paidAt: serverTimestamp(),
          manualReviewApproved: true,
          manualReviewBy: userName,
          manualReviewAt: serverTimestamp(),
        });
      } catch { /* bill local only */ }
    }
    const closed = await resolveFraudReview(item.id, {
      decision: cloudDecision,
      userId,
      userName,
      userRole,
    });
    if (closed?.success === false) return closed;
    return await _finalizeCloudResolution(item, decision, userName);
  }

  if (item.source === 'cloud_match' && item.id && firestore) {
    if (decision === 'approve' && item.billId) {
      try {
        const { toFirebaseCashierPaymentPatch } = await import('./billPaymentWriteService');
        await updateDoc(doc(firestore, COL.orders, item.billId), {
          ...toFirebaseCashierPaymentPatch({
            amount: item.paymentAmount,
            paymentType: item.paymentMethod || 'Cash',
            cashierId: item.cashierId || userId,
            cashierName: item.cashierName || userName,
          }),
          paidAt: serverTimestamp(),
          manualReviewApproved: true,
          manualReviewBy: userName,
          manualReviewAt: serverTimestamp(),
        });
      } catch { /* non-critical */ }
    }
    if (decision === 'dismiss' || decision === 'reject' || decision === 'approve') {
      try {
        await updateDoc(doc(firestore, COL.matches, item.id), {
          status: decision === 'reject' ? 'rejected' : decision === 'approve' ? MATCH_STATUS.MATCHED : 'dismissed',
          resolvedAt: serverTimestamp(),
          resolvedBy: userName,
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        return { success: false, error: err?.message || 'Match update fail' };
      }
      await _closeCloudFraudReviewsForPayment(item.localId || item.paymentLocalId, cloudDecision, userName, userId, userRole);
      return await _finalizeCloudResolution(item, decision, userName);
    }
  }

  if (isCloudSource && (decision === 'dismiss' || decision === 'reject' || decision === 'approve')) {
    const lid = item.localId || item.paymentLocalId;
    const closed = await _closeCloudFraudReviewsForPayment(lid, cloudDecision, userName, userId, userRole);
    if (closed?.success === false) return closed;
    return await _finalizeCloudResolution(item, decision, userName);
  }

  const {
    resolveManualReview,
    releasePaymentForCorrection,
    getPendingOfflinePayments,
  } = await import('./offlinePaymentService');

  if (!item.localId && decision !== 'retry') {
    return { success: false, error: 'Is PC par local data nahi — cloud se dismiss try karo ya Force Sync' };
  }

  if (decision === 'release') {
    return releasePaymentForCorrection(item.localId);
  }

  if (decision === 'retry') {
    const pending = await getPendingOfflinePayments();
    const pay = item.localId
      ? pending.find((p) => p.localId === item.localId) || _paymentFromReviewItem(item)
      : _paymentFromReviewItem(item);
    const result = await reconcilePayment(pay);
    if (result?.success) {
      return await _finalizeCloudResolution(item, 'approve', userName);
    }
    if (result?.needsRetry) {
      return { success: false, error: 'Bill abhi sync nahi — Force Sync dabao, phir Retry' };
    }
    return { success: false, error: result?.details || 'Match nahi hui' };
  }

  if (decision === 'approve' && item.billId && firestore) {
    try {
      const { toFirebaseCashierPaymentPatch } = await import('./billPaymentWriteService');
      await updateDoc(doc(firestore, COL.orders, item.billId), {
        ...toFirebaseCashierPaymentPatch({
          amount: item.paymentAmount,
          paymentType: item.paymentMethod || 'Cash',
          cashierId: item.cashierId || userId,
          cashierName: item.cashierName || userName,
        }),
        paidAt: serverTimestamp(),
        manualReviewApproved: true,
        manualReviewBy: userName,
        manualReviewAt: serverTimestamp(),
      });
    } catch { /* bill local only */ }
  }

  await resolveManualReview(
    item.localId,
    decision === 'approve' ? 'approve' : decision === 'reject' ? 'reject' : 'investigate',
  );
  if (isCloudSource) {
    const fin = await _finalizeCloudResolution(item, decision, userName);
    if (fin?.success === false) return fin;
  }
  return { success: true };
};

/** Retry single unsynced payment */
export const retryUnsyncedPayment = async (payment) => {
  const { getPendingOfflinePayments } = await import('./offlinePaymentService');
  const pending = await getPendingOfflinePayments();
  const pay = payment?.localId
    ? pending.find((p) => p.localId === payment.localId) || payment
    : payment;
  return reconcilePayment(pay);
};

/** Retry failed sync queue item */
export const retrySyncFailure = async (queueItem) => {
  const { resetSyncQueueItem } = await import('./offlinePaymentService');
  const { runSync } = await import('./cashierSyncWorker');
  if (queueItem?.queueId) await resetSyncQueueItem(queueItem.queueId);
  await runSync();
  if (queueItem?.localId) {
    await _cleanupLocalReviewItem(queueItem.localId, 'approve');
  }
  return { success: true };
};

/** Force sync bills + payments, then retry pending reconciliation */
export const forceReconciliationSync = async () => {
  if (!getHasInternet()) {
    return { success: false, offline: true, error: 'Internet nahi — pehle online aao' };
  }

  const { syncOfflineOrders } = await import('./localSyncService');
  const { runSync } = await import('./cashierSyncWorker');
  const { getPendingOfflinePayments } = await import('./offlinePaymentService');

  const billResult = await syncOfflineOrders();
  if (billResult?.skipped) {
    return { success: false, error: 'Sync pehle se chal rahi hai — thori der baad try karo' };
  }

  await runSync();

  const pending = await getPendingOfflinePayments();
  let matched = 0;
  let needsRetry = 0;
  let failed = 0;

  for (const pay of pending) {
    try {
      const result = await reconcilePayment(pay);
      if (result?.success) matched += 1;
      else if (result?.needsRetry) needsRetry += 1;
      else failed += 1;
    } catch {
      failed += 1;
    }
  }

  return {
    success: true,
    billsSynced: billResult?.synced || 0,
    billsFailed: billResult?.failed || 0,
    paymentsRetried: pending.length,
    matched,
    needsRetry,
    failed,
  };
};

/** Admin/manager — overlay cloud offline payments so paid bills show before order heal completes. */
export const fetchAndApplyCloudPayments = async (orders = [], { storeIds = null, since = null } = {}) => {
  if (!getHasInternet() || !firestore) return orders || [];

  const { loadStoresMapFromCache, orderMatchesStore } = await import('../hooks/useStoresMap');
  const { expandBranchIds } = await import('../utils/branchAccess');
  const storesMap = await loadStoresMapFromCache().catch(() => ({}));
  const scopeIds = Array.isArray(storeIds) && storeIds.length
    ? expandBranchIds(storeIds, storesMap)
    : null;

  const sinceDate = since instanceof Date ? since : (since ? new Date(since) : null);

  const paymentAt = (p) => {
    const raw = p.timestamp || p.syncedAt || p.offlineSavedAt || p.savedAt;
    if (raw?.toDate) return raw.toDate();
    const d = new Date(raw || 0);
    return Number.isNaN(d.getTime()) ? new Date(0) : d;
  };

  const passStore = (p) => {
    if (!scopeIds?.length) return true;
    if (!p.storeId && !p.branchId) return true;
    return orderMatchesStore(p, scopeIds);
  };

  const passDate = (p) => {
    if (!sinceDate) return true;
    return paymentAt(p) >= sinceDate;
  };

  const payMap = new Map();
  const ingestPayments = (docs = []) => {
    for (const d of docs) {
      const raw = typeof d.data === 'function' ? d.data() : d;
      const row = { ...(raw || {}), id: d.id || raw?.id };
      if (!row.id) continue;
      if (!passStore(row) || !passDate(row)) continue;
      payMap.set(row.id || row.localId, row);
    }
  };

  try {
    const snap = await getDocs(query(
      collection(firestore, COL.payments),
      orderBy('timestamp', 'desc'),
      limit(250),
    ));
    ingestPayments(snap.docs);
  } catch {
    try {
      const snap = await getDocs(query(collection(firestore, COL.payments), limit(250)));
      ingestPayments(snap.docs);
    } catch { /* non-critical */ }
  }

  try {
    const snap = await getDocs(query(
      collection(firestore, COL.payments),
      where('isOffline', '==', true),
      limit(150),
    ));
    ingestPayments(snap.docs);
  } catch { /* single-field query — may fail on some rules */ }

  const payments = [...payMap.values()];
  if (!payments.length) return orders || [];

  const { findOrdersBySerialInput, getBillSerialKey } = await import('../utils/serialMatch');
  const map = new Map();
  const orderList = [...(orders || [])];

  const findExistingForPayment = (p) => {
    const serialInput = p.billSerial || p.billId || '';
    if (p.billId) {
      const byId = orderList.find((o) =>
        o.id === p.billId || o.localId === p.billId || o.firebaseId === p.billId,
      );
      if (byId) return byId;
      if (map.has(p.billId)) return map.get(p.billId);
    }
    const hits = findOrdersBySerialInput(orderList, serialInput, { limit: 3 });
    if (hits.length === 1) return hits[0];
    const serialKey = _norm(serialInput);
    if (serialKey) {
      for (const o of orderList) {
        if (_norm(getBillSerialKey(o) || o.billSerial || o.serialNo || '') === serialKey) return o;
      }
      for (const o of map.values()) {
        if (_norm(getBillSerialKey(o) || o.billSerial || o.serialNo || '') === serialKey) return o;
      }
    }
    return null;
  };

  for (const o of orderList) {
    const key = o.id || o.localId;
    if (key) map.set(key, o);
  }

  for (const p of payments) {
    const serial = _norm(p.billSerial || p.billId || '');
    const amt = _amount(p.amount ?? p.enteredAmount);
    const paidAt = paymentAt(p);
    const paidIso = paidAt.toISOString();
    const patch = {
      ...buildCashierPaymentPatch({
        amount: amt,
        paymentType: p.paymentMethod || 'Cash',
        cashierId: p.cashierId || '',
        cashierName: p.cashierName || 'Cashier',
        nowISO: paidIso,
      }),
      ...buildCashierOfflinePaymentPatch(),
      isOffline: true,
      offlineSavedAt: p.offlineSavedAt || p.savedAt || paidIso,
      offlineSyncPending: false,
      savedAt: paidIso,
      storeId: p.storeId || p.branchId,
      branchId: p.branchId || p.storeId,
    };

    let existing = findExistingForPayment(p);
    if (!existing && serial) {
      try {
        const cloudOrder = await _findFirestoreBill(
          p,
          p.storeId || p.branchId || 'default',
          serial,
          p.billSerial || serial,
        );
        if (cloudOrder) {
          existing = cloudOrder;
          orderList.push(cloudOrder);
          const key = cloudOrder.id || cloudOrder.localId;
          if (key) map.set(key, cloudOrder);
        }
      } catch { /* non-critical */ }
    }

    if (existing) {
      const merged = { ...existing, ...patch, id: existing.id || p.billId };
      const key = merged.id || merged.localId || `cloud_pay_${p.id}`;
      map.set(key, merged);
      const idx = orderList.findIndex((o) => (o.id || o.localId) === (existing.id || existing.localId));
      if (idx >= 0) orderList[idx] = merged;
      else orderList.push(merged);
      continue;
    }

    if (!serial) continue;
    const synthKey = `cloud_pay_${p.id}`;
    const synth = {
      id: p.billId || synthKey,
      billSerial: p.billSerial || serial,
      serialNo: p.billSerial || serial,
      storeId: p.storeId || p.branchId,
      branchId: p.branchId || p.storeId,
      totalAmount: amt,
      grandTotal: amt,
      createdAt: paidIso,
      savedAt: paidIso,
      ...patch,
      isOrphanPaymentRow: true,
    };
    map.set(synthKey, synth);
    orderList.push(synth);
  }

  return Array.from(map.values());
};

/** Route fix action by issue type */
export const fixReconciliationIssue = async (item, action, userData) => {
  if (item.issueType === ISSUE_TYPES.SYNC_FAILED) {
    return retrySyncFailure(item);
  }
  if (item.issueType === ISSUE_TYPES.OFFLINE) {
    return retryUnsyncedPayment(item);
  }
  return handleReconciliationReview(item, action, userData);
};

export default {
  findBillForPayment,
  attemptPaymentMatch,
  reconcilePayment,
  reconcileAfterBillSync,
  syncOrphanPaymentToCloud,
  fetchCloudPendingPaymentsForBill,
  notifyBillerCashierPayment,
  getReconciliationDashboardData,
  watchReconciliationDashboardData,
  flagFraudReview,
  resolveFraudReview,
  handleReconciliationReview,
  confirmReconciliationBill,
  retryUnsyncedPayment,
  retrySyncFailure,
  fetchAndApplyCloudPayments,
  fixReconciliationIssue,
  forceReconciliationSync,
  ISSUE_TYPES,
  createMatchRecord,
  MATCH_STATUS,
  FRAUD_REASONS,
};
