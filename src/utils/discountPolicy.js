import { showFieldAlert } from './fieldAlert';



/** Unwrap Firestore/local shapes: { value: { maxAmount } } or flat map. */

export function normalizeDiscountSettings(raw) {

  const s = raw?.value ?? raw ?? {};

  const maxAmount = Number(s.maxAmount ?? s.maxDiscountPKR ?? 0);

  const legacyPercent = Number(s.maxPercent ?? s.maxDiscountPercent ?? 0);

  const maxItemPercent = Number(

    s.maxItemDiscountPercent ?? s.maxItemPercent ?? legacyPercent ?? 0,

  );

  const maxBillPercent = Number(

    s.maxBillDiscountPercent ?? s.maxBillPercent ?? legacyPercent ?? 0,

  );

  const maxSummaryPkr = Number(

    s.maxBillSummaryDiscountPKR ?? s.maxSummaryDiscountPKR ?? s.maxAmount ?? s.maxDiscountPKR ?? 0,

  );

  const maxSummaryPct = Number(

    s.maxBillSummaryDiscountPercent ?? s.maxSummaryDiscountPercent ?? maxBillPercent ?? legacyPercent ?? 0,

  );

  return {

    maxAmount: maxAmount > 0 ? maxAmount : Infinity,

    maxPercent: legacyPercent > 0 ? legacyPercent : Infinity,

    maxItemDiscountPercent: maxItemPercent > 0 ? maxItemPercent : Infinity,

    maxBillDiscountPercent: maxBillPercent > 0 ? maxBillPercent : Infinity,

    maxBillSummaryDiscountPKR: maxSummaryPkr > 0 ? maxSummaryPkr : Infinity,

    maxBillSummaryDiscountPercent: maxSummaryPct > 0 ? maxSummaryPct : Infinity,

    requireApproval: Boolean(s.requireApproval),

    allowOnReturn: s.allowOnReturn !== false,

    allowBillDiscount: s.allowBillDiscount !== false,

    allowBillDiscountInSummary: s.allowBillDiscountInSummary !== undefined
      ? s.allowBillDiscountInSummary !== false
      : s.allowBillDiscount !== false,

    allowBillDiscountSummaryPKR: s.allowBillDiscountSummaryPKR !== undefined
      ? s.allowBillDiscountSummaryPKR !== false
      : s.allowBillDiscountPKR !== false,

    allowBillDiscountSummaryPercent: s.allowBillDiscountSummaryPercent !== undefined
      ? s.allowBillDiscountSummaryPercent !== false
      : s.allowBillDiscountPercent !== false,

    allowItemDiscountPKR: s.allowItemDiscountPKR !== false,

    allowItemDiscountPercent: s.allowItemDiscountPercent !== false,

    allowBillDiscountPKR: s.allowBillDiscountPKR !== false,

    allowBillDiscountPercent: s.allowBillDiscountPercent !== false,

    defaultItemDiscountType: s.defaultItemDiscountType === 'percent' ? 'percent' : 'fixed',

    defaultBillDiscountType: s.defaultBillDiscountType === 'fixed' ? 'fixed' : 'percent',

    defaultBillSummaryDiscountType: s.defaultBillSummaryDiscountType === 'percent' ? 'percent' : 'fixed',

  };

}



export function pickDiscountSettings(billerSettings, globalSettings) {

  const raw =

    billerSettings?.discounts

    ?? billerSettings?.discount

    ?? globalSettings?.discounts

    ?? globalSettings?.discount

    ?? null;

  return normalizeDiscountSettings(raw);

}



export const getMaxItemDiscountPercent = (policy) => {

  const p = policy?.maxItemDiscountPercent ?? policy?.maxPercent;

  const n = Number(p);

  return n > 0 && Number.isFinite(n) ? n : Infinity;

};



export const getMaxBillDiscountPercent = (policy) => {
  const p = policy?.maxBillDiscountPercent ?? policy?.maxPercent;
  const n = Number(p);
  return n > 0 && Number.isFinite(n) ? n : Infinity;
};

export const getMaxBillSummaryDiscountPercent = (policy) => {
  const p = policy?.maxBillSummaryDiscountPercent ?? policy?.maxBillDiscountPercent ?? policy?.maxPercent;
  const n = Number(p);
  return n > 0 && Number.isFinite(n) ? n : Infinity;
};

export const getMaxBillSummaryDiscountPKR = (policy) => {
  const p = policy?.maxBillSummaryDiscountPKR ?? policy?.maxAmount ?? policy?.maxDiscountPKR;
  const n = Number(p);
  return n > 0 && Number.isFinite(n) ? n : Infinity;
};

/** Compute applied bill discount (PKR) with optional caps */
export function computeBillDiscountValuePKR(subtotal, discountRaw, discountType, { maxPercent = Infinity, maxPKR = Infinity } = {}) {
  const sub = Math.max(0, Number(subtotal) || 0);
  const v = Math.max(0, Number(discountRaw) || 0);
  const pctCap = Number.isFinite(maxPercent) && maxPercent !== Infinity ? maxPercent : Infinity;
  const pkrCap = Number.isFinite(maxPKR) && maxPKR !== Infinity ? maxPKR : Infinity;
  const pctLimitRs = pctCap !== Infinity ? Math.round((sub * pctCap) / 100) : sub;
  let maxAllowed = sub;
  if (pctCap !== Infinity) maxAllowed = Math.min(maxAllowed, pctLimitRs);
  if (pkrCap !== Infinity) maxAllowed = Math.min(maxAllowed, pkrCap);

  if (discountType === 'percent') {
    const pct = pctCap !== Infinity ? Math.min(v, pctCap) : v;
    return Math.min(sub, Math.min(maxAllowed, Math.round((sub * pct) / 100)));
  }
  return Math.min(sub, Math.min(maxAllowed, v));
}



/**

 * Item-level max discount in PKR from admin % cap.

 * Max PKR = Price × Allowed % ÷ 100

 */

export function computeMaxItemDiscountPKR(unitPrice = 0, policy) {

  const price = Math.max(0, Number(unitPrice) || 0);

  if (price <= 0) return 0;



  const pct = getMaxItemDiscountPercent(policy);

  if (!Number.isFinite(pct) || pct === Infinity) {

    return price;

  }



  const amount = (price * pct) / 100;

  return Math.min(price, Math.round(amount * 100) / 100);

}



/** @deprecated use computeMaxItemDiscountPKR */

export function computeMaxAllowedPerUnitFromPolicy(policy, unitPrice = 0) {

  return computeMaxItemDiscountPKR(unitPrice, policy);

}



/** Applied per-unit discount (PKR) for one item line — fixed PKR entry capped by % rule. */

export function computeItemLineDiscountPKR(item, policy, unitPriceOverride) {

  const unit = Math.max(

    0,

    Number(unitPriceOverride ?? item?.price) || 0,

  );

  const d = Math.max(0, Number(item?.discount) || 0);

  if (d <= 0 || unit <= 0) return 0;



  if (item?.discountType === 'percent') {

    const cap = getMaxItemDiscountPercent(policy);

    const pct = Number.isFinite(cap) && cap !== Infinity ? Math.min(d, cap) : d;

    return Math.round((unit * pct) / 100);

  }



  const maxAllowed = computeMaxItemDiscountPKR(unit, policy);

  return Math.min(maxAllowed, Math.min(d, unit));

}



export function validateItemDiscountPKR(unitPrice, discountPkr, policy) {

  const attempted = Math.max(0, Number(discountPkr) || 0);

  const maxAllowed = computeMaxItemDiscountPKR(unitPrice, policy);

  const pct = getMaxItemDiscountPercent(policy);

  const hasLimit = Number.isFinite(pct) && pct !== Infinity;



  if (!hasLimit) {

    return { valid: true, maxAllowed, attempted, percentLimit: null };

  }



  const valid = attempted <= maxAllowed + 0.001;

  return { valid, maxAllowed, attempted, percentLimit: pct };

}



/** Block typing/pasting values above max (e.g. max 10 → "11" rejected). */

export function isDiscountInputAllowed(cleaned, maxAllowed) {

  if (cleaned === '' || cleaned === '.') return true;

  if (!Number.isFinite(maxAllowed) || maxAllowed === Infinity) return true;

  const n = Number(cleaned);

  if (Number.isNaN(n)) return false;

  return n <= maxAllowed + 0.001;

}



export function showDiscountLimitToast({

  maxAllowed,

  attempted,

  percentLimit,

  title = 'Discount allowed limit se zyada hai',

}) {

  const pctHint = Number.isFinite(percentLimit) && percentLimit !== Infinity

    ? ` (${percentLimit}% limit)`

    : '';

  showFieldAlert({

    variant: 'error',

    title,

    message: `Maximum allowed: Rs ${maxAllowed}${pctHint}\nYou entered: Rs ${attempted}`,

    fieldLabel: 'Discount',

    confirmLabel: 'Adjust Discount',

  });

}


