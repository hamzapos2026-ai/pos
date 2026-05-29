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
  getDocs, query, where, orderBy, limit, setDoc, doc,
} from "firebase/firestore";
import toast from "react-hot-toast";

import { useTheme } from "../../context/ThemeContext";
import { useAuth } from "../../context/AuthContext";
import { useSettings } from "../../context/SettingsContext";
import { useNetwork } from "../../context/NetworkContext";
import { useSpeech } from "../../hooks/useSpeech";
import { useSound } from "../../hooks/useSound";
import { useKeyboardShortcuts } from "../../hooks/useKeyboardShortcuts";
import useBillerHotkeys from "../../hooks/useBillerHotkeys";
import { useLanguage } from "../../hooks/useLanguage";

import { db } from "../../services/firebase";
import { createAuditLog, logActivity } from "../../services/activityLogger";
import { saveOrder } from "../../services/localBillService";
import { getStoreById, updateStore } from "../../services/storeService";
import {
  syncOfflineOrders, getOfflineOrdersCount,
} from "../../services/localSyncService";
import { recordBillDeletion } from "../../services/deletedBillsService";
import managerService from "../../services/managerService";
import {
  getNextItemSerial, getPlaceholderSerial,
  claimNextSerial, markSerialUsed,
  syncSerialFromFirebase, fmt5,
  getCurrentNextSerial,
} from "../../services/serialService";
import { CUSTOMER_CONFIG, CITY_MARKETS } from "../../config/customerConfig";
import { BROADCAST_CHANNELS } from "../../config/channelConfig";
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
} from "../../components/biller/CustomerDialog";
import BillSummary from "../../components/biller/BillSummary";
import InvoicePrint from "../../components/biller/InvoicePrint";
import useSalesperson, { calcItemCommission } from "../../hooks/useSalesperson";
import { CurrentSPBar, CommissionSummaryPanel } from "../../components/biller/SalespersonSelector";
import BillItemsTable from "../../components/biller/BillItemsTable";

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
  qty: 1, discount: "", discountType: "percent",
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
const fmtItemSerial = (n) => String(Math.max(0, Number(n) || 0)).padStart(2, "0");

const lineUnitPrice = (p) => {
  if (typeof p === "number" && Number.isFinite(p)) return Math.max(0, p);
  const n = Number(String(p ?? "").replace(/,/g, ""));
  return Number.isFinite(n) && n >= 0 ? n : 0;
};

const isSamePriceItem = (item, price, discount, salespersonId) =>
  lineUnitPrice(item.price) === price &&
  Number(item.discount || 0) === Number(discount || 0) &&
  (item.salespersonId || "") === (salespersonId || "");

const mergeItemsByPrice = (items) => {
  const groups = new Map();
  const order = [];

  items.forEach((item) => {
    const key = `${lineUnitPrice(item.price)}|${Number(item.discount || 0)}|${item.discountType || 'percent'}|${item.salespersonId || ''}`;
    if (!groups.has(key)) {
      groups.set(key, { ...item, qty: Number(item.qty || 0) });
      order.push(key);
      return;
    }
    const existing = groups.get(key);
    existing.qty = Number(existing.qty || 0) + Number(item.qty || 0);
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
  const res = {
    id: item.id, serialId: item.serialId, productName: item.productName,
    price: item.price, qty: item.qty, discount: item.discount,
    discountType: item.discountType,
  };
  if (item.salespersonId) {
    res.salespersonId = item.salespersonId;
    res.salespersonName = item.salespersonName;
    res.commissionPercent = item.commissionPercent;
    res.commissionType = item.commissionType;
    res.commissionFixed = item.commissionFixed;
  }
  return res;
};

// ══════════════════════════════════════════════════════════════
// CUSTOMER CACHE
// ══════════════════════════════════════════════════════════════
const _cc = { data: [], loaded: false, storeId: null, loading: false, loadedAt: 0 };
const CC_TTL = 120_000;

const _loadCC = async (storeId, force = false) => {
  const sid = storeId || "default";
  if (!force && _cc.loaded && _cc.storeId === sid && Date.now() - _cc.loadedAt < CC_TTL) return;
  if (_cc.loading || !navigator.onLine) return;
  _cc.loading = true;
  try {
    const snap = await getDocs(
      query(collection(db, "customers"), where("storeId", "==", sid), limit(1000)),
    );
    const seen = new Map();
    snap.docs.forEach((d) => {
      const c = d.data(), key = c.phone || c.name;
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
  if (!navigator.onLine) return;
  try {
    const snap = await getDocs(
      query(collection(db, "orders"), where("billerId", "==", billerId), limit(100)),
    );
    snap.docs.forEach((d) => {
      const c = d.data().customer || {}, key = c.phone || c.name;
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

let _autoCustomerCount = null;

const isAutoGeneratedName = (name) => {
  if (!name) return false;
  return /^customer\s*\d+$/i.test(name.trim());
};

const _saveCustomerBg = async (storeId, billerId, data, isAutoSerial = false) => {
  const phone = normalizePhone(data.phone || "");
  const rawName = (data.name || "").trim();

  if (!phone && (!rawName || isAutoGeneratedName(rawName))) return;

  const sid = storeId || "default";
  let finalName = rawName;

  if (phone && (!rawName || isAutoGeneratedName(rawName))) {
    try {
      if (_autoCustomerCount === null) {
        const snap = await getDocs(
          query(collection(db, "customers"),
            where("storeId", "==", sid),
            where("isAutoNamed", "==", true)
          )
        );
        _autoCustomerCount = snap.size;
      }
      _autoCustomerCount++;
      finalName = `Customer ${_autoCustomerCount}`;
    } catch {
      finalName = `Customer ${Date.now().toString().slice(-4)}`;
    }
  }

  const docId = phone
    ? `${sid}_phone_${phone}`
    : `${sid}_name_${finalName.replace(/[^a-zA-Z0-9]/g, "_").toLowerCase()}`;

  try {
    await setDoc(doc(db, "customers", docId), {
      name: finalName,
      nameLower: finalName.toLowerCase(),
      phone,
      phoneNormalized: phone,
      city: data.city || "",
      market: data.market || "",
      storeId: sid,
      billerId,
      isAutoNamed: !rawName || isAutoGeneratedName(rawName),
      isAutoSerial,
      isWalking: false,
      updatedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
    }, { merge: true });
  } catch { /* ignore */ }
  _pushCC({ ...data, name: finalName });
};

// ══════════════════════════════════════════════════════════════
// DRAFT HELPERS
// ══════════════════════════════════════════════════════════════
const _saveDraft = (sid, uid, tabId, data) =>
  draftService.saveDraftLocal(sid, uid, tabId, data).catch(() => { });
const _clearDraft = (sid, uid, tabId) =>
  draftService.clearDraftLocal(sid, uid, tabId).catch(() => { });

// ══════════════════════════════════════════════════════════════
// TAB FACTORY
// ══════════════════════════════════════════════════════════════
const createTabState = (tabId) => ({
  tabId, label: `Bill ${tabId}`,
  billSerial: "----", items: [],
  customer: { ...DEFAULT_CUSTOMER },
  custNameSearch: "", custPhoneSearch: "",
  billDiscount: 0, billDiscountType: "percent",
  screenLocked: true, activeBill: false,
  billStartTime: null, billEndTime: null,
  f8Step: 0, paymentType: "cash",
  amountReceived: "", selectedRowIndex: -1,
  lastItemId: null, salespersonId: "",
});

// ══════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════
const Dashboard = () => {
  const { isDark } = useTheme();
  const { isOnline } = useNetwork();
  const { userData, isSuperAdmin } = useAuth();
  const { settings } = useSettings();
  const sound = useSound();
  const speech = useSpeech();
  const { language: appLanguage } = useLanguage();

  const COUNTING_KEY = `aone_sound_counting_${userData?.uid || 'default'}`;
  const [countingEnabled, setCountingEnabled] = useState(() => {
    try { return localStorage.getItem(COUNTING_KEY) === 'true'; } catch { return false; }
  });

  const COUNTING_LANG_KEY = `aone_sound_counting_lang_${userData?.uid || 'default'}`;
  const [countingLang, setCountingLang] = useState(() => {
    try { return localStorage.getItem(COUNTING_LANG_KEY) || 'ur'; } catch { return 'ur'; }
  });

  useEffect(() => {
    try { localStorage.setItem(COUNTING_KEY, String(countingEnabled)); } catch { }
  }, [countingEnabled]);

  useEffect(() => {
    try { localStorage.setItem(COUNTING_LANG_KEY, countingLang); } catch { }
  }, [countingLang, COUNTING_LANG_KEY]);

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

  const serialInitRef = useRef(false);
  const draftRestoredRef = useRef(false);
  const submittingRef = useRef(false);
  const deleteLockRef = useRef(false);
  const f8LockRef = useRef(false);
  const minusUsedRef = useRef(false);
  const saveDoneRef = useRef(false);
  const lastF8Ref = useRef(0);
  const wasOnlineRef = useRef(isOnline);
  const intentionalDupRef = useRef(false);
  const printModalOpenRef = useRef(false);
  const addItemLockRef = useRef(false);
  const broadcastChannelRef = useRef(null);

  const storeIdRef = useRef(userData?.storeId || "default");
  const userUidRef = useRef(userData?.uid);
  const isOnlineRef = useRef(isOnline);

  const lastEntryRef = useRef({ price: "", qty: 1, discount: 0, discountType: "percent" });

  // ── Settings ──────────────────────────────────────────────
  const showProductName = isSuperAdmin && settings?.billerUI?.showProductName === true;
  const showDiscountField = settings?.billerUI?.showDiscountField ?? true;
  const allowBillDiscount = settings?.discount?.allowBillDiscount === true;
  const maxBillDiscountPercent = settings?.discount?.maxDiscountPercent || 2;
  const billerFontSize = settings?.fonts?.billerFontSize || 16;
  const totalFontSize = settings?.fonts?.totalFontSize || 28;
  const invoiceFontSize = settings?.fonts?.invoiceFontSize || 14;
  const storeId = userData?.storeId || "default";
  const billerId = userData?.uid;
  const showOfflineInvoice = settings?.billFlow?.showOfflineInvoice !== false;

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
  } = useSalesperson();

  const salespersonDefaultType = settings?.salesperson?.commissionType || "percent";
  const salespersonDefaultRate = Number(settings?.salesperson?.commissionRate || 5);
  const salespersonDefaultFixed = Number(settings?.salesperson?.commissionFixed || 0);

  const userRoles = userData?.roles || (userData?.role ? [userData.role] : []);
  const isDualRole = (userRoles.includes("biller") || userData?.role === "biller") &&
    (userRoles.includes("cashier") || userData?.role === "cashier");

  // ── Multi-tab state ───────────────────────────────────────
  const [tabs, setTabs] = useState(() => [createTabState(1)]);
  const [activeTabId, setActiveTabId] = useState(1);
  const [nextTabId, setNextTabId] = useState(2);
  const [nextPreviewSerial, setNextPreviewSerial] = useState(() =>
    getPlaceholderSerial(storeId, userData),
  );

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
  } = activeTab;

  // Sync tab's salespersonId → hook
  useEffect(() => {
    setCurrentSPId(salespersonId || null);
  }, [salespersonId, setCurrentSPId]);

  // ── UI state ──────────────────────────────────────────────
  const [submitting, setSubmitting] = useState(false);
  const [groupBySalesperson, setGroupBySalesperson] = useState(false);
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
  const [offlineCount, setOfflineCount] = useState(0);
  const [store, setStore] = useState(null);
  const [currentDateTime, setCurrentDateTime] = useState(() => new Date());
  const [cashierModeActive, setCashierModeActive] = useState(false);
  const [directPaid, setDirectPaid] = useState(false);
  const [runtimeCities, setRuntimeCities] = useState([]);
  const [runtimeMarkets, setRuntimeMarkets] = useState([]);
  const [viewingOrder, setViewingOrder] = useState(null);
  const [showRecentOrders, setShowRecentOrders] = useState(() =>
    settings?.showRecentOrders !== undefined ? settings.showRecentOrders : true
  );
  const [permissions, setPermissions] = useState({
    showTimestamps: true, allowCancelBill: true, allowCashierMode: false,
  });
  const [form, setForm] = useState(EMPTY_FORM);
  const [custSuggestions, setCustSuggestions] = useState([]);
  const [showSug, setShowSug] = useState(false);
  const [sugLoading, setSugLoading] = useState(false);
  const [activeField, setActiveField] = useState("");
  const [showCustomerDialog, setShowCustomerDialog] = useState(false);
  const [showSummaryPopup, setShowSummaryPopup] = useState(false);
  const [showCashierPayment, setShowCashierPayment] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [printOrder, setPrintOrder] = useState(null);

  const canToggleCashierMode =
    isSuperAdmin || isDualRole || permissions.allowCashierMode;

  const isAutoApproved = (cashierModeActive && (isSuperAdmin || isDualRole || permissions.allowCashierMode))
    || settings?.autoApproval?.autoApproval === true;

  const showDualButton = Boolean(canToggleCashierMode && ((activeTab?.status || '') !== 'approved'));
  const dualModeEnabled = Boolean(settings?.dualMode === true);

  // ── Sync refs ─────────────────────────────────────────────
  useEffect(() => { storeIdRef.current = storeId; }, [storeId]);
  useEffect(() => { userUidRef.current = userData?.uid; }, [userData?.uid]);
  useEffect(() => { isOnlineRef.current = isOnline; }, [isOnline]);
  useEffect(() => { printModalOpenRef.current = showPrintModal; }, [showPrintModal]);

  // ── Derived totals ────────────────────────────────────────
  const totalQty = useMemo(
    () => items.reduce((s, i) => s + Number(i.qty || 0), 0), [items],
  );

  const totalDiscount = useMemo(
    () => items.reduce((s, i) => {
      const u = lineUnitPrice(i.price), q = Number(i.qty || 0), d = Number(i.discount || 0);
      return s + Math.round((u * q * Math.min(maxBillDiscountPercent, d)) / 100);
    }, 0),
    [items, maxBillDiscountPercent],
  );

  const subtotal = useMemo(
    () => items.reduce((s, i) => {
      const u = lineUnitPrice(i.price), q = Number(i.qty || 0), d = Number(i.discount || 0);
      const da = Math.round((u * Math.min(maxBillDiscountPercent, d)) / 100);
      return s + (u - da) * q;
    }, 0),
    [items, maxBillDiscountPercent],
  );

  const billDiscountValue = useMemo(() => {
    const v = Number(billDiscount || 0);
    return Math.round((subtotal * Math.min(maxBillDiscountPercent, Math.max(0, v))) / 100);
  }, [billDiscount, subtotal, maxBillDiscountPercent]);

  const finalTotal = useMemo(
    () => Math.max(0, subtotal - billDiscountValue),
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
          const type = item.commissionType || salespersonDefaultType;
          const rate = Number(item.commissionPercent ?? salespersonDefaultRate);
          if (type === "fixed") {
            total += Math.max(0, Number(item.commissionFixed || salespersonDefaultFixed));
          } else {
            const unit = lineUnitPrice(item.price);
            const itemDisc = Math.min(maxBillDiscountPercent, Number(item.discount) || 0);
            const discAmt = item.discountType === "percent" ? Math.round((unit * itemDisc) / 100) : itemDisc;
            const lineTotal = (unit - discAmt) * item.qty;
            total += Math.round((lineTotal * Math.max(0, Math.min(100, rate))) / 100);
          }
        }
      });
      return total;
    } else {
      if (!selectedSalesperson || !salespersonId) return 0;
      const type = selectedSalesperson.commissionType || salespersonDefaultType;
      const rate = Number(selectedSalesperson.commissionRate ?? salespersonDefaultRate);
      if (type === "fixed") return Math.max(0, Number(rate || salespersonDefaultFixed));
      return Math.round((finalTotal * Math.max(0, Math.min(100, rate))) / 100);
    }
  }, [items, finalTotal, salespersonEnabled, hasAgents, salespersonMultiple,
    selectedSalesperson, salespersonId, salespersonDefaultType,
    salespersonDefaultRate, salespersonDefaultFixed, maxBillDiscountPercent]);

  const changeAmount = useMemo(() => {
    const r = Number(amountReceived || 0);
    return r > finalTotal ? r - finalTotal : 0;
  }, [amountReceived, finalTotal]);

  const hasAnyDiscount = useMemo(() => items.some((i) => Number(i.discount || 0) > 0), [items]);
  const showDiscColumn = showDiscountField || hasAnyDiscount;

  const storeInfo = useMemo(() => ({
    name: settings?.store?.name || store?.name || "STORE",
    tagline: settings?.store?.tagline || store?.tagline || "",
    address: settings?.store?.address || store?.address || "",
    phone: settings?.store?.phone || store?.phone || "",
    ntn: settings?.store?.ntn || store?.ntn || "",
  }), [settings?.store, store]);

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

  const speakEntry = useCallback((price, qty, discount = 0) => {
    if (!countingEnabled || !soundEnabled) return;
    try {
      const lang = countingLang === 'ur' ? 'ur-PK' : 'en-US';
      const p = Number(price || 0);
      const q = Number(qty || 0);
      const text = lang === 'ur-PK' ? `${p} ضرب ${q}` : `${p} times ${q}`;
      if (sound && typeof sound.speak === 'function') sound.speak(text, lang);
    } catch { }
  }, [countingEnabled, soundEnabled, countingLang, sound]);

  const speakCount = useCallback((delta = 0, explicitNumber) => {
    if (!countingEnabled || !soundEnabled) return;
    try {
      const lang = countingLang === 'ur' ? 'ur-PK' : 'en-US';
      const num = explicitNumber !== undefined && explicitNumber !== null
        ? Number(explicitNumber)
        : Math.max(0, Number(totalQty || 0) + Number(delta || 0));
      if (sound && typeof sound.speakNumber === 'function') {
        sound.speakNumber(num, lang);
      } else if (sound && typeof sound.speak === 'function') {
        sound.speak(String(num), lang);
      }
    } catch { }
  }, [countingEnabled, soundEnabled, countingLang, sound, totalQty]);

  const showToast = useCallback((text, type = "warning") => {
    if (type === "success") toast.success(text, { duration: 1800 });
    else if (type === "error") toast.error(text, { duration: 2200 });
    else toast(text, { duration: 1800, icon: type === "warning" ? "⚠️" : "ℹ️" });
  }, []);

  const setSoundExclusive = useCallback(
    (nextOrUpdater) => {
      const next = typeof nextOrUpdater === "function"
        ? nextOrUpdater(soundEnabled) : Boolean(nextOrUpdater);
      setSoundEnabled(next);
      try { localStorage.setItem(`aone_sound_enabled_${userData?.uid || 'default'}`, String(next)); } catch { }
    },
    [soundEnabled, userData?.uid],
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

  const refreshOfflineCount = useCallback(() => {
    getOfflineOrdersCount().then(setOfflineCount).catch(() => { });
  }, []);

  const refreshSerialPreview = useCallback(async (sid) => {
    const instant = getCurrentNextSerial();
    if (instant) {
      setNextPreviewSerial(instant);
      return instant;
    }
    const placeholder = getPlaceholderSerial(sid || storeIdRef.current, userData);
    if (placeholder && placeholder !== '----') {
      setNextPreviewSerial(placeholder);
      return placeholder;
    }
    return placeholder;
  }, [userData]);

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
        toast.success(`☁️ Bill #${billSerial} synced to cloud!`,
          { id: `sync_${billSerial}`, duration: 3000 });
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
        toast.error(`❌ Sync failed for #${billSerial || 'bill'}. Will retry.`,
          { id: `syncfail_${billSerial}`, duration: 4000 });
      }

      if (type === "ORDER_DELETED" || type === "order_deleted") {
        console.log(`[Dashboard] Order deleted: ${billSerial} (localId: ${localId})`);
        refreshOfflineCount();
        return;
      }
    };
    return () => channel.close();
  }, [refreshOfflineCount]);

  // ── F8 Lock helpers ───────────────────────────────────────
  const releaseF8Lock = useCallback(() => {
    requestAnimationFrame(() => {
      f8LockRef.current = false;
    });
  }, []);

  const acquireF8Lock = useCallback(() => {
    if (f8LockRef.current) return false;
    f8LockRef.current = true;
    return true;
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
    lastEntryRef.current = { price: "", qty: 1, discount: 0, discountType: "percent" };
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
      setActiveTabId(tabId);
      setForm(EMPTY_FORM);
      lastEntryRef.current = { price: "", qty: 1, discount: 0, discountType: "percent" };
      setShowSug(false); setCustSuggestions([]);
      requestAnimationFrame(() => priceInputRef.current?.focus());
    },
    [activeTabId],
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
    draftSaveTimer.current = setTimeout(saveDraft, 200);
    return () => clearTimeout(draftSaveTimer.current);
  }, [saveDraft, userData?.uid]);

  const restoreDrafts = useCallback(async () => {
    if (draftRestoredRef.current) return;
    draftRestoredRef.current = true;
    try {
      const loaded = await draftService.loadAllUserDrafts(storeId, billerId);
      const valid = (loaded || [])
        .map((d) => d.data)
        .filter((data) => data?.v === 7 && data.tabId)
        .map((data) => {
          const merged = { ...createTabState(data.tabId), ...data };
          return { ...merged, items: ensureUniqueLineItemIds(merged.items || []) };
        });
      if (valid.length > 0) {
        const maxId = Math.max(...valid.map((t) => t.tabId));
        setTabs(valid);
        setActiveTabId(valid[0].tabId);
        setNextTabId(maxId + 1);
        showToast(`Recovered ${valid.length} draft bills!`, "success");
      }
    } catch (err) {
      console.error("[Dashboard] Draft restore failed:", err);
    }
    lastEntryRef.current = { price: "", qty: 1, discount: 0, discountType: "percent" };
  }, [storeId, billerId, showToast]);

  // ══════════════════════════════════════════════════════════════
  // INIT
  // ══════════════════════════════════════════════════════════════
  useEffect(() => {
    if (serialInitRef.current || !userData?.uid) return;
    serialInitRef.current = true;
    (async () => {
      const sid = storeIdRef.current;
      await restoreDrafts();
      if (isOnline) {
        try { await syncSerialFromFirebase(sid, userData); } catch { }
        await _loadCC(sid).catch(() => { });
      }
      await refreshSerialPreview(sid);
      if (isOnline) getStoreById(sid).then((s) => { if (s) setStore(s); }).catch(() => { });
    })();
  }, [userData?.uid, restoreDrafts, refreshSerialPreview, isOnline]);

  useEffect(() => () => {
    serialInitRef.current = false;
    draftRestoredRef.current = false;
    _cc.loaded = false; _cc.storeId = null;
    clearTimeout(wifiTimerRef.current);
  }, [userData?.uid]);

  useEffect(() => {
    const handler = (e) => {
      const sid = storeIdRef.current || "default";
      if (e.key !== `pos_serialBroadcast_${sid}` || !e.newValue) return;
      try {
        const data = JSON.parse(e.newValue);
        const lastNum = data?.lastSerial || data?.max || 0;
        if (lastNum <= 0) return;
        setNextPreviewSerial(fmt5(lastNum + 1));
      } catch { }
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  useEffect(() => {
    const prev = wasOnlineRef.current;
    wasOnlineRef.current = isOnline;
    if (prev === isOnline) return;
    if (!isOnline) {
      toast("📴 Offline — bills save locally", { duration: 2500, icon: "📴" });
      return;
    }
    toast.success("🌐 Back online! Syncing...", { duration: 1500 });
    clearTimeout(wifiTimerRef.current);
    wifiTimerRef.current = setTimeout(async () => {
      const sid = storeIdRef.current;
      try {
        const result = await syncOfflineOrders();
        if (result?.synced > 0) {
          toast.success(`✅ ${result.synced} bills synced!`, { duration: 3000 });
          refreshOfflineCount();
        }
      } catch { }
      try { await syncSerialFromFirebase(sid, userData); } catch { }
      if (!activeTab?.activeBill) await refreshSerialPreview(sid);
      try { const s = await getStoreById(sid); if (s) setStore(s); } catch { }
      _loadCC(sid, true).catch(() => { });
      _enrichCC(sid, userUidRef.current).catch(() => { });
    }, 600);
    return () => clearTimeout(wifiTimerRef.current);
  }, [isOnline, activeTab?.activeBill, refreshSerialPreview, refreshOfflineCount]);

  useEffect(() => {
    if (!userData?.uid) return;
    if (isOnline) {
      getStoreById(storeId).then((s) => { if (s) setStore(s); }).catch(() => { });
      _enrichCC(storeId, userData.uid).catch(() => { });
    }
    refreshOfflineCount();
  }, [storeId, userData?.uid, isOnline, refreshOfflineCount]);

  useEffect(() => { const t = setInterval(refreshOfflineCount, 30_000); return () => clearInterval(t); }, [refreshOfflineCount]);
  useEffect(() => { const t = setInterval(() => setCurrentDateTime(new Date()), 1_000); return () => clearInterval(t); }, []);
  useEffect(() => { if (!screenLocked) requestAnimationFrame(() => priceInputRef.current?.focus()); }, [screenLocked]);
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

  // ══════════════════════════════════════════════════════════════
  // RESET BILL
  // ══════════════════════════════════════════════════════════════
  const resetBill = useCallback(() => {
    if (currentBillSerial) resetPersistedCustomer(currentBillSerial);
    submittingRef.current = false;
    minusUsedRef.current = false; deleteLockRef.current = false;
    saveDoneRef.current = false; lastF8Ref.current = 0;
    intentionalDupRef.current = false;
    setCurrentSPId(null);
    const defName = settings?.customer?.defaultCustomerName || CUSTOMER_CONFIG.WALK_IN_NAME;
    updateTab({
      items: [], selectedRowIndex: -1, lastItemId: null,
      billSerial: "----",
      customer: { name: defName, phone: "", city: CUSTOMER_CONFIG.WALK_IN_CITY, market: "" },
      custNameSearch: "", custPhoneSearch: "",
      billDiscount: 0, billDiscountType: "percent",
      f8Step: 0, paymentType: "cash", amountReceived: "",
      activeBill: false, screenLocked: true,
      billStartTime: null, billEndTime: null,
      salespersonId: "",
    });
    setCustSuggestions([]); setShowSug(false);
    setActiveField(""); setForm(EMPTY_FORM);
    lastEntryRef.current = { price: "", qty: 1, discount: 0, discountType: "percent" };
    setShowCustomerDialog(false); setShowSummaryPopup(false); setShowCashierPayment(false);
    _clearDraft(storeId, billerId, activeTabId);
    refreshSerialPreview(storeIdRef.current);
  }, [currentBillSerial, settings?.customer?.defaultCustomerName,
    updateTab, storeId, billerId, activeTabId, setCurrentSPId, refreshSerialPreview]);

  const handleSelectSalesperson = useCallback((id) => {
    setCurrentSPId(id);
    updateTab({ salespersonId: id });
  }, [setCurrentSPId, updateTab]);

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
    speakCount(0, 0);
  }, [resetBill, play, speakCount]);

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
    requestAnimationFrame(() => priceInputRef.current?.focus());
  }, [updateTab]);

  const openCustDialog = useCallback(() => {
    if (screenLocked) { showToast("Press INSERT first.", "error"); return; }
    setShowCustomerDialog(true); updateTab({ f8Step: 1 }); play("keyPress");
  }, [screenLocked, play, showToast, updateTab]);

  const openCustDialogAlways = useCallback(() => {
    setShowCustomerDialog(true);
    if (!screenLocked && items.length > 0) updateTab({ f8Step: 1 });
    play("keyPress");
  }, [screenLocked, items.length, play, updateTab]);

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

      if (salespersonEnabled && salespersonMultiple && salespersonRequireSelection && !currentAgent && hasAgents) {
        showToast("Select a Salesperson first.", "error"); play("error"); return;
      }

      if (priceEmpty) {
        if (!items.length) { showToast("Enter a price first.", "warning"); play("error"); return; }
        const last = items[items.length - 1];
        const dupQty = intentionalDupRef.current ? qtyVal : last.qty;
        const discRaw = form.discount !== "" ? Number(form.discount) : Number(last.discount || 0);
        const dupDisc = Math.min(maxBillDiscountPercent, Math.max(0, discRaw || 0));
        if (discRaw > maxBillDiscountPercent)
          toast.error(`Max discount: ${maxBillDiscountPercent}%`, { duration: 1800 });

        const newItem = enrichItem({
          id: generateLineItemId(), serialId: getNextItemSerial(),
          productName: last.productName, price: lineUnitPrice(last.price),
          qty: dupQty, discount: dupDisc, discountType: "percent",
        });
        updateTab((tab) => ({
          ...tab, items: [...tab.items, newItem],
          lastItemId: newItem.id, activeBill: true,
        }));
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
        play("add"); speakEntry(last.price, dupQty, dupDisc);
        showToast(`✅ Duplicated: Rs.${last.price?.toLocaleString()} ×${dupQty}`, "success");
        setForm((p) => ({ ...p, price: "", qty: 1, discount: "", discountType: "percent" }));
        requestAnimationFrame(() => priceInputRef.current?.focus());
        return;
      }

      if (!priceValid) { showToast("Valid price required.", "error"); play("error"); priceInputRef.current?.focus(); return; }
      if (qtyVal <= 0) { showToast("Enter quantity first.", "warning"); play("error"); qtyInputRef.current?.focus(); return; }
      if (showProductName && !(form.productName || "").trim()) { showToast("Product name required.", "error"); play("error"); return; }

      const discRaw = form.discount !== "" ? Number(form.discount) : Number(lastEntryRef.current.discount) || 0;
      const discAmt = Math.min(maxBillDiscountPercent, Math.max(0, discRaw));
      if (discRaw > maxBillDiscountPercent)
        toast.error(`Max discount: ${maxBillDiscountPercent}%`, { duration: 1800 });

      const serialId = (form.serialId || "").trim() || getNextItemSerial();
      const prodName = showProductName
        ? (form.productName || "").trim()
        : `Item ${fmtItemSerial(items.length + 1)}`;

      const mergeTarget = items.find((item) => {
        if (salespersonEnabled && salespersonMultiple) {
          return isSamePriceItem(item, price, discAmt, currentAgent?.id);
        }
        return isSamePriceItem(item, price, discAmt, item.salespersonId);
      });

      if (mergeTarget) {
        updateTab((tab) => ({
          ...tab,
          items: tab.items.map((item) =>
            item.id === mergeTarget.id
              ? { ...item, qty: Number(item.qty || 0) + qtyVal, discountType: "percent" }
              : item,
          ),
          lastItemId: mergeTarget.id, activeBill: true,
        }));
        intentionalDupRef.current = false;
        lastEntryRef.current = { price: String(price), qty: qtyVal, discount: discAmt, discountType: "percent" };
        setForm({ productName: "", serialId: "", price: "", qty: 1, discount: "", discountType: "percent" });
        updateTab({ selectedRowIndex: -1 });
        play("add"); speakEntry(price, qtyVal, discAmt);
        showToast(`✅ Merged: Rs.${price.toLocaleString()} qty +${qtyVal}`, "success");
        requestAnimationFrame(() => priceInputRef.current?.focus());
        return;
      }

      const newItem = enrichItem({
        id: generateLineItemId(), serialId, productName: prodName,
        price, qty: qtyVal, discount: discAmt, discountType: "percent",
      });
      updateTab((tab) => ({
        ...tab,
        items: mergeItemsByPrice([...tab.items, newItem]),
        lastItemId: newItem.id, activeBill: true,
        billStartTime: tab.billStartTime || new Date(),
      }));
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
      lastEntryRef.current = { price: String(price), qty: qtyVal, discount: discAmt, discountType: "percent" };
      setForm({ productName: "", serialId: "", price: "", qty: 1, discount: "", discountType: "percent" });
      updateTab({ selectedRowIndex: -1 });
      play("add"); speakEntry(price, qtyVal, discAmt);
      requestAnimationFrame(() => priceInputRef.current?.focus());

    } finally {
      setTimeout(() => { addItemLockRef.current = false; }, 150);
    }
  }, [
    form, screenLocked, items, showProductName, play, speakEntry,
    showToast, updateTab, maxBillDiscountPercent, salespersonEnabled,
    salespersonMultiple, salespersonRequireSelection, hasAgents,
    enrichItem, currentAgent
  ]);

  const deleteRow = useCallback((id) => {
    if (screenLocked) { play("error"); return; }
    const item = items.find((i) => i.id === id);
    if (item) logClearedData([item], "row_deleted");
    updateTab((tab) => ({ ...tab, items: tab.items.filter((i) => i.id !== id), selectedRowIndex: -1 }));
    play("delete");
    if (item) speakCount(-Number(item.qty || 0));
    requestAnimationFrame(() => priceInputRef.current?.focus());
  }, [screenLocked, items, play, logClearedData, updateTab, speakCount]);

  const changeQty = useCallback((id, v) => {
    if (screenLocked) return;
    const n = parseInt(String(v).replace(/\D/g, ""), 10);
    updateTab((tab) => ({
      ...tab,
      items: tab.items.map((i) => i.id === id ? { ...i, qty: Math.max(1, n || 1) } : i),
    }));
  }, [screenLocked, updateTab]);

  const changeDiscount = useCallback((id, v) => {
    if (screenLocked) return;
    const cleaned = String(v).replace(/[^0-9.]/g, "");
    const raw = cleaned === "" ? 0 : Number(cleaned) || 0;
    if (raw > maxBillDiscountPercent)
      toast.error(`Max discount: ${maxBillDiscountPercent}%`, { duration: 1800 });
    const safe = Math.min(maxBillDiscountPercent, Math.max(0, raw));
    updateTab((tab) => ({
      ...tab,
      items: tab.items.map((i) =>
        i.id === id ? { ...i, discount: safe, discountType: "percent", price: lineUnitPrice(i.price) } : i,
      ),
    }));
  }, [screenLocked, updateTab, maxBillDiscountPercent]);

  // ══════════════════════════════════════════════════════════════
  // BILL ACTIONS
  // ══════════════════════════════════════════════════════════════
  const clearBill = useCallback(() => {
    if (screenLocked) { play("error"); return; }
    if (!items.length) {
      showToast("Bill is already empty.", "warning");
      return;
    }

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

    updateTab({
      items: [], selectedRowIndex: -1, lastItemId: null,
      activeBill: true, screenLocked: false, f8Step: 0,
      billDiscount: 0, billDiscountType: "percent",
    });
    setForm(EMPTY_FORM);
    lastEntryRef.current = { price: "", qty: 1, discount: 0, discountType: "percent" };
    showToast("Bill cleared.", "success"); play("delete");
    speakCount(-Number(totalQty || 0));
    requestAnimationFrame(() => { priceInputRef.current?.focus(); priceInputRef.current?.select?.(); });
  }, [
    screenLocked, items, currentBillSerial, subtotal, totalDiscount, totalQty,
    customer, billStartTime, billEndTime, userData, billerId, storeId, isOnline,
    play, logClearedData, showToast, updateTab, speakCount,
  ]);

  const cancelBill = useCallback(() => {
    if (!items.length) { showToast("No bill to cancel.", "warning"); return; }
    if (!_isSuperAdminRole(userData) && !isSuperAdmin) {
      showToast("🚫 Only Super Admin can cancel bills", "error");
      return;
    }
    if (!window.confirm("Cancel this bill?")) return;
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
      const online = navigator.onLine && isOnlineRef.current;
      const localId = snapshot.localId || generateLocalId();

      const claimedSerial = await claimNextSerial(
        snapshot.storeId,
        online,
        userData,
      );

      const resolvedName = resolveCustomerName(snapshot.customer);

      const preparedItems = snapshot.items.map((item) => {
        const safeDiscount = Math.min(maxBillDiscountPercent, Number(item.discount) || 0);
        const unit = lineUnitPrice(item.price);
        const da = Math.round((unit * safeDiscount) / 100);
        return {
          serialId: item.serialId || "", productName: item.productName || "",
          price: unit, qty: Number(item.qty), discount: safeDiscount,
          discountType: "percent", total: (unit - da) * Number(item.qty),
          salespersonId: item.salespersonId || null,
          salespersonName: item.salespersonName || null,
          commissionPercent: item.commissionPercent !== undefined ? item.commissionPercent : null,
          commissionType: item.commissionType || null,
          commissionFixed: item.commissionFixed || null,
        };
      });

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
        subtotal: snapshot.subtotal,
        totalDiscount: snapshot.totalDiscount,
        billDiscount: snapshot.billDiscountValue,
        totalAmount: snapshot.finalTotal,
        grandTotal: snapshot.finalTotal,
        paymentType: snapshot.overridePayment?.type || snapshot.paymentType || "cash",
        paymentMethod: snapshot.overridePayment?.type || snapshot.paymentType || "cash",
        amountReceived: snapshot.overridePayment?.received || null,
        changeGiven: snapshot.overridePayment?.change || null,
        paymentStatus: (dualModeEnabled ? (snapshot.isAutoApproved ? "paid" : "pending_approval") : "pending_payment"),
        salesperson: snapshot.salesperson || null,
        salespersonCommission: snapshot.salesperson?.commissionAmount || 0,
        salespersonBreakdown: snapshot.salespersonBreakdown || [],
        salespersonId: snapshot.salespersonId || null,
        salespersonName: snapshot.salespersonName || null,
        status: snapshot.isAutoApproved ? "approved" : "pending",
        cashierHandover: !snapshot.isAutoApproved,
        dualMode: dualModeEnabled ? !snapshot.isAutoApproved : false,
        billerSubmittedAt: serverTimestamp(),
        billerName: snapshot.billerName || userData?.name || "Unknown",
        billerId: snapshot.billerId || userData?.uid || null,
        storeId: snapshot.storeId,
        billStartTime: _safeISO(snapshot.billStartTime) || _nowISO(),
        billEndTime: _safeISO(snapshot.billEndTime) || _nowISO(),
        createdAt: serverTimestamp(),
        isDeleted: false,
        source: "biller",
        syncStatus: online ? "syncing" : "pending",
      };

      const result = await saveOrder(orderData, online);
      if (!result.success && result.duplicate) {
        toast.error("Duplicate bill.", { duration: 2500 }); return;
      }

      try {
        if (result.success && !snapshot.isAutoApproved) {
          await managerService.submitBillForManagerApproval(localId, undefined, "Submitted via cashier (dual mode)");
        }
      } catch (err) {
        console.warn('[BillerDashboard] submitBillForManagerApproval failed:', err?.message || err);
      }

      const realSerial = result.serialNo || claimedSerial;
      const sid = snapshot.storeId || "default";

      await markSerialUsed(sid, realSerial);

      try {
        const serialNum = _extractSerialNum(realSerial);
        if (serialNum > 0) {
          localStorage.setItem(
            `pos_serialBroadcast_${sid}`,
            JSON.stringify({ lastSerial: serialNum, max: serialNum, date: _todayDateStr(), savedAt: Date.now() }),
          );
        }
      } catch { }

      broadcastChannelRef.current?.postMessage({
        type: "new_order", serialNo: realSerial,
        total: snapshot.finalTotal, tabId: activeTabId,
      });

      setPrintOrder((prev) =>
        prev ? { ...prev, serialNo: realSerial, billSerial: realSerial } : prev,
      );

      if (!printModalOpenRef.current) await refreshSerialPreview(sid);

      queueMicrotask(() => {
        try {
          _saveCustomerBg(snapshot.storeId, snapshot.billerId, {
            name: resolvedName, phone: (snapshot.customer.phone || "").trim(),
            city: snapshot.customer.city || "", market: snapshot.customer.market || "",
          }, false);
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
        toast(`📴 Bill #${realSerial} saved OFFLINE.`, { duration: 2500, icon: "📴" });
        refreshOfflineCount();
      } else {
        play("billSaved");
      }

      toast.success(
        snapshot.isAutoApproved
          ? `✅ Bill #${realSerial} saved!`
          : `📤 Bill #${realSerial} sent to cashier!`,
        { duration: 2200 },
      );

      try {
        const lang = countingLang === 'ur' ? 'ur-PK' : 'en-US';
        const serialNum = _extractSerialNum(realSerial);
        if (serialNum > 0 && sound && typeof sound.speakNumber === 'function') {
          sound.speakNumber(Number(serialNum), lang);
        } else if (sound && typeof sound.speak === 'function') {
          sound.speak(realSerial, lang);
        }
      } catch { }
    } catch (err) {
      console.error("[Dashboard] saveInBackground:", err);
      toast.error(getFriendlyError(err), { duration: 3000 });
      play("error");
    }
  }, [play, refreshSerialPreview, refreshOfflineCount,
    maxBillDiscountPercent, userData, activeTabId, dualModeEnabled,
    countingLang, sound]);

  // ══════════════════════════════════════════════════════════════
  // FINALIZE & PRINT
  // ══════════════════════════════════════════════════════════════
  const finalizeAndPrint = useCallback(async (overridePayment = null) => {
    if (saveDoneRef.current || submittingRef.current) return;
    if (!items.length) { showToast("Add at least one item.", "error"); return; }

    const validation = validateAssignment(items);
    if (!validation.valid) {
      toast.error(validation.message || "Invalid salesperson assignment.");
      releaseF8Lock();
      return;
    }

    if (salespersonEnabled && !salespersonMultiple && salespersonRequireSelection && hasAgents && !salespersonId) {
      showToast("Select a salesperson.", "error"); setShowSummaryPopup(true); return;
    }

    saveDoneRef.current = true;
    submittingRef.current = true;
    const endTime = new Date();
    const displaySerial = nextPreviewSerial;
    const localId = generateLocalId();

    const commissionSummary = buildCommissionSummary(items, finalTotal, subtotal);
    let finalSPId = null;
    let finalSPName = null;
    if (!salespersonMultiple) {
      finalSPId = salespersonId || null;
      finalSPName = selectedSalesperson?.name || null;
    } else {
      const assignedSPIds = [...new Set(items.map(i => i.salespersonId).filter(Boolean))];
      if (assignedSPIds.length === 1) {
        finalSPId = assignedSPIds[0];
        const agent = salespersonAgents.find(a => a.id === finalSPId);
        finalSPName = agent ? agent.name : null;
      }
    }

    const snapshot = {
      localId,
      items: items.map(_cleanItem),
      customer: { ...customer },
      totalQty,
      subtotal,
      totalDiscount,
      billDiscountValue,
      finalTotal,
      billStartTime: billStartTime || new Date(),
      billEndTime: endTime,
      billerName: userData?.name,
      storeId,
      billerId,
      isAutoApproved,
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

    const orderForPrint = {
      serialNo: displaySerial,
      billSerial: displaySerial,
      customer: { ...customer },
      items: items.map(_cleanItem),
      totalQty,
      totalAmount: finalTotal,
      subtotal,
      totalDiscount: totalDiscount + billDiscountValue,
      billDiscount: billDiscountValue,
      salesperson: snapshot.salesperson,
      status: isAutoApproved ? "approved" : "pending",
      createdAt: billStartTime || new Date(),
      billStartTime: billStartTime || new Date(),
      billEndTime: endTime,
    };

    setShowSummaryPopup(false);
    setShowCustomerDialog(false);
    setShowCashierPayment(false);
    setSubmitting(false);

    setPrintOrder(orderForPrint);
    setShowPrintModal(true);

    resetBill();
    submittingRef.current = false;
    releaseF8Lock();

    try {
      await saveInBackground(snapshot);
    } catch (err) {
      console.error("[Dashboard] finalizeAndPrint save error:", err);
    }
  }, [
    items, customer, totalQty, subtotal, totalDiscount, billDiscountValue, finalTotal,
    billStartTime, userData, storeId, billerId, isAutoApproved,
    nextPreviewSerial, showToast, resetBill, saveInBackground, releaseF8Lock,
    salespersonEnabled, salespersonMultiple, salespersonRequireSelection, salespersonId,
    selectedSalesperson, salespersonDefaultType, salespersonDefaultRate, salespersonCommission,
    validateAssignment, buildCommissionSummary, salespersonAgents, hasAgents, paymentType,
  ]);

  const onPrintClose = useCallback(() => {
    setShowPrintModal(false);
    setPrintOrder(null);
    releaseF8Lock();
  }, [releaseF8Lock]);

  // ══════════════════════════════════════════════════════════════
  // CUSTOMER / SUMMARY / CASHIER HANDLERS
  // ══════════════════════════════════════════════════════════════
  const onCustomerSubmit = useCallback((cData) => {
    updateTab({
      customer: cData, custNameSearch: cData.name || "", custPhoneSearch: cData.phone || "",
    });
    setShowCustomerDialog(false);
    if (items.length > 0 && !screenLocked) { setShowSummaryPopup(true); updateTab({ f8Step: 2 }); }

    releaseF8Lock();
    play("keyPress");

    queueMicrotask(() => {
      try {
        const phone = normalizePhone(cData.phone || "");
        const name = (cData.name || "").trim();
        if ((name && name.toLowerCase() !== "walking customer") || phone)
          _saveCustomerBg(storeId, billerId, cData, false);
      } catch (error) {
        console.error('[Dashboard] queueMicrotask error:', error);
      }
    });
  }, [play, items.length, screenLocked, storeId, billerId, updateTab, releaseF8Lock]);

  const onSummaryProceed = useCallback(() => {
    setShowSummaryPopup(false);
    updateTab({ billEndTime: new Date() });
    if (!isOnline) {
      setShowCashierPayment(true); updateTab({ f8Step: 4 }); releaseF8Lock();
    } else {
      finalizeAndPrint();
    }
    play("keyPress");
  }, [isOnline, play, finalizeAndPrint, updateTab, releaseF8Lock]);

  const onCashierConfirm = useCallback(() => {
    if (saveDoneRef.current) return;
    const received = Number(amountReceived || 0);
    if (paymentType === "cash" && received < finalTotal) {
      showToast("Amount less than total.", "error"); return;
    }
    setShowCashierPayment(false);
    finalizeAndPrint({
      type: paymentType,
      received: paymentType === "cash" ? received : finalTotal,
      change: paymentType === "cash" ? Math.max(0, received - finalTotal) : 0,
    });
  }, [amountReceived, finalTotal, paymentType, showToast, finalizeAndPrint]);

  // ══════════════════════════════════════════════════════════════
  // KEYBOARD HANDLERS
  // ══════════════════════════════════════════════════════════════
  const handleF8 = useCallback(() => {
    if (saveDoneRef.current) return;

    const now = Date.now();
    if (now - lastF8Ref.current < 200) return;
    lastF8Ref.current = now;

    if (!acquireF8Lock()) {
      showToast("Processing... please wait.", "warning");
      return;
    }

    if (showPrintModal) {
      onPrintClose();
      return;
    }

    if (!items.length) {
      showToast("Add items first.", "error");
      releaseF8Lock();
      return;
    }

    switch (f8Step) {
      case 0:
        openCustDialog();
        break;
      case 1:
        if (showCustomerDialog) {
          setShowCustomerDialog(false);
          if (items.length > 0) {
            setShowSummaryPopup(true);
            updateTab({ f8Step: 2 });
          }
          releaseF8Lock();
        } else {
          openCustDialog();
        }
        break;
      case 2:
        if (showSummaryPopup) {
          onSummaryProceed();
        } else {
          releaseF8Lock();
        }
        break;
      case 4:
        if (showCashierPayment) {
          onCashierConfirm();
        } else {
          releaseF8Lock();
        }
        break;
      default:
        openCustDialog();
    }
  }, [
    f8Step, items.length, showPrintModal, showSummaryPopup,
    showCustomerDialog, showCashierPayment,
    openCustDialog, onSummaryProceed, onPrintClose, onCashierConfirm,
    showToast, acquireF8Lock, releaseF8Lock, updateTab,
  ]);

  const handleEscape = useCallback(() => {
    if (showPrintModal) { onPrintClose(); return; }

    if (showCashierPayment) {
      setShowCashierPayment(false);
      releaseF8Lock();
      setShowSummaryPopup(true); updateTab({ f8Step: 2 }); return;
    }

    if (f8Step === 2 && showSummaryPopup) {
      setShowSummaryPopup(false); setShowCustomerDialog(true);
      updateTab({ f8Step: 1 }); releaseF8Lock(); return;
    }

    if (showCustomerDialog) {
      setShowCustomerDialog(false); updateTab({ f8Step: 0 }); releaseF8Lock();
      requestAnimationFrame(() => priceInputRef.current?.focus()); return;
    }

    if (showSug) { setShowSug(false); setCustSuggestions([]); setActiveField(""); requestAnimationFrame(() => priceInputRef.current?.focus()); return; }

    updateTab({ selectedRowIndex: -1 }); setShowSug(false); priceInputRef.current?.focus();
  }, [f8Step, showPrintModal, showSummaryPopup, showCustomerDialog, showCashierPayment, showSug, onPrintClose, updateTab, releaseF8Lock]);

  const handleInsert = useCallback(() => {
    if (screenLocked) {
      if (submittingRef.current) { showToast("Bill is saving...", "warning"); return; }
      saveDoneRef.current = false; submittingRef.current = false;
      f8LockRef.current = false; minusUsedRef.current = false;
      deleteLockRef.current = false; intentionalDupRef.current = false;
      updateTab({
        activeBill: true, screenLocked: false, billStartTime: new Date(),
        billEndTime: null, f8Step: 0, billSerial: "----",
        items: [], selectedRowIndex: -1, lastItemId: null,
      });
      setForm(EMPTY_FORM);
      lastEntryRef.current = { price: "", qty: 1, discount: 0, discountType: "percent" };
      setShowCustomerDialog(false); setShowSummaryPopup(false);
      setShowPrintModal(false); setPrintOrder(null); setShowCashierPayment(false);
      play("unlock"); showToast("✅ New bill started.", "success");
      requestAnimationFrame(() => { priceInputRef.current?.focus(); priceInputRef.current?.select(); });
      return;
    }
    requestAnimationFrame(() => { priceInputRef.current?.focus(); priceInputRef.current?.select(); });
  }, [screenLocked, showToast, play, updateTab]);

  const handleMinus = useCallback(() => {
    if (screenLocked || !items.length) { play("error"); return; }
    if (minusUsedRef.current) {
      showToast("Minus key already used. Start a new bill.", "warning");
      requestAnimationFrame(() => priceInputRef.current?.focus()); return;
    }
    if (deleteLockRef.current) return;
    deleteLockRef.current = true;
    setTimeout(() => { deleteLockRef.current = false; }, 200);
    const last = items[items.length - 1];
    if (!last) { play("error"); return; }
    logClearedData([last], "minus_key_deleted");
    updateTab((tab) => ({ ...tab, items: tab.items.slice(0, -1), selectedRowIndex: -1 }));
    minusUsedRef.current = true; play("delete");
    showToast(`Deleted: Rs.${last.price?.toLocaleString()} ×${last.qty}`, "warning");
    requestAnimationFrame(() => priceInputRef.current?.focus());
  }, [screenLocked, items, play, logClearedData, showToast, updateTab]);

  const handleDelete = useCallback(() => {
    if (screenLocked) { play("error"); return; }
    if (!items.length) { showToast("Bill is already empty.", "warning"); return; }
    setShowClearConfirm(true);
  }, [screenLocked, items.length, play, showToast]);

  const handleCloseCurrentTab = useCallback(() => closeTab(activeTabId), [closeTab, activeTabId]);

  const handleSwitchTabByIndex = useCallback((index) => {
    const tab = tabs[index]; if (tab) switchTab(tab.tabId);
  }, [tabs, switchTab]);

  const handleToggleDiscountType = useCallback(() => {
    setForm((f) => ({ ...f, discountType: "percent" }));
    showToast("Discount is always percentage.", "warning");
  }, [showToast]);

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
    DELETE_ITEM: () => {
      if (!items.length) return;
      if (activeField === "price") { setForm((p) => ({ ...p, price: "" })); return; }
      if (activeField === "qty") { setForm((p) => ({ ...p, qty: 1 })); return; }
      updateTab((tab) => ({
        ...tab,
        items: tab.items.filter((_, i) =>
          i !== (tab.selectedRowIndex >= 0 ? tab.selectedRowIndex : tab.items.length - 1)
        ),
        selectedRowIndex: -1,
      }));
    },
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
        selectedRowIndex: tab.selectedRowIndex >= tab.items.length - 1 ? 0 : tab.selectedRowIndex + 1,
      }));
    },
    HOME: () => { if (!screenLocked) phoneInputRef.current?.focus(); },
    END: addNewTab,
    ESCAPE: handleEscape,
    SEARCH: () => { if (!screenLocked) phoneInputRef.current?.focus(); },
  }), [
    handleAddItem, handleInsert, handleF8, handleEscape, handleDelete,
    handleSaveDraftShortcut, screenLocked, items.length, addNewTab, updateTab, activeField,
  ]);

  useKeyboardShortcuts({
    F2: handleAddItem,
    F3: () => {
      if (screenLocked) return;
      const t = showProductName ? productNameRef.current : priceInputRef.current;
      t?.focus(); t?.select?.();
    },
    F4: () => { if (!screenLocked) { priceInputRef.current?.focus(); priceInputRef.current?.select?.(); } },
    F5: () => { if (!screenLocked) { qtyInputRef.current?.focus(); qtyInputRef.current?.select?.(); } },
    F6: () => { if (!screenLocked) { discountInputRef.current?.focus(); discountInputRef.current?.select?.(); } },
    F7: openCustDialogAlways,
    F8: handleF8,
    F9: handleSaveDraftShortcut,
    Home: () => { if (!screenLocked) phoneInputRef.current?.focus(); },
    End: addNewTab,
    Delete: handleDelete,
    Minus: handleMinus,
    numpadSubtract: handleMinus,
    numpadAdd: () => { if (!screenLocked) { qtyInputRef.current?.focus(); qtyInputRef.current?.select?.(); } },
    numpadDivide: () => { if (!screenLocked) { discountInputRef.current?.focus(); discountInputRef.current?.select?.(); } },
    numpadMultiply: handleToggleDiscountType,
    NumpadEnter: handleAddItem,
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
        selectedRowIndex: tab.selectedRowIndex >= tab.items.length - 1 ? 0 : tab.selectedRowIndex + 1,
      }));
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
      updateTab({ customer: { ...DEFAULT_CUSTOMER }, custNameSearch: "", custPhoneSearch: "" });
      setCustSuggestions([]); setShowSug(false); showToast("Customer cleared.", "success");
    },
  }, true);
  useBillerHotkeys(handlers, { enabled: true });

  useEffect(() => {
    const fallback = (e) => {
      if (e.key === "Insert") { e.preventDefault(); handleInsert(); }
      if (e.key === "F8") { e.preventDefault(); handleF8(); }
    };
    window.addEventListener("keydown", fallback, true);
    return () => window.removeEventListener("keydown", fallback, true);
  }, [handleInsert, handleF8]);

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

  return (
    <div className="flex flex-col h-screen overflow-hidden" style={{ fontSize: `${billerFontSize}px` }}>
      <BillerHeader
        currentBillSerial={currentBillSerial || nextPreviewSerial}
        nextPreviewSerial={nextPreviewSerial}
        screenLocked={screenLocked}
        currentDateTime={currentDateTime}
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
        onViewInvoice={(order) => setViewingOrder(order)}
        canToggleCashierMode={canToggleCashierMode}
        showDualButton={showDualButton}
        dualModeEnabled={dualModeEnabled}
        cashierModeActive={cashierModeActive}
        onToggleCashierMode={() => {
          if (canToggleCashierMode) setCashierModeActive((v) => !v);
          else toast('Permission required to toggle Dual Mode', { icon: '🔒' });
        }}
        isSuperAdmin={isSuperAdmin}
        permissions={userData?.permissions}
        onTogglePermission={togglePermission}
        directPaid={directPaid}
        onToggleDirectPaid={() => setDirectPaid((v) => !v)}
        storeId={storeId}
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
        onFocusPriceInput={() => requestAnimationFrame(() => priceInputRef.current?.focus())}
        countingEnabled={countingEnabled}
        setCountingEnabled={setCountingEnabled}
        countingLang={countingLang}
        setCountingLang={setCountingLang}
      />

      {/* Lock overlay */}
      {screenLocked && items.length === 0 && tabs.length === 1 && (
        <div className={`fixed inset-0 z-50 flex items-center justify-center ${isDark ? "bg-black/80" : "bg-white/80"}`}>
          <div className={`rounded-3xl px-8 py-10 text-center max-w-sm w-full mx-4 ${isDark ? "bg-[#15120d] border border-yellow-500/20" : "bg-white border border-yellow-200"}`}>
            <Lock size={44} className="mx-auto mb-3 text-yellow-500" />
            <div className={`mb-3 text-sm font-mono tracking-widest ${isDark ? "text-gray-400" : "text-gray-500"}`}>
              {currentDateTime
                ? currentDateTime.toLocaleDateString("en-PK", { weekday: "short", day: "2-digit", month: "short", year: "numeric" })
                : ""}
              <br />
              <span className={`text-lg font-bold ${isDark ? "text-yellow-400" : "text-yellow-600"}`}>
                {currentDateTime ? currentDateTime.toLocaleTimeString("en-PK", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : ""}
              </span>
            </div>
            <h2 className={`text-2xl font-bold ${isDark ? "text-white" : "text-gray-900"}`}>Bill Locked</h2>
            <p className={`mt-2 ${isDark ? "text-gray-400" : "text-gray-600"}`}>
              Press <kbd className="rounded-lg bg-yellow-500/20 px-3 py-1 font-mono font-bold text-yellow-500">INSERT</kbd> to start
            </p>
            {nextPreviewSerial && nextPreviewSerial !== "----" && (
              <p className={`mt-3 font-mono text-sm ${isDark ? "text-yellow-500/60" : "text-yellow-600/60"}`}>
                Next: <strong className="text-yellow-500">{nextPreviewSerial}</strong>
              </p>
            )}
            {!isOnline && (
              <div className="mt-4 flex items-center justify-center gap-2 text-orange-400 text-sm">
                <WifiOff size={14} />
                <span>Offline — bills save locally</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Offline banner */}
      {!isOnline && (
        <div className="flex items-center justify-between rounded-xl border border-orange-500/30 bg-orange-500/10 px-3 py-1 mx-3 mt-1 shrink-0">
          <div className="flex items-center gap-2">
            <WifiOff size={13} className="text-orange-400 shrink-0" />
            <p className="font-semibold text-orange-400 text-xs">📴 Offline — Bills saved locally</p>
          </div>
          {offlineCount > 0 && (
            <span className="rounded bg-orange-500/20 px-2 py-0.5 text-xs font-bold text-orange-400">
              {offlineCount} pending
            </span>
          )}
        </div>
      )}

      {/* ✅ Salesperson system enabled but no active agents */}
      {salespersonEnabled && !hasAgents && (
        <div className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 mx-3 mt-1 shrink-0">
          <AlertCircle size={14} className="text-red-400 shrink-0" />
          <p className="font-semibold text-red-400 text-xs">
            ⚠️ Salesperson system is enabled but no active agents are configured. Contact SuperAdmin.
          </p>
        </div>
      )}

      {/* Tab bar */}
      <div className={`flex items-center gap-1 px-3 py-1 overflow-x-auto shrink-0 ${isDark ? "border-b border-yellow-500/10" : "border-b border-yellow-100"}`}>
        <AnimatePresence mode="popLayout">
          {tabs.map((tab) => (
            <motion.div key={tab.tabId} layout
              initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }} className="relative group shrink-0">
              <motion.button
                onClick={() => switchTab(tab.tabId)}
                whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                title={`Bill ${tab.tabId}${tab.items?.length ? ` • ${tab.items.length} items` : ""}`}
                className={`flex items-center gap-1 rounded-full px-2.5 h-7 text-[11px] font-bold border transition-all min-w-[56px] max-w-[110px] ${tab.tabId === activeTabId
                  ? "bg-amber-500 text-black border-amber-400 shadow-md"
                  : isDark ? "border-yellow-500/20 text-gray-400 hover:text-gray-200 bg-transparent"
                    : "border-yellow-200 text-gray-500 hover:text-gray-700 bg-transparent"
                  }`}>
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${tab.items?.length > 0 ? "bg-green-400"
                  : tab.tabId === activeTabId ? "bg-yellow-400" : "bg-gray-500"
                  }`} />
                <span className="truncate">B{tab.tabId}</span>
                {(tab.items?.length || 0) > 0 && (
                  <span className={`text-[9px] font-bold rounded-full px-1 shrink-0 ${tab.tabId === activeTabId ? "bg-black/20 text-black"
                    : isDark ? "bg-yellow-500/20 text-yellow-400" : "bg-yellow-100 text-yellow-700"
                    }`}>
                    {tab.items.length}
                  </span>
                )}
              </motion.button>
              {tabs.length > 1 && (
                <button
                  onClick={(e) => { e.stopPropagation(); closeTab(tab.tabId); }}
                  className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full z-10 bg-red-500 text-white text-[8px] font-bold items-center justify-center hidden group-hover:flex hover:bg-red-400">
                  ×
                </button>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
        {tabs.length < MAX_TABS && (
          <motion.button onClick={addNewTab} whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
            title={`New Bill (End key) — ${tabs.length}/${MAX_TABS}`}
            className={`h-7 w-7 rounded-full border border-dashed flex items-center justify-center text-[14px] font-bold transition-colors shrink-0 ${isDark ? "border-yellow-500/30 text-yellow-500/50 hover:text-yellow-400"
              : "border-yellow-300 text-yellow-400 hover:text-yellow-600"
              }`}>+
          </motion.button>
        )}
        <span className={`ml-1 text-[9px] shrink-0 ${isDark ? "text-gray-700" : "text-gray-300"}`}>
          {tabs.length}/{MAX_TABS}
        </span>
      </div>

      {/* Main grid */}
      <div className="flex-1 grid gap-2 xl:grid-cols-[300px_1fr] min-h-0 px-3 mt-1 pb-2 overflow-hidden">

        {/* LEFT: Entry Form */}
        <section className={`${cardClass} flex flex-col overflow-hidden`}>
          <div className="flex-1 overflow-y-auto p-3">
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                  <ShoppingCart size={14} className="text-yellow-500" />
                  <h2 className="font-bold text-yellow-600 text-sm">ENTRY</h2>
                </div>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${screenLocked ? "bg-red-100 text-red-600" : "bg-green-100 text-green-600"}`}>
                  {screenLocked ? "LOCKED" : "ACTIVE"}
                </span>
              </div>

              {!screenLocked && (
                <div className={`rounded-xl p-2 border shrink-0 ${isDark ? "bg-yellow-500/5 border-yellow-500/20" : "bg-yellow-50 border-yellow-200"}`}>
                  <p className="text-[10px] uppercase tracking-wide text-gray-500">Next Bill Serial</p>
                  <p className="text-xl font-bold text-yellow-600 font-mono">{nextPreviewSerial}</p>
                  {billStartTime && (
                    <p className="text-[10px] text-gray-500 mt-0.5">Started: {fmtTime(billStartTime)}</p>
                  )}
                </div>
              )}

              {showProductName && (
                <div>
                  <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Product Name *</label>
                  <input ref={productNameRef} type="text" value={form.productName}
                    onChange={(e) => setForm((p) => ({ ...p, productName: e.target.value }))}
                    onKeyDown={(e) => { if (e.key === "Enter") handleAddItem(); }}
                    disabled={screenLocked} placeholder="Product name..."
                    className={`w-full rounded-xl border px-3 py-2 text-sm outline-none ${isDark ? "border-yellow-500/20 bg-[#0f0d09] text-white" : "border-yellow-200 bg-white text-gray-900"} disabled:opacity-50`} />
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
                        {groupBySalesperson ? 'Flat View' : 'Group by SP'}
                      </button>
                      { /* Live commission preview */ }
                      {salespersonEnabled && hasAgents && (salespersonMultiple ? currentAgent : selectedSalesperson) && (
                        <div className="text-xs text-gray-400 ml-auto">
                          <span className="font-semibold text-emerald-400">Preview:</span>
                          <span className="ml-2 font-bold text-emerald-300">
                            Rs.{(() => {
                              try {
                                const priceN = Number(form.price || 0);
                                const qtyN = Number(form.qty || 1);
                                const discN = Number(form.discount || 0);
                                const agent = salespersonMultiple ? currentAgent : selectedSalesperson;
                                const item = {
                                  price: priceN,
                                  qty: qtyN,
                                  discount: discN,
                                  discountType: form.discountType || 'percent',
                                  commissionType: agent?.commissionType || salespersonDefaultType,
                                  commissionPercent: agent?.commissionRate ?? salespersonDefaultRate,
                                  commissionFixed: agent?.commissionFixed ?? salespersonDefaultFixed,
                                };
                                const { rawComm } = calcItemCommission(item);
                                return Math.round(rawComm).toLocaleString();
                              } catch { return '0'; }
                            })()}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
                <div>
                  <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Price *</label>
                  <input ref={priceInputRef} type="text" inputMode="numeric" value={form.price}
                    onChange={(e) => { const v = e.target.value.replace(/\D/g, ""); setForm((p) => ({ ...p, price: v })); if (v) intentionalDupRef.current = false; }}
                    onFocus={(e) => setTimeout(() => e.target.select(), 10)}
                    onKeyDown={(e) => {
                      const ok = ["Backspace", "Delete", "Tab", "Escape", "Enter", "ArrowLeft", "ArrowRight"];
                      if (!ok.includes(e.key) && !/^\d$/.test(e.key) && !((e.ctrlKey || e.metaKey) && ["a", "c", "v", "x"].includes(e.key.toLowerCase()))) e.preventDefault();
                      if (e.key === "Enter") { e.preventDefault(); handleAddItem(); }
                    }}
                    placeholder={lastEntryRef.current.price ? `↵ ${lastEntryRef.current.price}` : "0"}
                    disabled={screenLocked}
                    style={{ fontSize: `${Math.max(billerFontSize, 18)}px` }}
                    className={`w-full rounded-xl border px-3 py-2.5 font-bold outline-none focus:ring-2 focus:ring-yellow-500/30 ${isDark ? "border-yellow-500/30 bg-[#0f0d09] text-yellow-400" : "border-yellow-300 bg-white text-yellow-700"} disabled:opacity-50`} />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Qty</label>
                  <input ref={qtyInputRef} type="text" inputMode="numeric" value={form.qty}
                    onChange={(e) => handleFormQtyChange(e.target.value)}
                    onFocus={(e) => setTimeout(() => e.target.select(), 10)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddItem(); } }}
                    disabled={screenLocked}
                    style={{ fontSize: `${Math.max(billerFontSize, 18)}px` }}
                    className={`w-full rounded-xl border px-3 py-2.5 font-bold outline-none focus:ring-2 focus:ring-yellow-500/30 ${isDark ? "border-yellow-500/20 bg-[#0f0d09] text-white" : "border-yellow-200 bg-white text-gray-900"} disabled:opacity-50`} />
                </div>
              </div>

              {showDiscountField && (
                <div>
                  <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Discount / Item</label>
                  <div className="relative">
                    <input ref={discountInputRef} type="text" inputMode="decimal" value={form.discount}
                      onChange={(e) => {
                        const cleaned = e.target.value.replace(/[^0-9.]/g, "");
                        if (cleaned === "") { setForm((p) => ({ ...p, discount: "", discountType: "percent" })); return; }
                        const raw = Number(cleaned) || 0;
                        if (raw > maxBillDiscountPercent) toast.error(`Max discount: ${maxBillDiscountPercent}%`, { duration: 1800 });
                        setForm((p) => ({ ...p, discount: Math.min(maxBillDiscountPercent, raw), discountType: "percent" }));
                        if (!form.price || form.price === "") intentionalDupRef.current = raw > 0 || _safeQty(form.qty) > 1;
                      }}
                      onFocus={(e) => setTimeout(() => e.target.select(), 10)}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddItem(); } }}
                      disabled={screenLocked}
                      className={`w-full rounded-xl border px-3 py-2.5 pr-8 text-sm font-semibold outline-none ${isDark ? "border-yellow-500/20 bg-[#0f0d09] text-white" : "border-yellow-200 bg-white text-gray-900"} disabled:opacity-50`} />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-yellow-500">%</span>
                  </div>
                </div>
              )}

              <hr className={isDark ? "border-yellow-500/10" : "border-yellow-100"} />

              {/* Customer name */}
              <div>
                <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Customer Name</label>
                <div className="relative">
                  <div className="flex gap-1.5">
                    <div className="relative flex-1">
                      <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                      <input ref={nameInputRef} type="text"
                        value={custNameSearch || customer.name}
                        onChange={(e) => onNameChange(e.target.value)}
                        onFocus={() => { setActiveField("name"); const v = custNameSearch || customer.name; if (v.length >= 2 && v !== "Walking Customer") doSearch(v); }}
                        onBlur={() => setTimeout(() => { if (activeField === "name") { setShowSug(false); setActiveField(""); } }, 200)}
                        disabled={screenLocked} placeholder="Customer name"
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
                          <span className="text-xs text-gray-400">Searching...</span>
                        </div>
                      ) : custSuggestions.length > 0 ? custSuggestions.map((c, i) => (
                        <button key={i} onMouseDown={() => onSelectSuggestion(c)}
                          className={`w-full text-left px-3 py-2 text-sm hover:bg-yellow-500/10 border-b last:border-0 ${isDark ? "text-white border-yellow-500/10" : "text-gray-900 border-gray-100"}`}>
                          <div className="flex items-center justify-between">
                            <span className="font-medium">{c.name || "No Name"}</span>
                            {c.phone && <span className={`text-xs font-mono ${isDark ? "text-yellow-400" : "text-yellow-600"}`}>{c.phone}</span>}
                          </div>
                          {c.city && <span className={`text-[10px] ${isDark ? "text-gray-500" : "text-gray-400"}`}>{c.city}{c.market ? ` • ${c.market}` : ""}</span>}
                        </button>
                      )) : (
                        <div className={`px-3 py-3 text-xs text-center ${isDark ? "text-gray-500" : "text-gray-400"}`}>No record found</div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Phone */}
              <div>
                <label className="block text-[10px] font-semibold text-gray-500 mb-1 uppercase">Phone <span className="text-gray-400">(Home)</span></label>
                <div className="relative">
                  <input ref={phoneInputRef} type="tel" inputMode="numeric" value={custPhoneSearch}
                    onChange={(e) => onPhoneChange(e.target.value.replace(/[^0-9+]/g, ""))}
                    onFocus={() => { setActiveField("phone"); if (custPhoneSearch.length >= 3) doSearch(custPhoneSearch); }}
                    onBlur={() => setTimeout(() => { if (activeField === "phone") { setShowSug(false); setActiveField(""); } }, 200)}
                    disabled={screenLocked} placeholder="03XX-XXXXXXX"
                    className={`w-full rounded-xl border px-3 py-2 text-sm outline-none ${isDark ? "border-yellow-500/20 bg-[#0f0d09] text-white" : "border-yellow-200 bg-white text-gray-900"} disabled:opacity-50`} />
                  {showSug && activeField === "phone" && (
                    <div className={`absolute top-full left-0 right-0 z-50 mt-1 rounded-xl border shadow-xl max-h-44 overflow-y-auto ${isDark ? "bg-[#1a1508] border-yellow-500/30" : "bg-white border-yellow-200"}`}>
                      {sugLoading ? (
                        <div className="flex items-center justify-center py-3 gap-2">
                          <Loader2 size={13} className="animate-spin text-yellow-500" />
                          <span className="text-xs text-gray-400">Searching...</span>
                        </div>
                      ) : custSuggestions.length > 0 ? custSuggestions.map((c, i) => (
                        <button key={i} onMouseDown={() => onSelectSuggestion(c)}
                          className={`w-full text-left px-3 py-2 text-sm hover:bg-yellow-500/10 border-b last:border-0 ${isDark ? "text-white border-yellow-500/10" : "text-gray-900 border-gray-100"}`}>
                          <div className="flex items-center justify-between">
                            <span className={`text-xs font-mono font-bold ${isDark ? "text-yellow-400" : "text-yellow-600"}`}>{c.phone}</span>
                            <span className="font-medium">{c.name || "No Name"}</span>
                          </div>
                          {c.city && <span className={`text-[10px] ${isDark ? "text-gray-500" : "text-gray-400"}`}>{c.city}{c.market ? ` • ${c.market}` : ""}</span>}
                        </button>
                      )) : (
                        <div className={`px-3 py-3 text-xs text-center ${isDark ? "text-gray-500" : "text-gray-400"}`}>No record found</div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <button onClick={handleAddItem} disabled={screenLocked}
                className="w-full rounded-xl bg-gradient-to-r from-yellow-500 to-amber-500 px-4 py-2.5 text-sm font-bold text-black hover:from-yellow-400 hover:to-amber-400 disabled:opacity-50 active:scale-95 transition-transform">
                ➕ Add Item (Enter)
              </button>

              {lastEntryRef.current.price && (
                <p className="text-center text-[10px] text-gray-400">
                  ↵ Rs.{lastEntryRef.current.price}
                  {lastEntryRef.current.discount > 0 && ` −${lastEntryRef.current.discount}%`}{" "}
                  ×{lastEntryRef.current.qty}
                  {" · type qty + Enter to duplicate"}
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
                    Next items → {currentAgent.name}
                  </span>
                )}
              </div>
            )}



            {/* ✅ BillItemsTable — full flex space */}
            <div ref={tableContainerRef} className="flex-1 min-h-0 overflow-auto">
              <BillItemsTable
                items={items}
                agents={salespersonAgents}
                showSalesperson={showSPColumnInTable || showSPInEntry}
                multiSP={enableMultiSPEdit}
                groupBy={groupBySalesperson}
                onGroupToggle={(v) => setGroupBySalesperson(Boolean(v))}
                onItemRemove={deleteRow}
                onItemReassign={handleReassignItem}
                onQtyChange={changeQty}
                onDiscountChange={changeDiscount}
                isDark={isDark}
              />
            </div>

            {/* ✅ Commission Summary Panel — only when SP ON + items + agents */}
            {showCommissionPanel && (
              <div className="px-3 pb-2 shrink-0">
                <CommissionSummaryPanel
                  summary={buildCommissionSummary(items, finalTotal, subtotal)}
                  paidRatio={subtotal > 0 ? Math.min(1, finalTotal / subtotal) : 1}
                  isDark={isDark}
                />
              </div>
            )}

            {/* Bill discount */}
            {items.length > 0 && allowBillDiscount && (
              <div className={`shrink-0 border-t px-3 py-1 ${isDark ? "border-yellow-500/10 bg-[#12100a]" : "border-yellow-100 bg-yellow-50/50"}`}>
                <div className="flex items-center justify-between gap-3">
                  <label className={`text-[10px] font-bold uppercase ${isDark ? "text-gray-400" : "text-gray-600"}`}>Bill Discount</label>
                  <div className="flex items-center gap-1">
                    <input type="text" inputMode="decimal" value={billDiscount}
                      onChange={(e) => {
                        const cleaned = e.target.value.replace(/[^0-9.]/g, "");
                        const raw = cleaned === "" ? 0 : Number(cleaned) || 0;
                        if (raw > maxBillDiscountPercent) toast.error(`Max discount: ${maxBillDiscountPercent}%`, { duration: 1800 });
                        updateTab({ billDiscount: cleaned === "" ? "" : Math.min(maxBillDiscountPercent, Math.max(0, raw)), billDiscountType: "percent" });
                      }}
                      disabled={screenLocked}
                      className={`w-16 rounded-lg border px-2 py-1 text-center text-xs outline-none ${isDark ? "border-yellow-500/20 bg-black/30 text-white" : "border-yellow-200 bg-white text-gray-900"} disabled:opacity-50`} />
                    <span className={`text-xs font-bold px-2 py-1 rounded-lg ${isDark ? "bg-yellow-500/10 text-yellow-400" : "bg-yellow-50 text-yellow-700"}`}>%</span>
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
                      ...(salespersonEnabled && hasAgents && salespersonCommission > 0
                        ? [["Commission", `+${salespersonCommission.toLocaleString()}`]]
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
                    <Trash2 size={11} className="inline mr-1" /> Cancel
                  </button>
                )}
                <button onClick={handleF8}
                  disabled={items.length === 0 || submitting || saveDoneRef.current}
                  className="inline-flex items-center gap-1.5 rounded-xl px-4 py-1.5 text-sm font-bold bg-yellow-500 text-black hover:bg-yellow-400 disabled:opacity-40 active:scale-95 transition-transform">
                  {submitting ? <Loader2 size={13} className="animate-spin" /> : <Printer size={13} />}
                  {submitting ? "Saving..." : "F8: Checkout"}
                </button>
              </div>
            </div>
          </section>

          {/* Hotkey legend */}
          <section className={`${cardClass} p-1.5 shrink-0`}>
            <div className="flex flex-wrap gap-1">
              {[
                ["INS", "New"], ["Enter", "Add"], ["F8", "Checkout"], ["ESC", "Back"],
                ["END", "New Tab"], ["−", "Del Last"], ["DEL", "Clear All"], ["↑↓", "Nav"],
                ["Home", "Phone"], ["Num+", "Qty"], ["Num/", "Disc"], ["Ctrl+1-5", "Switch"], ["Ctrl+W", "Close"],
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
            onClick={() => { setShowClearConfirm(false); requestAnimationFrame(() => priceInputRef.current?.focus()); }}>
            <motion.div initial={{ opacity: 0, x: 28, scale: 0.96 }} animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 28, scale: 0.96 }} onClick={(e) => e.stopPropagation()}
              className={`mt-16 w-72 rounded-2xl border p-3 shadow-2xl ${isDark ? "border-red-500/30 bg-[#1a1208] text-white" : "border-red-200 bg-white text-gray-900"}`}>
              <div className="flex items-start gap-2">
                <Trash2 size={18} className="mt-0.5 text-red-400" />
                <div className="min-w-0">
                  <h3 className="text-sm font-extrabold">Clear full bill?</h3>
                  <p className={`mt-1 text-xs ${isDark ? "text-gray-400" : "text-gray-500"}`}>
                    Delete key will clear {items.length} item(s). This action will be saved in audit.
                  </p>
                </div>
              </div>
              <div className="mt-3 flex gap-2">
                <button type="button"
                  onClick={() => { setShowClearConfirm(false); requestAnimationFrame(() => priceInputRef.current?.focus()); }}
                  className={`flex-1 rounded-xl px-3 py-2 text-xs font-bold ${isDark ? "bg-white/5 text-gray-300 hover:bg-white/10" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}>
                  Cancel
                </button>
                <button type="button"
                  onClick={() => { setShowClearConfirm(false); clearBill(); requestAnimationFrame(() => priceInputRef.current?.focus()); }}
                  className="flex-1 rounded-xl bg-red-500 px-3 py-2 text-xs font-extrabold text-white hover:bg-red-400">
                  Clear
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Dialogs */}
      <AnimatePresence>
        {showCustomerDialog && (
          <CustomerDialog isOpen={showCustomerDialog} initialCustomer={customer}
            onSubmit={onCustomerSubmit}
            onClose={() => { setShowCustomerDialog(false); updateTab({ f8Step: 0 }); releaseF8Lock(); requestAnimationFrame(() => priceInputRef.current?.focus()); }}
            runtimeCities={runtimeCities} runtimeMarkets={runtimeMarkets}
            onAddCity={(c) => { if (c && !runtimeCities.includes(c)) setRuntimeCities((p) => [...p, c]); }}
            onAddMarket={(m) => { if (m && !runtimeMarkets.includes(m)) setRuntimeMarkets((p) => [...p, m]); }}
            isSuperAdmin={isSuperAdmin} storeId={storeId} billerId={billerId} billId={currentBillSerial} />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showSummaryPopup && (
          <BillSummary isOpen={showSummaryPopup} items={items} totalQty={totalQty}
            totalDiscount={totalDiscount} subtotal={subtotal}
            billDiscount={billDiscount} billDiscountType={billDiscountType}
            grandTotal={finalTotal} billSerial={nextPreviewSerial} customer={customer}
            salespersonEnabled={salespersonEnabled && !salespersonMultiple && hasAgents}
            salespersonAgents={salespersonAgents}
            showSalespersonColumn={showSPColumnInTable}
            groupBySalesperson={groupBySalesperson}
            selectedSalespersonId={salespersonId} salespersonCommission={salespersonCommission}
            onSalespersonChange={(id) => updateTab({ salespersonId: id })}
            onProceed={onSummaryProceed}
            onClose={() => { setShowSummaryPopup(false); setShowCustomerDialog(true); updateTab({ f8Step: 1 }); releaseF8Lock(); }}
            onBillDiscountChange={(v) => updateTab({ billDiscount: v })}
            onBillDiscountTypeChange={(t) => updateTab({ billDiscountType: t })} />
        )}
      </AnimatePresence>

      {showPrintModal && printOrder && (
        <InvoicePrint order={printOrder} store={storeInfo} onClose={onPrintClose}
          directPrint autoClose fontSize={invoiceFontSize} />
      )}

      {viewingOrder && (
        <InvoicePrint order={viewingOrder} store={storeInfo}
          onClose={() => setViewingOrder(null)} directPrint={false} />
      )}

      <AnimatePresence>
        {showCashierPayment && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70">
            <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }}
              className={`w-full max-w-md rounded-3xl p-6 shadow-2xl ${isDark ? "bg-[#15120d] border border-yellow-500/20" : "bg-white border border-yellow-200"}`}>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <CreditCard size={20} className="text-green-400" />
                  <div>
                    <h2 className={`text-lg font-bold ${isDark ? "text-white" : "text-gray-900"}`}>Collect Payment</h2>
                    <p className={`text-xs font-mono ${isDark ? "text-gray-400" : "text-gray-500"}`}>#{nextPreviewSerial}</p>
                  </div>
                </div>
                <button onClick={() => { setShowCashierPayment(false); releaseF8Lock(); setShowSummaryPopup(true); updateTab({ f8Step: 2 }); }}>
                  <X size={18} className={isDark ? "text-gray-400" : "text-gray-500"} />
                </button>
              </div>
              <div className={`rounded-2xl p-4 mb-4 text-center ${isDark ? "bg-yellow-500/10 border border-yellow-500/20" : "bg-yellow-50 border border-yellow-200"}`}>
                <p className="text-xs uppercase text-gray-500 mb-1">Total Due</p>
                <p className="text-4xl font-extrabold text-yellow-500">Rs.{finalTotal.toLocaleString()}</p>
              </div>
              <div className="mb-4">
                <label className="block text-xs font-bold uppercase text-gray-500 mb-2">Payment Method</label>
                <div className="grid grid-cols-3 gap-2">
                  {["cash", "card", "online"].map((t) => (
                    <button key={t} onClick={() => updateTab({ paymentType: t })}
                      className={`py-2.5 rounded-xl text-sm font-bold capitalize transition-all ${paymentType === t ? "bg-yellow-500 text-black" : isDark ? "bg-white/5 text-gray-300 border border-yellow-500/20" : "bg-gray-100 text-gray-700 border border-gray-200"}`}>
                      {t}
                    </button>
                  ))}
                </div>
              </div>
              {paymentType === "cash" && (
                <div className="mb-4">
                  <label className="block text-xs font-bold uppercase text-gray-500 mb-2">Amount Received</label>
                  <input type="number" min={finalTotal} value={amountReceived}
                    onChange={(e) => updateTab({ amountReceived: e.target.value })}
                    onFocus={(e) => e.target.select()} autoFocus
                    placeholder={`Min: ${finalTotal}`}
                    onKeyDown={(e) => { if (e.key === "Enter" && Number(amountReceived || 0) >= finalTotal) onCashierConfirm(); }}
                    className={`w-full rounded-xl border px-4 py-3 text-2xl font-bold outline-none ${isDark ? "border-yellow-500/30 bg-[#0f0d09] text-yellow-400" : "border-yellow-300 bg-white text-yellow-700"}`} />
                  {changeAmount > 0 && (
                    <div className="mt-3 rounded-xl bg-green-500/10 border border-green-500/20 px-4 py-3 flex items-center justify-between">
                      <span className="text-sm font-semibold text-green-400">Change</span>
                      <span className="text-2xl font-extrabold text-green-400">Rs.{changeAmount.toLocaleString()}</span>
                    </div>
                  )}
                </div>
              )}
              <button onClick={onCashierConfirm}
                disabled={submitting || saveDoneRef.current || (paymentType === "cash" && Number(amountReceived || 0) < finalTotal)}
                className="w-full rounded-xl bg-gradient-to-r from-green-500 to-emerald-500 px-4 py-3 text-base font-bold text-white hover:from-green-400 hover:to-emerald-400 disabled:opacity-50 flex items-center justify-center gap-2 active:scale-95 transition-transform">
                {submitting
                  ? <><Loader2 size={16} className="animate-spin" /> Processing...</>
                  : <><Send size={14} /> Confirm & Save</>}
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default memo(Dashboard);