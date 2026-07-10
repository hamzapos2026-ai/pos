/**
 * Dual mode vs offline — separate concepts.
 * Dual mode: biller checkout at biller desk (paid at biller — cashier not involved).
 * Offline UI: cashier offline pay only.
 */

const truthy = (v) => v === true || v === 'true' || v === 1;

export const OFFLINE_CHANNEL = { CASHIER_PAY: 'cashier_pay' };

const ORDERS_CHANNEL = 'aone_pos_orders';
const BILLING_CHANNEL = 'aone_pos_billing';

/** Cross-tab fallback when BroadcastChannel is missed (same origin, other tab). */
export const INSTANT_PENDING_LS_KEY = 'aone_pos_live_pending_v1';
export const INSTANT_ORDER_EVENT = 'aone-instant-order';

const _bcSupported = typeof BroadcastChannel !== 'undefined';
let _instantPollerId = null;
let _lastLsInstantTs = 0;

const _logBc = (msg, detail) => {
  if (_bcSupported) return;
  console.warn(`[billChannel] BroadcastChannel unavailable — ${msg}`, detail || '');
};

const _postBc = (channel, payload) => {
  if (!_bcSupported) {
    _logBc('using localStorage/CustomEvent fallback');
    return false;
  }
  try {
    const ch = new BroadcastChannel(channel);
    ch.postMessage(payload);
    ch.close();
    return true;
  } catch (err) {
    console.warn('[billChannel] BroadcastChannel post failed:', err?.message);
    return false;
  }
};

/** 200ms localStorage poll when BroadcastChannel is missing (legacy browsers). */
export const startInstantOrderPoller = (onPayload) => {
  if (typeof onPayload !== 'function') return () => {};
  stopInstantOrderPoller();
  if (_bcSupported) return () => {};
  _logBc('starting 200ms localStorage poller');
  _instantPollerId = setInterval(() => {
    try {
      const raw = localStorage.getItem(INSTANT_PENDING_LS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      const ts = Number(parsed?.timestamp || 0);
      if (!ts || ts <= _lastLsInstantTs) return;
      _lastLsInstantTs = ts;
      onPayload(parsed);
    } catch (err) {
      console.warn('[billChannel] instant poller parse error:', err?.message);
    }
  }, 200);
  return stopInstantOrderPoller;
};

export const stopInstantOrderPoller = () => {
  if (_instantPollerId) {
    clearInterval(_instantPollerId);
    _instantPollerId = null;
  }
};

export const isBroadcastChannelSupported = () => _bcSupported;

// ── Instant payment broadcast from biller to cashier ──
export const notifyBillerPaymentComplete = (billSerial, amount, billerName = 'Biller') => {
  _postBc('aone_pos_billing', {
    type: 'BILLER_PAYMENT_COMPLETE',
    billSerial: String(billSerial || '').trim(),
    amount: Number(amount) || 0,
    billerName: String(billerName || 'Biller').trim(),
    timestamp: Date.now(),
  });
  try {
    window.dispatchEvent(new CustomEvent(INSTANT_ORDER_EVENT, {
      detail: {
        type: 'BILLER_PAYMENT_COMPLETE',
        billSerial: String(billSerial || '').trim(),
        amount: Number(amount) || 0,
        timestamp: Date.now(),
      },
    }));
  } catch { /* ignore */ }
};

const resolveCashierName = (order) => String(
  order?.paidByName
  || order?.cashierName
  || order?.cashierPaymentBy
  || order?.paidBy
  || 'Cashier',
).trim() || 'Cashier';

const resolveBillerName = (order) => String(
  order?.billerName
  || order?.biller?.name
  || order?.createdByName
  || 'Biller',
).trim() || 'Biller';

/** Authoritative dual-mode checkout stamp — set when biller used dual toggle. */
export const hasDualModeCheckoutStamp = (order) => {
  if (!order) return false;
  return truthy(order.wasDualModeCheckout) || truthy(order.dualModeCheckout);
};

/** Explicitly stamped as NOT dual mode at save time. */
export const isExplicitlyNotDualMode = (order) =>
  order?.wasDualModeCheckout === false && order?.dualModeCheckout === false;

/** Paid at biller desk during dual-mode checkout. */
const isPaidAtBillerDesk = (order) => {
  if (truthy(order?.billerPaidAtBiller)) return true;
  const role = String(order?.paidByRole || '').toLowerCase();
  if (role === 'biller' && (order?.paidAt || Number(order?.amountReceived) > 0)) return true;
  const paidBy = String(order?.paidBy || order?.paidByName || '').trim().toLowerCase();
  const biller = String(order?.billerId || order?.billerName || '').trim().toLowerCase();
  if (paidBy && biller && paidBy === biller && Number(order?.amountReceived) > 0) return true;
  return false;
};

const hasBillerPaymentEvidence = (order) => {
  const ps = String(order?.paymentStatus || '').toLowerCase();
  const settled = ['paid', 'cashier_paid', 'completed', 'settled', 'manager_approved'].includes(ps);
  return isPaidAtBillerDesk(order)
    || Number(order?.amountReceived) > 0
    || Number(order?.paidAmount) > 0
    || settled;
};

/** Cashier-collected bill — never dual-mode unless checkout stamp overrides. */
const isCashierCollectedBill = (order) => {
  if (!order || hasDualModeCheckoutStamp(order)) return false;
  if (order.sendToCashier === false) return false;

  const ps = String(order?.paymentStatus || '').toLowerCase();
  const st = String(order?.status || '').toLowerCase();
  if (ps === 'cashier_paid') return true;
  if (ps === 'pending_payment') return true;
  if (st === 'pending_payment' && order.sendToCashier !== false) return true;
  if (truthy(order?.wasCashierOfflinePayment) || truthy(order.cashierPaidOffline)) return true;
  if (truthy(order?.cashierPaymentBy) && !truthy(order?.billerPaidAtBiller)) return true;
  const paidRole = String(order?.paidByRole || '').toLowerCase();
  if (paidRole === 'cashier' && !truthy(order?.billerPaidAtBiller)) return true;
  return false;
};

/** @deprecated */
export const hasExplicitDualModeIntent = (order) => hasDualModeCheckoutStamp(order);

/** @deprecated */
export const hasLegacyDualModeSignals = (order) => hasDualModeCheckoutStamp(order);

/**
 * Real dual-mode bill — biller desk checkout, paid at biller (cashier not involved).
 * New bills: wasDualModeCheckout / dualModeCheckout.
 * Legacy bills: dualMode + not cashier queue + biller payment evidence.
 * Excludes manager discount approvals: dualMode + pending_approval + no payment.
 */
export const isInvoiceDualModeBill = (order) => {
  if (!order) return false;
  if (isExplicitlyNotDualMode(order)) return false;
  if (truthy(order.wasCashierOfflinePayment) || truthy(order.cashierPaidOffline)) return false;

  const ps = String(order.paymentStatus || '').toLowerCase();
  const hasBillerPay = hasBillerPaymentEvidence(order);
  const paidByCashier = String(order.paidByRole || '').toLowerCase() === 'cashier'
    || Boolean(order.cashierPaymentBy && !truthy(order.billerPaidAtBiller));
  const checkoutStamp = hasDualModeCheckoutStamp(order);

  if (paidByCashier && !checkoutStamp && !truthy(order.billerPaidAtBiller)) return false;
  if (isCashierCollectedBill(order) && !checkoutStamp && !hasBillerPay) return false;

  // New bills + rows stamped on Firebase save
  if (checkoutStamp) {
    if (order.sendToCashier === true && !hasBillerPay) return false;
    if (ps === 'pending_approval' && !hasBillerPay) return false;
    return true;
  }

  // Legacy real dual: biller used dual mode, paid at biller — not unpaid discount approval
  if (!truthy(order.dualMode)) return false;
  if (order.sendToCashier === true && !hasBillerPay) return false;
  if (ps === 'pending_approval' && !hasBillerPay) return false;
  if (!hasBillerPay && !truthy(order.billerPaidAtBiller)) return false;

  if (order.sendToCashier !== true) return true;
  if (hasBillerPay && !paidByCashier) return true;

  return false;
};

/** Merge dual-mode stamps when deduping cloud vs local copies. */
export const mergeBillChannelMetadata = (primary = {}, secondary = {}) => {
  if (!secondary || primary === secondary) return primary;
  const pickCheckout = (key) => {
    if (truthy(primary[key])) return primary[key];
    if (truthy(secondary[key])) return secondary[key];
    if (primary[key] === false) return false;
    return secondary[key];
  };
  const sendToCashier = primary.sendToCashier === false || secondary.sendToCashier === false
    ? false
    : (primary.sendToCashier ?? secondary.sendToCashier);
  const wasDual = pickCheckout('wasDualModeCheckout');
  const dualCheckout = pickCheckout('dualModeCheckout');
  return {
    ...secondary,
    ...primary,
    sendToCashier,
    wasDualModeCheckout: wasDual,
    dualModeCheckout: dualCheckout,
    dualMode: (wasDual || dualCheckout) ? true : (primary.dualMode ?? secondary.dualMode),
    cashierHandover: primary.cashierHandover ?? secondary.cashierHandover,
    billerPaidAtBiller: primary.billerPaidAtBiller ?? secondary.billerPaidAtBiller,
    wasSavedOffline: pickCheckout('wasSavedOffline'),
    savedOffline: pickCheckout('savedOffline'),
    offlineBill: pickCheckout('offlineBill'),
  };
};

/** Dual-mode bill with payment collected at biller desk (not cashier). */
export const isDualModePaidAtBiller = (order) => {
  if (!isInvoiceDualModeBill(order)) return false;
  const ps = String(order.paymentStatus || '').toLowerCase();
  const st = String(order.status || '').toLowerCase();
  if (['paid', 'cashier_paid', 'completed', 'settled', 'manager_approved'].includes(ps)) return true;
  if (truthy(order.billerPaidAtBiller)) return true;
  if (Number(order.amountReceived) > 0 && (order.paidByName || order.paidBy || order.billerName)) return true;
  if (order.paidAt && (order.paidBy || order.paidByName)) return true;
  if (order.instantPayTrusted === true) return true;
  if (['paid', 'manager_approved'].includes(st) && ps === 'paid') return true;
  return false;
};

export const isDualModePendingManager = (order) => {
  if (!isInvoiceDualModeBill(order)) return false;
  const ps = String(order.paymentStatus || '').toLowerCase();
  const st = String(order.status || '').toLowerCase();
  if (isDualModePaidAtBiller(order) && ps === 'paid') return false;
  return ps === 'pending_approval' || st === 'pending';
};

export const hasCashierOfflinePayment = (order) => {
  if (!order) return false;
  if (isInvoiceDualModeBill(order)) return false;
  if (order.wasCashierOfflinePayment === false) return false;
  if (truthy(order.wasCashierOfflinePayment)) return true;
  if (truthy(order.cashierPaidOffline)) return true;
  const hasPayEvidence = Boolean(
    order.paidAt
    || order.cashierPaidAt
    || order.paidBy
    || order.paidByName
    || order.cashierPaymentBy
    || Number(order.amountReceived) > 0,
  );
  if (truthy(order.isOffline) && hasPayEvidence) return true;
  if (order.offlineSavedAt && hasPayEvidence) return true;
  if (truthy(order.isOfflineSync) && hasPayEvidence) return true;
  if (truthy(order.offlineSyncPending) && hasPayEvidence) return true;
  return false;
};

export const hasOfflineBillOrigin = (order) => hasCashierOfflinePayment(order);
export const isAnyOfflineBillRow = (order) => hasCashierOfflinePayment(order);
export const resolveOfflineChannel = (order) =>
  (hasCashierOfflinePayment(order) ? OFFLINE_CHANNEL.CASHIER_PAY : null);

export const enrichBillChannelForDisplay = (order) => {
  if (!order) return order;
  const next = { ...order };
  if (isDualModePaidAtBiller(next) && !next.paidByName && next.billerName) {
    next.paidByName = next.billerName;
    next.paidByRole = next.paidByRole || 'biller';
  }
  if (!truthy(next.wasCashierOfflinePayment)) {
    if (truthy(next.cashierPaidOffline)) {
      next.wasCashierOfflinePayment = true;
    } else if (truthy(next.isOffline) && (next.paidAt || next.cashierPaidAt || next.paidBy || Number(next.amountReceived) > 0)) {
      next.wasCashierOfflinePayment = true;
    } else if (next.offlineSavedAt && (next.paidAt || next.cashierPaidAt || next.paidBy || Number(next.amountReceived) > 0)) {
      next.wasCashierOfflinePayment = true;
    } else if (truthy(next.isOfflineSync) && (next.paidAt || next.paidBy || Number(next.amountReceived) > 0)) {
      next.wasCashierOfflinePayment = true;
    }
  }
  next._offlineChannel = resolveOfflineChannel(next);
  next._isDualMode = isInvoiceDualModeBill(next);
  return next;
};

/**
 * Invoice/reprint — backfill legacy Firestore fields so old + new bills get correct badges.
 * Does not change admin list filters (only used on invoice normalize path).
 */
export const enrichBillChannelForInvoice = (order) => {
  if (!order) return order;
  const next = { ...order };

  if (!truthy(next.wasDualModeCheckout) && !truthy(next.dualModeCheckout)) {
    const ps = String(next.paymentStatus || '').toLowerCase();
    const paidAtBiller = hasBillerPaymentEvidence(next);
    const legacyDual = truthy(next.dualMode) && next.sendToCashier !== true;
    const legacyCheckout = legacyDual && paidAtBiller;
    if (legacyCheckout) {
      next.wasDualModeCheckout = true;
      next.dualModeCheckout = true;
    } else if (legacyDual && ps === 'paid' && !truthy(next.cashierPaymentBy)) {
      next.wasDualModeCheckout = true;
      next.dualModeCheckout = true;
    }
  }

  if (!truthy(next.wasSavedOffline)) {
    if (truthy(next.savedOffline) || truthy(next.offlineBill)) {
      next.wasSavedOffline = true;
    } else if (truthy(next.wasBillerOfflinePayment) || truthy(next.billerPaidOffline)) {
      next.wasSavedOffline = true;
    } else if (next.billOrigin === 'offline' || truthy(next.createdOffline)) {
      next.wasSavedOffline = true;
    } else {
      const syncSt = String(next.syncStatus || '').toLowerCase();
      if (truthy(next.offlinePending) && (syncSt === 'pending' || syncSt === 'syncing' || syncSt === 'failed')) {
        next.wasSavedOffline = true;
      }
    }
  }

  if (!truthy(next.wasCashierOfflinePayment)) {
    if (truthy(next.cashierPaidOffline)) {
      next.wasCashierOfflinePayment = true;
    } else if (truthy(next.isOffline) && (next.paidAt || next.cashierPaidAt || next.paidBy || Number(next.amountReceived) > 0)) {
      next.wasCashierOfflinePayment = true;
    } else if (next.offlineSavedAt && (next.paidAt || next.cashierPaidAt || next.paidBy || Number(next.amountReceived) > 0)) {
      next.wasCashierOfflinePayment = true;
    } else if (truthy(next.isOfflineSync) && (next.paidAt || next.paidBy || Number(next.amountReceived) > 0)) {
      next.wasCashierOfflinePayment = true;
    }
  }

  return enrichBillChannelForDisplay(next);
};

/** Biller saved bill while device had no internet — invoice OFFLINE BILL badge. */
export const isInvoiceBillerOfflineBill = (order) => {
  if (!order) return false;
  if (
    order.wasSavedOffline === false
    && order.savedOffline === false
    && order.offlineBill === false
    && order.offlinePending === false
    && order.wasBillerOfflinePayment === false
    && order.billOrigin !== 'offline'
  ) return false;
  if (truthy(order.wasSavedOffline)) return true;
  if (truthy(order.savedOffline) || truthy(order.offlineBill)) return true;
  if (truthy(order.wasBillerOfflinePayment) || truthy(order.billerPaidOffline)) return true;
  if (order.billOrigin === 'offline' || truthy(order.createdOffline)) return true;
  const syncSt = String(order.syncStatus || '').toLowerCase();
  if (truthy(order.offlinePending) && (syncSt === 'pending' || syncSt === 'syncing' || syncSt === 'failed')) {
    return true;
  }
  return false;
};

export const hasBillerOfflineOrigin = (order) => isInvoiceBillerOfflineBill(order);
export const hasLegacyOfflineSignals = hasBillerOfflineOrigin;
export const isOfflineCreatedBill = (order) => isInvoiceBillerOfflineBill(order);
export const hasBillerOfflinePayment = () => false;
export const isBillerOfflineSavedBill = (order) => isInvoiceBillerOfflineBill(order);
export const isInvoiceOfflineBill = (order) => isInvoiceBillerOfflineBill(order);

export const getOfflinePaidByCashierName = (order) =>
  (hasCashierOfflinePayment(order) ? resolveCashierName(order) : null);

export const getDualModePaidByBillerName = (order) =>
  (isDualModePaidAtBiller(order) ? resolveBillerName(order) : null);

export const resolveInvoiceOfflineLines = (order) => {
  if (!hasCashierOfflinePayment(order)) return [];
  const name = resolveCashierName(order);
  return [{ key: 'cashier-pay', name, role: 'cashier', kind: 'pay' }];
};

export const resolveInvoiceBadges = (order, overrides = {}) => {
  const showDualMode =
    typeof overrides.showDualMode === 'boolean'
      ? overrides.showDualMode
      : isInvoiceDualModeBill(order);
  const showOfflineBillBadge =
    typeof overrides.showOfflineBill === 'boolean'
      ? overrides.showOfflineBill
      : isInvoiceBillerOfflineBill(order);
  const showOfflinePay =
    typeof overrides.showOffline === 'boolean'
      ? overrides.showOffline
      : hasCashierOfflinePayment(order);
  return {
    showDualMode,
    showOffline: showOfflinePay,
    showOfflineBillBadge,
    offlineLines: resolveInvoiceOfflineLines(order),
    offlineChannel: hasCashierOfflinePayment(order) ? OFFLINE_CHANNEL.CASHIER_PAY : null,
    offlinePaidByCashier: hasCashierOfflinePayment(order) ? resolveCashierName(order) : null,
  };
};

/** Fields applied when biller saves a dual-mode bill — never enters cashier queue. */
export const buildDualModeOrderFields = ({
  isAutoApproved = false,
  billerPaid = false,
  billerId = '',
  billerName = '',
  amountReceived = 0,
  nowISO = new Date().toISOString(),
} = {}) => {
  const paid = billerPaid || isAutoApproved;
  return {
    sendToCashier: false,
    dualModeCheckout: true,
    wasDualModeCheckout: true,
    dualMode: true,
    cashierHandover: false,
    billerPaidAtBiller: paid,
    status: paid ? (isAutoApproved ? 'approved' : 'pending') : 'pending',
    paymentStatus: paid
      ? (isAutoApproved ? 'paid' : 'pending_approval')
      : 'pending_approval',
    isActiveOrder: !paid,
    ...(paid && {
      amountReceived: amountReceived || null,
      paidAmount: amountReceived || null,
      paidAt: nowISO,
      paidBy: billerId || null,
      paidByName: billerName || null,
      paidByRole: 'biller',
    }),
  };
};

/** Normal cashier-queue bill — explicit NOT dual stamps. */
export const buildNormalCashierQueueFields = ({ isAutoApproved = false } = {}) => ({
  sendToCashier: true,
  paymentStatus: 'pending_payment',
  status: isAutoApproved ? 'approved' : 'pending',
  cashierHandover: false,
  dualMode: false,
  dualModeCheckout: false,
  wasDualModeCheckout: false,
  billerPaidAtBiller: false,
});

/** Ensure biller checkout payload always passes cashier queue filters. */
export const normalizeInstantCashierOrder = (raw) => {
  if (!raw) return null;
  const approved = String(raw.status || '').toLowerCase() === 'approved';
  const queue = buildNormalCashierQueueFields({ isAutoApproved: approved });
  const merged = { ...queue, ...raw };
  return {
    ...merged,
    id: merged.id || merged.localId || merged.firebaseId,
    localId: merged.localId || merged.id,
    billSerial: merged.billSerial || merged.serialNo,
    serialNo: merged.serialNo || merged.billSerial,
    storeId: merged.storeId || merged.branchId,
    branchId: merged.branchId || merged.storeId,
    grandTotal: merged.grandTotal ?? merged.totalAmount ?? merged.total,
    totalAmount: merged.totalAmount ?? merged.grandTotal ?? merged.total,
    isLocalOnly: merged.isLocalOnly ?? (!merged.firebaseId && merged.syncStatus !== 'synced'),
    offlinePending: merged.offlinePending ?? (merged.syncStatus === 'pending' || !merged.firebaseId),
    sendToCashier: merged.sendToCashier !== false,
    paymentStatus: merged.paymentStatus || queue.paymentStatus,
    status: merged.status || queue.status,
    isActiveOrder: merged.isActiveOrder !== false,
    isDeleted: false,
    dualMode: merged.dualMode === true,
    dualModeCheckout: merged.dualModeCheckout === true,
    wasDualModeCheckout: merged.wasDualModeCheckout === true,
  };
};

/** Minimal row for cashier list — full bill stays in Dexie / background save. */
export const buildInstantListPayload = (normalized) => ({
  localId: normalized.localId,
  id: normalized.id || normalized.localId,
  billSerial: normalized.billSerial,
  serialNo: normalized.serialNo,
  storeId: normalized.storeId,
  branchId: normalized.branchId,
  customer: {
    name: normalized.customer?.name || 'Walk-in',
    phone: normalized.customer?.phone || '',
  },
  totalAmount: normalized.totalAmount,
  grandTotal: normalized.grandTotal,
  itemCount: normalized.itemCount ?? normalized.items?.length ?? 0,
  billerName: normalized.billerName,
  paymentStatus: normalized.paymentStatus,
  status: normalized.status,
  sendToCashier: normalized.sendToCashier !== false,
  isLocalOnly: normalized.isLocalOnly,
  syncStatus: normalized.syncStatus,
  createdAt: normalized.createdAt,
  savedAt: normalized.savedAt,
  isActiveOrder: normalized.isActiveOrder !== false,
  isDeleted: false,
});

/** Biller checkout → cashier pending queue (same PC tab + other tabs + billing channel). */
export const broadcastCashierInstantOrder = (order) => {
  if (!order) return;
  const normalized = normalizeInstantCashierOrder(order);
  if (!normalized) return;
  const listOrder = buildInstantListPayload(normalized);
  const payload = {
    type: 'NEW_LOCAL_ORDER',
    order: listOrder,
    localId: normalized.localId || normalized.id,
    billSerial: normalized.billSerial || normalized.serialNo,
    serialNo: normalized.serialNo || normalized.billSerial,
    storeId: normalized.storeId || normalized.branchId,
    total: normalized.totalAmount ?? normalized.grandTotal,
    timestamp: Date.now(),
  };
  _postBc(ORDERS_CHANNEL, payload);
  _postBc(BILLING_CHANNEL, { ...payload, type: 'CASHIER_NEW_PENDING' });
  try {
    localStorage.setItem(INSTANT_PENDING_LS_KEY, JSON.stringify(payload));
  } catch (err) {
    console.warn('[billChannel] localStorage instant pending write failed:', err?.message);
  }
  try {
    window.dispatchEvent(new CustomEvent(INSTANT_ORDER_EVENT, { detail: payload }));
  } catch (err) {
    console.warn('[billChannel] CustomEvent dispatch failed:', err?.message);
  }
};

/** Patch sync fields after Firestore save — no full list re-broadcast. */
export const broadcastOrderSyncedPatch = ({
  localId,
  billSerial,
  firebaseId = null,
  syncStatus = 'synced',
} = {}) => {
  const serial = String(billSerial || '').trim();
  if (!serial && !localId) return;
  const payload = {
    type: 'ORDER_SYNCED',
    localId,
    billSerial: serial,
    serialNo: serial,
    firebaseId: firebaseId || null,
    syncStatus: syncStatus || 'synced',
    synced: syncStatus === 'synced',
    timestamp: Date.now(),
  };
  _postBc(ORDERS_CHANNEL, payload);
  _postBc(BILLING_CHANNEL, payload);
};

export const buildBillChannelPatch = ({
  online = true,
  dualModeCheckout = false,
  billerPaidOffline = false,
} = {}) => ({
  wasSavedOffline: !online,
  wasDualModeCheckout: Boolean(dualModeCheckout),
  wasBillerOfflinePayment: Boolean(billerPaidOffline),
  wasCashierOfflinePayment: false,
  savedOffline: !online,
  offlineBill: !online,
  offlinePending: !online,
  dualModeCheckout: Boolean(dualModeCheckout),
  dualMode: Boolean(dualModeCheckout),
  billerPaidOffline: Boolean(billerPaidOffline),
  ...(dualModeCheckout
    ? {}
    : {
      wasDualModeCheckout: false,
      dualModeCheckout: false,
      dualMode: false,
    }),
});

export const buildCashierOfflinePaymentPatch = () => ({
  wasCashierOfflinePayment: true,
  wasBillerOfflinePayment: false,
  isOfflineSync: true,
  cashierPaidOffline: true,
});
