/**
 * Delivery security — staff issuing product only see verified / review status.
 * Raw bill details must not be used for handover decisions.
 */

export const DELIVERY_STATUS = {
  PAYMENT_VERIFIED: 'payment_verified',
  PENDING_REVIEW: 'pending_review',
  NOT_PAID: 'not_paid',
};

const REVIEW_FLAGS = new Set([
  'manual_review',
  'fraud_review',
  'review_required',
  'pending_match',
]);

/** @returns {'payment_verified'|'pending_review'|'not_paid'} */
export const getDeliveryStatus = (bill = {}) => {
  if (!bill) return DELIVERY_STATUS.NOT_PAID;

  const status = String(bill.status || '').toLowerCase();
  const paymentStatus = String(bill.paymentStatus || '').toLowerCase();
  const matchStatus = String(bill.matchStatus || bill.reconciliationStatus || '').toLowerCase();
  const deliveryStatus = String(bill.deliveryStatus || '').toLowerCase();

  if (deliveryStatus === DELIVERY_STATUS.PAYMENT_VERIFIED) return DELIVERY_STATUS.PAYMENT_VERIFIED;
  if (deliveryStatus === DELIVERY_STATUS.PENDING_REVIEW) return DELIVERY_STATUS.PENDING_REVIEW;

  if (
    bill.fraudReview === true
    || bill.manualReviewApproved === false && bill.manualReviewAt
    || REVIEW_FLAGS.has(status)
    || REVIEW_FLAGS.has(paymentStatus)
    || REVIEW_FLAGS.has(matchStatus)
    || bill.offlineSyncPending === true && bill.matchStatus !== 'matched'
  ) {
    return DELIVERY_STATUS.PENDING_REVIEW;
  }

  const collected =
    ['paid', 'cashier_paid', 'manager_approved', 'completed', 'settled'].includes(status)
    || ['paid', 'cashier_paid'].includes(paymentStatus)
    || bill.offlineSyncPending === true
    || bill.cashierHandover === true;

  if (collected && matchStatus !== 'review_required' && matchStatus !== 'fraud') {
    if (bill.managerConfirmed === true || status === 'paid' || paymentStatus === 'paid') {
      return DELIVERY_STATUS.PAYMENT_VERIFIED;
    }
    if (bill.offlineSyncPending === true || paymentStatus === 'cashier_paid' || status === 'cashier_paid') {
      return DELIVERY_STATUS.PAYMENT_VERIFIED;
    }
  }

  return DELIVERY_STATUS.NOT_PAID;
};

export const getDeliveryStatusLabel = (bill, t = (k, d) => d) => {
  const s = getDeliveryStatus(bill);
  if (s === DELIVERY_STATUS.PAYMENT_VERIFIED) {
    return t('delivery.paymentVerified', 'Payment Verified');
  }
  if (s === DELIVERY_STATUS.PENDING_REVIEW) {
    return t('delivery.pendingReview', 'Pending Review');
  }
  return t('delivery.notPaid', 'Not Paid');
};

/** Strip sensitive bill fields for delivery staff view */
export const toDeliverySafeView = (bill = {}) => ({
  billSerial: bill.billSerial || bill.serialNo || '',
  deliveryStatus: getDeliveryStatus(bill),
  statusLabel: getDeliveryStatusLabel(bill),
  storeId: bill.storeId || bill.branchId || '',
});
