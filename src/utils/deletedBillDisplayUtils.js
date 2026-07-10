/** Display helpers for cashier Deleted tab — real cashier deletes only */

const PLACEHOLDER_SERIAL = /^-+$|^—$|^n\/a$/i;

export const isPlaceholderSerial = (value) => {
  const v = String(value || '').trim();
  return !v || PLACEHOLDER_SERIAL.test(v);
};

export const resolveDeletedBillSerial = (bill) => {
  if (!bill) return '';
  for (const key of ['billSerial', 'serialNo']) {
    const v = String(bill[key] || '').trim();
    if (!isPlaceholderSerial(v)) return v;
  }
  return '';
};

const GENERIC_REASONS = new Set(['deleted', 'bill_cleared', 'bill_cancelled']);

export const resolveDeletedBillReason = (bill) => {
  const raw = String(
    bill?.deleteReason || bill?.reason || bill?.cancelReason || '',
  ).trim();
  if (!raw || GENERIC_REASONS.has(raw)) return '';
  return raw;
};

export const resolveDeletedCashierName = (bill) => {
  if (!bill) return '';
  if (bill.deletedBy === 'cashier') {
    return String(bill.deletedByName || bill.deletedByLabel || '').trim();
  }
  return String(bill.deletedByName || '').trim();
};

/** Only bills cashier cancelled/deleted — no biller draft clears (----) */
export const isCashierDeletedBillRecord = (bill) => {
  if (!bill) return false;
  if (bill.deletedBy === 'biller' || bill.reason === 'bill_cleared') return false;
  if (bill.deletedBy === 'cashier') return true;
  // Legacy rows before deletedBy field: real serial + human cancel reason
  const serial = resolveDeletedBillSerial(bill);
  const reason = resolveDeletedBillReason(bill);
  return Boolean(serial && reason && !isPlaceholderSerial(bill.billSerial));
};

export const resolveDeletedBillDate = (bill) =>
  bill?.deletedAt || bill?.cashierCancelledAt || bill?.cancelledAt || bill?.timestamp || null;
