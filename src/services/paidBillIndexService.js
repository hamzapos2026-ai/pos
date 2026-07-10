/**
 * Cross-device paid bill index — Firebase is source of truth.
 * New PWA / Chromebook / Google profile must never show bills already paid on any device.
 */

import {
  collection, query, where, getDocs, getDoc, doc, updateDoc, setDoc, serverTimestamp, limit, arrayUnion, arrayRemove, onSnapshot,
} from 'firebase/firestore';
import { db as firestore } from './firebase';
import { getHasInternet } from '../utils/networkReachability';
import { buildCashierPaymentPatch, isCashierCollected, isCashierOrderCancelled } from '../utils/cashierOrderUtils';
import { getBillSerialKey, normalizeSerial } from '../utils/serialMatch';
import { dedupeBillsBySerial } from '../utils/billsFilterUtils';
import { getOrderDisplayTotal } from '../utils/invoiceUtils';
import {
  RECONCILE_COOLDOWN_MS,
  HEAVY_HEAL_COOLDOWN_MS,
  PAID_INDEX_PENDING_LIMIT,
  PAID_INDEX_HEAL_SCAN_LIMIT,
  PAID_INDEX_DEDUPE_SCAN_LIMIT,
  PAID_INDEX_ACTIONS_LIMIT,
  PAID_INDEX_PAYMENTS_LIMIT,
  PAID_INDEX_LEGACY_PAYMENTS_LIMIT,
  PAID_INDEX_LEGACY_ACTIONS_LIMIT,
  PAID_INDEX_LEGACY_ACTIONS_GLOBAL_LIMIT,
} from '../utils/firebaseQuotaConfig';

const _norm = (v) => String(v || '').trim().toUpperCase();

const paidKeysDocRef = (storeId) => doc(firestore, 'stores', storeId, 'meta', 'cashierPaidKeys');

let _paidKeysPushWarned = false;

/** Batch-write paid index into shared Firestore doc (cross-device / Netlify). */
export const syncPaidKeysDocFromIndex = async (storeId, paidIndex) => {
  if (!getHasInternet() || !firestore || !storeId || !paidIndex) return;
  const serials = [...(paidIndex.serials || [])].filter(Boolean).slice(0, 500);
  const billIds = [...(paidIndex.billIds || [])].filter(Boolean).slice(0, 500);
  if (!serials.length && !billIds.length) return;
  const payload = { updatedAt: serverTimestamp() };
  if (serials.length) payload.serials = arrayUnion(...serials);
  if (billIds.length) payload.billIds = arrayUnion(...billIds);
  try {
    await setDoc(paidKeysDocRef(storeId), payload, { merge: true });
  } catch (err) {
    console.warn('[paidBillIndex] sync paid-keys doc failed:', err?.message);
  }
};

/** Shared Firestore paid-keys — all cashier devices (Netlify/PWA) read same list. */
export const pushCloudPaidBillKeys = async ({ serial, billId, storeId } = {}) => {
  if (!getHasInternet() || !firestore || !storeId) return;
  const s = getBillSerialKey({ billSerial: serial }) || _norm(serial).replace(/^#+/, '');
  const id = String(billId || '').trim();
  const payload = { updatedAt: serverTimestamp() };
  if (s) payload.serials = arrayUnion(s);
  if (id) payload.billIds = arrayUnion(id);
  try {
    await setDoc(paidKeysDocRef(storeId), payload, { merge: true });
  } catch (err) {
    if (!_paidKeysPushWarned) {
      _paidKeysPushWarned = true;
      console.warn('[paidBillIndex] cloud paid-keys push failed (deploy firestore.rules):', err?.message);
    }
  }
};

const _fetchCloudPaidKeysDoc = async (storeId) => {
  const serials = new Set();
  const billIds = new Set();
  if (!getHasInternet() || !firestore || !storeId) return { serials, billIds };
  try {
    const snap = await getDoc(paidKeysDocRef(storeId));
    if (!snap.exists()) return { serials, billIds };
    const data = snap.data();
    (data.serials || []).forEach((s) => {
      const key = getBillSerialKey({ billSerial: s }) || _norm(s).replace(/^#+/, '');
      if (key) serials.add(key);
    });
    (data.billIds || []).forEach((id) => {
      const trimmed = String(id || '').trim();
      if (trimmed) billIds.add(trimmed);
    });
  } catch { /* ignore */ }
  return { serials, billIds };
};

const OPTIMISTIC_PAID_LS = 'aone_optimistic_paid_v1';

/** Persist paid serial locally — survives Firestore listener refresh until cloud catches up. */
export const loadOptimisticPaidBillKeys = () => {
  const serials = new Set();
  const billIds = new Set();
  try {
    const raw = localStorage.getItem(OPTIMISTIC_PAID_LS);
    if (!raw) return { serials, billIds };
    const parsed = JSON.parse(raw);
    (parsed.serials || []).forEach((s) => {
      const key = getBillSerialKey({ billSerial: s }) || _norm(s).replace(/^#+/, '');
      if (key) serials.add(key);
    });
    (parsed.billIds || []).forEach((id) => billIds.add(String(id).trim()));
  } catch { /* ignore */ }
  return { serials, billIds };
};

export const recordOptimisticPaidBill = ({ serial, billId, storeId } = {}) => {
  const prev = loadOptimisticPaidBillKeys();
  const serials = new Set(prev.serials);
  const billIds = new Set(prev.billIds);
  const s = getBillSerialKey({ billSerial: serial }) || _norm(serial).replace(/^#+/, '');
  const id = String(billId || '').trim();
  if (s) serials.add(s);
  if (id) billIds.add(id);
  try {
    localStorage.setItem(OPTIMISTIC_PAID_LS, JSON.stringify({
      serials: [...serials],
      billIds: [...billIds],
      storeId: storeId || '',
      at: Date.now(),
    }));
  } catch { /* ignore */ }
  if (storeId) _saveSessionPaidKeys(storeId, { serials, billIds });
  if (storeId) pushCloudPaidBillKeys({ serial: s, billId: id, storeId }).catch(() => {});
  return { serials, billIds };
};

/** Direct Firebase mark-paid — trusted instant pay from cashier pending list (skips reconciliation). */
export const applyTrustedInstantPaymentToCloud = async ({
  order, cashierId, cashierName, storeId,
}) => {
  if (!getHasInternet() || !firestore || !order) return { success: false, offline: true };

  const amount = getOrderDisplayTotal(order);
  const serial = getBillSerialKey(order) || order.billSerial || order.serialNo || '';
  const patch = buildCashierPaymentPatch({
    amount,
    paymentType: order.paymentType || order.paymentMethod || 'Cash',
    cashierId: cashierId || order.cashierId || '',
    cashierName: cashierName || order.cashierName || 'Cashier',
  });

  const writePaid = async (docId) => {
    await updateDoc(doc(firestore, 'orders', docId), {
      ...patch,
      paidAt: serverTimestamp(),
      cashierPaidAt: serverTimestamp(),
      isActiveOrder: false,
      offlineSyncPending: false,
      instantPayTrusted: true,
      trustedPayAt: serverTimestamp(),
    });
    recordOptimisticPaidBill({ serial, billId: docId, storeId });
    return { success: true, billId: docId, serial, amount };
  };

  const billId = String(order.id || order.firebaseId || '').trim();
  if (billId && !billId.startsWith('local_')) {
    try {
      return await writePaid(billId);
    } catch (err) {
      console.warn('[paidBillIndex] trusted instant pay by id failed:', billId, err?.message);
    }
  }

  if (!serial) return { success: false, error: 'no_serial' };

  const serialCandidates = [...new Set([
    serial,
    String(order.billSerial || '').trim().toUpperCase().replace(/^#+/, ''),
    String(order.serialNo || '').trim().toUpperCase().replace(/^#+/, ''),
  ].filter(Boolean))];

  for (const field of ['billSerial', 'serialNo']) {
    for (const val of serialCandidates) {
      try {
        const snap = await getDocs(query(
          collection(firestore, 'orders'),
          where(field, '==', val),
          limit(8),
        ));
        for (const d of snap.docs) {
          const data = d.data();
          if (storeId && data.storeId && data.storeId !== storeId) continue;
          if (isCashierCollected(data)) {
            recordOptimisticPaidBill({ serial, billId: d.id, storeId });
            return { success: true, billId: d.id, serial, amount, alreadyPaid: true };
          }
          try {
            return await writePaid(d.id);
          } catch (innerErr) {
            console.warn('[paidBillIndex] trusted instant pay by serial failed:', d.id, innerErr?.message);
          }
        }
      } catch { /* index may be missing */ }
    }
  }

  return { success: false, error: 'bill_not_found' };
};

export const mergePaidBillKeys = (...indexes) => {
  const serials = new Set();
  const billIds = new Set();
  for (const idx of indexes) {
    if (!idx) continue;
    if (idx.serials?.forEach) idx.serials.forEach((s) => serials.add(s));
    if (idx.billIds?.forEach) idx.billIds.forEach((id) => billIds.add(id));
  }
  return { serials, billIds };
};

const _addPaymentRow = (p, serials, billIds) => {
  const serial = getBillSerialKey(p) || _norm(p.billSerial).replace(/^#+/, '');
  const billId = String(p.billId || '').trim();
  if (serial) serials.add(serial);
  if (billId) billIds.add(billId);
};

const _addOrderRow = (o, serials, billIds) => {
  const serial = getBillSerialKey(o);
  const billId = String(o.id || o.firebaseId || o.localId || o.orderId || '').trim();
  if (serial) serials.add(serial);
  if (billId) billIds.add(billId);
};

const PAID_CASHIER_ACTION_TYPES = new Set([
  'PAID',
  'PAYMENT_RECEIVED',
  'PAID_OFFLINE_SYNC',
  'OFFLINE_PAYMENT_SYNCED',
  'PAYMENT',
  'CASHIER_PAYMENT',
  'INSTANT_PAY',
]);

const _isPaidCashierAction = (data) => {
  const t = String(data?.actionType || data?.action || data?.type || '').toUpperCase();
  if (PAID_CASHIER_ACTION_TYPES.has(t)) return true;
  if (t.includes('PAID') && !t.includes('UNPAID') && !t.includes('UN_PAID')) return true;
  return false;
};

const _addCashierActionRow = (data, serials, billIds) => {
  if (!_isPaidCashierAction(data)) return;
  const serial = getBillSerialKey(data);
  const billId = String(data.orderId || data.billId || data.localId || '').trim();
  if (serial) serials.add(serial);
  if (billId) billIds.add(billId);
  // Also index bare serial from action payload (cross-device PWA)
  const rawSerial = String(data.billSerial || data.serialNo || '').trim().toUpperCase().replace(/^#+/, '');
  if (rawSerial) serials.add(rawSerial);
};

const _ingestCashierActions = (docs, serials, billIds, storeId) => {
  docs.forEach((d) => {
    const data = typeof d.data === 'function' ? d.data() : d;
    if (storeId && data.storeId && data.storeId !== storeId) return;
    _addCashierActionRow(data, serials, billIds);
  });
};

const _sessionKey = (storeId) => `aone_paid_keys_${storeId}`;

const _loadSessionPaidKeys = (storeId) => {
  try {
    const raw = sessionStorage.getItem(_sessionKey(storeId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return {
      serials: new Set(parsed.serials || []),
      billIds: new Set(parsed.billIds || []),
    };
  } catch {
    return null;
  }
};

const _saveSessionPaidKeys = (storeId, index) => {
  try {
    sessionStorage.setItem(_sessionKey(storeId), JSON.stringify({
      serials: [...(index.serials || [])],
      billIds: [...(index.billIds || [])],
      at: Date.now(),
    }));
  } catch { /* ignore */ }
};

const _ingestOrderDoc = (d, serials, billIds, storeId) => {
  const data = typeof d.data === 'function' ? d.data() : d;
  const id = d.id || data.id;
  const sid = data.storeId || data.branchId;
  if (storeId && sid && sid !== storeId) return;
  const ps = String(data.paymentStatus || '').toLowerCase();
  if (ps === 'pending_payment' || ps === 'pending_approval') return;
  if (isCashierCollected(data)) _addOrderRow({ id, ...data }, serials, billIds);
};

/** Active pending serials — never treat these as paid in shared index. */
const _fetchActivePendingSerials = async (storeId) => {
  const pending = new Set();
  if (!getHasInternet() || !firestore || !storeId) return pending;
  const queries = [
    () => query(collection(firestore, 'orders'), where('storeId', '==', storeId), where('paymentStatus', '==', 'pending_payment'), limit(PAID_INDEX_PENDING_LIMIT)),
  ];
  for (const buildQ of queries) {
    try {
      const snap = await getDocs(buildQ());
      snap.docs.forEach((d) => {
        const data = d.data();
        if (String(data.paymentStatus || '').toLowerCase() !== 'pending_payment') return;
        const key = getBillSerialKey({ id: d.id, ...data });
        if (key) pending.add(key);
      });
    } catch { /* ignore */ }
  }
  return pending;
};

/** Remove wrongly-indexed serials still pending on Firebase (fixes ghost hides). */
export const scrubStalePaidKeysDoc = async (storeId) => {
  if (!getHasInternet() || !firestore || !storeId) return { removed: 0 };
  const activePending = await _fetchActivePendingSerials(storeId);
  if (!activePending.size) return { removed: 0 };
  const shared = await _fetchCloudPaidKeysDoc(storeId);
  const stale = [...shared.serials].filter((s) => activePending.has(s));
  if (!stale.length) return { removed: 0 };
  try {
    await updateDoc(paidKeysDocRef(storeId), {
      serials: arrayRemove(...stale),
      updatedAt: serverTimestamp(),
    });
    console.log(`[paidBillIndex] 🧹 Removed ${stale.length} stale paid-key(s) from cloud`);
    return { removed: stale.length };
  } catch (err) {
    console.warn('[paidBillIndex] scrub paid-keys failed:', err?.message);
    return { removed: 0 };
  }
};

/** Drop optimistic local paid keys for bills still pending on Firebase. */
export const scrubStaleOptimisticPaidBillKeys = async (storeId) => {
  const prev = loadOptimisticPaidBillKeys();
  if (!prev.serials.size && !prev.billIds.size) return { removed: 0 };

  // Never scrub keys recorded in the last 2 minutes (rapid multi-pay / cloud lag)
  try {
    const raw = localStorage.getItem(OPTIMISTIC_PAID_LS);
    const parsedAt = raw ? Number(JSON.parse(raw).at || 0) : 0;
    if (parsedAt && Date.now() - parsedAt < 120000) return { removed: 0 };
  } catch { /* ignore */ }

  const activePending = await _fetchActivePendingSerials(storeId);
  if (!activePending.size) return { removed: 0 };

  const { getOfflinePaidBillKeys } = await import('./offlinePaymentService');
  const offlinePaid = await getOfflinePaidBillKeys().catch(() => ({ serials: new Set(), billIds: new Set() }));

  const serials = new Set([...prev.serials].filter((s) => {
    if (!activePending.has(s)) return true;
    if (offlinePaid.serials?.has(s)) return true;
    return false;
  }));
  const billIds = new Set(prev.billIds);
  const removed = prev.serials.size - serials.size;
  if (removed <= 0) return { removed: 0 };
  try {
    localStorage.setItem(OPTIMISTIC_PAID_LS, JSON.stringify({
      serials: [...serials],
      billIds: [...billIds],
      storeId: storeId || '',
      at: Date.now(),
    }));
    console.log(`[paidBillIndex] 🧹 Cleared ${removed} stale optimistic paid-key(s)`);
  } catch { /* ignore */ }
  return { removed };
};

/** Fast cross-profile paid index — meta doc + payments + recent cashierActions (~3 reads). */
export const fetchCloudPaidBillKeysFast = async (storeId) => {
  const serials = new Set();
  const billIds = new Set();
  if (!getHasInternet() || !firestore || !storeId) {
    return _loadSessionPaidKeys(storeId) || { serials, billIds };
  }

  const shared = await _fetchCloudPaidKeysDoc(storeId);
  shared.serials.forEach((s) => serials.add(s));
  shared.billIds.forEach((id) => billIds.add(id));

  const paymentQueries = [
    () => query(collection(firestore, 'payments'), where('storeId', '==', storeId), limit(PAID_INDEX_PAYMENTS_LIMIT)),
    () => query(collection(firestore, 'payments'), where('branchId', '==', storeId), limit(PAID_INDEX_PAYMENTS_LIMIT)),
  ];
  for (const buildQ of paymentQueries) {
    try {
      const snap = await getDocs(buildQ());
      snap.docs.forEach((d) => _addPaymentRow(d.data(), serials, billIds));
    } catch { /* ignore */ }
  }

  try {
    const snap = await getDocs(query(
      collection(firestore, 'cashierActions'),
      where('storeId', '==', storeId),
      limit(PAID_INDEX_ACTIONS_LIMIT),
    ));
    _ingestCashierActions(snap.docs, serials, billIds, storeId);
  } catch { /* ignore */ }

  const result = { serials, billIds };
  if (serials.size || billIds.size) _saveSessionPaidKeys(storeId, result);
  return result;
};

/** Full cloud paid index — background reconcile only (slow on large shops). */
export const fetchCloudPaidBillKeys = async (storeId) => {
  const serials = new Set();
  const billIds = new Set();
  if (!getHasInternet() || !firestore || !storeId) {
    return _loadSessionPaidKeys(storeId) || { serials, billIds };
  }

  const fast = await fetchCloudPaidBillKeysFast(storeId);
  fast.serials.forEach((s) => serials.add(s));
  fast.billIds.forEach((id) => billIds.add(id));

  const paymentQueries = [
    () => query(collection(firestore, 'payments'), where('storeId', '==', storeId), limit(PAID_INDEX_PAYMENTS_LIMIT)),
    () => query(collection(firestore, 'payments'), where('branchId', '==', storeId), limit(PAID_INDEX_PAYMENTS_LIMIT)),
  ];

  for (const buildQ of paymentQueries) {
    try {
      const snap = await getDocs(buildQ());
      snap.docs.forEach((d) => _addPaymentRow(d.data(), serials, billIds));
    } catch { /* index may be missing */ }
  }

  const orderPaymentStatuses = ['cashier_paid', 'paid'];
  for (const ps of orderPaymentStatuses) {
    try {
      const snap = await getDocs(query(
        collection(firestore, 'orders'),
        where('storeId', '==', storeId),
        where('paymentStatus', '==', ps),
        limit(400),
      ));
      snap.docs.forEach((d) => _ingestOrderDoc(d, serials, billIds, storeId));
    } catch { /* non-critical */ }
  }

  const orderStatuses = ['cashier_paid', 'paid', 'manager_approved'];
  for (const st of orderStatuses) {
    try {
      const snap = await getDocs(query(
        collection(firestore, 'orders'),
        where('storeId', '==', storeId),
        where('status', '==', st),
        limit(400),
      ));
      snap.docs.forEach((d) => _ingestOrderDoc(d, serials, billIds, storeId));
    } catch { /* non-critical */ }
  }

  // Broad fallback — no composite index required (Netlify / PWA safe)
  try {
    const snap = await getDocs(query(
      collection(firestore, 'orders'),
      where('storeId', '==', storeId),
      limit(PAID_INDEX_HEAL_SCAN_LIMIT),
    ));
    snap.docs.forEach((d) => _ingestOrderDoc(d, serials, billIds, storeId));
  } catch { /* non-critical */ }

  try {
    const snap = await getDocs(query(
      collection(firestore, 'orders'),
      where('storeId', '==', storeId),
      where('instantPayTrusted', '==', true),
      limit(400),
    ));
    snap.docs.forEach((d) => _ingestOrderDoc(d, serials, billIds, storeId));
  } catch { /* index may be missing */ }

  try {
    const snap = await getDocs(query(
      collection(firestore, 'payments'),
      limit(PAID_INDEX_LEGACY_PAYMENTS_LIMIT),
    ));
    snap.docs.forEach((d) => {
      const p = d.data();
      const sid = p.storeId || p.branchId;
      if (sid && sid !== storeId) return;
      _addPaymentRow(p, serials, billIds);
    });
  } catch { /* non-critical */ }

  // cashierActions PAID — order doc may still be pending_payment (EditBill / local pay)
  try {
    const snap = await getDocs(query(
      collection(firestore, 'cashierActions'),
      where('storeId', '==', storeId),
      limit(PAID_INDEX_LEGACY_ACTIONS_LIMIT),
    ));
    _ingestCashierActions(snap.docs, serials, billIds, storeId);
  } catch { /* index may be missing */ }

  try {
    const snap = await getDocs(query(
      collection(firestore, 'cashierActions'),
      limit(PAID_INDEX_LEGACY_ACTIONS_GLOBAL_LIMIT),
    ));
    _ingestCashierActions(snap.docs, serials, billIds, storeId);
  } catch { /* non-critical */ }

  const result = { serials, billIds };
  if (serials.size || billIds.size) _saveSessionPaidKeys(storeId, result);
  return result;
};

/** Local IDB payments + Firebase payments/orders — authoritative hide list for cashier UI. */
export const getAllPaidBillKeys = async (storeId, { full = false } = {}) => {
  const { getOfflinePaidBillKeys } = await import('./offlinePaymentService');
  const optimistic = loadOptimisticPaidBillKeys();
  const fetchCloud = full ? fetchCloudPaidBillKeys : fetchCloudPaidBillKeysFast;
  const [local, cloud] = await Promise.all([
    getOfflinePaidBillKeys().catch(() => ({ serials: new Set(), billIds: new Set() })),
    fetchCloud(storeId).catch(() => ({ serials: new Set(), billIds: new Set() })),
  ]);
  return mergePaidBillKeys(optimistic, local, cloud);
};

const _orderMatchesPaidIndex = (order, index) => {
  if (!order || !index) return false;
  const serial = getBillSerialKey(order);
  if (serial && index.serials?.has(serial)) return true;
  const ids = [
    order.id,
    order.localId,
    order.firebaseId,
    order.orderId,
  ].map((v) => String(v || '').trim()).filter(Boolean);
  for (const id of ids) {
    if (index.billIds?.has(id)) return true;
  }
  return false;
};

/**
 * Fix orders where status=paid but paymentStatus still pending_payment.
 * Removes them from Firebase pending_payment listener (Netlify + all devices).
 */
export const healInconsistentPaidOrdersOnCloud = async (storeId) => {
  if (!getHasInternet() || !firestore || !storeId) return { healed: 0 };

  let healed = 0;
  try {
    const snap = await getDocs(query(
      collection(firestore, 'orders'),
      where('storeId', '==', storeId),
      limit(PAID_INDEX_HEAL_SCAN_LIMIT),
    ));

    for (const d of snap.docs) {
      const data = d.data();
      if (data?.isDeleted || isCashierOrderCancelled(data)) continue;

      const st = String(data.status || '').toLowerCase();
      const ps = String(data.paymentStatus || '').toLowerCase();
      const stuckPending = ps === 'pending_payment' || ps === 'pending_approval';
      const clearlyPaid = ['paid', 'cashier_paid', 'manager_approved', 'completed', 'settled'].includes(st)
        || (data.paidAt && data.isActiveOrder === false && (data.paidBy || Number(data.amountReceived) > 0));

      if (!stuckPending || !clearlyPaid) continue;

      const amount = Number(data.grandTotal || data.totalAmount || data.amountReceived || 0);
      try {
        await updateDoc(doc(firestore, 'orders', d.id), {
          ...buildCashierPaymentPatch({
            amount,
            paymentType: data.paymentType || data.paymentMethod || 'Cash',
            cashierId: data.paidBy || data.cashierId || '',
            cashierName: data.paidByName || data.cashierName || 'Cashier',
          }),
          isActiveOrder: false,
          offlineSyncPending: false,
          healedInconsistentPaid: true,
          healedAt: serverTimestamp(),
        });
        healed += 1;
      } catch (err) {
        console.warn('[paidBillIndex] inconsistent heal skip', d.id, err?.message);
      }
    }

    if (healed > 0) {
      console.log(`[paidBillIndex] ✅ Fixed ${healed} order(s) with status=paid but paymentStatus=pending`);
    }
  } catch (err) {
    console.warn('[paidBillIndex] inconsistent heal failed:', err?.message);
  }
  return { healed };
};

/**
 * Heal orders from cashierActions PAID logs (e.g. EditBill paid but order still pending).
 */
export const healOrdersFromCashierActions = async (storeId) => {
  if (!getHasInternet() || !firestore || !storeId) return { healed: 0 };

  let actionsSnap;
  try {
    actionsSnap = await getDocs(query(
      collection(firestore, 'cashierActions'),
      where('storeId', '==', storeId),
      limit(PAID_INDEX_ACTIONS_LIMIT),
    ));
  } catch {
    try {
      actionsSnap = await getDocs(query(
        collection(firestore, 'cashierActions'),
        where('storeId', '==', storeId),
        limit(PAID_INDEX_ACTIONS_LIMIT),
      ));
    } catch {
      return { healed: 0 };
    }
  }

  const paidBySerial = new Map();
  actionsSnap.docs.forEach((d) => {
    const data = d.data();
    if (!_isPaidCashierAction(data)) return;
    if (data.storeId && data.storeId !== storeId) return;
    const serial = getBillSerialKey(data);
    if (!serial) return;
    const prev = paidBySerial.get(serial);
    if (!prev) {
      paidBySerial.set(serial, data);
      return;
    }
    const prevTs = prev.timestamp?.seconds || 0;
    const nextTs = data.timestamp?.seconds || 0;
    if (nextTs >= prevTs) paidBySerial.set(serial, data);
  });

  if (!paidBySerial.size) return { healed: 0 };

  let healed = 0;
  const updatedIds = new Set();

  for (const [serial, action] of paidBySerial) {
    const candidates = new Map();

    for (const field of ['billSerial', 'serialNo']) {
      for (const val of [serial, action.billSerial, action.serialNo].filter(Boolean)) {
        try {
          const snap = await getDocs(query(
            collection(firestore, 'orders'),
            where(field, '==', val),
            limit(15),
          ));
          snap.docs.forEach((od) => {
            if (od.data()?.storeId && od.data().storeId !== storeId) return;
            candidates.set(od.id, { id: od.id, ...od.data() });
          });
        } catch { /* non-critical */ }
      }
    }

    if (action.orderId) {
      const orderId = String(action.orderId).trim();
      try {
        const directSnap = await getDoc(doc(firestore, 'orders', orderId));
        if (directSnap.exists()) {
          candidates.set(directSnap.id, { id: directSnap.id, ...directSnap.data() });
        }
      } catch { /* ignore */ }
      try {
        const direct = await getDocs(query(
          collection(firestore, 'orders'),
          where('localId', '==', orderId),
          limit(5),
        ));
        direct.docs.forEach((od) => candidates.set(od.id, { id: od.id, ...od.data() }));
      } catch { /* ignore */ }
    }

    const amount = Number(
      action.totalAmount || action.amount || action.enteredAmount || 0,
    );
    const patch = {
      ...buildCashierPaymentPatch({
        amount: amount || 0,
        paymentType: action.paymentType || action.paymentMethod || 'Cash',
        cashierId: action.cashierId || '',
        cashierName: action.cashierName || 'Cashier',
      }),
      paidAt: serverTimestamp(),
      cashierPaidAt: serverTimestamp(),
      isActiveOrder: false,
      offlineSyncPending: false,
      healedFromCashierAction: true,
      healedAt: serverTimestamp(),
    };

    for (const [docId, data] of candidates) {
      if (updatedIds.has(docId)) continue;
      if (isCashierCollected(data)) continue;
      try {
        await updateDoc(doc(firestore, 'orders', docId), patch);
        updatedIds.add(docId);
        healed += 1;
      } catch (err) {
        console.warn('[paidBillIndex] cashierAction heal skip', docId, err?.message);
      }
    }
  }

  if (healed > 0) {
    console.log(`[paidBillIndex] ✅ Healed ${healed} order(s) from cashierActions PAID`);
  }
  return { healed };
};

/**
 * Fix Firebase orders stuck on pending_payment while a payment record already exists.
 * Runs on cashier login / reconnect so every device stops seeing ghost pending bills.
 */
export const healStalePendingOrdersOnCloud = async (storeId) => {
  if (!getHasInternet() || !firestore || !storeId) return { healed: 0 };

  const { getOfflinePaidBillKeys } = await import('./offlinePaymentService');
  const paidIndex = mergePaidBillKeys(
    loadOptimisticPaidBillKeys(),
    await getOfflinePaidBillKeys().catch(() => ({ serials: new Set(), billIds: new Set() })),
    await fetchCloudPaidBillKeysFast(storeId).catch(() => ({ serials: new Set(), billIds: new Set() })),
  );
  if (!paidIndex.serials.size && !paidIndex.billIds.size) return { healed: 0 };

  let healed = 0;
  const pendingQueries = [
    () => query(collection(firestore, 'orders'), where('storeId', '==', storeId), where('paymentStatus', '==', 'pending_payment'), limit(PAID_INDEX_PENDING_LIMIT)),
  ];

  const seen = new Set();
  for (const buildQ of pendingQueries) {
    let snap;
    try {
      snap = await getDocs(buildQ());
    } catch {
      continue;
    }

    for (const d of snap.docs) {
      if (seen.has(d.id)) continue;
      seen.add(d.id);

      const data = d.data();
      if (isCashierCollected(data)) continue;
      if (!_orderMatchesPaidIndex({ id: d.id, ...data }, paidIndex)) continue;

      const amount = Number(data.grandTotal || data.totalAmount || data.total || 0);
      try {
        await updateDoc(doc(firestore, 'orders', d.id), {
          ...buildCashierPaymentPatch({
            amount,
            paymentType: data.paymentType || 'Cash',
            cashierId: data.paidBy || data.cashierId || '',
            cashierName: data.paidByName || data.cashierName || 'Cashier',
          }),
          paidAt: serverTimestamp(),
          cashierPaidAt: serverTimestamp(),
          isActiveOrder: false,
          offlineSyncPending: false,
          healedFromStalePending: true,
          healedAt: serverTimestamp(),
        });
        healed += 1;
      } catch (err) {
        console.warn('[paidBillIndex] heal skip', d.id, err?.message);
      }
    }
  }

  if (healed > 0) {
    console.log(`[paidBillIndex] ✅ Healed ${healed} stale pending bill(s) on Firebase`);
  }
  return { healed };
};

/** Keep one Dexie row per serial — delete local duplicates (same serial, different localId). */
export const purgeDuplicateSerialsFromDexie = async (storeId) => {
  try {
    const { db, ensureDbReady, initDatabase } = await import('../db/index');
    await ensureDbReady();
    const all = await db.orders.toArray();
    const groups = new Map();

    for (const o of all) {
      if (storeId && o.storeId && o.storeId !== storeId) continue;
      const key = getBillSerialKey(o);
      if (!key) continue;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(o);
    }

    let removed = 0;
    for (const [, rows] of groups) {
      if (rows.length < 2) continue;
      const ranked = dedupeBillsBySerial(rows);
      const keeper = ranked[0];
      const keeperKey = keeper?.localId || keeper?.id;
      for (const row of rows) {
        const rowKey = row.localId || row.id;
        if (!rowKey || rowKey === keeperKey) continue;
        try {
          await db.orders.where('localId').equals(rowKey).delete();
          removed += 1;
        } catch {
          try {
            await db.orders.delete(rowKey);
            removed += 1;
          } catch { /* skip */ }
        }
      }
    }
    return { removed };
  } catch (err) {
    if (err?.name === 'DatabaseClosedError' || err?.name === 'UpgradeError') {
      try {
        const { initDatabase } = await import('../db/index');
        await initDatabase();
        return purgeDuplicateSerialsFromDexie(storeId);
      } catch { /* ignore */ }
    }
    return { removed: 0 };
  }
};

/** Remove collected/cancelled bills from Dexie once Firebase confirms payment. */
export const purgePaidBillsFromDexie = async (storeId, paidIndex = null) => {
  try {
    const { db, ensureDbReady, initDatabase } = await import('../db/index');
    const { isCashierOrderCancelled } = await import('../utils/cashierOrderUtils');
    await ensureDbReady();

    const index = paidIndex || (storeId ? await getAllPaidBillKeys(storeId, { full: true }) : null);
    const all = await db.orders.toArray();
    let removed = 0;

    for (const o of all) {
      if (storeId && o.storeId && o.storeId !== storeId) continue;

      const collected = isCashierCollected(o);
      const cancelled = isCashierOrderCancelled(o);
      const onCloud = Boolean(o.firebaseId || o.syncStatus === 'synced');
      const inPaidIndex = index && _orderMatchesPaidIndex(o, index);

      if (!collected && !cancelled && !inPaidIndex) continue;
      if (!onCloud && !inPaidIndex && collected && o.offlineSyncPending) continue;

      const key = o.localId || o.id;
      if (!key) continue;
      try {
        await db.orders.where('localId').equals(key).delete();
        removed += 1;
      } catch {
        try {
          await db.orders.delete(key);
          removed += 1;
        } catch { /* skip */ }
      }
    }

    if (removed > 0) {
      console.log(`[paidBillIndex] 🗑️ Purged ${removed} paid/cancelled bill(s) from local Dexie`);
    }
    return { removed };
  } catch (err) {
    if (err?.name === 'DatabaseClosedError' || err?.name === 'UpgradeError') {
      try {
        const { initDatabase } = await import('../db/index');
        await initDatabase();
        return purgePaidBillsFromDexie(storeId, paidIndex);
      } catch { /* ignore */ }
    }
    console.warn('[paidBillIndex] purge failed:', err?.message);
    return { removed: 0 };
  }
};

let _reconcileInflight = null;
let _reconcileLastAt = 0;
let _heavyHealLastAt = 0;

/**
 * Cancel duplicate Firebase orders that share the same bill serial (keeps best copy).
 * Fixes ghost duplicates in cashier queue from multi-PC offline collisions.
 */
export const dedupeDuplicateSerialOrdersOnCloud = async (storeId) => {
  if (!getHasInternet() || !firestore || !storeId) return { cancelled: 0 };

  let cancelled = 0;
  try {
    const snap = await getDocs(query(
      collection(firestore, 'orders'),
      where('storeId', '==', storeId),
      limit(PAID_INDEX_DEDUPE_SCAN_LIMIT),
    ));

    const groups = new Map();
    snap.docs.forEach((d) => {
      const data = d.data();
      if (data?.isDeleted || data?.deleted || isCashierOrderCancelled(data)) return;
      const key = getBillSerialKey({ ...data, id: d.id });
      if (!key) return;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push({ id: d.id, ...data });
    });

    for (const [, rows] of groups) {
      if (rows.length < 2) continue;
      const ranked = dedupeBillsBySerial(rows);
      const keeper = ranked[0];
      if (!keeper?.id) continue;

      for (const row of rows) {
        if (row.id === keeper.id) continue;
        try {
          await updateDoc(doc(firestore, 'orders', row.id), {
            status: 'cancelled',
            paymentStatus: 'cancelled',
            isActiveOrder: false,
            isDeleted: true,
            duplicateOf: keeper.id,
            duplicateSerial: getBillSerialKey(row),
            cancelledReason: 'duplicate_serial_auto',
            cancelledAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          cancelled += 1;
        } catch (err) {
          console.warn('[paidBillIndex] dedupe cancel skip', row.id, err?.message);
        }
      }
    }

    if (cancelled > 0) {
      console.log(`[paidBillIndex] 🧹 Cancelled ${cancelled} duplicate serial bill(s)`);
    }
  } catch (err) {
    console.warn('[paidBillIndex] dedupe cloud failed:', err?.message);
  }
  return { cancelled };
};

/** Full cross-device cleanup — call on login, reconnect, and after payment sync. */
export const reconcilePaidBillsAcrossDevices = async (storeId, { force = false } = {}) => {
  if (!storeId) return { healed: 0, removed: 0, paidIndex: { serials: new Set(), billIds: new Set() } };

  const now = Date.now();
  if (!force && _reconcileInflight) return _reconcileInflight;
  if (!force && now - _reconcileLastAt < RECONCILE_COOLDOWN_MS) {
    const cached = _loadSessionPaidKeys(storeId);
    if (cached) return { paidIndex: cached, healed: 0, removed: 0, cached: true };
  }

  const runHeavyHeal = force || (now - _heavyHealLastAt >= HEAVY_HEAL_COOLDOWN_MS);

  _reconcileInflight = (async () => {
    try {
      if (runHeavyHeal) {
        await dedupeDuplicateSerialOrdersOnCloud(storeId).catch(() => ({ cancelled: 0 }));
        await healInconsistentPaidOrdersOnCloud(storeId).catch(() => ({ healed: 0 }));
        _heavyHealLastAt = Date.now();
      }
      await healOrdersFromCashierActions(storeId).catch(() => ({ healed: 0 }));
      const { healed } = await healStalePendingOrdersOnCloud(storeId).catch(() => ({ healed: 0 }));
      const paidIndex = await getAllPaidBillKeys(storeId, { full: false }).catch(() => ({ serials: new Set(), billIds: new Set() }));
      const { removed: dupRemoved } = await purgeDuplicateSerialsFromDexie(storeId).catch(() => ({ removed: 0 }));
      const { removed } = await purgePaidBillsFromDexie(storeId, paidIndex).catch(() => ({ removed: 0 }));
      if (dupRemoved > 0) console.log(`[paidBillIndex] 🗑️ Removed ${dupRemoved} local duplicate serial row(s)`);
      _reconcileLastAt = Date.now();
      return { paidIndex, removed, healed, dupRemoved };
    } finally {
      _reconcileInflight = null;
    }
  })();

  return _reconcileInflight;
};

/** Reconcile + build paid index for cashier branch aliases (Netlify / new browser). */
export const reconcileCashierBranch = async (storeIds, { force = true } = {}) => {
  const unique = [...new Set((storeIds || []).filter(Boolean))].slice(0, 8);
  let lastIndex = { serials: new Set(), billIds: new Set() };
  let healed = 0;

  for (const sid of unique) {
    try {
      await scrubStalePaidKeysDoc(sid);
      await scrubStaleOptimisticPaidBillKeys(sid);
    } catch { /* ignore */ }
  }

  for (const sid of unique) {
    try {
      const result = await reconcilePaidBillsAcrossDevices(sid, { force: force && sid === unique[0] });
      if (result?.paidIndex) lastIndex = mergePaidBillKeys(lastIndex, result.paidIndex);
      healed += Number(result?.healed || 0);
    } catch { /* ignore */ }
  }

  const cloudParts = await Promise.all(
    unique.map((id) => fetchCloudPaidBillKeysFast(id).catch(() => ({ serials: new Set(), billIds: new Set() }))),
  );
  for (const part of cloudParts) lastIndex = mergePaidBillKeys(lastIndex, part);

  const { getOfflinePaidBillKeys } = await import('./offlinePaymentService');
  lastIndex = mergePaidBillKeys(
    lastIndex,
    loadOptimisticPaidBillKeys(),
    await getOfflinePaidBillKeys().catch(() => ({ serials: new Set(), billIds: new Set() })),
  );

  return { paidIndex: lastIndex, healed };
};

/** Live cross-device paid-keys — Netlify strips bills as soon as any PC pays. */
export const subscribeCloudPaidBillKeys = (storeId, onUpdate) => {
  if (!firestore || !storeId || typeof onUpdate !== 'function') return () => {};
  try {
    return onSnapshot(
      paidKeysDocRef(storeId),
      async (snap) => {
        if (!snap.exists()) return;
        const data = snap.data();
        const serials = new Set();
        const billIds = new Set();
        (data.serials || []).forEach((s) => {
          const key = getBillSerialKey({ billSerial: s }) || _norm(s).replace(/^#+/, '');
          if (key) serials.add(key);
        });
        (data.billIds || []).forEach((id) => {
          const trimmed = String(id || '').trim();
          if (trimmed) billIds.add(trimmed);
        });
        if (!serials.size && !billIds.size) return;
        onUpdate({ serials, billIds });
      },
      (err) => console.warn('[paidBillIndex] paid-keys listener:', err?.message),
    );
  } catch {
    return () => {};
  }
};

/** True when bill serial/id is in the paid index — hide from cashier queue everywhere. */
export const isBillInPaidIndex = (order, index) => _orderMatchesPaidIndex(order, index);

/** Trim oversized paid-keys doc — keeps arrays under Firestore 1MB limit. */
export const trimPaidKeysDocIfOversized = async (storeId, { maxKeys = 2500, warnBytes = 800_000 } = {}) => {
  if (!getHasInternet() || !firestore || !storeId) return { trimmed: false };
  try {
    const snap = await getDoc(paidKeysDocRef(storeId));
    if (!snap.exists()) return { trimmed: false };
    const data = snap.data();
    const serials = [...(data.serials || [])];
    const billIds = [...(data.billIds || [])];
    const approxBytes = JSON.stringify({ serials, billIds }).length;
    if (approxBytes < warnBytes && serials.length <= maxKeys && billIds.length <= maxKeys) {
      return { trimmed: false, approxBytes };
    }
    const nextSerials = serials.slice(-maxKeys);
    const nextBillIds = billIds.slice(-maxKeys);
    await setDoc(paidKeysDocRef(storeId), {
      serials: nextSerials,
      billIds: nextBillIds,
      trimmedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }, { merge: true });
    if (approxBytes >= warnBytes) {
      console.warn(`[paidBillIndex] paid-keys doc ~${approxBytes} bytes — trimmed to ${maxKeys} keys`);
    }
    return { trimmed: true, approxBytes, kept: nextSerials.length };
  } catch (err) {
    console.warn('[paidBillIndex] trim paid-keys failed:', err?.message);
    return { trimmed: false, error: err?.message };
  }
};

export default {
  mergePaidBillKeys,
  fetchCloudPaidBillKeys,
  fetchCloudPaidBillKeysFast,
  getAllPaidBillKeys,
  pushCloudPaidBillKeys,
  syncPaidKeysDocFromIndex,
  subscribeCloudPaidBillKeys,
  scrubStalePaidKeysDoc,
  scrubStaleOptimisticPaidBillKeys,
  healStalePendingOrdersOnCloud,
  healInconsistentPaidOrdersOnCloud,
  healOrdersFromCashierActions,
  dedupeDuplicateSerialOrdersOnCloud,
  purgeDuplicateSerialsFromDexie,
  purgePaidBillsFromDexie,
  applyTrustedInstantPaymentToCloud,
  recordOptimisticPaidBill,
  loadOptimisticPaidBillKeys,
  reconcilePaidBillsAcrossDevices,
  reconcileCashierBranch,
  trimPaidKeysDocIfOversized,
};
