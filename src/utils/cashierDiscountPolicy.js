import { computeOrderSubtotalFromItems } from './invoiceUtils';
import { getBillerBillDiscount } from './orderDiscountUtils';
import { showDiscountLimitToast } from './discountPolicy';

const inf = (n) => (Number(n) > 0 && Number.isFinite(Number(n)) ? Number(n) : Infinity);

export const DEFAULT_CASHIER_DISCOUNT_POLICY = {
  enabled: true,
  allowPKR: true,
  allowPercent: false,
  maxPKR: 0,
  maxPercent: 0,
  defaultType: 'fixed',
  requireReason: true,
};

export const normalizeCashierDiscountRule = (raw = {}) => ({
  enabled: raw.enabled !== false,
  allowPKR: raw.allowPKR !== false,
  allowPercent: Boolean(raw.allowPercent),
  maxPKR: inf(raw.maxPKR ?? raw.maxCashierExtraDiscountPKR),
  maxPercent: inf(raw.maxPercent ?? raw.maxCashierExtraDiscountPercent),
  defaultType: raw.defaultType === 'percent' ? 'percent' : 'fixed',
  requireReason: raw.requireReason !== false,
});

export const normalizeCashierDiscountPolicyDoc = (raw) => {
  const doc = raw?.value ?? raw ?? {};
  return {
    default: normalizeCashierDiscountRule({ ...DEFAULT_CASHIER_DISCOUNT_POLICY, ...(doc.default || doc.global || {}) }),
    branches: Object.fromEntries(
      Object.entries(doc.branches || {}).map(([k, v]) => [k, normalizeCashierDiscountRule(v)]),
    ),
    cashiers: Object.fromEntries(
      Object.entries(doc.cashiers || {}).map(([k, v]) => [k, normalizeCashierDiscountRule(v)]),
    ),
  };
};

/** cashier user → branch → global default */
export const resolveCashierDiscountRule = (policyDoc, branchId, cashierId) => {
  const doc = normalizeCashierDiscountPolicyDoc(policyDoc);
  let rule = { ...doc.default };
  if (branchId && doc.branches[branchId]) {
    rule = { ...rule, ...doc.branches[branchId] };
  }
  if (cashierId && doc.cashiers[cashierId]) {
    rule = { ...rule, ...doc.cashiers[cashierId] };
  }
  return rule;
};

export const computeMaxCashierExtraDiscountPKR = (order, rule) => {
  if (!rule?.enabled) return 0;
  const subtotal = computeOrderSubtotalFromItems(order) || Number(order?.subtotal) || 0;
  const billerBase = getBillerBillDiscount(order);
  const remaining = Math.max(0, Math.round(subtotal - billerBase));
  if (remaining <= 0) return 0;

  const pctCap = rule.maxPercent;
  const pkrCap = rule.maxPKR;
  const fromPct = Number.isFinite(pctCap) && pctCap !== Infinity
    ? Math.round((remaining * pctCap) / 100)
    : remaining;
  const fromPkr = Number.isFinite(pkrCap) && pkrCap !== Infinity ? pkrCap : remaining;
  return Math.min(remaining, fromPct, fromPkr);
};

export const validateCashierExtraDiscount = (order, extraRaw, rule) => {
  const attempted = Math.max(0, Number(extraRaw) || 0);
  if (!rule?.enabled) {
    return { valid: attempted === 0, maxAllowed: 0, attempted, disabled: true };
  }
  const maxAllowed = computeMaxCashierExtraDiscountPKR(order, rule);
  if (!rule.allowPKR && rule.defaultType === 'fixed') {
    return { valid: false, maxAllowed: 0, attempted, blocked: true };
  }
  return {
    valid: attempted <= maxAllowed + 0.001,
    maxAllowed,
    attempted,
    percentLimit: Number.isFinite(rule.maxPercent) && rule.maxPercent !== Infinity ? rule.maxPercent : null,
  };
};

export const clampCashierExtraDiscount = (order, extraRaw, rule) => {
  const v = validateCashierExtraDiscount(order, extraRaw, rule);
  if (v.disabled || v.blocked) return 0;
  return Math.min(v.attempted, v.maxAllowed);
};

export const toastCashierDiscountLimit = (v, rule) => {
  if (v.disabled) {
    showDiscountLimitToast({ maxAllowed: 0, attempted: v.attempted, title: 'Cashier extra discount band hai' });
    return;
  }
  showDiscountLimitToast({
    maxAllowed: v.maxAllowed,
    attempted: v.attempted,
    percentLimit: v.percentLimit,
    title: 'Cashier extra discount limit se zyada hai',
  });
};
