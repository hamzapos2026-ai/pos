// src/utils/billIdGenerator.js
// ✅ PRODUCTION FINAL - Helper functions only
// Serial generation moved to serialService.js

/**
 * Stable unique ID for bill line items (React keys)
 */
export const generateLineItemId = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `li_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 11)}`;
};

/**
 * Fix duplicate/missing item IDs after draft restore
 */
export const ensureUniqueLineItemIds = (items) => {
  if (!Array.isArray(items)) return [];
  const seen = new Set();
  return items.map((item) => {
    const copy = { ...item };
    let id = copy.id;
    if (id === undefined || id === null || id === "" || seen.has(id)) {
      id = generateLineItemId();
    }
    seen.add(id);
    copy.id = id;
    if (copy.price != null && copy.price !== "") {
      const p = Number(copy.price);
      if (Number.isFinite(p)) copy.price = p;
    }
    return copy;
  });
};

/**
 * Get device ID (cached in localStorage)
 */
export const getDeviceId = () => {
  try {
    let id = localStorage.getItem("aone_device_id");
    if (!id) {
      id = Math.random().toString(36).slice(2, 10).toUpperCase();
      localStorage.setItem("aone_device_id", id);
    }
    return id;
  } catch {
    return "UNKNOWN";
  }
};

/**
 * Generate QR data for bill
 */
export const generateQRData = (bill) => {
  const secretKey = "AONE2026";
  const hash = generateHash(bill.billSerial || bill.billId, bill.total, secretKey);
  return JSON.stringify({
    id: bill.billSerial || bill.billId,
    amount: bill.total,
    timestamp: bill.createdAt,
    hash,
    store: bill.storeId,
  });
};

const generateHash = (id, amount, secret) => {
  const input = `${id}${amount}${secret}`;
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) - hash) + input.charCodeAt(i);
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16).toUpperCase().padStart(8, "0");
};

export const verifyQRData = (qrData, secret = "AONE2026") => {
  try {
    const data = typeof qrData === "string" ? JSON.parse(qrData) : qrData;
    const expectedHash = generateHash(data.id, data.amount, secret);
    return data.hash === expectedHash;
  } catch {
    return false;
  }
};

/**
 * Format counter to 6 digits (000001)
 */
export const pad6 = (n) => String(Math.max(1, Number(n) || 1)).padStart(6, "0");

/**
 * Get Pakistan date DDMMYY for display
 */
export const getShortDatePK = () => {
  const d = new Date(Date.now() + 5 * 3600000);
  return (
    String(d.getUTCDate()).padStart(2, "0") +
    String(d.getUTCMonth() + 1).padStart(2, "0") +
    String(d.getUTCFullYear()).slice(-2)
  );
};

/**
 * Build serial from components
 */
export const buildBillSerial = (storeCode, counter) => {
  const code = String(storeCode || "XXX").toUpperCase();
  return `${code}-BIL-${getShortDatePK()}-${pad6(counter)}`;
};

export default {
  generateLineItemId,
  ensureUniqueLineItemIds,
  getDeviceId,
  generateQRData,
  verifyQRData,
  pad6,
  getShortDatePK,
  buildBillSerial,
};