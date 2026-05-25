// src/components/cashier/CashierDashboard.jsx
// ✅ PREMIUM v7.3 — Fix: effectiveStatus + dualMode approved flow
// 🔧 FIX-C-04: syncStatus vs paymentStatus confusion fixed
// 🔧 FIX-C-05: dualMode approved bills now show as pending for cashier

import {
  useState, useEffect, useCallback, useMemo, useRef, memo,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../context/ThemeContext";
import {
  collection, query, where, onSnapshot, orderBy, limit,
  doc, getDoc, updateDoc, addDoc, serverTimestamp,
} from "firebase/firestore";
import {
  Search, Sun, Moon, LogOut, Clock, XCircle, User, Eye, Edit3,
  X, Zap, AlertTriangle, ChevronDown, MapPin,
  Store, Receipt, Hash, Wifi, WifiOff, ScanLine,
  Loader2, Shield, FileWarning, Sparkles, Keyboard, RefreshCw,
} from "lucide-react";
import { signOut } from "firebase/auth";
import { useNavigate } from "react-router-dom";
import { toast } from "react-hot-toast";
import { db, auth } from "../../services/firebase";

import ViewBillModal from "../../components/cashier/ViewBillModal";
import CancelBillModal from "../../components/cashier/CancelModal";
import EditBillModal from "../../components/cashier/EditBillModal";
import QRScannerModal from "../../components/cashier/QRScannerModal";
import FilterTabs from "../../components/cashier/FilterTabs";
import ManualReviewPanel from "../../components/cashier/ManualReviewPanel";

import { logCashierAction, flushAuditQueue } from "../../services/cashierAuditService";
import { parseQRCode, verifyHash } from "../../services/qrHashService";
import {
  saveOfflinePayment,
  getPendingOfflinePayments,
  markOfflinePaymentSynced,
  moveToManualReview,
  getManualReviewQueue,
} from "../../services/offlinePaymentService";
import { useCashierHotkeys } from "../../hooks/useCashierHotkeys";
import { useSettings } from "../../context/SettingsContext";

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

const idbSave = async (bills) => {
  try {
    const d = await openIDB();
    d.transaction(IDB_S, "readwrite").objectStore(IDB_S).put({ id: "s", bills, at: Date.now() });
  } catch {}
};

const idbLoad = async () => {
  try {
    const d = await openIDB();
    return new Promise((r) => {
      const q = d.transaction(IDB_S, "readonly").objectStore(IDB_S).get("s");
      q.onsuccess = (e) => r(e.target.result?.bills || []);
      q.onerror = () => r([]);
    });
  } catch {
    return [];
  }
};

const PAGE_SIZE = 50;

const springConfig = {
  type: "spring",
  damping: 25,
  stiffness: 300,
};

const CashierDashboard = () => {
  const { isDark, toggleTheme } = useTheme();
  const { user: currentUser, userData: authUserData } = useAuth();
  const navigate = useNavigate();

  /* ─── STATE ─── */
  const [userData, setUserData] = useState(authUserData);
  const [storeData, setStoreData] = useState(null);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [showStats, setShowStats] = useState(false);

  const [activeTab, setActiveTab] = useState("pending");
  const [page, setPage] = useState(1);

  const [reviewQueue, setReviewQueue] = useState([]);
  const [showReviewPanel, setShowReviewPanel] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [searchNotFound, setSearchNotFound] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const [searchActiveIndex, setSearchActiveIndex] = useState(-1);
  const searchInputRef = useRef(null);

  const [serialInput, setSerialInput] = useState("");
  const [serialResults, setSerialResults] = useState([]);
  const [showSerialResults, setShowSerialResults] = useState(false);
  const [serialNotFound, setSerialNotFound] = useState(false);
  const [serialFocused, setSerialFocused] = useState(false);
  const [serialActiveIndex, setSerialActiveIndex] = useState(-1);
  const serialInputRef = useRef(null);

  const qrBufferRef = useRef("");
  const qrTimerRef = useRef(null);

  const [viewModal, setViewModal] = useState({ open: false, order: null });
  const [editModal, setEditModal] = useState({ open: false, order: null });
  const [cancelModal, setCancelModal] = useState({ open: false, order: null });
  const [qrModal, setQrModal] = useState(false);

  const handleInstantPayRef = useRef(null);
  const handleQRPunchRef = useRef(null);
  const refreshReviewQueueRef = useRef(null);
  const syncOfflinePaymentsRef = useRef(null);

  const [refreshKey, setRefreshKey] = useState(0);

  const anyModalOpen =
    viewModal.open || editModal.open || cancelModal.open || qrModal || showReviewPanel;

  /* ─── THEME CLASSES ─── */
  const bg = isDark ? "bg-[#08060a]" : "bg-[#f4f4f7]";
  const bgOverlay = isDark
    ? "bg-[radial-gradient(ellipse_at_top,rgba(245,158,11,0.08),transparent_70%),radial-gradient(ellipse_at_bottom,rgba(99,102,241,0.04),transparent_70%)]"
    : "bg-[radial-gradient(ellipse_at_top,rgba(245,158,11,0.06),transparent_70%),radial-gradient(ellipse_at_bottom_left,rgba(99,102,241,0.05),transparent_60%)]";
  const glassBg = isDark
    ? "bg-[#13101a]/70 backdrop-blur-2xl border border-white/[0.06]"
    : "bg-white/70 backdrop-blur-2xl border border-black/[0.04]";
  const glassCard = isDark
    ? "bg-gradient-to-br from-[#1a1424]/80 to-[#13101a]/60 backdrop-blur-xl border border-white/[0.08] shadow-[0_8px_30px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.05)]"
    : "bg-gradient-to-br from-white/80 to-white/60 backdrop-blur-xl border border-black/[0.06] shadow-[0_8px_30px_rgba(0,0,0,0.08),inset_0_1px_0_rgba(255,255,255,0.8)]";
  const text = isDark ? "text-gray-50" : "text-gray-900";
  const subText = isDark ? "text-gray-400" : "text-gray-600";
  const mutedText = isDark ? "text-gray-500" : "text-gray-500";
  const inputBg = isDark
    ? "bg-[#0d0a14]/80 border border-white/[0.08] text-gray-100 placeholder:text-gray-500 shadow-[inset_0_2px_4px_rgba(0,0,0,0.3)]"
    : "bg-white/95 border border-black/[0.08] text-gray-900 placeholder:text-gray-400 shadow-[inset_0_2px_4px_rgba(0,0,0,0.04)]";
  const inputFocusBg = isDark
    ? "border-amber-500/60 ring-4 ring-amber-500/15 shadow-[0_0_0_4px_rgba(245,158,11,0.15),inset_0_2px_4px_rgba(0,0,0,0.3)]"
    : "border-amber-500/60 ring-4 ring-amber-500/15 shadow-[0_0_0_4px_rgba(245,158,11,0.15),inset_0_2px_4px_rgba(0,0,0,0.04)]";
  const accent = "text-amber-500";

  /* ═══════════════════════════════════════════════════════════════════
     ✅ FIX-C-04 + FIX-C-05: CORRECTED effectiveStatus
     
     Logic:
     - "cancelled" → cancelled
     - "paid" or paymentStatus:"paid" or offlineSyncPending → paid
     - "approved" (dualMode bill approved by admin) → "pending" for cashier
     - dualMode:true + status:"pending" (not yet approved) → "awaiting_approval" (hidden)
     - "pending" (non-dualMode) → pending (visible to cashier)
  ═══════════════════════════════════════════════════════════════════ */
  const effectiveStatus = useCallback((o) => {
    try {
      if (!o) return "pending";

      // 1) Cancelled is always cancelled
      if (o.status === "cancelled") return "cancelled";

      // 2) Paid checks — actual payment received
      if (o.status === "paid") return "paid";
      if (o.paymentStatus === "paid") return "paid";
      if (o.offlineSyncPending === true) return "paid";

      // 3) dualMode approved by admin → show as "pending" for cashier to collect payment
      if (o.dualMode === true && o.status === "approved") return "pending";

      // 4) dualMode pending (NOT yet approved) → hide from cashier
      if (o.dualMode === true && o.status === "pending") return "awaiting_approval";

      // 5) Normal non-dualMode pending → visible to cashier
      if (o.status === "pending") return "pending";

      // Fallback
      return o.status || "pending";
    } catch {
      return o?.status || "pending";
    }
  }, []);

  /* ═══════════════════════════════════════════════════════════════════
     SECTION 1: ALL CALLBACKS
  ═══════════════════════════════════════════════════════════════════ */

  const forceRefresh = useCallback(() => {
    setRefreshKey((prev) => prev + 1);
    setPage(1);
  }, []);

  const refreshReviewQueue = useCallback(async () => {
    try {
      const items = await getManualReviewQueue(userData?.storeId);
      setReviewQueue(items || []);
    } catch {}
  }, [userData?.storeId]);

  useEffect(() => {
    refreshReviewQueueRef.current = refreshReviewQueue;
  }, [refreshReviewQueue]);

  const syncOfflinePayments = useCallback(async () => {
    try {
      const pending = await getPendingOfflinePayments();
      if (!pending || pending.length === 0) return;

      toast.loading(`Syncing ${pending.length} payments...`, { id: "sync" });
      let synced = 0,
        flagged = 0;

      for (const op of pending) {
        try {
          const billSnap = await getDoc(doc(db, "orders", op.billId));
          if (!billSnap.exists()) {
            await moveToManualReview(op.localId, "Bill not found");
            flagged++;
            continue;
          }
          const bill = billSnap.data();
          const actualAmount = bill.totalAmount || 0;

          if (bill.status === "paid") {
            await markOfflinePaymentSynced(op.localId);
            synced++;
            continue;
          }

          if (Number(op.enteredAmount) === actualAmount) {
            await updateDoc(doc(db, "orders", op.billId), {
              status: "paid",
              paymentType: op.paymentMethod,
              paidAt: serverTimestamp(),
              paidBy: op.cashierId,
              offlineSync: true,
              offlineSavedAt: op.savedAt,
            });
            await logCashierAction({
              action: "OFFLINE_PAYMENT_SYNCED",
              orderId: op.billId,
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
              `Amount mismatch: entered ${op.enteredAmount}, actual ${actualAmount}`
            );
            flagged++;
          }
        } catch (err) {
          console.error("Sync error for payment:", op.localId, err);
        }
      }

      if (refreshReviewQueueRef.current) {
        await refreshReviewQueueRef.current();
      }

      toast.dismiss("sync");

      if (synced > 0) {
        toast.success(`✅ ${synced} payment${synced > 1 ? "s" : ""} synced successfully`);
      }
      if (flagged > 0) {
        toast.error(
          `⚠️ ${flagged} payment${flagged > 1 ? "s" : ""} need manual review`,
          { icon: <FileWarning className="w-4 h-4 text-orange-500" /> }
        );
      }
    } catch {
      toast.dismiss("sync");
    }
  }, []);

  useEffect(() => {
    syncOfflinePaymentsRef.current = syncOfflinePayments;
  }, [syncOfflinePayments]);

  const handleInstantPay = useCallback(
    async (order) => {
      const tid = toast.loading("Processing payment...", { duration: 2000 });
      const sid =
        userData?.storeId || userData?.primaryStore || order.storeId || "default";
      const cn = userData?.displayName || userData?.name || "Cashier";
      const now = new Date();

      if (!navigator.onLine) {
        try {
          const saved = await saveOfflinePayment({
            billId: order.id,
            billSerial: order.billSerial || order.serialNo,
            enteredAmount: order.totalAmount || 0,
            paymentMethod: order.paymentType || "Cash",
            cashierId: userData?.uid || "",
            cashierName: cn,
            storeId: sid,
          });

          if (!saved || !saved.success) {
            throw new Error(saved?.error || "Offline save failed");
          }

          setOrders((prevOrders) =>
            prevOrders.map((o) =>
              o.id === order.id
                ? {
                    ...o,
                    status: "paid",
                    paymentType: order.paymentType || "Cash",
                    paidBy: userData?.uid || "",
                    paidByName: cn,
                    amountReceived: order.totalAmount || 0,
                    changeGiven: 0,
                    offlineSyncPending: true,
                    offlineSavedAt: new Date().toISOString(),
                  }
                : o
            )
          );

          if (viewModal.open && viewModal.order?.id === order.id) {
            setViewModal((prev) => ({
              ...prev,
              order: {
                ...(prev.order || {}),
                status: "paid",
                paymentType: order.paymentType || "Cash",
                paidBy: userData?.uid || "",
                paidByName: cn,
                amountReceived: order.totalAmount || 0,
                changeGiven: 0,
                offlineSyncPending: true,
                offlineSavedAt: new Date().toISOString(),
              },
            }));
          }

          toast.success(
            `Saved offline — #${order.billSerial || order.serialNo}`,
            {
              id: tid,
              icon: <WifiOff className="w-4 h-4 text-blue-500" />,
              duration: 3000,
            }
          );
        } catch (error) {
          console.error("Offline payment save failed:", error);
          toast.error("Failed to save offline payment", { id: tid });
        }
        return;
      }

      try {
        await Promise.all([
          updateDoc(doc(db, "orders", order.id), {
            status: "paid",
            paymentType: order.paymentType || "Cash",
            paidAt: serverTimestamp(),
            paidBy: userData?.uid || "",
            paidByName: cn,
            billEndTime: now.toISOString(),
            amountReceived: order.totalAmount || 0,
            changeGiven: 0,
            cashierHandover: true,
          }),
          addDoc(collection(db, "cashierActions"), {
            actionType: "PAID",
            orderId: order.id,
            billSerial: order.billSerial || order.serialNo || "",
            serialNo: order.serialNo || order.billSerial || "",
            storeId: sid,
            cashierId: userData?.uid || "",
            cashierName: cn,
            totalAmount: order.totalAmount || 0,
            totalDiscount: order.totalDiscount || 0,
            totalQty: order.totalQty || 0,
            paymentType: order.paymentType || "Cash",
            customer: order.customer || {},
            items: order.items || [],
            billerName: order.billerName || "",
            billerId: order.billerId || "",
            date: now.toISOString().split("T")[0],
            time: now.toLocaleTimeString("en-PK"),
            timestamp: serverTimestamp(),
          }),
          logCashierAction({
            action: "PAYMENT_RECEIVED",
            orderId: order.id,
            billSerial: order.billSerial || order.serialNo,
            userId: userData?.uid || "",
            userName: cn,
            storeId: sid,
            amount: order.totalAmount || 0,
            paymentType: order.paymentType || "Cash",
          }),
        ]);
        toast.success(
          `💰 Paid Rs.${(order.totalAmount || 0).toLocaleString()}`,
          {
            id: tid,
            duration: 2000,
            icon: <Sparkles className="w-4 h-4 text-emerald-500" />,
          }
        );
      } catch (err) {
        console.error("[Cashier] Payment error:", err);
        toast.error("Payment failed. Please try again.", { id: tid });
      }
    },
    [userData, viewModal]
  );

  useEffect(() => {
    handleInstantPayRef.current = handleInstantPay;
  }, [handleInstantPay]);

  const handleQRPunch = useCallback(
    (rawCode) => {
      const parsed = parseQRCode(rawCode);
      if (!parsed) {
        toast.error("Invalid QR code format");
        return;
      }

      const found = orders.find(
        (o) =>
          (o.billSerial || "").toUpperCase() === parsed.id ||
          (o.serialNo || "").toUpperCase() === parsed.id ||
          o.id === parsed.id
      );

      if (!found) {
        toast.error(`Bill "${parsed.id}" not found`);
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

      if (eff === "paid") {
        setViewModal({ open: true, order: found });
        toast("Bill already paid", {
          icon: <Eye className="w-4 h-4 text-amber-500" />,
        });
        return;
      }

      if (eff === "cancelled") {
        toast.error("This bill has been cancelled");
        return;
      }

      if (eff === "awaiting_approval") {
        toast.error("This bill needs admin approval first (Dual Mode)");
        return;
      }

      if (handleInstantPayRef.current) {
        handleInstantPayRef.current(found);
      }
    },
    [orders, userData, effectiveStatus]
  );

  useEffect(() => {
    handleQRPunchRef.current = handleQRPunch;
  }, [handleQRPunch]);

  /* ─── Instant search ─── */
  const instantSearch = useCallback(
    (q) => {
      if (!q || q.trim().length < 1) {
        setSearchResults([]);
        setShowSearchResults(false);
        setSearchNotFound(false);
        return;
      }
      const uq = q.trim().toUpperCase();
      const r = orders
        .filter((o) => {
          // Don't show awaiting_approval in search
          if (effectiveStatus(o) === "awaiting_approval") return false;
          const s = (o.billSerial || o.serialNo || "").toUpperCase();
          const n = (o.customer?.name || "").toUpperCase();
          const p = (o.customer?.phone || "").toUpperCase();
          return s.includes(uq) || n.includes(uq) || p.includes(uq);
        })
        .slice(0, 8);
      setSearchResults(r);
      setShowSearchResults(r.length > 0);
      setSearchNotFound(r.length === 0 && q.length > 0);
    },
    [orders, effectiveStatus]
  );

  const handleSearchChange = useCallback(
    (v) => {
      setSearchQuery(v);
      setSearchActiveIndex(-1);
      instantSearch(v);
    },
    [instantSearch]
  );

  const handleSearchKeyDown = useCallback(
    (e) => {
      if (!showSearchResults || searchResults.length === 0) {
        if (e.key === "ArrowDown" && searchResults.length > 0) {
          setSearchActiveIndex(0);
          setShowSearchResults(true);
          e.preventDefault();
        }
        return;
      }

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSearchActiveIndex((prev) =>
            prev < searchResults.length - 1 ? prev + 1 : prev
          );
          break;
        case "ArrowUp":
          e.preventDefault();
          setSearchActiveIndex((prev) => (prev > 0 ? prev - 1 : -1));
          break;
        case "Enter":
          e.preventDefault();
          if (searchActiveIndex >= 0 && searchResults[searchActiveIndex]) {
            const bill = searchResults[searchActiveIndex];
            setViewModal({ open: true, order: bill });
            setSearchQuery("");
            setShowSearchResults(false);
            setSearchActiveIndex(-1);
          } else if (searchQuery.trim()) {
            instantSearch(searchQuery);
          }
          break;
        case "Escape":
          e.preventDefault();
          setShowSearchResults(false);
          setSearchActiveIndex(-1);
          searchInputRef.current?.blur();
          break;
        default:
          break;
      }
    },
    [showSearchResults, searchResults, searchActiveIndex, searchQuery, instantSearch]
  );

  const selectSearchResult = useCallback((bill) => {
    setViewModal({ open: true, order: bill });
    setSearchQuery("");
    setShowSearchResults(false);
    setSearchActiveIndex(-1);
  }, []);

  const closeSearchDropdown = useCallback(() => {
    setShowSearchResults(false);
    setSearchActiveIndex(-1);
  }, []);

  /* ─── Instant serial search ─── */
  const instantSerialSearch = useCallback(
    (q) => {
      if (!q || q.trim().length < 1) {
        setSerialResults([]);
        setShowSerialResults(false);
        setSerialNotFound(false);
        return;
      }
      const uq = q.trim().toUpperCase();
      const r = orders
        .filter((o) => {
          if (effectiveStatus(o) === "awaiting_approval") return false;
          const s = (o.billSerial || o.serialNo || "").toUpperCase();
          return s.includes(uq);
        })
        .slice(0, 8);
      setSerialResults(r);
      setShowSerialResults(r.length > 0);
      setSerialNotFound(r.length === 0 && q.length > 0);
    },
    [orders, effectiveStatus]
  );

  const handleSerialChange = useCallback(
    (v) => {
      setSerialInput(v);
      setSerialActiveIndex(-1);
      instantSerialSearch(v);
    },
    [instantSerialSearch]
  );

  const handleSerialKeyDown = useCallback(
    (e) => {
      if (e.key === "Enter" && serialInput.trim()) {
        e.preventDefault();
        if (handleQRPunchRef.current) {
          handleQRPunchRef.current(serialInput);
        }
        setSerialInput("");
        setShowSerialResults(false);
        return;
      }

      if (!showSerialResults || serialResults.length === 0) {
        if (e.key === "ArrowDown" && serialResults.length > 0) {
          setSerialActiveIndex(0);
          setShowSerialResults(true);
          e.preventDefault();
        }
        return;
      }

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSerialActiveIndex((prev) =>
            prev < serialResults.length - 1 ? prev + 1 : prev
          );
          break;
        case "ArrowUp":
          e.preventDefault();
          setSerialActiveIndex((prev) => (prev > 0 ? prev - 1 : -1));
          break;
        case "Enter":
          e.preventDefault();
          if (serialActiveIndex >= 0 && serialResults[serialActiveIndex]) {
            if (handleInstantPayRef.current) {
              handleInstantPayRef.current(serialResults[serialActiveIndex]);
            }
            setSerialInput("");
            setShowSerialResults(false);
            setSerialActiveIndex(-1);
          }
          break;
        case "Escape":
          e.preventDefault();
          setShowSerialResults(false);
          setSerialActiveIndex(-1);
          serialInputRef.current?.blur();
          break;
        default:
          break;
      }
    },
    [showSerialResults, serialResults, serialActiveIndex, serialInput]
  );

  const selectSerialResult = useCallback((bill) => {
    if (handleInstantPayRef.current) {
      handleInstantPayRef.current(bill);
    }
    setSerialInput("");
    setShowSerialResults(false);
    setSerialActiveIndex(-1);
  }, []);

  const closeSerialDropdown = useCallback(() => {
    setShowSerialResults(false);
    setSerialActiveIndex(-1);
  }, []);

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
      toast.success("Refreshed!", {
        icon: <RefreshCw className="w-4 h-4" />,
      });
    },
  });

  const handleLogout = useCallback(async () => {
    try {
      await signOut(auth);
      navigate("/login");
    } catch {
      toast.error("Logout failed");
    }
  }, [navigate]);

  /* ═══════════════════════════════════════════════════════════════════
     SECTION 2: ALL USEEFFECT HOOKS
  ═══════════════════════════════════════════════════════════════════ */

  useEffect(() => {
    if (authUserData) setUserData(authUserData);
  }, [authUserData]);

  useEffect(() => {
    const t = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const goOnline = async () => {
      setIsOnline(true);
      toast.success("Back online — Syncing...", {
        icon: <Wifi className="w-4 h-4 text-emerald-500" />,
        duration: 3000,
      });

      forceRefresh();

      try {
        await flushAuditQueue();
        if (syncOfflinePaymentsRef.current) {
          await syncOfflinePaymentsRef.current();
        }
        if (refreshReviewQueueRef.current) {
          await refreshReviewQueueRef.current();
        }
      } catch (err) {
        console.error("[Cashier] Online sync error:", err);
      }
    };

    const goOffline = () => {
      setIsOnline(false);
      toast("Offline mode — Payments saved locally", {
        icon: <WifiOff className="w-4 h-4 text-red-400" />,
        duration: 3000,
      });
    };

    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);

    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, [forceRefresh]);

  useEffect(() => {
    if (!currentUser) {
      setLoading(false);
      return;
    }
    const storeIdToFetch = userData?.storeId || userData?.primaryStore;
    if (!storeIdToFetch) return;
    (async () => {
      try {
        const ss = await getDoc(doc(db, "stores", storeIdToFetch));
        if (ss.exists()) setStoreData({ id: ss.id, ...ss.data() });
      } catch (err) {
        console.error("[Cashier] Store fetch:", err);
      }
    })();
  }, [currentUser, userData?.storeId, userData?.primaryStore]);

  useEffect(() => {
    if (!currentUser) {
      setLoading(false);
      return;
    }
    if (!userData) return;

    setLoading(true);

    idbLoad().then((c) => {
      if (c.length > 0) setOrders((p) => (p.length === 0 ? c : p));
    });

    if (!navigator.onLine) {
      console.log(
        "[Cashier] Offline: skipping Firestore listener and using local cache"
      );
      setLoading(false);
      return;
    }

    const storeIdToUse = userData?.storeId || userData?.primaryStore;
    let q;
    try {
      q = storeIdToUse
        ? query(
            collection(db, "orders"),
            where("storeId", "==", storeIdToUse),
            orderBy("createdAt", "desc"),
            limit(500)
          )
        : query(
            collection(db, "orders"),
            orderBy("createdAt", "desc"),
            limit(500)
          );
    } catch {
      q = query(
        collection(db, "orders"),
        orderBy("createdAt", "desc"),
        limit(500)
      );
    }

    const unsub = onSnapshot(
      q,
      (snap) => {
        const f = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((o) => !o.isDeleted);
        setOrders(f);
        setLoading(false);
        idbSave(f);
      },
      (err) => {
        console.error("❌ Firebase query error:", err);
        setLoading(false);
        const isNetworkError =
          !navigator.onLine ||
          err.code === "unavailable" ||
          err.code === "network-error";
        if (isNetworkError) {
          console.log(
            "[Cashier] Firestore listener failed because network is offline."
          );
          return;
        }
        toast.error(`Query failed: ${err.message}`);
      }
    );
    return () => unsub();
  }, [currentUser, userData, refreshKey]);

  useEffect(() => {
    if (refreshReviewQueueRef.current) {
      refreshReviewQueueRef.current();
    }
    const i = setInterval(() => {
      if (refreshReviewQueueRef.current) {
        refreshReviewQueueRef.current();
      }
    }, 30000);
    return () => clearInterval(i);
  }, []);

  useEffect(() => {
    const h = (e) => {
      const tag = document.activeElement?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;
      if (anyModalOpen) return;
      if (e.key === "Enter") {
        const b = qrBufferRef.current.trim();
        if (b.length >= 1) {
          if (handleQRPunchRef.current) {
            handleQRPunchRef.current(b);
          }
          qrBufferRef.current = "";
        }
        return;
      }
      if (e.key.length === 1) {
        qrBufferRef.current += e.key;
        clearTimeout(qrTimerRef.current);
        qrTimerRef.current = setTimeout(() => {
          qrBufferRef.current = "";
        }, 150);
      }
    };
    window.addEventListener("keydown", h);
    return () => {
      window.removeEventListener("keydown", h);
      clearTimeout(qrTimerRef.current);
    };
  }, [anyModalOpen]);

  /* ═══════════════════════════════════════════════════════════════════
     SECTION 3: MEMOIZED VALUES
  ═══════════════════════════════════════════════════════════════════ */

  const isValidDate = (o) => {
    try {
      const ts = o.createdAt || o.savedAt;
      if (!ts) return false;
      const d = ts?.toDate ? ts.toDate() : new Date(ts);
      return d && !isNaN(d.getTime());
    } catch {
      return false;
    }
  };

  /* ═══════════════════════════════════════════════════════════════════
     ✅ FIX-C-05: visibleOrders — hide "awaiting_approval" bills
     
     Only show bills that cashier can act on:
     - pending (non-dualMode OR dualMode+approved)
     - paid
     - cancelled
     
     Hide: awaiting_approval (dualMode not yet approved by admin)
  ═══════════════════════════════════════════════════════════════════ */
  const visibleOrders = useMemo(
    () =>
      orders.filter((o) => {
        if (!isValidDate(o)) return false;
        const eff = effectiveStatus(o);
        // Hide bills awaiting admin approval
        if (eff === "awaiting_approval") return false;
        return true;
      }),
    [orders, effectiveStatus]
  );

  const filteredOrders = useMemo(() => {
    if (activeTab === "all")
      return visibleOrders.filter((o) => effectiveStatus(o) !== "paid");
    return visibleOrders.filter((o) => effectiveStatus(o) === activeTab);
  }, [visibleOrders, activeTab, effectiveStatus]);

  const paginatedOrders = useMemo(
    () => filteredOrders.slice(0, page * PAGE_SIZE),
    [filteredOrders, page]
  );
  const hasMore = paginatedOrders.length < filteredOrders.length;

  useEffect(() => setPage(1), [activeTab]);

  const stats = useMemo(
    () => ({
      all: visibleOrders.filter((o) => effectiveStatus(o) !== "paid").length,
      pending: visibleOrders.filter((o) => effectiveStatus(o) === "pending")
        .length,
      paid: visibleOrders.filter((o) => effectiveStatus(o) === "paid").length,
      cancelled: visibleOrders.filter(
        (o) => effectiveStatus(o) === "cancelled"
      ).length,
    }),
    [visibleOrders, effectiveStatus]
  );

  /* ─── Formatters ─── */
  const fmtTime = (d) =>
    d.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  const fmtDate = (d) =>
    d.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  const fmtTS = (ts) => {
    if (!ts) return "—";
    try {
      const d = ts.toDate ? ts.toDate() : new Date(ts);
      return d.toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "—";
    }
  };

  const getStatusColors = (status) => {
    if (status === "cancelled") return { borderLeft: "border-l-red-500" };
    if (status === "paid") return { borderLeft: "border-l-emerald-500" };
    return { borderLeft: "border-l-amber-500" };
  };

  const StatusBadge = ({ status }) => {
    const badges = {
      pending: isDark
        ? "bg-amber-500/20 text-amber-400 border-amber-500/30"
        : "bg-amber-100 text-amber-700 border-amber-200",
      paid: isDark
        ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
        : "bg-emerald-100 text-emerald-700 border-emerald-200",
      cancelled: isDark
        ? "bg-red-500/20 text-red-400 border-red-500/30"
        : "bg-red-100 text-red-700 border-red-200",
    };
    return (
      <span
        className={`text-[9px] px-1.5 py-0.5 rounded font-bold border ${
          badges[status] || badges.pending
        }`}
      >
        {status?.toUpperCase()}
      </span>
    );
  };

  const timeAgo = (ts) => {
    if (!ts) return "";
    try {
      const d = ts.toDate ? ts.toDate() : new Date(ts);
      const seconds = Math.floor((new Date() - d) / 1000);
      if (seconds < 60) return `${seconds}s ago`;
      if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
      if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
      return `${Math.floor(seconds / 86400)}d ago`;
    } catch {
      return "";
    }
  };

  /* ─── Loading state ─── */
  if (loading)
    return (
      <div
        className={`min-h-screen ${bg} ${bgOverlay} flex items-center justify-center`}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center"
        >
          <div className="relative">
            <Loader2 className="w-12 h-12 text-amber-500 animate-spin mx-auto mb-4" />
            <div className="absolute inset-0 w-12 h-12 mx-auto bg-amber-500/20 rounded-full blur-2xl animate-pulse" />
          </div>
          <p className={`${text} text-base font-bold tracking-wide`}>
            Loading...
          </p>
        </motion.div>
      </div>
    );

  /* ─── RENDER ─── */
  return (
    <div className={`min-h-screen ${bg} ${text} relative overflow-hidden`}>
      <div className={`fixed inset-0 ${bgOverlay} pointer-events-none`} />

      {/* ALERTS */}
      <AnimatePresence>
        {!isOnline && (
          <motion.div
            initial={{ y: -50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -50, opacity: 0 }}
            transition={springConfig}
            className="relative z-50 bg-gradient-to-r from-red-600 via-red-500 to-red-600 backdrop-blur-md text-white text-center text-[11px] py-1.5 font-bold flex items-center justify-center gap-2 shadow-[0_4px_20px_rgba(239,68,68,0.3)]"
          >
            <motion.div
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
            >
              <WifiOff className="w-3 h-3" />
            </motion.div>
            Offline Mode — Payments saved locally · Auto-sync when online
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {reviewQueue.length > 0 && (
          <motion.button
            initial={{ y: -50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -50, opacity: 0 }}
            transition={springConfig}
            whileHover={{ scale: 1.01 }}
            onClick={() => setShowReviewPanel(true)}
            className="relative z-40 w-full bg-gradient-to-r from-orange-600 via-amber-500 to-orange-600 backdrop-blur-md text-white text-[11px] py-1.5 font-bold flex items-center justify-center gap-2 shadow-[0_4px_20px_rgba(249,115,22,0.3)] hover:shadow-[0_6px_30px_rgba(249,115,22,0.5)] transition-shadow"
          >
            <FileWarning className="w-3 h-3" />
            <span>
              {reviewQueue.length} payment
              {reviewQueue.length !== 1 ? "s" : ""} need review
            </span>
            <span className="underline opacity-90">Click here</span>
          </motion.button>
        )}
      </AnimatePresence>

      {/* ═══ PREMIUM NAVBAR ═══ */}
      <nav
        className={`sticky top-0 z-40 ${glassBg} shadow-[0_4px_30px_rgba(0,0,0,0.1)]`}
      >
        <div className="px-3 lg:px-5 py-2.5">
          <div className="flex items-center justify-between gap-3">
            {/* Logo */}
            <motion.div
              initial={{ x: -20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              className="flex items-center gap-2.5"
            >
              <div className="relative">
                <div className="w-9 h-9 bg-gradient-to-br from-amber-400 via-amber-500 to-orange-600 rounded-xl flex items-center justify-center shadow-[0_4px_20px_rgba(245,158,11,0.4),inset_0_1px_0_rgba(255,255,255,0.2)]">
                  <Store className="text-white w-4 h-4" />
                </div>
                <div className="absolute inset-0 w-9 h-9 bg-amber-500 rounded-xl blur-xl opacity-30" />
              </div>
              <div className="leading-tight">
                <h1
                  className={`font-extrabold text-sm tracking-tight ${text}`}
                >
                  {storeData?.name || "POS Cashier"}
                </h1>
                <p
                  className={`text-[10px] ${subText} flex items-center gap-1 font-medium`}
                >
                  <MapPin className="w-2.5 h-2.5 text-amber-500" />
                  {storeData?.city || "Store"}
                </p>
              </div>
            </motion.div>

            {/* Clock */}
            <motion.div
              initial={{ y: -10, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              className={`hidden md:flex items-center gap-2 px-3 py-1 rounded-lg ${
                isDark ? "bg-white/[0.03]" : "bg-black/[0.03]"
              } border ${
                isDark ? "border-white/[0.06]" : "border-black/[0.04]"
              }`}
            >
              <Clock className="w-3 h-3 text-amber-500" />
              <div className="text-right leading-tight">
                <p className={`text-xs font-bold ${accent} tabular-nums`}>
                  {fmtTime(currentTime)}
                </p>
                <p className={`text-[9px] ${mutedText}`}>
                  {fmtDate(currentTime)}
                </p>
              </div>
            </motion.div>

            {/* Right */}
            <div className="flex items-center gap-1.5">
              <motion.div
                initial={{ x: 20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                className={`hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold border ${
                  isOnline
                    ? isDark
                      ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30 shadow-[0_0_15px_rgba(16,185,129,0.15)]"
                      : "bg-emerald-50 text-emerald-700 border-emerald-200 shadow-[0_0_15px_rgba(16,185,129,0.1)]"
                    : isDark
                    ? "bg-red-500/10 text-red-400 border-red-500/30"
                    : "bg-red-50 text-red-700 border-red-200"
                }`}
              >
                {isOnline ? (
                  <>
                    <div className="relative">
                      <Wifi className="w-2.5 h-2.5" />
                      <div className="absolute inset-0 w-2.5 h-2.5 bg-emerald-500 rounded-full blur-md opacity-60 animate-pulse" />
                    </div>
                    LIVE
                  </>
                ) : (
                  <>
                    <WifiOff className="w-2.5 h-2.5" />
                    OFFLINE
                  </>
                )}
              </motion.div>

              <motion.button
                whileHover={{ scale: 1.08 }}
                whileTap={{ scale: 0.92 }}
                onClick={forceRefresh}
                className={`p-1.5 rounded-lg ${glassCard} hover:border-blue-500/50 transition-all`}
                title="Refresh (F9)"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 text-blue-500 ${
                    loading ? "animate-spin" : ""
                  }`}
                />
              </motion.button>

              <motion.div
                initial={{ x: 20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                className={`hidden md:flex items-center gap-1.5 px-2 py-1 rounded-lg border ${
                  isDark
                    ? "bg-amber-500/10 border-amber-500/20"
                    : "bg-amber-50 border-amber-200/50"
                }`}
              >
                <div className="w-5 h-5 bg-gradient-to-br from-amber-400 to-orange-500 rounded-full flex items-center justify-center shadow-md">
                  <User className="text-white w-3 h-3" />
                </div>
                <p className={`text-[10px] font-extrabold ${text}`}>
                  {(
                    userData?.displayName ||
                    userData?.name ||
                    "Cashier"
                  ).split(" ")[0]}
                </p>
              </motion.div>

              <motion.button
                whileHover={{ scale: 1.08, rotate: 15 }}
                whileTap={{ scale: 0.92 }}
                onClick={toggleTheme}
                className={`p-1.5 rounded-lg ${glassCard} hover:border-amber-500/50 transition-all`}
              >
                {isDark ? (
                  <Sun className="w-3.5 h-3.5 text-amber-400" />
                ) : (
                  <Moon className="w-3.5 h-3.5 text-gray-700" />
                )}
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.08 }}
                whileTap={{ scale: 0.92 }}
                onClick={handleLogout}
                className="p-1.5 rounded-lg bg-red-500/10 border border-red-500/30 hover:bg-red-500/20 hover:shadow-[0_0_15px_rgba(239,68,68,0.3)] transition-all"
              >
                <LogOut className="w-3.5 h-3.5 text-red-500" />
              </motion.button>
            </div>
          </div>
        </div>
      </nav>

      {/* ═══ MAIN ═══ */}
      <div className="relative px-3 lg:px-5 py-2.5 space-y-2.5 max-w-[1600px] mx-auto">
        {/* Stats Toggle */}
        <motion.button
          initial={{ y: -10, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.99 }}
          onClick={() => setShowStats((v) => !v)}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg ${glassCard} hover:border-amber-500/40 transition-all text-xs font-bold ${text}`}
        >
          <motion.div animate={{ rotate: showStats ? 180 : 0 }}>
            <ChevronDown className="w-3 h-3" />
          </motion.div>
          Stats
          <span
            className={`text-[10px] px-2 py-0.5 rounded-md font-extrabold ${
              isDark
                ? "bg-amber-500/20 text-amber-400"
                : "bg-amber-100 text-amber-700"
            }`}
          >
            {stats.pending} pending
          </span>
        </motion.button>

        <AnimatePresence>
          {showStats && (
            <motion.div
              initial={{ opacity: 0, height: 0, y: -10 }}
              animate={{ opacity: 1, height: "auto", y: 0 }}
              exit={{ opacity: 0, height: 0, y: -10 }}
              transition={springConfig}
              className="grid grid-cols-4 gap-2"
            >
              {[
                {
                  label: "Total",
                  val: stats.all,
                  color: "blue",
                  gradient: "from-blue-500 to-blue-600",
                },
                {
                  label: "Pending",
                  val: stats.pending,
                  color: "amber",
                  gradient: "from-amber-500 to-orange-500",
                },
                {
                  label: "Paid",
                  val: stats.paid,
                  color: "emerald",
                  gradient: "from-emerald-500 to-green-500",
                },
                {
                  label: "Cancelled",
                  val: stats.cancelled,
                  color: "red",
                  gradient: "from-red-500 to-rose-500",
                },
              ].map((s, i) => (
                <motion.div
                  key={s.label}
                  initial={{ y: 10, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: i * 0.05 }}
                  whileHover={{ y: -2 }}
                  className={`${glassCard} rounded-xl px-3 py-2 flex items-center justify-between hover:border-amber-500/50 transition-all cursor-pointer`}
                >
                  <p
                    className={`text-xs ${subText} font-bold uppercase tracking-wider`}
                  >
                    {s.label}
                  </p>
                  <p
                    className={`text-lg font-black bg-gradient-to-br ${s.gradient} bg-clip-text text-transparent tabular-nums`}
                  >
                    {s.val}
                  </p>
                </motion.div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {/* ═══ SEARCH + QR ═══ */}
        <motion.div
          initial={{ y: -10, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.05 }}
          className="grid grid-cols-1 md:grid-cols-2 gap-2.5"
        >
          {/* Search Bills */}
          <div
            className={`${glassCard} rounded-xl p-2 hover:shadow-[0_10px_40px_rgba(59,130,246,0.1)] transition-shadow`}
          >
            <div className="relative">
              <Search
                className={`absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 ${
                  searchFocused ? "text-blue-500" : mutedText
                } transition-colors z-10`}
              />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search bills, name, phone... (Insert)"
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                onFocus={() => {
                  setSearchFocused(true);
                  if (searchQuery.trim()) setShowSearchResults(true);
                }}
                onBlur={() => {
                  setSearchFocused(false);
                  setTimeout(() => closeSearchDropdown(), 150);
                }}
                onKeyDown={handleSearchKeyDown}
                className={`w-full pl-9 pr-9 py-2.5 rounded-lg text-xs font-semibold transition-all duration-200 ${inputBg} ${
                  searchFocused
                    ? "border-blue-500/60 ring-4 ring-blue-500/15"
                    : ""
                } focus:outline-none`}
              />
              {searchQuery && (
                <motion.button
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  whileHover={{ scale: 1.1, rotate: 90 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={() => {
                    setSearchQuery("");
                    setSearchResults([]);
                    setShowSearchResults(false);
                    setSearchNotFound(false);
                  }}
                  className={`absolute right-3 top-1/2 -translate-y-1/2 ${subText} hover:text-red-500 transition-colors z-10`}
                >
                  <X className="w-3.5 h-3.5" />
                </motion.button>
              )}

              {/* Dropdown */}
              <AnimatePresence>
                {showSearchResults && searchQuery.trim() && (
                  <motion.div
                    data-dropdown-open="true"
                    initial={{ opacity: 0, y: -8, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -8, scale: 0.98 }}
                    transition={{ ...springConfig, duration: 0.15 }}
                    className={`absolute top-full left-0 right-0 mt-2 ${glassBg} rounded-xl shadow-[0_20px_60px_rgba(0,0,0,0.3)] z-[100] max-h-80 overflow-y-auto scrollbar-thin`}
                  >
                    <div
                      className={`sticky top-0 px-3 py-1.5 ${
                        isDark ? "bg-[#13101a]/90" : "bg-white/90"
                      } backdrop-blur-md border-b ${
                        isDark
                          ? "border-white/[0.04]"
                          : "border-black/[0.04]"
                      } flex items-center gap-2 text-[10px] ${subText}`}
                    >
                      <Keyboard className="w-3 h-3" />
                      <span>↑↓ Navigate</span>
                      <span>•</span>
                      <span>Enter Select</span>
                      <span>•</span>
                      <span>Esc Close</span>
                    </div>

                    {searchNotFound ? (
                      <div className="px-4 py-8 text-center">
                        <motion.div
                          animate={{ rotate: [0, -10, 10, -10, 10, 0] }}
                          transition={{ duration: 0.5 }}
                        >
                          <AlertTriangle className="w-10 h-10 text-red-400 mx-auto mb-3" />
                        </motion.div>
                        <p className={`text-sm font-bold ${text}`}>
                          Not Found
                        </p>
                        <p className={`text-xs ${subText} mt-1`}>
                          Try different keyword
                        </p>
                      </div>
                    ) : (
                      searchResults.map((bill, i) => (
                        <motion.button
                          key={bill.id}
                          initial={{ x: -10, opacity: 0 }}
                          animate={{ x: 0, opacity: 1 }}
                          transition={{ delay: i * 0.02 }}
                          onClick={() => selectSearchResult(bill)}
                          className={`w-full text-left px-3 py-3 border-b ${
                            isDark
                              ? "border-white/[0.04]"
                              : "border-black/[0.04]"
                          } last:border-b-0 transition-all flex items-center justify-between group ${
                            searchActiveIndex === i
                              ? isDark
                                ? "bg-blue-500/20"
                                : "bg-blue-50"
                              : "hover:bg-blue-500/5"
                          }`}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span
                                className={`text-xs font-extrabold ${accent}`}
                              >
                                #{bill.billSerial || bill.serialNo}
                              </span>
                              <StatusBadge
                                status={effectiveStatus(bill)}
                              />
                              {(bill.isEdited || bill.wasEdited) && (
                                <span
                                  className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${
                                    isDark
                                      ? "bg-purple-500/20 text-purple-400"
                                      : "bg-purple-100 text-purple-700"
                                  }`}
                                >
                                  EDITED
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 mt-0.5">
                              <p
                                className={`text-xs ${text} font-medium truncate`}
                              >
                                {bill.customer?.name || "Walk-in"}
                              </p>
                              {bill.customer?.phone && (
                                <p
                                  className={`text-[10px] ${subText} flex-shrink-0`}
                                >
                                  {bill.customer.phone}
                                </p>
                              )}
                            </div>
                            <p
                              className={`text-[10px] ${mutedText} mt-0.5`}
                            >
                              {bill.items?.length || 0} items •{" "}
                              {timeAgo(bill.createdAt)}
                            </p>
                          </div>
                          <div className="flex flex-col items-end gap-1 ml-2">
                            <p
                              className={`text-sm font-black ${accent} group-hover:scale-110 transition-transform tabular-nums`}
                            >
                              Rs.
                              {(bill.totalAmount || 0).toLocaleString()}
                            </p>
                            {searchActiveIndex === i && (
                              <span
                                className={`text-[9px] px-1.5 py-0.5 rounded bg-blue-500 text-white font-bold`}
                              >
                                Press Enter
                              </span>
                            )}
                          </div>
                        </motion.button>
                      ))
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* QR / Serial */}
          <div
            className={`${glassCard} rounded-xl p-2 hover:shadow-[0_10px_40px_rgba(245,158,11,0.1)] transition-shadow`}
          >
            <div className="relative flex gap-2">
              <div className="relative flex-1">
                <Hash
                  className={`absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 ${
                    serialFocused ? "text-amber-500" : mutedText
                  } transition-colors z-10`}
                />
                <input
                  ref={serialInputRef}
                  type="text"
                  placeholder="Scan barcode or type serial..."
                  value={serialInput}
                  onChange={(e) => handleSerialChange(e.target.value)}
                  onFocus={() => {
                    setSerialFocused(true);
                    if (serialInput.trim()) setShowSerialResults(true);
                  }}
                  onBlur={() => {
                    setSerialFocused(false);
                    setTimeout(() => closeSerialDropdown(), 150);
                  }}
                  onKeyDown={handleSerialKeyDown}
                  className={`w-full pl-9 pr-9 py-2.5 rounded-lg text-xs font-semibold transition-all duration-200 ${inputBg} ${
                    serialFocused ? inputFocusBg : ""
                  } focus:outline-none`}
                />
                {serialInput && (
                  <motion.button
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    whileHover={{ scale: 1.1, rotate: 90 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={() => {
                      setSerialInput("");
                      setSerialResults([]);
                      setShowSerialResults(false);
                      setSerialNotFound(false);
                    }}
                    className={`absolute right-3 top-1/2 -translate-y-1/2 ${subText} hover:text-red-500 transition-colors z-10`}
                  >
                    <X className="w-3.5 h-3.5" />
                  </motion.button>
                )}
              </div>
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setQrModal(true)}
                className="px-3 rounded-lg bg-gradient-to-br from-amber-400 via-amber-500 to-orange-600 text-white shadow-[0_4px_15px_rgba(245,158,11,0.4),inset_0_1px_0_rgba(255,255,255,0.2)] hover:shadow-[0_6px_25px_rgba(245,158,11,0.6)] transition-all"
                title="Camera Scanner (F2)"
              >
                <ScanLine className="w-3.5 h-3.5" />
              </motion.button>

              {/* Dropdown */}
              <AnimatePresence>
                {showSerialResults && serialInput.trim() && (
                  <motion.div
                    data-dropdown-open="true"
                    initial={{ opacity: 0, y: -8, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -8, scale: 0.98 }}
                    transition={{ ...springConfig, duration: 0.15 }}
                    className={`absolute top-full left-0 right-0 mt-2 ${glassBg} rounded-xl shadow-[0_20px_60px_rgba(0,0,0,0.3)] z-[100] max-h-80 overflow-y-auto scrollbar-thin`}
                  >
                    <div
                      className={`sticky top-0 px-3 py-1.5 ${
                        isDark ? "bg-[#13101a]/90" : "bg-white/90"
                      } backdrop-blur-md border-b ${
                        isDark
                          ? "border-white/[0.04]"
                          : "border-black/[0.04]"
                      } flex items-center gap-2 text-[10px] ${subText}`}
                    >
                      <Keyboard className="w-3 h-3" />
                      <span>↑↓ Navigate</span>
                      <span>•</span>
                      <span>Enter to Pay</span>
                      <span>•</span>
                      <span>Esc Close</span>
                    </div>

                    {serialNotFound ? (
                      <div className="px-4 py-8 text-center">
                        <AlertTriangle className="w-10 h-10 text-red-400 mx-auto mb-3" />
                        <p className={`text-sm font-bold ${text}`}>
                          No Pending Bill
                        </p>
                        <p className={`text-xs ${subText} mt-1`}>
                          Try different serial
                        </p>
                      </div>
                    ) : (
                      serialResults.map((bill, i) => (
                        <motion.button
                          key={bill.id}
                          initial={{ x: -10, opacity: 0 }}
                          animate={{ x: 0, opacity: 1 }}
                          transition={{ delay: i * 0.02 }}
                          onClick={() => selectSerialResult(bill)}
                          className={`w-full text-left px-3 py-3 border-b ${
                            isDark
                              ? "border-white/[0.04]"
                              : "border-black/[0.04]"
                          } last:border-b-0 transition-all flex items-center justify-between group ${
                            serialActiveIndex === i
                              ? isDark
                                ? "bg-emerald-500/20"
                                : "bg-emerald-50"
                              : "hover:bg-emerald-500/5"
                          }`}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span
                                className={`text-xs font-extrabold ${accent}`}
                              >
                                #{bill.billSerial || bill.serialNo}
                              </span>
                              <StatusBadge
                                status={effectiveStatus(bill)}
                              />
                            </div>
                            <p
                              className={`text-xs ${text} font-medium mt-0.5`}
                            >
                              {bill.customer?.name || "Walk-in"}
                            </p>
                            <p
                              className={`text-[10px] ${mutedText} mt-0.5`}
                            >
                              {bill.items?.length || 0} items •{" "}
                              {timeAgo(bill.createdAt)}
                            </p>
                          </div>
                          <div className="flex flex-col items-end gap-1 ml-2">
                            <p
                              className={`text-sm font-black ${accent} group-hover:scale-110 transition-transform tabular-nums`}
                            >
                              Rs.
                              {(bill.totalAmount || 0).toLocaleString()}
                            </p>
                            <Zap
                              className={`w-4 h-4 text-emerald-500 ${
                                serialActiveIndex === i
                                  ? "opacity-100"
                                  : "opacity-0 group-hover:opacity-100"
                              } transition-opacity`}
                            />
                            {serialActiveIndex === i && (
                              <span
                                className={`text-[9px] px-1.5 py-0.5 rounded bg-emerald-500 text-white font-bold`}
                              >
                                Instant Pay
                              </span>
                            )}
                          </div>
                        </motion.button>
                      ))
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </motion.div>

        {/* Tabs */}
        <FilterTabs
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          stats={stats}
          isDark={isDark}
        />

        {/* ═══ BILLS LIST ═══ */}
        <motion.div
          initial={{ y: 10, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className={`${glassCard} rounded-xl overflow-hidden`}
        >
          <div
            className={`px-3 py-2 border-b ${
              isDark ? "border-white/[0.06]" : "border-black/[0.06]"
            } flex items-center justify-between`}
          >
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-md bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-md">
                <Receipt className="w-3 h-3 text-white" />
              </div>
              <h2
                className={`text-xs font-extrabold ${text} capitalize tracking-tight`}
              >
                {activeTab} Bills
              </h2>
              <span
                className={`text-[10px] px-2 py-0.5 rounded-md font-extrabold ${
                  isDark
                    ? "bg-amber-500/15 text-amber-400"
                    : "bg-amber-100 text-amber-700"
                }`}
              >
                {filteredOrders.length}
              </span>
            </div>
            {filteredOrders.length > 0 && (
              <p
                className={`text-xs font-extrabold ${accent} tabular-nums`}
              >
                Rs.
                {filteredOrders
                  .reduce((s, o) => s + (o.totalAmount || 0), 0)
                  .toLocaleString()}
              </p>
            )}
          </div>

          {filteredOrders.length === 0 ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="p-12 text-center"
            >
              <div
                className={`w-16 h-16 mx-auto mb-3 rounded-2xl flex items-center justify-center ${
                  isDark ? "bg-white/[0.03]" : "bg-black/[0.03]"
                }`}
              >
                <Receipt className={`w-8 h-8 ${mutedText}`} />
              </div>
              <p className={`text-sm font-bold ${text}`}>
                No {activeTab} Bills
              </p>
              <p className={`text-[10px] ${subText} mt-1`}>
                Bills will appear here when created
              </p>
            </motion.div>
          ) : (
            <>
              <div className="max-h-[calc(100vh-280px)] overflow-y-auto">
                <AnimatePresence initial={false}>
                  {paginatedOrders.map((order, i) => {
                    const eff = effectiveStatus(order);
                    const sc = getStatusColors(eff);
                    return (
                      <motion.div
                        key={order.id}
                        initial={{ opacity: 0, x: -15 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 15, height: 0 }}
                        transition={{
                          duration: 0.15,
                          delay: Math.min(i * 0.005, 0.1),
                        }}
                        whileHover={{
                          backgroundColor: isDark
                            ? "rgba(245,158,11,0.04)"
                            : "rgba(245,158,11,0.03)",
                        }}
                        className={`border-b ${
                          isDark
                            ? "border-white/[0.04]"
                            : "border-black/[0.04]"
                        } last:border-b-0 transition-all border-l-2 ${
                          sc.borderLeft
                        }`}
                      >
                        <div className="px-3 py-2 flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2.5 flex-1 min-w-0">
                            <div
                              className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 text-[11px] font-black ${
                                isDark
                                  ? "bg-gradient-to-br from-amber-500/20 to-amber-600/10 text-amber-400 border border-amber-500/20"
                                  : "bg-gradient-to-br from-amber-100 to-amber-50 text-amber-600 border border-amber-200/50"
                              } shadow-sm`}
                            >
                              {i + 1}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span
                                  className={`text-xs font-extrabold ${accent} tracking-tight`}
                                >
                                  #
                                  {order.billSerial ||
                                    order.serialNo}
                                </span>
                                <StatusBadge status={eff} />
                                {(order.isEdited ||
                                  order.wasEdited ||
                                  order.lastEditedBy) && (
                                  <span
                                    className={`text-[9px] px-1.5 py-0 rounded font-bold ${
                                      isDark
                                        ? "bg-purple-500/20 text-purple-400"
                                        : "bg-purple-100 text-purple-700"
                                    }`}
                                  >
                                    EDITED
                                  </span>
                                )}
                                {/* ✅ Show badge if this was a dualMode approved bill */}
                                {order.dualMode &&
                                  order.status === "approved" && (
                                    <span
                                      className={`text-[9px] px-1.5 py-0 rounded font-bold ${
                                        isDark
                                          ? "bg-blue-500/20 text-blue-400"
                                          : "bg-blue-100 text-blue-700"
                                      }`}
                                    >
                                      APPROVED
                                    </span>
                                  )}
                              </div>
                              <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                                <span
                                  className={`text-[11px] ${text} font-semibold truncate`}
                                >
                                  {order.customer?.name || "Walk-in"}
                                </span>
                                {order.customer?.phone && (
                                  <span
                                    className={`text-[10px] ${subText} hidden sm:inline`}
                                  >
                                    • {order.customer.phone}
                                  </span>
                                )}
                                <span
                                  className={`text-[10px] ${mutedText} hidden md:inline`}
                                >
                                  • {fmtTS(order.createdAt)}
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-1 flex-shrink-0">
                            <div className="text-right mr-1.5">
                              <p
                                className={`text-sm font-black ${accent} tabular-nums tracking-tight`}
                              >
                                Rs.
                                {(
                                  order.totalAmount || 0
                                ).toLocaleString()}
                              </p>
                              <p
                                className={`text-[9px] ${subText} font-medium`}
                              >
                                {order.items?.length || 0} items
                              </p>
                            </div>
                            <motion.button
                              whileHover={{ scale: 1.1, y: -1 }}
                              whileTap={{ scale: 0.9 }}
                              onClick={() =>
                                setViewModal({
                                  open: true,
                                  order,
                                })
                              }
                              title="View"
                              className={`p-1.5 rounded-md ${
                                isDark
                                  ? "bg-white/[0.03] border border-white/[0.06] text-gray-400 hover:bg-blue-500/15 hover:text-blue-400 hover:border-blue-500/30"
                                  : "bg-black/[0.03] border border-black/[0.06] text-gray-500 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200"
                              } transition-all shadow-sm`}
                            >
                              <Eye className="w-3 h-3" />
                            </motion.button>
                            {eff === "pending" && (
                              <>
                                <motion.button
                                  whileHover={{
                                    scale: 1.1,
                                    y: -1,
                                  }}
                                  whileTap={{ scale: 0.9 }}
                                  onClick={() =>
                                    setEditModal({
                                      open: true,
                                      order,
                                    })
                                  }
                                  title="Edit"
                                  className="p-1.5 rounded-md bg-amber-500/15 text-amber-500 border border-amber-500/30 hover:bg-amber-500/25 hover:shadow-[0_0_15px_rgba(245,158,11,0.3)] transition-all"
                                >
                                  <Edit3 className="w-3 h-3" />
                                </motion.button>
                                <motion.button
                                  whileHover={{
                                    scale: 1.1,
                                    y: -1,
                                  }}
                                  whileTap={{ scale: 0.9 }}
                                  onClick={() =>
                                    handleInstantPay(order)
                                  }
                                  title="Pay (Instant)"
                                  className="p-1.5 rounded-md bg-gradient-to-br from-emerald-400 to-emerald-600 text-white shadow-[0_4px_15px_rgba(16,185,129,0.4)] hover:shadow-[0_6px_25px_rgba(16,185,129,0.6)] transition-all"
                                >
                                  <Zap className="w-3 h-3" />
                                </motion.button>
                                <motion.button
                                  whileHover={{
                                    scale: 1.1,
                                    y: -1,
                                  }}
                                  whileTap={{ scale: 0.9 }}
                                  onClick={() =>
                                    setCancelModal({
                                      open: true,
                                      order,
                                    })
                                  }
                                  title="Cancel"
                                  className="p-1.5 rounded-md bg-red-500/10 text-red-500 border border-red-500/30 hover:bg-red-500/20 hover:shadow-[0_0_15px_rgba(239,68,68,0.3)] transition-all"
                                >
                                  <XCircle className="w-3 h-3" />
                                </motion.button>
                              </>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>

              {hasMore && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className={`px-3 py-2 border-t ${
                    isDark
                      ? "border-white/[0.06]"
                      : "border-black/[0.06]"
                  }`}
                >
                  <motion.button
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.99 }}
                    onClick={() => setPage((p) => p + 1)}
                    className={`w-full py-2 rounded-lg text-xs font-extrabold transition-all ${
                      isDark
                        ? "bg-gradient-to-r from-amber-500/10 to-amber-500/5 border border-amber-500/30 text-amber-400 hover:from-amber-500/20 hover:to-amber-500/10"
                        : "bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 text-amber-700 hover:from-amber-100 hover:to-orange-100"
                    } shadow-sm hover:shadow-md`}
                  >
                    Load More (
                    {filteredOrders.length - paginatedOrders.length}{" "}
                    remaining)
                  </motion.button>
                </motion.div>
              )}
            </>
          )}
        </motion.div>
      </div>

      {/* MODALS */}
      <AnimatePresence>
        {viewModal.open && (
          <ViewBillModal
            order={viewModal.order}
            isDark={isDark}
            userData={userData}
            storeData={storeData}
            onClose={() =>
              setViewModal({ open: false, order: null })
            }
            onPayment={(o) => {
              setViewModal({ open: false, order: null });
              handleInstantPay(o);
            }}
            onEdit={(o) => {
              setViewModal({ open: false, order: null });
              setEditModal({ open: true, order: o });
            }}
            onCancel={(o) => {
              setViewModal({ open: false, order: null });
              setCancelModal({ open: true, order: o });
            }}
          />
        )}
        {editModal.open && (
          <EditBillModal
            order={editModal.order}
            isDark={isDark}
            userData={userData}
            storeData={storeData}
            onClose={() =>
              setEditModal({ open: false, order: null })
            }
            onPayment={(o) => {
              setEditModal({ open: false, order: null });
              handleInstantPay(o);
            }}
          />
        )}
        {cancelModal.open && (
          <CancelBillModal
            order={cancelModal.order}
            isDark={isDark}
            userData={userData}
            onClose={() =>
              setCancelModal({ open: false, order: null })
            }
          />
        )}
        {qrModal && (
          <QRScannerModal
            isDark={isDark}
            orders={orders}
            onResult={(code) => {
              setQrModal(false);
              if (handleQRPunchRef.current)
                handleQRPunchRef.current(code);
            }}
            onClose={() => setQrModal(false)}
          />
        )}
        {showReviewPanel && (
          <ManualReviewPanel
            isDark={isDark}
            userData={userData}
            onClose={() => setShowReviewPanel(false)}
            onRefresh={() =>
              refreshReviewQueueRef.current &&
              refreshReviewQueueRef.current()
            }
            storeId={userData?.storeId}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

export default memo(CashierDashboard);