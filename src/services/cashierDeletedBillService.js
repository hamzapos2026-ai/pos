// Cashier deleted-bills — instant local + live Firestore, acknowledge & flag

import {
  collection, query, where, onSnapshot, getDocs, doc, updateDoc, addDoc,
  serverTimestamp, limit,
} from 'firebase/firestore';
import { db } from './firebase';
import { COLLECTION_NAMES } from '../utils/constants';
import { BROADCAST_CHANNELS } from '../config/channelConfig';
import {
  getDeletedBillsForStores,
  patchDeletedBillLocal,
  syncDeletedBills,
} from './deletedBillsService';
import {
  resolveDeletedBillSerial,
  resolveDeletedBillReason,
  resolveDeletedCashierName,
  resolveDeletedBillDate,
  isCashierDeletedBillRecord,
} from '../utils/deletedBillDisplayUtils';

const parseTs = (v) => {
  if (!v) return 0;
  if (v?.toDate) return v.toDate().getTime();
  if (typeof v === 'object' && typeof v.seconds === 'number') return v.seconds * 1000;
  const ms = new Date(v).getTime();
  return Number.isFinite(ms) ? ms : 0;
};

const isFirestoreDocId = (id) =>
  typeof id === 'string' && id.length > 10 && !/^\d+$/.test(id);

const normalizeDeletedRecord = (raw, docId) => {
  const firestoreId = docId || raw.firestoreId || (isFirestoreDocId(raw.id) ? raw.id : null);
  return {
    ...raw,
    id: firestoreId || raw.localId || raw.id,
    firestoreId,
    localId: raw.localId ?? (typeof raw.id === 'number' ? raw.id : null),
    billSerial: raw.billSerial || raw.serialNo || '—',
    totalAmount: Number(raw.totalAmount || raw.grandTotal || 0),
    deletedAtMs: parseTs(raw.deletedAt || raw.timestamp),
    isDeletedBillRecord: true,
  };
};

const mergeDeletedLists = (lists) => {
  const map = new Map();
  lists.flat().forEach((r) => {
    const norm = normalizeDeletedRecord(r, r.firestoreId || (isFirestoreDocId(r.id) ? r.id : null));
    const key = `${norm.billSerial}_${norm.deletedAtMs || norm.firestoreId || norm.localId || norm.id}`;
    const prev = map.get(key);
    if (!prev || (norm.firestoreId && !prev.firestoreId) || (norm.deletedAtMs || 0) > (prev.deletedAtMs || 0)) {
      map.set(key, norm);
    }
  });
  return Array.from(map.values()).sort((a, b) => (b.deletedAtMs || 0) - (a.deletedAtMs || 0));
};

/** @deprecated Realtime listener removed — use getDeletedBillsForStores on demand. */
export const subscribeCashierDeletedBills = (storeIds, onData) => {
  const ids = [...new Set((storeIds || []).filter(Boolean).map(String))].slice(0, 10);
  if (!ids.length) {
    onData?.([]);
    return () => {};
  }
  void getDeletedBillsForStores(ids, 100)
    .then((rows) => onData?.(rows || []))
    .catch(() => onData?.([]));
  return () => {};
};

export const acknowledgeDeletedBill = async ({
  deletedBillId,
  firestoreId,
  localId,
  cashierId,
  cashierName,
  storeId,
}) => {
  const patch = {
    cashierAcknowledged: true,
    cashierAcknowledgedAt: new Date().toISOString(),
    cashierAcknowledgedBy: cashierId || '',
    cashierAcknowledgedByName: cashierName || 'Cashier',
    cashierAckStoreId: storeId || '',
  };

  const docId = firestoreId || (isFirestoreDocId(deletedBillId) ? deletedBillId : null);
  if (docId && db) {
    await updateDoc(doc(db, COLLECTION_NAMES.deletedBills, docId), {
      ...patch,
      cashierAcknowledgedAt: serverTimestamp(),
    });
  }

  const localKey = localId ?? (typeof deletedBillId === 'number' ? deletedBillId : null);
  if (localKey != null) {
    await patchDeletedBillLocal(localKey, patch);
  }

  return true;
};

export const flagDeletedBillForSuperadmin = async ({
  deletedBillId,
  firestoreId,
  localId,
  billSerial,
  storeId,
  cashierId,
  cashierName,
  reason,
  billData = {},
}) => {
  if (!reason?.trim() || !db) throw new Error('Flag reason required');

  const payload = {
    type: 'cashier_deleted_flag',
    title: `Cashier flagged deleted bill #${billSerial}`,
    message: `${cashierName || 'Cashier'} flagged deleted bill #${billSerial}. Reason: ${reason.trim()}`,
    billSerial: billSerial || '—',
    deletedBillId: firestoreId || deletedBillId || null,
    storeId: storeId || '',
    flaggedBy: cashierId || '',
    flaggedByName: cashierName || 'Cashier',
    flagReason: reason.trim(),
    flaggedAt: serverTimestamp(),
    status: 'pending',
    read: false,
    audience: ['superadmin', 'manager', 'cashier'],
    billSnapshot: {
      customer: billData.customer?.name || billData.customerName || 'Walk-in',
      totalAmount: Number(billData.totalAmount || 0),
      billerName: billData.billerName || '—',
      deleteReason: billData.reason || billData.deleteReason || '—',
    },
  };

  const docId = firestoreId || (isFirestoreDocId(deletedBillId) ? deletedBillId : null);
  const flagPatch = {
    cashierFlagged: true,
    cashierFlagReason: reason.trim(),
    cashierFlaggedAt: new Date().toISOString(),
    cashierFlaggedBy: cashierId || '',
    cashierFlaggedByName: cashierName || 'Cashier',
  };

  if (docId) {
    await updateDoc(doc(db, COLLECTION_NAMES.deletedBills, docId), {
      ...flagPatch,
      cashierFlaggedAt: serverTimestamp(),
    }).catch(() => {});
  }

  const localKey = localId ?? (typeof deletedBillId === 'number' ? deletedBillId : null);
  if (localKey != null) {
    await patchDeletedBillLocal(localKey, flagPatch);
  }

  const notifRef = await addDoc(collection(db, COLLECTION_NAMES.notifications), payload);
  return notifRef.id;
};

export const fetchCashierDeletedFlags = async () => {
  if (!db) return [];
  const q = query(
    collection(db, COLLECTION_NAMES.notifications),
    where('type', 'in', ['cashier_deleted_flag', 'cashier_cancel_flag']),
    limit(100),
  );
  const snap = await getDocs(q);
  const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  rows.sort((a, b) => parseTs(b.flaggedAt) - parseTs(a.flaggedAt));
  return rows;
};

export const subscribeCashierDeletedFlags = (onData, onError) => {
  if (!db) {
    onData?.([]);
    return () => {};
  }
  const q = query(
    collection(db, COLLECTION_NAMES.notifications),
    where('type', 'in', ['cashier_deleted_flag', 'cashier_cancel_flag']),
    limit(100),
  );
  return onSnapshot(
    q,
    (snap) => {
      const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      rows.sort((a, b) => parseTs(b.flaggedAt) - parseTs(a.flaggedAt));
      onData?.(rows);
    },
    (err) => {
      console.warn('[subscribeCashierDeletedFlags]', err);
      onError?.(err);
      onData?.([]);
    },
  );
};

export const dismissCashierFlag = async (notificationId) => {
  if (!notificationId || !db) return;
  await updateDoc(doc(db, COLLECTION_NAMES.notifications, notificationId), {
    status: 'reviewed',
    read: true,
    reviewedAt: serverTimestamp(),
  });
};

/** Acknowledge cashier-cancelled order (orders collection) */
export const acknowledgeCancelledBill = async ({
  orderId,
  cashierId,
  cashierName,
  storeId,
}) => {
  if (!orderId || !db) throw new Error('Order id required');
  const patch = {
    cashierCancelAcknowledged: true,
    cashierCancelAcknowledgedAt: serverTimestamp(),
    cashierCancelAcknowledgedBy: cashierId || '',
    cashierCancelAcknowledgedByName: cashierName || 'Cashier',
    cashierCancelAckStoreId: storeId || '',
  };
  await updateDoc(doc(db, COLLECTION_NAMES.orders, orderId), patch);
  return true;
};

/** Flag cashier-cancelled order for super admin / manager */
export const flagCancelledBillForSuperadmin = async ({
  orderId,
  billSerial,
  storeId,
  cashierId,
  cashierName,
  reason,
  billData = {},
}) => {
  if (!reason?.trim() || !db) throw new Error('Flag reason required');
  const serial = billSerial || billData.billSerial || billData.serialNo || '—';
  const cancelReason = billData.cashierCancelReason || billData.cancelReason || '—';

  const payload = {
    type: 'cashier_cancel_flag',
    title: `Cashier flagged cancelled bill #${serial}`,
    message: `${cashierName || 'Cashier'} flagged cancelled bill #${serial}. Reason: ${reason.trim()}`,
    billSerial: serial,
    orderId: orderId || null,
    storeId: storeId || '',
    flaggedBy: cashierId || '',
    flaggedByName: cashierName || 'Cashier',
    flagReason: reason.trim(),
    flaggedAt: serverTimestamp(),
    status: 'pending',
    read: false,
    audience: ['superadmin', 'manager', 'cashier'],
    billSnapshot: {
      customer: billData.customer?.name || billData.customerName || 'Walk-in',
      totalAmount: Number(billData.totalAmount || billData.grandTotal || 0),
      billerName: billData.billerName || '—',
      cancelReason,
      cancelledBy: billData.cancelledByName || billData.cashierCancelledBy || '—',
    },
  };

  if (orderId) {
    await updateDoc(doc(db, COLLECTION_NAMES.orders, orderId), {
      cashierCancelFlagged: true,
      cashierCancelFlagReason: reason.trim(),
      cashierCancelFlaggedAt: serverTimestamp(),
      cashierCancelFlaggedBy: cashierId || '',
      cashierCancelFlaggedByName: cashierName || 'Cashier',
    }).catch(() => {});
  }

  const notifRef = await addDoc(collection(db, COLLECTION_NAMES.notifications), payload);
  return notifRef.id;
};

/** Map deletedBills record → cashier row shape — cashier deletes only */
export const mapDeletedBillToOrderRow = (bill) => {
  if (!bill || !isCashierDeletedBillRecord(bill)) return null;

  const serial = resolveDeletedBillSerial(bill);
  const reason = resolveDeletedBillReason(bill);
  const cashierName = resolveDeletedCashierName(bill);
  if (!serial || !reason) return null;

  const deletedBy = bill.deletedBy || 'cashier';

  return {
    ...bill,
    id: bill.firestoreId || bill.localId || bill.id,
    firestoreId: bill.firestoreId || null,
    localId: bill.localId ?? (typeof bill.id === 'number' ? bill.id : null),
    billSerial: serial,
    serialNo: serial,
    status: 'deleted',
    isDeletedBillRecord: true,
    customer: bill.customer || { name: bill.customerName || 'Walk-in' },
    items: bill.items || [],
    itemCount: bill.itemCount || bill.items?.length || 0,
    totalAmount: Number(bill.totalAmount || bill.grandTotal || 0),
    billerName: String(bill.billerName || '').trim() || '—',
    deletedBy,
    deletedByName: cashierName,
    displayCashierName: cashierName || '—',
    displayReason: reason,
    displayDeletedAt: resolveDeletedBillDate(bill),
    cancelReason: reason,
    createdAt: resolveDeletedBillDate(bill),
    savedAt: resolveDeletedBillDate(bill),
    deletedAt: resolveDeletedBillDate(bill),
  };
};
