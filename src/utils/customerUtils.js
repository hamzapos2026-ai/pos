// File: src/utils/customerUtils.js
// ✅ FIXED: Removed reserved keyword 'import' usage
// ✅ MASTER PROMPT v9 — Customer name resolver

// ═══════════════════════════════════════════════════════════════════════════
// FALLBACK CUSTOMER CONFIG (if customerConfig.js not found)
// ═══════════════════════════════════════════════════════════════════════════
const DEFAULT_CUSTOMER_CONFIG = {
  WALK_IN_NAME: 'Walk-in Customer',
  WALK_IN_CITY: 'Karachi',
  WALK_IN_TYPE: 'walkin',
  WALK_IN_MARKET: '',
};

// Try to load from customerConfig.js, fallback to defaults
let CUSTOMER_CONFIG = DEFAULT_CUSTOMER_CONFIG;

try {
  // Dynamic import attempt (non-blocking)
  // If customerConfig.js exports CUSTOMER_CONFIG, use it
  const module = window.__CUSTOMER_CONFIG__;
  if (module && typeof module === 'object') {
    CUSTOMER_CONFIG = { ...DEFAULT_CUSTOMER_CONFIG, ...module };
  }
} catch {
  CUSTOMER_CONFIG = DEFAULT_CUSTOMER_CONFIG;
}

// ═══════════════════════════════════════════════════════════════════════════
// SEQUENTIAL COUNTER for "Customer 1, 2, 3..." numbering
// Resets daily
// ═══════════════════════════════════════════════════════════════════════════
const WALKIN_COUNTER_KEY = 'aone_walkin_counter';
const WALKIN_DATE_KEY = 'aone_walkin_date';

const _todayDate = () => new Date().toISOString().slice(0, 10);

const _getWalkInCounter = () => {
  try {
    const savedDate = localStorage.getItem(WALKIN_DATE_KEY);
    const today = _todayDate();

    // Reset if new day
    if (savedDate !== today) {
      localStorage.setItem(WALKIN_DATE_KEY, today);
      localStorage.setItem(WALKIN_COUNTER_KEY, '0');
      return 0;
    }

    return parseInt(localStorage.getItem(WALKIN_COUNTER_KEY) || '0', 10);
  } catch {
    return 0;
  }
};

const _incrementWalkInCounter = () => {
  try {
    const current = _getWalkInCounter();
    const next = current + 1;
    localStorage.setItem(WALKIN_COUNTER_KEY, String(next));
    localStorage.setItem(WALKIN_DATE_KEY, _todayDate());
    return next;
  } catch {
    return 1;
  }
};

// ── Detect fake auto-generated names ─────────────────────
const FAKE_NAME_PATTERNS = [
  /^customer\s*\d+$/i,           // "Customer 4"
  /^cust\s*\d+$/i,                // "Cust 4"
  /^walking\s*customer$/i,        // "Walking Customer"
  /^walk[-\s]?in[-\s]?customer$/i,// "Walk-in Customer"
  /^walk[-\s]?in$/i,              // "Walk-in"
  /^new\s*customer$/i,            // "New Customer"
  /^guest$/i,                     // "Guest"
  /^anonymous$/i,                 // "Anonymous"
];

const isFakeName = (name) => {
  if (!name) return true;
  const trimmed = String(name).trim();
  if (!trimmed) return true;
  return FAKE_NAME_PATTERNS.some((rx) => rx.test(trimmed));
};

// ── Phone normalization ──────────────────────────────────
export const normalizePhone = (phone) => {
  if (!phone) return "";
  const digits = String(phone).replace(/\D/g, "");
  if (!digits) return "";
  // Pakistan: 0300-1234567 or +92 300 1234567
  if (digits.startsWith("92") && digits.length === 12) {
    return "0" + digits.slice(2);
  }
  if (digits.length === 10 && digits.startsWith("3")) {
    return "0" + digits;
  }
  return digits;
};

// ── Get display name (NEVER returns fake names) ────────
export const resolveCustomerName = (customer) => {
  if (!customer) return CUSTOMER_CONFIG.WALK_IN_NAME || 'Walk-in Customer';

  // Try multiple field names
  const name = customer.name || customer.customerName || customer.fullName || "";
  const phone = customer.phone || customer.customerPhone || customer.mobile || "";

  const trimmedName = String(name).trim();
  const trimmedPhone = String(phone).trim();

  // ✅ Real name (not fake) — use as-is
  if (trimmedName && !isFakeName(trimmedName)) {
    return trimmedName;
  }

  // ✅ Sequential Customer (e.g. Customer 1, Customer 2) with a phone number is a valid registered customer!
  if (trimmedName && trimmedPhone && /^Customer\s*\d+$/i.test(trimmedName)) {
    return trimmedName;
  }

  // ✅ Phone-only: fallback label
  if (trimmedPhone) {
    return `Customer (${normalizePhone(trimmedPhone) || trimmedPhone})`;
  }

  // ✅ Final fallback: ONE shared "Walk-in Customer" record
  return CUSTOMER_CONFIG.WALK_IN_NAME || 'Walk-in Customer';
};

export const resolveCustomerPhone = (customer) => {
  if (!customer) return "";
  const phone = customer.phone || customer.customerPhone || customer.mobile || "";
  return normalizePhone(phone);
};

// ── Build customer object for saving (NEVER fake names) ──
export const buildCustomerObject = (input = {}) => {
  const {
    name = "",
    phone = "",
    city = CUSTOMER_CONFIG.WALK_IN_CITY || 'Karachi',
    market = "",
    email = "",
  } = input;

  const cleanName = String(name).trim();
  const cleanPhone = normalizePhone(phone);
  const isFake = isFakeName(cleanName);

  // ✅ Sequential Customer Name Check (e.g. Customer 1)
  const isSequentialName = cleanName && /^Customer\s*\d+$/i.test(cleanName);

  let finalName;
  let customerType;

  if (cleanName && !isFake) {
    // Rule 3: Has real name
    finalName = cleanName;
    customerType = "regular";
  } else if (cleanPhone) {
    // Rule 2: Phone-only — use sequential "Customer N" name
    // If they already have a sequential name loaded from DB, reuse it to avoid double-incrementing!
    if (isSequentialName) {
      finalName = cleanName;
    } else {
      finalName = getNextCustomerName();
    }
    customerType = "phone_only";
  } else {
    // Rule 1: No name + No phone — ONE shared "Walk-in Customer" record
    finalName = CUSTOMER_CONFIG.WALK_IN_NAME || 'Walk-in Customer';
    customerType = CUSTOMER_CONFIG.WALK_IN_TYPE || "walkin";
  }

  return {
    name: finalName,
    nameLower: finalName.toLowerCase(),
    phone: cleanPhone,
    city: String(city).trim(),
    market: String(market || "").trim(),
    email: String(email || "").trim().toLowerCase(),
    customerType,
  };
};

/**
 * Get next sequential "Customer N" name (resets daily)
 */
export const getNextCustomerName = () => {
  const next = _incrementWalkInCounter();
  return `Customer ${next}`;
};

/**
 * Peek next number without incrementing
 */
export const peekNextCustomerNumber = () => _getWalkInCounter() + 1;

/**
 * Reset daily counter
 */
export const resetCustomerCounter = () => {
  try {
    localStorage.removeItem(WALKIN_COUNTER_KEY);
    localStorage.removeItem(WALKIN_DATE_KEY);
  } catch { }
};

// ── Check if customer is "real" (has name or phone) ──────
export const isValidCustomer = (customer) => {
  if (!customer) return false;
  const name = String(customer.name || "").trim();
  const phone = String(customer.phone || "").trim();
  if (!name && !phone) return false;
  if (isFakeName(name) && !phone) return false;
  return true;
};

// ── Check if name is auto-generated ──────────────────────
export const isAutoGeneratedName = (name) => isFakeName(name);

export default {
  resolveCustomerName,
  resolveCustomerPhone,
  buildCustomerObject,
  normalizePhone,
  isValidCustomer,
  isAutoGeneratedName,
  getNextCustomerName,
  peekNextCustomerNumber,
  resetCustomerCounter,
};