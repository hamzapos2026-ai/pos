// Bill-level + item-level discount breakdown for cashier rows & reports

const num = (v) => Number(v || 0);

/** Item-line discounts (sum of per-line disc) */
export const getItemLineDiscount = (order) => num(order?.totalDiscount);

/** Biller bill-level discount snapshot (PKR) */
export const getBillerBillDiscount = (order) =>
  num(order?.billerBillDiscount ?? order?.billDiscountValue ?? order?.billDiscount);

/** Cashier extra discount on top of biller bill discount */
export const getCashierExtraDiscount = (order) => {
  if (order?.cashierExtraDiscount != null) return num(order.cashierExtraDiscount);
  const current = num(order?.billDiscount ?? order?.billDiscountValue);
  const biller = getBillerBillDiscount(order);
  if ((order?.isEdited || order?.wasEdited) && current > biller) return current - biller;
  return 0;
};

/** Combined "Biller Discount" shown on cashier row = item disc + biller bill disc */
export const getBillerDiscountDisplay = (order) =>
  getItemLineDiscount(order) + getBillerBillDiscount(order);

export const getOrderDiscountBreakdown = (order) => ({
  itemDiscount: getItemLineDiscount(order),
  billerBillDiscount: getBillerBillDiscount(order),
  billerDiscountTotal: getBillerDiscountDisplay(order),
  cashierExtraDiscount: getCashierExtraDiscount(order),
  totalDiscount: getBillerDiscountDisplay(order) + getCashierExtraDiscount(order),
});

export const formatDiscountRs = (amount) =>
  amount > 0 ? `Rs.${Math.round(amount).toLocaleString()}` : '—';
