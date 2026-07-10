// src/pages/biller/BillerDashboard.jsx
// ✅ MASTER PROMPT v10 — SALESPERSON SYSTEM FULLY INTEGRATED
// ✅ §1:  Offline-first — IDB primary, Firebase secondary
// ✅ §2:  Calculator-speed billing engine
// ✅ §3:  Serial format BRANCH-USER-DATE-COUNTER, atomic locks
// ✅ §5:  Sync queue, retry, backoff, dead-letter
// ✅ §7:  RBAC — superAdmin check all variants
// ✅ §8:  BroadcastChannel unified 'aone_pos_orders'
// ✅ §9:  Multi-tab safe, shared serial
// ✅ §11: Zero UI lag, memo, callbacks
// ✅ v10 FIX: BillItemsTable replaces inline plain table
// ✅ v10 FIX: Salesperson UI conditional rendering, no gaps
// ✅ v10 FIX: Table always full-height when SP disabled

import {
  useEffect, useMemo, useRef, useState,
  useCallback, memo,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Loader2, Printer, Trash2, Clock3, WifiOff, Lock,
  ShoppingCart, Search, User, Package, X, CreditCard, Send, AlertCircle,
} from "lucide-react";
import {
  collection, addDoc, serverTimestamp,
  getDocs, getDoc, query, where, orderBy, limit, setDoc, doc,
} from "firebase/firestore";
import useBillerStallMonitor from "../../hooks/useBillerStallMonitor";

import { useTheme } from "../../context/ThemeContext";
import { useAuth } from "../../context/AuthContext";
import { useSettings } from "../../context/SettingsContext";
import { isDualModeEnabled } from "../../services/settingsStore";
import useBillerSettings from "./useBillerSettings";
import { useNetwork } from "../../context/NetworkContext";
import { getHasInternet } from "../../utils/networkReachability";
import { useSpeech } from "../../hooks/useSpeech";
import { useSound } from "../../hooks/useSound";
import { useLanguage } from "../../hooks/useLanguage";
import { useKeyboardShortcuts } from "../../hooks/useKeyboardShortcuts";
import useBillerHotkeys from "../../hooks/useBillerHotkeys";
import { resolveUserPrimaryBranch, billerRequiresBranch } from "../../utils/branchAccess";
import useStoresMap, { resolveStoreName, resolveEffectiveStoreId, resolveSerialBranchHint } from "../../hooks/useStoresMap";

import { db } from "../../services/firebase";
import { ensureDbReady } from "../../db/index";
import { createAuditLog, logActivity } from "../../services/activityLogger";
import { saveOrder, persistPendingOrderInstant } from "../../services/localBillService";
import { getStoreById, updateStore } from "../../services/storeService";
import {
  syncOfflineOrders, getOfflineOrdersCount,
} from "../../services/localSyncService";
import { recordBillDeletion } from "../../services/deletedBillsService";
import managerService from "../../services/managerService";
import {
  getNextItemSerial,
  claimSerialInstant, markSerialUsed, releaseSerialClaim, refreshOrdersMaxCache,
  syncSerialFromFirebase,
  orderExistsForSerial,
  getCurrentNextSerial,
  extractSerialNumber,
} from "../../services/serialService";
import {
  speakCountingPhrase,
  previewCountingSpeech,
  ensureSpeechVoices,
  ensureUrduVoicesReady,
  bindUrduCountingVoice,
  primeSpeechEngine,
  COUNTING_SPEED_DEFAULT,
  COUNTING_SPEED_MIN,
  COUNTING_SPEED_MAX,
} from "../../utils/countingSpeech";
import useNextSerial from "../../hooks/useNextSerial";
import { CUSTOMER_CONFIG, CITY_MARKETS } from "../../config/customerConfig";
import { BROADCAST_CHANNELS } from "../../config/channelConfig";
import { showBillerBillToast, showBillerToast } from "../../utils/billerOrderToast";
import { toast } from "react-hot-toast";
import { cn } from "../../utils/cn";
import {
  resolveCustomerName,
  buildCustomerObject,
} from "../../utils/customerUtils";
import {
  generateLineItemId, ensureUniqueLineItemIds,
} from "../../utils/billIdGenerator";
import draftService from "../../services/draftService";

import BillerHeader from "../../components/biller/BillerHeader";
import CustomerDialog, {
  resetPersistedCustomer,
  cachePreload,
} from "../../components/biller/CustomerDialog";
import BillSummary from "../../components/biller/BillSummary";
import InvoicePrint, { closeActivePrintWindow } from "../../components/biller/InvoicePrint";
import { buildInvoicePrintProps, hydrateOrderForInvoice, isOrderSaveable } from "../../utils/invoiceUtils";
import { buildBillChannelPatch, buildDualModeOrderFields, buildNormalCashierQueueFields, broadcastOrderSyncedPatch, broadcastCashierInstantOrder } from "../../utils/billChannelUtils";
import { normalizeCustomerForBill, isAutoCustomerName, isWalkIn, hasRealCustomerName, phoneDigitsKey, buildCustomerDocId, buildCustomerFirestorePayload, WALKING_CUSTOMER_NAME } from "../../utils/customerHelpers";
import { warmInvoiceQr } from "../../utils/invoiceQrCache";
import useSalesperson, { calcItemCommission } from "../../hooks/useSalesperson";
import { CurrentSPBar, CommissionSummaryPanel } from "../../components/biller/SalespersonSelector";
import BillItemsTable from "../../components/biller/BillItemsTable";
import BillerCollectPaymentModal from "../../components/biller/BillerCollectPaymentModal";
import { computeCommission } from "../../utils/commission";
import {
  pickDiscountSettings,
  computeMaxAllowedPerUnitFromPolicy,
  computeMaxItemDiscountPKR,
  computeItemLineDiscountPKR,
  getMaxBillDiscountPercent,
  getMaxBillSummaryDiscountPercent,
  getMaxBillSummaryDiscountPKR,
  computeBillDiscountValuePKR,
  getMaxItemDiscountPercent,
  isDiscountInputAllowed,
  showDiscountLimitToast,
  validateItemDiscountPKR,
} from "../../utils/discountPolicy";
import {
  isBillerOfflineDirectCheckout,
  isBillerOfflineAutoCollect,
} from "../../utils/roleUiSettings";
import { sanitizeProductNameInput } from "../../utils/validators";

const BILLING_CHANNEL = 'aone_pos_billing';
const CHECKOUT = { NONE: 0, CUSTOMER: 1, SUMMARY: 2, PROCEEDING: 3, PAYMENT: 4 };

const broadcastCheckoutF8 = () => {
  try {
    const ch = new BroadcastChannel(BILLING_CHANNEL);
    ch.postMessage({ type: 'CHECKOUT_ADVANCE_F8', timestamp: Date.now() });
    ch.close();
  } catch { /* ignore */ }
};

const broadcastPaymentComplete = (billSerial, amount, billerName) => {
  try {
    const ch = new BroadcastChannel(BILLING_CHANNEL);
    ch.postMessage({
      type: 'BILLER_PAYMENT_COMPLETE',
      billSerial: String(billSerial || '').trim(),
      amount: Number(amount) || 0,
      billerName: String(billerName || 'Biller').trim(),
      timestamp: Date.now(),
    });
    ch.close();
  } catch { /* ignore */ }
};

// ══════════════════════════════════════════════════════════════
// UTILITIES
// ══════════════════════════════════════════════════════════════
const _safeISO = (v) => {
  if (!v) return null;
  try {
    if (typeof v?.toDate === "function") return v.toDate().toISOString();
    if (typeof v?.seconds === "number") return new Date(v.seconds * 1000).toISOString();
    if (v instanceof Date) return isNaN(v.getTime()) ? null : v.toISOString();
    if (typeof v === "string" && v) { const d = new Date(v); return isNaN(d) ? null : d.toISOString(); }
    if (typeof v === "number" && v > 0) return new Date(v).toISOString();
    return null;
  } catch { return null; }
};

const _nowISO = () => new Date().toISOString();

const _todayDateStr = () => {
  const ms = Date.now() + 5 * 3600000;
  const d = new Date(ms);
  return (
    String(d.getUTCFullYear()) +
    String(d.getUTCMonth() + 1).padStart(2, "0") +
    String(d.getUTCDate()).padStart(2, "0")
  );
};

const _extractSerialNum = (serial) => {
  if (!serial || typeof serial !== "string") return 0;
  const parts = serial.split("-");
  for (let i = parts.length - 1; i >= 0; i--) {
    const n = parseInt(parts[i], 10);
    if (!isNaN(n) && n > 0 && parts[i].length <= 6) return n;
  }
  return 0;
};

const _isSuperAdminRole = (userData) => {
  const roles = Array.isArray(userData?.roles)
    ? userData.roles
    : userData?.role ? [userData.role] : [];
  return roles.some(r =>
    ["superAdmin", "superadmin", "super_admin"].includes(r)
  );
};

const _safeQty = (v) => {
  if (v === "" || v === undefined || v === null) return 1;
  const n = parseInt(String(v).replace(/\D/g, ""), 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
};

const generateLocalId = () => {
  return `local_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
};

// ══════════════════════════════════════════════════════════════
// CONSTANTS
// ══════════════════════════════════════════════════════════════
const MAX_TABS = 5;

const EMPTY_FORM = {
  productName: "", serialId: "", price: "",
  qty: 1, discount: "", discountType: "fixed",
};

/** Blank discount field = zero — never reuse lastEntryRef */
const parseEntryDiscount = (val) => {
  if (val === "" || val == null) return 0;
  const n = Number(String(val).replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

const DEFAULT_CUSTOMER = {
  name: CUSTOMER_CONFIG.WALK_IN_NAME,
  phone: "",
  city: CUSTOMER_CONFIG.WALK_IN_CITY,
  market: "",
};

const BASE_CITIES = Object.keys(CITY_MARKETS);

// ══════════════════════════════════════════════════════════════
// PURE UTILS
// ══════════════════════════════════════════════════════════════
const normalizePhone = (input = "") => {
  if (!input) return "";
  let p = String(input).trim().replace(/[\s\-()]/g, "");
  if (p.startsWith("+92")) p = "0" + p.slice(3);
  else if (p.startsWith("0092")) p = "0" + p.slice(4);
  else if (p.startsWith("92") && p.length === 12) p = "0" + p.slice(2);
  if (p.length === 10 && p.startsWith("3")) p = "0" + p;
  return p;
};

const fmt4 = (n) => String(Math.max(0, Number(n) || 0)).padStart(4, "0");
const fmtItemSerial = (n) => String(Math.max(1, Number(n) || 1));

/** Grand total for a tab (items + bill discount) — used on multitab bar */
  const computeTabGrandTotal = (tab, policy) => {
  const tabItems = tab?.items || [];
  if (!tabItems.length) return 0;
  let subtotal = 0;
  for (const i of tabItems) {
    const u = lineUnitPrice(i.price);
    const q = Number(i.qty || 0);
    const da = computeItemLineDiscountPKR({ ...i, price: u }, policy, u);
    subtotal += (u - da) * q;
  }
  const billDisc = Number(tab.billDiscount || 0);
  const billPct = getMaxBillDiscountPercent(policy);
  const maxBillDisc = Number.isFinite(billPct) && billPct !== Infinity
    ? Math.round((subtotal * billPct) / 100)
    : subtotal;
  const billDiscVal = Math.min(subtotal, Math.min(maxBillDisc, billDisc));
  return Math.round(subtotal - billDiscVal);
};

const formatTabTotalLabel = (amount) => {
  if (!amount || amount <= 0) return "";
  if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 100_000) return `${Math.round(amount / 1000)}k`;
  if (amount >= 10_000) return `${(amount / 1000).toFixed(1)}k`;
  return amount.toLocaleString();
};

const lineUnitPrice = (p) => {
  if (typeof p === "number" && Number.isFinite(p)) return Math.max(0, p);
  const n = Number(String(p ?? "").replace(/,/g, ""));
  return Number.isFinite(n) && n >= 0 ? n : 0;
};

const isSamePriceItem = (item, price, discount, salespersonId, productName = "") => {
  const sameBase =
    lineUnitPrice(item.price) === price &&
    Number(item.discount || 0) === Number(discount || 0) &&
    (item.salespersonId || "") === (salespersonId || "");
  if (!productName) return sameBase;
  return sameBase && (item.productName || "").trim().toLowerCase() === productName.trim().toLowerCase();
};

const mergeItemsByPrice = (items) => {
  const groups = new Map();
  const order = [];

  items.forEach((item) => {
    const nameKey = (item.productName || "").trim().toLowerCase();
    const key = `${lineUnitPrice(item.price)}|${Number(item.discount || 0)}|${item.discountType || 'percent'}|${item.salespersonId || ''}|${nameKey}`;
    if (!groups.has(key)) {
      groups.set(key, { ...item, qty: Number(item.qty || 0) });
      order.push(key);
      return;
    }
    const existing = groups.get(key);
    existing.qty = Number(existing.qty || 0) + Number(item.qty || 0);
    existing.originalQty = Number(existing.originalQty ?? existing.qty) + Number(item.originalQty ?? item.qty ?? 0);
  });

  return order.map((key) => groups.get(key));
};

const getFriendlyError = (err) => {
  if (!err) return "Something went wrong.";
  const msg = err?.message || String(err);
  const code = err?.code || "";
  if (
    code === "unavailable" ||
    msg.includes("INTERNET_DISCONNECTED") ||
    msg.includes("network-request-failed") ||
    msg.includes("Failed to fetch") ||
    msg.includes("offline")
  ) return "📴 No internet — bill saved offline.";
  if (code === "permission-denied") return "❌ Permission denied.";
  if (code === "already-exists") return "⚠️ Duplicate entry.";
  if (msg.includes("duplicate")) return "⚠️ Duplicate bill detected.";
  return "Save failed. Please try again.";
};

const _cleanItem = (item) => {
  const orig = Number(item.originalQty ?? item.qty ?? 0);
  const cur = Number(item.qty ?? 0);
  const qtyLess = Math.max(0, orig - cur);
  const res = {
    id: item.id, serialId: item.serialId, productName: item.productName,
    price: item.price, qty: item.qty, discount: item.discount,
    discountType: item.discountType,
    originalQty: orig || cur,
  };
  if (qtyLess > 0) res.qtyLess = qtyLess;
  if (item.salespersonId) {
    res.salespersonId = item.salespersonId;
    res.salespersonName = item.salespersonName;
    res.commissionPercent = item.commissionPercent;
    res.commissionType = item.commissionType;
    res.commissionFixed = item.commissionFixed;
  }
  return res;
};

const _prepareItemsForSave = (items, discountPolicy) => (items || []).map((item) => {
  const unit = lineUnitPrice(item.price);
  const discPkr = Math.max(0, Number(item.discount) || 0);
  const da = computeItemLineDiscountPKR(
    { ...item, discount: discPkr, discountType: 'fixed' },
    discountPolicy,
    unit,
  );
  return {
    serialId: item.serialId || "",
    productName: item.productName || "",
    price: unit,
    qty: Number(item.qty),
    originalQty: Number(item.originalQty ?? item.qty),
    qtyLess: Math.max(0, Number(item.originalQty ?? item.qty) - Number(item.qty)),
    fraqLessAmount: (() => {
      const q = Number(item.qty);
      const o = Number(item.originalQty ?? item.qty);
      const nu = unit - da;
      if (q >= o) return 0;
      if (q < 0) return nu * q;
      return -nu * (o - q);
    })(),
    discount: discPkr,
    discountType: 'fixed',
    total: (unit - da) * Number(item.qty),
    salespersonId: item.salespersonId || null,
    salespersonName: item.salespersonName || null,
    commissionPercent: item.commissionPercent !== undefined ? item.commissionPercent : null,
    commissionType: item.commissionType || null,
    commissionFixed: item.commissionFixed || null,
  };
});

// ══════════════════════════════════════════════════════════════
// CUSTOMER CACHE
// ══════════════════════════════════════════════════════════════
const _cc = { data: [], loaded: false, storeId: null, loading: false, loadedAt: 0 };
const CC_TTL = 120_000;

const _loadCC = async (storeId, force = false) => {
  const sid = storeId || "default";
  if (!force && _cc.loaded && _cc.storeId === sid && Date.now() - _cc.loadedAt < CC_TTL) return;
  if (_cc.loading || !getHasInternet()) return;
  _cc.loading = true;
  try {
    const { listCustomersForStore } = await import("../../repositories/customerRepository");
    const rows = await listCustomersForStore(sid, 1000);
    const seen = new Map();
    rows.forEach((c) => {
      const key = c.phone || c.name;
      if (key) seen.set(key, {
        name: c.name || "", phone: c.phone || "",
        city: c.city || "", market: c.market || "",
      });
    });
    _cc.data = [...seen.values()];
    _cc.loaded = true; _cc.storeId = sid; _cc.loadedAt = Date.now();
  } catch { /* ignore */ }
  finally { _cc.loading = false; }
};

const _enrichCC = async (storeId, billerId) => {
  if (!getHasInternet() || !storeId) return;
  try {
    const { listRecentOrdersByBiller } = await import("../../repositories/orderRepository");
    const orders = await listRecentOrdersByBiller(storeId, billerId, 100);
    orders.forEach((row) => {
      const c = row.customer || {};
      const key = c.phone || c.name;
      if (key && !_cc.data.find((x) => (x.phone || x.name) === key))
        _cc.data.push({
          name: c.name || "", phone: c.phone || "",
          city: c.city || "", market: c.market || "",
        });
    });
  } catch { /* ignore */ }
};

const _searchCC = (term) => {
  if (!term || term.length < 2) return [];
  const lower = term.toLowerCase(), digits = term.replace(/\D/g, "");
  const out = [];
  for (const c of _cc.data) {
    if (c.name?.toLowerCase().includes(lower) ||
      (digits.length >= 3 && c.phone?.replace(/\D/g, "").includes(digits)))
      out.push(c);
    if (out.length >= 10) break;
  }
  return out;
};

const _pushCC = (c) => {
  const key = c.phone || c.name;
  if (key && !_cc.data.find((x) => (x.phone || x.name) === key))
    _cc.data.unshift({
      name: c.name || "", phone: c.phone || "",
      city: c.city || "", market: c.market || "",
    });
};


const _saveCustomerBg = async (storeId, billerId, data) => {
  const phone = (data.phone || "").trim();
  const rawName = (data.name || "").trim();

  if (isWalkIn({ name: rawName }) && !phone) return;
  if (!phone && !rawName) return;
  if (!phone && isAutoCustomerName(rawName)) return;

  try {
    const { syncCustomerIdentity } = await import("../../services/customerPersonaService");
    await syncCustomerIdentity({
      customer: { ...data, name: rawName, phone },
      storeId: storeId || "default",
      branchId: storeId || "default",
      billerId,
      userId: billerId,
    });
  } catch { /* ignore */ }
  _pushCC({ ...data, name: rawName, phone });
};

// ══════════════════════════════════════════════════════════════
// DRAFT HELPERS
// ══════════════════════════════════════════════════════════════
const _saveDraft = (sid, uid, tabId, data) =>
  draftService.saveDraftLocal(sid, uid, tabId, data).catch(() => { });
const _clearDraft = (sid, uid, tabId) =>
  draftService.clearDraftLocal(sid, uid, tabId).catch(() => { });

const _isRealBillSerial = (serial) => {
  const s = String(serial || "").trim().toLowerCase();
  return s && s !== "----" && s !== "...." && s !== "0000" && s !== "loading...";
};

// ══════════════════════════════════════════════════════════════
// TAB FACTORY
// ══════════════════════════════════════════════════════════════
/** Unique per-bill draft key so an abandoned customer draft never leaks to the next bill. */
const _newBillSessionId = () =>
  `bill_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const createTabState = (tabId) => ({
  tabId, label: `Bill ${tabId}`,
  billSerial: "----", items: [],
  billSessionId: _newBillSessionId(),
  customer: { ...DEFAULT_CUSTOMER },
  custNameSearch: "", custPhoneSearch: "",
  billDiscount: 0, billDiscountType: "fixed",
  screenLocked: true, activeBill: false,
  billStartTime: null, billEndTime: null,
  f8Step: 0, paymentType: "cash",
  amountReceived: "", selectedRowIndex: -1,
  lastItemId: null, salespersonId: "",
});

/** Drop stale drafts when serial already saved on another device/profile */
const _sanitizeRestoredTab = async (tab, storeId, billerId) => {
  const serial = tab?.billSerial;
  if (!_isRealBillSerial(serial)) return tab;

  try {
    // ✅ Add timeout for offline scenarios — offline means this check will hang forever
    let exists = false;
    try {
      const existsPromise = orderExistsForSerial(serial);
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Timeout')), 2000)
      );
      exists = await Promise.race([existsPromise, timeoutPromise]);
    } catch (checkErr) {
      // ✅ If check times out or fails (expected when offline), just skip the existence check
      // The worst case is a duplicate serial gets used, which is caught during save
      console.warn("[Dashboard] Serial existence check failed (likely offline):", checkErr?.message);
      exists = false;
    }

    if (exists) {
      await _clearDraft(storeId, billerId, tab.tabId);
      return { ...createTabState(tab.tabId), label: tab.label || `Bill ${tab.tabId}` };
    }

    const serialNum = extractSerialNumber(serial);
    const nextNum = extractSerialNumber(getCurrentNextSerial());
    if (serialNum > 0 && nextNum > 0 && serialNum < nextNum) {
      return { ...tab, billSerial: "----" };
    }
  } catch (err) {
    console.warn("[Dashboard] Draft sanitize failed:", err?.message || err);
  }

  return tab;
};

// ══════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════
const Dashboard = () => {
  const { isDark } = useTheme();
  const { isOnline } = useNetwork();
  const { userData, isSuperAdmin } = useAuth();
  const { settings } = useSettings();
  const billerSettings = useBillerSettings() || {};
  const sound = useSound();
  const speech = useSpeech();
  const { t, isRTL, dir } = useLanguage();

  const COUNTING_KEY = `aone_sound_counting_${userData?.uid || 'default'}`;
  const [countingEnabled, setCountingEnabled] = useState(() => {
    try { return localStorage.getItem(COUNTING_KEY) === 'true'; } catch { return false; }
  });

  const COUNTING_LANG_KEY = `aone_sound_counting_lang_${userData?.uid || 'default'}`;
  const [countingLang, setCountingLang] = useState(() => {
    try {
      const v = localStorage.getItem(COUNTING_LANG_KEY) || 'ur';
      return v === 'en' ? 'en' : 'ur';
    } catch { return 'ur'; }
  });

  const COUNTING_SPEED_UR_KEY = `aone_counting_speed_ur_${userData?.uid || 'default'}`;
  const COUNTING_SPEED_EN_KEY = `aone_counting_speed_en_${userData?.uid || 'default'}`;

  const _readSpeed = (key, fallback) => {
    try {
      const v = parseFloat(localStorage.getItem(key));
      return Number.isFinite(v) && v >= COUNTING_SPEED_MIN && v <= COUNTING_SPEED_MAX
        ? v
        : fallback;
    } catch {
      return fallback;
    }
  };

  const [countingSpeedUr, setCountingSpeedUr] = useState(() =>
    _readSpeed(COUNTING_SPEED_UR_KEY, COUNTING_SPEED_DEFAULT),
  );
  const [countingSpeedEn, setCountingSpeedEn] = useState(() =>
    _readSpeed(COUNTING_SPEED_EN_KEY, COUNTING_SPEED_DEFAULT),
  );

  const countingSpeed = countingLang === 'en' ? countingSpeedEn : countingSpeedUr;
  const setCountingSpeed = useCallback((next) => {
    const val = typeof next === 'function'
      ? next(countingLang === 'en' ? countingSpeedEn : countingSpeedUr)
      : next;
    const clamped = Math.min(COUNTING_SPEED_MAX, Math.max(COUNTING_SPEED_MIN, Number(val) || COUNTING_SPEED_DEFAULT));
    if (countingLang === 'en') setCountingSpeedEn(clamped);
    else setCountingSpeedUr(clamped);
  }, [countingLang, countingSpeedEn, countingSpeedUr]);

  useEffect(() => {
    try { localStorage.setItem(COUNTING_KEY, String(countingEnabled)); } catch { }
  }, [countingEnabled, COUNTING_KEY]);

  useEffect(() => {
    try { localStorage.setItem(COUNTING_LANG_KEY, countingLang); } catch { }
    const prime = String(countingLang || '').toLowerCase().startsWith('ur')
      ? ensureUrduVoicesReady(2000).then(() => bindUrduCountingVoice())
      : ensureSpeechVoices();
    prime.then(() => primeSpeechEngine()).catch(() => {});
  }, [countingLang, COUNTING_LANG_KEY]);

  useEffect(() => {
    try { localStorage.setItem(COUNTING_SPEED_UR_KEY, String(countingSpeedUr)); } catch { }
  }, [countingSpeedUr, COUNTING_SPEED_UR_KEY]);

  useEffect(() => {
    try { localStorage.setItem(COUNTING_SPEED_EN_KEY, String(countingSpeedEn)); } catch { }
  }, [countingSpeedEn, COUNTING_SPEED_EN_KEY]);

  useEffect(() => {
    ensureUrduVoicesReady(2500)
      .then(() => bindUrduCountingVoice())
      .then(() => primeSpeechEngine())
      .catch(() => {});
  }, []);

  // ── Refs ──────────────────────────────────────────────────
  const priceInputRef = useRef(null);
  const qtyInputRef = useRef(null);
  const phoneInputRef = useRef(null);
  const discountInputRef = useRef(null);
  const tableContainerRef = useRef(null);
  const nameInputRef = useRef(null);
  const productNameRef = useRef(null);
  const searchTimerRef = useRef(null);
  const draftSaveTimer = useRef(null);
  const wifiTimerRef = useRef(null);

  const draftRestoredRef = useRef(false);
  const submittingRef = useRef(false);
  const deleteLockRef = useRef(false);
  const f8LockRef = useRef(false);
  const f8BusyRef = useRef(false);
  const f8GateRef = useRef(0);
  const checkoutPhaseRef = useRef(0);
  const customerSubmitRef = useRef(null);
  const printControlRef = useRef(null);
  const onSummaryProceedRef = useRef(() => {});
  const minusUsedRef = useRef(false);
  const minusWarnedRef = useRef(false);
  /** Each new line item grants one − use on the current bill serial. */
  const grantMinusAfterItemAdd = useCallback(() => {
    minusUsedRef.current = false;
    minusWarnedRef.current = false;
  }, []);
  const saveDoneRef = useRef(false);
  const wasOnlineRef = useRef(isOnline);
  const intentionalDupRef = useRef(false);
  const printModalOpenRef = useRef(false);
  const addItemLockRef = useRef(false);
  const broadcastChannelRef = useRef(null);

  const storeIdRef = useRef(resolveUserPrimaryBranch(userData) || "");
  const userUidRef = useRef(userData?.uid);
  const isOnlineRef = useRef(isOnline);

  const lastEntryRef = useRef({ price: "", qty: 1, discount: 0, discountType: "fixed" });

  // ── Settings ──────────────────────────────────────────────
  const showProductName = (billerSettings?.billerUI?.showProductName ?? settings?.billerUI?.showProductName) === true;
  // Super Admin product catalog (name-only, shared) → biller picks from a dropdown.
  const productCatalog = useMemo(() => {
    const arr = billerSettings?.productCatalog ?? settings?.productCatalog;
    return Array.isArray(arr) ? arr.filter((p) => (p?.name || "").trim()) : [];
  }, [billerSettings?.productCatalog, settings?.productCatalog]);
  // Use biller-scoped realtime settings when available (local DB sync)
  const showDiscountField = (billerSettings?.billerUI?.showDiscountField ?? settings?.billerUI?.showDiscountField) ?? true;

  // settings/discounts → value.maxAmount (PKR), maxPercent — live via useBillerSettings + Dexie cache
  const discountPolicy = useMemo(
    () => pickDiscountSettings(billerSettings, settings),
    [billerSettings, settings],
  );
  const allowBillDiscount = discountPolicy.allowBillDiscount !== false;
  const allowBillDiscountInSummary = discountPolicy.allowBillDiscountInSummary !== false;
  const allowBillDiscountSummaryPKR = discountPolicy.allowBillDiscountSummaryPKR !== false;
  const allowBillDiscountSummaryPercent = discountPolicy.allowBillDiscountSummaryPercent !== false;
  const allowItemDiscountPKR = discountPolicy.allowItemDiscountPKR !== false;
  const allowItemDiscountPercent = discountPolicy.allowItemDiscountPercent !== false;
  const allowBillDiscountPKR = discountPolicy.allowBillDiscountPKR !== false;
  const allowBillDiscountPercent = discountPolicy.allowBillDiscountPercent !== false;
  const maxBillDiscountPKR = discountPolicy.maxAmount === Infinity ? 0 : discountPolicy.maxAmount;
  const maxItemDiscountPercent = getMaxItemDiscountPercent(discountPolicy);
  const maxBillDiscountPercent = getMaxBillDiscountPercent(discountPolicy);
  const maxBillDiscountPercentNum = maxBillDiscountPercent === Infinity ? 0 : maxBillDiscountPercent;
  const maxSummaryDiscountPKR = getMaxBillSummaryDiscountPKR(discountPolicy);
  const maxSummaryDiscountPKRNum = maxSummaryDiscountPKR === Infinity ? 0 : maxSummaryDiscountPKR;
  const maxSummaryDiscountPercent = getMaxBillSummaryDiscountPercent(discountPolicy);
  const maxSummaryDiscountPercentNum = maxSummaryDiscountPercent === Infinity ? 0 : maxSummaryDiscountPercent;

  const computeMaxAllowedPerUnit = useCallback(
    (unitPrice) => computeMaxAllowedPerUnitFromPolicy(discountPolicy, unitPrice),
    [discountPolicy],
  );

  const customerCheckoutRules = useMemo(() => ({
    requireName: (billerSettings?.customer?.requireName ?? settings?.customer?.requireName) === true,
    requirePhone: (billerSettings?.customer?.requirePhone ?? settings?.customer?.requirePhone) === true,
  }), [billerSettings?.customer, settings?.customer]);

  const resolveSummaryDiscountType = useCallback(() => {
    if (allowBillDiscountSummaryPKR && !allowBillDiscountSummaryPercent) return "fixed";
    if (!allowBillDiscountSummaryPKR && allowBillDiscountSummaryPercent) return "percent";
    return discountPolicy.defaultBillSummaryDiscountType === "percent" ? "percent" : "fixed";
  }, [
    allowBillDiscountSummaryPKR, allowBillDiscountSummaryPercent,
    discountPolicy.defaultBillSummaryDiscountType,
  ]);

  const discountSettingForTable = useMemo(
    () => billerSettings?.discounts ?? billerSettings?.discount ?? settings?.discounts ?? settings?.discount ?? null,
    [billerSettings, settings],
  );

  // computeCommission imported from shared util
  const billerFontSize = settings?.fonts?.billerFontSize || 18;
  const billerEntryFontSize = settings?.fonts?.billerEntryFontSize || Math.max(billerFontSize + 4, 24);
  const billerTableFontSize = settings?.fonts?.billerTableFontSize || Math.max(billerFontSize + 1, 19);
  const totalFontSize = settings?.fonts?.totalFontSize || 32;
  const invoiceFontSize = settings?.fonts?.invoiceFontSize || 15;
  const branchId = resolveUserPrimaryBranch(userData);
  const storesMap = useStoresMap();
  const storeId = useMemo(
    () => resolveEffectiveStoreId(branchId, storesMap) || branchId,
    [branchId, storesMap],
  );
  const serialBranchHint = useMemo(
    () => resolveSerialBranchHint(storeId, storesMap, userData),
    [storeId, storesMap, userData],
  );
  const branchMissing = billerRequiresBranch(userData);
  const billerId = userData?.uid;
  const effectiveBillFlow = useMemo(
    () => ({ ...(settings?.billFlow || {}), ...(billerSettings?.billFlow || {}) }),
    [settings?.billFlow, billerSettings?.billFlow],
  );
  const offlineDirectCheckout = isBillerOfflineDirectCheckout({ billFlow: effectiveBillFlow });
  const offlineAutoCollect = isBillerOfflineAutoCollect({ billFlow: effectiveBillFlow });

  // ── Salesperson System ────────────────────────────────────
  const {
    enabled: salespersonEnabled,
    multiSP: salespersonMultiple,
    showColumn: showSalespersonColumn,
    required: salespersonRequireSelection,
    activeAgents: salespersonAgents,
    currentSPId,
    setCurrentSPId,
    currentAgent,
    enrichItem,
    reassignItem,
    buildCommissionSummary,
    validateAssignment,
    hasAgents,
  } = useSalesperson(billerSettings || {});

  const [showNoAgentsWarning, setShowNoAgentsWarning] = useState(false);
  const noAgentsWarnShownRef = useRef(false);
  useEffect(() => {
    if (!salespersonEnabled || hasAgents) {
      setShowNoAgentsWarning(false);
      return;
    }
    if (noAgentsWarnShownRef.current) return;
    noAgentsWarnShownRef.current = true;
    setShowNoAgentsWarning(true);
    toast('Salesperson enabled but no active agents. Contact SuperAdmin.', {
      icon: '⚠️',
      duration: 1000,
    });
    const timer = setTimeout(() => setShowNoAgentsWarning(false), 1000);
    return () => clearTimeout(timer);
  }, [salespersonEnabled, hasAgents]);

  const salespersonDefaultType = (billerSettings?.salesperson?.commissionType ?? settings?.salesperson?.commissionType) || "percent";
  const salespersonDefaultRate = Number(billerSettings?.salesperson?.commissionRate ?? settings?.salesperson?.commissionRate ?? 5);
  const salespersonDefaultFixed = Number(billerSettings?.salesperson?.commissionFixed ?? settings?.salesperson?.commissionFixed ?? 0);

  const normRoleKey = (r) => String(r || '').toLowerCase().replace(/[_\s-]/g, '');
  const userRoles = userData?.roles || (userData?.role ? [userData.role] : []);
  const userRolesNorm = userRoles.map(normRoleKey);
  const isDualRole = userRolesNorm.includes('biller') && userRolesNorm.includes('cashier');

  // ── Multi-tab state ───────────────────────────────────────
  const [tabs, setTabs] = useState(() => [createTabState(1)]);
  const [activeTabId, setActiveTabId] = useState(1);
  const [nextTabId, setNextTabId] = useState(2);
  const { serial: liveSerial, ready: serialReady } = useNextSerial({
    storeId, branchId, user: userData, enabled: Boolean(userData?.uid),
  });
  const nextPreviewSerial = liveSerial;

  const activeTab = useMemo(
    () => tabs.find((tb) => tb.tabId === activeTabId) || tabs[0],
    [tabs, activeTabId],
  );

  const updateTab = useCallback(
    (updater) => {
      setTabs((prev) =>
        prev.map((tab) =>
          tab.tabId === activeTabId
            ? typeof updater === "function" ? updater(tab) : { ...tab, ...updater }
            : tab,
        ),
      );
    },
    [activeTabId],
  );

  const {
    items, customer, billDiscount, billDiscountType,
    screenLocked, billStartTime, billEndTime, f8Step,
    paymentType, amountReceived, custNameSearch,
    custPhoneSearch, selectedRowIndex, lastItemId,
    billSerial: currentBillSerial, salespersonId,
    billSessionId: currentBillSessionId, activeBill,
  } = activeTab;

  /** Customer + summary always required on F8 checkout (no turbo skip). */
  // Sync tab's salespersonId → hook
  useEffect(() => {
    setCurrentSPId(salespersonId || null);
  }, [salespersonId, setCurrentSPId]);

  // ── UI state ──────────────────────────────────────────────
  const [submitting, setSubmitting] = useState(false);
  const [groupBySalesperson, setGroupBySalesperson] = useState(false);
  const mergeTouchedRef = useRef(false);
  /** Super Admin can disable merge entirely — hides bar + forces merge OFF at runtime. */
  const adminMergeEnabled = (billerSettings?.mergeItems ?? settings?.mergeItems) !== false;
  const [mergeItems, setMergeItems] = useState(() => {
    const adminDefault = billerSettings?.mergeItems ?? settings?.mergeItems;
    if (adminDefault === false) return false;
    try {
      const local = localStorage.getItem('aone_merge_items');
      if (local !== null) return local !== 'false';
    } catch { /* ignore */ }
    if (adminDefault === undefined) return true;
    return adminDefault !== false;
  });
  // Admin OFF → always force OFF + hide bar. Admin ON → biller local toggle respected.
  useEffect(() => {
    const adminDefault = billerSettings?.mergeItems ?? settings?.mergeItems;
    if (adminDefault === false) {
      setMergeItems(false);
      mergeTouchedRef.current = false;
      try { localStorage.removeItem('aone_merge_items'); } catch { /* ignore */ }
      return;
    }
    if (mergeTouchedRef.current) return;
    try {
      const local = localStorage.getItem('aone_merge_items');
      if (local !== null) {
        setMergeItems(local !== 'false');
        return;
      }
    } catch { /* ignore */ }
    if (adminDefault !== undefined) setMergeItems(adminDefault !== false);
  }, [billerSettings?.mergeItems, settings?.mergeItems]);
  const toggleMergeItems = () => {
    const next = !mergeItems;
    mergeTouchedRef.current = true;
    try { localStorage.setItem('aone_merge_items', String(next)); } catch {}
    setMergeItems(next);

    // ── Agar ON kiya → bill ke existing items ABHI merge karo ──
    if (next) {
      setTabs((prevTabs) =>
        prevTabs.map((tab) =>
          tab.tabId === activeTabId && tab.items?.length > 1
            ? { ...tab, items: mergeItemsByPrice(tab.items) }
            : tab,
        ),
      );
    }

    toast(
      () => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '20px' }}>{next ? '🔗' : '📋'}</span>
          <div>
            <p style={{ margin: 0, fontWeight: 700, fontSize: '13px', color: next ? '#34d399' : '#fbbf24' }}>
              Merge Items: {next ? 'ON' : 'OFF'}
            </p>
            <p style={{ margin: '2px 0 0', fontSize: '10px', color: '#9ca3af' }}>
              {next ? 'Bill ke same items merge ho gaye ✓' : 'Har item alag row mein rahega.'}
            </p>
          </div>
        </div>
      ),
      {
        id: 'merge-toggle-toast',
        duration: 2000,
        style: {
          background: '#12100a',
          border: `1px solid ${next ? 'rgba(52,211,153,0.4)' : 'rgba(251,191,36,0.4)'}`,
          borderRadius: '12px',
          padding: '10px 14px',
        },
        icon: null,
      },
    );
  };
  const _soundStorageKey = `aone_sound_mode_${userData?.uid || 'default'}`;
  const [soundEnabled, setSoundEnabled] = useState(() => {
    try {
      const saved = localStorage.getItem(`aone_sound_enabled_${userData?.uid || 'default'}`);
      return saved === null ? true : saved === 'true';
    } catch { return true; }
  });
  const [soundMode, setSoundMode] = useState(() => {
    try { return localStorage.getItem(_soundStorageKey) || 'counting'; }
    catch { return 'counting'; }
  });

  // Keep useSound in sync with dashboard sound toggle (same localStorage key)
  useEffect(() => {
    try { sound.setSoundEnabled?.(soundEnabled); } catch { }
  }, [soundEnabled, sound]);

  const [offlineCount, setOfflineCount] = useState(0);
  const [store, setStore] = useState(null);
  const [cashierModeActive, setCashierModeActive] = useState(false);
  const [directPaid, setDirectPaid] = useState(false);
  const [runtimeCities, setRuntimeCities] = useState([]);
  const [runtimeMarkets, setRuntimeMarkets] = useState([]);
  // Product Name dropdown (from Super Admin catalog)
  const [productSugOpen, setProductSugOpen] = useState(false);
  const [productSugIndex, setProductSugIndex] = useState(-1);
  const productSugItemRefs = useRef({});
  const [viewingOrder, setViewingOrder] = useState(null);
  const [viewInvoiceSeq, setViewInvoiceSeq] = useState(0);
  const [showRecentOrders, setShowRecentOrders] = useState(() =>
    settings?.showRecentOrders !== undefined ? settings.showRecentOrders : true
  );
  const [permissions, setPermissions] = useState({
    showTimestamps: true, allowCancelBill: true, allowCashierMode: false,
  });
  const [form, setForm] = useState(EMPTY_FORM);

  const MAX_PRODUCT_SUGGESTIONS = 20;
  const productCatalogResults = useMemo(() => {
    if (!showProductName || productCatalog.length === 0) return [];
    const q = (form.productName || "").trim().toLowerCase();
    const base = q
      ? productCatalog.filter((p) => (p.name || "").toLowerCase().includes(q))
      : productCatalog;
    return [...base].sort((a, b) =>
      String(a?.name || "").localeCompare(String(b?.name || ""), undefined, { sensitivity: 'base' })
    );
  }, [showProductName, productCatalog, form.productName]);
  const filteredProducts = useMemo(
    () => productCatalogResults.slice(0, MAX_PRODUCT_SUGGESTIONS),
    [productCatalogResults],
  );
  const productMatchCount = productCatalogResults.length;

  useEffect(() => {
    if (productSugIndex < 0 || filteredProducts.length === 0) return;
    const selected = filteredProducts[productSugIndex];
    const key = selected?.id ?? selected?.name;
    const el = key ? productSugItemRefs.current[key] : null;
    if (el?.scrollIntoView) {
      el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
    }
  }, [productSugIndex, filteredProducts]);

  useEffect(() => {
    productSugItemRefs.current = {};
  }, [filteredProducts]);

  const selectProductFromCatalog = useCallback((name) => {
    setForm((p) => ({ ...p, productName: sanitizeProductNameInput(name) }));
    setProductSugOpen(false);
    setProductSugIndex(-1);
    requestAnimationFrame(() => {
      priceInputRef.current?.focus();
      try { priceInputRef.current?.select(); } catch { /* ignore */ }
    });
  }, []);
  const [custSuggestions, setCustSuggestions] = useState([]);
  const [showSug, setShowSug] = useState(false);
  const [sugLoading, setSugLoading] = useState(false);
  const [activeField, setActiveField] = useState("");
  const [showCustomerDialog, setShowCustomerDialog] = useState(false);
  const [showSummaryPopup, setShowSummaryPopup] = useState(false);
  const [showCashierPayment, setShowCashierPayment] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [clearConfirmFocus, setClearConfirmFocus] = useState("cancel");
  const clearConfirmFocusRef = useRef("cancel");
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [printOrder, setPrintOrder] = useState(null);

  const canToggleCashierMode =
    isSuperAdmin || isDualRole || permissions.allowCashierMode;

  const dualModeEnabled = isDualModeEnabled(settings);

  const isAutoApproved =
    settings?.autoApproval?.autoApproval === true
    || (dualModeEnabled && cashierModeActive && canToggleCashierMode);

  // Dual button visible whenever user can toggle; locked until admin enables global dualMode
  const showDualButton = Boolean(canToggleCashierMode);

  // Super Admin OFF kare → biller pe dual mode auto band
  useEffect(() => {
    if (!dualModeEnabled && cashierModeActive) setCashierModeActive(false);
  }, [dualModeEnabled, cashierModeActive]);

  // ── Sync refs ─────────────────────────────────────────────
  useEffect(() => { storeIdRef.current = storeId; }, [storeId]);
  useEffect(() => { userUidRef.current = userData?.uid; }, [userData?.uid]);
  useEffect(() => { isOnlineRef.current = isOnline; }, [isOnline]);
  useEffect(() => { printModalOpenRef.current = showPrintModal; }, [showPrintModal]);

  const billModalOpen = useMemo(
    () => showSummaryPopup
      || showCustomerDialog
      || showCashierPayment
      || showClearConfirm
      || showPrintModal
      || Boolean(viewingOrder),
    [showSummaryPopup, showCustomerDialog, showCashierPayment, showClearConfirm, showPrintModal, viewingOrder],
  );

  useEffect(() => {
    if (billModalOpen) document.body.dataset.billerModalOpen = 'true';
    else delete document.body.dataset.billerModalOpen;
    return () => { delete document.body.dataset.billerModalOpen; };
  }, [billModalOpen]);

  const screenLockedRef = useRef(screenLocked);
  const billModalOpenRef = useRef(billModalOpen);
  useEffect(() => { screenLockedRef.current = screenLocked; }, [screenLocked]);
  useEffect(() => { billModalOpenRef.current = billModalOpen; }, [billModalOpen]);

  const focusPriceInput = useCallback(({ select = false, force = false } = {}) => {
    if (!force && (screenLockedRef.current || billModalOpenRef.current)) return;
    requestAnimationFrame(() => {
      if (!force && (screenLockedRef.current || billModalOpenRef.current)) return;
      const active = document.activeElement;
      if (!force && active?.dataset?.billInput === 'true') return;
      const el = priceInputRef.current;
      if (!el) return;
      el.focus({ preventScroll: true });
      if (select) {
        try { el.select(); } catch { /* ignore */ }
      }
    });
  }, []);

  const focusFirstEntryInput = useCallback(({ select = false, force = false } = {}) => {
    if (!force && (screenLockedRef.current || billModalOpenRef.current)) return;
    requestAnimationFrame(() => {
      if (!force && (screenLockedRef.current || billModalOpenRef.current)) return;
      const el = showProductName ? productNameRef.current : priceInputRef.current;
      if (!el) return;
      el.focus({ preventScroll: true });
      if (select) {
        try { el.select(); } catch { /* ignore */ }
      }
    });
  }, [showProductName]);

  useEffect(() => {
    if (billModalOpen) {
      const el = document.activeElement;
      if (el?.blur && el !== document.body && el !== document.documentElement) el.blur();
    } else if (!screenLocked) {
      focusFirstEntryInput();
    }
  }, [billModalOpen, screenLocked, focusFirstEntryInput]);

  // ── Derived totals (signed qty — negative lines reduce bill) ──
  const lineQty = useCallback((item) => Number(item?.qty || 0), []);

  const totalQty = useMemo(
    () => items.reduce((s, i) => s + lineQty(i), 0), [items, lineQty],
  );

  const totalDiscount = useMemo(
    () => items.reduce((s, i) => {
      const u = lineUnitPrice(i.price);
      const q = lineQty(i);
      const da = computeItemLineDiscountPKR(i, discountPolicy, u);
      return s + da * q;
    }, 0),
    [items, discountPolicy, lineQty],
  );

  const subtotal = useMemo(
    () => items.reduce((s, i) => {
      const u = lineUnitPrice(i.price);
      const q = lineQty(i);
      const da = computeItemLineDiscountPKR(i, discountPolicy, u);
      return s + (u - da) * q;
    }, 0),
    [items, discountPolicy, lineQty],
  );

  const billDiscountValue = useMemo(() => computeBillDiscountValuePKR(
    subtotal, billDiscount, billDiscountType,
    { maxPercent: maxBillDiscountPercentNum, maxPKR: maxBillDiscountPKR },
  ), [billDiscount, billDiscountType, subtotal, maxBillDiscountPercentNum, maxBillDiscountPKR]);

  const summaryBillDiscountValue = useMemo(() => computeBillDiscountValuePKR(
    subtotal, billDiscount, billDiscountType,
    { maxPercent: maxSummaryDiscountPercentNum, maxPKR: maxSummaryDiscountPKRNum },
  ), [billDiscount, billDiscountType, subtotal, maxSummaryDiscountPercentNum, maxSummaryDiscountPKRNum]);

  const summaryGrandTotal = useMemo(
    () => Math.round(subtotal - summaryBillDiscountValue),
    [subtotal, summaryBillDiscountValue],
  );

  const finalTotal = useMemo(
    () => Math.round(subtotal - billDiscountValue),
    [subtotal, billDiscountValue],
  );

  const selectedSalesperson = useMemo(
    () => salespersonAgents.find((a) => a.id === salespersonId) || null,
    [salespersonAgents, salespersonId],
  );

  const salespersonCommission = useMemo(() => {
    if (!salespersonEnabled || !hasAgents) return 0;

    if (salespersonMultiple) {
      let total = 0;
      items.forEach((item) => {
        if (item.salespersonId) {
          const rate = Number(
            item.commissionPercent
            ?? item.commissionRate
            ?? salespersonDefaultRate,
          );
          const unit = lineUnitPrice(item.price);
          const discAmt = computeItemLineDiscountPKR(item, discountPolicy, unit);
          const lineTotal = Math.max(0, (unit - discAmt) * item.qty);
          const comm = computeCommission({ type: 'percent', pct: rate, lineTotal, qty: item.qty });
          total += Math.max(0, Math.round(comm * 100) / 100);
        }
      });
      return total;
    }
    if (!selectedSalesperson || !salespersonId) return 0;
    const rate = Number(selectedSalesperson.commissionRate ?? salespersonDefaultRate);
    const comm = computeCommission({ type: 'percent', pct: rate, lineTotal: finalTotal, qty: totalQty });
    return Math.max(0, Math.round(comm * 100) / 100);
  }, [items, finalTotal, totalQty, salespersonEnabled, hasAgents, salespersonMultiple,
    selectedSalesperson, salespersonId, salespersonDefaultRate, discountPolicy]);

  const changeAmount = useMemo(() => {
    const r = Number(amountReceived || 0);
    return r > finalTotal ? r - finalTotal : 0;
  }, [amountReceived, finalTotal]);

  const hasAnyDiscount = useMemo(() => items.some((i) => Number(i.discount || 0) > 0), [items]);
  const showDiscColumn = hasAnyDiscount;

  const branchDisplayName = useMemo(
    () => resolveStoreName(branchId, storesMap, ""),
    [branchId, storesMap],
  );

  const storeInfo = useMemo(() => {
    const branchName = store?.storeName || store?.name || branchDisplayName;
    return {
      id: store?.id || storeId,
      name: branchName || settings?.store?.name || "STORE",
      storeName: branchName || settings?.store?.name || "STORE",
      tagline: store?.tagline || settings?.store?.tagline || "",
      address: store?.address || settings?.store?.address || "",
      phone: store?.phone || settings?.store?.phone || "",
      ntn: store?.ntn || store?.ntn || "",
    };
  }, [settings?.store, store, storeId, branchDisplayName]);

  // ── Sound / Speech ────────────────────────────────────────
  const play = useCallback(
    (n) => {
      if (!soundEnabled) return;
      try {
        if (n === "add") { sound.play(n); return; }
        if (soundMode === "music") sound.play(n);
      } catch { }
    },
    [soundEnabled, soundMode, sound],
  );

  const speakSeqRef = useRef(0);
  const speakEntry = useCallback((price, qty, options = {}) => {
    const force = options?.force === true;
    if (!force && !countingEnabled) return;
    const seq = ++speakSeqRef.current;
    const phraseLang = String(countingLang || 'ur').toLowerCase().startsWith('ur') ? 'ur' : 'en';
    const rate = phraseLang === 'ur' ? countingSpeedUr : countingSpeedEn;
    const disc = Math.max(0, Number(options?.discount) || 0);
    const unitPrice = Math.max(0, Math.floor(Number(price) || 0));
    const effectivePrice = Math.max(0, unitPrice - disc);
    const qtyVal = Math.max(1, Math.floor(Number(qty) || 1));
    void speakCountingPhrase(effectivePrice, qtyVal, phraseLang, { rate, speakGen: seq });
  }, [countingEnabled, countingLang, countingSpeedUr, countingSpeedEn]);

  const showToast = useCallback((text, type = "warning") => {
    showBillerToast(text, type);
  }, []);

  const setSoundExclusive = useCallback(
    (nextOrUpdater) => {
      const next = typeof nextOrUpdater === "function"
        ? nextOrUpdater(soundEnabled) : Boolean(nextOrUpdater);
      setSoundEnabled(next);
      try { sound.setSoundEnabled?.(next); } catch { }
      try { localStorage.setItem(`aone_sound_enabled_${userData?.uid || 'default'}`, String(next)); } catch { }
    },
    [soundEnabled, userData?.uid, sound],
  );

  const setSoundModeExclusive = useCallback((mode) => {
    setSoundMode(mode); setSoundEnabled(true);
    try {
      localStorage.setItem(`aone_sound_mode_${userData?.uid || 'default'}`, mode);
      localStorage.setItem(`aone_sound_enabled_${userData?.uid || 'default'}`, 'true');
    } catch { }
  }, [userData?.uid]);

  const fmtTime = useCallback((d) => {
    if (!d) return "--:--:--";
    const dd = d instanceof Date ? d : new Date(d);
    if (isNaN(dd)) return "--:--:--";
    return dd.toLocaleTimeString("en-PK", {
      hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true,
    });
  }, []);

  const stallConfig = billerSettings?.billerStall || settings?.billerStall;

  const { stallAlert, clearStallAlert } = useBillerStallMonitor({
    config: stallConfig,
    enabled: Boolean(userData?.uid),
    billerId: billerId || userData?.uid,
    billerName: userData?.displayName || userData?.name || userData?.email || '',
    storeId,
    activeBill,
    screenLocked,
    billStartTime,
    billSerial: currentBillSerial,
    tabLabel: activeTab?.label,
    showPrintModal,
    viewingOrder,
    playSound: play,
    // Only real (non-removed) items count as an active bill. A fresh unlock with no
    // items, or a bill whose rows were all removed = biller waiting, no customer →
    // no idle/too-long time alert.
    hasItems: items.some((i) => !i.isRemoved),
  });

  const refreshOfflineCount = useCallback(() => {
    getOfflineOrdersCount().then(setOfflineCount).catch(() => { });
  }, []);

  // ── Log helpers ───────────────────────────────────────────
  const logClearedData = useCallback(
    (cleared, reason) => {
      if (!cleared?.length) return;
      addDoc(collection(db, "clearedData"), {
        type: "item_cleared",
        serialNo: currentBillSerial,
        items: cleared.map(_cleanItem),
        reason,
        billerName: userData?.name || "Unknown",
        billerId: billerId || null,
        storeId,
        deletedAt: serverTimestamp(),
        date: new Date().toISOString().split("T")[0],
      }).catch(() => { });
    },
    [currentBillSerial, userData, billerId, storeId],
  );

  const logClearedBill = useCallback(
    (billItems, reason) => {
      if (!billItems?.length) return;
      addDoc(collection(db, "clearedData"), {
        type: "bill_cleared",
        serialNo: currentBillSerial,
        items: billItems.map(_cleanItem),
        reason,
        customer: { ...customer },
        billerName: userData?.name || "Unknown",
        billerId: billerId || null,
        storeId,
        deletedAt: serverTimestamp(),
        date: new Date().toISOString().split("T")[0],
      }).catch(() => { });
    },
    [currentBillSerial, customer, userData, billerId, storeId],
  );

  // ── BroadcastChannel ──────────────────────────────────────
  useEffect(() => {
    const channel = new BroadcastChannel(BROADCAST_CHANNELS.ORDERS);
    broadcastChannelRef.current = channel;
    channel.onmessage = (event) => {
      const { type, billSerial, count, serials, localId } = event.data || {};

      if (type === "new_order" || type === "BILL_SAVED") {
        refreshOfflineCount();
        return;
      }

      if (type === "SYNC_COMPLETE") {
        refreshOfflineCount();
        return;
      }

      if (type === "SYNC_BATCH_COMPLETE") {
        toast.success(
          `☁️ ${count} bill${count > 1 ? 's' : ''} synced!\n${(serials || []).slice(0, 3).join(', ')}${serials?.length > 3 ? '…' : ''}`,
          { id: 'sync_batch', duration: 4500, icon: '✅' }
        );
        refreshOfflineCount();
        return;
      }

      if (type === "SYNC_FAILED") {
        toast.error(
          `❌ Bill #${billSerial || localId || 'unknown'} sync failed permanently. Admin → Sync Monitor to retry.`,
          { id: `syncfail_${billSerial || localId}`, duration: 8000 },
        );
        refreshOfflineCount();
      }

      if (type === "ORDER_DELETED" || type === "order_deleted") {
        console.log(`[Dashboard] Order deleted: ${billSerial} (localId: ${localId})`);
        refreshOfflineCount();
        return;
      }
    };
    return () => channel.close();
  }, [refreshOfflineCount]);

  // ── F8 lock — only during serial claim / save, not step navigation ──
  const releaseF8Lock = useCallback(() => {
    f8LockRef.current = false;
  }, []);

  /** One checkout screen at a time — ref + state stay in sync (instant, no overlap). */
  const setCheckoutStep = useCallback((step) => {
    checkoutPhaseRef.current = step;
    setShowCustomerDialog(step === CHECKOUT.CUSTOMER);
    setShowSummaryPopup(step === CHECKOUT.SUMMARY);
    setShowCashierPayment(step === CHECKOUT.PAYMENT);
  }, []);

  // ══════════════════════════════════════════════════════════════
  // MULTI-TAB MANAGEMENT
  // ══════════════════════════════════════════════════════════════
  const addNewTab = useCallback(() => {
    if (tabs.length >= MAX_TABS) { showToast(`Max ${MAX_TABS} bills allowed.`); return; }
    const id = nextTabId;
    setTabs((prev) => [...prev, createTabState(id)]);
    setActiveTabId(id);
    setNextTabId((n) => n + 1);
    setForm(EMPTY_FORM);
    lastEntryRef.current = { price: "", qty: 1, discount: 0, discountType: "fixed" };
    play("unlock");
    showToast(`Bill ${id} ready. Press INSERT to start.`, "success");
  }, [tabs.length, nextTabId, play, showToast]);

  const closeTab = useCallback(
    (tabId) => {
      if (tabs.length <= 1) { showToast("Cannot close last bill."); return; }
      const tab = tabs.find((tb) => tb.tabId === tabId);
      if (tab?.items?.length > 0)
        if (!window.confirm(`Close Bill ${tabId}? Items will be lost.`)) return;
      _clearDraft(storeId, billerId, tabId);
      setTabs((prev) => {
        const remaining = prev.filter((tb) => tb.tabId !== tabId);
        if (tabId === activeTabId) setActiveTabId(remaining[remaining.length - 1]?.tabId);
        return remaining;
      });
    },
    [tabs, activeTabId, storeId, billerId, showToast],
  );

  const switchTab = useCallback(
    (tabId) => {
      if (tabId === activeTabId) return;
      const currentTab = tabs.find((tb) => tb.tabId === activeTabId);
      if (currentTab) {
        const idle = currentTab.screenLocked && currentTab.items.length === 0 && !currentTab.activeBill;
        if (!idle) {
          _saveDraft(storeId, billerId, currentTab.tabId, { v: 7, ...currentTab });
        }
      }
      setActiveTabId(tabId);
      setForm(EMPTY_FORM);
      lastEntryRef.current = { price: "", qty: 1, discount: 0, discountType: "fixed" };
      setShowSug(false); setCustSuggestions([]);
      focusPriceInput({ force: true });
    },
    [activeTabId, tabs, storeId, billerId],
  );

  // ══════════════════════════════════════════════════════════════
  // DRAFT SYSTEM
  // ══════════════════════════════════════════════════════════════
  const saveDraft = useCallback(() => {
    tabs.forEach((tab) => {
      const idle = tab.screenLocked && tab.items.length === 0 && !tab.activeBill;
      if (idle) { _clearDraft(storeId, billerId, tab.tabId); return; }
      _saveDraft(storeId, billerId, tab.tabId, { v: 7, ...tab });
    });
  }, [tabs, storeId, billerId]);

  useEffect(() => {
    if (!userData?.uid) return;
    clearTimeout(draftSaveTimer.current);
    draftSaveTimer.current = setTimeout(saveDraft, 100);
    return () => clearTimeout(draftSaveTimer.current);
  }, [saveDraft, userData?.uid]);

  // ══════════════════════════════════════════════════════════════
  // INIT + live branch switch
  // ══════════════════════════════════════════════════════════════
  const lastSerialKeyRef = useRef('');
  useEffect(() => {
    if (!userData?.uid || !storeId) return;
    const serialKey = `${storeId}::${serialBranchHint || ''}`;
    if (lastSerialKeyRef.current === serialKey) return;
    lastSerialKeyRef.current = serialKey;

    syncSerialFromFirebase(storeId, userData, serialBranchHint).catch(() => {});
    refreshOrdersMaxCache(storeId).catch(() => {});
    cachePreload(storeId);

    if (isOnline) {
      _loadCC(storeId).catch(() => { });
      getStoreById(storeId).then((s) => { if (s) setStore(s); }).catch(() => { });
    }
  }, [userData?.uid, storeId, serialBranchHint, isOnline]);

  // ✅ PHASE 2: Draft restoration — async, non-blocking, happens after render
  useEffect(() => {
    if (!userData?.uid || draftRestoredRef.current) return;
    // ✅ Schedule draft restoration asynchronously so it doesn't block initial render
    const timer = setTimeout(async () => {
      if (draftRestoredRef.current) return;
      draftRestoredRef.current = true;
      try {
        const loaded = await draftService.loadAllUserDrafts(storeId, billerId);
        const raw = (loaded || [])
          .map((d) => d.data)
          .filter((data) => data?.v === 7 && data.tabId)
          .map((data) => {
            const merged = { ...createTabState(data.tabId), ...data };
            return { ...merged, items: ensureUniqueLineItemIds(merged.items || []) };
          });

        if (!raw.length) return;

        const valid = [];
        let clearedCount = 0;
        let expiredSerialCount = 0;

        for (const tab of raw) {
          const sanitized = await _sanitizeRestoredTab(tab, storeId, billerId);
          const wasDuplicate = _isRealBillSerial(tab.billSerial)
            && sanitized.billSerial === "----"
            && !sanitized.activeBill
            && !(sanitized.items?.length);
          const wasExpired = _isRealBillSerial(tab.billSerial)
            && sanitized.billSerial === "----"
            && (sanitized.items?.length || sanitized.activeBill);

          if (wasDuplicate) clearedCount += 1;
          else if (wasExpired) expiredSerialCount += 1;

          valid.push(sanitized);
        }

        const maxId = Math.max(...valid.map((t) => t.tabId));
        setTabs(valid);
        setActiveTabId(valid[0].tabId);
        setNextTabId(maxId + 1);

        if (clearedCount > 0) {
          showToast(`${clearedCount} old draft(s) already saved — cleared`, "warning");
        } else if (expiredSerialCount > 0) {
          showToast("Old serial expired — new serial on checkout", "warning");
        } else {
          showToast(`Recovered ${valid.length} draft bill(s)!`, "success");
        }
      } catch (err) {
        console.error("[Dashboard] Draft restore failed:", err);
      }
      lastEntryRef.current = { price: "", qty: 1, discount: 0, discountType: "fixed" };
    }, 50);
    return () => clearTimeout(timer);
  }, [userData?.uid, storeId, billerId, showToast]);

  useEffect(() => () => {
    lastSerialKeyRef.current = '';
    draftRestoredRef.current = false;
    _cc.loaded = false; _cc.storeId = null;
    clearTimeout(wifiTimerRef.current);
  }, [userData?.uid]);

  useEffect(() => {
    const prev = wasOnlineRef.current;
    wasOnlineRef.current = isOnline;
    if (prev === isOnline) return;
    if (!isOnline) {
      toast("📴 Offline — bills save locally", { duration: 2500, icon: "📴" });
      ensureUrduVoicesReady().then(() => primeSpeechEngine()).catch(() => {});
      return;
    }
    toast.success("🌐 Back online! Syncing...", { duration: 1500 });
    syncSerialFromFirebase(storeIdRef.current, userData, serialBranchHint).catch(() => {});
    refreshOrdersMaxCache(storeIdRef.current).catch(() => {});
    clearTimeout(wifiTimerRef.current);
    wifiTimerRef.current = setTimeout(async () => {
      const sid = storeIdRef.current;
      try {
        const result = await syncOfflineOrders();
        if (result?.synced > 0) {
          toast.success(`✅ ${result.synced} bills synced!`, { duration: 3000 });
          refreshOfflineCount();
        }
        if (sid) {
          const { dedupeDuplicateSerialOrdersOnCloud } = await import('../../services/paidBillIndexService');
          await dedupeDuplicateSerialOrdersOnCloud(sid).catch(() => {});
        }
      } catch { }
      try { await syncSerialFromFirebase(sid, userData, serialBranchHint); } catch { }
      try { const s = await getStoreById(sid); if (s) setStore(s); } catch { }
      _loadCC(sid, true).catch(() => { });
      _enrichCC(sid, userUidRef.current).catch(() => { });
    }, 600);
    return () => clearTimeout(wifiTimerRef.current);
  }, [isOnline, refreshOfflineCount]);

  useEffect(() => {
    if (!userData?.uid || !storeId) return;
    getStoreById(storeId).then((s) => { setStore(s || null); }).catch(() => { });
    if (isOnline) _enrichCC(storeId, userData.uid).catch(() => { });
    refreshOfflineCount();
  }, [storeId, userData?.uid, userData?.primaryStore, userData?.storeIds, isOnline, refreshOfflineCount]);

  useEffect(() => { void ensureDbReady(); }, []);

  useEffect(() => { const t = setInterval(refreshOfflineCount, 30_000); return () => clearInterval(t); }, [refreshOfflineCount]);
  const prevScreenLockedRef = useRef(screenLocked);
  useEffect(() => {
    const wasLocked = prevScreenLockedRef.current;
    prevScreenLockedRef.current = screenLocked;
    if (wasLocked && !screenLocked) {
      minusUsedRef.current = false;
      minusWarnedRef.current = false;
      focusPriceInput({ select: true, force: true });
    }
  }, [screenLocked, focusPriceInput]);
  useEffect(() => { if (store?.billerPermissions) setPermissions((p) => ({ ...p, ...store.billerPermissions })); }, [store]);

  useEffect(() => {
    if (settings?.customer?.defaultCustomerName && !activeTab?.activeBill) {
      updateTab((tab) => ({
        ...tab,
        customer: { ...tab.customer, name: settings.customer.defaultCustomerName },
      }));
    }
  }, [settings?.customer?.defaultCustomerName, activeTab?.activeBill, updateTab]);

  useEffect(() => {
    if (!tableContainerRef.current || items.length === 0) return;
    const t = setTimeout(() => {
      if (tableContainerRef.current)
        tableContainerRef.current.scrollTop = tableContainerRef.current.scrollHeight;
    }, 20);
    return () => clearTimeout(t);
  }, [items.length]);

  useEffect(() => {
    if (selectedRowIndex < 0 || !tableContainerRef.current) return;
    const t = setTimeout(() => {
      tableContainerRef.current
        ?.querySelectorAll("tbody tr")
        ?.[selectedRowIndex]
        ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }, 30);
    return () => clearTimeout(t);
  }, [selectedRowIndex]);

  useEffect(() => {
    if (items.length > 0 && selectedRowIndex < 0) {
      updateTab({ selectedRowIndex: items.length - 1 });
    }
  }, [items.length, selectedRowIndex, updateTab]);

  // ══════════════════════════════════════════════════════════════
  // RESET BILL
  // ══════════════════════════════════════════════════════════════
  const resetBill = useCallback(() => {
    // Wipe this bill's customer draft so typed-but-abandoned details never carry over.
    if (currentBillSessionId) resetPersistedCustomer(currentBillSessionId);
    if (currentBillSerial) resetPersistedCustomer(currentBillSerial);
    submittingRef.current = false;
    minusUsedRef.current = false; minusWarnedRef.current = false; deleteLockRef.current = false;
    saveDoneRef.current = false;
    checkoutPhaseRef.current = 0;
    intentionalDupRef.current = false;
    setCurrentSPId(null);
    const defName = settings?.customer?.defaultCustomerName || CUSTOMER_CONFIG.WALK_IN_NAME;
    updateTab({
      items: [], selectedRowIndex: -1, lastItemId: null,
      billSerial: "----",
      billSessionId: _newBillSessionId(),
      customer: { name: defName, phone: "", city: CUSTOMER_CONFIG.WALK_IN_CITY, market: "" },
      custNameSearch: "", custPhoneSearch: "",
      billDiscount: 0, billDiscountType: "fixed",
      f8Step: 0, paymentType: "cash", amountReceived: "",
      activeBill: false, screenLocked: true,
      billStartTime: null, billEndTime: null,
      salespersonId: "",
    });
    setCustSuggestions([]); setShowSug(false);
    setActiveField(""); setForm(EMPTY_FORM);
    lastEntryRef.current = { price: "", qty: 1, discount: 0, discountType: "fixed" };
    setCheckoutStep(CHECKOUT.NONE);
    _clearDraft(storeId, billerId, activeTabId);
  }, [currentBillSerial, currentBillSessionId, settings?.customer?.defaultCustomerName,
    updateTab, storeId, billerId, activeTabId, setCurrentSPId, setCheckoutStep]);

  const handleSelectSalesperson = useCallback((id) => {
    setCurrentSPId(id);
    updateTab({ salespersonId: id });
    if (salespersonEnabled && !screenLocked) {
      queueMicrotask(() => {
        focusFirstEntryInput({ force: true, select: true });
      });
    }
  }, [setCurrentSPId, updateTab, salespersonEnabled, screenLocked, focusFirstEntryInput]);

  const handleReassignItem = useCallback((item, agentId) => {
    updateTab((tab) => ({
      ...tab,
      items: tab.items.map((i) =>
        i.id === item.id ? reassignItem(i, agentId) : i
      ),
    }));
    try {
      const agent = salespersonAgents.find((a) => a.id === agentId) || null;
      logActivity("ITEM_SALESPERSON_REASSIGN", userData?.uid, storeId, {
        itemId: item.id,
        salespersonId: agentId || null,
        salespersonName: agent?.name || null,
        serialNo: currentBillSerial || "----",
      }).catch(() => {});
    } catch (e) { /* ignore */ }
  }, [reassignItem, updateTab]);

  const _afterClear = useCallback(async () => {
    saveDoneRef.current = false;
    resetBill();
    play("delete");
  }, [resetBill, play]);

  // ══════════════════════════════════════════════════════════════
  // CUSTOMER SEARCH
  // ══════════════════════════════════════════════════════════════
  const doSearch = useCallback(async (term) => {
    if (!term || term.length < 2) {
      setCustSuggestions([]); setShowSug(false); setSugLoading(false); return;
    }
    const mem = _searchCC(term);
    if (mem.length > 0) { setCustSuggestions(mem); setShowSug(true); setSugLoading(false); return; }
    setSugLoading(true); setShowSug(true);
    await _loadCC(storeIdRef.current);
    const results = _searchCC(term);
    setCustSuggestions(results); setShowSug(results.length > 0); setSugLoading(false);
  }, []);

  const onNameChange = useCallback((v) => {
    updateTab((tab) => ({
      ...tab, custNameSearch: v, customer: { ...tab.customer, name: v },
    }));
    setActiveField("name");
    clearTimeout(searchTimerRef.current);
    if (!v || v.length < 2) { setCustSuggestions([]); setShowSug(false); return; }
    searchTimerRef.current = setTimeout(() => doSearch(v), 150);
  }, [doSearch, updateTab]);

  const onPhoneChange = useCallback((raw) => {
    const clean = raw.replace(/[^0-9+]/g, "");
    updateTab((tab) => ({
      ...tab, custPhoneSearch: clean, customer: { ...tab.customer, phone: clean },
    }));
    setActiveField("phone");
    clearTimeout(searchTimerRef.current);
    if (!clean || clean.length < 3) { setCustSuggestions([]); setShowSug(false); return; }
    searchTimerRef.current = setTimeout(() => doSearch(clean), 150);
  }, [doSearch, updateTab]);

  const onCityChange = useCallback((city) => {
    updateTab((tab) => ({ ...tab, customer: { ...tab.customer, city: city || CUSTOMER_CONFIG.WALK_IN_CITY, market: "" } }));
  }, [updateTab]);

  const onMarketChange = useCallback((market) => {
    updateTab((tab) => ({ ...tab, customer: { ...tab.customer, market } }));
  }, [updateTab]);

  const onSelectSuggestion = useCallback((c) => {
    updateTab({
      customer: { name: c.name || "", phone: c.phone || "", city: c.city || CUSTOMER_CONFIG.WALK_IN_CITY, market: c.market || "" },
      custNameSearch: c.name || "", custPhoneSearch: c.phone || "",
    });
    setShowSug(false); setCustSuggestions([]); setActiveField("");
    focusPriceInput({ force: true });
  }, [updateTab]);

  const openCustDialog = useCallback(() => {
    if (screenLocked) { showToast("Press INSERT first.", "error"); return; }
    setCheckoutStep(CHECKOUT.CUSTOMER); updateTab({ f8Step: 1 }); play("keyPress");
  }, [screenLocked, play, showToast, updateTab, setCheckoutStep]);

  const openCustDialogAlways = useCallback(() => {
    setCheckoutStep(CHECKOUT.CUSTOMER);
    if (!screenLocked && items.length > 0) updateTab({ f8Step: 1 });
    play("keyPress");
  }, [screenLocked, items.length, play, updateTab, setCheckoutStep]);

  // ══════════════════════════════════════════════════════════════
  // ITEM MANAGEMENT
  // ══════════════════════════════════════════════════════════════
  const handleFormQtyChange = useCallback((v) => {
    const cleaned = String(v).replace(/\D/g, "");
    if (cleaned === "") {
      setForm((p) => ({ ...p, qty: "" }));
      return;
    }
    const numQty = Math.max(1, parseInt(cleaned, 10) || 1);
    setForm((p) => ({ ...p, qty: numQty }));
    if (!form.price || form.price === "") intentionalDupRef.current = numQty !== 1;
  }, [form.price]);

  const handleAddItem = useCallback(() => {
    if (screenLocked) { showToast("Press INSERT to start.", "error"); play("error"); return; }
    if (addItemLockRef.current) return;
    addItemLockRef.current = true;

    try {
      const rawPrice = String(form.price ?? "").trim();
      const priceEmpty = rawPrice === "";
      const price = Number(rawPrice);
      const priceValid = !priceEmpty && Number.isFinite(price) && price > 0;
      const qtyVal = _safeQty(form.qty);

      // ── DISCOUNT HARD BLOCK ──────────────────────────────────────
      // Agar discount max se zyada ho → item add block, toast dikhao
      if (!priceEmpty && priceValid) {
        const discRawCheck = parseEntryDiscount(form.discount);
        const maxCheck = computeMaxAllowedPerUnit(price);
        const discCheck = validateItemDiscountPKR(price, discRawCheck, discountPolicy);
        if (!discCheck.valid) {
          showDiscountLimitToast({
            maxAllowed: discCheck.maxAllowed,
            attempted: discCheck.attempted,
            percentLimit: discCheck.percentLimit,
          });
          play("error");
          return;
        }
      }
      // ────────────────────────────────────────────────────────────

      if (salespersonEnabled && salespersonMultiple && salespersonRequireSelection && !currentAgent && hasAgents) {
        showToast("Select a Salesperson first.", "error"); play("error"); return;
      }

      if (priceEmpty) {
        if (!items.length) { showToast("Enter a price first.", "warning"); play("error"); return; }
        const last = items[items.length - 1];
        const dupQty = intentionalDupRef.current ? qtyVal : last.qty;
        const discRaw = form.discount !== "" ? parseEntryDiscount(form.discount) : Number(last.discount || 0);
        const unitPriceLast = lineUnitPrice(last.price);
        const allowedDup = computeMaxAllowedPerUnit(unitPriceLast);
        const dupCheck = validateItemDiscountPKR(unitPriceLast, discRaw, discountPolicy);
        if (!dupCheck.valid) {
          showDiscountLimitToast({
            maxAllowed: dupCheck.maxAllowed,
            attempted: dupCheck.attempted,
            percentLimit: dupCheck.percentLimit,
          });
          play('error');
          return;
        }
        const dupDisc = Math.max(0, discRaw || 0);

        if (mergeItems) {
          const dupPrice = lineUnitPrice(last.price);
          const mergeNameKey = showProductName ? (last.productName || "").trim() : "";
          const mergeTarget = items.find((item) => {
            if (salespersonEnabled && salespersonMultiple) {
              return isSamePriceItem(item, dupPrice, dupDisc, currentAgent?.id, mergeNameKey);
            }
            return isSamePriceItem(item, dupPrice, dupDisc, item.salespersonId, mergeNameKey);
          });
          if (mergeTarget) {
            updateTab((tab) => {
              const nextItems = tab.items.map((item) =>
                item.id === mergeTarget.id
                  ? {
                    ...item,
                    qty: Number(item.qty || 0) + dupQty,
                    originalQty: Number(item.originalQty ?? item.qty ?? 0) + dupQty,
                    discountType: "fixed",
                  }
                  : item,
              );
              return {
                ...tab,
                items: nextItems,
                lastItemId: mergeTarget.id,
                activeBill: true,
                selectedRowIndex: nextItems.findIndex((i) => i.id === mergeTarget.id),
              };
            });
            intentionalDupRef.current = false;
            grantMinusAfterItemAdd();
            play("add");
            speakEntry(dupPrice, dupQty, { discount: dupDisc });
            showToast(`✅ Merged: Rs.${dupPrice.toLocaleString()} qty +${dupQty}`, "success");
            setForm({ ...EMPTY_FORM });
            focusFirstEntryInput({ force: true, select: true });
            return;
          }
        }

        const newItem = enrichItem({
          id: generateLineItemId(), serialId: getNextItemSerial(),
          productName: last.productName, price: lineUnitPrice(last.price),
          qty: dupQty, originalQty: dupQty, discount: dupDisc, discountType: "fixed",
        });
        updateTab((tab) => {
          const nextItems = mergeItems
            ? mergeItemsByPrice([...tab.items, newItem])
            : [...tab.items, newItem];
          return {
            ...tab,
            items: nextItems,
            lastItemId: newItem.id,
            activeBill: true,
            selectedRowIndex: nextItems.length - 1,
          };
        });
        try {
          if (newItem.salespersonId) {
            logActivity("ITEM_SALESPERSON_ASSIGN", userData?.uid, storeId, {
              itemId: newItem.id,
              salespersonId: newItem.salespersonId,
              salespersonName: newItem.salespersonName || null,
              serialNo: currentBillSerial || "----",
            }).catch(() => {});
          }
        } catch (e) { /* ignore */ }
        intentionalDupRef.current = false;
        grantMinusAfterItemAdd();
        play("add"); speakEntry(last.price, dupQty, { discount: dupDisc });
        showToast(`✅ Duplicated: Rs.${last.price?.toLocaleString()} ×${dupQty}`, "success");
        setForm({ ...EMPTY_FORM });
        focusFirstEntryInput({ force: true, select: true });
        return;
      }

      if (!priceValid) { showToast("Valid price required.", "error"); play("error"); priceInputRef.current?.focus(); return; }
      if (qtyVal <= 0) { showToast("Enter quantity first.", "warning"); play("error"); qtyInputRef.current?.focus(); return; }

      const discRaw = parseEntryDiscount(form.discount);
      const addCheck = validateItemDiscountPKR(price, discRaw, discountPolicy);
      if (!addCheck.valid) {
        showDiscountLimitToast({
          maxAllowed: addCheck.maxAllowed,
          attempted: addCheck.attempted,
          percentLimit: addCheck.percentLimit,
        });
        play('error');
        return;
      }
      const discAmt = Math.max(0, discRaw);

      const serialId = (form.serialId || "").trim() || getNextItemSerial();
      const typedProductName = sanitizeProductNameInput(
        productNameRef.current?.value ?? form.productName ?? "",
      ).trim();
      const lastItem = items.length > 0 ? items[items.length - 1] : null;
      const lastProductName = (lastItem?.productName || "").trim();
      const prodName = showProductName
        ? (typedProductName || lastProductName || `Item ${fmtItemSerial(items.length + 1)}`)
        : "";

      const finalProdName = showProductName
        ? (prodName && prodName.trim() ? prodName.trim() : `Item ${fmtItemSerial(items.length + 1)}`)
        : typedProductName;
      const mergeNameKey = showProductName ? finalProdName : "";

      // ── Merge ON: same price+discount → qty badha do ──────────
      if (mergeItems) {
        const mergeTarget = items.find((item) => {
          if (salespersonEnabled && salespersonMultiple) {
            return isSamePriceItem(item, price, discAmt, currentAgent?.id, mergeNameKey);
          }
          return isSamePriceItem(item, price, discAmt, item.salespersonId, mergeNameKey);
        });

        if (mergeTarget) {
          updateTab((tab) => {
            const nextItems = tab.items.map((item) =>
              item.id === mergeTarget.id
                ? {
                  ...item,
                  qty: Number(item.qty || 0) + qtyVal,
                  originalQty: Number(item.originalQty ?? item.qty ?? 0) + qtyVal,
                  discountType: "fixed",
                }
                : item,
            );
            return {
              ...tab,
              items: nextItems,
              lastItemId: mergeTarget.id,
              activeBill: true,
              selectedRowIndex: nextItems.findIndex((i) => i.id === mergeTarget.id),
            };
          });
          intentionalDupRef.current = false;
          lastEntryRef.current = { price: String(price), qty: qtyVal, discount: discAmt, discountType: "fixed" };
          setForm({ ...EMPTY_FORM });
          play("add"); speakEntry(price, qtyVal, { discount: discAmt });
          showToast(`✅ Merged: Rs.${price.toLocaleString()} qty +${qtyVal}`, "success");
          focusPriceInput({ force: true });
          return;
        }
      }
      // ── Merge OFF: hamesha nayi row ──────────────────────────

      const newItem = enrichItem({
        id: generateLineItemId(), serialId, productName: finalProdName,
        price, qty: qtyVal, originalQty: qtyVal, discount: discAmt, discountType: "fixed",
      });
      updateTab((tab) => {
        const nextItems = mergeItems
          ? mergeItemsByPrice([...tab.items, newItem])
          : [...tab.items, newItem];
        return {
          ...tab,
          items: nextItems,
          lastItemId: newItem.id,
          activeBill: true,
          billStartTime: tab.billStartTime || new Date(),
          selectedRowIndex: nextItems.length - 1,
        };
      });
      try {
        if (newItem.salespersonId) {
          logActivity("ITEM_SALESPERSON_ASSIGN", userData?.uid, storeId, {
            itemId: newItem.id,
            salespersonId: newItem.salespersonId,
            salespersonName: newItem.salespersonName || null,
            serialNo: currentBillSerial || "----",
          }).catch(() => {});
        }
      } catch (e) { /* ignore */ }
      intentionalDupRef.current = false;
      lastEntryRef.current = { price: String(price), qty: qtyVal, discount: discAmt, discountType: "fixed" };
      setForm({ ...EMPTY_FORM });
      grantMinusAfterItemAdd();
      play("add"); speakEntry(price, qtyVal, { discount: discAmt });
      focusFirstEntryInput({ force: true, select: true });

    } finally {
      setTimeout(() => { addItemLockRef.current = false; }, 150);
    }
  }, [
    form, screenLocked, items, showProductName, play, speakEntry,
    showToast, updateTab, discountPolicy, salespersonEnabled,
    salespersonMultiple, salespersonRequireSelection, hasAgents,
    enrichItem, currentAgent, computeMaxAllowedPerUnit, grantMinusAfterItemAdd, focusFirstEntryInput,
    mergeItems,
  ]);

  const deleteRow = useCallback((id) => {
    if (screenLocked) { play("error"); return; }
    const item = items.find((i) => i.id === id);
    if (item) logClearedData([item], "row_deleted");
    const willBeEmpty = items.filter((i) => !i.isRemoved).length <= 1;
    updateTab((tab) => {
      const next = tab.items.filter((i) => i.id !== id);
      const activeAfter = next.filter((i) => !i.isRemoved);
      return {
        ...tab,
        items: next,
        selectedRowIndex: next.length > 0 ? next.length - 1 : -1,
        ...(activeAfter.length === 0 ? { screenLocked: true, activeBill: false, f8Step: 0 } : {}),
      };
    });
    if (willBeEmpty) setCheckoutStep(CHECKOUT.NONE);
    play("delete");
  }, [screenLocked, items, play, logClearedData, updateTab, setCheckoutStep]);

  const changeQty = useCallback((id, v) => {
    if (screenLocked) return;
    const n = parseInt(String(v).replace(/\D/g, ""), 10);
    const newQty = Math.max(1, n || 1);
    updateTab((tab) => ({
      ...tab,
      items: tab.items.map((i) => {
        if (i.id !== id) return i;
        const originalQty = Number(i.originalQty ?? i.qty ?? newQty);
        return { ...i, originalQty, qty: newQty };
      }),
    }));
  }, [screenLocked, updateTab]);

  const selectRow = useCallback((idx) => {
    if (idx < 0 || idx >= items.length) return;
    updateTab({ selectedRowIndex: idx });
  }, [items.length, updateTab]);

  /** ArrowDown — decrease selected/last row qty (can go 0, negative); Fraq less + price follow. */
  const decreaseRowQtyByArrow = useCallback(() => {
    if (screenLocked || !items.length) return false;
    if (document.activeElement === qtyInputRef.current) return false;

    const idx = selectedRowIndex >= 0 ? selectedRowIndex : items.length - 1;
    const item = items[idx];
    if (!item) return false;

    const curQty = Number(item.qty ?? 0);
    const originalQty = Number(item.originalQty ?? curQty);
    const newQty = curQty - 1;
    const qtyLess = Math.max(0, originalQty - newQty);
    const netUnit = lineUnitPrice(item.price)
      - computeItemLineDiscountPKR(item, discountPolicy, lineUnitPrice(item.price));
    const fraqAmt = qtyLess > 0
      ? (newQty < 0 ? netUnit * newQty : -netUnit * (originalQty - newQty))
      : 0;

    updateTab((tab) => ({
      ...tab,
      items: tab.items.map((i) => (
        i.id === item.id ? { ...i, originalQty, qty: newQty } : i
      )),
      selectedRowIndex: idx,
    }));
    play("delete");
    // Small top-side auto-dismiss toast (not the centered "Got it" alert).
    const fraqMsg = qtyLess > 0
      ? `${t("fraqLess", "Fraq less")} ${qtyLess} · ${fraqAmt.toLocaleString()} · qty ${newQty}`
      : `Qty ${newQty}`;
    toast(fraqMsg, {
      id: "biller-fraq-less",
      position: "top-right",
      duration: 4000,
      icon: "➖",
      style: {
        marginTop: "40px",
        background: "rgba(20, 16, 10, 0.55)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        border: "1px solid rgba(212, 175, 55, 0.7)",
        color: "#fff",
        fontWeight: 700,
        borderRadius: "14px",
        boxShadow: "0 10px 30px rgba(212,175,55,0.25)",
      },
    });
    return true;
  }, [screenLocked, items, selectedRowIndex, updateTab, play, t, discountPolicy]);

  const changeDiscount = useCallback((id, v) => {
    if (screenLocked) return;
    const cleaned = String(v).replace(/[^0-9.]/g, "");
    const raw = cleaned === "" ? 0 : Number(cleaned) || 0;
    
    // Find the item to check its price for the max discount check
    const item = items.find((i) => i.id === id);
    const unitPrice = item ? lineUnitPrice(item.price) : 0;
    const maxAllowed = computeMaxAllowedPerUnit(unitPrice);
    
    const rowCheck = validateItemDiscountPKR(unitPrice, raw, discountPolicy);
    if (!rowCheck.valid) {
      showDiscountLimitToast({
        maxAllowed: rowCheck.maxAllowed,
        attempted: rowCheck.attempted,
        percentLimit: rowCheck.percentLimit,
      });
      return;
    }
    const safe = Math.max(0, raw);

    updateTab((tab) => ({
      ...tab,
      items: tab.items.map((i) =>
        i.id === id ? { ...i, discount: safe, discountType: "fixed", price: lineUnitPrice(i.price) } : i,
      ),
    }));
  }, [screenLocked, updateTab, items, discountPolicy]);

  // ══════════════════════════════════════════════════════════════
  // BILL ACTIONS
  // ══════════════════════════════════════════════════════════════
  const clearBill = useCallback(() => {
    if (screenLocked) { play("error"); return; }

    if (items.length > 0) {
      logClearedData(items, "bill_cleared");
      const payload = {
        serialNo: currentBillSerial,
        items: items.map(_cleanItem),
        customer,
        totalAmount: subtotal,
        totalDiscount,
        totalQty,
        billStartTime: _safeISO(billStartTime),
        billEndTime: _safeISO(billEndTime),
        billerName: userData?.name,
        billerId,
        storeId,
        reason: "bill_cleared",
      };

      recordBillDeletion(payload, storeId, isOnline).catch(() => { });
      if (isOnline) {
        addDoc(collection(db, "clearbillbller"), {
          ...payload,
          type: "DELETE_HOTKEY_CLEAR_BILL",
          deletedAt: serverTimestamp(),
        }).catch(() => { });
      }
    }

    minusUsedRef.current = false;
    minusWarnedRef.current = false;
    f8BusyRef.current = false;
    f8LockRef.current = false;
    checkoutPhaseRef.current = 0;
    setCheckoutStep(CHECKOUT.NONE);
    updateTab({
      items: [], selectedRowIndex: -1, lastItemId: null,
      activeBill: false, screenLocked: true, f8Step: 0,
      billDiscount: 0, billDiscountType: "fixed",
    });
    setForm(EMPTY_FORM);
    lastEntryRef.current = { price: "", qty: 1, discount: 0, discountType: "fixed" };
    play("delete");
    play("lock");
  }, [
    screenLocked, items, currentBillSerial, subtotal, totalDiscount, totalQty,
    customer, billStartTime, billEndTime, userData, billerId, storeId, isOnline,
    play, logClearedData, updateTab, setCheckoutStep,
  ]);

  const cancelBill = useCallback(() => {
    if (!items.length) { showToast("No bill to cancel.", "warning"); return; }
    if (!_isSuperAdminRole(userData) && !isSuperAdmin) {
      showToast("🚫 Only Super Admin can cancel bills", "error");
      return;
    }
    if (!window.confirm(t('confirmCancelBill', 'Cancel this bill?'))) return;
    logClearedBill(items, "bill_cancelled");
    recordBillDeletion({
      serialNo: currentBillSerial, items: items.map(_cleanItem),
      customer, totalAmount: subtotal, totalDiscount, totalQty,
      billStartTime: _safeISO(billStartTime),
      billEndTime: _safeISO(billEndTime),
      billerName: userData?.name, billerId, storeId, reason: "bill_cancelled",
    }, storeId, isOnline).catch(() => { });
    showToast("Bill cancelled.", "success");
    _afterClear();
  }, [
    items, currentBillSerial, subtotal, totalDiscount, totalQty,
    customer, billStartTime, billEndTime, userData, billerId, storeId, isOnline,
    logClearedBill, showToast, _afterClear, isSuperAdmin,
  ]);

  // ══════════════════════════════════════════════════════════════
  // SAVE IN BACKGROUND
  // ══════════════════════════════════════════════════════════════
  const saveInBackground = useCallback(async (snapshot) => {
    try {
      if (!isOrderSaveable(snapshot)) {
        console.warn('[saveInBackground] blocked empty bill');
        return;
      }
      const online = isOnlineRef.current;
      const localId = snapshot.localId || generateLocalId();
      const claimedSerial = snapshot.billSerial || snapshot.serialNo;
      
      if (!claimedSerial || claimedSerial === '----') {
        toast.error('Bill serial missing — bill was not saved.', { duration: 3000 });
        play('error');
        return;
      }

      // ✅ PHASE 2: Heavy lifting in background — doesn't block cashier
      const performSave = async () => {
        const billerPaidOffline = !online && Boolean(
          snapshot.overridePayment?.received
          || snapshot.overridePayment?.type
          || Number(snapshot.overridePayment?.received) > 0,
        );
        const dualActive = Boolean(snapshot.dualModeCheckout);
        const billerPaidAtDesk = dualActive && Boolean(
          Number(snapshot.overridePayment?.received) > 0 || snapshot.isAutoApproved,
        );

        const resolvedName = resolveCustomerName(snapshot.customer);
        const preparedItems = snapshot.preparedItems || _prepareItemsForSave(snapshot.items, discountPolicy);

        const orderData = {
          localId,
          serialNo: claimedSerial,
          billSerial: claimedSerial,
          dateStr: _todayDateStr(),
          customer: {
            name: resolvedName,
            phone: (snapshot.customer.phone || "").trim(),
            city: snapshot.customer.city || CUSTOMER_CONFIG.WALK_IN_CITY,
            market: snapshot.customer.market || "",
          },
          items: preparedItems,
          totalQty: snapshot.totalQty,
          itemCount: preparedItems.length,
          subtotal: snapshot.subtotal,
          totalDiscount: snapshot.totalDiscount,
          billDiscount: snapshot.billDiscountValue,
          totalAmount: snapshot.finalTotal,
          grandTotal: snapshot.finalTotal,
          paymentType: snapshot.overridePayment?.type || snapshot.paymentType || "cash",
          paymentMethod: snapshot.overridePayment?.type || snapshot.paymentType || "cash",
          amountReceived: snapshot.overridePayment?.received || null,
          changeGiven: snapshot.overridePayment?.change || null,
          salesperson: snapshot.salesperson || null,
          salespersonCommission: snapshot.salesperson?.commissionAmount || 0,
          salespersonBreakdown: snapshot.salespersonBreakdown || [],
          salespersonId: snapshot.salespersonId || null,
          salespersonName: snapshot.salespersonName || null,
          ...(dualActive ? buildDualModeOrderFields({
            isAutoApproved: snapshot.isAutoApproved,
            billerPaid: billerPaidAtDesk,
            billerId: snapshot.billerId || userData?.uid,
            billerName: snapshot.billerName || userData?.displayName || userData?.name || 'Biller',
            amountReceived: Number(snapshot.overridePayment?.received) || Number(snapshot.finalTotal) || 0,
          }) : buildNormalCashierQueueFields({
            isAutoApproved: snapshot.isAutoApproved,
          })),
          ...buildBillChannelPatch({
            online,
            dualModeCheckout: dualActive,
            billerPaidOffline,
          }),
          billerSubmittedAt: _nowISO(),
          billerName: snapshot.billerName || userData?.displayName || userData?.name || "Unknown",
          billerId: snapshot.billerId || userData?.uid || null,
          storeId: snapshot.storeId,
          billStartTime: _safeISO(snapshot.billStartTime) || _nowISO(),
          billEndTime: _safeISO(snapshot.billEndTime) || _nowISO(),
          createdAt: _nowISO(),
          isDeleted: false,
          source: "biller",
          syncStatus: online ? "syncing" : "pending",
        };

        const result = await saveOrder(orderData, online);
        if (!result.success) {
          try { releaseSerialClaim(claimedSerial); } catch { /* ignore */ }
          if (result.duplicate) {
            toast.error(
              result.error === 'duplicate_serial'
                ? 'This bill serial already exists — a new serial will be used on retry.'
                : 'Duplicate bill.',
              { duration: 3500 },
            );
          } else {
            toast.error(
              result.error === 'forbidden_branch'
                ? 'You do not have access to this branch.'
                : getFriendlyError(result.error || 'Bill save failed'),
              { duration: 3500 },
            );
          }
          play('error');
          return;
        }

        try {
          if (result.success && !snapshot.isAutoApproved && !dualActive) {
            void managerService.submitBillForManagerApproval(localId, undefined, "Submitted for manager approval")
              .catch((err) => {
                console.warn('[BillerDashboard] submitBillForManagerApproval failed:', err?.message || err);
              });
          }
        } catch (err) {
          console.warn('[BillerDashboard] submitBillForManagerApproval failed:', err?.message || err);
        }

        const realSerial = result.serialNo || claimedSerial;
        const sid = snapshot.storeId || "default";

        void markSerialUsed(sid, realSerial);
        refreshOrdersMaxCache(sid).catch(() => {});

        try {
          const serialNum = _extractSerialNum(realSerial);
          if (serialNum > 0) {
            localStorage.setItem(
              `pos_serialBroadcast_${sid}`,
              JSON.stringify({ lastSerial: serialNum, max: serialNum, date: _todayDateStr(), savedAt: Date.now() }),
            );
          }
        } catch { }

        broadcastOrderSyncedPatch({
          localId: result.id || localId,
          billSerial: realSerial,
          firebaseId: result.offline ? null : (result.id || localId),
          syncStatus: result.offline ? 'pending' : 'synced',
        });

        if (!result.offline) {
          broadcastCashierInstantOrder({
            ...orderData,
            localId: result.id || localId,
            id: result.id || localId,
            firebaseId: result.id || localId,
            billSerial: realSerial,
            serialNo: realSerial,
            syncStatus: 'synced',
            synced: true,
            isLocalOnly: false,
          });
        }

        // ── Instant payment notification to cashier (when biller collects payment) ──
        if (billerPaidAtDesk && snapshot.overridePayment?.received) {
          broadcastPaymentComplete(
            realSerial,
            snapshot.overridePayment.received,
            snapshot.billerName || userData?.displayName || userData?.name || 'Biller'
          );
        }

        setPrintOrder((prev) =>
          prev ? { ...prev, serialNo: realSerial, billSerial: realSerial } : prev,
        );

        queueMicrotask(() => {
          try {
            _saveCustomerBg(snapshot.storeId, snapshot.billerId, {
              name: resolvedName, phone: (snapshot.customer.phone || "").trim(),
              city: snapshot.customer.city || "", market: snapshot.customer.market || "",
              ...(snapshot.customer.personaDocId ? { personaDocId: snapshot.customer.personaDocId } : {}),
            });
            void import("../../services/customerPersonaService").then(({ applyBillTransaction }) =>
              applyBillTransaction({
                customer: {
                  name: resolvedName,
                  phone: (snapshot.customer.phone || "").trim(),
                  city: snapshot.customer.city || "",
                  market: snapshot.customer.market || "",
                  ...(snapshot.customer.personaDocId ? { personaDocId: snapshot.customer.personaDocId } : {}),
                },
                storeId: snapshot.storeId,
                branchId: snapshot.storeId,
                billerId: snapshot.billerId || userData?.uid,
                userId: snapshot.billerId || userData?.uid,
                billAmount: Number(snapshot.finalTotal || snapshot.grandTotal || 0),
                items: snapshot.items || snapshot.bill_items || [],
                salespersonId: snapshot.salespersonId,
              }),
            );
            if (!result.offline && result.id)
              createAuditLog({ ...orderData, id: result.id, serialNo: realSerial },
                "ORDER_SUBMITTED", snapshot.billerId).catch(() => { });
            if (online) syncOfflineOrders().catch(() => { });
          } catch (error) {
            console.error('[Dashboard] queueMicrotask error:', error);
          }
        });

        if (result.offline) {
          play("offline");
          showBillerBillToast('sent', { serial: realSerial, offline: true });
          refreshOfflineCount();
        } else {
          play("billSaved");
          if (snapshot.isAutoApproved) {
            showBillerBillToast('saved', { serial: realSerial });
          } else {
            showBillerBillToast('sent', { serial: realSerial });
          }
        }
      };

      // ✅ Fire heavy work in background immediately — don't await
      // Cashier already sees the bill from the instant broadcast above
      performSave().catch((err) => {
        console.error("[Dashboard] performSave background error:", err);
      });

    } catch (err) {
      console.error("[Dashboard] saveInBackground:", err);
      toast.error(getFriendlyError(err), { duration: 3000 });
      play("error");
    }
  }, [play, refreshOfflineCount,
    discountPolicy, userData, activeTabId, dualModeEnabled, cashierModeActive]);

  // ══════════════════════════════════════════════════════════════
  // FINALIZE & PRINT
  // ══════════════════════════════════════════════════════════════
  const finalizeAndPrint = useCallback(async (overridePayment = null, { useSummaryDiscount = false } = {}) => {
    if (saveDoneRef.current || submittingRef.current) return;
    if (!items.length) { showToast("Add at least one item.", "error"); return; }

    const validation = validateAssignment(items);
    if (!validation.valid) {
      toast.error(validation.message || "Invalid salesperson assignment.");
      f8BusyRef.current = false;
      releaseF8Lock();
      return;
    }

    for (const item of items) {
      const unit = lineUnitPrice(item.price);
      const discPkr = Math.max(0, Number(item.discount) || 0);
      if (discPkr <= 0) continue;
      const check = validateItemDiscountPKR(unit, discPkr, discountPolicy);
      if (!check.valid) {
        showDiscountLimitToast({
          maxAllowed: check.maxAllowed,
          attempted: check.attempted,
          percentLimit: check.percentLimit,
        });
        f8BusyRef.current = false;
        releaseF8Lock();
        return;
      }
    }

    if (salespersonEnabled && !salespersonMultiple && salespersonRequireSelection && hasAgents && !salespersonId) {
      f8BusyRef.current = false;
      showToast("Select a salesperson.", "error"); setCheckoutStep(CHECKOUT.SUMMARY); return;
    }

    saveDoneRef.current = true;
    submittingRef.current = true;
    const endTime = new Date();
    const localId = generateLocalId();

    // Snapshot before any state change — correct bill on print even if tab resets
    const capturedItems = items.map(_cleanItem);
    const capturedCustomer = normalizeCustomerForBill(customer, { storeId });
    const capturedTotalQty = totalQty;
    const capturedSubtotal = subtotal;
    const capturedTotalDiscount = totalDiscount;
    const capturedBillDiscount = useSummaryDiscount ? summaryBillDiscountValue : billDiscountValue;
    const capturedFinalTotal = useSummaryDiscount ? summaryGrandTotal : finalTotal;
    const capturedBillStart = billStartTime || new Date();

    // UI first — zero network wait; close all checkout overlays instantly
    f8BusyRef.current = false;
    setCheckoutStep(CHECKOUT.NONE);
    setSubmitting(false);

    let claimedSerial;
    try {
      claimedSerial = claimSerialInstant(storeId, userData);
      if (!claimedSerial || claimedSerial === '----') {
        throw new Error('Serial claim returned empty');
      }
    } catch (err) {
      saveDoneRef.current = false;
      submittingRef.current = false;
      f8BusyRef.current = false;
      showToast('Could not claim bill serial. Please try again.', 'error');
      releaseF8Lock();
      return;
    }

    const commissionSummary = buildCommissionSummary(capturedItems, capturedFinalTotal, capturedFinalTotal);
    let finalSPId = null;
    let finalSPName = null;
    if (!salespersonMultiple) {
      finalSPId = salespersonId || null;
      finalSPName = selectedSalesperson?.name || null;
    } else {
      const assignedSPIds = [...new Set(capturedItems.map(i => i.salespersonId).filter(Boolean))];
      if (assignedSPIds.length === 1) {
        finalSPId = assignedSPIds[0];
        const agent = salespersonAgents.find(a => a.id === finalSPId);
        finalSPName = agent ? agent.name : null;
      }
    }

    const preparedItemsForSave = _prepareItemsForSave(capturedItems, discountPolicy);

    const snapshot = {
      localId,
      billSerial: claimedSerial,
      serialNo: claimedSerial,
      items: capturedItems,
      preparedItems: preparedItemsForSave,
      customer: capturedCustomer,
      totalQty: capturedTotalQty,
      subtotal: capturedSubtotal,
      totalDiscount: capturedTotalDiscount,
      billDiscountValue: capturedBillDiscount,
      finalTotal: capturedFinalTotal,
      billStartTime: capturedBillStart,
      billEndTime: endTime,
      billerName: userData?.displayName || userData?.name || "",
      storeId,
      billerId,
      isAutoApproved,
      dualModeCheckout: dualModeEnabled && cashierModeActive,
      isOnline: isOnlineRef.current,
      overridePayment,
      paymentType: paymentType || "cash",
      salespersonBreakdown: commissionSummary,
      salespersonId: finalSPId,
      salespersonName: finalSPName,
      salesperson: (salespersonEnabled && !salespersonMultiple) && salespersonId
        ? {
          id: salespersonId,
          name: selectedSalesperson?.name || "",
          commissionType: selectedSalesperson?.commissionType || salespersonDefaultType,
          commissionRate: Number(selectedSalesperson?.commissionRate ?? salespersonDefaultRate),
          commissionAmount: salespersonCommission,
        }
        : null,
    };

    const printSalesperson = snapshot.salesperson
      ? { id: snapshot.salesperson.id, name: snapshot.salesperson.name }
      : null;

    const resolvedBillerName = userData?.displayName || userData?.name || "";
    const dualCheckoutActive = dualModeEnabled && cashierModeActive;

    const billerPaidOffline = !isOnlineRef.current && Boolean(
      overridePayment?.received || overridePayment?.type || Number(overridePayment?.received) > 0,
    );

    const orderForPrint = {
      id: localId,
      serialNo: claimedSerial,
      billSerial: claimedSerial,
      customer: capturedCustomer,
      items: capturedItems,
      totalQty: capturedTotalQty,
      totalAmount: capturedFinalTotal,
      subtotal: capturedSubtotal,
      totalDiscount: capturedTotalDiscount + capturedBillDiscount,
      billDiscount: capturedBillDiscount,
      salesperson: printSalesperson,
      paymentType: paymentType || "cash",
      createdAt: capturedBillStart,
      billStartTime: capturedBillStart,
      billEndTime: endTime,
      ...(dualCheckoutActive ? buildDualModeOrderFields({
        isAutoApproved,
        billerPaid: Boolean(Number(overridePayment?.received) > 0 || isAutoApproved),
        billerId,
        billerName: resolvedBillerName,
        amountReceived: Number(overridePayment?.received) || capturedFinalTotal,
      }) : buildNormalCashierQueueFields({ isAutoApproved })),
      ...buildBillChannelPatch({
        online: isOnlineRef.current,
        dualModeCheckout: dualCheckoutActive,
        billerPaidOffline,
      }),
      syncStatus: isOnlineRef.current ? "syncing" : "pending",
      billerName: resolvedBillerName,
      billerId,
      isActiveOrder: true,
      isDeleted: false,
    };

    warmInvoiceQr(orderForPrint);

    setPrintOrder(orderForPrint);
    setShowPrintModal(true);

    queueMicrotask(() => {
      const liveOrderPayload = {
        ...orderForPrint,
        localId,
        id: localId,
        storeId,
        branchId: storeId,
        grandTotal: capturedFinalTotal,
        totalAmount: capturedFinalTotal,
        itemCount: capturedItems.length,
        isLocalOnly: true,
        offlinePending: !isOnlineRef.current,
        items: capturedItems,
        customer: capturedCustomer,
        billerSubmittedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        savedAt: new Date().toISOString(),
        ...(dualCheckoutActive ? {} : buildNormalCashierQueueFields({ isAutoApproved })),
      };
      persistPendingOrderInstant(liveOrderPayload);
      void createAuditLog(
        {
          ...liveOrderPayload,
          serialNo: claimedSerial,
          billSerial: claimedSerial,
          source: 'biller',
          role: 'biller',
        },
        'ORDER_SUBMITTED',
        billerId,
      ).catch(() => {});
    });

    resetBill();
    submittingRef.current = false;
    releaseF8Lock();

    void saveInBackground(snapshot).catch((err) => {
      console.error("[Dashboard] finalizeAndPrint save error:", err);
    });
  }, [
    items, customer, totalQty, subtotal, totalDiscount, billDiscountValue, summaryBillDiscountValue, finalTotal, summaryGrandTotal,
    billStartTime, userData, storeId, billerId, isAutoApproved,
    showToast, resetBill, saveInBackground, releaseF8Lock,
    salespersonEnabled, salespersonMultiple, salespersonRequireSelection, salespersonId,
    selectedSalesperson, salespersonDefaultType, salespersonDefaultRate, salespersonCommission,
    validateAssignment, buildCommissionSummary, salespersonAgents, hasAgents, paymentType,
    discountPolicy, setCheckoutStep, dualModeEnabled, cashierModeActive, activeTabId,
  ]);

  const onPrintClose = useCallback(() => {
    closeActivePrintWindow();
    setShowPrintModal(false);
    setPrintOrder(null);
    f8BusyRef.current = false;
    f8LockRef.current = false;
    saveDoneRef.current = false;
    submittingRef.current = false;
    setSubmitting(false);
    releaseF8Lock();
    queueMicrotask(() => focusFirstEntryInput({ force: true, select: true }));
  }, [releaseF8Lock, focusFirstEntryInput]);

  const onPrintError = useCallback((message = 'Printer not connected') => {
    toast.error(message, { duration: 1400 });
    onPrintClose();
  }, [onPrintClose]);

  // ══════════════════════════════════════════════════════════════
  // CUSTOMER / SUMMARY / CASHIER HANDLERS
  // ══════════════════════════════════════════════════════════════
  const onCustomerSubmit = useCallback((cData) => {
    const normalized = {
      name: (cData?.name || "").trim() || WALKING_CUSTOMER_NAME,
      phone: (cData?.phone || "").trim(),
      city: cData?.city || "Karachi",
      market: cData?.market || "",
      country: cData?.country,
      countryName: cData?.countryName,
      isWalkIn: Boolean(cData?.isWalkIn),
      type: cData?.type,
    };
    if (!normalized.phone && isWalkIn({ name: normalized.name })) {
      normalized.name = WALKING_CUSTOMER_NAME;
      normalized.isWalkIn = true;
      normalized.type = "walkin";
    }

    updateTab({
      customer: normalized, custNameSearch: normalized.name || "", custPhoneSearch: "",
    });
    if (items.length > 0 && !screenLocked) {
      setCheckoutStep(CHECKOUT.SUMMARY);
      updateTab({ f8Step: 2, billDiscountType: resolveSummaryDiscountType() });
    } else {
      setCheckoutStep(CHECKOUT.NONE);
    }

    f8BusyRef.current = false;
    releaseF8Lock();
    play("keyPress");

    queueMicrotask(() => {
      try {
        const phone = (normalized.phone || "").trim();
        const name = (normalized.name || "").trim();
        if (isWalkIn({ name }) && !phone) return;
        if (phone || (name && !isWalkIn({ name }))) {
          _saveCustomerBg(storeId, billerId, normalized);
        }
      } catch (error) {
        console.error('[Dashboard] queueMicrotask error:', error);
      }
    });
  }, [play, items.length, screenLocked, storeId, billerId, updateTab, releaseF8Lock, setCheckoutStep, resolveSummaryDiscountType]);

  const onSummaryProceed = useCallback(() => {
    if (saveDoneRef.current || submittingRef.current) return;
    checkoutPhaseRef.current = CHECKOUT.PROCEEDING;
    updateTab({ billEndTime: new Date() });
    if (!isOnline && !offlineDirectCheckout) {
      // Setting OFF → manual collect modal offline
      setCheckoutStep(CHECKOUT.PAYMENT);
      updateTab({ f8Step: 4, paymentType: "cash", amountReceived: String(summaryGrandTotal) });
      releaseF8Lock();
    } else if (!isOnline && offlineDirectCheckout && offlineAutoCollect) {
      // Setting ON + auto → direct checkout with cash recorded
      finalizeAndPrint({ type: "cash", received: summaryGrandTotal, change: 0 }, { useSummaryDiscount: true });
    } else {
      finalizeAndPrint(null, { useSummaryDiscount: true });
    }
    play("keyPress");
  }, [isOnline, offlineDirectCheckout, offlineAutoCollect, summaryGrandTotal, play, finalizeAndPrint, updateTab, releaseF8Lock, setCheckoutStep]);

  useEffect(() => {
    onSummaryProceedRef.current = onSummaryProceed;
  }, [onSummaryProceed]);

  const onCashierConfirm = useCallback(() => {
    if (saveDoneRef.current || submitting) return;
    const received = Number(finalTotal || 0);
    setCheckoutStep(CHECKOUT.NONE);
    finalizeAndPrint({
      type: paymentType,
      received: paymentType === "cash" ? received : finalTotal,
      change: 0,
    });
  }, [finalTotal, paymentType, submitting, finalizeAndPrint, setCheckoutStep]);

  useEffect(() => {
    if (!showCashierPayment) return;
    updateTab({
      f8Step: 4,
      paymentType: paymentType || "cash",
      amountReceived: String(finalTotal),
    });
  }, [showCashierPayment, finalTotal, paymentType, updateTab]);

  // ══════════════════════════════════════════════════════════════
  // KEYBOARD HANDLERS
  // ══════════════════════════════════════════════════════════════
  const handleF8 = useCallback(() => {
    const now = Date.now();
    if (now - f8GateRef.current < 50) return;
    f8GateRef.current = now;

    if (submittingRef.current || saveDoneRef.current) return;

    if (showPrintModal || printModalOpenRef.current) {
      printControlRef.current?.print?.();
      return;
    }

    if (!items.length) {
      showToast("Add items first.", "error");
      return;
    }

    if (screenLocked) {
      showToast("Press INSERT first.", "error");
      return;
    }

    play("keyPress");

    const phase = checkoutPhaseRef.current;

    if (phase === CHECKOUT.PAYMENT || showCashierPayment) {
      onCashierConfirm();
      return;
    }

    if (phase === CHECKOUT.SUMMARY || phase === CHECKOUT.PROCEEDING || showSummaryPopup) {
      onSummaryProceed();
      return;
    }

    if (phase === CHECKOUT.CUSTOMER || showCustomerDialog) {
      if (typeof customerSubmitRef.current === "function") {
        customerSubmitRef.current();
      } else {
        broadcastCheckoutF8();
      }
      return;
    }

    checkoutPhaseRef.current = CHECKOUT.CUSTOMER;
    setCheckoutStep(CHECKOUT.CUSTOMER);
    updateTab({ f8Step: 1 });
  }, [
    items.length, screenLocked, showPrintModal, showSummaryPopup,
    showCustomerDialog, showCashierPayment,
    onSummaryProceed, onCashierConfirm,
    showToast, updateTab, play, setCheckoutStep,
  ]);

  const focusClearConfirmChoice = useCallback((choice) => {
    clearConfirmFocusRef.current = choice;
    setClearConfirmFocus(choice);
  }, []);

  const moveClearConfirmFocus = useCallback((delta) => {
    const order = ["cancel", "clear"];
    const idx = order.indexOf(clearConfirmFocusRef.current);
    const next = order[(idx + delta + order.length) % order.length];
    focusClearConfirmChoice(next);
  }, [focusClearConfirmChoice]);

  const closeClearConfirm = useCallback(() => {
    setShowClearConfirm(false);
    focusPriceInput({ force: true });
  }, []);

  const handleDelete = useCallback(() => {
    if (screenLocked) { play("error"); return; }
    // No items yet (biller pressed INSERT but nothing added) → Delete just locks the screen
    const activeItems = items.filter((i) => !i.isRemoved);
    if (activeItems.length === 0) {
      setCheckoutStep(CHECKOUT.NONE);
      updateTab({ screenLocked: true, activeBill: false, f8Step: 0 });
      play("lock");
      return;
    }
    focusClearConfirmChoice("cancel");
    setShowClearConfirm(true);
  }, [screenLocked, items, play, focusClearConfirmChoice, updateTab, setCheckoutStep]);

  useEffect(() => {
    if (!showClearConfirm) return;
    focusClearConfirmChoice("cancel");
  }, [showClearConfirm, focusClearConfirmChoice]);

  const confirmClearBill = useCallback(() => {
    setShowClearConfirm(false);
    clearBill();
    focusPriceInput({ force: true });
  }, [clearBill]);

  const handleDeleteLastRow = useCallback(() => {
    const activeItems = items.filter((i) => !i.isRemoved);
    if (!activeItems.length) {
      if (screenLocked) { play("error"); return; }
      setCheckoutStep(CHECKOUT.NONE);
      updateTab({ screenLocked: true, activeBill: false, f8Step: 0 });
      play("lock");
      return;
    }

    if (screenLocked) { play("error"); return; }

    if (minusUsedRef.current) {
      minusWarnedRef.current = true;
      play("error");
      focusPriceInput({ force: true });
      return;
    }
    if (deleteLockRef.current) return;
    deleteLockRef.current = true;
    setTimeout(() => { deleteLockRef.current = false; }, 200);
    const last = items[items.length - 1];
    if (!last) { play("error"); return; }
    logClearedData([last], "minus_key_deleted");
    updateTab((tab) => {
      const next = tab.items.slice(0, -1);
      const activeItemsAfterDelete = next.filter((i) => !i.isRemoved);
      const shouldLock = activeItemsAfterDelete.length === 0;
      return {
        ...tab,
        items: next,
        selectedRowIndex: next.length > 0 ? next.length - 1 : -1,
        ...(shouldLock ? { screenLocked: true, activeBill: false, f8Step: 0 } : {}),
      };
    });
    if (activeItems.length <= 1) setCheckoutStep(CHECKOUT.NONE);
    minusUsedRef.current = true;
    play("delete");
    focusPriceInput({ force: true });
  }, [screenLocked, items, play, logClearedData, updateTab, setCheckoutStep]);

  const handleEscape = useCallback(() => {
    if (showPrintModal || printModalOpenRef.current) {
      closeActivePrintWindow();
      onPrintClose();
      return;
    }

    if (showCashierPayment) {
      f8BusyRef.current = false;
      setCheckoutStep(CHECKOUT.SUMMARY);
      updateTab({ f8Step: 2 });
      releaseF8Lock();
      return;
    }

    if (f8Step === 2 && showSummaryPopup) {
      setCheckoutStep(CHECKOUT.CUSTOMER);
      updateTab({ f8Step: 1 });
      releaseF8Lock();
      return;
    }

    if (showCustomerDialog) {
      f8BusyRef.current = false;
      setCheckoutStep(CHECKOUT.NONE);
      updateTab({ f8Step: 0 });
      releaseF8Lock();
      focusPriceInput({ force: true });
      return;
    }

    if (showClearConfirm) { closeClearConfirm(); return; }

    if (showSug) { setShowSug(false); setCustSuggestions([]); setActiveField(""); focusPriceInput({ force: true }); return; }

    updateTab({ selectedRowIndex: -1 }); setShowSug(false); priceInputRef.current?.focus();
  }, [f8Step, showPrintModal, showSummaryPopup, showCustomerDialog, showCashierPayment, showClearConfirm, showSug, onPrintClose, updateTab, releaseF8Lock, setCheckoutStep, closeClearConfirm]);

  const handleInsert = useCallback(() => {
    if (showPrintModal || printModalOpenRef.current) {
      closeActivePrintWindow();
      onPrintClose();
    }
    if (screenLocked) {
      if (submittingRef.current) { showToast("Bill is saving...", "warning"); return; }
      saveDoneRef.current = false; submittingRef.current = false;
      f8LockRef.current = false; minusUsedRef.current = false; minusWarnedRef.current = false;
      deleteLockRef.current = false; intentionalDupRef.current = false;
      setShowPrintModal(false);
      setPrintOrder(null);
      f8BusyRef.current = false;
      setCheckoutStep(CHECKOUT.NONE);
      updateTab({
        activeBill: true, screenLocked: false, billStartTime: new Date(),
        billEndTime: null, f8Step: 0, billSerial: "----",
        items: [], selectedRowIndex: -1, lastItemId: null,
      });
      setForm(EMPTY_FORM);
      lastEntryRef.current = { price: "", qty: 1, discount: 0, discountType: "fixed" };
      play("unlock"); showToast("✅ New bill started.", "success");
      focusFirstEntryInput({ select: true, force: true });
      return;
    }
    focusFirstEntryInput({ select: true });
  }, [screenLocked, showPrintModal, onPrintClose, showToast, play, updateTab, setCheckoutStep, focusFirstEntryInput]);

  const handleCloseCurrentTab = useCallback(() => closeTab(activeTabId), [closeTab, activeTabId]);

  const handleSwitchTabByIndex = useCallback((index) => {
    const tab = tabs[index]; if (tab) switchTab(tab.tabId);
  }, [tabs, switchTab]);

  const handleCycleTab = useCallback(() => {
    if (tabs.length <= 1) return;
    const idx = tabs.findIndex((tb) => tb.tabId === activeTabId);
    const next = tabs[(idx + 1) % tabs.length];
    if (next) switchTab(next.tabId);
  }, [tabs, activeTabId, switchTab]);

  const handleToggleDiscountType = useCallback(() => {
    if (!allowItemDiscountPKR && !allowItemDiscountPercent) return;
    setForm((f) => {
      const next = f.discountType === "percent"
        ? (allowItemDiscountPKR ? "fixed" : "percent")
        : (allowItemDiscountPercent ? "percent" : "fixed");
      return { ...f, discountType: next };
    });
  }, [allowItemDiscountPKR, allowItemDiscountPercent]);

  const handleSaveDraftShortcut = useCallback(() => {
    saveDraft(); showToast("Draft saved.", "success");
  }, [saveDraft, showToast]);

  const togglePermission = useCallback(async (key) => {
    const nv = !permissions[key];
    setPermissions((p) => ({ ...p, [key]: nv }));
    if (!isSuperAdmin || !store?.id) return;
    try {
      const up = { ...(store.billerPermissions || {}), [key]: nv };
      await updateStore(store.id, { billerPermissions: up });
      setStore((p) => ({ ...p, billerPermissions: up }));
    } catch { }
  }, [isSuperAdmin, permissions, store]);

  // ── Keyboard shortcuts ────────────────────────────────────
  const handlers = useMemo(() => ({
    ADD_ITEM: handleAddItem,
    DUPLICATE_ITEM: handleInsert,
    DELETE_ITEM: handleDeleteLastRow,
    EDIT_ITEM: () => { },
    SAVE_BILL: handleSaveDraftShortcut,
    PRINT_BILL: handleF8,
    CLEAR_BILL: handleDelete,
    NEW_BILL: addNewTab,
    MOVE_UP: () => {
      if (!items.length) return;
      updateTab((tab) => ({
        ...tab,
        selectedRowIndex: tab.selectedRowIndex <= 0 ? tab.items.length - 1 : tab.selectedRowIndex - 1,
      }));
    },
    MOVE_DOWN: () => {
      if (!items.length) return;
      updateTab((tab) => ({
        ...tab,
        selectedRowIndex: (tab.selectedRowIndex < 0 || tab.selectedRowIndex >= tab.items.length - 1)
          ? 0
          : tab.selectedRowIndex + 1,
      }));
    },
    HOME: handleCycleTab,
    END: addNewTab,
    ESCAPE: handleEscape,
    SEARCH: () => { if (!screenLocked) phoneInputRef.current?.focus(); },
  }), [
    handleAddItem, handleInsert, handleF8, handleEscape, handleDelete, handleDeleteLastRow,
    handleSaveDraftShortcut, screenLocked, items.length, addNewTab, updateTab, decreaseRowQtyByArrow, items, handleCycleTab,
  ]);

  useKeyboardShortcuts({
    Insert: handleInsert,
    F2: () => { if (!screenLocked) phoneInputRef.current?.focus(); },
    F3: () => {
      if (screenLocked) return;
      const t = showProductName ? productNameRef.current : priceInputRef.current;
      t?.focus(); t?.select?.();
    },
    F4: () => { if (!screenLocked) { priceInputRef.current?.focus(); priceInputRef.current?.select?.(); } },
    F5: () => { if (!screenLocked) { qtyInputRef.current?.focus(); qtyInputRef.current?.select?.(); } },
    F6: () => { if (!screenLocked) { discountInputRef.current?.focus(); discountInputRef.current?.select?.(); } },
    F8: handleF8,
    F9: handleSaveDraftShortcut,
    Home: handleCycleTab,
    End: addNewTab,
    Delete: handleDelete,
    Minus: handleDeleteLastRow,
    numpadSubtract: handleDeleteLastRow,
    numpadAdd: () => { if (!screenLocked) { qtyInputRef.current?.focus(); qtyInputRef.current?.select?.(); } },
    numpadDivide: () => { if (!screenLocked) { discountInputRef.current?.focus(); discountInputRef.current?.select?.(); } },
    numpadMultiply: handleToggleDiscountType,
    ArrowUp: () => {
      if (!items.length) return;
      updateTab((tab) => ({
        ...tab,
        selectedRowIndex: tab.selectedRowIndex <= 0 ? tab.items.length - 1 : tab.selectedRowIndex - 1,
      }));
    },
    ArrowDown: () => {
      if (!items.length) return;
      updateTab((tab) => ({
        ...tab,
        selectedRowIndex: (tab.selectedRowIndex < 0 || tab.selectedRowIndex >= tab.items.length - 1)
          ? 0
          : tab.selectedRowIndex + 1,
      }));
    },
    // Shift+ArrowDown → reduce selected row qty (Fraq less), so plain arrows only navigate.
    "shift+ArrowDown": () => {
      if (document.activeElement === qtyInputRef.current) return;
      decreaseRowQtyByArrow();
    },
    PageUp: () => {
      if (!items.length) return;
      updateTab((tab) => ({
        ...tab,
        selectedRowIndex: Math.max(0, (tab.selectedRowIndex < 0 ? 0 : tab.selectedRowIndex) - 5),
      }));
    },
    PageDown: () => {
      if (!items.length) return;
      updateTab((tab) => ({
        ...tab,
        selectedRowIndex: Math.min(tab.items.length - 1, (tab.selectedRowIndex < 0 ? 0 : tab.selectedRowIndex) + 5),
      }));
    },
    "&": addNewTab,
    "ctrl+m": () => setSoundExclusive((v) => !v),
    "ctrl+s": handleSaveDraftShortcut,
    "ctrl+n": addNewTab,
    "ctrl+t": addNewTab,
    "ctrl+w": handleCloseCurrentTab,
    "ctrl+1": () => handleSwitchTabByIndex(0),
    "ctrl+2": () => handleSwitchTabByIndex(1),
    "ctrl+3": () => handleSwitchTabByIndex(2),
    "ctrl+4": () => handleSwitchTabByIndex(3),
    "ctrl+5": () => handleSwitchTabByIndex(4),
    "ctrl+shift+v": () => setSoundModeExclusive(soundMode === "counting" ? "music" : "counting"),
    "ctrl+shift+c": () => {
      if (currentBillSessionId) resetPersistedCustomer(currentBillSessionId);
      if (currentBillSerial) resetPersistedCustomer(currentBillSerial);
      updateTab({ customer: { ...DEFAULT_CUSTOMER }, custNameSearch: "", custPhoneSearch: "" });
      setCustSuggestions([]); setShowSug(false); showToast("Customer cleared.", "success");
    },
  }, !billModalOpen);
  useBillerHotkeys(handlers, { enabled: !billModalOpen });

  useEffect(() => {
    const fallback = (e) => {
      if (showClearConfirm) {
        if (
          e.key === "ArrowLeft" || e.key === "ArrowUp"
          || (e.key === "Tab" && e.shiftKey)
        ) {
          e.preventDefault();
          e.stopPropagation();
          moveClearConfirmFocus(-1);
          return;
        }
        if (
          e.key === "ArrowRight" || e.key === "ArrowDown"
          || (e.key === "Tab" && !e.shiftKey)
        ) {
          e.preventDefault();
          e.stopPropagation();
          moveClearConfirmFocus(1);
          return;
        }
        if (e.key === "Enter") {
          e.preventDefault();
          e.stopPropagation();
          if (clearConfirmFocusRef.current === "clear") confirmClearBill();
          else closeClearConfirm();
          return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          closeClearConfirm();
          return;
        }
        if (e.key !== "F8") {
          e.preventDefault();
          e.stopPropagation();
        }
        return;
      }

      if (document.body.dataset.billerModalOpen === 'true') {
        const paymentOpen = document.querySelector('[data-biller-payment-modal="true"]');
        if (e.key === 'Enter' && paymentOpen) {
          e.preventDefault();
          e.stopPropagation();
          onCashierConfirm();
          return;
        }
        if (e.key === 'Insert') {
          e.preventDefault();
          e.stopPropagation();
          handleInsert();
          return;
        }
        const inModal = e.target?.closest?.('[data-biller-modal="true"]');
        if (!inModal && e.key !== 'F8' && e.key !== 'Escape' && e.key !== 'Enter') {
          e.preventDefault();
          e.stopPropagation();
          return;
        }
        if (e.key === 'F8') {
          if (e.repeat) return;
          e.preventDefault();
          e.stopImmediatePropagation();
          handleF8();
        }
        if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); handleEscape(); }
        return;
      }
      if (printModalOpenRef.current && (e.key === 'Insert' || e.key === 'F8' || e.key === 'Escape')) {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (e.key === 'Insert') handleInsert();
        else if (e.key === 'F8') { if (!e.repeat) handleF8(); }
        else handleEscape();
        return;
      }
      if (e.key === "Insert") {
        e.preventDefault();
        e.stopPropagation();
        handleInsert();
        return;
      }
      if (e.key === "F8") {
        if (e.repeat) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        handleF8();
      }
    };
    window.addEventListener("keydown", fallback, true);
    return () => window.removeEventListener("keydown", fallback, true);
  }, [handleInsert, handleF8, handleEscape, onCashierConfirm, showClearConfirm, closeClearConfirm, confirmClearBill, moveClearConfirmFocus]);

  // ══════════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════════
  const cardClass = isDark
    ? "rounded-2xl border border-yellow-500/20 bg-[#15120d]/95"
    : "rounded-2xl border border-yellow-200 bg-white";

  // ✅ Show salesperson UI only when feature enabled + agents exist
  // Show selector in Entry (left) to avoid duplicate header — hide right bar if entry bar present
  const showSPInEntry = salespersonEnabled && hasAgents;
  const showSPSelectorBar = salespersonEnabled && salespersonMultiple && hasAgents && !showSPInEntry;
  const showSPColumnInTable = salespersonEnabled && showSalespersonColumn && hasAgents;
  const enableMultiSPEdit = salespersonEnabled && salespersonMultiple && hasAgents;
  const showCommissionPanel = salespersonEnabled && hasAgents && items.length > 0;

  if (branchMissing) {
    return (
      <div className={`flex h-screen flex-col items-center justify-center gap-3 px-6 text-center ${isDark ? "bg-[#0a0805] text-gray-200" : "bg-gray-50 text-gray-800"}`}>
        <AlertCircle size={48} className="text-amber-500" />
        <h2 className="text-xl font-bold">{t('branchRequiredTitle', 'Branch not assigned')}</h2>
        <p className="max-w-md text-sm opacity-80">
          {t('branchRequiredBody', 'Your biller account must be linked to a branch (A One or J1). Contact Super Admin.')}
        </p>
      </div>
    );
  }

  return (
    <div dir={dir} className={`flex flex-col h-screen overflow-hidden ${isRTL ? 'text-right' : ''}`} style={{ fontSize: `${billerFontSize}px` }}>
      {/* Full-screen blocker — header + body disabled while any biller modal is open */}
      {billModalOpen && (
        <div
          className="fixed inset-x-0 bottom-0 top-12 z-[175] bg-black/40 backdrop-blur-[2px]"
          aria-hidden="true"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
          onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
          onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
        />
      )}

      {stallAlert && (
        <motion.div
          initial={{ opacity: 0, y: -10, x: 20 }}
          animate={{ opacity: 1, y: 0, x: 0 }}
          transition={{ delay: 0.6, duration: 0.3 }}
          className="fixed top-16 right-4 z-[210] max-w-xs"
        >
          <div className={cn(
            'rounded-lg border shadow-lg p-3 flex gap-2 items-start',
            isDark ? 'bg-rose-950/90 border-rose-500/30 text-white' : 'bg-rose-50 border-rose-300 text-rose-950',
          )}>
            <div className={cn(
              'w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5',
              isDark ? 'bg-rose-500/20 text-rose-300' : 'bg-rose-200 text-rose-700',
            )}>
              <AlertCircle className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-xs">{stallAlert.label}</p>
              <p className="text-xs mt-0.5 opacity-75">
                Bill {stallAlert.billSerial} · {stallAlert.durationLabel}
              </p>
            </div>
            <button
              type="button"
              onClick={clearStallAlert}
              className={cn(
                'shrink-0 px-2 py-1 rounded text-xs font-bold',
                isDark ? 'bg-white/10 hover:bg-white/15' : 'bg-rose-100 hover:bg-rose-200 border border-rose-200',
              )}
            >
              ✕
            </button>
          </div>
        </motion.div>
      )}

      <div className="relative z-[200] shrink-0">
      <BillerHeader
        currentBillSerial={currentBillSerial || nextPreviewSerial}
        nextPreviewSerial={nextPreviewSerial}
        screenLocked={screenLocked}
        customer={customer}
        setCustomer={(c) => updateTab({ customer: c })}
        isOnline={isOnline}
        soundEnabled={soundEnabled}
        setSoundEnabled={setSoundExclusive}
        soundMode={soundMode}
        setSoundMode={setSoundModeExclusive}
        onOpenCustomerDialog={openCustDialogAlways}
        offlineCount={offlineCount}
        items={items}
        billerName={userData?.name}
        showRecentOrders={showRecentOrders}
        toggleRecentOrders={() => setShowRecentOrders((v) => !v)}
        onViewInvoice={async (order) => {
          const hydrated = await hydrateOrderForInvoice(order, storeId);
          warmInvoiceQr(hydrated);
          setViewInvoiceSeq((n) => n + 1);
          setViewingOrder(hydrated);
        }}
        canToggleCashierMode={canToggleCashierMode}
        showDualButton={showDualButton}
        dualModeEnabled={dualModeEnabled}
        cashierModeActive={cashierModeActive}
        onToggleCashierMode={() => {
          if (!dualModeEnabled) {
            toast(t('permissionDualMode') || 'Dual mode disabled by Super Admin', { icon: '🔒' });
            return;
          }
          if (!canToggleCashierMode) {
            toast(t('permissionDualMode'), { icon: '🔒' });
            return;
          }
          setCashierModeActive((v) => !v);
        }}
        isSuperAdmin={isSuperAdmin}
        showProductName={showProductName}
        permissions={userData?.permissions}
        onTogglePermission={togglePermission}
        directPaid={directPaid}
        onToggleDirectPaid={() => setDirectPaid((v) => !v)}
        storeId={branchId}
        billerId={billerId}
        store={storeInfo}
        tabs={tabs}
        activeTabId={activeTabId}
        onSwitchTab={switchTab}
        onAddTab={addNewTab}
        onRemoveTab={closeTab}
        canAddTab={tabs.length < MAX_TABS}
        speechEnabled={false}
        isListening={speech.isListening}
        speechTranscript={speech.transcript}
        speechLang={speech.language}
        isSpeechSupported={speech.isSpeechSupported}
        onToggleSpeech={() => setSoundModeExclusive(soundMode === "counting" ? "music" : "counting")}
        onSetSpeechLang={speech.setLanguage}
        onFocusPriceInput={() => focusPriceInput()}
        countingEnabled={countingEnabled}
        setCountingEnabled={setCountingEnabled}
        countingLang={countingLang}
        setCountingLang={setCountingLang}
        countingSpeed={countingSpeed}
        setCountingSpeed={setCountingSpeed}
        countingSpeedMin={COUNTING_SPEED_MIN}
        countingSpeedMax={COUNTING_SPEED_MAX}
        countingSpeedDefault={COUNTING_SPEED_DEFAULT}
        onPreviewCounting={() => speakEntry(400, 3, { force: true })}
      />
      </div>

      {/* Offline banner — shrink-0 so merge toggle bar stays visible below */}
      {!isOnline && (
        <div className={`flex items-center justify-between rounded-xl border border-orange-500/30 bg-orange-500/10 px-3 py-1 mx-3 mt-1 shrink-0 min-h-[32px] ${isRTL ? 'flex-row-reverse' : ''} ${billModalOpen ? 'pointer-events-none opacity-50' : ''}`}>
          <div className={`flex items-center gap-2 ${isRTL ? 'flex-row-reverse' : ''}`}>
            <WifiOff size={13} className="text-orange-400 shrink-0" />
            <p className="font-semibold text-orange-400 text-xs">📴 {t('offlineBanner')}</p>
          </div>
          {offlineCount > 0 && (
            <span className="rounded bg-orange-500/20 px-2 py-0.5 text-xs font-bold text-orange-400">
              {offlineCount} {t('pendingLabel')}
            </span>
          )}
        </div>
      )}

      {/* ✅ Salesperson system enabled but no active agents — auto-hide after 1s */}
      <AnimatePresence>
        {showNoAgentsWarning && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25 }}
            className={`overflow-hidden mx-3 mt-1 shrink-0 ${billModalOpen ? 'pointer-events-none opacity-50' : ''}`}
          >
            <div className="flex items-center justify-between gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2">
              <div className="flex items-center gap-2 min-w-0">
                <AlertCircle size={14} className="text-red-400 shrink-0" />
                <p className="font-semibold text-red-400 text-xs">
                  ⚠️ {t('noAgentsWarning')}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowNoAgentsWarning(false)}
                className="shrink-0 p-0.5 rounded hover:bg-red-500/20 text-red-400/70 hover:text-red-400 transition-colors"
                aria-label="Dismiss warning"
              >
                <X size={12} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Tab bar */}
      <div className={`flex items-center gap-2 px-3 py-1.5 overflow-x-auto shrink-0 ${isDark ? "border-b border-yellow-500/10 bg-[#0c0a08]/40" : "border-b border-yellow-100 bg-amber-50/30"} ${billModalOpen ? 'pointer-events-none select-none opacity-50' : ''}`}>
        <AnimatePresence mode="popLayout">
          {tabs.map((tab) => {
            const tabTotal = computeTabGrandTotal(tab, discountPolicy);
            const tabItems = tab.items?.length || 0;
            const tabTotalLabel = formatTabTotalLabel(tabTotal);
            const isActive = tab.tabId === activeTabId;
            return (
            <motion.div key={tab.tabId} layout
              initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }} className="relative group shrink-0">
              <motion.button
                onClick={() => switchTab(tab.tabId)}
                whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                title={[
                  `Bill ${tab.tabId}`,
                  tabTotal > 0 ? `Rs ${tabTotal.toLocaleString()}` : null,
                  tabItems > 0 ? `${tabItems} items` : null,
                  _isRealBillSerial(tab.billSerial) ? tab.billSerial : null,
                ].filter(Boolean).join(" · ")}
                className={`flex items-center gap-2 rounded-lg px-2.5 h-9 min-w-[132px] border transition-all ${
                  isActive
                    ? "bg-gradient-to-r from-amber-400 to-amber-500 text-black border-amber-300 shadow-md shadow-amber-500/25 ring-1 ring-amber-400/50"
                    : isDark
                      ? "border-yellow-500/15 text-gray-300 hover:text-white bg-[#14110d] hover:bg-[#1a1610] hover:border-yellow-500/25"
                      : "border-yellow-200/80 text-gray-600 hover:text-gray-900 bg-white hover:bg-amber-50/80 hover:border-amber-300/60 shadow-sm"
                }`}>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                    tabItems > 0
                      ? "bg-emerald-400"
                      : isActive ? "bg-white/90" : isDark ? "bg-gray-500" : "bg-gray-300"
                  }`} />
                  <span className={`text-xs font-extrabold tracking-tight leading-none ${isActive ? "text-black" : ""}`}>
                    B{tab.tabId}
                  </span>
                </div>
                {tabTotalLabel ? (
                  <div className={`ml-auto flex items-baseline gap-0.5 rounded-md px-2 py-0.5 min-w-[68px] justify-end border ${
                    isActive
                      ? "bg-white border-white/90 text-emerald-800 shadow-sm"
                      : isDark
                        ? "bg-[#0d2818] border-emerald-500/40 text-emerald-300"
                        : "bg-emerald-600 border-emerald-700 text-white"
                  }`}>
                    <span className={`text-[9px] font-bold uppercase leading-none ${
                      isActive ? "text-emerald-600/80" : isDark ? "text-emerald-400/80" : "text-emerald-100"
                    }`}>
                      Rs
                    </span>
                    <span className="text-sm font-black tabular-nums leading-none tracking-tight">
                      {tabTotalLabel}
                    </span>
                  </div>
                ) : tabItems > 0 ? (
                  <span className={`ml-auto text-[10px] font-bold rounded-md px-1.5 py-0.5 ${
                    isActive ? "bg-white/90 text-black/70" : isDark ? "bg-yellow-500/15 text-yellow-400" : "bg-amber-100 text-amber-700"
                  }`}>
                    {tabItems}
                  </span>
                ) : null}
              </motion.button>
              {tabs.length > 1 && (
                <button
                  onClick={(e) => { e.stopPropagation(); closeTab(tab.tabId); }}
                  className="absolute -top-1 -right-1 w-4 h-4 rounded-full z-10 bg-red-500 text-white text-[10px] font-bold flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-red-400 shadow-md transition-opacity">
                  ×
                </button>
              )}
            </motion.div>
          );})}
        </AnimatePresence>
        {tabs.length < MAX_TABS && (
          <motion.button onClick={addNewTab} whileHover={{ scale: 1.06 }} whileTap={{ scale: 0.94 }}
            title={`New Bill (End key) — ${tabs.length}/${MAX_TABS}`}
            className={`h-9 w-9 rounded-lg border-2 border-dashed flex items-center justify-center text-base font-bold transition-colors shrink-0 ${isDark ? "border-yellow-500/30 text-yellow-500/50 hover:text-yellow-400 hover:border-yellow-500/50 hover:bg-yellow-500/5"
              : "border-amber-300 text-amber-500 hover:text-amber-600 hover:border-amber-400 hover:bg-amber-50"
              }`}>+
          </motion.button>
        )}
        <span className={`ml-auto text-[10px] font-semibold shrink-0 tabular-nums ${isDark ? "text-gray-600" : "text-gray-400"}`}>
          {tabs.length}/{MAX_TABS}
        </span>
      </div>

      {/* Main grid — entry + table locked when screenLocked; disabled while any biller modal is open */}
      <div
        className={`flex-1 grid gap-2 xl:grid-cols-[300px_1fr] min-h-0 px-3 mt-1 pb-2 overflow-hidden transition-opacity ${
          screenLocked ? 'pointer-events-none select-none opacity-55' : ''
        } ${billModalOpen ? 'pointer-events-none select-none opacity-50' : ''}`}
      >

        {/* LEFT: Entry Form */}
        <section className={`${cardClass} flex flex-col overflow-hidden`}>
          <div className="flex-1 overflow-y-auto p-3">
            <div className="flex flex-col gap-2">
              <div className={`flex items-center justify-between shrink-0 ${isRTL ? 'flex-row-reverse' : ''}`}>
                <div className={`flex items-center gap-2 ${isRTL ? 'flex-row-reverse' : ''}`}>
                  <ShoppingCart size={14} className="text-yellow-500" />
                  <h2 className="font-bold text-yellow-600 text-sm">{t('entry')}</h2>
                </div>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${screenLocked ? "bg-red-100 text-red-600" : "bg-green-100 text-green-600"}`}>
                  {screenLocked ? t('locked') : t('active')}
                </span>
              </div>

              {screenLocked && (
                <div className={`rounded-xl p-3 border text-center shrink-0 ${isDark ? "bg-yellow-500/5 border-yellow-500/20" : "bg-yellow-50 border-yellow-200"}`}>
                  <Lock size={18} className="mx-auto mb-1.5 text-yellow-500" />
                  <p className={`text-xs font-bold ${isDark ? "text-white" : "text-gray-900"}`}>{t('billLocked')}</p>
                  <p className={`text-[11px] mt-1 ${isDark ? "text-gray-400" : "text-gray-600"}`}>{t('insertToStart')}</p>
                  {nextPreviewSerial && nextPreviewSerial !== "----" && (
                    <p className={`mt-2 font-mono text-[11px] ${isDark ? "text-yellow-500/70" : "text-yellow-600/80"}`}>
                      {t('next')}: <strong className="text-yellow-500">{nextPreviewSerial}</strong>
                    </p>
                  )}
                </div>
              )}

              {!screenLocked && nextPreviewSerial && (
                <div className={`rounded-xl p-2 border shrink-0 ${isDark ? "bg-yellow-500/5 border-yellow-500/20" : "bg-yellow-50 border-yellow-200"}`}>
                  <p className="text-[10px] uppercase tracking-wide text-gray-500">{t('nextBillSerial')}</p>
                  <p className="text-lg font-bold text-yellow-600 font-mono whitespace-nowrap">{nextPreviewSerial}</p>
                  {billStartTime && (
                    <p className="text-[10px] text-gray-500 mt-0.5">{t('started')}: {fmtTime(billStartTime)}</p>
                  )}
                </div>
              )}

              {showProductName && (
                <div className="shrink-0 min-w-0 relative">
                  <label className="block text-[10px] font-semibold text-amber-500/90 mb-1 uppercase tracking-wide">{t('productName', 'Product Name')}</label>
                  <input
                    ref={productNameRef}
                    type="text"
                    value={form.productName}
                    data-bill-input="true"
                    data-entry-field="product"
                    placeholder={t('productNamePlaceholder', 'Gold ring, chain...')}
                    onChange={(e) => {
                      const cleaned = sanitizeProductNameInput(e.target.value);
                      setForm((p) => ({ ...p, productName: cleaned }));
                      setProductSugIndex(-1);
                      if (productCatalog.length > 0) setProductSugOpen(true);
                    }}
                    onFocus={() => { if (productCatalog.length > 0) setProductSugOpen(true); }}
                    onBlur={() => setTimeout(() => {
                      setProductSugOpen(false);
                      setProductSugIndex(-1);
                    }, 150)}
                    onKeyDownCapture={(e) => {
                      if (e.key.length === 1 && /\d/.test(e.key)) {
                        e.preventDefault();
                        return;
                      }
                      if (e.key === "Escape" && productSugOpen) {
                        e.preventDefault();
                        e.stopPropagation();
                        setProductSugOpen(false);
                        setProductSugIndex(-1);
                        return;
                      }

                      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                        if (filteredProducts.length === 0) return;
                        e.preventDefault();
                        e.stopPropagation();
                        setProductSugOpen(true);
                        setProductSugIndex((prev) => {
                          const max = filteredProducts.length - 1;
                          if (prev < 0) return e.key === "ArrowDown" ? 0 : max;
                          if (e.key === "ArrowDown") return prev >= max ? 0 : prev + 1;
                          return prev <= 0 ? max : prev - 1;
                        });
                        return;
                      }

                      if (e.key === "Enter") {
                        if (productSugOpen && filteredProducts.length > 0) {
                          e.preventDefault();
                          e.stopPropagation();
                          const selected = filteredProducts[productSugIndex >= 0 ? productSugIndex : 0];
                          if (selected) {
                            selectProductFromCatalog(selected.name);
                            return;
                          }
                        }
                        const nameEmpty = !(productNameRef.current?.value ?? form.productName ?? "").trim();
                        const priceEmpty = !(priceInputRef.current?.value ?? form.price ?? "").trim();
                        if (nameEmpty && priceEmpty && items.length > 0) {
                          e.preventDefault();
                          e.stopPropagation();
                          handleAddItem();
                          return;
                        }
                        e.preventDefault();
                        e.stopPropagation();
                        priceInputRef.current?.focus();
                        try { priceInputRef.current?.select(); } catch { /* ignore */ }
                      }
                    }}
                    onPaste={(e) => {
                      e.preventDefault();
                      const pasted = sanitizeProductNameInput(e.clipboardData?.getData("text") || "");
                      setForm((p) => ({ ...p, productName: pasted }));
                      setProductSugIndex(-1);
                      if (productCatalog.length > 0) setProductSugOpen(true);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') {
                        e.preventDefault();
                        setProductSugOpen(false);
                        setProductSugIndex(-1);
                      }
                    }}
                    disabled={screenLocked}
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck={false}
                    style={{ fontSize: `clamp(12px, ${billerEntryFontSize}px, 18px)` }}
                    className={`w-full min-w-0 rounded-xl border px-2.5 sm:px-3 py-2 sm:py-2.5 font-semibold outline-none focus:ring-2 focus:ring-amber-500/30 placeholder:text-[10px] sm:placeholder:text-xs placeholder:opacity-45 ${isDark ? 'border-amber-500/35 bg-[#0f0d09] text-amber-100 placeholder:text-gray-600' : 'border-amber-300 bg-white text-gray-900 placeholder:text-gray-400'} disabled:opacity-50`}
                  />

                  {productSugOpen && !screenLocked && (
                    <div className={`absolute left-0 right-0 top-full mt-2 z-50 overflow-hidden rounded-3xl border shadow-2xl ${isDark ? 'bg-[#110b04]/95 border-amber-500/30' : 'bg-white/95 border-amber-200'} backdrop-blur-xl`}>
                      <div className={`flex items-center justify-between gap-3 px-4 py-2 border-b ${isDark ? 'border-amber-500/10 bg-[#120c05]' : 'border-amber-100 bg-amber-50/95'}`}>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-amber-300">
                          {t('productCatalogSuggestions', 'Product suggestions')}
                        </p>
                        {productCatalogResults.length > 0 && (
                          <span className="inline-flex items-center gap-2 rounded-full bg-amber-500/10 px-2.5 py-0.5 text-[10px] font-semibold text-amber-100">
                            <span>{productCatalogResults.length.toLocaleString()}</span>
                            <span className="text-amber-200">{t('productCatalogItems', 'items')}</span>
                          </span>
                        )}
                      </div>

                      {filteredProducts.length === 0 ? (
                        <div className="px-4 py-6 text-center text-sm text-gray-400">
                          {t('productCatalogNoMatch', 'No items match your search.')}
                        </div>
                      ) : (
                        <div className="max-h-[280px] overflow-y-auto">
                          {filteredProducts.map((p, i) => (
                            <button
                              key={p.id || p.name}
                              ref={(el) => { if (el) productSugItemRefs.current[p.id || p.name] = el; }}
                              type="button"
                              onMouseDown={(e) => { e.preventDefault(); selectProductFromCatalog(p.name); }}
                              onMouseEnter={() => setProductSugIndex(i)}
                              className={cn(
                                'w-full text-left px-3 py-2.5 text-[13px] font-semibold border-b last:border-0 transition duration-150 leading-5',
                                productSugIndex === i
                                  ? 'bg-amber-500/20 text-amber-100'
                                  : isDark
                                    ? 'text-amber-100 border-amber-500/10 hover:bg-amber-500/10 hover:text-white'
                                    : 'text-gray-900 border-amber-100 hover:bg-amber-50',
                              )}
                              title={p.name}
                              aria-selected={productSugIndex === i}
                            >
                              {p.name}
                            </button>
                          ))}
                        </div>
                      )}

                      {productCatalogResults.length > filteredProducts.length && (
                        <div className={cn('border-t px-4 py-3 text-[11px] text-gray-400', isDark ? 'border-amber-500/10 bg-[#120c05]' : 'border-amber-100 bg-amber-50/90')}>
                          {`Showing ${filteredProducts.length} of ${productCatalogResults.length} products.`}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                {/* Entry Salesperson selector (avoids duplicate header) */}
                {showSPInEntry && (
                  <div className="col-span-2 mb-1">
                    <CurrentSPBar
                      agents={salespersonAgents}
                      currentSPId={currentSPId}
                      onSelect={handleSelectSalesperson}
                      required={salespersonRequireSelection}
                      isDark={isDark}
                    />
                    <div className="flex items-center gap-2 mt-2">
                      <button
                        type="button"
                        onClick={() => setGroupBySalesperson((g) => !g)}
                        className={`text-xs font-medium px-2 py-1 rounded-lg ${groupBySalesperson ? (isDark ? 'bg-amber-500/15 text-amber-400' : 'bg-amber-50 text-amber-700') : (isDark ? 'bg-[#0f0d09] text-gray-400' : 'bg-white text-gray-600')} `}
                      >
                        {groupBySalesperson ? t('flatView') : t('groupBySP')}
                      </button>
                    </div>
                  </div>
                )}
                <div>
                  <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">{t('price')}</label>
                  <input ref={priceInputRef} type="text" inputMode="decimal" data-bill-input="true" data-entry-field="price" value={form.price}
                    onChange={(e) => { const v = e.target.value.replace(/[^\d]/g, ""); setForm((p) => ({ ...p, price: v })); if (v) intentionalDupRef.current = false; }}
                    onClick={(e) => e.currentTarget.select()}
                    onKeyDownCapture={(e) => {
                      if (e.key !== "Enter" || !showProductName) return;
                      const priceEmpty = !(e.currentTarget.value ?? form.price ?? "").trim();
                      const nameEmpty = !(productNameRef.current?.value ?? form.productName ?? "").trim();
                      if (priceEmpty && nameEmpty && items.length > 0) {
                        e.preventDefault();
                        e.stopPropagation();
                        handleAddItem();
                        return;
                      }
                      e.preventDefault();
                      e.stopPropagation();
                      qtyInputRef.current?.focus();
                      try { qtyInputRef.current?.select(); } catch { /* ignore */ }
                    }}
                    onKeyDown={(e) => {
                      const ok = ["Backspace", "Delete", "Tab", "Escape", "Enter", "ArrowLeft", "ArrowRight", "Home", "End"];
                      if (!ok.includes(e.key) && !/^\d$/.test(e.key) && !((e.ctrlKey || e.metaKey) && ["a", "c", "v", "x"].includes(e.key.toLowerCase()))) e.preventDefault();
                    }}
                    disabled={screenLocked} autoComplete="off" autoCorrect="off" spellCheck={false}
                    style={{ fontSize: `${billerEntryFontSize}px` }}
                    className={`w-full rounded-xl border px-3 py-2.5 font-bold font-mono outline-none focus:ring-2 focus:ring-yellow-500/30 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${isDark ? "border-yellow-500/30 bg-[#0f0d09] text-yellow-400" : "border-yellow-300 bg-white text-yellow-700"} disabled:opacity-50`} />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">{t('qty')}</label>
                  <input ref={qtyInputRef} type="text" inputMode="numeric" data-bill-input="true" data-entry-field="qty" value={form.qty}
                    onChange={(e) => handleFormQtyChange(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "ArrowUp") {
                        e.preventDefault();
                        e.stopPropagation();
                        setForm((p) => ({ ...p, qty: (Number(p.qty) || 1) + 1 }));
                      }
                      if (e.key === "ArrowDown") {
                        e.preventDefault();
                        e.stopPropagation();
                        setForm((p) => ({ ...p, qty: Math.max(1, (Number(p.qty) || 1) - 1) }));
                      }
                    }}
                    onClick={(e) => e.currentTarget.select()}
                    disabled={screenLocked} autoComplete="off" autoCorrect="off" spellCheck={false}
                    style={{ fontSize: `${billerEntryFontSize}px` }}
                    className={`w-full rounded-xl border px-3 py-2.5 font-bold font-mono text-center outline-none focus:ring-2 focus:ring-yellow-500/30 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${isDark ? "border-yellow-500/20 bg-[#0f0d09] text-white" : "border-yellow-200 bg-white text-gray-900"} disabled:opacity-50`} />
                </div>
              </div>

              {showDiscountField && (
                <div>
                  <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">
                    {t('discount') || 'Discount'} (Rs)
                    {Number(form.price) > 0 && maxItemDiscountPercent !== Infinity && (
                      <span className="normal-case font-normal text-gray-500 ml-1">
                        — max Rs {computeMaxAllowedPerUnit(Number(form.price) || 0)}
                        {maxItemDiscountPercent !== Infinity ? ` (${maxItemDiscountPercent}%)` : ''}
                      </span>
                    )}
                  </label>
                  <input ref={discountInputRef} type="text" inputMode="decimal" data-bill-input="true" data-entry-field="discount" value={form.discount}
                    onChange={(e) => {
                      const cleaned = e.target.value.replace(/[^\d]/g, "");
                      if (cleaned === "") {
                        setForm((p) => ({ ...p, discount: "", discountType: "fixed" }));
                        return;
                      }
                      const curPrice = Number(form.price) || 0;
                      const maxAllowed = computeMaxAllowedPerUnit(curPrice);
                      if (!isDiscountInputAllowed(cleaned, maxAllowed)) {
                        showDiscountLimitToast({
                          maxAllowed,
                          attempted: Number(cleaned) || 0,
                          percentLimit: maxItemDiscountPercent,
                        });
                        return;
                      }
                      setForm((p) => ({ ...p, discount: cleaned, discountType: "fixed" }));
                      if (!form.price || form.price === "") intentionalDupRef.current = Number(cleaned) > 0 || _safeQty(form.qty) > 1;
                    }}
                    onClick={(e) => e.currentTarget.select()}
                    onKeyDown={(e) => {
                      if (e.key.length === 1 && /\d/.test(e.key)) {
                        const el = e.target;
                        const selStart = el.selectionStart ?? 0;
                        const selEnd = el.selectionEnd ?? 0;
                        const next = `${String(form.discount ?? "").slice(0, selStart)}${e.key}${String(form.discount ?? "").slice(selEnd)}`;
                        const cleaned = next.replace(/[^\d]/g, "");
                        const maxAllowed = computeMaxAllowedPerUnit(Number(form.price) || 0);
                        if (!isDiscountInputAllowed(cleaned, maxAllowed)) {
                          e.preventDefault();
                          showDiscountLimitToast({
                            maxAllowed,
                            attempted: Number(cleaned) || 0,
                            percentLimit: maxItemDiscountPercent,
                          });
                        }
                      }
                    }}
                    disabled={screenLocked} autoComplete="off" autoCorrect="off" spellCheck={false}
                    className={`w-full rounded-xl border px-3 py-2.5 text-sm font-semibold font-mono outline-none transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${
                      (() => {
                        const curPrice = Number(form.price) || 0;
                        const max = computeMaxAllowedPerUnit(curPrice);
                        const disc = parseEntryDiscount(form.discount);
                        return disc > 0 && Number.isFinite(max) && disc >= max
                          ? isDark ? "border-red-500/60 bg-red-500/8 text-red-300 ring-1 ring-red-500/20" : "border-red-300 bg-red-50 text-red-700"
                          : isDark ? "border-yellow-500/20 bg-[#0f0d09] text-white" : "border-yellow-200 bg-white text-gray-900";
                      })()
                    } disabled:opacity-50`} />
                </div>
              )}

              <hr className={isDark ? "border-yellow-500/10" : "border-yellow-100"} />

              {/* Customer name */}
              <div>
                <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">{t('customer') || 'Customer'}</label>
                <div className="relative">
                  <div className="flex gap-1.5">
                    <div className="relative flex-1">
                      <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                      <input ref={nameInputRef} type="text"
                        value={custNameSearch || customer.name}
                        onChange={(e) => onNameChange(e.target.value)}
                        onFocus={() => { setActiveField("name"); const v = custNameSearch || customer.name; if (v.length >= 2 && v !== "Walking Customer") doSearch(v); }}
                        onBlur={() => setTimeout(() => { if (activeField === "name") { setShowSug(false); setActiveField(""); } }, 200)}
                        disabled={screenLocked} autoComplete="off" autoCorrect="off" spellCheck={false}
                        className={`w-full rounded-xl border pl-8 pr-3 py-2 text-sm outline-none ${isDark ? "border-yellow-500/20 bg-[#0f0d09] text-white" : "border-yellow-200 bg-white text-gray-900"} disabled:opacity-50`} />
                    </div>
                    <button onClick={openCustDialogAlways}
                      className={`px-2.5 rounded-xl border ${isDark ? "bg-yellow-500/10 text-yellow-400 border-yellow-500/20" : "bg-yellow-50 text-yellow-700 border-yellow-200"}`}>
                      <User size={14} />
                    </button>
                  </div>
                  {showSug && activeField === "name" && (
                    <div className={`absolute top-full left-0 right-0 z-50 mt-1 rounded-xl border shadow-xl max-h-44 overflow-y-auto ${isDark ? "bg-[#1a1508] border-yellow-500/30" : "bg-white border-yellow-200"}`}>
                      {sugLoading ? (
                        <div className="flex items-center justify-center py-3 gap-2">
                          <Loader2 size={13} className="animate-spin text-yellow-500" />
                          <span className="text-xs text-gray-400">{t('searching')}</span>
                        </div>
                      ) : custSuggestions.length > 0 ? custSuggestions.map((c, i) => (
                        <button key={i} onMouseDown={() => onSelectSuggestion(c)}
                          className={`w-full text-left px-3 py-2 text-sm hover:bg-yellow-500/10 border-b last:border-0 ${isDark ? "text-white border-yellow-500/10" : "text-gray-900 border-gray-100"}`}>
                          <div className="flex items-center justify-between">
                            <span className="font-medium">{c.name || t('noName')}</span>
                            {c.phone && <span className={`text-xs font-mono ${isDark ? "text-yellow-400" : "text-yellow-600"}`}>{c.phone}</span>}
                          </div>
                          {c.city && <span className={`text-[10px] ${isDark ? "text-gray-500" : "text-gray-400"}`}>{c.city}{c.market ? ` • ${c.market}` : ""}</span>}
                        </button>
                      )) : (
                        <div className={`px-3 py-3 text-xs text-center ${isDark ? "text-gray-500" : "text-gray-400"}`}>{t('noRecordFound')}</div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Phone */}
              <div>
                <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">{t('phone')}</label>
                <div className="relative">
                  <input ref={phoneInputRef} type="tel" inputMode="numeric" value={custPhoneSearch}
                    onChange={(e) => onPhoneChange(e.target.value.replace(/[^0-9+]/g, ""))}
                    onFocus={() => { setActiveField("phone"); if (custPhoneSearch.length >= 3) doSearch(custPhoneSearch); }}
                    onBlur={() => setTimeout(() => { if (activeField === "phone") { setShowSug(false); setActiveField(""); } }, 200)}
                    disabled={screenLocked} autoComplete="off" autoCorrect="off" spellCheck={false}
                    className={`w-full rounded-xl border px-3 py-2 text-sm outline-none ${isDark ? "border-yellow-500/20 bg-[#0f0d09] text-white" : "border-yellow-200 bg-white text-gray-900"} disabled:opacity-50`} />
                  {showSug && activeField === "phone" && (
                    <div className={`absolute top-full left-0 right-0 z-50 mt-1 rounded-xl border shadow-xl max-h-44 overflow-y-auto ${isDark ? "bg-[#1a1508] border-yellow-500/30" : "bg-white border-yellow-200"}`}>
                      {sugLoading ? (
                        <div className="flex items-center justify-center py-3 gap-2">
                          <Loader2 size={13} className="animate-spin text-yellow-500" />
                          <span className="text-xs text-gray-400">{t('searching')}</span>
                        </div>
                      ) : custSuggestions.length > 0 ? custSuggestions.map((c, i) => (
                        <button key={i} onMouseDown={() => onSelectSuggestion(c)}
                          className={`w-full text-left px-3 py-2 text-sm hover:bg-yellow-500/10 border-b last:border-0 ${isDark ? "text-white border-yellow-500/10" : "text-gray-900 border-gray-100"}`}>
                          <div className="flex items-center justify-between">
                            <span className={`text-xs font-mono font-bold ${isDark ? "text-yellow-400" : "text-yellow-600"}`}>{c.phone}</span>
                            <span className="font-medium">{c.name || t('noName')}</span>
                          </div>
                          {c.city && <span className={`text-[10px] ${isDark ? "text-gray-500" : "text-gray-400"}`}>{c.city}{c.market ? ` • ${c.market}` : ""}</span>}
                        </button>
                      )) : (
                        <div className={`px-3 py-3 text-xs text-center ${isDark ? "text-gray-500" : "text-gray-400"}`}>{t('noRecordFound')}</div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <button onClick={handleAddItem} disabled={screenLocked}
                className="w-full rounded-xl bg-gradient-to-r from-yellow-500 to-amber-500 px-4 py-2.5 text-sm font-bold text-black hover:from-yellow-400 hover:to-amber-400 disabled:opacity-50 active:scale-95 transition-transform">
                ➕ {t('addItem')}
              </button>

              {lastEntryRef.current.price && (
                <p className="text-center text-[10px] text-gray-400 font-mono">
                  {lastEntryRef.current.price.toLocaleString()} ×{lastEntryRef.current.qty}
                  {" · "}{t('duplicateHint')}
                </p>
              )}
            </div>
          </div>
        </section>

        {/* ════════════════════════════════════════════════════ */}
        {/* RIGHT: Table + Footer                                 */}
        {/* ════════════════════════════════════════════════════ */}
        <div className="flex flex-col min-h-0 gap-1.5 overflow-hidden">

          {/* Main table section */}
          <section className={`${cardClass} flex flex-col flex-1 min-h-0 overflow-hidden`}>

            {/* ✅ Current Salesperson Bar — only when SP feature ON + multi + agents exist */}
            {showSPSelectorBar && (
              <div className={`px-3 py-2 flex flex-wrap items-center justify-between gap-2 border-b shrink-0 ${isDark ? "border-yellow-500/10 bg-[#160f08]" : "border-yellow-100 bg-yellow-50/50"
                }`}>
                <CurrentSPBar
                  agents={salespersonAgents}
                  currentSPId={currentSPId}
                  onSelect={handleSelectSalesperson}
                  required={salespersonRequireSelection}
                  isDark={isDark}
                />
                {currentAgent && (
                  <span className="text-xs font-bold text-amber-500 animate-pulse">
                    {t('nextItemsTo')} {currentAgent.name}
                  </span>
                )}
              </div>
            )}

            {/* ── Merge Items Toggle Bar — hidden when Super Admin disables merge ── */}
            {adminMergeEnabled && (
            <div className={`sticky top-0 z-10 px-3 py-1.5 flex items-center justify-between shrink-0 border-b ${
              isDark ? 'border-yellow-500/10 bg-[#0f0d08]' : 'border-yellow-100 bg-yellow-50/30'
            }`}>
              <span className={`text-[10px] font-semibold uppercase tracking-wide ${
                isDark ? 'text-gray-500' : 'text-gray-400'
              }`}>
                {t('items')}
              </span>
              <button
                type="button"
                onClick={toggleMergeItems}
                title={mergeItems ? t('mergeOnTip') : t('mergeOffTip')}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all ${
                  mergeItems
                    ? isDark
                      ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/25'
                      : 'bg-emerald-50 border border-emerald-200 text-emerald-700 hover:bg-emerald-100'
                    : isDark
                      ? 'bg-yellow-500/10 border border-yellow-500/20 text-yellow-500 hover:bg-yellow-500/20'
                      : 'bg-yellow-50 border border-yellow-200 text-yellow-700 hover:bg-yellow-100'
                }`}
              >
                {/* Toggle pill */}
                <span className={`relative inline-flex h-3.5 w-6 rounded-full transition-colors ${
                  mergeItems
                    ? 'bg-emerald-500'
                    : isDark ? 'bg-gray-600' : 'bg-gray-300'
                }`}>
                  <span className={`absolute top-0.5 h-2.5 w-2.5 rounded-full bg-white shadow transition-transform ${
                    mergeItems ? 'translate-x-2.5' : 'translate-x-0.5'
                  }`} />
                </span>
                <span>{t('mergeItems')}</span>
                <span className={`text-[9px] font-mono ${
                  mergeItems
                    ? 'text-emerald-400'
                    : isDark ? 'text-yellow-500' : 'text-yellow-600'
                }`}>
                  {mergeItems ? t('mergeOn') : t('mergeOff')}
                </span>
              </button>
            </div>
            )}

            {/* ✅ BillItemsTable — full flex space */}
            <div ref={tableContainerRef} className="flex-1 min-h-0 overflow-hidden flex flex-col">
              <BillItemsTable
                items={items}
                selectedRowIndex={selectedRowIndex}
                lastItemId={lastItemId}
                onSelectRow={selectRow}
                billerFontSize={billerTableFontSize}
                emptyHint={t('enterNewItem', 'Please enter a new item')}
                agents={salespersonAgents}
                showSalesperson={showSPColumnInTable || showSPInEntry}
                showCommissionColumn={false}
                showDiscountField={showDiscountField}
                showProductName={showProductName}
                multiSP={enableMultiSPEdit}
                groupBy={groupBySalesperson}
                onGroupToggle={(v) => setGroupBySalesperson(Boolean(v))}
                onItemRemove={deleteRow}
                onItemReassign={handleReassignItem}
                onQtyChange={changeQty}
                onDiscountChange={changeDiscount}
                isDark={isDark}
                allowQtyEdit={(billerSettings?.billerUI?.qtyEditable ?? settings?.billerUI?.qtyEditable) !== false}
                // pass biller-specific discount caps so table can enforce limits live
                discountSetting={discountSettingForTable}
                onInvalidDiscount={({ itemId, attempted, max, type }) => {
                  const maxLabel = type === 'percent' ? `${max}%` : `Rs ${max}`;
                  const attemptedLabel = type === 'percent' ? `${attempted}%` : `Rs ${attempted}`;
                  toast.dismiss('disc-limit-toast');
                  toast(
                    (t) => (
                      <div style={{ display: "flex", alignItems: "flex-start", gap: "12px" }}>
                        <span style={{ fontSize: "22px", lineHeight: 1 }}>🚫</span>
                        <div>
                          <p style={{ margin: 0, fontWeight: 800, fontSize: "13px", color: "#f87171" }}>Discount Limit Exceed</p>
                          <p style={{ margin: "3px 0 0", fontSize: "11px", color: "#fbbf24" }}>
                            Max allowed: <strong>{maxLabel}</strong> — aap ne diya: <strong>{attemptedLabel}</strong>
                          </p>
                          <p style={{ margin: "2px 0 0", fontSize: "10px", color: "#6b7280" }}>
                            Discount limit se zyada nahi ho sakta.
                          </p>
                        </div>
                      </div>
                    ),
                    {
                      id: 'disc-limit-toast',
                      duration: 3000,
                      style: {
                        background: "#1a0a0a",
                        border: "1px solid rgba(248,113,113,0.35)",
                        borderRadius: "14px",
                        padding: "12px 16px",
                        boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
                        minWidth: "280px",
                      },
                      icon: null,
                    },
                  );
                }}
              />
            </div>

            {/* Commission summary moved to bottom for fixed placement (see below) */}

            {/* Bill discount */}
            {items.length > 0 && allowBillDiscount && (
              <div className={`shrink-0 border-t px-3 py-1 ${isDark ? "border-yellow-500/10 bg-[#12100a]" : "border-yellow-100 bg-yellow-50/50"}`}>
                <div className="flex items-center justify-between gap-3">
                  <label className={`text-[10px] font-bold uppercase ${isDark ? "text-gray-400" : "text-gray-600"}`}>{t('billDiscount')}</label>
                  <div className="flex items-center gap-1">
                    {(allowBillDiscountPKR && allowBillDiscountPercent) && (
                      <button
                        type="button"
                        onClick={() => updateTab({ billDiscountType: billDiscountType === "fixed" ? "percent" : "fixed" })}
                        className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${isDark ? "border-yellow-500/30 text-yellow-400" : "border-yellow-300 text-yellow-700"}`}
                      >
                        {billDiscountType === "percent" ? "%" : "Rs"}
                      </button>
                    )}
                    <input type="text" inputMode="decimal" value={billDiscount}
                      onChange={(e) => {
                        const cleaned = e.target.value.replace(/[^0-9.]/g, "");
                        const type = billDiscountType || discountPolicy.defaultBillDiscountType || "fixed";
                        if (cleaned === "") {
                          updateTab({ billDiscount: "", billDiscountType: type });
                          return;
                        }
                        const raw = Number(cleaned) || 0;
                        const cap = type === "percent"
                          ? (maxBillDiscountPercentNum > 0 ? maxBillDiscountPercentNum : 100)
                          : (maxBillDiscountPKR > 0 ? maxBillDiscountPKR : Infinity);
                        if (!isDiscountInputAllowed(cleaned, cap)) {
                          showDiscountLimitToast({ maxAllowed: cap, attempted: raw });
                          return;
                        }
                        updateTab({ billDiscount: raw, billDiscountType: type });
                      }}
                      onKeyDown={(e) => {
                        if (e.key.length === 1 && /[0-9.]/.test(e.key)) {
                          const el = e.target;
                          const selStart = el.selectionStart ?? 0;
                          const selEnd = el.selectionEnd ?? 0;
                          const next = `${String(billDiscount).slice(0, selStart)}${e.key}${String(billDiscount).slice(selEnd)}`;
                          const cleaned = next.replace(/[^0-9.]/g, "");
                          const cap = maxBillDiscountPKR > 0 ? maxBillDiscountPKR : Infinity;
                          if (!isDiscountInputAllowed(cleaned, cap)) {
                            e.preventDefault();
                            showDiscountLimitToast({
                              maxAllowed: cap,
                              attempted: Number(cleaned) || 0,
                            });
                          }
                        }
                      }}
                      disabled={screenLocked}
                      className={`w-24 rounded-lg border px-2 py-1 text-center text-xs outline-none ${isDark ? "border-yellow-500/20 bg-black/30 text-white" : "border-yellow-200 bg-white text-gray-900"} disabled:opacity-50`} />
                    <span className={`text-xs font-bold px-2 py-1 rounded-lg ${isDark ? "bg-yellow-500/10 text-yellow-400" : "bg-yellow-50 text-yellow-700"}`}>Rs</span>
                    {billDiscountValue > 0 && (
                      <span className="text-xs font-bold text-red-400 ml-1">-{billDiscountValue.toLocaleString()}</span>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Totals */}
            {items.length > 0 && (
              <div className={`shrink-0 border-t-2 ${isDark ? "border-yellow-500/30 bg-[#1a1508]" : "border-yellow-300 bg-yellow-50"}`}>
                <div className="flex items-center justify-between px-3 py-1">
                  <div className="flex items-center gap-3">
                    {[
                      ["Items", items.length],
                      ["Qty", totalQty],
                      ...(totalDiscount + billDiscountValue > 0
                        ? [["Saved", `−${(totalDiscount + billDiscountValue).toLocaleString()}`]]
                        : []),
                    ].map(([label, val]) => (
                      <div key={label}>
                        <span className={`text-[9px] uppercase ${isDark ? "text-gray-500" : "text-gray-400"}`}>{label}</span>
                        <p className={`font-bold leading-tight ${label === "Saved" ? "text-red-400"
                          : label === "Commission" ? "text-emerald-400"
                            : isDark ? "text-white" : "text-gray-900"
                          }`} style={{ fontSize: `${Math.max(billerFontSize - 2, 13)}px` }}>{val}</p>
                      </div>
                    ))}
                  </div>
                  <div className="text-right">
                    {billDiscountValue > 0 && (
                      <span className={`text-xs line-through block ${isDark ? "text-gray-500" : "text-gray-400"}`}>Rs.{subtotal.toLocaleString()}</span>
                    )}
                    <p className="font-extrabold text-yellow-500 leading-tight" style={{ fontSize: `${Math.min(totalFontSize, 26)}px` }}>
                      Rs.{finalTotal.toLocaleString()}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* Action bar */}
          <section className={`${cardClass} px-3 py-1.5 shrink-0`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs">
                {permissions.showTimestamps && billStartTime && (
                  <span className={`inline-flex items-center gap-1 ${isDark ? "text-gray-500" : "text-gray-400"}`}>
                    <Clock3 size={10} /> {fmtTime(billStartTime)}
                  </span>
                )}
                {selectedRowIndex >= 0 && items.length > 0 && (
                  <span className={`rounded px-1.5 py-0.5 text-[10px] ${isDark ? "bg-blue-500/10 text-blue-300" : "bg-blue-50 text-blue-600"}`}>
                    Row {selectedRowIndex + 1}/{items.length}
                  </span>
                )}
              </div>
              <div className="flex gap-1.5">
                {permissions.allowCancelBill && (
                  <button onClick={cancelBill} disabled={items.length === 0}
                    className={`rounded-xl px-2.5 py-1.5 text-xs font-medium ${isDark ? "border border-red-500/20 bg-red-500/10 text-red-400 hover:bg-red-500/20" : "border border-red-200 bg-red-50 text-red-600 hover:bg-red-100"} disabled:opacity-40`}>
                    <Trash2 size={11} className="inline mr-1" /> {t('cancelBill', 'Cancel')}
                  </button>
                )}
                <button onClick={handleF8}
                  disabled={items.length === 0 || submitting || saveDoneRef.current}
                  className="inline-flex items-center gap-1.5 rounded-xl px-4 py-1.5 text-sm font-bold bg-yellow-500 text-black hover:bg-yellow-400 disabled:opacity-40 active:scale-95 transition-transform">
                  {submitting ? <Loader2 size={13} className="animate-spin" /> : <Printer size={13} />}
                  {submitting ? t('billSaving', 'Saving...') : t('checkout', 'F8: Checkout')}
                </button>
              </div>
            </div>
          </section>

          {/* Hotkey legend */}
          <section className={`${cardClass} p-1.5 shrink-0`}>
            <div className="flex flex-wrap gap-1">
              {[
                ["INS", t('newBill','New')], ["Enter", t('addItem2','Add')], ["F8", t('checkout','Checkout')], ["ESC", t('back','Back')],
                ["END", t('newTab','New Tab')], ["−", t('deleteLast2','Del Last')], ["DEL", t('clearBill','Clear All')], ["↑↓", t('navigate','Nav')],
                ["F2", t('phone', 'Phone')], ["Home", t('switchTab', 'Switch Tab')], ["Num+", t('qty','Qty')], ["Num/", t('billDiscount','Disc')], ["Ctrl+1-5", t('switchTab','Switch')], ["Ctrl+W", t('closeBill','Close')],
              ].map(([k, a]) => (
                <span key={k} className={`inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[9px] ${isDark ? "bg-yellow-500/10 text-yellow-400" : "bg-yellow-50 text-yellow-700"}`}>
                  <span className="font-mono font-bold">{k}</span>
                  <span className={isDark ? "text-gray-500" : "text-gray-400"}>{a}</span>
                </span>
              ))}
            </div>
          </section>
        </div>
      </div>

      {/* Clear confirm modal */}
      <AnimatePresence>
        {showClearConfirm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[190] flex items-start justify-end bg-black/35 p-3"
            data-biller-modal="true"
            data-clear-confirm="true"
            onClick={closeClearConfirm}>
            <motion.div initial={{ opacity: 0, x: 28, scale: 0.96 }} animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 28, scale: 0.96 }} onClick={(e) => e.stopPropagation()}
              role="dialog" aria-modal="true" aria-labelledby="clear-bill-title"
              className={`mt-16 w-72 rounded-2xl border p-3 shadow-2xl ${isDark ? "border-red-500/30 bg-[#1a1208] text-white" : "border-red-200 bg-white text-gray-900"}`}>
              <div className="flex items-start gap-2">
                <Trash2 size={18} className="mt-0.5 text-red-400" />
                <div className="min-w-0">
                  <h3 id="clear-bill-title" className="text-sm font-extrabold">{t('confirmClearBill', 'Clear full bill?')}</h3>
                  <p className={`mt-1 text-xs ${isDark ? "text-gray-400" : "text-gray-500"}`}>
                    {items.length > 0
                      ? t('clearBillHint', '{{count}} item(s) will be removed.', { count: items.length })
                      : t('clearBillEmptyHint', 'No items — bill will be locked. Press INSERT for new bill.')}
                  </p>
                </div>
              </div>
              <div className="mt-3 flex gap-2">
                <button type="button"
                  onClick={closeClearConfirm}
                  onMouseEnter={() => focusClearConfirmChoice("cancel")}
                  aria-pressed={clearConfirmFocus === "cancel"}
                  className={`flex-1 rounded-xl px-3 py-2 text-xs font-bold outline-none transition-all ${
                    clearConfirmFocus === "cancel"
                      ? `border-2 border-amber-400 shadow-[0_0_0_2px_rgba(251,191,36,0.35)] ${isDark ? "bg-white/15" : "bg-amber-50"}`
                      : `border-2 border-transparent ${isDark ? "bg-white/5 text-gray-300 hover:bg-white/10" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`
                  }`}>
                  {t('common.cancel', 'Cancel')}
                </button>
                <button type="button"
                  onClick={confirmClearBill}
                  onMouseEnter={() => focusClearConfirmChoice("clear")}
                  aria-pressed={clearConfirmFocus === "clear"}
                  className={`flex-1 rounded-xl px-3 py-2 text-xs font-extrabold text-white outline-none transition-all hover:bg-red-400 ${
                    clearConfirmFocus === "clear"
                      ? "border-2 border-amber-400 bg-red-500 shadow-[0_0_0_2px_rgba(251,191,36,0.35)]"
                      : "border-2 border-transparent bg-red-500/90"
                  }`}>
                  {t('common.clear', 'Clear')}
                </button>
              </div>
              <p className={`mt-2 text-center text-[10px] font-semibold ${isDark ? "text-amber-300/80" : "text-amber-700"}`}>
                {t('clearConfirmKb', '← → move · Enter confirm · Esc back')}
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Dialogs — instant mount (no animation delay) */}
      {showCustomerDialog && (
        <CustomerDialog key="checkout-customer" isOpen={showCustomerDialog} initialCustomer={customer}
            submitRef={customerSubmitRef}
            onSubmit={onCustomerSubmit}
            onClose={() => {
              f8BusyRef.current = false;
              setCheckoutStep(CHECKOUT.NONE);
              updateTab({ f8Step: 0 });
              releaseF8Lock();
              focusPriceInput({ force: true });
            }}
            runtimeCities={runtimeCities} runtimeMarkets={runtimeMarkets}
            onAddCity={(c) => { if (c && !runtimeCities.includes(c)) setRuntimeCities((p) => [...p, c]); }}
            onAddMarket={(m) => { if (m && !runtimeMarkets.includes(m)) setRuntimeMarkets((p) => [...p, m]); }}
            isSuperAdmin={isSuperAdmin} storeId={storeId} billerId={billerId} billId={currentBillSessionId || currentBillSerial}
            requireName={customerCheckoutRules.requireName}
            requirePhone={customerCheckoutRules.requirePhone} />
        )}
        {showSummaryPopup && (
          <BillSummary key="checkout-summary" isOpen={showSummaryPopup} items={items} totalQty={totalQty}
            totalDiscount={totalDiscount} subtotal={subtotal}
            billDiscount={billDiscount} billDiscountType={billDiscountType}
            grandTotal={summaryGrandTotal} billSerial={nextPreviewSerial} customer={customer}
            salespersonEnabled={salespersonEnabled && !salespersonMultiple && hasAgents}
            salespersonAgents={salespersonAgents}
            showSalespersonColumn={showSPColumnInTable}
            groupBySalesperson={groupBySalesperson}
            selectedSalespersonId={salespersonId} salespersonCommission={salespersonCommission}
            onSalespersonChange={(id) => updateTab({ salespersonId: id })}
            onProceed={onSummaryProceed}
            onClose={() => { setCheckoutStep(CHECKOUT.CUSTOMER); updateTab({ f8Step: 1 }); releaseF8Lock(); }}
            onBillDiscountChange={(v) => updateTab({ billDiscount: v })}
            onBillDiscountTypeChange={(t) => updateTab({ billDiscountType: t })}
            showBillDiscount={allowBillDiscountInSummary}
            allowBillDiscountPKR={allowBillDiscountSummaryPKR}
            allowBillDiscountPercent={allowBillDiscountSummaryPercent}
            maxSummaryDiscountPKR={maxSummaryDiscountPKRNum}
            maxSummaryDiscountPercent={maxSummaryDiscountPercentNum} />
        )}

      {showPrintModal && printOrder && (
        <InvoicePrint
          key={`print-${printOrder.billSerial || printOrder.serialNo || printOrder.id}`}
          printControlRef={printControlRef}
          onPrintError={onPrintError}
          {...buildInvoicePrintProps({
            order: printOrder,
            store: storeInfo,
            onClose: onPrintClose,
            settings,
            extra: {
              isReprint: false,
              directPrint: true,
              autoClose: true,
              billerName: userData?.displayName || userData?.name || "",
            },
          })}
        />
      )}

      {viewingOrder && (
        <InvoicePrint
          key={`view-inv-${viewInvoiceSeq}-${viewingOrder.billSerial || viewingOrder.serialNo || viewingOrder.id}`}
          {...buildInvoicePrintProps({
            order: viewingOrder,
            store: storeInfo,
            onClose: () => { setViewingOrder(null); releaseF8Lock(); },
            settings,
            extra: {
              isReprint: true,
              billerName: userData?.displayName || userData?.name || viewingOrder?.billerName || "",
            },
          })}
        />
      )}

      <BillerCollectPaymentModal
        open={showCashierPayment && !offlineDirectCheckout}
        onClose={() => {
          f8BusyRef.current = false;
          setCheckoutStep(CHECKOUT.SUMMARY);
          updateTab({ f8Step: 2 });
          releaseF8Lock();
        }}
        onConfirm={onCashierConfirm}
        billSerial={nextPreviewSerial}
        finalTotal={finalTotal}
        paymentType={paymentType}
        onPaymentTypeChange={(t) => updateTab({ paymentType: t })}
        isDark={isDark}
        isRTL={isRTL}
        submitting={submitting}
        t={t}
      />
    </div>
  );
};

export default memo(Dashboard);