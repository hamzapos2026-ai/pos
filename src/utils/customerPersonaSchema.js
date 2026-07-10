// Lightweight Customer Persona Foundation — incremental fields (Master Prompt).

export const PERSONA_VIP_SALES_THRESHOLD = 500_000;
export const PERSONA_VIP_VISIT_THRESHOLD = 15;
export const PERSONA_INACTIVE_DAYS = 90;
export const PERSONA_RECOVERY_PAYMENT_GAP_DAYS = 30;

const toIso = (v) => {
  if (!v) return null;
  if (typeof v?.toDate === 'function') {
    try { return v.toDate().toISOString(); } catch { /* fallthrough */ }
  }
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

const daysBetween = (fromIso, toDate = new Date()) => {
  if (!fromIso) return 0;
  const ms = toDate.getTime() - new Date(fromIso).getTime();
  return Math.max(0, Math.floor(ms / 86400000));
};

/** Default persona document — backward compatible with legacy customer fields. */
export const buildEmptyPersona = (scope = {}) => ({
  tenantId: scope.tenantId || 'aone',
  storeId: scope.storeId || 'default',
  branchId: scope.branchId || scope.storeId || 'default',
  userId: scope.userId || '',
  customerId: null,
  email: '',
  firstVisit: null,
  lastVisit: null,
  lastPurchaseDate: null,
  lastPaymentDate: null,
  lastReturnDate: null,
  totalBills: 0,
  visitCount: 0,
  visitFrequency: 0,
  totalSales: 0,
  totalPaidAmount: 0,
  averageBill: 0,
  pendingAmount: 0,
  creditDays: 0,
  creditHistory: [],
  preferredBranch: scope.storeId || '',
  preferredSalesperson: '',
  favoriteCategories: {},
  favoriteProducts: {},
  lifetimeValue: 0,
  vipStatus: false,
  inactiveStatus: false,
  recoveryRiskStatus: false,
  customerNotes: '',
  // Legacy aliases kept in sync
  purchaseCount: 0,
  totalSpent: 0,
  outstandingBalance: 0,
});

const _legacyBillCount = (doc) => Math.max(
  Number(doc.purchaseCount ?? 0),
  Number(doc.totalBills ?? 0),
  Number(doc.billsCount ?? 0),
  Number(doc.orderCount ?? 0),
  Number(doc.ordersCount ?? 0),
  Number(doc.totalOrders ?? 0),
);

const _legacyVisitCount = (doc) => {
  let v = Math.max(
    Number(doc.visitCount ?? 0),
    Number(doc.visitFrequency ?? 0),
    Number(doc.visits ?? 0),
    Number(doc.totalVisits ?? 0),
  );
  if (Array.isArray(doc.visitHistory) && doc.visitHistory.length > v) {
    v = doc.visitHistory.length;
  }
  return v;
};

export const normalizePersonaFromDoc = (doc = {}, scope = {}) => {
  const base = buildEmptyPersona(scope);
  const merged = { ...base, ...doc };
  merged.totalBills = Math.max(
    Number(merged.totalBills ?? 0),
    _legacyBillCount(merged),
  );
  merged.visitCount = Math.max(
    Number(merged.visitCount ?? 0),
    merged.totalBills,
    _legacyVisitCount(merged),
  );
  merged.totalSales = Math.max(
    Number(merged.totalSales ?? 0),
    Number(merged.totalSpent ?? 0),
    Number(merged.lifetimeValue ?? 0),
  );
  merged.pendingAmount = Math.max(
    Number(merged.pendingAmount ?? 0),
    Number(merged.outstandingBalance ?? 0),
  );
  merged.purchaseCount = merged.totalBills;
  merged.totalSpent = merged.totalSales;
  merged.outstandingBalance = merged.pendingAmount;
  merged.totalPaidAmount = Number(merged.totalPaidAmount ?? 0);
  merged.lifetimeValue = Number(merged.lifetimeValue ?? merged.totalSales ?? 0);
  merged.favoriteCategories = merged.favoriteCategories && typeof merged.favoriteCategories === 'object'
    ? merged.favoriteCategories
    : {};
  merged.favoriteProducts = merged.favoriteProducts && typeof merged.favoriteProducts === 'object'
    ? merged.favoriteProducts
    : {};
  merged.creditHistory = Array.isArray(merged.creditHistory) ? merged.creditHistory : [];
  return merged;
};

const bumpFavorites = (existing = {}, items = []) => {
  const categories = { ...(existing.favoriteCategories || {}) };
  const products = { ...(existing.favoriteProducts || {}) };
  (items || []).forEach((it) => {
    const cat = String(it?.category || it?.type || it?.itemType || 'general').trim() || 'general';
    categories[cat] = (categories[cat] || 0) + 1;
    const prod = String(it?.name || it?.productName || it?.description || it?.serial || '').trim();
    if (prod) products[prod] = (products[prod] || 0) + 1;
  });
  return { categories, products };
};

const recomputeFlags = (persona, nowIso) => {
  const vip = persona.totalSales >= PERSONA_VIP_SALES_THRESHOLD
    || persona.visitCount >= PERSONA_VIP_VISIT_THRESHOLD;
  const inactive = persona.lastVisit
    ? daysBetween(persona.lastVisit, new Date(nowIso)) >= PERSONA_INACTIVE_DAYS
    : false;
  const recovery = persona.pendingAmount > 0
    && persona.lastPaymentDate
    && daysBetween(persona.lastPaymentDate, new Date(nowIso)) >= PERSONA_RECOVERY_PAYMENT_GAP_DAYS;
  return { vipStatus: vip, inactiveStatus: inactive, recoveryRiskStatus: recovery };
};

const appendCreditHistory = (persona, entry, maxLen = 50) => {
  if (!entry) return persona.creditHistory || [];
  const prev = Array.isArray(persona.creditHistory) ? persona.creditHistory : [];
  return [...prev, entry].slice(-maxLen);
};

/** Incremental patch after a new bill — O(1), no order scans. */
export const buildBillPersonaPatch = (existing = {}, {
  billAmount = 0,
  items = [],
  scope = {},
  salespersonId = '',
  nowIso = new Date().toISOString(),
} = {}) => {
  const persona = normalizePersonaFromDoc(existing, scope);
  const amt = Math.max(0, Number(billAmount) || 0);
  const firstVisit = persona.firstVisit || nowIso;
  const totalBills = persona.totalBills + 1;
  const visitCount = persona.visitCount + 1;
  const totalSales = persona.totalSales + amt;
  const { categories, products } = bumpFavorites(persona, items);
  const balanceDue = Math.max(0, Number(scope.balanceDue ?? scope.outstandingAfter ?? 0));
  const isCreditBill = balanceDue > 0 || String(scope.paymentMethod || '').toLowerCase().includes('credit');
  const creditEntry = isCreditBill
    ? {
      date: nowIso,
      amount: amt,
      type: 'credit_sale',
      billId: scope.billId || '',
      userId: scope.userId || '',
      outstandingAfter: balanceDue || amt,
    }
    : null;
  const patch = {
    ...persona,
    tenantId: scope.tenantId || persona.tenantId,
    storeId: scope.storeId || persona.storeId,
    branchId: scope.branchId || persona.branchId,
    userId: scope.userId || persona.userId,
    firstVisit,
    lastVisit: nowIso,
    lastPurchaseDate: nowIso,
    totalBills,
    visitCount,
    visitFrequency: visitCount,
    totalSales,
    averageBill: totalBills > 0 ? Math.round(totalSales / totalBills) : 0,
    lifetimeValue: totalSales,
    preferredBranch: scope.storeId || persona.preferredBranch,
    preferredSalesperson: salespersonId || persona.preferredSalesperson,
    favoriteCategories: categories,
    favoriteProducts: products,
    purchaseCount: totalBills,
    totalSpent: totalSales,
    pendingAmount: balanceDue > 0 ? balanceDue : persona.pendingAmount,
    outstandingBalance: balanceDue > 0 ? balanceDue : persona.outstandingBalance,
    creditHistory: appendCreditHistory(persona, creditEntry),
    updatedAt: nowIso,
  };
  return { ...patch, ...recomputeFlags(patch, nowIso) };
};

/** Incremental patch after payment collection. */
export const buildPaymentPersonaPatch = (existing = {}, {
  paidAmount = 0,
  outstandingAfter = null,
  scope = {},
  isCredit = false,
  paymentMethod = '',
  billId = '',
  nowIso = new Date().toISOString(),
} = {}) => {
  const persona = normalizePersonaFromDoc(existing, scope);
  const paid = Math.max(0, Number(paidAmount) || 0);
  const totalPaid = persona.totalPaidAmount + paid;
  const pending = outstandingAfter != null
    ? Math.max(0, Number(outstandingAfter))
    : Math.max(0, persona.pendingAmount - paid);
  const method = String(paymentMethod || '').toLowerCase();
  const creditEntry = (isCredit || method.includes('credit') || pending > 0)
    ? {
      date: nowIso,
      amount: paid,
      type: isCredit ? 'credit_sale' : 'credit_payment',
      paymentMethod: method || (isCredit ? 'credit' : 'payment'),
      billId: billId || '',
      userId: scope.userId || '',
      outstandingAfter: pending,
    }
    : null;
  const patch = {
    ...persona,
    tenantId: scope.tenantId || persona.tenantId,
    storeId: scope.storeId || persona.storeId,
    branchId: scope.branchId || persona.branchId,
    lastPaymentDate: nowIso,
    lastVisit: nowIso,
    totalPaidAmount: totalPaid,
    pendingAmount: pending,
    outstandingBalance: pending,
    creditHistory: appendCreditHistory(persona, creditEntry),
    updatedAt: nowIso,
  };
  return { ...patch, ...recomputeFlags(patch, nowIso) };
};

/** Incremental patch after return / refund. */
export const buildReturnPersonaPatch = (existing = {}, {
  refundAmount = 0,
  scope = {},
  nowIso = new Date().toISOString(),
} = {}) => {
  const persona = normalizePersonaFromDoc(existing, scope);
  const refund = Math.max(0, Number(refundAmount) || 0);
  const totalSales = Math.max(0, persona.totalSales - refund);
  const totalBills = persona.totalBills;
  const patch = {
    ...persona,
    tenantId: scope.tenantId || persona.tenantId,
    storeId: scope.storeId || persona.storeId,
    branchId: scope.branchId || persona.branchId,
    lastReturnDate: nowIso,
    lastVisit: nowIso,
    totalSales,
    totalSpent: totalSales,
    lifetimeValue: totalSales,
    averageBill: totalBills > 0 ? Math.round(totalSales / totalBills) : 0,
    updatedAt: nowIso,
  };
  return { ...patch, ...recomputeFlags(patch, nowIso) };
};

export const migratePersonaFields = (doc = {}) => normalizePersonaFromDoc(doc);
