import { warmInvoiceQr } from './invoiceQrCache';
import { resolveInvoiceBadges, enrichBillChannelForInvoice } from './billChannelUtils';

const resolveInvoiceBillerName = (order = {}) => {
  const candidates = [
    order.billerName,
    order.biller?.name,
    order.biller?.displayName,
    order.createdByName,
    order.billerSubmittedBy,
    order.submittedByName,
    order.createdBy,
    order.userName,
  ];
  return candidates.map((value) => String(value || '').trim()).find(Boolean) || '';
};

/** Count line items on an order record (any common field name). */
export const countOrderLineItems = (order) => {
  const raw = order?.items || order?.cartItems || order?.products || order?.bill_items || [];
  return Array.isArray(raw) ? raw.filter(Boolean).length : 0;
};

/** True when the bill has at least one priced/qty line — blocks empty invoice saves. */
export const isOrderSaveable = (order) => {
  const items = order?.items || order?.cartItems || order?.products || [];
  if (!Array.isArray(items) || items.length === 0) return false;
  return items.some((item) => {
    const qty = Number(item?.qty ?? item?.quantity ?? 0);
    const price = Number(item?.price ?? item?.rate ?? 0);
    return qty !== 0 || price > 0;
  });
};

/** Product name worth showing on invoice / biller table (skip blank / generic placeholders). */
export const hasDisplayProductName = (item) => {
  const name = String(item?.productName || item?.name || '').trim();
  if (!name) return false;
  if (/^item$/i.test(name)) return false;
  if (/^item\s*[-–—]?\s*\d*$/i.test(name)) return false;
  if (/^item\s+\d+$/i.test(name)) return false;
  if (/^item\s*[-–—]\s*item-/i.test(name)) return false;
  if (/^[-–—/\\|.\s]+$/.test(name)) return false;
  if (/^(n\/a|na|none|null|undefined)$/i.test(name)) return false;
  return true;
};

export const orderHasDisplayProductNames = (order) => {
  const items = order?.items || order?.cartItems || order?.products || [];
  return Array.isArray(items) && items.some(hasDisplayProductName);
};

/** Fill missing line items from local Dexie when Top 5 / cloud snapshot is header-only. */
export const hydrateOrderForInvoice = async (order, storeId) => {
  if (!order) return null;
  if (countOrderLineItems(order) > 0) return order;
  try {
    const { findBillRecordBySerial, getOrderById } = await import('../services/localBillService.js');
    const serial = order.billSerial || order.serialNo || order.billNo;
    if (serial && storeId) {
      const local = await findBillRecordBySerial(storeId, serial);
      if (local && countOrderLineItems(local) > 0) {
        return { ...local, ...order, items: local.items || local.cartItems || local.products };
      }
    }
    if (order.localId) {
      const byId = await getOrderById(order.localId);
      if (byId && countOrderLineItems(byId) > 0) {
        return { ...byId, ...order, items: byId.items || byId.cartItems || byId.products };
      }
    }
  } catch { /* ignore */ }
  return order;
};

/** Walk-in placeholder names — not shown as real customer names on invoice. */
export const isGenericWalkInName = (name = '') => {
  const n = String(name || '').trim();
  if (!n) return true;
  return [
    /^walking\s*customer$/i,
    /^walk-?in$/i,
    /^walk-?in\s*customer$/i,
  ].some((p) => p.test(n));
};

export const isNumberedCustomerName = (name = '') =>
  /^customer\s+\d+$/i.test(String(name || '').trim());

/**
 * Single customer line for invoice (thermal + A4 + reprints).
 * - Name + phone → "Fahad 03162502498"
 * - Phone only → "Customer 1", "Customer 2", …
 * - Name only → name
 * - Pure walk-in → "Walk-in Customer"
 */
export const formatInvoiceCustomerLine = (customer) => {
  if (!customer) return 'Walk-in Customer';
  const phone = String(customer.phone || customer.customerPhone || '').trim();
  const name = String(customer.name || customer.customerName || '').trim();

  const hasRealName = name && !isGenericWalkInName(name) && !isNumberedCustomerName(name);

  if (hasRealName && phone) return `${name} ${phone}`;
  if (hasRealName) return name;
  if (isNumberedCustomerName(name)) return name;
  if (phone && (isGenericWalkInName(name) || !name)) {
    return phone;
  }
  if (name && !isGenericWalkInName(name)) return name;
  return 'Walk-in Customer';
};

/** Positive qty only — used for piece counts / commission base. */
export const getBillableQty = (item) => Math.max(0, Number(item?.qty ?? 0));

/** Units reduced from original entry (Fraq less count). */
export const getItemQtyLess = (item) => {
  const orig = Number(item?.originalQty ?? item?.qty ?? 0);
  const cur = Number(item?.qty ?? 0);
  const diff = orig - cur;
  return Number.isFinite(diff) && diff > 0 ? diff : 0;
};

/** Net unit price after per-item discount. */
export const getItemNetUnitPrice = (item, discAmt = 0) => {
  const price = Number(item?.price || 0);
  const disc = Number(discAmt || 0);
  if (disc > 0) return price - disc;
  const discVal = Number(item?.discount || 0);
  const autoDisc = item?.discountType === 'percent'
    ? Math.round((price * discVal) / 100)
    : discVal;
  return price - autoDisc;
};

/** Line total — signed: price × qty (e.g. 100 × −3 = −300). */
export const getItemLineTotal = (item, discAmt = 0) => {
  return getItemNetUnitPrice(item, discAmt) * Number(item?.qty ?? 0);
};

/**
 * Fraq less in rupees — how much minimized from original.
 * qty < 0 → netUnit × qty (e.g. −300); else −netUnit × (orig − qty).
 */
export const getItemFraqLessAmount = (item, discAmt = 0) => {
  const netUnit = getItemNetUnitPrice(item, discAmt);
  const qty = Number(item?.qty ?? 0);
  const orig = Number(item?.originalQty ?? qty);
  if (qty >= orig) return 0;
  if (qty < 0) return netUnit * qty;
  return -netUnit * (orig - qty);
};

/** Price shown on row/invoice when qty is negative (−unit price). */
export const getItemDisplayUnitPrice = (item, discAmt = 0) => {
  const netUnit = getItemNetUnitPrice(item, discAmt);
  return Number(item?.qty ?? 0) < 0 ? -netUnit : netUnit;
};

/** @deprecated use getItemDisplayUnitPrice */
export const getItemEffectiveUnitPrice = getItemDisplayUnitPrice;

export const getItemDiscAmt = (item) => {
  const price = Number(item?.price || 0);
  const discVal = Number(item?.discount || 0);
  return item?.discountType === 'percent'
    ? Math.round((price * discVal) / 100)
    : discVal;
};

/** Sum of all line fraq-less amounts on an order. */
export const getOrderFraqLessTotal = (order) => {
  const items = order?.items || order?.bill_items || [];
  return items.reduce((sum, item) => sum + getItemFraqLessAmount(item, getItemDiscAmt(item)), 0);
};

/** Signed qty sum across all lines (e.g. −4). */
export const getOrderSignedQtyTotal = (order) => {
  const items = order?.items || order?.bill_items || [];
  return items.reduce((sum, item) => sum + Number(item?.qty ?? 0), 0);
};

/** Bill has minimize / negative-qty lines. */
export const hasNegativeQtyInvoice = (order) => {
  const items = order?.items || order?.bill_items || [];
  if (items.some((item) => Number(item?.qty ?? 0) < 0)) return true;
  return getOrderSignedQtyTotal(order) < 0;
};

/** Recompute bill total from line items (signed qty). */
export const computeOrderSubtotalFromItems = (order) => {
  const items = order?.items || order?.bill_items || [];
  return items.reduce((sum, item) => sum + getItemLineTotal(item, getItemDiscAmt(item)), 0);
};

/** Display total — recomputes from line items when stored total is wrong (e.g. legacy Math.max(0) saved 0). */
export const getOrderDisplayTotal = (order) => {
  const items = order?.items || order?.bill_items || [];
  const billDisc = Number(order?.billDiscountValue ?? order?.billDiscount ?? 0);

  let lineSubtotal = computeOrderSubtotalFromItems(order);
  if (items.length && lineSubtotal === 0) {
    const savedLineSum = items.reduce((s, item) => {
      const t = Number(item.total);
      if (Number.isFinite(t) && t !== 0) return s + t;
      return s + getItemLineTotal(item, getItemDiscAmt(item));
    }, 0);
    if (savedLineSum !== 0) lineSubtotal = savedLineSum;
  }

  const storedSubtotal = Number(order?.subtotal);
  const subtotal = lineSubtotal !== 0
    ? lineSubtotal
    : (Number.isFinite(storedSubtotal) ? storedSubtotal : 0);
  const computed = Math.round(subtotal - billDisc);

  const stored = Number(order?.totalAmount ?? order?.grandTotal ?? order?.total ?? NaN);
  if (!Number.isFinite(stored)) return computed;
  if (stored === 0 && computed !== 0) return computed;
  if (stored > 0 && computed < 0) return computed;
  return stored;
};

/** Last 6-digit segment for invoice QR / cashier scan (e.g. AON-BIL-050626-000032 → 000032) */
export const getInvoiceQrSerial = (serial) => {
  const raw = String(serial || '').trim();
  if (!raw || raw === '----') return '';
  return raw.toUpperCase();
};

/** Normalize store/branch data for InvoicePrint across all roles. */
export const normalizeStoreForInvoice = (store) => {
  if (!store) {
    return { name: 'A ONE JEWELRY', branchName: '', address: '', phone: '', email: '', tagline: '', ntn: '' };
  }
  return {
    name: store.storeName || store.name || store.businessName || 'A ONE JEWELRY',
    branchName: store.branchName || store.branch || store.branchLabel || store.storeCode || '',
    address: store.address || store.storeAddress || store.location || '',
    phone: store.phone || store.storePhone || store.contactPhone || '',
    email: store.email || store.storeEmail || '',
    tagline: store.tagline || store.slogan || '',
    ntn: store.ntn || store.taxNumber || store.ntnNumber || '',
    logo: store.logo || store.logoUrl || '',
    receiptFooter: store.receiptFooter || store.footerNote || '',
    website: store.website || '',
    businessHours: store.businessHours || '',
  };
};

/** Normalize order/bill records from Firebase, Dexie, or API shapes. */
export const normalizeOrderForInvoice = (order) => {
  if (!order) return null;
  const enriched = enrichBillChannelForInvoice(order);
  const items = enriched.items || enriched.bill_items || enriched.cartItems || enriched.products || [];
  const truthy = (v) => v === true || v === 'true' || v === 1;
  const normalized = {
    ...enriched,
    serialNo: enriched.serialNo || enriched.billSerial || enriched.billNo || '----',
    billSerial: enriched.billSerial || enriched.serialNo || enriched.billNo || '----',
    totalAmount: Number(enriched.totalAmount ?? enriched.grandTotal ?? enriched.total ?? 0),
    totalDiscount: Number(enriched.totalDiscount ?? 0),
    billDiscount: Number(enriched.billDiscount ?? enriched.billDiscountValue ?? 0),
    subtotal: Number(enriched.subtotal ?? 0),
    amountReceived: enriched.amountReceived ?? null,
    paidAmount: enriched.paidAmount ?? null,
    sendToCashier: enriched.sendToCashier,
    paidByRole: enriched.paidByRole || '',
    billerPaidAtBiller: enriched.billerPaidAtBiller,
    paidAt: enriched.paidAt,
    paidBy: enriched.paidBy,
    paidByName: enriched.paidByName,
    items: items.map((item) => ({
      ...item,
      productName: item.productName || item.name || '',
      qty: Number(item.qty || 1),
      originalQty: Number(item.originalQty ?? item.qty ?? 1),
      qtyLess: getItemQtyLess(item),
      fraqLessAmount: Number(item.fraqLessAmount ?? getItemFraqLessAmount(item, item.discountType === 'percent'
        ? Math.round((Number(item.price || 0) * Number(item.discount || 0)) / 100)
        : Number(item.discount || 0))),
      price: Number(item.price || 0),
      total: Number(item.total ?? getItemLineTotal(item, item.discountType === 'percent'
        ? Math.round((Number(item.price || 0) * Number(item.discount || 0)) / 100)
        : Number(item.discount || 0))),
    })),
    customer: (() => {
      const raw = order.customer || {
        name: order.customerName || '',
        phone: order.customerPhone || '',
        city: order.customerCity || '',
        market: order.customerMarket || '',
      };
      return { ...raw, name: raw.name || '', phone: raw.phone || '' };
    })(),
    createdAt: order.createdAt || order.savedAt || order.billerSubmittedAt,
    billStartTime: order.billStartTime || order.createdAt,
    billEndTime: order.billEndTime || order.createdAt,
    billerName: resolveInvoiceBillerName(enriched),
    paymentStatus: enriched.paymentStatus || enriched.status || '',
    dualMode: truthy(enriched.dualMode),
    dualModeCheckout: truthy(enriched.dualModeCheckout),
    wasDualModeCheckout: truthy(enriched.wasDualModeCheckout),
    wasSavedOffline: truthy(enriched.wasSavedOffline),
    wasBillerOfflinePayment: truthy(enriched.wasBillerOfflinePayment),
    wasCashierOfflinePayment: truthy(enriched.wasCashierOfflinePayment),
    isOfflineSync: truthy(enriched.isOfflineSync),
    cashierHandover: truthy(enriched.cashierHandover),
    savedOffline: truthy(enriched.wasSavedOffline) || truthy(enriched.savedOffline) || truthy(enriched.offlineBill),
    offlineBill: truthy(enriched.offlineBill),
    offlinePending: truthy(enriched.offlinePending),
    isLocalOnly: truthy(enriched.isLocalOnly),
  };
  normalized.totalAmount = getOrderDisplayTotal(normalized);
  return normalized;
};

/** Shared InvoicePrint props — same design/behavior for biller, cashier, admin, manager */
export const buildInvoicePrintProps = ({
  order,
  store,
  onClose,
  settings,
  extra = {},
}) => {
  const normalized = normalizeOrderForInvoice(order);
  const billerName = String(extra.billerName || normalized.billerName || '').trim();
  const badges = resolveInvoiceBadges(normalized, {
    showDualMode: extra.showDualMode,
    showOffline: extra.showOffline,
  });
  // Pre-warm QR immediately so modal opens with QR already in cache (<1s).
  warmInvoiceQr(normalized);
  return {
    order: normalized,
    store: normalizeStoreForInvoice(store),
    onClose,
    fontSize: settings?.fonts?.invoiceFontSize || 14,
    isReprint: false,
    billerName,
    showDualMode: badges.showDualMode,
    showOffline: badges.showOffline,
    showOfflineBillBadge: badges.showOfflineBillBadge,
    offlineLines: badges.offlineLines,
    ...extra,
  };
};
