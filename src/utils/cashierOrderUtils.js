import { getBillSerialKey } from './serialMatch';
import { isOrderInOptimisticCancelledIndex } from './cashierCancelledIndex';
import {
  isInvoiceDualModeBill,
  isDualModePaidAtBiller as isDualModePaidAtBillerChannel,
} from './billChannelUtils';

/** Bill created via biller dual-mode checkout (manager / paid-at-biller). */
export const isDualModeBill = isInvoiceDualModeBill;
export const CASHIER_PAYMENT_STATUS = 'cashier_paid';
export const BILLER_PENDING_PAYMENT_STATUS = 'pending_payment';
export const BILLER_PENDING_APPROVAL_STATUS = 'pending_approval';

/** New bill from biller — always set status + paymentStatus together */
export const buildBillerSubmitPatch = ({ approved = true } = {}) => (
  approved
    ? {
        status: 'approved',
        paymentStatus: BILLER_PENDING_PAYMENT_STATUS,
        isActiveOrder: true,
        sendToCashier: true,
      }
    : {
        status: 'pending',
        paymentStatus: BILLER_PENDING_APPROVAL_STATUS,
        isActiveOrder: true,
        sendToCashier: true,
      }
);

/** Admin restore / reset — back to cashier queue (not legacy "unpaid") */
export const buildRestorePendingPatch = ({ total = 0, approved = true } = {}) => ({
  ...(approved ? buildBillerSubmitPatch({ approved: true }) : buildBillerSubmitPatch({ approved: false })),
  paidAmount: 0,
  outstandingAmount: Number(total) || 0,
  amountReceived: 0,
  paidAt: null,
  paidBy: null,
  paidByName: null,
  cashierHandover: false,
  managerConfirmed: false,
  isDeleted: false,
  deleted: false,
});

export const buildCashierPaymentPatch = ({
  amount = 0,
  paymentType = 'Cash',
  cashierId = '',
  cashierName = '',
  nowISO = new Date().toISOString(),
} = {}) => ({
  status: CASHIER_PAYMENT_STATUS,
  paymentStatus: CASHIER_PAYMENT_STATUS,
  managerConfirmed: false,
  paymentType,
  paidAt: nowISO,
  cashierPaidAt: nowISO,
  paidBy: cashierId,
  paidByName: cashierName,
  billEndTime: nowISO,
  amountReceived: amount,
  paidAmount: amount,
  changeGiven: 0,
  cashierHandover: true,
  isActiveOrder: false,
});

/** Manager / super admin settles bill (direct paid or confirm) */
export const buildSettlePatch = ({
  userId = '',
  userName = '',
  role = 'manager',
  amount = 0,
  keepCashierPaidBy = false,
} = {}) => {
  const now = new Date().toISOString();
  const normalizedRole = String(role || 'manager').toLowerCase();
  const patch = {
    status: 'manager_approved',
    paymentStatus: 'paid',
    managerConfirmed: true,
    managerConfirmedAt: now,
    managerConfirmedBy: userId,
    managerConfirmedByName: userName,
    settledBy: userId,
    settledByName: userName,
    settledByRole: normalizedRole,
    paidAmount: amount,
    outstandingAmount: 0,
    isActiveOrder: false,
    paidAt: now,
  };
  if (!keepCashierPaidBy) {
    patch.paidBy = userId;
    patch.paidByName = userName;
    patch.paidByRole = normalizedRole;
  } else {
    patch.confirmedBy = userId;
    patch.confirmedByName = userName;
    patch.confirmedByRole = normalizedRole;
  }
  return patch;
};

/** @deprecated use buildSettlePatch */
export const buildManagerConfirmPatch = ({ managerId = '', managerName = '', amount = 0 } = {}) =>
  buildSettlePatch({ userId: managerId, userName: managerName, role: 'manager', amount, keepCashierPaidBy: true });

// Shared cashier / manager bill status helpers

/** True when this bill serial/id already has a saved offline payment record. */
export const isOrderInOfflinePaidIndex = (order, index) => {
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

/** Dual-mode bill already paid at biller — never in cashier queue. */
export const isDualModePaidAtBiller = (o) => {
  if (isDualModePaidAtBillerChannel(o)) return true;
  return false;
};

/** True when bill is still in the cashier unpaid queue on Firebase. */
export const isStillCashierQueuePending = (o) => {
  if (!o) return false;
  if (o.isDeleted || o.deleted) return false;
  if (isDualModeBill(o)) return false;
  if (o.sendToCashier === false) return false;
  if (isDualModePaidAtBiller(o)) return false;
  const ps = String(o.paymentStatus || '').toLowerCase();
  const st = String(o.status || '').toLowerCase();
  if (o.instantPayTrusted === true || o.cashierPaymentReceived === true) return false;
  if (o.paidAt && (o.paidBy || o.paidByName || Number(o.amountReceived) > 0)) return false;
  if (['paid', 'cashier_paid', 'completed', 'settled', 'manager_approved'].includes(ps)) return false;
  if (['paid', 'cashier_paid', 'completed', 'settled', 'manager_approved'].includes(st)) return false;
  // Manager approval queue — not cashier
  if (ps === 'pending_approval') return false;
  if (ps === 'pending_payment') return true;
  if (st === 'approved' || st === 'pending') return o.isActiveOrder !== false;
  return false;
};

/** True when serial/id is in the cross-device paid index (instant pay / offline payment). */
const isInPaidIndex = (o, offlinePaidIndex) =>
  Boolean(offlinePaidIndex && isOrderInOfflinePaidIndex(o, offlinePaidIndex));

/** Cashier collected payment — bill leaves cashier pending queue */
export const isCashierCollected = (o) => {
  if (!o) return true;
  if (isStillCashierQueuePending(o)) return false;
  if (o.instantPayTrusted === true) return true;
  if (o.offlineSyncPending === true) return true;
  if (o.cashierPaymentReceived === true) return true;

  const status = String(o.status || '').toLowerCase();
  const paymentStatus = String(o.paymentStatus || '').toLowerCase();

  // Paid status wins — fixes stale paymentStatus:pending_payment + status:paid (EditBill bug)
  if (['paid', 'completed', 'settled', 'cashier_paid', 'manager_approved'].includes(status)) {
    return true;
  }
  if (paymentStatus === 'paid' || paymentStatus === 'cashier_paid') return true;

  // Collected: paidAt + inactive + handover fields (even if paymentStatus stuck on pending_payment)
  if (
    o.paidAt
    && o.isActiveOrder === false
    && (o.paidBy || o.paidByName || Number(o.amountReceived) > 0 || o.cashierHandover === true)
  ) {
    return true;
  }

  // Still in cashier queue — unpaid only
  if (paymentStatus === 'pending_payment' || paymentStatus === 'pending_approval') return false;
  if (status === 'approved' && paymentStatus !== 'paid' && paymentStatus !== 'cashier_paid') {
    return false;
  }

  return false;
};

/** @alias — cashier dashboard hides collected bills */
export const isCashierOrderPaid = (o, offlinePaidIndex = null) => {
  // Paid index wins over stale Firebase pending_payment (instant pay / rapid multi-pay)
  if (isInPaidIndex(o, offlinePaidIndex)) return true;
  if (isStillCashierQueuePending(o)) return false;
  if (isCashierCollected(o)) return true;
  return false;
};

/** Strict unpaid cashier bill — pending_payment only (manager / dual paid hidden). */
export const isCashierUnpaidBill = (o) => {
  if (!o || o.isDeleted || o.deleted) return false;
  if (isDualModeBill(o)) return false;
  if (o.sendToCashier === false) return false;
  if (isCashierOrderCancelled(o)) return false;
  if (isDualModePaidAtBiller(o)) return false;
  const ps = String(o.paymentStatus || '').toLowerCase();
  if (ps === 'pending_approval') return false;
  return ps === 'pending_payment';
};

/** Hide from cashier list — paid/cancelled/healed never in pending queue. */
export const shouldHideFromCashierQueue = (order, paidIndex = null) => {
  if (!order) return true;
  if (isOrderInOptimisticCancelledIndex(order)) {
    // Keep cashier-cancelled rows visible in Cancelled tab until Ack/Flag
    if (
      isCashierOrderCancelled(order)
      && !order?.cashierCancelAcknowledged
      && !order?.cashierCancelFlagged
    ) {
      return false;
    }
    return true;
  }
  if (isDualModeBill(order)) return true;
  if (isCashierOrderCancelled(order)) return false;
  // Instant pay: hide immediately even while Firebase still shows pending_payment
  if (isInPaidIndex(order, paidIndex)) return true;
  if (isCashierUnpaidBill(order)) return false;
  if (isStillCashierQueuePending(order)) return false;
  if (isCashierOrderPaid(order, paidIndex)) return true;
  return true;
};

export const filterCashierQueueOrders = (list, paidIndex = null) =>
  (list || []).filter((o) => !shouldHideFromCashierQueue(o, paidIndex));

/** Manager sales reports — revenue from collected payments (cashier_paid, paid, settled). */
export const isReportPaidBill = (o) => {
  if (!o || o.isDeleted || o.deleted) return false;
  if (isCashierOrderCancelled(o)) return false;
  return isCashierCollected(o);
};

/** Manager fully confirmed / settled — bill leaves manager pending queue */
export const isManagerSettled = (o) => {
  if (!o) return false;
  if (o.managerConfirmed === true) return true;
  const status = String(o.status || '').toLowerCase();
  if (status === 'manager_approved') return true;
  if (o.managerPaid === true) return true;
  const ps = String(o.paymentStatus || '').toLowerCase();
  const role = String(o.paidByRole || o.settledByRole || '').toLowerCase();
  if (o.managerConfirmed === true && ps === 'paid') return true;
  if (ps === 'paid' && (role === 'superadmin' || role === 'super_admin' || role === 'admin' || role === 'manager')) {
    return true;
  }
  // Direct manager/admin mark paid (legacy — no paidBy)
  if (status === 'paid' && ps === 'paid' && !o.paidBy) {
    return true;
  }
  return false;
};

/** Cashier paid — manager still needs to confirm */
export const isCashierPaidPendingManager = (o) => {
  if (!isCashierCollected(o)) return false;
  return !isManagerSettled(o);
};

const CANCELLED_STATUSES = new Set([
  'cancelled',
  'pending_cancel',
  'manager_cancelled',
  'cancel_pending',
]);

export const isCashierOrderCancelled = (o) => {
  if (!o) return false;
  const status = String(o.status || '').toLowerCase();
  const paymentStatus = String(o.paymentStatus || '').toLowerCase();
  if (CANCELLED_STATUSES.has(status)) return true;
  if (paymentStatus === 'cancelled' || paymentStatus === 'cancel_pending') return true;
  if (o.isArchived === true) return true;
  return false;
};

/** Cashier UI status — pending | paid | cancelled (search, list, view modal). */
export const getCashierEffectiveStatus = (o, offlinePaidIndex = null) => {
  try {
    if (!o) return 'pending';
    if (isCashierOrderPaid(o, offlinePaidIndex)) return 'paid';
    if (isCashierOrderCancelled(o)) return 'cancelled';
    if (o.status === 'approved') return 'pending';
    return 'pending';
  } catch {
    return o?.status || 'pending';
  }
};

/** Patch applied when cashier instantly cancels a bill. */
export const buildCashierCancelPatch = ({
  reason = '',
  userId = '',
  userName = '',
  role = 'cashier',
  nowISO = new Date().toISOString(),
} = {}) => ({
  status: 'cancelled',
  paymentStatus: 'cancelled',
  isDeleted: false,
  isActiveOrder: false,
  isArchived: false,
  cancelReason: reason,
  cashierCancelReason: reason,
  cancelledBy: userName,
  cancelledByName: userName,
  cancelledByRole: role,
  cancelledByUserId: userId,
  cashierCancelledBy: userName,
  cashierCancelledUserId: userId,
  cancelledAt: nowISO,
  cashierCancelledAt: nowISO,
});

/** Unpaid bills only — for Dexie merge / local pending (excludes collected + cancelled). */
export const isCashierPendingBill = (o) => {
  if (!o) return false;
  if (isOrderInOptimisticCancelledIndex(o)) return false;
  if (o.isDeleted || o.deleted) return false;
  if (isDualModeBill(o)) return false;
  if (o.sendToCashier === false) return false;
  if (isCashierCollected(o)) return false;
  if (isCashierOrderCancelled(o)) return false;
  return true;
};

/** Biller Recent Orders — hide collected bills from Top 5. */
export const isRecentOrderVisible = (o) => {
  if (!o || o.isDeleted) return false;
  if (isCashierCollected(o)) return false;
  if (isCashierOrderCancelled(o)) return false;
  return true;
};

/** Biller Top 5 — show all recent bills (including cashier-paid) for offline/online parity. */
export const isBillerRecentOrderVisible = (o) => {
  if (!o || o.isDeleted || o.deleted) return false;
  if (isCashierOrderCancelled(o)) return false;
  return true;
};

/** Same bills as Cashier dashboard pending queue — dual mode never included. */
export const matchesCashierPendingQueue = (b) => {
  if (!b || isBillDeletedLocal(b)) return false;
  if (isOrderInOptimisticCancelledIndex(b)) return false;
  if (isCashierOrderCancelled(b)) return false;
  if (isManagerSettled(b)) return false;
  if (isCashierPaidPendingManager(b)) return false;
  if (isCashierCollected(b)) return false;
  if (isDualModeBill(b)) return false;
  if (isDualModePaidAtBiller(b)) return false;

  const ps = String(b.paymentStatus || '').toLowerCase();
  const st = String(b.status || '').toLowerCase();

  if (ps === 'pending_approval') return false;
  if (ps === 'pending_payment') return true;
  if (st === 'approved' && ps !== 'paid' && ps !== 'cashier_paid') return true;
  if (b.isActiveOrder === true && ps !== 'paid') return true;

  return false;
};

function isBillDeletedLocal(b) {
  return Boolean(b?.deleted || b?.isDeleted);
}

/** Bill awaiting cashier collection (biller sent, cashier not paid yet). */
export const isAwaitingCashierPayment = (o) => {
  if (!o) return false;
  if (isDualModePaidAtBiller(o)) return false;
  const ps = String(o.paymentStatus || '').toLowerCase();
  if (ps === 'pending_approval') return false;
  return ps === 'pending_payment';
};

/** Paid amount for display — never treat biller amountReceived as cashier payment. */
export const getEffectivePaidAmount = (o) => {
  if (!o) return 0;
  const total = Number(o.grandTotal || o.totalAmount || o.total || 0);
  const explicit = Number(o.paidAmount || 0);
  if (explicit > 0) return explicit;
  if (isDualModePaidAtBiller(o)) {
    return Number(o.amountReceived || total || 0);
  }
  if (isAwaitingCashierPayment(o)) return 0;
  if (isCashierCollected(o)) return Number(o.amountReceived || total || 0);
  return 0;
};
