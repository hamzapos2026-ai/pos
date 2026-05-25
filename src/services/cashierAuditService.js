// ✨ src/services/cashierAuditService.js
// Purpose: Immutable audit logging for all cashier actions
// Rule: auditLogs collection is WRITE-ONLY — never edit or delete
// Offline: Falls back to Dexie, syncs on reconnect

import { collection, addDoc, serverTimestamp } from './firebase';
import { db as firebaseDb } from './firebase';
import { db as dexieDb } from '../db/index';

const DEVICE_ID = (() => {
  try {
    let id = localStorage.getItem('aone_device_id');
    if (!id) {
      id = `DEV_${Math.random().toString(36).slice(2, 9).toUpperCase()}`;
      localStorage.setItem('aone_device_id', id);
    }
    return id;
  } catch {
    return 'DEV_UNKNOWN';
  }
})();

// ══════════════════════════════════════════════════════════════
// CORE AUDIT LOG — IMMUTABLE
// ══════════════════════════════════════════════════════════════

export const writeAuditLog = async ({
  action,
  cashierId,
  cashierName,
  storeId,
  billId,
  billSerial,
  amount,
  details = {},
}) => {
  const entry = {
    action,
    cashierId: cashierId || 'unknown',
    cashierName: cashierName || 'Unknown',
    storeId: storeId || 'default',
    billId: billId || null,
    billSerial: billSerial || null,
    amount: amount || 0,
    deviceId: DEVICE_ID,
    userAgent: navigator.userAgent?.slice(0, 100) || 'unknown',
    timestamp: new Date().toISOString(),
    _immutable: true,
    _createdAt: new Date().toISOString(),
    ...details,
  };

  try {
    if (navigator.onLine) {
      await addDoc(collection(firebaseDb, 'auditLogs'), {
        ...entry,
        timestamp: serverTimestamp(),
        _serverCreatedAt: serverTimestamp(),
      });
    } else {
      throw new Error('offline');
    }
    return { success: true, offline: false };
  } catch {
    try {
      await dexieDb.activity_logs_local.add({
        ...entry,
        synced: false,
        _pendingFirebase: true,
      });
      return { success: true, offline: true };
    } catch (dexieErr) {
      console.error('[cashierAuditService] Dexie write failed:', dexieErr);
      return { success: false };
    }
  }
};

// ══════════════════════════════════════════════════════════════
// CASHIER ACTION LOGGER — secondary collection
// ══════════════════════════════════════════════════════════════

export const writeCashierAction = async ({
  type,
  cashierId,
  cashierName,
  storeId,
  billId,
  billSerial,
  amount,
  paymentMethod,
  details = {},
}) => {
  const entry = {
    type,
    cashierId: cashierId || 'unknown',
    cashierName: cashierName || 'Unknown',
    storeId: storeId || 'default',
    billId: billId || null,
    billSerial: billSerial || null,
    amount: amount || 0,
    paymentMethod: paymentMethod || null,
    deviceId: DEVICE_ID,
    performedAt: new Date().toISOString(),
    ...details,
  };

  try {
    if (navigator.onLine) {
      await addDoc(collection(firebaseDb, 'cashierActions'), {
        ...entry,
        performedAt: serverTimestamp(),
      });
    } else {
      throw new Error('offline');
    }
    return { success: true };
  } catch {
    try {
      await dexieDb.activity_logs_local.add({
        ...entry,
        action: `CASHIER_${type}`,
        userId: cashierId,
        synced: false,
        _pendingFirebase: true,
        timestamp: new Date().toISOString(),
      });
      return { success: true, offline: true };
    } catch {
      return { success: false };
    }
  }
};

// ══════════════════════════════════════════════════════════════
// NAMED HELPERS
// ══════════════════════════════════════════════════════════════

export const logPayment = (cashier, storeId, bill, paymentData) =>
  Promise.all([
    writeAuditLog({
      action: 'CASHIER_PAYMENT',
      cashierId: cashier.uid,
      cashierName: cashier.displayName || cashier.name,
      storeId,
      billId: bill.id,
      billSerial: bill.serialNo || bill.billSerial,
      amount: bill.total || bill.grandTotal || bill.totalAmount,
      details: { paymentData },
    }),
    writeCashierAction({
      type: 'PAYMENT',
      cashierId: cashier.uid,
      cashierName: cashier.displayName || cashier.name,
      storeId,
      billId: bill.id,
      billSerial: bill.serialNo || bill.billSerial,
      amount: bill.total || bill.grandTotal || bill.totalAmount,
      paymentMethod: paymentData.paymentType,
      details: { paymentData },
    }),
  ]);

export const logCancellation = (cashier, storeId, bill, reason) =>
  Promise.all([
    writeAuditLog({
      action: 'CASHIER_CANCEL',
      cashierId: cashier.uid,
      cashierName: cashier.displayName || cashier.name,
      storeId,
      billId: bill.id,
      billSerial: bill.serialNo || bill.billSerial,
      amount: bill.total || bill.grandTotal || bill.totalAmount,
      details: { reason },
    }),
    writeCashierAction({
      type: 'CANCEL',
      cashierId: cashier.uid,
      cashierName: cashier.displayName || cashier.name,
      storeId,
      billId: bill.id,
      billSerial: bill.serialNo || bill.billSerial,
      amount: bill.total || bill.grandTotal || bill.totalAmount,
      details: { reason },
    }),
  ]);

export const logEdit = (cashier, storeId, bill, changes) =>
  Promise.all([
    writeAuditLog({
      action: 'CASHIER_EDIT',
      cashierId: cashier.uid,
      cashierName: cashier.displayName || cashier.name,
      storeId,
      billId: bill.id,
      billSerial: bill.serialNo || bill.billSerial,
      amount: bill.total || bill.grandTotal || bill.totalAmount,
      details: { changes },
    }),
    writeCashierAction({
      type: 'EDIT',
      cashierId: cashier.uid,
      cashierName: cashier.displayName || cashier.name,
      storeId,
      billId: bill.id,
      billSerial: bill.serialNo || bill.billSerial,
      amount: bill.total || bill.grandTotal || bill.totalAmount,
      details: { changes },
    }),
  ]);

export const logQRScan = (cashier, storeId, billId, qrData, mismatch = false) =>
  writeAuditLog({
    action: mismatch ? 'QR_MISMATCH' : 'QR_SCAN_SUCCESS',
    cashierId: cashier.uid,
    cashierName: cashier.displayName || cashier.name,
    storeId,
    billId,
    details: { qrData, mismatch, deviceId: DEVICE_ID },
  });

export const logOfflinePayment = (cashier, storeId, billId, data) =>
  writeAuditLog({
    action: 'OFFLINE_PAYMENT_SAVED',
    cashierId: cashier.uid,
    cashierName: cashier.displayName || cashier.name,
    storeId,
    billId,
    amount: data.enteredAmount,
    details: { offlineData: data },
  });

// ══════════════════════════════════════════════════════════════
// ✨ COMPATIBILITY ALIASES — for new cashier components
// ══════════════════════════════════════════════════════════════

/**
 * Generic action logger (alias for writeAuditLog)
 * Used by: CashierDashboard, EditBillModal, CancelBillModal, QRScannerModal
 */
export const logCashierAction = async ({
  action,
  orderId,
  billSerial,
  userId,
  userName,
  storeId,
  amount = 0,
  paymentType = '',
  before = null,
  after = null,
  metadata = {},
}) => {
  return writeAuditLog({
    action,
    cashierId: userId,
    cashierName: userName,
    storeId,
    billId: orderId,
    billSerial,
    amount,
    details: { paymentType, before, after, ...metadata },
  });
};

/**
 * Flush queued audit logs from Dexie when back online
 * Used by: CashierDashboard (on reconnect)
 */
export const flushAuditQueue = async () => {
  try {
    const pending = await dexieDb.activity_logs_local
      .where('_pendingFirebase')
      .equals(true)
      .toArray()
      .catch(() => []);

    if (!pending || pending.length === 0) return 0;

    let synced = 0;
    for (const entry of pending) {
      try {
        // eslint-disable-next-line no-unused-vars
        const { id, _pendingFirebase, synced: _s, ...clean } = entry;
        await addDoc(collection(firebaseDb, 'auditLogs'), {
          ...clean,
          timestamp: serverTimestamp(),
          _serverCreatedAt: serverTimestamp(),
          _replayed: true,
        });
        await dexieDb.activity_logs_local.update(id, {
          synced: true,
          _pendingFirebase: false,
        });
        synced++;
      } catch (err) {
        console.warn('[flushAuditQueue] Failed entry:', err);
      }
    }
    return synced;
  } catch (err) {
    console.error('[flushAuditQueue] Error:', err);
    return 0;
  }
};

// ══════════════════════════════════════════════════════════════
// DEFAULT EXPORT
// ══════════════════════════════════════════════════════════════

export default {
  writeAuditLog,
  writeCashierAction,
  logPayment,
  logCancellation,
  logEdit,
  logQRScan,
  logOfflinePayment,
  logCashierAction,
  flushAuditQueue,
};