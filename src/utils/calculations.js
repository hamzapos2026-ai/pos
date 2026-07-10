// src/utils/calculations.js
// ✅ COMPLETE — All calculation utilities
// 🔧 FIX-CALC-1: applyDiscountToLastItem works correctly
// 🔧 FIX-CALC-2: updateLastItem works correctly

// ══════════════════════════════════════════════════════════════
// ITEM DISCOUNT CALCULATION
// ══════════════════════════════════════════════════════════════
export const calcDiscountAmt = (item) => {
  const d = Number(item.discount || 0);
  if (d <= 0) return 0;
  if (item.discountType === "percent") {
    return Math.round((Number(item.price || 0) * d) / 100);
  }
  return Math.min(d, Number(item.price || 0));
};

export const calcLineTotal = (item) => {
  const discAmt = calcDiscountAmt(item);
  return (Number(item.price || 0) - discAmt) * Number(item.qty || 1);
};

// ══════════════════════════════════════════════════════════════
// BILL TOTALS
// ══════════════════════════════════════════════════════════════
export const calcSubtotal = (items) =>
  items.reduce((s, i) => s + calcLineTotal(i), 0);

export const calcTotalDiscount = (items) =>
  items.reduce((s, i) => s + calcDiscountAmt(i) * Number(i.qty || 1), 0);

export const calcTotalQty = (items) =>
  items.reduce((s, i) => s + Number(i.qty || 0), 0);

export const calcBillDiscountValue = (subtotal, discount, discountType) => {
  const v = Number(discount || 0);
  if (discountType === "percent") {
    return Math.round(subtotal * Math.min(100, Math.max(0, v)) / 100);
  }
  return Math.max(0, v);
};

export const calcFinalTotal = (subtotal, billDiscountValue) =>
  Math.max(0, subtotal - billDiscountValue);

export const calcChange = (amountReceived, finalTotal) => {
  const r = Number(amountReceived || 0);
  return r > finalTotal ? r - finalTotal : 0;
};

// ══════════════════════════════════════════════════════════════
// applyDiscountToLastItem
// Case C: Price blank + Qty blank + Discount > 0
// → Apply discount to the last item in the list
// ══════════════════════════════════════════════════════════════
export const applyDiscountToLastItem = (items, discount, discountType = "percent") => {
  if (!items || items.length === 0) return items;
  const lastIndex = items.length - 1;
  return items.map((item, idx) => {
    if (idx !== lastIndex) return item;
    return {
      ...item,
      discount:     Number(discount) || 0,
      discountType: discountType,
    };
  });
};

// ══════════════════════════════════════════════════════════════
// updateLastItem
// Case B: Price blank + Qty > 0
// → Update last item's qty (and optionally discount)
// ══════════════════════════════════════════════════════════════
export const updateLastItem = (items, changes) => {
  if (!items || items.length === 0) return items;
  const lastIndex = items.length - 1;
  return items.map((item, idx) => {
    if (idx !== lastIndex) return item;
    const updated = { ...item };
    if (changes.qty      !== undefined) updated.qty      = Math.max(1, Number(changes.qty) || 1);
    if (changes.price    !== undefined) updated.price    = Math.max(1, Number(changes.price) || 1);
    if (changes.discount !== undefined) updated.discount = Math.max(0, Number(changes.discount) || 0);
    if (changes.discountType !== undefined) updated.discountType = changes.discountType;
    return updated;
  });
};

// ══════════════════════════════════════════════════════════════
// mergeItemQty
// Case A (merge): Same price found → add qty to existing row
// ══════════════════════════════════════════════════════════════
export const mergeItemQty = (items, targetId, additionalQty) => {
  return items.map((item) => {
    if (item.id !== targetId) return item;
    return { ...item, qty: Number(item.qty) + Number(additionalQty) };
  });
};

// ══════════════════════════════════════════════════════════════
// findMatchingItem
// Find existing item with same price (for qty merge)
// ══════════════════════════════════════════════════════════════
export const findMatchingItem = (items, price, discount, discountType, productName, showProductName) => {
  return items.findIndex((item) => {
    const samePrice    = Number(item.price)    === Number(price);
    const sameDisc     = Number(item.discount) === Number(discount);
    const sameDiscType = item.discountType     === (discountType || "percent");
    const sameName     = !showProductName
      ? true
      : (!productName || item.productName === productName);
    return samePrice && sameDisc && sameDiscType && sameName;
  });
};

// ══════════════════════════════════════════════════════════════
// INVOICE HELPERS
// ══════════════════════════════════════════════════════════════
export const formatCurrency = (amount, currency = "PKR") =>
  `Rs. ${Number(amount || 0).toLocaleString("en-PK")}`;

export const formatSerial = (n) =>
  String(Math.max(1, Number(n) || 1)).padStart(5, "0");

export const formatItemSerial = (n) =>
  String(Math.max(1, Number(n) || 1));

// Number to words (for invoice)
const ONES = ["","One","Two","Three","Four","Five","Six","Seven","Eight","Nine",
              "Ten","Eleven","Twelve","Thirteen","Fourteen","Fifteen","Sixteen",
              "Seventeen","Eighteen","Nineteen"];
const TENS = ["","","Twenty","Thirty","Forty","Fifty","Sixty","Seventy","Eighty","Ninety"];

const _toWords = (n) => {
  if (n === 0)     return "";
  if (n < 20)      return ONES[n] + " ";
  if (n < 100)     return TENS[Math.floor(n/10)] + (n%10 ? " "+ONES[n%10] : "") + " ";
  if (n < 1000)    return ONES[Math.floor(n/100)] + " Hundred " + _toWords(n%100);
  if (n < 100000)  return _toWords(Math.floor(n/1000)) + "Thousand " + _toWords(n%1000);
  if (n < 10000000) return _toWords(Math.floor(n/100000)) + "Lakh " + _toWords(n%100000);
  return _toWords(Math.floor(n/10000000)) + "Crore " + _toWords(n%10000000);
};

export const numberToWords = (num) => {
  if (!num || num === 0) return "Zero Rupees Only";
  const intPart = Math.floor(Math.abs(num));
  return (_toWords(intPart).trim() || "Zero") + " Rupees Only";
};