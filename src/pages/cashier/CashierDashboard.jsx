// src/components/cashier/CashierDashboard.jsx
// ✅ PRODUCTION v10.0 — Integrated with OfflinePaymentModal + ManualReviewPanel
// 10K+ orders, no overlap, online/offline, only pending shown

import {
  useState, useEffect, useLayoutEffect, useCallback, useMemo, useRef, memo,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import { List as VirtualList } from "react-window";
import { useAuth } from "../../context/AuthContext";
import { useNetwork } from "../../context/NetworkContext";
import { useTheme } from "../../context/ThemeContext";
import { useLanguage } from "../../hooks/useLanguage";
import LanguageSwitcher from "../../components/shared/LanguageSwitcher";
import {
  collection, query, where, onSnapshot, orderBy, limit,
  doc, getDoc, getDocs, updateDoc, addDoc, serverTimestamp,
} from "firebase/firestore";
import {
  Search, Sun, Moon, LogOut, Clock, XCircle, User, Eye, Edit3,
  X, Zap, AlertTriangle, ChevronDown, ChevronLeft, ChevronRight, MapPin, Plus,
  Store, Receipt, Hash, Wifi, WifiOff, ScanLine,
  Loader2, Shield, FileWarning, Sparkles, Keyboard, RefreshCw, CheckCircle2, CheckSquare, Square,
} from "lucide-react";
import { signOut } from "firebase/auth";
import { useNavigate } from "react-router-dom";
import { toast } from "react-hot-toast";
import { db, auth } from "../../services/firebase";
import { ensureDbReady } from "../../db/index";

import ViewBillModal from "../../components/cashier/ViewBillModal";
import CancelBillModal from "../../components/cashier/CancelModal";
import EditBillModal from "../../components/cashier/EditBillModal";
import { buildInvoicePrintProps, getOrderDisplayTotal, computeOrderSubtotalFromItems } from "../../utils/invoiceUtils";
import { warmInvoiceQr } from "../../utils/invoiceQrCache";
import { useSettings } from "../../context/SettingsContext";
import { isCashierOfflinePaymentEnabled } from "../../utils/roleUiSettings";
import { resolveUserPrimaryBranch, userCanAccessBranch } from "../../utils/branchAccess";
import { getStoreById } from "../../services/storeService";
import useStoresMap, {
  getStoreDisplayName, resolveStoreName, resolveEffectiveStoreId,
  buildStoreIdAliases, orderMatchesStore, findStoreRecord,
} from "../../hooks/useStoresMap";
import InvoicePrint, { closeActivePrintWindow } from "../../components/biller/InvoicePrint";
import QRScannerModal from "../../components/cashier/QRScannerModal";
import FilterTabs from "../../components/cashier/FilterTabs";
import ManualReviewPanel from "../../components/cashier/ManualReviewPanel";
import OfflinePaymentModal from "../../components/cashier/OfflinePaymentModal";
import DeletedBillFlagModal from "../../components/cashier/DeletedBillFlagModal";
import CashierPendingBillRow from "../../components/cashier/CashierPendingBillRow";
import CashierDeletedFlagsPanel from "../../components/admin/CashierDeletedFlagsPanel";
import PaginationBar from "../../components/ui/PaginationBar";
import { BILLS_PAGE_SIZE_OPTIONS, DEFAULT_BILLS_PAGE_SIZE } from "../../utils/paginationConstants";
import { getBillerBillDiscount, getCashierExtraDiscount } from "../../utils/orderDiscountUtils";
import {
  acknowledgeCancelledBill, flagCancelledBillForSuperadmin,
} from "../../services/cashierDeletedBillService";
import { isCashierCancelledBillRow, isVisibleCancelledBillRow, resolveFirestoreOrderId } from "../../utils/cancelledBillDisplayUtils";
import useEnabledPaymentMethods from "../../hooks/useEnabledPaymentMethods";
import useCashierDiscountPolicy from "../../hooks/useCashierDiscountPolicy";
import useCashierPayAllPolicy from "../../hooks/useCashierPayAllPolicy";
import {
  validateCashierExtraDiscount, clampCashierExtraDiscount, toastCashierDiscountLimit,
} from "../../utils/cashierDiscountPolicy";

import { logCashierAction, flushAuditQueue } from "../../services/cashierAuditService";
import { parseQRCode, verifyHash, decodeAndVerifyQR, generateQRHash } from "../../services/qrHashService";
import {
  saveOfflinePayment,
  getPendingOfflinePayments,
  getOfflinePaidBillKeys,
  syncPaymentToFirebaseNow,
  flushPendingPaymentsToFirebase,
  pushOfflinePaymentToCloud,
  markOfflinePaymentSynced,
  moveToManualReview,
  getManualReviewQueue,
  isWaitingForBillSync,
  clearStuckPaymentsForBill,
  escalateLegacyReviewItems,
} from "../../services/offlinePaymentService";
import { findBillForPayment, notifyBillerCashierPayment } from "../../services/paymentReconciliationService";
import {
  updateBillStatus, markBillPaidLocally, getUnsyncedOrdersForCashier,
  getPendingOrdersForCashier, reconcileLocalOrdersWithFirebase, findCashierBillBySerial,
} from "../../services/localBillService";
import {
  buildCashierPaymentPatch, CASHIER_PAYMENT_STATUS, getCashierEffectiveStatus,
  isCashierOrderPaid, isCashierOrderCancelled, isCashierPendingBill, isOrderInOfflinePaidIndex,
  isStillCashierQueuePending, shouldHideFromCashierQueue, filterCashierQueueOrders, isCashierUnpaidBill,
  matchesCashierPendingQueue,
} from "../../utils/cashierOrderUtils";
import { buildCashierOfflinePaymentPatch, normalizeInstantCashierOrder, INSTANT_PENDING_LS_KEY, INSTANT_ORDER_EVENT, startInstantOrderPoller } from "../../utils/billChannelUtils";
import { isShopApiConfigured, isShopApiReachable } from "../../utils/shopApiConfig";
import { findOrdersBySerialInput, resolveUniqueSerialMatch, serialMatches, normalizeSerial, getBillSerialKey } from "../../utils/serialMatch";
import { BROADCAST_CHANNELS } from "../../config/channelConfig";
import { useCashierHotkeys } from "../../hooks/useCashierHotkeys";
import { runInBatches } from "../../utils/asyncBatch";
import { runSync as runPaymentSync } from "../../services/cashierSyncWorker";
import { cashierCacheKey, clearCashierOfflineCache, scrubCashierCachePaidBills, scrubCashierCacheCancelledBills, scrubLsPendingPaidBills, scrubLsPendingCancelledBills } from "../../services/cashierCacheService";
import { getAllPaidBillKeys, fetchCloudPaidBillKeysFast, reconcilePaidBillsAcrossDevices, reconcileCashierBranch, recordOptimisticPaidBill, applyTrustedInstantPaymentToCloud, loadOptimisticPaidBillKeys, mergePaidBillKeys, subscribeCloudPaidBillKeys } from "../../services/paidBillIndexService";
import { recordOptimisticCancelledBill, loadOptimisticCancelledBillKeys, clearOptimisticCancelledBill, isOrderInOptimisticCancelledIndex, recordVisibleCancelledBill, loadVisibleCancelledBills, removeVisibleCancelledBill } from "../../utils/cashierCancelledIndex";
import { fetchCashierPendingOrders, fetchCashierCancelledOrders, subscribeCashierPendingOrders, fetchOrdersFallback, CASHIER_INITIAL_LIMIT, CASHIER_FULL_LIMIT } from "../../utils/ordersQueryUtils";
import { dedupeBillsBySerial } from "../../utils/billsFilterUtils";
import {
  VISIBILITY_RECONCILE_COOLDOWN_MS,
  CASHIER_SHOP_LIVE_POLL_MS,
  CASHIER_FIREBASE_LIVE_POLL_MS,
  CASHIER_DEXIE_POLL_ONLINE_MS,
  CASHIER_DEXIE_POLL_OFFLINE_MS,
  CASHIER_INSTANT_GUARD_MS,
  CASHIER_UI_QUEUE_CAP,
  CASHIER_PAID_INDEX_POLL_MS,
  CASHIER_LISTENER_HEALTH_SKIP_MS,
} from "../../utils/firebaseQuotaConfig";

const CASHIER_LS_PREFIX = 'cashier_pending_v2';
const lsPendingKey = (storeId, uid) => `${CASHIER_LS_PREFIX}_${storeId}_${uid}`;

const _isPaidByIndex = (order, index) => {
  if (!order || !index) return false;
  if (isCashierOrderPaid(order, index)) return true;
  const serial = getBillSerialKey(order);
  const id = String(order.id || order.localId || order.firebaseId || '').trim();
  if (serial && index.serials?.has(serial)) return true;
  if (id && index.billIds?.has(id)) return true;
  return false;
};

const lsScrubPaidBills = (bills, paidIndex) =>
  (bills || []).filter((o) => !_isPaidByIndex(o, paidIndex));

const lsLoadPendingBills = (storeIds, uid, paidIndex = null) => {
  const unique = [...new Set((storeIds || []).filter(Boolean))];
  let best = [];
  for (const sid of unique) {
    try {
      const raw = localStorage.getItem(lsPendingKey(sid, uid));
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      const bills = parsed?.bills;
      if (!Array.isArray(bills)) continue;
      const filtered = paidIndex ? lsScrubPaidBills(bills, paidIndex) : bills;
      if (filtered.length > best.length) best = filtered.map(normalizeOrderTimestamps);
    } catch { /* ignore */ }
  }
  return best;
};

const lsSavePendingBills = (bills, storeIds, uid, paidIndex = null) => {
  const safe = paidIndex ? lsScrubPaidBills(bills, paidIndex) : (bills || []);
  const payload = JSON.stringify({ bills: serializeOrders(safe), at: Date.now() });
  [...new Set((storeIds || []).filter(Boolean))].forEach((sid) => {
    try { localStorage.setItem(lsPendingKey(sid, uid), payload); } catch { /* ignore */ }
  });
};

const idbLoadAnyAlias = async (storeIds, uid, paidIndex = null) => {
  const unique = [...new Set((storeIds || []).filter(Boolean))];
  const results = await Promise.all(unique.map((sid) => idbLoad(sid, uid, paidIndex).catch(() => [])));
  return results.sort((a, b) => b.length - a.length)[0] || [];
};

/* ─── IndexedDB cache ─── */
const IDB = "cashier_offline";
const IDB_S = "bills";
const openIDB = () =>
  new Promise((r, j) => {
    const q = indexedDB.open(IDB, 1);
    q.onupgradeneeded = (e) => e.target.result.createObjectStore(IDB_S, { keyPath: "id" });
    q.onsuccess = (e) => r(e.target.result);
    q.onerror = (e) => j(e.target.error);
  });

/** Parse any timestamp: Firestore Timestamp, {seconds,nanoseconds}, ISO string */
const parseTS = (ts) => {
  if (!ts) return 0;
  if (ts?.toDate) return ts.toDate().getTime();
  // serialized Firestore Timestamp: { seconds: number, nanoseconds: number }
  if (typeof ts === 'object' && typeof ts.seconds === 'number') return ts.seconds * 1000;
  const ms = new Date(ts).getTime();
  return isNaN(ms) ? 0 : ms;
};

const ORDER_TS_KEYS = [
  'createdAt', 'updatedAt', 'savedAt', 'syncedAt',
  'billStartTime', 'billEndTime', 'billerSubmittedAt', '_createdAt',
];

/** Normalize timestamp fields to ISO strings (Firebase, cache, localStorage). */
const normalizeOrderTimestamps = (order) => {
  if (!order) return order;
  const out = { ...order };
  for (const key of ORDER_TS_KEYS) {
    const v = out[key];
    if (!v || typeof v === 'string') continue;
    const ms = parseTS(v);
    if (ms) out[key] = new Date(ms).toISOString();
  }
  return out;
};

const getOrderDisplayTs = (order) =>
  order?.createdAt || order?.savedAt || order?.billerSubmittedAt || order?.billEndTime || order?.billStartTime;

/** Serialize Firestore Timestamps to ISO strings so idbLoad doesn't lose date info */
const serializeOrders = (bills) =>
  (bills || []).map(normalizeOrderTimestamps);

const idbCacheKey = cashierCacheKey;

const idbSave = async (bills, storeId, uid, paidIndex = null) => {
  try {
    const pendingOnly = (bills || []).filter(
      (o) => !shouldHideFromCashierQueue(o, paidIndex) && !isCashierOrderCancelled(o),
    );
    const d = await openIDB();
    d.transaction(IDB_S, "readwrite").objectStore(IDB_S).put({
      id: idbCacheKey(storeId, uid),
      bills: serializeOrders(pendingOnly),
      at: Date.now(),
    });
  } catch {}
};

const idbLoad = async (storeId, uid, paidIndex = null) => {
  try {
    const d = await openIDB();
    return new Promise((r) => {
      const q = d.transaction(IDB_S, "readonly").objectStore(IDB_S).get(idbCacheKey(storeId, uid));
      q.onsuccess = (e) => {
        const bills = e.target.result?.bills || [];
        r(bills.filter((o) => !shouldHideFromCashierQueue(o, paidIndex) && !isCashierOrderCancelled(o)));
      };
      q.onerror = () => r([]);
    });
  } catch {
    return [];
  }
};

const DEFAULT_ROW_HEIGHT = 88;
const FONT_BASE = 20;
const SEARCH_LIMIT = 12;
const PAGE_SIZE = 100;

/** Stable key for bulk pay selection (local + Firebase ids). */
const getCashierBulkOrderKey = (o) =>
  String(o?.id || o?.localId || o?.firebaseId || getBillSerialKey(o) || '').trim();

const paidToastId = (serial) => `cashier-paid-${normalizeSerial(serial) || 'bill'}`;

let paidToastBurst = 0;
let paidToastBurstTimer = null;

const bumpPaidToastBurst = () => {
  paidToastBurst += 1;
  clearTimeout(paidToastBurstTimer);
  paidToastBurstTimer = setTimeout(() => { paidToastBurst = 0; }, 4500);
  return paidToastBurst;
};

const showPaymentSuccessToast = (amount, serial) => {
  const burst = bumpPaidToastBurst();
  const duration = burst > 10 ? 550 : burst > 6 ? 900 : burst > 3 ? 1400 : 2200;
  const formatted = Number(amount || 0).toLocaleString();
  toast.success(
    serial ? `Rs. ${formatted} · #${serial}` : `Rs. ${formatted} collected`,
    {
      id: paidToastId(serial),
      duration,
      icon: <CheckCircle2 className="w-5 h-5 text-emerald-500" />,
    },
  );
};

const trimCashierQueue = (list, cap = CASHIER_UI_QUEUE_CAP) => {
  if (!list?.length || list.length <= cap) return list || [];
  const cancelled = [];
  const pending = [];
  for (const o of list) {
    if (isVisibleCancelledBillRow(o)) cancelled.push(o);
    else pending.push(o);
  }
  return [...cancelled, ...pending.slice(0, Math.max(0, cap - cancelled.length))];
};

const sortOrdersByDate = (a, b) => {
  const t1 = parseTS(getOrderDisplayTs(a));
  const t2 = parseTS(getOrderDisplayTs(b));
  return t2 - t1;
};

/** Merge Firebase/cache orders with Dexie pending (biller offline bills). */
const mergeCashierOrders = (remoteOrders, localPending, { online = false, offlinePaidIndex = null } = {}) => {
  const keepInQueue = (o) =>
    !isCashierOrderPaid(o, offlinePaidIndex)
    && (matchesCashierPendingQueue(o) || isVisibleCancelledBillRow(o));

  const remote = (remoteOrders || []).filter(keepInQueue);
  const serialSet = new Set(
    remote.map((o) => getBillSerialKey(o)).filter(Boolean),
  );
  const idSet = new Set(remote.map((o) => o.id).filter(Boolean));
  const localIdSet = new Set(remote.map((o) => o.localId).filter(Boolean));
  const firebaseIdSet = new Set(remote.map((o) => o.firebaseId).filter(Boolean));
  const extras = (localPending || []).filter((lo) => {
    if (!isCashierPendingBill(lo)) return false;
    if (shouldHideFromCashierQueue(lo, offlinePaidIndex)) return false;
    // Online: Firebase is source of truth — never inject synced/stale Dexie copies
    if (online && (lo.firebaseId || lo.syncStatus === "synced")) return false;
    const s = getBillSerialKey(lo);
    if (s && serialSet.has(s)) return false;
    const lid = lo.id || lo.localId;
    if (lid && (idSet.has(lid) || localIdSet.has(lid))) return false;
    if (lo.firebaseId && firebaseIdSet.has(lo.firebaseId)) return false;
    return true;
  });
  return dedupeBillsBySerial([...remote, ...extras])
    .filter(keepInQueue)
    .sort(sortOrdersByDate);
};

/** LS + IDB + Dexie — instant cashier queue before any Firebase round-trip. */
/** Sync — localStorage only (same frame, no Dexie/network). */
const loadLocalPendingStackFast = (storeIds, uid, paidIdx) =>
  lsLoadPendingBills(storeIds, uid, paidIdx)
    .filter((o) => !shouldHideFromCashierQueue(o, paidIdx));

const loadLocalPendingStack = async (storeIds, uid, primarySid, paidIdx, { online = false, skipShopApi = false } = {}) => {
  const lsBills = lsLoadPendingBills(storeIds, uid, paidIdx);
  const scopedIds = [...new Set((storeIds || []).filter(Boolean))];
  const [idbBills, dexiePending, unsynced] = await Promise.all([
    idbLoadAnyAlias(storeIds, uid, paidIdx),
    getPendingOrdersForCashier(scopedIds, { skipShopApi }).catch(() => []),
    getUnsyncedOrdersForCashier(scopedIds.length ? scopedIds : primarySid).catch(() => []),
  ]);
  const cached = lsBills.length >= idbBills.length ? lsBills : idbBills;
  const localDexie = [...(dexiePending || []), ...(unsynced || [])];
  return mergeCashierOrders(cached, localDexie, { online, offlinePaidIndex: paidIdx })
    .filter((o) => !shouldHideFromCashierQueue(o, paidIdx));
};

const springConfig = {
  type: "spring",
  damping: 25,
  stiffness: 300,
};

/* ═══════════════════════════════════════════════════════════════════
   VIRTUALIZED ROW COMPONENT
═══════════════════════════════════════════════════════════════════ */
const BillRow = memo(({ index, style, ...props }) => {
  const order = props.orders?.[index];
  if (!order) return null;
  return <CashierPendingBillRow index={index} style={style} order={order} {...props} />;
});
BillRow.displayName = "BillRow";

/* ═══════════════════════════════════════════════════════════════════
   MAIN COMPONENT
═══════════════════════════════════════════════════════════════════ */
const CashierDashboard = () => {
  const { isDark, toggleTheme } = useTheme();
  const { settings } = useSettings();
  const { isRTL, t } = useLanguage();
  const { user: currentUser, userData: authUserData } = useAuth();
  const navigate = useNavigate();

  /* ─── STATE ─── */
  const [userData, setUserData] = useState(authUserData);
  const storesMap = useStoresMap();
  const effectiveUser = userData || authUserData;
  const cashierBranchId = useMemo(
    () => resolveUserPrimaryBranch(effectiveUser),
    [effectiveUser],
  );
  const [queryStoreId, setQueryStoreId] = useState('');
  const cashierStoreId = useMemo(
    () => queryStoreId || resolveEffectiveStoreId(cashierBranchId, storesMap) || cashierBranchId,
    [queryStoreId, cashierBranchId, storesMap],
  );
  const cashierStoreAliases = useMemo(
    () => buildStoreIdAliases(cashierBranchId, storesMap, [queryStoreId, cashierStoreId]),
    [cashierBranchId, storesMap, queryStoreId, cashierStoreId],
  );
  const branchMissing = Boolean(effectiveUser?.uid) && !cashierBranchId;
  const cashierUid = currentUser?.uid || effectiveUser?.uid || '';
  const { rule: cashierDiscRule, getMaxExtra } = useCashierDiscountPolicy(cashierStoreId, cashierUid);
  const { enabled: payAllEnabled } = useCashierPayAllPolicy(cashierStoreId, cashierUid);
  const [storeData, setStoreData] = useState(null);

  /* Resolve Firebase doc id before queries (JM-1 / JMJ → weXNq…) */
  useEffect(() => {
    if (!cashierBranchId) {
      setQueryStoreId('');
      return;
    }
    const quickId = resolveEffectiveStoreId(cashierBranchId, storesMap) || cashierBranchId;
    setQueryStoreId(quickId);
    let cancelled = false;
    (async () => {
      const fromMap = resolveEffectiveStoreId(cashierBranchId, storesMap);
      const mapHit = findStoreRecord(cashierBranchId, storesMap);
      if (mapHit?.id && fromMap === mapHit.id) {
        if (!cancelled) setQueryStoreId(mapHit.id);
        return;
      }
      if (Object.keys(storesMap).length > 0 && fromMap && fromMap !== cashierBranchId) {
        if (!cancelled) setQueryStoreId(fromMap);
        return;
      }
      try {
        const store = await getStoreById(cashierBranchId);
        if (!cancelled) setQueryStoreId(store?.id || fromMap || cashierBranchId);
      } catch {
        if (!cancelled) setQueryStoreId(fromMap || cashierBranchId);
      }
    })();
    return () => { cancelled = true; };
  }, [cashierBranchId, storesMap]);

  const branchDisplayName = useMemo(() => {
    const fromStore = getStoreDisplayName(storeData)
      || storeData?.storeName
      || storeData?.name;
    if (fromStore) return fromStore;
    return resolveStoreName(cashierStoreId, storesMap, cashierStoreId || '');
  }, [storeData, cashierStoreId, storesMap]);

  const branchShortCode = storeData?.shortCode || '';
  const branchCity = storeData?.city || storeData?.location || '';

  const orderBelongsToCashierBranch = useCallback((order) => {
    if (!cashierStoreId) return true;
    const sid = order?.storeId || order?.branchId;
    if (!sid) return Boolean(order?.isLocalOnly || order?.offlinePending);
    if (orderMatchesStore(order, cashierStoreAliases)) return true;
    if (userCanAccessBranch(effectiveUser, sid, storesMap)) return true;
    // Instant biller checkout — don't drop while store alias map is still loading
    if (order?.isLocalOnly || order?.offlinePending) {
      const lowerSid = String(sid).toLowerCase();
      const lowerBranch = String(cashierBranchId || cashierStoreId || '').toLowerCase();
      if (lowerSid && lowerBranch && (lowerSid === lowerBranch || lowerSid.includes(lowerBranch) || lowerBranch.includes(lowerSid))) {
        return true;
      }
    }
    return false;
  }, [cashierStoreId, cashierBranchId, effectiveUser, cashierStoreAliases, storesMap]);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const offlinePaidIndexRef = useRef(mergePaidBillKeys(loadOptimisticPaidBillKeys()));
  const payingSerialsRef = useRef(new Set());
  const paidToastShownRef = useRef(new Set());
  const [offlinePaidKeysTick, setOfflinePaidKeysTick] = useState(0);
  const { isOnline } = useNetwork();
  const prevOnlineRef = useRef(isOnline);
  const visibilityReconcileLastRef = useRef(0);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [showStats, setShowStats] = useState(false);
  const [activeTab, setActiveTab] = useState("pending");

  const [reviewQueue, setReviewQueue] = useState([]);
  const [showReviewPanel, setShowReviewPanel] = useState(false);

  const reviewQueueMeta = useMemo(() => {
    const waitingBillSync = reviewQueue.filter((i) => isWaitingForBillSync(i.reviewReason));
    return { waitingBillSync };
  }, [reviewQueue]);

  // Search
  const [searchQuery, setSearchQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [searchActiveIndex, setSearchActiveIndex] = useState(-1);
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const searchInputRef = useRef(null);
  const [billsPage, setBillsPage] = useState(1);
  const [billsPageSize, setBillsPageSize] = useState(DEFAULT_BILLS_PAGE_SIZE);

  // Serial
  const [serialInput, setSerialInput] = useState("");
  const [serialFocused, setSerialFocused] = useState(false);
  const [serialActiveIndex, setSerialActiveIndex] = useState(-1);
  const [showSerialDropdown, setShowSerialDropdown] = useState(false);
  const serialInputRef = useRef(null);

  const qrBufferRef = useRef("");
  const qrTimerRef = useRef(null);
  const listContainerRef = useRef(null);
  const [listHeight, setListHeight] = useState(500);

  // Modals
  const [viewModal, setViewModal] = useState({ open: false, order: null });
  const [editModal, setEditModal] = useState({ open: false, order: null });
  const [editPrintOrder, setEditPrintOrder] = useState(null);
  const [cancelModal, setCancelModal] = useState({ open: false, order: null });
  const [qrModal, setQrModal] = useState(false);
  const [offlinePayModal, setOfflinePayModal] = useState({ open: false, prefilledSerial: "" });
  const [shopServerMissing, setShopServerMissing] = useState(false);
  const [manualSerialMode, setManualSerialMode] = useState(false);
  const [bulkPaying, setBulkPaying] = useState(false);
  const [bulkPayOpen, setBulkPayOpen] = useState(false);
  const [bulkSelectedIds, setBulkSelectedIds] = useState(() => new Set());
  const [rowPaymentMethods, setRowPaymentMethods] = useState({});
  const [flagModal, setFlagModal] = useState({ open: false, bill: null });
  const [savingDiscountId, setSavingDiscountId] = useState(null);

  const { labels: paymentOptions } = useEnabledPaymentMethods();

  const getRowPayment = useCallback(
    (order) => {
      const raw = rowPaymentMethods[order?.id] || order?.paymentType || paymentOptions[0] || 'Cash';
      const match = paymentOptions.find((m) => m.toLowerCase() === String(raw).toLowerCase());
      return match || paymentOptions[0] || 'Cash';
    },
    [rowPaymentMethods, paymentOptions],
  );

  const setRowPayment = useCallback((orderId, method) => {
    setRowPaymentMethods((prev) => ({ ...prev, [orderId]: method }));
  }, []);

  const handleQuickExtraDiscount = useCallback(async (order, extraDisc) => {
    if (!order?.id) return;
    if (!cashierDiscRule.enabled) {
      toast.error(t('cashierDiscDisabled', 'Extra discount Super Admin ne band ki hai'));
      return;
    }
    const v = validateCashierExtraDiscount(order, extraDisc, cashierDiscRule);
    if (!v.valid) {
      toastCashierDiscountLimit(v, cashierDiscRule);
      const clamped = clampCashierExtraDiscount(order, extraDisc, cashierDiscRule);
      if (clamped === getCashierExtraDiscount(order)) return;
      extraDisc = clamped;
    }
    const extra = clampCashierExtraDiscount(order, extraDisc, cashierDiscRule);
    const billerBase = getBillerBillDiscount(order);
    const subtotal = computeOrderSubtotalFromItems(order) || Number(order.subtotal) || 0;
    const newBillDiscount = billerBase + extra;
    const newTotal = Math.max(0, Math.round(subtotal - newBillDiscount));
    const cn = userData?.displayName || userData?.name || 'Cashier';
    const origTotal = Number(order.previousTotal || order.totalAmount || getOrderDisplayTotal(order));

    const patch = {
      billDiscount: newBillDiscount,
      billDiscountValue: newBillDiscount,
      billerBillDiscount: billerBase,
      cashierExtraDiscount: extra,
      subtotal,
      totalAmount: newTotal,
      isEdited: extra > 0 || Boolean(order.isEdited || order.wasEdited),
      wasEdited: extra > 0 || Boolean(order.wasEdited),
      lastEditedBy: extra > 0 ? cn : (order.lastEditedBy || ''),
      editedByName: extra > 0 ? cn : (order.editedByName || ''),
      previousTotal: order.previousTotal || origTotal,
      editedTotalDifference: newTotal - origTotal,
    };

    setSavingDiscountId(order.id);
    setOrders((prev) => prev.map((o) => (o.id === order.id ? { ...o, ...patch } : o)));

    try {
      const docId = order.firebaseId || order.id;
      if (db && docId && isOnline) {
        await updateDoc(doc(db, 'orders', docId), {
          ...patch,
          lastEditedAt: serverTimestamp(),
          lastEditedUserId: userData?.uid || '',
        });
      }
    } catch (err) {
      console.error('[Cashier] quick discount:', err);
      toast.error(t('discountSaveFailed', 'Could not save discount'));
    } finally {
      setSavingDiscountId(null);
    }
  }, [userData, isOnline, t, cashierDiscRule]);

  // Refs
  const handleInstantPayRef = useRef(null);
  const handleQRPunchRef = useRef(null);
  const refreshReviewQueueRef = useRef(null);
  const syncOfflinePaymentsRef = useRef(null);

  const [refreshKey, setRefreshKey] = useState(0);
  const editPrintLockRef = useRef(false);

  const anyModalOpen =
    viewModal.open || editModal.open || cancelModal.open ||
    qrModal || showReviewPanel || offlinePayModal.open || !!editPrintOrder || bulkPayOpen;

  /* ─── THEME ─── */
  const bg = isDark ? "bg-[#08060a]" : "bg-[#f4f4f7]";
  const bgOverlay = isDark
    ? "bg-[radial-gradient(ellipse_at_top,rgba(245,158,11,0.08),transparent_70%),radial-gradient(ellipse_at_bottom,rgba(99,102,241,0.04),transparent_70%)]"
    : "bg-[radial-gradient(ellipse_at_top,rgba(245,158,11,0.06),transparent_70%),radial-gradient(ellipse_at_bottom_left,rgba(99,102,241,0.05),transparent_60%)]";
  const glassBg = isDark
    ? "bg-[#13101a]/85 backdrop-blur-2xl border border-white/[0.06]"
    : "bg-white/85 backdrop-blur-2xl border border-black/[0.04]";
  const glassCard = isDark
    ? "bg-gradient-to-br from-[#1a1424]/80 to-[#13101a]/60 backdrop-blur-xl border border-white/[0.08] shadow-[0_8px_30px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.05)]"
    : "bg-gradient-to-br from-white/80 to-white/60 backdrop-blur-xl border border-black/[0.06] shadow-[0_8px_30px_rgba(0,0,0,0.08),inset_0_1px_0_rgba(255,255,255,0.8)]";
  const dropdownSolidBg = isDark
    ? "bg-[#13101a] border border-white/[0.1]"
    : "bg-white border border-black/[0.1]";
  const text = isDark ? "text-gray-50" : "text-gray-900";
  const subText = isDark ? "text-gray-400" : "text-gray-600";
  const mutedText = isDark ? "text-gray-500" : "text-gray-500";
  const inputBg = isDark
    ? "bg-[#0d0a14]/80 border border-white/[0.08] text-gray-100 placeholder:text-gray-500"
    : "bg-white/95 border border-black/[0.08] text-gray-900 placeholder:text-gray-400";
  const accent = "text-amber-500";
  const cashierFontSize = settings?.fonts?.cashierFontSize || FONT_BASE;
  const cashierRowHeight = settings?.fonts?.cashierRowHeight || DEFAULT_ROW_HEIGHT;
  const fontScale = cashierFontSize / FONT_BASE;
  const compactList = cashierRowHeight <= 50;
  const enableOfflinePayment = isCashierOfflinePaymentEnabled(settings);

  const storeListenIds = useMemo(
    () => [...new Set([cashierBranchId, cashierStoreId, queryStoreId, ...cashierStoreAliases].filter(Boolean))].slice(0, 10),
    [cashierBranchId, cashierStoreId, queryStoreId, cashierStoreAliases],
  );
  const storeListenKey = useMemo(() => storeListenIds.slice().sort().join('|'), [storeListenIds]);

  /* ═══════════════════════════════════════════════════════════════════
     EFFECTIVE STATUS — Simple ON/OFF
  ═══════════════════════════════════════════════════════════════════ */
  const loadPaidBillIndex = useCallback(async (sid, aliases) => {
    const ids = [...(aliases instanceof Set ? aliases : []), sid].filter(Boolean);
    const uniqueIds = [...new Set(ids)];
    const cloudParts = await Promise.all(
      uniqueIds.map((id) => fetchCloudPaidBillKeysFast(id).catch(() => ({ serials: new Set(), billIds: new Set() }))),
    );
    const local = await getOfflinePaidBillKeys().catch(() => ({ serials: new Set(), billIds: new Set() }));
    return cloudParts.reduce(
      (acc, part) => ({
        serials: new Set([...(acc.serials || []), ...(part.serials || [])]),
        billIds: new Set([...(acc.billIds || []), ...(part.billIds || [])]),
      }),
      mergePaidBillKeys(loadOptimisticPaidBillKeys(), { serials: new Set(local.serials || []), billIds: new Set(local.billIds || []) }),
    );
  }, []);

  const refreshOfflinePaidKeys = useCallback(async () => {
    try {
      const sid = cashierStoreId;
      const uid = currentUser?.uid || effectiveUser?.uid || '';
      const keys = sid
        ? await loadPaidBillIndex(sid, cashierStoreAliases)
        : await getOfflinePaidBillKeys();
      offlinePaidIndexRef.current = keys;
      setOfflinePaidKeysTick((n) => n + 1);
      if (sid && uid) {
        await scrubCashierCachePaidBills(sid, uid, keys).catch(() => {});
        scrubLsPendingPaidBills(storeListenIds, uid, keys);
      }
      return keys;
    } catch {
      return offlinePaidIndexRef.current;
    }
  }, [cashierStoreId, cashierStoreAliases, currentUser?.uid, effectiveUser?.uid, loadPaidBillIndex, storeListenIds]);

  const effectiveStatus = useCallback(
    (o) => getCashierEffectiveStatus(o, offlinePaidIndexRef.current),
    [offlinePaidKeysTick],
  );

  const stripPaidFromOrders = useCallback((list) => {
    return filterCashierQueueOrders(list, offlinePaidIndexRef.current);
  }, [offlinePaidKeysTick]);

  const stripPaidRef = useRef(stripPaidFromOrders);
  stripPaidRef.current = stripPaidFromOrders;
  const aliasesRef = useRef(cashierStoreAliases);
  aliasesRef.current = cashierStoreAliases;
  const unsyncedRef = useRef([]);
  const paidIndexReadyRef = useRef(false);
  const lastFullRefreshRef = useRef(0);
  const FULL_REFRESH_MIN_MS = 80;
  const lastInstantUpsertRef = useRef(0);
  const recentInstantSerialsRef = useRef(new Map());
  const lastListenerDeltaRef = useRef(0);

  /* ── Instant paint from cache — online + offline (first page before Firebase) ── */
  useLayoutEffect(() => {
    const uid = currentUser?.uid || effectiveUser?.uid;
    if (!uid || !cashierBranchId) return;
    const primarySid = queryStoreId || cashierStoreId || cashierBranchId;
    const paidIdx = mergePaidBillKeys(loadOptimisticPaidBillKeys(), offlinePaidIndexRef.current);
    offlinePaidIndexRef.current = paidIdx;

    // Sync: localStorage pending + pinned cancelled (same frame)
    const visibleCancelled = loadVisibleCancelledBills().filter(isVisibleCancelledBillRow);
    const fastLocal = loadLocalPendingStackFast(storeListenIds, uid, paidIdx);
    const instantStack = dedupeBillsBySerial([...visibleCancelled, ...fastLocal]);
    if (instantStack.length > 0) {
      setOrders(instantStack.filter((o) =>
        isVisibleCancelledBillRow(o) || !shouldHideFromCashierQueue(o, paidIdx),
      ));
      setLoading(false);
    } else if (visibleCancelled.length > 0) {
      setOrders(visibleCancelled);
      setLoading(false);
    }

    // Async: IDB + Dexie pending (still before Firebase) — never block first paint
    let cancelled = false;
    idbLoadAnyAlias(storeListenIds, uid, paidIdx)
      .then((idbBills) => {
        if (cancelled || !idbBills.length) return;
        const merged = idbBills.length > fastLocal.length ? idbBills : fastLocal;
        if (merged.length) {
          setOrders(merged.filter((o) => !shouldHideFromCashierQueue(o, paidIdx)));
          setLoading(false);
        }
      })
      .catch(() => {});
    loadLocalPendingStack(storeListenIds, uid, primarySid, paidIdx, { online: isOnline })
      .then((merged) => {
        if (cancelled || !merged.length) return;
        setOrders(merged);
        setLoading(false);
      })
      .catch(() => {});

    return () => { cancelled = true; };
  }, [storeListenKey, currentUser?.uid, effectiveUser?.uid, cashierBranchId, storeListenIds, queryStoreId, cashierStoreId, isOnline]);

  const dismissPaidBillSilently = useCallback((serialOrOrder) => {
    const serial = typeof serialOrOrder === 'string'
      ? (getBillSerialKey({ billSerial: serialOrOrder }) || normalizeSerial(serialOrOrder).replace(/^#+/, ''))
      : getBillSerialKey(serialOrOrder);
    const oid = typeof serialOrOrder === 'object'
      ? String(serialOrOrder?.id || serialOrOrder?.localId || '').trim()
      : '';
    if (serial || oid) {
      recordOptimisticPaidBill({
        serial,
        billId: oid,
        storeId: cashierStoreId,
      });
    }
    if (serial) paidToastShownRef.current.add(serial);
    const idx = offlinePaidIndexRef.current;
    if (serial) idx.serials?.add(serial);
    if (oid) idx.billIds?.add(oid);
    setOfflinePaidKeysTick((n) => n + 1);
    setOrders((prev) => {
      if (!serial) return stripPaidFromOrders(prev);
      return prev.filter((o) => getBillSerialKey(o) !== serial);
    });
    const uid = currentUser?.uid || userData?.uid || effectiveUser?.uid || '';
    if (cashierStoreId && uid) {
      scrubLsPendingPaidBills(storeListenIds, uid, idx);
      scrubCashierCachePaidBills(cashierStoreId, uid, idx).catch(() => {});
    }
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        const ch = new BroadcastChannel(BROADCAST_CHANNELS.BILLS);
        ch.postMessage({ type: 'CASHIER_PAID', serial, billId: oid, storeId: cashierStoreId });
        ch.close();
      }
    } catch { /* ignore */ }
  }, [stripPaidFromOrders, cashierStoreId, storeListenIds, currentUser?.uid, userData?.uid, effectiveUser?.uid]);

  const isValidDate = useCallback((o) => {
    try {
      const ts = o.createdAt || o.savedAt;
      if (!ts) return false;
      // Handle Firestore Timestamp class
      if (ts?.toDate) return !isNaN(ts.toDate().getTime());
      // Handle serialized Firestore Timestamp: { seconds, nanoseconds }
      if (typeof ts === 'object' && typeof ts.seconds === 'number') return true;
      const d = new Date(ts);
      return !isNaN(d.getTime());
    } catch {
      return false;
    }
  }, []);

  /* Bills visible in list — pending + cancelled (paid always hidden), one row per serial */
  const visibleOrders = useMemo(() => {
    const deduped = dedupeBillsBySerial(orders);
    let pending = [];
    let cancelled = [];
    for (const o of deduped) {
      if (!o) continue;
      if (isCashierOrderCancelled(o)) {
        if (isVisibleCancelledBillRow(o)) cancelled.push(o);
      } else if (matchesCashierPendingQueue(o)) {
        pending.push(o);
      }
    }
    return [...cancelled, ...pending];
  }, [orders]);

  const persistPendingToCache = useCallback((merged) => {
    const uid = currentUser?.uid || userData?.uid || effectiveUser?.uid || '';
    if (!uid) return;
    const pendingOnly = (merged || []).filter(
      (o) => matchesCashierPendingQueue(o) && !isOrderInOptimisticCancelledIndex(o),
    );
    lsSavePendingBills(pendingOnly, storeListenIds, uid, offlinePaidIndexRef.current);
  }, [currentUser?.uid, userData?.uid, effectiveUser?.uid, storeListenIds]);

  /** Instant upsert — same-tab broadcast, shop LAN, or live Firebase poll. */
  const upsertLivePendingOrders = useCallback((rawOrders) => {
    const list = Array.isArray(rawOrders) ? rawOrders : [rawOrders];
    const incoming = [];
    for (const raw of list) {
      if (!raw) continue;
      const normalized = normalizeInstantCashierOrder(raw);
      if (!normalized) continue;
      const o = normalizeOrderTimestamps(normalized);
      if (!orderBelongsToCashierBranch(o)) continue;
      if (isCashierOrderPaid(o, offlinePaidIndexRef.current)) continue;
      if (isOrderInOptimisticCancelledIndex(o)) continue;
      if (shouldHideFromCashierQueue(o, offlinePaidIndexRef.current)) continue;
      if (!matchesCashierPendingQueue(o)) continue;
      incoming.push(o);
    }
    if (!incoming.length) return;

    lastInstantUpsertRef.current = Date.now();
    setLoading(false);

    if (incoming.length === 1) {
      const o = incoming[0];
      const serialKey = getBillSerialKey(o);
      setOrders((prev) => {
        let replaced = false;
        const rest = prev.filter((p) => {
          if (serialKey && getBillSerialKey(p) === serialKey) { replaced = true; return false; }
          const oid = o.id || o.localId || o.firebaseId;
          const pid = p.id || p.localId || p.firebaseId;
          if (oid && pid && oid === pid) { replaced = true; return false; }
          return true;
        });
        const next = trimCashierQueue([o, ...rest]);
        queueMicrotask(() => persistPendingToCache(next));
        return next;
      });
      return;
    }

    setOrders((prev) => {
      const incomingSerials = new Set(incoming.map((o) => getBillSerialKey(o)).filter(Boolean));
      const incomingIds = new Set(
        incoming.flatMap((o) => [o.id, o.localId, o.firebaseId].filter(Boolean)),
      );

      let next = prev.filter((p) => {
        const sk = getBillSerialKey(p);
        if (sk && incomingSerials.has(sk)) return false;
        const pid = p.id || p.localId || p.firebaseId;
        if (pid && incomingIds.has(pid)) return false;
        return true;
      });
      next = dedupeBillsBySerial([...incoming, ...next])
        .filter((row) =>
          isVisibleCancelledBillRow(row)
          || (matchesCashierPendingQueue(row) && !isOrderInOptimisticCancelledIndex(row)),
        )
        .sort(sortOrdersByDate);
      const capped = trimCashierQueue(next);
      queueMicrotask(() => persistPendingToCache(capped));
      return capped;
    });
  }, [orderBelongsToCashierBranch, persistPendingToCache]);

  const upsertLiveRef = useRef(upsertLivePendingOrders);
  upsertLiveRef.current = upsertLivePendingOrders;
  const refreshLocalPendingRef = useRef(null);

  const handleBillCancelled = useCallback((cancelledOrder) => {
    if (!cancelledOrder?.id && !cancelledOrder?.localId) return;
    const serial = cancelledOrder.billSerial || cancelledOrder.serialNo;
    const uid = currentUser?.uid || userData?.uid || '';
    recordOptimisticCancelledBill({
      serial,
      billId: resolveFirestoreOrderId(cancelledOrder),
      localId: cancelledOrder.localId,
      storeId: cashierStoreId,
    });
    recordVisibleCancelledBill(cancelledOrder);
    scrubLsPendingCancelledBills(storeListenIds, uid);
    storeListenIds.forEach((sid) => {
      scrubCashierCacheCancelledBills(sid, uid).catch(() => {});
    });
    setActiveTab('cancelled');
    setOrders((prev) => {
      const rest = prev.filter((o) => {
        if (cancelledOrder.id && o.id === cancelledOrder.id) return false;
        if (cancelledOrder.localId && o.localId === cancelledOrder.localId) return false;
        if (serial && serialMatches(serial, o.billSerial || o.serialNo || o.id)) return false;
        if (isOrderInOptimisticCancelledIndex(o) && !isVisibleCancelledBillRow(o)) return false;
        return true;
      });
      return dedupeBillsBySerial([cancelledOrder, ...rest]).sort(sortOrdersByDate);
    });
  }, [cashierStoreId, storeListenIds, currentUser?.uid, userData?.uid]);

  /* ═══════════════════════════════════════════════════════════════════
     CALLBACKS
  ═══════════════════════════════════════════════════════════════════ */

  const forceRefresh = useCallback(() => setRefreshKey((p) => p + 1), []);

  const handleEditPrintClose = useCallback(() => {
    editPrintLockRef.current = false;
    setEditPrintOrder(null);
    forceRefresh();
  }, [forceRefresh]);

  useEffect(() => {
    if (!editPrintOrder) return undefined;
    const timer = setTimeout(() => {
      if (editPrintLockRef.current) {
        closeActivePrintWindow();
        handleEditPrintClose();
      }
    }, 8000);
    return () => clearTimeout(timer);
  }, [editPrintOrder, handleEditPrintClose]);

  const handleEditComplete = useCallback(({ order: updated, shouldPrint, markPaid }) => {
    setEditModal({ open: false, order: null });
    if (markPaid && updated) {
      dismissPaidBillSilently(updated);
      showPaymentSuccessToast(
        getOrderDisplayTotal(updated),
        getBillSerialKey(updated) || normalizeSerial(updated.billSerial || updated.serialNo || updated.id),
      );
      void reconcilePaidBillsAcrossDevices(cashierStoreId)
        .then((result) => {
          if (!result?.paidIndex) return;
          offlinePaidIndexRef.current = mergePaidBillKeys(offlinePaidIndexRef.current, result.paidIndex);
          setOfflinePaidKeysTick((n) => n + 1);
          setOrders((prev) => stripPaidFromOrders(prev));
        })
        .catch(() => {});
    } else if (updated?.id) {
      setOrders((prev) =>
        prev.map((o) => (o.id === updated.id ? { ...o, ...updated } : o)),
      );
    }
    if (shouldPrint && updated) {
      if (editPrintLockRef.current) return;
      editPrintLockRef.current = true;
      warmInvoiceQr(updated);
      setEditPrintOrder(updated);
    } else if (!markPaid) {
      forceRefresh();
    }
  }, [forceRefresh, dismissPaidBillSilently, cashierStoreId, stripPaidFromOrders]);

  const refreshReviewQueue = useCallback(async () => {
    try {
      await escalateLegacyReviewItems();
      const items = await getManualReviewQueue(cashierStoreId, {
        cashierView: true,
        storeAliases: cashierStoreAliases,
      });
      setReviewQueue(items || []);
    } catch {}
  }, [cashierStoreId, cashierStoreAliases]);

  useEffect(() => {
    refreshReviewQueueRef.current = refreshReviewQueue;
  }, [refreshReviewQueue]);

  const syncOfflinePayments = useCallback(async () => {
    try {
      const pending = await getPendingOfflinePayments();
      if (!pending || pending.length === 0) return;

      toast.loading(`Syncing ${pending.length} payments...`, { id: "sync" });
      let synced = 0, flagged = 0;

      for (const op of pending) {
        try {
          let orderId = op.billId;
          let billSnap = await getDoc(doc(db, "orders", op.billId));
          if (!billSnap.exists()) {
            const serial = op.billSerial || op.billId;
            for (const field of ["serialNo", "billSerial"]) {
              const qSnap = await getDocs(
                query(collection(db, "orders"), where(field, "==", serial), limit(1))
              );
              if (!qSnap.empty) {
                orderId = qSnap.docs[0].id;
                billSnap = qSnap.docs[0];
                break;
              }
            }
          }
          if (!billSnap.exists()) {
            // Bill not in Firebase yet — keep in queue; cashierSyncWorker will retry after biller sync
            continue;
          }
          const bill = { id: orderId, ...billSnap.data() };
          const actualAmount = getOrderDisplayTotal(bill);

          const billPs = String(bill.paymentStatus || "").toLowerCase();
          if (
            bill.status === "paid"
            || bill.status === CASHIER_PAYMENT_STATUS
            || billPs === "paid"
            || billPs === CASHIER_PAYMENT_STATUS
          ) {
            await markOfflinePaymentSynced(op.localId);
            synced++;
            continue;
          }

          if (Number(op.enteredAmount) === actualAmount) {
            // attempt update; on permission error try refreshing token once
            try {
              await updateDoc(doc(db, "orders", orderId), {
                ...buildCashierPaymentPatch({
                  amount: actualAmount,
                  paymentType: op.paymentMethod,
                  cashierId: op.cashierId,
                  cashierName: op.cashierName,
                }),
                paidAt: serverTimestamp(),
                cashierPaidAt: serverTimestamp(),
                offlineSync: true,
                offlineSavedAt: op.savedAt,
              });
            } catch (err) {
              console.warn("syncOfflinePayments update error, retrying token refresh:", err?.code || err);
              if (err?.code === "permission-denied" && auth?.currentUser) {
                try { await auth.currentUser.getIdToken(true); } catch {}
                await updateDoc(doc(db, "orders", orderId), {
                  ...buildCashierPaymentPatch({
                    amount: actualAmount,
                    paymentType: op.paymentMethod,
                    cashierId: op.cashierId,
                    cashierName: op.cashierName,
                  }),
                  paidAt: serverTimestamp(),
                  cashierPaidAt: serverTimestamp(),
                  offlineSync: true,
                  offlineSavedAt: op.savedAt,
                });
              } else throw err;
            }
            await logCashierAction({
              action: "OFFLINE_PAYMENT_SYNCED",
              orderId,
              billSerial: bill.billSerial || bill.serialNo,
              userId: op.cashierId,
              userName: op.cashierName || "Cashier",
              storeId: bill.storeId,
              amount: actualAmount,
              paymentType: op.paymentMethod,
              metadata: { localId: op.localId, deviceId: op.deviceId },
            });
            await markOfflinePaymentSynced(op.localId);
            synced++;
          } else {
            await moveToManualReview(
              op.localId,
              `amount_mismatch: Payment Rs.${Number(op.enteredAmount).toLocaleString()} ≠ bill Rs.${actualAmount.toLocaleString()}`,
            );
            flagged++;
          }
        } catch (err) {
          console.error("Sync error:", op.localId, err);
        }
      }

      if (refreshReviewQueueRef.current) await refreshReviewQueueRef.current();
      toast.dismiss("sync");
      if (synced > 0) {
        toast.success(`${synced} payment${synced > 1 ? "s" : ""} synced`, { id: "cashier-batch-sync", duration: 2000 });
      }
      if (flagged > 0) {
        toast.error(`⚠️ ${flagged} need review`, {
          icon: <FileWarning className="w-4 h-4 text-orange-500" />,
        });
      }
      const sid = cashierStoreId;
      if (sid) await reconcilePaidBillsAcrossDevices(sid).catch(() => {});
      await refreshOfflinePaidKeys();
      setOrders((prev) => stripPaidFromOrders(prev));
    } catch {
      toast.dismiss("sync");
    }
  }, [refreshOfflinePaidKeys, stripPaidFromOrders, cashierStoreId]);

  useEffect(() => {
    syncOfflinePaymentsRef.current = syncOfflinePayments;
  }, [syncOfflinePayments]);

  /** Cross-PC offline: pay using serial + amount + verify code from printed receipt (or QR). */
  const handleReceiptOfflinePay = useCallback(
    async ({ billSerial, amount, paymentMethod = "Cash", qrVerified = false, allowCrossPc = false }) => {
      const serial = String(billSerial || "").trim().toUpperCase();
      const amt = Number(amount) || 0;
      if (!serial || amt <= 0) {
        toast.error(t("offlineReceiptInvalid", "Invalid serial or amount"));
        return false;
      }

      const sid = cashierStoreId;
      const cn = userData?.displayName || userData?.name || "Cashier";
      const cashierId = auth?.currentUser?.uid || currentUser?.uid || userData?.uid || "";
      const tid = toast.loading(t("processingPayment", "Processing payment..."), { duration: 2000 });

      if (!currentUser && !auth?.currentUser) {
        toast.error(t("notAuthenticated", "Not authenticated — please login to perform payments"), { id: tid });
        return false;
      }

      let bill = orders.find((o) =>
        orderBelongsToCashierBranch(o)
        && serialMatches(serial, o.billSerial || o.serialNo || o.id)
      );
      if (!bill && sid) {
        bill = await findCashierBillBySerial(sid, serial);
      }

      if (
        bill
        && (effectiveStatus(bill) === "paid" || bill.offlineSyncPending || isOrderInOfflinePaidIndex(bill, offlinePaidIndexRef.current))
      ) {
        toast.dismiss(tid);
        dismissPaidBillSilently(serial);
        return false;
      }

      const billAmount = bill ? getOrderDisplayTotal(bill) : amt;
      const payAmount = bill ? billAmount : amt;

      if (!bill && !qrVerified && !allowCrossPc) {
        toast.dismiss(tid);
        toast.error(t("offlineSerialNotListed", "Serial not in pending bills — enter a valid bill serial"));
        return false;
      }

      if (isOnline && sid && amt > 0) {
        try {
          const cloudBill = await findBillForPayment({
            billSerial: serial,
            billId: serial,
            storeId: sid,
          });
          if (cloudBill) {
            const cloudAmt = getOrderDisplayTotal(cloudBill);
            if (cloudAmt !== 0 && amt !== cloudAmt) {
              toast.dismiss(tid);
              toast.error(
                t("offlineCorrectAmountOnce", `Wrong amount — bill is Rs.${cloudAmt.toLocaleString()}. Enter correct amount once.`),
                { duration: 5000 },
              );
              return false;
            }
          }
        } catch { /* non-critical */ }
      }

      if (bill && billAmount !== 0 && amt !== 0 && amt !== billAmount) {
        toast.dismiss(tid);
        toast.error(t("offlineAmountMismatch", `Amount must be Rs.${billAmount.toLocaleString()} for this bill`));
        return false;
      }

      try {
        const saved = await saveOfflinePayment({
          billId: bill?.id || bill?.localId || serial,
          billSerial: bill?.billSerial || bill?.serialNo || serial,
          enteredAmount: payAmount,
          paymentMethod,
          cashierId,
          cashierName: cn,
          storeId: sid,
          customer: bill?.customer || {},
          items: bill?.items || [],
          receiptPay: true,
          qrVerified: Boolean(qrVerified || allowCrossPc),
        });

        if (!saved?.success) {
          if (saved?.duplicate) {
            await refreshOfflinePaidKeys();
            toast.dismiss(tid);
            dismissPaidBillSilently(serial);
            return false;
          }
          throw new Error(saved?.error || "Offline save failed");
        }

        await refreshOfflinePaidKeys();

        const cloudResult = await pushOfflinePaymentToCloud(saved.record, saved.queueId)
          .catch(() => ({ success: false }));

        if (cloudResult?.needsReview) {
          if (refreshReviewQueueRef.current) await refreshReviewQueueRef.current();
          toast.error(
            cloudResult.details || t("offlinePayReviewRequired", "Payment needs review — check Manual Review"),
            { id: tid, duration: 6000 },
          );
          return false;
        }
        if (cloudResult?.needsRetry) {
          if (refreshReviewQueueRef.current) await refreshReviewQueueRef.current();
          if (!cloudResult.offline) {
            toast.success(
              t("offlinePaySyncPending", "Payment saved — will auto-match when bill syncs"),
              { id: tid, icon: <Loader2 className="w-4 h-4 animate-spin" />, duration: 4000 },
            );
          }
        } else if (!cloudResult?.success && !cloudResult?.offline) {
          runPaymentSync().catch(() => {});
        }

        const localKey = bill?.localId || bill?.id;
        if (bill?.isLocalOnly || bill?.localId || bill?.source === 'dexie') {
          await updateBillStatus(localKey, CASHIER_PAYMENT_STATUS, {
            paymentType: paymentMethod,
            paymentStatus: CASHIER_PAYMENT_STATUS,
            paidBy: cashierId,
            paidByName: cn,
            isActiveOrder: false,
          }).catch(() => {});
        }

        if (bill) {
          await markBillPaidLocally(bill, {
            paymentType: paymentMethod,
            paidBy: cashierId,
            paidByName: cn,
            amountReceived: payAmount,
            paidAmount: payAmount,
            offlineSyncPending: !isOnline,
            ...(!isOnline ? buildCashierOfflinePaymentPatch() : {}),
          }).catch(() => {});
        }

        paidToastShownRef.current.add(normalizeSerial(serial));
        dismissPaidBillSilently(serial);

        await logCashierAction({
          action: qrVerified ? "OFFLINE_RECEIPT_QR_PAY" : "OFFLINE_RECEIPT_MANUAL_PAY",
          billSerial: serial,
          userId: cashierId,
          userName: cn,
          storeId: sid,
          amount: payAmount,
          paymentType: paymentMethod,
          metadata: { receiptPay: true, qrVerified, localPaymentId: saved.localId },
        });

        toast.dismiss(tid);
        showPaymentSuccessToast(payAmount, serial);
        if (sid && isOnline) {
          await reconcilePaidBillsAcrossDevices(sid).catch(() => {});
          await refreshOfflinePaidKeys();
        }
        if (refreshReviewQueueRef.current) await refreshReviewQueueRef.current();
        return true;
      } catch (err) {
        console.error("[Cashier] Receipt offline pay:", err);
        toast.error(t("offlinePaySaveFailed", "Save failed"), { id: tid });
        return false;
      }
    },
    [userData, currentUser, orders, effectiveStatus, t, orderBelongsToCashierBranch, cashierStoreId, isOnline, refreshOfflinePaidKeys, dismissPaidBillSilently]
  );

  /* ─── Instant Pay — optimistic: hide first, save in background ─── */
  const handleInstantPay = useCallback(
    (order, { quiet = false } = {}) => {
      if (!orderBelongsToCashierBranch(order)) {
        toast.error(t('wrongBranchBill', 'This bill belongs to another branch'));
        return false;
      }
      const paidSerial = normalizeSerial(order.billSerial || order.serialNo || order.id);
      if (!paidSerial) return false;

      if (
        payingSerialsRef.current.has(paidSerial)
        || paidToastShownRef.current.has(paidSerial)
        || effectiveStatus(order) === 'paid'
        || isOrderInOfflinePaidIndex(order, offlinePaidIndexRef.current)
      ) {
        dismissPaidBillSilently(order);
        return true;
      }

      if (!currentUser && !auth?.currentUser) {
        toast.error(t('notAuthenticated', 'Not authenticated — please login to perform payments'));
        return false;
      }

      const sid = cashierStoreId;
      const cn = userData?.displayName || userData?.name || "Cashier";
      const cashierId = auth?.currentUser?.uid || currentUser?.uid || userData?.uid || "";
      const payAmount = getOrderDisplayTotal(order);

      payingSerialsRef.current.add(paidSerial);
      dismissPaidBillSilently(order);
      if (!quiet) showPaymentSuccessToast(payAmount, paidSerial);

      notifyBillerCashierPayment({
        billSerial: order.billSerial || order.serialNo || paidSerial,
        amount: payAmount,
        cashierName: cn,
        localId: order.id || order.localId,
        storeId: sid,
      }).catch(() => {});

      void (async () => {
        try {
          await clearStuckPaymentsForBill({
            billSerial: order.billSerial || order.serialNo,
            billId: order.id,
          });

          let cloudApplied = false;
          if (isOnline) {
            const cloud = await applyTrustedInstantPaymentToCloud({
              order,
              cashierId,
              cashierName: cn,
              storeId: sid,
            });
            cloudApplied = Boolean(cloud?.success);
          }

          const saved = await saveOfflinePayment({
            billId: order.id,
            billSerial: order.billSerial || order.serialNo,
            enteredAmount: payAmount,
            paymentMethod: order.paymentType || "Cash",
            cashierId,
            cashierName: cn,
            storeId: sid,
            customer: order.customer || {},
            items: order.items || [],
          });

          if (!saved?.success && !saved?.duplicate) {
            throw new Error(saved?.error || "Payment save failed");
          }

          if (cloudApplied && saved?.localId) {
            await markOfflinePaymentSynced(saved.localId, saved.queueId).catch(() => {});
          }

          if (order.isLocalOnly || order.localId) {
            await updateBillStatus(order.id, CASHIER_PAYMENT_STATUS, {
              paymentType: order.paymentType || "Cash",
              paymentStatus: CASHIER_PAYMENT_STATUS,
              managerConfirmed: false,
              paidBy: cashierId,
              paidByName: cn,
              isActiveOrder: false,
            }).catch(() => {});
          }

          await markBillPaidLocally(order, {
            paymentType: order.paymentType || "Cash",
            paidBy: cashierId,
            paidByName: cn,
            amountReceived: payAmount,
            paidAmount: payAmount,
            offlineSyncPending: !cloudApplied && !isOnline,
            ...(!cloudApplied && !isOnline ? buildCashierOfflinePaymentPatch() : {}),
          }).catch(() => {});

          logCashierAction({
            action: "PAYMENT_RECEIVED",
            orderId: order.id,
            billSerial: order.billSerial || order.serialNo,
            userId: cashierId,
            userName: cn,
            storeId: sid,
            amount: payAmount,
            paymentType: order.paymentType || "Cash",
            metadata: { localPaymentId: saved?.localId, cloudApplied, trustedInstant: true },
          }).catch(() => {});

          if (!cloudApplied && saved?.record) {
            void pushOfflinePaymentToCloud(saved.record, saved.queueId)
              .then(() => refreshOfflinePaidKeys())
              .catch(() => runPaymentSync().catch(() => {}));
          }

          if (sid) {
            reconcilePaidBillsAcrossDevices(sid)
              .then(() => refreshOfflinePaidKeys())
              .catch(() => {});
          }
          await refreshOfflinePaidKeys();
          if (refreshReviewQueueRef.current) refreshReviewQueueRef.current();
        } catch (err) {
          console.error("[Cashier] Payment error:", err);
          toast.error(t('paymentFailed', 'Payment failed — tell manager'), { duration: 3000 });
        } finally {
          payingSerialsRef.current.delete(paidSerial);
        }
      })();

      return true;
    },
    [userData, currentUser, isOnline, t, cashierStoreId, orderBelongsToCashierBranch, refreshOfflinePaidKeys, dismissPaidBillSilently, effectiveStatus]
  );

  useEffect(() => {
    handleInstantPayRef.current = handleInstantPay;
  }, [handleInstantPay]);

  /* ─── QR punch (with offline fallback) ─── */
  const handleQRPunch = useCallback(
    (rawCode) => {
      const parsed = parseQRCode(rawCode);
      if (!parsed) {
        toast.error(t('invalidQR', 'Invalid QR code format'));
        return;
      }

      const unpaidPool = visibleOrders.filter((o) => effectiveStatus(o) !== "paid");
      const found =
        resolveUniqueSerialMatch(unpaidPool, parsed.id) ||
        resolveUniqueSerialMatch(orders, parsed.id) ||
        unpaidPool.find((o) => serialMatches(parsed.id, o.billSerial || o.serialNo || o.id)) ||
        orders.find((o) => serialMatches(parsed.id, o.billSerial || o.serialNo || o.id));

      // Offline Payment modal — when Super Admin allows (online or offline)
      if (!found) {
        if (!enableOfflinePayment) {
          toast.error(`Bill "${parsed.id}" not found`);
          return;
        }
        const decoded = decodeAndVerifyQR(rawCode);
        if (decoded.valid && decoded.billId) {
          handleReceiptOfflinePay({
            billSerial: decoded.billId,
            amount: decoded.amount,
            paymentMethod: "Cash",
            qrVerified: true,
          });
          return;
        }
        if (parsed.isJson) {
          toast.error(t("offlineReceiptBadQr", "Invalid QR — cannot verify receipt"));
          return;
        }
        setOfflinePayModal({ open: true, prefilledSerial: parsed.id });
        return;
      }

      const verification = verifyHash(parsed, found);
      if (!verification.valid && verification.mismatch) {
        logCashierAction({
          action: "QR_HASH_MISMATCH",
          orderId: found.id,
          billSerial: found.billSerial,
          userId: userData?.uid || "",
          userName: userData?.displayName || "Cashier",
          storeId: found.storeId,
          amount: found.totalAmount,
          metadata: verification.mismatch,
        });
        toast.error(`QR mismatch: ${verification.reason}`, {
          icon: <Shield className="w-4 h-4 text-red-500" />,
        });
        setViewModal({ open: true, order: found });
        return;
      }

      const eff = effectiveStatus(found);
      if (eff === "paid" || isCashierOrderPaid(found)) {
        return;
      }
      if (eff === "cancelled") {
        toast.error(t('billCancelledMsg', 'This bill has been cancelled'));
        return;
      }

      if (handleInstantPayRef.current) {
        handleInstantPayRef.current(found);
      }
    },
    [orders, visibleOrders, userData, effectiveStatus, handleReceiptOfflinePay, enableOfflinePayment, t]
  );

  useEffect(() => {
    handleQRPunchRef.current = handleQRPunch;
  }, [handleQRPunch]);

  /* ═══════════════════════════════════════════════════════════════════
     MEMOIZED VALUES — 10K+ ready
  ═══════════════════════════════════════════════════════════════════ */

  const filteredOrders = useMemo(() => {
    if (activeTab === "all") {
      return visibleOrders.filter((o) => effectiveStatus(o) === "pending");
    }
    if (activeTab === "cancelled") {
      return visibleOrders.filter(isVisibleCancelledBillRow);
    }
    return visibleOrders.filter((o) => effectiveStatus(o) === activeTab);
  }, [visibleOrders, activeTab, effectiveStatus]);

  const listSource = filteredOrders;

  const billsPageCount = useMemo(
    () => Math.max(1, Math.ceil(listSource.length / billsPageSize)),
    [listSource.length, billsPageSize],
  );

  const billsPageOffset = (billsPage - 1) * billsPageSize;

  const paginatedOrders = useMemo(() => {
    const start = billsPageOffset;
    return listSource.slice(start, start + billsPageSize);
  }, [listSource, billsPageOffset, billsPageSize]);

  useEffect(() => {
    setBillsPage(1);
  }, [activeTab, searchQuery, billsPageSize]);

  useEffect(() => {
    if (billsPage > billsPageCount) setBillsPage(billsPageCount);
  }, [billsPage, billsPageCount]);

  const stats = useMemo(() => {
    let pending = 0;
    let paid = 0;
    let cancelled = 0;
    for (const o of visibleOrders) {
      if (isVisibleCancelledBillRow(o)) { cancelled += 1; continue; }
      const st = effectiveStatus(o);
      if (st === 'pending') pending += 1;
      else if (st === 'paid') paid += 1;
    }
    return { all: pending, pending, paid, cancelled };
  }, [visibleOrders, effectiveStatus]);

  const patchOrderInList = useCallback((orderId, patch) => {
    setOrders((list) => list.map((o) => (o.id === orderId ? { ...o, ...patch } : o)));
  }, []);

  const removeOrderFromList = useCallback((orderId) => {
    setOrders((list) => list.filter((o) => o.id !== orderId));
  }, []);

  const handleAcknowledgeCancelled = useCallback(async (order) => {
    const cashierId = auth?.currentUser?.uid || currentUser?.uid || userData?.uid || '';
    const cashierName = userData?.displayName || userData?.name || 'Cashier';
    const firestoreId = resolveFirestoreOrderId(order);
    removeOrderFromList(order.id);
    removeVisibleCancelledBill({ order, serial: order.billSerial || order.serialNo, billId: firestoreId, localId: order.localId });
    clearOptimisticCancelledBill({ serial: order.billSerial || order.serialNo, billId: firestoreId, localId: order.localId });
    try {
      await acknowledgeCancelledBill({
        orderId: firestoreId || order.id,
        cashierId,
        cashierName,
        storeId: cashierStoreId,
      });
      toast.success(t('cancelBillAcked', 'Cancelled bill acknowledged'));
    } catch {
      recordVisibleCancelledBill(order);
      setOrders((list) => [order, ...list]);
      toast.error(t('ackFailed', 'Could not acknowledge'));
    }
  }, [currentUser?.uid, userData, cashierStoreId, t, removeOrderFromList]);

  const handleFlagCancelled = useCallback((order) => {
    setFlagModal({ open: true, bill: order });
  }, []);

  const submitCancelledFlag = useCallback(async (reason) => {
    const order = flagModal.bill;
    if (!order) return;
    const cashierId = auth?.currentUser?.uid || currentUser?.uid || userData?.uid || '';
    const cashierName = userData?.displayName || userData?.name || 'Cashier';
    const firestoreId = resolveFirestoreOrderId(order);
    const prev = { ...order };
    removeOrderFromList(order.id);
    removeVisibleCancelledBill({ order, serial: order.billSerial || order.serialNo, billId: firestoreId, localId: order.localId });
    clearOptimisticCancelledBill({ serial: order.billSerial || order.serialNo, billId: firestoreId, localId: order.localId });
    try {
      await flagCancelledBillForSuperadmin({
        orderId: firestoreId || order.id,
        billSerial: order.billSerial || order.serialNo,
        storeId: cashierStoreId,
        cashierId,
        cashierName,
        reason,
        billData: { ...order, cashierCancelFlagReason: reason, cashierCancelFlagged: true },
      });
    } catch (err) {
      recordVisibleCancelledBill(prev);
      setOrders((list) => [{ ...prev, cashierCancelFlagged: false }, ...list]);
      throw err;
    }
  }, [flagModal.bill, currentUser?.uid, userData, cashierStoreId, removeOrderFromList, t]);

  const totalAmount = useMemo(
    () => filteredOrders.reduce((s, o) => s + getOrderDisplayTotal(o), 0),
    [filteredOrders]
  );

  const pendingPayOrders = useMemo(
    () => visibleOrders.filter((o) => effectiveStatus(o) === "pending"),
    [visibleOrders, effectiveStatus],
  );

  const openBulkPayModal = useCallback(() => {
    const pending = pendingPayOrders;
    if (!pending.length) {
      toast.error(t("noPendingBills", "No pending bills"));
      return;
    }
    setBulkSelectedIds(new Set(pending.map((o) => getCashierBulkOrderKey(o)).filter(Boolean)));
    setBulkPayOpen(true);
  }, [pendingPayOrders, t]);

  const toggleBulkSelect = useCallback((orderKey) => {
    if (!orderKey) return;
    setBulkSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(orderKey)) next.delete(orderKey);
      else next.add(orderKey);
      return next;
    });
  }, []);

  const confirmBulkPay = useCallback(() => {
    const selected = pendingPayOrders.filter((o) => bulkSelectedIds.has(getCashierBulkOrderKey(o)));
    if (!selected.length) {
      toast.error(t("selectBillsToPay", "Select at least one bill"));
      return;
    }
    setBulkPayOpen(false);
    setBulkPaying(true);
    const count = selected.length;
    toast.loading(`${t("paying", "Paying")} ${count}…`, { id: "bulk-pay-done" });

    const batchSize = count > 250 ? 24 : count > 120 ? 20 : count > 50 ? 18 : 22;
    const delayMs = count > 200 ? 20 : count > 80 ? 30 : 15;
    let finished = false;

    void runInBatches({
      items: selected,
      batchSize,
      delayMs,
      parallel: true,
      worker: (order) => Promise.resolve(handleInstantPay(order, { quiet: true })),
      onProgress: ({ completed, total }) => {
        if (!finished && completed >= total) {
          finished = true;
          toast.success(`✓ ${completed} ${t("billsPaid", "bills paid")}`, { id: "bulk-pay-done", duration: 2200 });
        }
      },
    })
      .then(() => refreshOfflinePaidKeys())
      .then(() => {
        setOrders((prev) => stripPaidFromOrders(prev));
      })
      .finally(() => {
        setBulkPaying(false);
        setBulkSelectedIds(new Set());
      });
  }, [pendingPayOrders, bulkSelectedIds, handleInstantPay, t, refreshOfflinePaidKeys, stripPaidFromOrders]);

  const bulkSelectedOrders = useMemo(
    () => pendingPayOrders.filter((o) => bulkSelectedIds.has(getCashierBulkOrderKey(o))),
    [pendingPayOrders, bulkSelectedIds],
  );

  const bulkSelectedTotal = useMemo(
    () => bulkSelectedOrders.reduce((sum, o) => sum + getOrderDisplayTotal(o), 0),
    [bulkSelectedOrders],
  );

  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const uq = searchQuery.trim().toUpperCase();
    const results = [];
    // Only search visible pending orders so paid bills never appear in search
    const pool = visibleOrders.filter((o) => effectiveStatus(o) === "pending");
    for (let i = 0; i < pool.length && results.length < SEARCH_LIMIT; i++) {
      const o = pool[i];
      const s = (o.billSerial || o.serialNo || "").toUpperCase();
      const n = (o.customer?.name || "").toUpperCase();
      const p = (o.customer?.phone || "").toUpperCase();
      if (s.includes(uq) || n.includes(uq) || p.includes(uq)) results.push(o);
    }
    return results;
  }, [searchQuery, visibleOrders, effectiveStatus]);

  const serialResults = useMemo(() => {
    if (!serialInput.trim()) return [];
    const pool = visibleOrders.filter((o) => effectiveStatus(o) !== "paid");
    return findOrdersBySerialInput(pool, serialInput, { limit: SEARCH_LIMIT });
  }, [serialInput, visibleOrders, effectiveStatus]);

  /* ─── Hotkeys ─── */
  useCashierHotkeys({
    enabled: !anyModalOpen,
    onSearch: () => {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    },
    onQRScan: () => setQrModal(true),
    onPendingTab: () => setActiveTab("pending"),
    onCancelledTab: () => setActiveTab("cancelled"),
    onRefresh: () => {
      forceRefresh();
      toast.success(t('refreshed', 'Refreshed!'), { icon: <RefreshCw className="w-4 h-4" /> });
    },
  });

  const handleLogout = useCallback(async () => {
    try {
      await signOut(auth);
      navigate("/login");
    } catch {
      toast.error(t('logoutFailed', 'Logout failed'));
    }
  }, [navigate]);

  /* Merge biller offline bills (Dexie) into cashier pending list */
  const refreshLocalPending = useCallback(async (opts = {}) => {
    const sid = cashierStoreId;
    const uid = currentUser?.uid || userData?.uid || "";
    if (!sid || !uid) return;

    const now = Date.now();
    if (!opts.force && now - lastInstantUpsertRef.current < CASHIER_INSTANT_GUARD_MS) return;
    if (!opts.force && now - lastFullRefreshRef.current < FULL_REFRESH_MIN_MS) return;
    lastFullRefreshRef.current = now;

    const applyLocalMerge = (localRows, offlineIdx) => {
      if (!localRows?.length) return;
      setOrders((prev) => {
        const cancelledKeep = dedupeBillsBySerial([
          ...prev.filter(isVisibleCancelledBillRow),
          ...loadVisibleCancelledBills().filter(isVisibleCancelledBillRow),
        ]).filter(isVisibleCancelledBillRow);
        const remote = stripPaidFromOrders(prev).filter(
          (o) => !isVisibleCancelledBillRow(o) && matchesCashierPendingQueue(o),
        );
        const merged = dedupeBillsBySerial([
          ...cancelledKeep,
          ...mergeCashierOrders(
            dedupeBillsBySerial([...localRows, ...remote]),
            localRows,
            { online: isOnline, offlinePaidIndex: offlineIdx },
          ),
        ])
          .filter((o) =>
            isVisibleCancelledBillRow(o)
            || (matchesCashierPendingQueue(o) && !isOrderInOptimisticCancelledIndex(o)),
          )
          .sort(sortOrdersByDate);
        const capped = trimCashierQueue(merged);
        persistPendingToCache(capped);
        return capped;
      });
      setLoading(false);
    };

    const offlineIdx = offlinePaidIndexRef.current;
    applyLocalMerge(loadLocalPendingStackFast(storeListenIds, uid, offlineIdx), offlineIdx);

    try {
      const freshIdx = await refreshOfflinePaidKeys();
      const localRows = await loadLocalPendingStack(
        storeListenIds,
        uid,
        sid,
        freshIdx,
        { online: isOnline },
      );
      if (localRows.length) {
        applyLocalMerge(localRows, freshIdx);
      } else if (isOnline) {
        const unsynced = await getUnsyncedOrdersForCashier(storeListenIds);
        setOrders((prev) => {
          const cancelledKeep = dedupeBillsBySerial([
            ...prev.filter(isVisibleCancelledBillRow),
            ...loadVisibleCancelledBills().filter(isVisibleCancelledBillRow),
          ]).filter(isVisibleCancelledBillRow);
          const remote = stripPaidFromOrders(prev).filter(
            (o) => !isVisibleCancelledBillRow(o) && matchesCashierPendingQueue(o),
          );
          return dedupeBillsBySerial([
            ...cancelledKeep,
            ...mergeCashierOrders(remote, unsynced, {
              online: true,
              offlinePaidIndex: freshIdx,
            }),
          ])
            .filter((o) =>
              isVisibleCancelledBillRow(o)
              || (matchesCashierPendingQueue(o) && !isOrderInOptimisticCancelledIndex(o)),
            )
            .sort(sortOrdersByDate);
        });
      }
    } catch (err) {
      console.error("[Cashier] Local pending refresh:", err);
    }
  }, [cashierStoreId, userData?.uid, currentUser?.uid, isOnline, refreshOfflinePaidKeys, stripPaidFromOrders, storeListenIds, persistPendingToCache]);

  refreshLocalPendingRef.current = refreshLocalPending;

  const ingestInstantCashierOrder = useCallback((data) => {
    if (!data) return;
    const rawOrder = data.order || data;
    if (!rawOrder || (!rawOrder.billSerial && !rawOrder.serialNo && !rawOrder.localId)) return;
    const serial = getBillSerialKey(rawOrder);
    const now = Date.now();
    if (serial) {
      const last = recentInstantSerialsRef.current.get(serial) || 0;
      if (now - last < 60) return;
      recentInstantSerialsRef.current.set(serial, now);
    }
    upsertLiveRef.current(normalizeInstantCashierOrder(rawOrder));
  }, []);

  const patchOrderSyncedFields = useCallback((patch) => {
    if (!patch) return;
    const serial = getBillSerialKey(patch);
    const localId = String(patch.localId || '').trim();
    if (!serial && !localId) return;
    let found = false;
    setOrders((prev) => {
      const next = prev.map((o) => {
        const match = (serial && getBillSerialKey(o) === serial)
          || (localId && (o.localId === localId || o.id === localId));
        if (!match) return o;
        found = true;
        return {
          ...o,
          id: patch.firebaseId || o.id,
          firebaseId: patch.firebaseId || o.firebaseId,
          syncStatus: patch.syncStatus || o.syncStatus,
          synced: patch.syncStatus === 'synced' || patch.synced === true,
          isLocalOnly: false,
        };
      });
      return found ? next : prev;
    });
    if (!found && serial && cashierStoreId) {
      findCashierBillBySerial(cashierStoreId, serial)
        .then((bill) => { if (bill) upsertLiveRef.current(bill); })
        .catch(() => {});
    }
  }, [cashierStoreId]);

  const ingestInstantRef = useRef(ingestInstantCashierOrder);
  ingestInstantRef.current = ingestInstantCashierOrder;
  const cashierSidRef = useRef(cashierStoreId);
  cashierSidRef.current = cashierStoreId;
  const dismissPaidRef = useRef(dismissPaidBillSilently);
  dismissPaidRef.current = dismissPaidBillSilently;
  const refreshPaidKeysRef = useRef(refreshOfflinePaidKeys);
  refreshPaidKeysRef.current = refreshOfflinePaidKeys;

  useEffect(() => {
    if (!manualSerialMode) return;
    const t = setTimeout(() => serialInputRef.current?.focus(), 300);
    return () => clearTimeout(t);
  }, [manualSerialMode]);

  /* Purge cashier_offline IDB synced rows older than 24h */
  useEffect(() => {
    import('../../services/offlinePaymentService').then(({ clearSyncedRecords }) => {
      void clearSyncedRecords(1);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    const onSyncDone = async () => {
      const sid = cashierStoreId;
      if (sid) {
        await reconcilePaidBillsAcrossDevices(sid).catch(() => {});
        await refreshOfflinePaidKeys();
      }
      refreshLocalPending();
      if (refreshReviewQueueRef.current) refreshReviewQueueRef.current();
    };
    window.addEventListener('cashier-sync-complete', onSyncDone);
    return () => window.removeEventListener('cashier-sync-complete', onSyncDone);
  }, [forceRefresh, refreshLocalPending, cashierStoreId, refreshOfflinePaidKeys]);

  /* ═══════════════════════════════════════════════════════════════════
     KEYBOARD HANDLERS
  ═══════════════════════════════════════════════════════════════════ */
  const handleSearchKeyDown = useCallback(
    (e) => {
      if (searchResults.length === 0) return;
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSearchActiveIndex((p) => (p < searchResults.length - 1 ? p + 1 : p));
          break;
        case "ArrowUp":
          e.preventDefault();
          setSearchActiveIndex((p) => (p > 0 ? p - 1 : -1));
          break;
        case "Enter":
          e.preventDefault();
          if (searchActiveIndex >= 0 && searchResults[searchActiveIndex]) {
            setViewModal({ open: true, order: searchResults[searchActiveIndex] });
            setSearchQuery("");
            setShowSearchDropdown(false);
            setSearchActiveIndex(-1);
          }
          break;
        case "Escape":
          e.preventDefault();
          setShowSearchDropdown(false);
          setSearchActiveIndex(-1);
          searchInputRef.current?.blur();
          break;
        default:
          break;
      }
    },
    [searchResults, searchActiveIndex]
  );

  const handleSerialKeyDown = useCallback(
    (e) => {
      if (e.key === "Enter" && serialInput.trim()) {
        e.preventDefault();
        const pool = visibleOrders.filter((o) => effectiveStatus(o) !== "paid");
        const unique = resolveUniqueSerialMatch(pool, serialInput);
        if (unique && handleInstantPayRef.current) {
          handleInstantPayRef.current(unique);
          setSerialInput("");
          setShowSerialDropdown(false);
          return;
        }
        if (serialResults.length === 0) {
          if (enableOfflinePayment) {
            refreshLocalPending();
            setOfflinePayModal({ open: true, prefilledSerial: serialInput.trim().toUpperCase() });
            setSerialInput("");
            setShowSerialDropdown(false);
            return;
          }
          if (handleQRPunchRef.current) handleQRPunchRef.current(serialInput);
          setSerialInput("");
          setShowSerialDropdown(false);
          return;
        }
      }
      if (e.key === "Enter" && !serialInput.trim()) return;
      if (serialResults.length === 0) return;
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSerialActiveIndex((p) => (p < serialResults.length - 1 ? p + 1 : p));
          break;
        case "ArrowUp":
          e.preventDefault();
          setSerialActiveIndex((p) => (p > 0 ? p - 1 : -1));
          break;
        case "Enter":
          e.preventDefault();
          if (serialActiveIndex >= 0 && serialResults[serialActiveIndex]) {
            if (handleInstantPayRef.current) handleInstantPayRef.current(serialResults[serialActiveIndex]);
            setSerialInput("");
            setShowSerialDropdown(false);
            setSerialActiveIndex(-1);
          }
          break;
        case "Escape":
          e.preventDefault();
          setShowSerialDropdown(false);
          setSerialActiveIndex(-1);
          serialInputRef.current?.blur();
          break;
        default:
          break;
      }
    },
    [serialResults, serialActiveIndex, serialInput, refreshLocalPending, visibleOrders, effectiveStatus, enableOfflinePayment]
  );

  /* ═══════════════════════════════════════════════════════════════════
     USEEFFECTS
  ═══════════════════════════════════════════════════════════════════ */

  useEffect(() => {
    if (authUserData) setUserData(authUserData);
  }, [authUserData]);

  const prevBranchRef = useRef(cashierBranchId);
  useEffect(() => {
    const prev = prevBranchRef.current;
    prevBranchRef.current = cashierBranchId;
    if (!prev || !cashierBranchId || prev === cashierBranchId) return;
    setOrders([]);
    setReviewQueue([]);
    paidToastShownRef.current.clear();
    payingSerialsRef.current.clear();
    forceRefresh();
  }, [cashierBranchId, forceRefresh]);

  /* Reset list when logged-in user changes (Google / profile switch) */
  const prevUidRef = useRef(null);
  useEffect(() => {
    const uid = currentUser?.uid || userData?.uid || null;
    if (prevUidRef.current && uid && prevUidRef.current !== uid) {
      setOrders([]);
      paidToastShownRef.current.clear();
      payingSerialsRef.current.clear();
      clearCashierOfflineCache(cashierStoreId, prevUidRef.current).catch(() => {});
      if (cashierStoreId && uid) clearCashierOfflineCache(cashierStoreId, uid).catch(() => {});
      forceRefresh();
    }
    prevUidRef.current = uid;
  }, [currentUser?.uid, userData?.uid, cashierStoreId, forceRefresh]);

  useEffect(() => {
    const t = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const prev = prevOnlineRef.current;
    prevOnlineRef.current = isOnline;
    if (prev === isOnline) return;

    if (isOnline) {
      (async () => {
        toast.success(t('backOnlineSync', 'Back online — Syncing...'), {
          icon: <Wifi className="w-4 h-4 text-emerald-500" />,
          duration: 3000,
        });
        const sid = cashierStoreId;
        const uid = currentUser?.uid || userData?.uid || "";
        if (sid) {
          await flushPendingPaymentsToFirebase().catch(() => {});
          await reconcilePaidBillsAcrossDevices(sid, { force: true }).catch(() => {});
          await reconcileLocalOrdersWithFirebase(sid).catch(() => {});
          await refreshOfflinePaidKeys();
          await refreshLocalPending();
        }
        try {
          await flushAuditQueue();
          await runPaymentSync();
          if (refreshReviewQueueRef.current) await refreshReviewQueueRef.current();
        } catch (err) {
          console.error("[Cashier] Online sync:", err);
        }
      })();
      return;
    }

    (async () => {
      const sid = cashierStoreId;
      const uid = currentUser?.uid || userData?.uid || "";
      if (sid) {
        try {
          const cached = await idbLoad(sid, uid);
          const unsynced = await getUnsyncedOrdersForCashier(storeListenIds);
          setOrders(mergeCashierOrders(cached, unsynced, { online: false }));
        } catch (err) {
          console.error("[Cashier] Offline local merge:", err);
        }
      }
      toast(t('offlineMode', 'Offline mode'), {
        icon: <WifiOff className="w-4 h-4 text-red-400" />,
        duration: 3000,
      });
    })();
  }, [isOnline, cashierStoreId, userData?.uid, currentUser?.uid, t, refreshLocalPending]);

  useEffect(() => {
    if (!userData?.uid) return;
    void ensureDbReady();

    const handleOrdersMessage = (ev) => {
      const { type } = ev.data || {};
      const sid = cashierSidRef.current;

      if (type === "NEW_LOCAL_ORDER") {
        ingestInstantRef.current(ev.data);
        return;
      }
      if (type === "ORDER_SYNCED") {
        patchOrderSyncedFields(ev.data);
        return;
      }
      if (type === "BILL_SAVED_INSTANT" && ev.data?.billSerial) {
        ingestInstantRef.current({
          order: {
            localId: ev.data.localId,
            billSerial: ev.data.billSerial || ev.data.serialNo,
            serialNo: ev.data.serialNo || ev.data.billSerial,
            storeId: ev.data.storeId || sid,
            customer: { name: ev.data.customerName || "Walk-in" },
            totalAmount: ev.data.totalAmount,
            grandTotal: ev.data.totalAmount,
            itemCount: ev.data.itemCount,
            billerName: ev.data.billerName,
            isLocalOnly: true,
            syncStatus: "pending",
            paymentStatus: "pending_payment",
            status: "pending",
            sendToCashier: true,
            isActiveOrder: true,
            createdAt: new Date(ev.data.timestamp || Date.now()).toISOString(),
          },
        });
        return;
      }
      if (type === "ORDER_SAVED_OFFLINE" && ev.data?.order) {
        ingestInstantRef.current({ order: ev.data.order });
        return;
      }
      if (type === "SYNC_COMPLETE") {
        const serial = ev.data?.billSerial || ev.data?.serialNo;
        if (serial && sid) {
          if (ev.data?.order) {
            upsertLiveRef.current(ev.data.order);
          } else {
            findCashierBillBySerial(sid, serial)
              .then((bill) => { if (bill) upsertLiveRef.current(bill); })
              .catch(() => {});
          }
        }
        queueMicrotask(() => refreshLocalPendingRef.current?.({ force: true }));
        runPaymentSync().catch(() => {});
        if (refreshReviewQueueRef.current) refreshReviewQueueRef.current();
        return;
      }
      if (type === "SYNC_BATCH_COMPLETE") {
        queueMicrotask(() => refreshLocalPendingRef.current?.({ force: true }));
        runPaymentSync().catch(() => {});
        if (refreshReviewQueueRef.current) refreshReviewQueueRef.current();
      }
    };

    const handleBillingMessage = (ev) => {
      const { type, billSerial, amount } = ev.data || {};
      if (type === "ORDER_SYNCED") {
        patchOrderSyncedFields(ev.data);
        return;
      }
      if (type === "CASHIER_NEW_PENDING") {
        ingestInstantRef.current(ev.data);
        return;
      }
      if (type === "BILLER_PAYMENT_COMPLETE" && billSerial) {
        const serial = String(billSerial).trim().toUpperCase();
        dismissPaidRef.current({ billSerial: serial });
        showPaymentSuccessToast(amount, serial);
        queueMicrotask(() => refreshPaidKeysRef.current());
      }
    };

    const handleInstantEvent = (ev) => {
      if (ev?.detail) ingestInstantRef.current(ev.detail);
    };

    const handleStorage = (e) => {
      if (e.key !== INSTANT_PENDING_LS_KEY || !e.newValue) return;
      try {
        ingestInstantRef.current(JSON.parse(e.newValue));
      } catch { /* ignore */ }
    };

    let ch;
    let billingCh;
    try {
      ch = new BroadcastChannel(BROADCAST_CHANNELS.ORDERS);
      ch.onmessage = handleOrdersMessage;
    } catch { /* ignore */ }
    try {
      billingCh = new BroadcastChannel('aone_pos_billing');
      billingCh.onmessage = handleBillingMessage;
    } catch { /* ignore */ }

    window.addEventListener(INSTANT_ORDER_EVENT, handleInstantEvent);
    window.addEventListener('storage', handleStorage);
    const stopPoller = startInstantOrderPoller((payload) => ingestInstantRef.current(payload));

    try {
      const raw = localStorage.getItem(INSTANT_PENDING_LS_KEY);
      if (raw) ingestInstantRef.current(JSON.parse(raw));
    } catch { /* ignore */ }

    return () => {
      ch?.close();
      billingCh?.close();
      window.removeEventListener(INSTANT_ORDER_EVENT, handleInstantEvent);
      window.removeEventListener('storage', handleStorage);
      stopPoller?.();
    };
  }, [userData?.uid, patchOrderSyncedFields]);

  /* Shop LAN live poll — biller on another PC (same branch) */
  useEffect(() => {
    if (!cashierStoreId || !userData) return;
    let cancelled = false;

    const pollShop = async () => {
      if (Date.now() - lastInstantUpsertRef.current < CASHIER_INSTANT_GUARD_MS) return;
      const configured = isShopApiConfigured();
      if (!configured) {
        if (!cancelled) {
          setShopServerMissing(false);
          setManualSerialMode(false);
        }
        return;
      }
      const reachable = await isShopApiReachable();
      if (!cancelled) {
        const missing = !reachable && !isOnline;
        setShopServerMissing(missing);
        setManualSerialMode(missing);
      }
      if (!reachable) return;
      try {
        const { shopApiGetPendingOrders } = await import('../../services/shopApiService.js');
        const shop = await shopApiGetPendingOrders(cashierStoreId);
        if (!cancelled && shop?.length) upsertLivePendingOrders(shop);
      } catch {
        if (!cancelled && !isOnline) {
          setShopServerMissing(true);
          setManualSerialMode(true);
        }
      }
    };

    pollShop();
    const id = setInterval(pollShop, CASHIER_SHOP_LIVE_POLL_MS);
    return () => { cancelled = true; clearInterval(id); };
  }, [cashierStoreId, userData, upsertLivePendingOrders, isOnline]);

  /* ⚡ Firebase live onSnapshot — pending bills realtime (primary online path) */
  useEffect(() => {
    if (!isOnline || !storeListenIds.length || !userData?.uid) return;

    const unsub = subscribeCashierPendingOrders({
      storeIds: storeListenIds,
      limitCount: CASHIER_FULL_LIMIT,
      onDelta: (rows) => {
        if (!rows?.length) return;
        lastListenerDeltaRef.current = Date.now();
        const filtered = rows.filter((o) => {
          // Cross-PC Firebase docs are never local echoes — always accept.
          if (!o?.isLocalOnly && !o?.offlinePending) return true;
          const sk = getBillSerialKey(o);
          const last = recentInstantSerialsRef.current.get(sk) || 0;
          return !sk || Date.now() - last > 700;
        });
        if (filtered.length) upsertLiveRef.current(filtered);
      },
      onRemoved: (rows) => {
        for (const o of rows || []) {
          if (matchesCashierPendingQueue(o)) continue;
          const serial = getBillSerialKey(o);
          if (serial) dismissPaidRef.current({ billSerial: serial, ...o });
        }
      },
      onError: (err) => {
        console.warn('[Cashier] live pending listener:', err?.message || err);
      },
    });

    return () => { try { unsub(); } catch { /* ignore */ } };
  }, [isOnline, storeListenKey, userData?.uid]);

  /* Firebase backup poll — fallback if listener/cache lag */
  useEffect(() => {
    if (!isOnline || !storeListenIds.length || !userData) return;
    let cancelled = false;

    const pollFirebase = async () => {
      if (Date.now() - lastListenerDeltaRef.current < CASHIER_LISTENER_HEALTH_SKIP_MS) return;
      try {
        const rows = await fetchCashierPendingOrders({
          storeIds: storeListenIds,
          limitCount: CASHIER_FULL_LIMIT,
          sorted: true,
        });
        if (!cancelled && rows?.length) upsertLivePendingOrders(rows);
      } catch { /* ignore */ }
    };

    pollFirebase();
    const id = setInterval(pollFirebase, CASHIER_FIREBASE_LIVE_POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') pollFirebase();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [isOnline, storeListenIds, userData, upsertLivePendingOrders]);

  /* Poll Dexie — offline / missed broadcast fallback only */
  useEffect(() => {
    if (!userData) return;
    const dexiePollMs = isOnline ? CASHIER_DEXIE_POLL_ONLINE_MS : CASHIER_DEXIE_POLL_OFFLINE_MS;

    const tick = () => {
      if (Date.now() - lastInstantUpsertRef.current < CASHIER_INSTANT_GUARD_MS) return;
      refreshLocalPending();
    };

    tick();
    const id = setInterval(tick, dexiePollMs);
    return () => clearInterval(id);
  }, [isOnline, userData, refreshLocalPending]);

  /* Refresh cloud paid index so new PWA / profile never shows paid bills as pending */
  useEffect(() => {
    if (!isOnline || !cashierStoreId) return;
    const tick = () => {
      refreshOfflinePaidKeys()
        .then(() => setOrders((prev) => stripPaidRef.current(prev)))
        .catch(() => {});
    };
    tick();
    const id = setInterval(tick, CASHIER_PAID_INDEX_POLL_MS);
    return () => clearInterval(id);
  }, [isOnline, cashierStoreId, refreshOfflinePaidKeys]);

  useEffect(() => {
    if (!currentUser || !cashierStoreId) {
      setStoreData(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const store = await getStoreById(cashierStoreId);
        if (!cancelled && store) setStoreData(store);
      } catch (err) {
        console.error("[Cashier] Store fetch:", err);
      }
    })();
    return () => { cancelled = true; };
  }, [currentUser, cashierStoreId]);

  /* ✅ Firebase listener — instant cache + parallel server fetch */
  useEffect(() => {
    if (!currentUser) { setLoading(false); return; }
    const activeUser = effectiveUser;
    if (!activeUser) {
      const t = setTimeout(() => setLoading(false), 2000);
      return () => clearTimeout(t);
    }
    if (!cashierBranchId) {
      setOrders([]);
      setLoading(false);
      return;
    }

    const uid = currentUser?.uid || activeUser?.uid || "";
    const aliases = aliasesRef.current;
    const storeIds = storeListenIds;
    const primarySid = queryStoreId || cashierStoreId || cashierBranchId;

    let cancelled = false;
    let applyTimer = null;
    let cacheWriteTimer = null;
    let unsubPaidKeys = () => {};

    const shouldKeep = (o) => {
      if (!orderMatchesStore(o, storeIds)) return false;
      if (o.isDeleted || o.deleted) return false;
      if (isOrderInOptimisticCancelledIndex(o)) {
        if (isCashierOrderCancelled(o)) {
          clearOptimisticCancelledBill({
            serial: getBillSerialKey(o),
            billId: o.id,
            localId: o.localId,
          });
          return isVisibleCancelledBillRow(o);
        }
        return false;
      }
      if (isCashierOrderCancelled(o)) {
        clearOptimisticCancelledBill({
          serial: getBillSerialKey(o),
          billId: o.id,
          localId: o.localId,
        });
        return isVisibleCancelledBillRow(o);
      }
      if (isOrderInOfflinePaidIndex(o, offlinePaidIndexRef.current)) return false;
      const serial = normalizeSerial(o.billSerial || o.serialNo || o.id);
      if (serial && payingSerialsRef.current.has(serial)) return false;
      return matchesCashierPendingQueue(o);
    };

    const debouncedPersistOrders = (merged) => {
      clearTimeout(cacheWriteTimer);
      cacheWriteTimer = setTimeout(() => {
        if (cancelled) return;
        const pendingOnly = (merged || []).filter(
          (o) => matchesCashierPendingQueue(o) && !isOrderInOptimisticCancelledIndex(o),
        );
        lsSavePendingBills(pendingOnly, storeIds, uid, offlinePaidIndexRef.current);
        idbSave(pendingOnly, primarySid, uid);
      }, 50);
    };

    const applyFirebaseRows = (firebaseRows, { mergeWithPrev = false } = {}) => {
      if (cancelled) return;
      const stripPaid = (list) => stripPaidRef.current(list);
      const filtered = (firebaseRows || []).filter(shouldKeep).sort(sortOrdersByDate);
      const visibleCancelledSnapshot = loadVisibleCancelledBills().filter(isVisibleCancelledBillRow);
      setOrders((prev) => {
        const cancelledKeep = dedupeBillsBySerial([
          ...prev.filter(isVisibleCancelledBillRow),
          ...visibleCancelledSnapshot,
        ]).filter(isVisibleCancelledBillRow);
        const prevPending = prev.filter((o) =>
          (matchesCashierPendingQueue(o) || isVisibleCancelledBillRow(o))
          && !isOrderInOptimisticCancelledIndex(o),
        );
        const remoteSource = dedupeBillsBySerial([
          ...cancelledKeep,
          ...filtered,
          ...(mergeWithPrev ? prev : prevPending),
        ]).sort(sortOrdersByDate);
        let merged = stripPaid(
          mergeCashierOrders(remoteSource, unsyncedRef.current, {
            online: isOnline,
            offlinePaidIndex: offlinePaidIndexRef.current,
          }),
        );
        // Never drop pinned cancelled rows during Firebase sync (Ack/Flag only removes them)
        if (cancelledKeep.length) {
          merged = dedupeBillsBySerial([...cancelledKeep, ...merged]).sort(sortOrdersByDate);
        }
        const mergedIds = new Set(merged.map((o) => o.id).filter(Boolean));
        const mergedSerials = new Set(merged.map((o) => getBillSerialKey(o)).filter(Boolean));
        const orphanCancelled = prev.filter((o) =>
          isVisibleCancelledBillRow(o)
          && !mergedIds.has(o.id)
          && !mergedSerials.has(getBillSerialKey(o)),
        );
        if (orphanCancelled.length) {
          merged = dedupeBillsBySerial([...orphanCancelled, ...merged]).sort(sortOrdersByDate);
        }
        const orphanLocalPending = prev.filter((o) =>
          (o.isLocalOnly || o.offlinePending)
          && matchesCashierPendingQueue(o)
          && !isOrderInOptimisticCancelledIndex(o)
          && !mergedIds.has(o.id)
          && !mergedSerials.has(getBillSerialKey(o)),
        );
        if (orphanLocalPending.length) {
          merged = dedupeBillsBySerial([...orphanLocalPending, ...merged]).sort(sortOrdersByDate);
        }
        debouncedPersistOrders(merged);
        return merged;
      });
      setLoading(false);
    };

    const scheduleApply = (rows, opts = {}) => {
      if (cancelled) return;
      const list = rows || [];
      // Never wipe the queue with an empty Firebase snapshot (offline / listener not ready).
      if (!list.length && !opts.allowEmpty && !opts.mergeWithPrev) {
        setLoading(false);
        return;
      }
      // Apply instantly - no delays
      applyFirebaseRows(list, opts);
    };

    const applyPaidStrip = (idx) => {
      if (cancelled || !idx) return;
      offlinePaidIndexRef.current = mergePaidBillKeys(offlinePaidIndexRef.current, idx);
      setOfflinePaidKeysTick((n) => n + 1);
      setOrders((prev) => stripPaidRef.current(prev));
      scrubLsPendingPaidBills(storeIds, uid, offlinePaidIndexRef.current);
      scrubCashierCachePaidBills(primarySid, uid, offlinePaidIndexRef.current).catch(() => {});
    };

    const boot = async () => {
      offlinePaidIndexRef.current = mergePaidBillKeys(
        loadOptimisticPaidBillKeys(),
        offlinePaidIndexRef.current,
      );

      // Phase 1 — local stack first (sync cache, never wait for cloud/Dexie)
      if (!cancelled) {
        const paidIdx = offlinePaidIndexRef.current;
        const visibleCancelled = loadVisibleCancelledBills().filter(isVisibleCancelledBillRow);
        const fastLocal = loadLocalPendingStackFast(storeIds, uid, paidIdx);
        const instantStack = dedupeBillsBySerial([...visibleCancelled, ...fastLocal]);
        if (instantStack.length > 0) {
          scheduleApply(instantStack, { mergeWithPrev: false });
        }
        getUnsyncedOrdersForCashier(storeIds)
          .then((u) => { unsyncedRef.current = u || []; })
          .catch(() => {});
        void loadLocalPendingStack(storeIds, uid, primarySid, paidIdx, { online: isOnline })
          .then((localRows) => {
            if (!cancelled && localRows.length > 0) {
              scheduleApply(localRows, { mergeWithPrev: true });
            }
          })
          .catch(() => {});
      }

      if (isOnline && primarySid) {
        unsubPaidKeys = subscribeCloudPaidBillKeys(primarySid, (idx) => {
          if (!cancelled) {
            offlinePaidIndexRef.current = mergePaidBillKeys(offlinePaidIndexRef.current, idx);
            setOfflinePaidKeysTick((n) => n + 1);
            setOrders((prev) => stripPaidRef.current(prev));
            scrubLsPendingPaidBills(storeIds, uid, offlinePaidIndexRef.current);
            scrubCashierCachePaidBills(primarySid, uid, offlinePaidIndexRef.current).catch(() => {});
          }
        });
      }

      // Phase 2 — paid index strip (background, does not block first paint)
      try {
        const [localIdx, cloudIdx] = await Promise.all([
          getOfflinePaidBillKeys(),
          loadPaidBillIndex(primarySid, aliases),
        ]);
        if (!cancelled) {
          applyPaidStrip(mergePaidBillKeys(localIdx, cloudIdx));
          paidIndexReadyRef.current = true;
        }
      } catch {
        paidIndexReadyRef.current = true;
      }

      getUnsyncedOrdersForCashier(storeIds).then((u) => {
        unsyncedRef.current = u || [];
      }).catch(() => {});

      if (isOnline) {
        fetchCashierPendingOrders({ storeIds, limitCount: CASHIER_INITIAL_LIMIT, sorted: true })
          .then(async (rows) => {
            let pending = rows;
            if (!pending?.length) {
              try {
                const fallback = await fetchOrdersFallback({
                  storeIds,
                  limitCount: CASHIER_INITIAL_LIMIT,
                });
                pending = fallback.filter((o) => matchesCashierPendingQueue(o));
              } catch { /* ignore */ }
            }
            if (!cancelled && pending?.length) upsertLiveRef.current(pending);
            if (!cancelled) setLoading(false);
          })
          .catch(() => { if (!cancelled) setLoading(false); });

        void (async () => {
          try {
            await flushPendingPaymentsToFirebase();
            const result = await reconcileCashierBranch(storeIds, { force: false });
            if (!cancelled && result?.paidIndex) applyPaidStrip(result.paidIndex);
            const [pendingFull, cancelledRows] = await Promise.all([
              fetchCashierPendingOrders({ storeIds, limitCount: CASHIER_FULL_LIMIT, sorted: true }),
              fetchCashierCancelledOrders({ storeIds, limitCount: 300 }),
            ]);
            if (!cancelled) {
              scheduleApply(
                [...(pendingFull || []), ...(cancelledRows || [])],
                { mergeWithPrev: true, allowEmpty: pendingFull?.length === 0 },
              );
            }
          } catch { /* background sync */ }
        })();
      } else {
        try {
          const idx = await loadPaidBillIndex(primarySid, aliases);
          if (!cancelled) applyPaidStrip(idx);
        } catch { /* ignore */ }

        try {
          const localRows = await loadLocalPendingStack(storeIds, uid, primarySid, offlinePaidIndexRef.current, { online: false });
          if (localRows.length > 0) scheduleApply(localRows, { mergeWithPrev: false });
        } catch { /* ignore */ }
      }
    };

    boot();

    const unsyncedPoll = setInterval(() => {
      getUnsyncedOrdersForCashier(storeIds)
        .then((u) => { unsyncedRef.current = u || []; })
        .catch(() => {});
    }, 45000);

    const loadingTimeout = setTimeout(() => {
      if (!cancelled) setLoading(false);
    }, 100);

    return () => {
      cancelled = true;
      clearTimeout(applyTimer);
      clearTimeout(cacheWriteTimer);
      clearTimeout(loadingTimeout);
      clearInterval(unsyncedPoll);
      try { unsubPaidKeys(); } catch { /* ignore */ }
    };
  }, [currentUser, effectiveUser?.uid, refreshKey, isOnline, storeListenKey, cashierBranchId, loadPaidBillIndex, storeListenIds, queryStoreId, cashierStoreId]);

  /* Drop bills that gained an offline payment record (Firebase may still show pending_payment). */
  useEffect(() => {
    setOrders((prev) => stripPaidFromOrders(prev));
  }, [offlinePaidKeysTick, stripPaidFromOrders]);

  /* PWA tab focus — purge paid bills from stale cache (Chromebook). */
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      const sid = cashierStoreId;
      const now = Date.now();
      const skipCloudReconcile = now - visibilityReconcileLastRef.current < VISIBILITY_RECONCILE_COOLDOWN_MS;
      if (!skipCloudReconcile) visibilityReconcileLastRef.current = now;
      (async () => {
        if (sid && isOnline && !skipCloudReconcile) await reconcilePaidBillsAcrossDevices(sid).catch(() => {});
        await refreshOfflinePaidKeys();
        setOrders((prev) => stripPaidFromOrders(prev));
      })().catch(() => {});
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refreshOfflinePaidKeys, stripPaidFromOrders, cashierStoreId, isOnline]);

  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;
    const ch = new BroadcastChannel(BROADCAST_CHANNELS.BILLS);
    const onPaid = (ev) => {
      const data = ev?.data || {};
      if (data?.type !== 'CASHIER_PAID') return;
      if (data.storeId && cashierStoreId && data.storeId !== cashierStoreId) return;
      if (data.serial) {
        const serial = getBillSerialKey({ billSerial: data.serial }) || normalizeSerial(data.serial).replace(/^#+/, '');
        paidToastShownRef.current.add(serial);
        const idx = offlinePaidIndexRef.current;
        idx.serials?.add(serial);
        if (data.billId) idx.billIds?.add(String(data.billId));
        setOfflinePaidKeysTick((n) => n + 1);
        setOrders((prev) => prev.filter((o) => getBillSerialKey(o) !== serial));
      }
      refreshOfflinePaidKeys().catch(() => {});
    };
    ch.addEventListener('message', onPaid);
    return () => {
      ch.removeEventListener('message', onPaid);
      ch.close();
    };
  }, [cashierStoreId, refreshOfflinePaidKeys]);

  useEffect(() => {
    const i = setInterval(() => {
      if (refreshReviewQueueRef.current) refreshReviewQueueRef.current();
    }, 30000);
    return () => clearInterval(i);
  }, []);

  /* USB Scanner */
  useEffect(() => {
    const h = (e) => {
      const tag = document.activeElement?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;
      if (anyModalOpen) return;
      if (e.key === "Enter") {
        const b = qrBufferRef.current.trim();
        if (b.length >= 1 && handleQRPunchRef.current) handleQRPunchRef.current(b);
        qrBufferRef.current = "";
        return;
      }
      if (e.key.length === 1) {
        qrBufferRef.current += e.key;
        clearTimeout(qrTimerRef.current);
        qrTimerRef.current = setTimeout(() => { qrBufferRef.current = ""; }, 150);
      }
    };
    window.addEventListener("keydown", h);
    return () => {
      window.removeEventListener("keydown", h);
      clearTimeout(qrTimerRef.current);
    };
  }, [anyModalOpen]);

  /* Dynamic list height */
  useEffect(() => {
    const updateHeight = () => {
      if (listContainerRef.current) {
        const rect = listContainerRef.current.getBoundingClientRect();
        const available = window.innerHeight - rect.top - 30;
        setListHeight(Math.max(300, available));
      }
    };
    updateHeight();
    window.addEventListener("resize", updateHeight);
    return () => window.removeEventListener("resize", updateHeight);
  }, [filteredOrders.length]);

  useEffect(() => {
    setShowSearchDropdown(searchQuery.trim().length > 0 && searchFocused);
  }, [searchQuery, searchFocused]);

  useEffect(() => {
    setShowSerialDropdown(serialInput.trim().length > 0 && serialFocused);
  }, [serialInput, serialFocused]);

  useEffect(() => setSearchActiveIndex(-1), [searchQuery]);
  useEffect(() => setSerialActiveIndex(-1), [serialInput]);

  /* ─── Formatters ─── */
  const fmtTime = (d) =>
    d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const fmtDate = (d) =>
    d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  const fmtTS = useCallback((ts) => {
    const ms = parseTS(ts);
    if (!ms) return "—";
    return new Date(ms).toLocaleString("en-US", {
      month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
    });
  }, []);

  const getStatusColors = useCallback((status) => {
    if (status === "deleted") return { borderLeft: "border-l-orange-500" };
    if (status === "cancelled") return { borderLeft: "border-l-red-500" };
    if (status === "paid") return { borderLeft: "border-l-emerald-500" };
    return { borderLeft: "border-l-amber-500" };
  }, []);

  const StatusBadge = useCallback(
    ({ status }) => {
      const badges = {
        pending: isDark ? "bg-amber-500/20 text-amber-400 border-amber-500/30" : "bg-amber-100 text-amber-700 border-amber-200",
        paid: isDark ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" : "bg-emerald-100 text-emerald-700 border-emerald-200",
        cancelled: isDark ? "bg-red-500/20 text-red-400 border-red-500/30" : "bg-red-100 text-red-700 border-red-200",
        deleted: isDark ? "bg-orange-500/20 text-orange-400 border-orange-500/30" : "bg-orange-100 text-orange-700 border-orange-200",
      };
      return (
        <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold border ${badges[status] || badges.pending}`}>
          {status?.toUpperCase()}
        </span>
      );
    },
    [isDark]
  );

  const timeAgo = (ts) => {
    const ms = parseTS(ts);
    if (!ms) return "";
    const s = Math.floor((Date.now() - ms) / 1000);
    if (s < 60) return `${s}s ago`;
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    return `${Math.floor(s / 86400)}d ago`;
  };

  const virtualListData = useMemo(
    () => ({
      orders: paginatedOrders,
      bills: paginatedOrders,
      isDark, text, subText, mutedText, accent,
      effectiveStatus, fmtTS, getStatusColors, StatusBadge,
      setViewModal, setEditModal, setCancelModal, handleInstantPay,
      t, compactList, fontScale, pageOffset: billsPageOffset,
      getRowPayment, setRowPayment, paymentOptions,
      onSaveExtraDiscount: handleQuickExtraDiscount,
      savingDiscountId,
      getMaxExtra,
      discountRule: cashierDiscRule,
      rowMode: activeTab === "cancelled" ? "cancelled" : "pending",
      onAcknowledge: handleAcknowledgeCancelled,
      onFlag: handleFlagCancelled,
      currentCashierId: currentUser?.uid || userData?.uid,
    }),
    [paginatedOrders, isDark, text, subText, mutedText, accent,
      effectiveStatus, fmtTS, getStatusColors, StatusBadge, handleInstantPay, t, compactList, fontScale, billsPageOffset,
      getRowPayment, setRowPayment, paymentOptions, handleQuickExtraDiscount, savingDiscountId,
      getMaxExtra, cashierDiscRule, activeTab,
      handleAcknowledgeCancelled, handleFlagCancelled, currentUser?.uid, userData?.uid]
  );

  if (branchMissing) {
    return (
      <div className={`min-h-screen ${bg} flex flex-col items-center justify-center gap-3 px-6 text-center`}>
        <AlertTriangle className="w-12 h-12 text-amber-500" />
        <h2 className={`text-xl font-bold ${text}`}>{t('branchRequiredTitle', 'Branch not assigned')}</h2>
        <p className={`max-w-md text-sm ${subText}`}>
          {t('branchRequiredBody', 'Your cashier account must be linked to a branch (A One or J1). Contact Super Admin.')}
        </p>
      </div>
    );
  }

  if (loading && orders.length === 0)
    return (
      <div className={`min-h-screen ${bg} ${bgOverlay} flex items-center justify-center`}>
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="text-center">
          <div className="relative">
            <Loader2 className="w-12 h-12 text-amber-500 animate-spin mx-auto mb-4" />
            <div className="absolute inset-0 w-12 h-12 mx-auto bg-amber-500/20 rounded-full blur-2xl animate-pulse" />
          </div>
          <p className={`${text} text-base font-bold tracking-wide`}>{t('loading', 'Loading...')}</p>
        </motion.div>
      </div>
    );

  /* ═══════════════════════════════════════════════════════════════════
     RENDER
  ═══════════════════════════════════════════════════════════════════ */
  return (
    <div className={`min-h-screen ${bg} ${text} relative`} dir={isRTL ? 'rtl' : 'ltr'} style={{ fontSize: `${cashierFontSize}px` }}>
      <div className={`fixed inset-0 ${bgOverlay} pointer-events-none`} />

      {/* ALERTS */}
      <AnimatePresence>
        {shopServerMissing && !isOnline && (
          <motion.div
            initial={{ y: -50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -50, opacity: 0 }}
            transition={springConfig}
            className="relative z-50 bg-gradient-to-r from-amber-700 via-orange-600 to-amber-700 text-white text-center text-[11px] py-1.5 font-bold flex items-center justify-center gap-2"
          >
            <WifiOff className="w-3 h-3" />
            {t('shopServerMissing', 'Shop Server nahi mila — Manual Serial Mode')}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {!isOnline && (
          <motion.div
            initial={{ y: -50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -50, opacity: 0 }}
            transition={springConfig}
            className="relative z-50 bg-gradient-to-r from-red-600 via-red-500 to-red-600 text-white text-center text-[11px] py-1.5 font-bold flex items-center justify-center gap-2"
          >
            <WifiOff className="w-3 h-3" />
            {t('offlineModeBanner', 'Offline Mode — Payments saved locally · Auto-sync when online')}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {reviewQueueMeta.waitingBillSync.length > 0 && (
          <motion.button
            initial={{ y: -50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -50, opacity: 0 }}
            transition={springConfig}
            onClick={() => setShowReviewPanel(true)}
            className="relative z-40 w-full bg-gradient-to-r from-blue-600 via-indigo-500 to-blue-600 text-white text-[11px] py-1.5 font-bold flex items-center justify-center gap-2"
          >
            <Loader2 className="w-3 h-3 animate-spin" />
            <span>
              {reviewQueueMeta.waitingBillSync.length}{' '}
              {reviewQueueMeta.waitingBillSync.length !== 1
                ? t('paymentsSyncing', 'payments syncing — waiting for biller')
                : t('paymentSyncing', 'payment syncing — waiting for biller')}
            </span>
            <span className="underline opacity-90">{t('clickHere', 'Click here')}</span>
          </motion.button>
        )}
      </AnimatePresence>

      {/* NAVBAR */}
      <nav className={`sticky top-0 z-40 ${glassBg} shadow-[0_4px_30px_rgba(0,0,0,0.1)]`}>
        <div className="px-3 lg:px-5 py-2.5">
          <div className="flex items-center justify-between gap-3">
            <motion.div initial={{ x: -20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} className="flex items-center gap-2.5">
              <div className="relative">
                <div className="w-9 h-9 bg-gradient-to-br from-amber-400 via-amber-500 to-orange-600 rounded-xl flex items-center justify-center shadow-[0_4px_20px_rgba(245,158,11,0.4)]">
                  <Store className="text-white w-4 h-4" />
                </div>
                <div className="absolute inset-0 w-9 h-9 bg-amber-500 rounded-xl blur-xl opacity-30" />
              </div>
              <div className="leading-tight min-w-0">
                <h1 className={`font-extrabold text-sm tracking-tight truncate ${text}`}>
                  {branchDisplayName || t('cashierTitle', 'POS Cashier')}
                </h1>
                <p className={`text-[10px] ${subText} flex items-center gap-1 font-semibold flex-wrap`}>
                  <Store className="w-2.5 h-2.5 text-amber-500 shrink-0" />
                  <span>{t('common.branch', 'Branch')}: {branchDisplayName || '—'}</span>
                  {branchShortCode ? (
                    <span className={`px-1 py-0.5 rounded font-mono text-[9px] ${isDark ? 'bg-amber-500/15 text-amber-300' : 'bg-amber-100 text-amber-800'}`}>
                      {branchShortCode}
                    </span>
                  ) : null}
                </p>
                {branchCity ? (
                  <p className={`text-[9px] ${mutedText} flex items-center gap-1`}>
                    <MapPin className="w-2 h-2 text-amber-500 shrink-0" />
                    {branchCity}
                  </p>
                ) : null}
              </div>
            </motion.div>

            <motion.div
              initial={{ y: -10, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              className={`hidden md:flex items-center gap-2 px-3 py-1 rounded-lg ${isDark ? "bg-white/[0.03]" : "bg-black/[0.03]"} border ${isDark ? "border-white/[0.06]" : "border-black/[0.04]"}`}
            >
              <Clock className="w-3 h-3 text-amber-500" />
              <div className="text-right leading-tight">
                <p className={`text-xs font-bold ${accent} tabular-nums`}>{fmtTime(currentTime)}</p>
                <p className={`text-[9px] ${mutedText}`}>{fmtDate(currentTime)}</p>
              </div>
            </motion.div>

            <div className="flex items-center gap-1.5">
              <div
                className={`hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold border ${
                  isOnline
                    ? isDark ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30" : "bg-emerald-50 text-emerald-700 border-emerald-200"
                    : isDark ? "bg-red-500/10 text-red-400 border-red-500/30" : "bg-red-50 text-red-700 border-red-200"
                }`}
              >
                {isOnline ? (<><Wifi className="w-2.5 h-2.5" /> {t('liveBadge', 'LIVE')}</>) : (<><WifiOff className="w-2.5 h-2.5" /> {t('offlineBadge', 'OFFLINE')}</>)}
              </div>

              {enableOfflinePayment && (
                <motion.button
                  whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.92 }}
                  onClick={() => { refreshLocalPending(); setOfflinePayModal({ open: true, prefilledSerial: "" }); }}
                  className={`hidden sm:flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-white text-[10px] font-extrabold shadow-lg transition-all ${
                    isOnline
                      ? "bg-gradient-to-br from-emerald-500 to-green-600 shadow-emerald-500/40 hover:shadow-emerald-500/60"
                      : "bg-gradient-to-br from-blue-500 to-blue-600 shadow-blue-500/40 hover:shadow-blue-500/60"
                  }`}
                  title={t('offlinePayBySerial', 'Pay bill by serial — online or offline')}
                >
                  {isOnline ? <Hash className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
                  {t('offlinePayBySerialBtn', 'PAY BY SERIAL')}
                </motion.button>
              )}

              <button
                onClick={forceRefresh}
                className={`p-1.5 rounded-lg ${glassCard} hover:border-blue-500/50 transition-all active:scale-90`}
                title={t('refreshBtn', 'Refresh')}
              >
                <RefreshCw className={`w-3.5 h-3.5 text-blue-500 ${loading ? "animate-spin" : ""}`} />
              </button>

              <div className={`hidden md:flex items-center gap-1.5 px-2 py-1 rounded-lg border ${isDark ? "bg-amber-500/10 border-amber-500/20" : "bg-amber-50 border-amber-200/50"}`}>
                <div className="w-5 h-5 bg-gradient-to-br from-amber-400 to-orange-500 rounded-full flex items-center justify-center shadow-md">
                  <User className="text-white w-3 h-3" />
                </div>
                <p className={`text-[10px] font-extrabold ${text}`}>
                  {(userData?.displayName || userData?.name || "Cashier").split(" ")[0]}
                </p>
              </div>

              <LanguageSwitcher className="p-1.5 text-[10px]" />

              <button onClick={toggleTheme}
                className={`p-1.5 rounded-lg ${glassCard} hover:border-amber-500/50 transition-all active:scale-90`}
              >
                {isDark ? <Sun className="w-3.5 h-3.5 text-amber-400" /> : <Moon className="w-3.5 h-3.5 text-gray-700" />}
              </button>
              <button onClick={handleLogout}
                className="p-1.5 rounded-lg bg-red-500/10 border border-red-500/30 hover:bg-red-500/20 transition-all active:scale-90"
              >
                <LogOut className="w-3.5 h-3.5 text-red-500" />
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* MAIN */}
      <div className={`relative px-3 lg:px-5 ${compactList ? "py-2 space-y-2" : "py-2.5 space-y-2.5"} max-w-[1600px] mx-auto`}>
        <button
          onClick={() => setShowStats((v) => !v)}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg ${glassCard} hover:border-amber-500/40 transition-all text-xs font-bold ${text} active:scale-95`}
        >
          <motion.div animate={{ rotate: showStats ? 180 : 0 }}>
            <ChevronDown className="w-3 h-3" />
          </motion.div>
          {t('statsToggle', 'Stats')}
          <span className={`text-[10px] px-2 py-0.5 rounded-md font-extrabold ${isDark ? "bg-amber-500/20 text-amber-400" : "bg-amber-100 text-amber-700"}`}>
            {stats.pending} {t('pendingCount', 'pending')}
          </span>
          <span className={`text-[10px] px-2 py-0.5 rounded-md font-extrabold ${isDark ? "bg-blue-500/20 text-blue-400" : "bg-blue-100 text-blue-700"}`}>
            {orders.length.toLocaleString()} {t('totalCount', 'total')}
          </span>
        </button>

        <AnimatePresence>
          {showStats && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={springConfig}
              className="grid grid-cols-2 md:grid-cols-4 gap-2"
            >
              {[
                { label: t('statTotal', 'Total'), val: stats.all, gradient: "from-blue-500 to-blue-600" },
                { label: t('statPending', 'Pending'), val: stats.pending, gradient: "from-amber-500 to-orange-500" },
                { label: t('statPaid', 'Paid'), val: stats.paid, gradient: "from-emerald-500 to-green-500" },
                { label: t('statCancelled', 'Cancelled'), val: stats.cancelled, gradient: "from-red-500 to-rose-500" },
              ].map((s) => (
                <div
                  key={s.label}
                  className={`${glassCard} rounded-xl px-3 py-2 flex items-center justify-between hover:border-amber-500/50 transition-all`}
                >
                  <p className={`text-xs ${subText} font-bold uppercase tracking-wider`}>{s.label}</p>
                  <p className={`text-lg font-black bg-gradient-to-br ${s.gradient} bg-clip-text text-transparent tabular-nums`}>
                    {s.val.toLocaleString()}
                  </p>
                </div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {/* SEARCH + SERIAL */}
        <div
          className="grid grid-cols-1 md:grid-cols-2 gap-2.5 relative"
          style={{ zIndex: anyModalOpen ? 10 : 110 }}
        >
          {/* Search */}
          <div className={`${glassCard} rounded-xl p-2 relative`} style={{ zIndex: 110 }}>
            <div className="relative">
              <Search className={`absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 ${searchFocused ? "text-blue-500" : mutedText} transition-colors z-10`} />
              <input
                ref={searchInputRef}
                type="text"
                placeholder={t('searchBillsPh', 'Search bills, name, phone...')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setSearchFocused(false)}
                onKeyDown={handleSearchKeyDown}
                className={`w-full pl-9 pr-9 py-2.5 rounded-lg text-xs font-semibold transition-all ${inputBg} ${
                  searchFocused ? "border-blue-500/60 ring-4 ring-blue-500/15" : ""
                } focus:outline-none`}
              />
              {searchQuery && (
                <button
                  onClick={() => { setSearchQuery(""); setShowSearchDropdown(false); }}
                  className={`absolute right-3 top-1/2 -translate-y-1/2 ${subText} hover:text-red-500 z-10`}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}

              <AnimatePresence>
                {showSearchDropdown && (
                  <motion.div
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.15 }}
                    className={`absolute top-[calc(100%+8px)] left-0 right-0 ${dropdownSolidBg} rounded-xl shadow-[0_25px_80px_rgba(0,0,0,0.5)] max-h-80 overflow-y-auto`}
                    style={{ zIndex: anyModalOpen ? 5 : 9999 }}
                  >
                    <div className={`sticky top-0 px-3 py-1.5 ${isDark ? "bg-[#13101a]" : "bg-white"} border-b ${isDark ? "border-white/[0.04]" : "border-black/[0.04]"} flex items-center gap-2 text-[10px] ${subText}`}>
                      <Keyboard className="w-3 h-3" />
                      <span>{t('navUpDown', '↑↓ Navigate')}</span><span>•</span><span>{t('enterSelect', 'Enter Select')}</span><span>•</span><span>{t('escClose', 'Esc Close')}</span>
                    </div>

                    {searchResults.length === 0 ? (
                      <div className="px-4 py-8 text-center">
                        <AlertTriangle className="w-10 h-10 text-red-400 mx-auto mb-3" />
                        <p className={`text-sm font-bold ${text}`}>Not Found</p>
                        <p className={`text-xs ${subText} mt-1`}>Try different keyword</p>
                      </div>
                    ) : (
                      searchResults.map((bill, i) => (
                        <button
                          key={bill.id}
                          onClick={() => {
                            setViewModal({ open: true, order: bill });
                            setSearchQuery("");
                            setShowSearchDropdown(false);
                          }}
                          className={`w-full text-left px-3 py-3 border-b ${isDark ? "border-white/[0.04]" : "border-black/[0.04]"} last:border-b-0 transition-all flex items-center justify-between ${
                            searchActiveIndex === i ? (isDark ? "bg-blue-500/20" : "bg-blue-50") : "hover:bg-blue-500/5"
                          }`}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={`text-xs font-extrabold ${accent}`}>#{bill.billSerial || bill.serialNo}</span>
                              <StatusBadge status={effectiveStatus(bill)} />
                            </div>
                            <p className={`text-xs ${text} font-medium truncate mt-0.5`}>{bill.customer?.name || t('walkInCustomer', 'Walk-in')}</p>
                            <p className={`text-[10px] ${mutedText} mt-0.5`}>{bill.items?.length || 0} items • {timeAgo(getOrderDisplayTs(bill))}</p>
                          </div>
                          <p className={`text-sm font-black ${accent} tabular-nums ml-2`}>
                            Rs.{getOrderDisplayTotal(bill).toLocaleString()}
                          </p>
                        </button>
                      ))
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Serial */}
          <div className={`${glassCard} rounded-xl p-2 relative`} style={{ zIndex: 110 }}>
            <div className="relative flex gap-2">
              <div className="relative flex-1">
                <Hash className={`absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 ${serialFocused ? "text-amber-500" : mutedText} transition-colors z-10`} />
                <input
                  ref={serialInputRef}
                  type="text"
                  placeholder={t('scanSerialPh', 'Scan barcode or type serial...')}
                  value={serialInput}
                  onChange={(e) => setSerialInput(e.target.value)}
                  onFocus={() => setSerialFocused(true)}
                  onBlur={() => setSerialFocused(false)}
                  onKeyDown={handleSerialKeyDown}
                  className={`w-full pl-9 pr-9 py-2.5 rounded-lg text-xs font-semibold transition-all ${inputBg} ${
                    manualSerialMode
                      ? "border-2 border-amber-500 ring-4 ring-amber-500/25 animate-pulse"
                      : serialFocused
                        ? "border-amber-500/60 ring-4 ring-amber-500/15"
                        : ""
                  } focus:outline-none`}
                />
                {serialInput && (
                  <button
                    onClick={() => { setSerialInput(""); setShowSerialDropdown(false); }}
                    className={`absolute right-3 top-1/2 -translate-y-1/2 ${subText} hover:text-red-500 z-10`}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <button
                onClick={() => setQrModal(true)}
                className="px-3 rounded-lg bg-gradient-to-br from-amber-400 via-amber-500 to-orange-600 text-white shadow-[0_4px_15px_rgba(245,158,11,0.4)] hover:shadow-[0_6px_25px_rgba(245,158,11,0.6)] transition-all active:scale-95"
                title={t('cameraScanner', 'Camera Scanner')}
              >
                <ScanLine className="w-3.5 h-3.5" />
              </button>

              <AnimatePresence>
                {showSerialDropdown && (
                  <motion.div
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.15 }}
                    className={`absolute top-[calc(100%+8px)] left-0 right-0 ${dropdownSolidBg} rounded-xl shadow-[0_25px_80px_rgba(0,0,0,0.5)] max-h-80 overflow-y-auto`}
                    style={{ zIndex: anyModalOpen ? 5 : 9999 }}
                  >
                    <div className={`sticky top-0 px-3 py-1.5 ${isDark ? "bg-[#13101a]" : "bg-white"} border-b ${isDark ? "border-white/[0.04]" : "border-black/[0.04]"} flex items-center gap-2 text-[10px] ${subText}`}>
                      <Keyboard className="w-3 h-3" />
                      <span>↑↓ Navigate</span><span>•</span><span>Enter to Pay</span><span>•</span><span>Esc Close</span>
                    </div>

                    {serialResults.length === 0 ? (
                      <div className="px-4 py-8 text-center">
                        <AlertTriangle className="w-10 h-10 text-red-400 mx-auto mb-3" />
                        <p className={`text-sm font-bold ${text}`}>No Pending Bill</p>
                        <p className={`text-xs ${subText} mt-1`}>
                          {enableOfflinePayment ? t('pressEnterOffline', 'Press Enter — opens Offline Payment') : t('tryDifferentSerial', 'Try different serial')}
                        </p>
                      </div>
                    ) : (
                      serialResults.map((bill, i) => (
                        <button
                          key={bill.id}
                          onClick={() => {
                            if (handleInstantPayRef.current) handleInstantPayRef.current(bill);
                            setSerialInput("");
                            setShowSerialDropdown(false);
                          }}
                          className={`w-full text-left px-3 py-3 border-b ${isDark ? "border-white/[0.04]" : "border-black/[0.04]"} last:border-b-0 transition-all flex items-center justify-between ${
                            serialActiveIndex === i ? (isDark ? "bg-emerald-500/20" : "bg-emerald-50") : "hover:bg-emerald-500/5"
                          }`}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={`text-xs font-extrabold ${accent}`}>#{bill.billSerial || bill.serialNo}</span>
                              <StatusBadge status={effectiveStatus(bill)} />
                            </div>
                            <p className={`text-xs ${text} font-medium mt-0.5`}>{bill.customer?.name || t('walkInCustomer', 'Walk-in')}</p>
                          </div>
                          <div className="flex items-center gap-2 ml-2">
                            <p className={`text-sm font-black ${accent} tabular-nums`}>
                              Rs.{getOrderDisplayTotal(bill).toLocaleString()}
                            </p>
                            <Zap className="w-4 h-4 text-emerald-500" />
                          </div>
                        </button>
                      ))
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>

        {/* TABS */}
        <div className="relative" style={{ zIndex: 10 }}>
          <CashierDeletedFlagsPanel
            storeIds={storeListenIds.length ? storeListenIds : [cashierStoreId]}
            title="Cashier Flag Alerts"
            description="Cancelled bill par cashier ne flag reason bheja — Super Admin / Manager ko bhi dikhega."
            canDismiss={false}
            className="mx-2 mb-2"
          />
          <FilterTabs activeTab={activeTab} setActiveTab={setActiveTab} stats={stats} isDark={isDark} />
        </div>

        {/* MOBILE FAB */}
        {enableOfflinePayment && (
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => { refreshLocalPending(); setOfflinePayModal({ open: true, prefilledSerial: "" }); }}
            className={`sm:hidden fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full text-white flex items-center justify-center ${
              isOnline
                ? "bg-gradient-to-br from-emerald-500 to-green-600 shadow-[0_8px_30px_rgba(16,185,129,0.5)]"
                : "bg-gradient-to-br from-blue-500 to-blue-600 shadow-[0_8px_30px_rgba(59,130,246,0.5)]"
            }`}
            title={isOnline ? t('manualBill', 'Manual Bill') : t('offlineBill', 'Offline Bill')}
          >
            {isOnline ? <Plus className="w-6 h-6" /> : <WifiOff className="w-6 h-6" />}
          </motion.button>
        )}

        {/* BILLS LIST */}
        <div
          ref={listContainerRef}
          className={`${glassCard} rounded-xl overflow-hidden relative`}
          style={{ zIndex: 5 }}
        >
          <div className={`px-2 py-1.5 border-b ${isDark ? "border-white/[0.06]" : "border-black/[0.06]"} flex items-center justify-between gap-2 flex-wrap`}>
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-md bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-md">
                <Receipt className="w-3.5 h-3.5 text-white" />
              </div>
              <h2 className={`font-extrabold ${text} capitalize tracking-tight`} style={{ fontSize: `${Math.round(13 * fontScale)}px` }}>{activeTab} Bills</h2>
              <span className={`px-2 py-0.5 rounded-md font-extrabold ${isDark ? "bg-amber-500/15 text-amber-400" : "bg-amber-100 text-amber-700"}`} style={{ fontSize: `${Math.round(11 * fontScale)}px` }}>
                {listSource.length.toLocaleString()}
              </span>
              {loading && orders.length > 0 && activeTab !== 'cancelled' && (
                <Loader2 className="w-3.5 h-3.5 text-blue-400 animate-spin" title={t('syncingBills', 'Syncing bills…')} />
              )}
            </div>
            <div className="flex items-center gap-2">
              {payAllEnabled && stats.pending > 0 && (activeTab === "pending" || activeTab === "all") && (
                <motion.button
                  whileTap={{ scale: 0.96 }}
                  onClick={openBulkPayModal}
                  disabled={bulkPaying}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-extrabold text-white shadow-md transition-all disabled:opacity-60 ${
                    bulkPaying
                      ? "bg-emerald-600/70"
                      : "bg-gradient-to-r from-emerald-500 to-green-600 hover:shadow-emerald-500/40"
                  }`}
                  title={t("payAllPending", "Pay all pending bills at once")}
                >
                  {bulkPaying ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
                  {t("payAllPendingBtn", "Pay All")} ({stats.pending})
                </motion.button>
              )}
              {listSource.length > 0 && (
                <p className={`font-extrabold ${accent} tabular-nums`} style={{ fontSize: `${Math.round(14 * fontScale)}px` }}>
                  Rs.{totalAmount.toLocaleString()}
                </p>
              )}
            </div>
          </div>

          {listSource.length === 0 ? (
            <div className="p-12 text-center">
              <div className={`w-16 h-16 mx-auto mb-3 rounded-2xl flex items-center justify-center ${isDark ? "bg-white/[0.03]" : "bg-black/[0.03]"}`}>
                <Receipt className={`w-8 h-8 ${mutedText}`} />
              </div>
              <p className={`text-sm font-bold ${text}`}>
                {activeTab === "cancelled"
                  ? t('noCancelledBills', 'No cancelled bills')
                  : `No ${activeTab} Bills`}
              </p>
              <p className={`text-[10px] ${subText} mt-1`}>
                {activeTab === "cancelled"
                  ? t('cancelledBillsHint', 'Sirf cashier ne jo bill cancel ki — asli serial, cashier aur reason yahan')
                  : 'Bills will appear here when created'}
              </p>
            </div>
          ) : (
            <>
              <VirtualList
                height={listHeight}
                rowCount={paginatedOrders.length}
                rowHeight={activeTab === "cancelled" ? Math.max(cashierRowHeight, 56) : Math.max(cashierRowHeight, DEFAULT_ROW_HEIGHT, 88)}
                width="100%"
                rowProps={virtualListData}
                rowComponent={BillRow}
                overscanCount={5}
                className="scrollbar-thin"
              />
              {listSource.length > 0 && (
                <PaginationBar
                  page={billsPage}
                  totalPages={billsPageCount}
                  totalItems={listSource.length}
                  pageSize={billsPageSize}
                  onPageChange={setBillsPage}
                  pageSizeOptions={BILLS_PAGE_SIZE_OPTIONS}
                  onPageSizeChange={setBillsPageSize}
                  className={isDark ? 'border-white/[0.06]' : 'border-black/[0.06]'}
                />
              )}
            </>
          )}
        </div>
      </div>

      {/* MODALS */}
      <AnimatePresence>
        {viewModal.open && (
          <ViewBillModal
            order={viewModal.order}
            isDark={isDark}
            userData={userData}
            storeData={storeData}
            effectiveStatusFn={effectiveStatus}
            onClose={() => setViewModal({ open: false, order: null })}
            onPayment={(o) => { setViewModal({ open: false, order: null }); handleInstantPay(o); }}
            onEdit={(o) => { setViewModal({ open: false, order: null }); setEditModal({ open: true, order: o }); }}
            onCancel={(o) => { setViewModal({ open: false, order: null }); setCancelModal({ open: true, order: o }); }}
          />
        )}
        {editModal.open && (
          <EditBillModal
            order={editModal.order}
            isDark={isDark}
            userData={userData}
            storeData={storeData}
            onClose={() => setEditModal({ open: false, order: null })}
            onComplete={handleEditComplete}
          />
        )}
        {editPrintOrder && (
          <InvoicePrint
            key={`edit-print-${editPrintOrder.billSerial || editPrintOrder.serialNo || editPrintOrder.id}`}
            {...buildInvoicePrintProps({
              order: editPrintOrder,
              store: storeData,
              onClose: handleEditPrintClose,
              settings,
              extra: { isReprint: false, directPrint: true, autoClose: true },
            })}
          />
        )}
        {cancelModal.open && (
          <CancelBillModal
            order={cancelModal.order}
            isDark={isDark}
            userData={userData}
            onClose={() => setCancelModal({ open: false, order: null })}
            onCancelled={handleBillCancelled}
          />
        )}
        {qrModal && (
          <QRScannerModal
            isDark={isDark}
            orders={orders}
            onResult={(code) => { setQrModal(false); if (handleQRPunchRef.current) handleQRPunchRef.current(code); }}
            onClose={() => setQrModal(false)}
          />
        )}
        {offlinePayModal.open && enableOfflinePayment && (
          <OfflinePaymentModal
            isDark={isDark}
            storeId={cashierStoreId}
            userData={userData}
            orders={orders}
            prefilledSerial={offlinePayModal.prefilledSerial}
            effectiveStatus={effectiveStatus}
            onRefreshPending={refreshLocalPending}
            onClose={() => setOfflinePayModal({ open: false, prefilledSerial: "" })}
            onPayPending={(order, paymentMethod) => {
              handleInstantPay({ ...order, paymentType: paymentMethod });
              setOfflinePayModal({ open: false, prefilledSerial: "" });
            }}
            onPayReceipt={handleReceiptOfflinePay}
          />
        )}
        {showReviewPanel && (
          <ManualReviewPanel
            isDark={isDark}
            userData={userData}
            cashierView
            onClose={() => setShowReviewPanel(false)}
            onRefresh={() => refreshReviewQueueRef.current && refreshReviewQueueRef.current()}
            storeId={cashierStoreId}
            storeAliases={cashierStoreAliases}
          />
        )}
        {bulkPayOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] flex items-center justify-center p-4"
          >
            <div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => !bulkPaying && setBulkPayOpen(false)}
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 16 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 16 }}
              className={`relative w-full max-w-lg ${glassCard} rounded-2xl shadow-2xl overflow-hidden`}
              onClick={(e) => e.stopPropagation()}
            >
              <div className={`flex items-center justify-between px-5 py-3 border-b ${isDark ? "border-white/[0.08]" : "border-black/[0.06]"}`}>
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 bg-emerald-500/20 rounded-xl flex items-center justify-center">
                    <Zap className="text-emerald-500 w-5 h-5" />
                  </div>
                  <div>
                    <h2 className={`font-bold text-sm ${text}`}>{t("bulkPayTitle", "Pay Selected Bills")}</h2>
                    <p className={`text-[10px] ${subText}`}>
                      {t("bulkPayConfirm", "Are you sure? Selected bills will be marked paid.")}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setBulkPayOpen(false)}
                  disabled={bulkPaying}
                  className={`p-1.5 rounded-lg ${subText} hover:text-red-500 disabled:opacity-50`}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className={`px-5 py-2 flex items-center justify-between gap-2 border-b ${isDark ? "border-white/[0.06] bg-amber-500/10" : "border-black/[0.06] bg-amber-50"}`}>
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />
                  <p className={`text-[11px] font-semibold ${text}`}>
                    {bulkSelectedOrders.length} / {pendingPayOrders.length} {t("selected", "selected")}
                    {bulkSelectedTotal > 0 && (
                      <span className={`ml-2 ${accent}`}>Rs.{bulkSelectedTotal.toLocaleString()}</span>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setBulkSelectedIds(new Set(pendingPayOrders.map((o) => getCashierBulkOrderKey(o)).filter(Boolean)))}
                    className={`px-2 py-0.5 rounded text-[10px] font-bold ${isDark ? "bg-white/10 hover:bg-white/15" : "bg-black/5 hover:bg-black/10"} ${text}`}
                  >
                    {t("selectAll", "Select All")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setBulkSelectedIds(new Set())}
                    className={`px-2 py-0.5 rounded text-[10px] font-bold ${isDark ? "bg-white/10 hover:bg-white/15" : "bg-black/5 hover:bg-black/10"} ${text}`}
                  >
                    {t("clearAll", "Clear")}
                  </button>
                </div>
              </div>

              <div className="max-h-[50vh] overflow-y-auto px-3 py-2 space-y-1">
                {pendingPayOrders.map((order) => {
                  const orderKey = getCashierBulkOrderKey(order);
                  const selected = bulkSelectedIds.has(orderKey);
                  const serial = order.billSerial || order.serialNo || order.id;
                  return (
                    <button
                      key={orderKey}
                      type="button"
                      onClick={() => toggleBulkSelect(orderKey)}
                      className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left transition-colors ${
                        selected
                          ? isDark ? "bg-emerald-500/15 border border-emerald-500/30" : "bg-emerald-50 border border-emerald-200"
                          : isDark ? "bg-white/[0.03] border border-transparent hover:bg-white/[0.06]" : "bg-black/[0.02] border border-transparent hover:bg-black/[0.04]"
                      }`}
                    >
                      {selected
                        ? <CheckSquare className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                        : <Square className={`w-4 h-4 flex-shrink-0 ${mutedText}`} />}
                      <div className="flex-1 min-w-0">
                        <p className={`text-xs font-bold truncate ${text}`}>#{serial}</p>
                        <p className={`text-[10px] truncate ${subText}`}>{order.customer?.name || "Walk-in"}</p>
                      </div>
                      <p className={`text-xs font-extrabold tabular-nums ${accent}`}>
                        Rs.{getOrderDisplayTotal(order).toLocaleString()}
                      </p>
                    </button>
                  );
                })}
              </div>

              <div className={`flex items-center justify-end gap-2 px-5 py-3 border-t ${isDark ? "border-white/[0.08]" : "border-black/[0.06]"}`}>
                <button
                  type="button"
                  onClick={() => setBulkPayOpen(false)}
                  disabled={bulkPaying}
                  className={`px-4 py-2 rounded-xl text-xs font-bold ${isDark ? "bg-white/10 hover:bg-white/15" : "bg-black/5 hover:bg-black/10"} ${text} disabled:opacity-50`}
                >
                  {t("cancel", "Cancel")}
                </button>
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  type="button"
                  onClick={confirmBulkPay}
                  disabled={bulkPaying || bulkSelectedOrders.length === 0}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-extrabold text-white bg-gradient-to-r from-emerald-500 to-green-600 shadow-md disabled:opacity-50"
                >
                  {bulkPaying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                  {t("paySelected", "Pay Selected")} ({bulkSelectedOrders.length})
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
        {flagModal.open && flagModal.bill && (
          <DeletedBillFlagModal
            bill={flagModal.bill}
            isDark={isDark}
            onClose={() => setFlagModal({ open: false, bill: null })}
            onSubmit={submitCancelledFlag}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

export default memo(CashierDashboard);