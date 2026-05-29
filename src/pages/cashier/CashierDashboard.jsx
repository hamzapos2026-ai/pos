// src/components/cashier/CashierDashboard.jsx
// ✅ PRODUCTION v10.0 — Integrated with OfflinePaymentModal + ManualReviewPanel
// 10K+ orders, no overlap, online/offline, only pending shown

import {
  useState, useEffect, useCallback, useMemo, useRef, memo,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import { List as VirtualList } from "react-window";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../context/ThemeContext";
import {
  collection, query, where, onSnapshot, orderBy, limit,
  doc, getDoc, updateDoc, addDoc, serverTimestamp,
} from "firebase/firestore";
import {
  Search, Sun, Moon, LogOut, Clock, XCircle, User, Eye, Edit3,
  X, Zap, AlertTriangle, ChevronDown, MapPin, Plus,
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
import OfflinePaymentModal from "../../components/cashier/OfflinePaymentModal";

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

const ROW_HEIGHT = 64;
const SEARCH_LIMIT = 12;
const PAGE_SIZE = 100;

const springConfig = {
  type: "spring",
  damping: 25,
  stiffness: 300,
};

/* ═══════════════════════════════════════════════════════════════════
   VIRTUALIZED ROW COMPONENT
═══════════════════════════════════════════════════════════════════ */
const BillRow = memo(({ index, style, ...props }) => {
  const {
    orders, isDark, text, subText, mutedText, accent,
    effectiveStatus, fmtTS, getStatusColors, StatusBadge,
    setViewModal, setEditModal, setCancelModal, handleInstantPay,
  } = props;

  const order = orders[index];
  if (!order) return null;

  const eff = effectiveStatus(order);
  const sc = getStatusColors(eff);

  return (
    <div style={style}>
      <div
        className={`mx-2 my-1 rounded-lg border-l-2 ${sc.borderLeft} ${
          isDark
            ? "bg-white/[0.02] hover:bg-amber-500/[0.05] border border-white/[0.04]"
            : "bg-white hover:bg-amber-500/[0.04] border border-black/[0.04]"
        } transition-colors`}
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
              {index + 1}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className={`text-xs font-extrabold ${accent} tracking-tight`}>
                  #{order.billSerial || order.serialNo}
                </span>
                <StatusBadge status={eff} />
                {(order.isEdited || order.wasEdited || order.lastEditedBy) && (
                  <span className={`text-[9px] px-1.5 py-0 rounded font-bold ${isDark ? "bg-purple-500/20 text-purple-400" : "bg-purple-100 text-purple-700"}`}>
                    EDITED
                  </span>
                )}
                {(order.isManualBill || order.isOfflineManual) && (
                  <span className={`text-[9px] px-1.5 py-0 rounded font-bold ${isDark ? "bg-cyan-500/20 text-cyan-400" : "bg-cyan-100 text-cyan-700"}`}>
                    MANUAL
                  </span>
                )}
                {order.offlinePending && (
                  <span className={`text-[9px] px-1.5 py-0 rounded font-bold ${isDark ? "bg-blue-500/20 text-blue-400" : "bg-blue-100 text-blue-700"}`}>
                    SYNC PENDING
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                <span className={`text-[11px] ${text} font-semibold truncate`}>
                  {order.customer?.name || "Walk-in"}
                </span>
                {order.customer?.phone && (
                  <span className={`text-[10px] ${subText} hidden sm:inline`}>
                    • {order.customer.phone}
                  </span>
                )}
                <span className={`text-[10px] ${mutedText} hidden md:inline`}>
                  • {fmtTS(order.createdAt)}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1 flex-shrink-0">
            <div className="text-right mr-1.5">
              <p className={`text-sm font-black ${accent} tabular-nums tracking-tight`}>
                Rs.{(order.totalAmount || 0).toLocaleString()}
              </p>
              <p className={`text-[9px] ${subText} font-medium`}>
                {order.items?.length || 0} items
              </p>
            </div>

            <button
              onClick={() => setViewModal({ open: true, order })}
              title="View"
              className={`p-1.5 rounded-md ${
                isDark
                  ? "bg-white/[0.03] border border-white/[0.06] text-gray-400 hover:bg-blue-500/15 hover:text-blue-400 hover:border-blue-500/30"
                  : "bg-black/[0.03] border border-black/[0.06] text-gray-500 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200"
              } transition-all shadow-sm active:scale-90`}
            >
              <Eye className="w-3 h-3" />
            </button>

            {eff === "pending" && (
              <>
                <button
                  onClick={() => setEditModal({ open: true, order })}
                  title="Edit"
                  className="p-1.5 rounded-md bg-amber-500/15 text-amber-500 border border-amber-500/30 hover:bg-amber-500/25 transition-all active:scale-90"
                >
                  <Edit3 className="w-3 h-3" />
                </button>
                <button
                  onClick={() => handleInstantPay(order)}
                  title="Pay (Instant)"
                  className="p-1.5 rounded-md bg-gradient-to-br from-emerald-400 to-emerald-600 text-white shadow-[0_4px_15px_rgba(16,185,129,0.4)] hover:shadow-[0_6px_25px_rgba(16,185,129,0.6)] transition-all active:scale-90"
                >
                  <Zap className="w-3 h-3" />
                </button>
                <button
                  onClick={() => setCancelModal({ open: true, order })}
                  title="Cancel"
                  className="p-1.5 rounded-md bg-red-500/10 text-red-500 border border-red-500/30 hover:bg-red-500/20 transition-all active:scale-90"
                >
                  <XCircle className="w-3 h-3" />
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}, (prev, next) => {
  const p = prev.orders?.[prev.index];
  const n = next.orders?.[next.index];
  if (!p || !n) return false;
  return p.id === n.id && p.status === n.status && p.totalAmount === n.totalAmount && prev.index === next.index;
});
BillRow.displayName = "BillRow";

/* ═══════════════════════════════════════════════════════════════════
   MAIN COMPONENT
═══════════════════════════════════════════════════════════════════ */
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

  const [reviewQueue, setReviewQueue] = useState([]);
  const [showReviewPanel, setShowReviewPanel] = useState(false);

  // Search
  const [searchQuery, setSearchQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [searchActiveIndex, setSearchActiveIndex] = useState(-1);
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const searchInputRef = useRef(null);

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
  const [cancelModal, setCancelModal] = useState({ open: false, order: null });
  const [qrModal, setQrModal] = useState(false);
  const [offlinePayModal, setOfflinePayModal] = useState({ open: false, prefilledSerial: "" });

  // Refs
  const handleInstantPayRef = useRef(null);
  const handleQRPunchRef = useRef(null);
  const refreshReviewQueueRef = useRef(null);
  const syncOfflinePaymentsRef = useRef(null);

  const [refreshKey, setRefreshKey] = useState(0);

  const anyModalOpen =
    viewModal.open || editModal.open || cancelModal.open ||
    qrModal || showReviewPanel || offlinePayModal.open;

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

  /* ═══════════════════════════════════════════════════════════════════
     EFFECTIVE STATUS — Simple ON/OFF
  ═══════════════════════════════════════════════════════════════════ */
  const effectiveStatus = useCallback((o) => {
    try {
      if (!o) return "pending";
      if (o.status === "cancelled") return "cancelled";
      if (o.status === "paid") return "paid";
      if (o.paymentStatus === "paid") return "paid";
      if (o.offlineSyncPending === true) return "paid";
      if (o.status === "approved") return "pending";
      return "pending";
    } catch {
      return o?.status || "pending";
    }
  }, []);

  /* ═══════════════════════════════════════════════════════════════════
     CALLBACKS
  ═══════════════════════════════════════════════════════════════════ */

  const forceRefresh = useCallback(() => setRefreshKey((p) => p + 1), []);

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
      let synced = 0, flagged = 0;

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
            // attempt update; on permission error try refreshing token once
            try {
              await updateDoc(doc(db, "orders", op.billId), {
                status: "paid",
                paymentType: op.paymentMethod,
                paidAt: serverTimestamp(),
                paidBy: op.cashierId,
                offlineSync: true,
                offlineSavedAt: op.savedAt,
                isActiveOrder: false,
              });
            } catch (err) {
              console.warn("syncOfflinePayments update error, retrying token refresh:", err?.code || err);
              if (err?.code === "permission-denied" && auth?.currentUser) {
                try { await auth.currentUser.getIdToken(true); } catch {}
                await updateDoc(doc(db, "orders", op.billId), {
                  status: "paid",
                  paymentType: op.paymentMethod,
                  paidAt: serverTimestamp(),
                  paidBy: op.cashierId,
                  offlineSync: true,
                  offlineSavedAt: op.savedAt,
                  isActiveOrder: false,
                });
              } else throw err;
            }
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
          console.error("Sync error:", op.localId, err);
        }
      }

      if (refreshReviewQueueRef.current) await refreshReviewQueueRef.current();
      toast.dismiss("sync");
      if (synced > 0) toast.success(`✅ ${synced} payment${synced > 1 ? "s" : ""} synced`);
      if (flagged > 0) {
        toast.error(`⚠️ ${flagged} need review`, {
          icon: <FileWarning className="w-4 h-4 text-orange-500" />,
        });
      }
    } catch {
      toast.dismiss("sync");
    }
  }, []);

  useEffect(() => {
    syncOfflinePaymentsRef.current = syncOfflinePayments;
  }, [syncOfflinePayments]);

  /* ─── Instant Pay ─── */
  const handleInstantPay = useCallback(
    async (order) => {
      const tid = toast.loading("Processing payment...", { duration: 2000 });
      const sid = userData?.storeId || userData?.primaryStore || order.storeId || "default";
      const cn = userData?.displayName || userData?.name || "Cashier";
      const cashierId = auth?.currentUser?.uid || currentUser?.uid || userData?.uid || "";
      const now = new Date();

      // Ensure user is authenticated before attempting writes
      if (!currentUser && !auth?.currentUser) {
        toast.error("Not authenticated — please login to perform payments", { id: tid });
        console.error("[Cashier] Payment blocked: unauthenticated user");
        return;
      }

        if (!navigator.onLine) {
        try {
          const saved = await saveOfflinePayment({
            billId: order.id,
            billSerial: order.billSerial || order.serialNo,
            enteredAmount: order.totalAmount || 0,
            paymentMethod: order.paymentType || "Cash",
            cashierId: cashierId,
            cashierName: cn,
            storeId: sid,
          });

          if (!saved || !saved.success) throw new Error(saved?.error || "Offline save failed");

          setOrders((prev) =>
            prev.map((o) =>
              o.id === order.id
                ? {
                    ...o,
                    status: "paid",
                    paymentType: order.paymentType || "Cash",
                    paidBy: cashierId,
                    paidByName: cn,
                    amountReceived: order.totalAmount || 0,
                    changeGiven: 0,
                    offlineSyncPending: true,
                    offlineSavedAt: new Date().toISOString(),
                    isActiveOrder: false,
                  }
                : o
            )
          );

          toast.success(`Saved offline — #${order.billSerial || order.serialNo}`, {
            id: tid,
            icon: <WifiOff className="w-4 h-4 text-blue-500" />,
            duration: 3000,
          });
        } catch (error) {
          console.error("Offline payment failed:", error);
          toast.error("Failed to save offline payment", { id: tid });
        }
        return;
      }

      try {
        // Try the write operations; on permission error, refresh token and retry once
        // Perform writes sequentially so we can identify which operation fails due to rules
        const doPaymentWrites = async (startFromOp = null) => {
          const activeCashierId = auth?.currentUser?.uid || currentUser?.uid || userData?.uid || "";

          // 1) update order document
          if (!startFromOp || startFromOp === "updateOrder") {
            try {
              await updateDoc(doc(db, "orders", order.id), {
                status: "paid",
                paymentType: order.paymentType || "Cash",
                paidAt: serverTimestamp(),
                paidBy: activeCashierId,
                paidByName: cn,
                billEndTime: now.toISOString(),
                amountReceived: order.totalAmount || 0,
                changeGiven: 0,
                cashierHandover: true,
                isActiveOrder: false,
              });
            } catch (e) {
              e._op = "updateOrder";
              throw e;
            }
          }

          // 2) add cashier action
          if (!startFromOp || startFromOp === "updateOrder" || startFromOp === "addCashierAction") {
            try {
              await addDoc(collection(db, "cashierActions"), {
                actionType: "PAID",
                orderId: order.id,
                billSerial: order.billSerial || order.serialNo || "",
                serialNo: order.serialNo || order.billSerial || "",
                storeId: sid,
                cashierId: activeCashierId,
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
              });
            } catch (e) {
              e._op = "addCashierAction";
              throw e;
            }
          }

          // 3) log cashier action (internal service; may write elsewhere)
          try {
            await logCashierAction({
              action: "PAYMENT_RECEIVED",
              orderId: order.id,
              billSerial: order.billSerial || order.serialNo,
              userId: activeCashierId,
              userName: cn,
              storeId: sid,
              amount: order.totalAmount || 0,
              paymentType: order.paymentType || "Cash",
            });
          } catch (e) {
            e._op = "logCashierAction";
            throw e;
          }
        };
        let originalErr = null;
        try {
          await doPaymentWrites();
        } catch (err) {
          originalErr = err;
          console.warn("[Cashier] Write failed, attempting token refresh:", err?._op || err?.code || err);
          if (err?.code === "permission-denied" && auth?.currentUser) {
            try { await auth.currentUser.getIdToken(true); } catch (tErr) { console.warn("token refresh failed", tErr); }
            // retry once from the failed operation
            const failedOp = err?._op || "updateOrder";
            try {
              await doPaymentWrites(failedOp);
            } catch (e2) {
              // preserve the original op context
              e2._op = originalErr?._op || e2._op || failedOp;
              throw e2;
            }
          } else throw err;
        }
        toast.success(`💰 Paid Rs.${(order.totalAmount || 0).toLocaleString()}`, {
          id: tid,
          duration: 2000,
          icon: <Sparkles className="w-4 h-4 text-emerald-500" />,
        });
      } catch (err) {
        console.error("[Cashier] Payment error:", err);
        if (err?.code === "permission-denied") {
          toast.error("Permission denied: please re-login or check Firebase rules", { id: tid });
        } else {
          toast.error("Payment failed. Please try again.", { id: tid });
        }
      }
    },
    [userData, currentUser]
  );

  useEffect(() => {
    handleInstantPayRef.current = handleInstantPay;
  }, [handleInstantPay]);

  /* ─── QR punch (with offline fallback) ─── */
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

      // ✅ Not found → if offline, auto-open OfflinePaymentModal
      if (!found) {
        if (!navigator.onLine) {
          toast("Bill not found — Opening offline entry", {
            icon: <WifiOff className="w-4 h-4 text-blue-500" />,
          });
          setOfflinePayModal({ open: true, prefilledSerial: parsed.id });
          return;
        }
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
        toast("Bill already paid", { icon: <Eye className="w-4 h-4 text-amber-500" /> });
        return;
      }
      if (eff === "cancelled") {
        toast.error("This bill has been cancelled");
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

  /* ═══════════════════════════════════════════════════════════════════
     MEMOIZED VALUES — 10K+ ready
  ═══════════════════════════════════════════════════════════════════ */

  const isValidDate = useCallback((o) => {
    try {
      const ts = o.createdAt || o.savedAt;
      if (!ts) return false;
      const d = ts?.toDate ? ts.toDate() : new Date(ts);
      return d && !isNaN(d.getTime());
    } catch {
      return false;
    }
  }, []);

  /* ✅ Only active/pending visible — processed bills hidden */
  const visibleOrders = useMemo(() => {
    return orders.filter((o) => {
      if (!isValidDate(o)) return false;
      if (o.isDeleted || o.deleted) return false;
      if (o.sendToCashier === false) return false;

      // HIDE paid, completed, cancelled, or archived bills
      const status = String(o.status || '').toLowerCase();
      const paymentStatus = String(o.paymentStatus || '').toLowerCase();
      
      if (status === 'paid' || paymentStatus === 'paid' || status === 'cancelled' || status === 'completed' || o.isArchived) {
        return false;
      }
      return true;
    });
  }, [orders, isValidDate]);

  const filteredOrders = useMemo(() => {
    if (activeTab === "all") {
      return visibleOrders.filter((o) => effectiveStatus(o) !== "paid");
    }
    return visibleOrders.filter((o) => effectiveStatus(o) === activeTab);
  }, [visibleOrders, activeTab, effectiveStatus]);

  const stats = useMemo(
    () => ({
      all: visibleOrders.filter((o) => effectiveStatus(o) !== "paid").length,
      pending: visibleOrders.filter((o) => effectiveStatus(o) === "pending").length,
      paid: visibleOrders.filter((o) => effectiveStatus(o) === "paid").length,
      cancelled: visibleOrders.filter((o) => effectiveStatus(o) === "cancelled").length,
    }),
    [visibleOrders, effectiveStatus]
  );

  const totalAmount = useMemo(
    () => filteredOrders.reduce((s, o) => s + (o.totalAmount || 0), 0),
    [filteredOrders]
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
  }, [searchQuery, orders]);

  const serialResults = useMemo(() => {
    if (!serialInput.trim()) return [];
    const uq = serialInput.trim().toUpperCase();
    const results = [];
    // Use visibleOrders and exclude paid bills to keep serial search consistent
    const pool = visibleOrders.filter((o) => effectiveStatus(o) !== "paid");
    for (let i = 0; i < pool.length && results.length < SEARCH_LIMIT; i++) {
      const o = pool[i];
      const s = (o.billSerial || o.serialNo || "").toUpperCase();
      if (s.includes(uq)) results.push(o);
    }
    return results;
  }, [serialInput, orders, effectiveStatus]);

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
      toast.success("Refreshed!", { icon: <RefreshCw className="w-4 h-4" /> });
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
      if (e.key === "Enter" && serialInput.trim() && serialResults.length === 0) {
        e.preventDefault();
        // ✅ Offline + no result → open manual offline modal
        if (!navigator.onLine) {
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
    [serialResults, serialActiveIndex, serialInput]
  );

  /* ═══════════════════════════════════════════════════════════════════
     USEEFFECTS
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
        if (syncOfflinePaymentsRef.current) await syncOfflinePaymentsRef.current();
        if (refreshReviewQueueRef.current) await refreshReviewQueueRef.current();
      } catch (err) {
        console.error("[Cashier] Online sync:", err);
      }
    };
    const goOffline = () => {
      setIsOnline(false);
      toast("Offline mode", {
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
    if (!currentUser) { setLoading(false); return; }
    const sid = userData?.storeId || userData?.primaryStore;
    if (!sid) return;
    (async () => {
      try {
        const ss = await getDoc(doc(db, "stores", sid));
        if (ss.exists()) setStoreData({ id: ss.id, ...ss.data() });
      } catch (err) {
        console.error("[Cashier] Store fetch:", err);
      }
    })();
  }, [currentUser, userData?.storeId, userData?.primaryStore]);

  /* ✅ Firebase listener — 10K limit */
  useEffect(() => {
    if (!currentUser) { setLoading(false); return; }
    if (!userData) return;

    setLoading(true);
    idbLoad().then((c) => {
      if (c.length > 0) setOrders((p) => (p.length === 0 ? c : p));
    });

    if (!navigator.onLine) {
      setLoading(false);
      return;
    }

    const sid = userData?.storeId || userData?.primaryStore;
    let q;
    try {
      q = sid
        ? query(
            collection(db, "orders"),
            where("storeId", "==", sid),
            where("isActiveOrder", "==", true)
          )
        : query(
            collection(db, "orders"),
            where("isActiveOrder", "==", true)
          );
    } catch {
      q = query(
        collection(db, "orders"),
        where("isActiveOrder", "==", true)
      );
    }

    const unsub = onSnapshot(
      q,
      (snap) => {
        const f = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
          .filter((o) => !o.isDeleted)
          .sort((a, b) => {
            const t1 = a.createdAt ? (a.createdAt.toDate ? a.createdAt.toDate().getTime() : new Date(a.createdAt).getTime()) : 0;
            const t2 = b.createdAt ? (b.createdAt.toDate ? b.createdAt.toDate().getTime() : new Date(b.createdAt).getTime()) : 0;
            return t2 - t1;
          });
        setOrders(f);
        setLoading(false);
        idbSave(f);
      },
      (err) => {
        console.error("❌ Firebase error:", err);
        setLoading(false);
        if (!navigator.onLine || err.code === "unavailable") return;
        toast.error(`Query failed: ${err.message}`);
      }
    );
    return () => unsub();
  }, [currentUser, userData, refreshKey]);

  useEffect(() => {
    if (refreshReviewQueueRef.current) refreshReviewQueueRef.current();
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
    if (!ts) return "—";
    try {
      const d = ts.toDate ? ts.toDate() : new Date(ts);
      return d.toLocaleString("en-US", {
        month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
      });
    } catch {
      return "—";
    }
  }, []);

  const getStatusColors = useCallback((status) => {
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
    if (!ts) return "";
    try {
      const d = ts.toDate ? ts.toDate() : new Date(ts);
      const s = Math.floor((new Date() - d) / 1000);
      if (s < 60) return `${s}s ago`;
      if (s < 3600) return `${Math.floor(s / 60)}m ago`;
      if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
      return `${Math.floor(s / 86400)}d ago`;
    } catch {
      return "";
    }
  };

  const virtualListData = useMemo(
    () => ({
      orders: filteredOrders,
      isDark, text, subText, mutedText, accent,
      effectiveStatus, fmtTS, getStatusColors, StatusBadge,
      setViewModal, setEditModal, setCancelModal, handleInstantPay,
    }),
    [filteredOrders, isDark, text, subText, mutedText, accent,
      effectiveStatus, fmtTS, getStatusColors, StatusBadge, handleInstantPay]
  );

  if (loading)
    return (
      <div className={`min-h-screen ${bg} ${bgOverlay} flex items-center justify-center`}>
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="text-center">
          <div className="relative">
            <Loader2 className="w-12 h-12 text-amber-500 animate-spin mx-auto mb-4" />
            <div className="absolute inset-0 w-12 h-12 mx-auto bg-amber-500/20 rounded-full blur-2xl animate-pulse" />
          </div>
          <p className={`${text} text-base font-bold tracking-wide`}>Loading...</p>
        </motion.div>
      </div>
    );

  /* ═══════════════════════════════════════════════════════════════════
     RENDER
  ═══════════════════════════════════════════════════════════════════ */
  return (
    <div className={`min-h-screen ${bg} ${text} relative`}>
      <div className={`fixed inset-0 ${bgOverlay} pointer-events-none`} />

      {/* ALERTS */}
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
            onClick={() => setShowReviewPanel(true)}
            className="relative z-40 w-full bg-gradient-to-r from-orange-600 via-amber-500 to-orange-600 text-white text-[11px] py-1.5 font-bold flex items-center justify-center gap-2"
          >
            <FileWarning className="w-3 h-3" />
            <span>{reviewQueue.length} payment{reviewQueue.length !== 1 ? "s" : ""} need review</span>
            <span className="underline opacity-90">Click here</span>
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
              <div className="leading-tight">
                <h1 className={`font-extrabold text-sm tracking-tight ${text}`}>
                  {storeData?.name || "POS Cashier"}
                </h1>
                <p className={`text-[10px] ${subText} flex items-center gap-1 font-medium`}>
                  <MapPin className="w-2.5 h-2.5 text-amber-500" />
                  {storeData?.city || "Store"}
                </p>
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
                {isOnline ? (<><Wifi className="w-2.5 h-2.5" /> LIVE</>) : (<><WifiOff className="w-2.5 h-2.5" /> OFFLINE</>)}
              </div>

              {/* ✅ MANUAL/OFFLINE BILL BUTTON */}
              <motion.button
                whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.92 }}
                onClick={() => setOfflinePayModal({ open: true, prefilledSerial: "" })}
                className={`hidden sm:flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-white text-[10px] font-extrabold shadow-lg transition-all ${
                  isOnline
                    ? "bg-gradient-to-br from-emerald-500 to-green-600 shadow-emerald-500/40 hover:shadow-emerald-500/60"
                    : "bg-gradient-to-br from-blue-500 to-blue-600 shadow-blue-500/40 hover:shadow-blue-500/60"
                }`}
                title={isOnline ? "Manual Bill" : "Offline Bill"}
              >
                {isOnline ? <Plus className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
                {isOnline ? "MANUAL" : "OFFLINE BILL"}
              </motion.button>

              <button
                onClick={forceRefresh}
                className={`p-1.5 rounded-lg ${glassCard} hover:border-blue-500/50 transition-all active:scale-90`}
                title="Refresh"
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
      <div className="relative px-3 lg:px-5 py-2.5 space-y-2.5 max-w-[1600px] mx-auto">
        <button
          onClick={() => setShowStats((v) => !v)}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg ${glassCard} hover:border-amber-500/40 transition-all text-xs font-bold ${text} active:scale-95`}
        >
          <motion.div animate={{ rotate: showStats ? 180 : 0 }}>
            <ChevronDown className="w-3 h-3" />
          </motion.div>
          Stats
          <span className={`text-[10px] px-2 py-0.5 rounded-md font-extrabold ${isDark ? "bg-amber-500/20 text-amber-400" : "bg-amber-100 text-amber-700"}`}>
            {stats.pending} pending
          </span>
          <span className={`text-[10px] px-2 py-0.5 rounded-md font-extrabold ${isDark ? "bg-blue-500/20 text-blue-400" : "bg-blue-100 text-blue-700"}`}>
            {orders.length.toLocaleString()} total
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
                { label: "Total", val: stats.all, gradient: "from-blue-500 to-blue-600" },
                { label: "Pending", val: stats.pending, gradient: "from-amber-500 to-orange-500" },
                { label: "Paid", val: stats.paid, gradient: "from-emerald-500 to-green-500" },
                { label: "Cancelled", val: stats.cancelled, gradient: "from-red-500 to-rose-500" },
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
                placeholder="Search bills, name, phone..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setTimeout(() => setSearchFocused(false), 200)}
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
                      <span>↑↓ Navigate</span><span>•</span><span>Enter Select</span><span>•</span><span>Esc Close</span>
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
                            <p className={`text-xs ${text} font-medium truncate mt-0.5`}>{bill.customer?.name || "Walk-in"}</p>
                            <p className={`text-[10px] ${mutedText} mt-0.5`}>{bill.items?.length || 0} items • {timeAgo(bill.createdAt)}</p>
                          </div>
                          <p className={`text-sm font-black ${accent} tabular-nums ml-2`}>
                            Rs.{(bill.totalAmount || 0).toLocaleString()}
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
                  placeholder="Scan barcode or type serial..."
                  value={serialInput}
                  onChange={(e) => setSerialInput(e.target.value)}
                  onFocus={() => setSerialFocused(true)}
                  onBlur={() => setTimeout(() => setSerialFocused(false), 200)}
                  onKeyDown={handleSerialKeyDown}
                  className={`w-full pl-9 pr-9 py-2.5 rounded-lg text-xs font-semibold transition-all ${inputBg} ${
                    serialFocused ? "border-amber-500/60 ring-4 ring-amber-500/15" : ""
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
                title="Camera Scanner"
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
                          {!isOnline ? "Press Enter to create offline bill" : "Try different serial"}
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
                            <p className={`text-xs ${text} font-medium mt-0.5`}>{bill.customer?.name || "Walk-in"}</p>
                          </div>
                          <div className="flex items-center gap-2 ml-2">
                            <p className={`text-sm font-black ${accent} tabular-nums`}>
                              Rs.{(bill.totalAmount || 0).toLocaleString()}
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
          <FilterTabs activeTab={activeTab} setActiveTab={setActiveTab} stats={stats} isDark={isDark} />
        </div>

        {/* MOBILE FAB */}
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setOfflinePayModal({ open: true, prefilledSerial: "" })}
          className={`sm:hidden fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full text-white flex items-center justify-center ${
            isOnline
              ? "bg-gradient-to-br from-emerald-500 to-green-600 shadow-[0_8px_30px_rgba(16,185,129,0.5)]"
              : "bg-gradient-to-br from-blue-500 to-blue-600 shadow-[0_8px_30px_rgba(59,130,246,0.5)]"
          }`}
          title={isOnline ? "Manual Bill" : "Offline Bill"}
        >
          {isOnline ? <Plus className="w-6 h-6" /> : <WifiOff className="w-6 h-6" />}
        </motion.button>

        {/* BILLS LIST */}
        <div
          ref={listContainerRef}
          className={`${glassCard} rounded-xl overflow-hidden relative`}
          style={{ zIndex: 5 }}
        >
          <div className={`px-3 py-2 border-b ${isDark ? "border-white/[0.06]" : "border-black/[0.06]"} flex items-center justify-between`}>
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-md bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-md">
                <Receipt className="w-3 h-3 text-white" />
              </div>
              <h2 className={`text-xs font-extrabold ${text} capitalize tracking-tight`}>{activeTab} Bills</h2>
              <span className={`text-[10px] px-2 py-0.5 rounded-md font-extrabold ${isDark ? "bg-amber-500/15 text-amber-400" : "bg-amber-100 text-amber-700"}`}>
                {filteredOrders.length.toLocaleString()}
              </span>
            </div>
            {filteredOrders.length > 0 && (
              <p className={`text-xs font-extrabold ${accent} tabular-nums`}>
                Rs.{totalAmount.toLocaleString()}
              </p>
            )}
          </div>

          {filteredOrders.length === 0 ? (
            <div className="p-12 text-center">
              <div className={`w-16 h-16 mx-auto mb-3 rounded-2xl flex items-center justify-center ${isDark ? "bg-white/[0.03]" : "bg-black/[0.03]"}`}>
                <Receipt className={`w-8 h-8 ${mutedText}`} />
              </div>
              <p className={`text-sm font-bold ${text}`}>No {activeTab} Bills</p>
              <p className={`text-[10px] ${subText} mt-1`}>Bills will appear here when created</p>
            </div>
          ) : (
              <VirtualList
                height={listHeight}
                rowCount={filteredOrders.length}
                rowHeight={ROW_HEIGHT}
                width="100%"
                rowProps={virtualListData}
                rowComponent={BillRow}
                overscanCount={5}
                className="scrollbar-thin"
              />
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
            onPayment={(o) => { setEditModal({ open: false, order: null }); handleInstantPay(o); }}
          />
        )}
        {cancelModal.open && (
          <CancelBillModal
            order={cancelModal.order}
            isDark={isDark}
            userData={userData}
            onClose={() => setCancelModal({ open: false, order: null })}
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
        {offlinePayModal.open && (
          <OfflinePaymentModal
            isDark={isDark}
            userData={userData}
            prefilledSerial={offlinePayModal.prefilledSerial}
            onClose={() => setOfflinePayModal({ open: false, prefilledSerial: "" })}
            onSaved={() => {
              if (refreshReviewQueueRef.current) refreshReviewQueueRef.current();
              forceRefresh();
            }}
          />
        )}
        {showReviewPanel && (
          <ManualReviewPanel
            isDark={isDark}
            userData={userData}
            onClose={() => setShowReviewPanel(false)}
            onRefresh={() => refreshReviewQueueRef.current && refreshReviewQueueRef.current()}
            storeId={userData?.storeId}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

export default memo(CashierDashboard);