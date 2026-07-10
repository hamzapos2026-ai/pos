// Shared client-side bill filtering for Admin + Manager bills pages

import {
  isInvoiceDualModeBill,
  isAnyOfflineBillRow,
  hasCashierOfflinePayment,
  getOfflinePaidByCashierName,
  enrichBillChannelForDisplay,
  isDualModePendingManager,
  isDualModePaidAtBiller,
  mergeBillChannelMetadata,
} from './billChannelUtils';
import {
  isCashierPaidPendingManager,
  isManagerSettled,
  isCashierCollected,
  matchesCashierPendingQueue,
  isCashierOrderCancelled,
} from './cashierOrderUtils';
import { getBillSerialKey } from './serialMatch';
import { orderMatchesStore } from '../hooks/useStoresMap';
import { resolveDatePresetRange } from './datePresetUtils';

export const DEFAULT_BILLS_FILTERS = {
  search: '',
  quick: 'all',
  paymentStatus: '',
  billStatus: '',
  branchId: '',
  billerId: '',
  datePreset: 'today',
  dateFrom: '',
  dateTo: '',
  amountMin: '',
  amountMax: '',
  syncStatus: '',
  showAll: false,
};

const toMs = (v) => {
  if (!v) return 0;
  if (typeof v.toDate === 'function') {
    try { return v.toDate().getTime(); } catch { /* fallthrough */ }
  }
  if (typeof v === 'object' && typeof v.seconds === 'number') {
    return v.seconds * 1000;
  }
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? 0 : d.getTime();
};

/** Date chips — use payment time for offline/cashier-paid rows, not only bill creation. */
export const getBillFilterTimestamp = (b) =>
  toMs(b.paidAt || b.cashierPaidAt || b.savedAt || b.createdAt || b.billEndTime || b.billerSubmittedAt);

export const getBillAmount = (b) =>
  Number(b.grandTotal || b.totalAmount || b.total || 0);

export const getBillPaymentKey = (b) =>
  String(b.paymentStatus || '').toLowerCase();

export const isBillDeleted = (b) =>
  Boolean(b.deleted || b.isDeleted);

export const isBillCancelled = (b) =>
  String(b?.status || '').toLowerCase() === 'cancelled';

/** Deleted, soft-deleted, or cancelled bills */
export const isBillRemoved = (b) =>
  isBillDeleted(b)
  || isBillCancelled(b)
  || String(b?.paymentStatus || '').toLowerCase() === 'deleted';

/** Bill was modified after creation (cashier/manager edit) */
export const isBillEdited = (b) => {
  if (!b || isBillRemoved(b)) return false;
  return Boolean(
    b.isEdited
    || b.wasEdited
    || b.lastEditedBy
    || b.lastEditedAt
    || b.editedAt
    || (Array.isArray(b.editHistory) && b.editHistory.length > 0),
  );
};

/** Row highlight kind — removed = red, edited = purple */
export const getBillHighlightKind = (b) => {
  if (!b) return null;
  if (isBillRemoved(b)) {
    if (isBillCancelled(b) && !isBillDeleted(b) && String(b?.paymentStatus || '').toLowerCase() !== 'deleted') {
      return 'cancelled';
    }
    return 'deleted';
  }
  if (isBillEdited(b)) return 'edited';
  return null;
};

export const NEW_BILL_ALERT_MS = 5 * 60 * 1000;

/** Human-readable fraud reason for bills UI */
export const FRAUD_REASON_LABELS = {
  amount_mismatch: 'Amount mismatch',
  duplicate_payment: 'Duplicate payment',
  duplicate_bill: 'Duplicate bill',
  bill_not_found: 'Bill not found',
  branch_mismatch: 'Branch mismatch',
  bill_id_mismatch: 'Bill ID mismatch',
  high_discount_percent: 'High discount %',
  high_discount_fixed: 'Large fixed discount',
  discount_exceeds_price: 'Discount exceeds price',
  unusual_quantity: 'Unusual quantity',
  overpayment: 'Overpayment',
  multiple_deletes: 'Multiple item deletes',
  fraud_review: 'Fraud review required',
};

const _labelFraudReason = (raw) => {
  const key = String(raw || '').trim().toLowerCase();
  if (!key) return '';
  if (FRAUD_REASON_LABELS[key]) return FRAUD_REASON_LABELS[key];
  return key.replace(/_/g, ' ');
};

/** Extract fraud reason text from a bill row */
export const getBillFraudReason = (b) => {
  if (!b) return '';
  const candidates = [
    b.fraudReason,
    b.fraudReviewReason,
    b.reviewReason,
    b.matchReason,
    b.reconciliationReason,
    b.fraudDetails,
    b.metadata?.reason,
  ];
  for (const c of candidates) {
    const label = _labelFraudReason(c);
    if (label) return label;
  }
  const details = String(b.matchDetails || b.reconciliationDetails || b.fraudDetails || '').trim();
  if (details) return details;
  if (b.fraudReview === true) return FRAUD_REASON_LABELS.fraud_review;
  const match = String(b.matchStatus || b.reconciliationStatus || b.paymentMatchStatus || '').toLowerCase();
  if (match === 'fraud') return 'Payment fraud flagged';
  const ps = String(b.paymentStatus || '').toLowerCase();
  const st = String(b.status || '').toLowerCase();
  if (ps === 'fraud' || st === 'fraud_review') return FRAUD_REASON_LABELS.fraud_review;
  return '';
};

/** True only when bill has a real fraud flag — not every new bill */
export const isBillFraudFlagged = (b) => {
  if (!b || isBillRemoved(b)) return false;
  if (b.fraudReview === true || b.fraudFlagged === true) return true;
  const match = String(b.matchStatus || b.reconciliationStatus || b.paymentMatchStatus || '').toLowerCase();
  if (match === 'fraud') return true;
  const ps = String(b.paymentStatus || '').toLowerCase();
  const st = String(b.status || '').toLowerCase();
  if (ps === 'fraud' || st === 'fraud_review') return true;
  return Boolean(getBillFraudReason(b));
};

export const getBillCreatedMs = (b) =>
  toMs(b?.billerSubmittedAt || b?.savedAt || b?.createdAt || b?.billEndTime);

export const isBillRecentlyCreated = (b, windowMs = NEW_BILL_ALERT_MS) => {
  if (isBillRemoved(b)) return false;
  const ms = getBillCreatedMs(b);
  return ms > 0 && Date.now() - ms <= windowMs;
};

/** Cashier queue — same rules as Cashier dashboard pending list */
export const isPendingCashier = (b) => matchesCashierPendingQueue(b);

/** Manager must approve bill before it goes to cashier (discount / dual-mode) */
export const isPendingManagerApproval = (b) => {
  if (isBillRemoved(b)) return false;
  if (isInvoiceDualModeBill(b)) {
    if (isManagerSettled(b)) return false;
    return isDualModePendingManager(b) || isDualModePaidAtBiller(b);
  }
  const st = String(b.status || '').toLowerCase();
  const ps = String(b.paymentStatus || '').toLowerCase();
  if (ps === 'pending_approval') return true;
  if (st === 'pending' && ps !== 'pending_payment') return true;
  return false;
};

/** Dual-mode checkout bills — manager / admin filter tab */
export const isDualModeBillRow = (b) => {
  if (isBillRemoved(b)) return false;
  return isInvoiceDualModeBill(b);
};

/** Cashier offline pay only — admin/manager filter tab + stats */
export const isOfflineBillRow = (b) => {
  if (!b || isBillRemoved(b)) return false;
  return isAnyOfflineBillRow(b);
};

/** @deprecated — biller offline not shown in UI */
export const isBillerOfflinePayRow = () => false;

/** Cashier offline pay row */
export const isCashierOfflinePayRow = (b) => {
  if (!b || isBillRemoved(b)) return false;
  return hasCashierOfflinePayment(b);
};

/** Single offline badge — cashier name when paid offline */
export const getOfflineChannelBadge = (b) => {
  if (!hasCashierOfflinePayment(b)) return null;
  const name = getOfflinePaidByCashierName(b);
  return {
    key: 'cashier',
    label: name ? `Offline · ${name}` : 'Cashier Offline',
    labelKey: 'bills.cashierOfflinePay',
    cashierName: name,
  };
};

/** Deduplicate by serial — one bill per serial, always (cashier + admin). */
export const dedupeBillsBySerial = (bills) => {
  const map = new Map();
  for (const b of bills || []) {
    const key = getBillSerialKey(b);
    if (!key) {
      const fallback = b.id || b.localId;
      if (fallback) map.set(`id:${fallback}`, b);
      continue;
    }
    const prev = map.get(key);
    const score = (o) => {
      let s = toMs(o.paidAt || o.cashierPaidAt || o.savedAt || o.createdAt || o.billEndTime || o.billerSubmittedAt);
      if (isCashierOrderCancelled(o)) s += 2e16;
      else if (isCashierPaidPendingManager(o)) s += 5e14;
      else if (isManagerSettled(o)) s += 1e15;
      else if (isCashierCollected(o)) s += 5e14;
      // Prefer copy that still carries real dual-mode checkout stamps (not stale dualMode alone)
      if (o.wasDualModeCheckout === true || o.dualModeCheckout === true) s += 6e12;
      if (isInvoiceDualModeBill(o)) s += 4e12;
      // Prefer Firebase / synced copy over local Dexie duplicate
      if (o.firebaseId || o.syncStatus === 'synced') s += 3e12;
      if (o.id && !o.isLocalOnly && !String(o.id).startsWith('local_')) s += 2e12;
      if (!o.isLocalOnly && !o.offlinePending) s += 1e11;
      return s;
    };
    if (!prev) {
      map.set(key, b);
      continue;
    }
    const scoreB = score(b);
    const scorePrev = score(prev);
    if (scoreB > scorePrev || (scoreB === scorePrev && toMs(b.savedAt) >= toMs(prev.savedAt))) {
      map.set(key, mergeBillChannelMetadata(b, prev));
    } else {
      map.set(key, mergeBillChannelMetadata(prev, b));
    }
  }
  return [...map.values()];
};

/** Numeric tail for sort — AON-BIL-060626-000034 → 34 */
export const getBillSerialSortKey = (b) => {
  const serial = String(b?.billSerial || b?.serialNo || '').trim();
  if (!serial) return 0;
  const tail = serial.split('-').pop() || '';
  const n = parseInt(String(tail).replace(/\D/g, ''), 10);
  return Number.isFinite(n) ? n : 0;
};

/** Newest bill first — serial desc, then timestamp desc */
export const sortBillsNewestFirst = (bills) =>
  [...(bills || [])].sort((a, b) => {
    const sa = getBillSerialSortKey(a);
    const sb = getBillSerialSortKey(b);
    if (sa !== sb) return sb - sa;
    const ta = toMs(a.paidAt || a.savedAt || a.createdAt || a.billEndTime || a.billerSubmittedAt);
    const tb = toMs(b.paidAt || b.savedAt || b.createdAt || b.billEndTime || b.billerSubmittedAt);
    return tb - ta;
  });

export const prepareBillsForDisplay = (bills) =>
  sortBillsNewestFirst(dedupeBillsBySerial((bills || []).map(enrichBillChannelForDisplay)));

export const countPendingCashierBills = (bills, options = {}) => {
  let list = dedupeBillsBySerial(bills);
  const { branchIds, branchAliasSet } = options;
  if (branchAliasSet?.size) {
    list = list.filter((b) => orderMatchesStore(b, branchAliasSet));
  } else if (Array.isArray(branchIds) && branchIds.length > 0) {
    list = list.filter((b) => orderMatchesStore(b, branchIds));
  }
  return list.filter(isPendingCashier).length;
};

export const isBillPaid = (b) => isManagerSettled(b);

export const isPendingManagerCashierPaid = (b) =>
  !isBillDeleted(b) && isCashierPaidPendingManager(b);

export const applyBillsFilters = (bills, filters = DEFAULT_BILLS_FILTERS) => {
  const f = { ...DEFAULT_BILLS_FILTERS, ...filters };

  return (bills || []).filter((b) => {
    const isRemoved = isBillRemoved(b);
    const ps = getBillPaymentKey(b);
    const st = String(b.status || '').toLowerCase();
    const amt = getBillAmount(b);
    const ts = getBillFilterTimestamp(b);

    // Quick presets
    if (f.quick === 'active' && isRemoved) return false;
    if (f.quick === 'deleted' && !isRemoved) return false;
    if (f.quick === 'edited' && !isBillEdited(b)) return false;
    if (f.quick === 'pending_cashier' && (isRemoved || !isPendingCashier(b))) return false;
    if (f.quick === 'pending_mgr_cashier' && (isRemoved || !isPendingManagerCashierPaid(b))) return false;
    if (f.quick === 'pending_mgr' && (isRemoved || !isPendingManagerApproval(b))) return false;
    if (f.quick === 'dual_mode' && (isRemoved || !isDualModeBillRow(b))) return false;
    if (f.quick === 'offline' && (isRemoved || !isOfflineBillRow(b))) return false;
    if (f.quick === 'paid' && (isRemoved || !isBillPaid(b))) return false;
    if (f.quick === 'unpaid' && (isRemoved || isBillPaid(b) || isPendingCashier(b))) return false;
    if (f.quick === 'cancelled' && !isBillCancelled(b)) return false;

    // Default / clear filters: show removed + edited + dual-mode + cashier-offline; hide only settled paid
    if (!f.showAll && f.quick === 'all' && !f.paymentStatus && !f.billStatus) {
      if (isRemoved) return true;
      if (isBillEdited(b)) return true;
      if (isDualModeBillRow(b)) return true;
      if (isAnyOfflineBillRow(b)) return true;
      if (isManagerSettled(b)) return false;
    }

    if (f.branchId && f.branchId !== 'all') {
      if (!orderMatchesStore(b, [f.branchId])) return false;
    } else if (f.branchAliasSet?.size) {
      if (!orderMatchesStore(b, f.branchAliasSet)) return false;
    } else if (Array.isArray(f.branchScope) && f.branchScope.length > 0) {
      if (!orderMatchesStore(b, f.branchScope)) return false;
    }

    if (f.billerId && f.billerId !== 'all') {
      if ((b.billerId || b.billerName || '') !== f.billerId) return false;
    }

    if (f.paymentStatus) {
      if (f.paymentStatus === 'pending_cashier' && !isPendingCashier(b)) return false;
      else if (f.paymentStatus === 'pending_mgr_cashier' && !isPendingManagerCashierPaid(b)) return false;
      else if (f.paymentStatus === 'paid' && !isBillPaid(b)) return false;
      else if (f.paymentStatus === 'unpaid' && (isBillPaid(b) || ps === 'partial')) return false;
      else if (f.paymentStatus === 'partial') {
        const paid = Number(b.paidAmount || 0);
        if (!(paid > 0 && paid < amt)) return false;
      } else if (ps !== f.paymentStatus) return false;
    }

    if (f.billStatus && st !== f.billStatus) return false;

    if (f.syncStatus === 'synced' && b.synced === false) return false;
    if (f.syncStatus === 'pending' && b.synced !== false && b.syncStatus !== 'pending') return false;

    if (f.amountMin !== '' && amt < Number(f.amountMin)) return false;
    if (f.amountMax !== '' && amt > Number(f.amountMax)) return false;

    const preset = f.datePreset || 'today';
    if (preset !== 'all') {
      const { from, to } = resolveDatePresetRange(preset, f.dateFrom, f.dateTo);
      if (ts < from.getTime() || ts > to.getTime()) return false;
    }

    if (f.search) {
      const q = f.search.toLowerCase().trim();
      const hay = [
        b.billSerial, b.serialNo, b.id, b.localId,
        b.customer?.name, b.customerName,
        b.customer?.phone, b.customerPhone,
        b.billerName, b.billerId,
        b.storeId, b.branchId,
      ].filter(Boolean).join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }

    return true;
  });
};

export const getBillsFilterStats = (allBills, filteredBills, options = {}) => {
  const deduped = dedupeBillsBySerial(allBills || []);
  const shown = filteredBills || [];
  return {
    total: deduped.length,
    shown: shown.length,
    pendingCashier: countPendingCashierBills(deduped, options),
    pendingMgrCashier: deduped.filter(isPendingManagerCashierPaid).length,
    pendingMgrApproval: deduped.filter(isPendingManagerApproval).length,
    dualMode: deduped.filter(isDualModeBillRow).length,
    offline: deduped.filter(isAnyOfflineBillRow).length,
    paid: deduped.filter((b) => !isBillDeleted(b) && isBillPaid(b)).length,
    deleted: deduped.filter(isBillRemoved).length,
    edited: deduped.filter(isBillEdited).length,
    totalValue: deduped.reduce((s, b) => s + getBillAmount(b), 0),
    shownValue: shown.reduce((s, b) => s + getBillAmount(b), 0),
  };
};

export const countActiveAdvancedFilters = (filters) => {
  const f = { ...DEFAULT_BILLS_FILTERS, ...filters };
  let n = 0;
  if (f.quick && f.quick !== 'all') n++;
  if (f.paymentStatus) n++;
  if (f.billStatus) n++;
  if (f.branchId && f.branchId !== 'all') n++;
  if (f.billerId && f.billerId !== 'all') n++;
  if (f.datePreset && f.datePreset !== 'all' && f.datePreset !== 'today') n++;
  if (f.dateFrom) n++;
  if (f.dateTo) n++;
  if (f.amountMin !== '') n++;
  if (f.amountMax !== '') n++;
  if (f.syncStatus) n++;
  if (f.showAll) n++;
  return n;
};

export const extractBillMeta = (bills) => {
  const branches = [...new Set((bills || []).map((b) => b.storeId || b.branchId).filter(Boolean))].sort();
  const billers = [...new Set((bills || []).map((b) => b.billerId || b.billerName).filter(Boolean))].sort();
  const billerLabels = {};
  (bills || []).forEach((b) => {
    const id = b.billerId || b.billerName;
    if (id) billerLabels[id] = b.billerName || id;
  });
  return { branches, billers, billerLabels };
};
