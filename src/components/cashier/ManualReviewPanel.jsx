// src/components/cashier/ManualReviewPanel.jsx
// ✅ PREMIUM v3 — Glass UI, smooth animations
// 🔧 FIXED: Uses correct exports (getManualReviewQueue, resolveManualReview)

import React, { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, FileWarning, CheckCircle, XCircle, AlertTriangle, Loader2,
  Search, Smartphone, Calendar, User, Hash, Shield, RefreshCw,
} from "lucide-react";
import { toast } from "react-hot-toast";
import {
  getManualReviewQueue,
  resolveManualReview,
} from "../../services/offlinePaymentService";
import { logCashierAction } from "../../services/cashierAuditService";
import { doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../../services/firebase";

const ManualReviewPanel = ({ isDark, userData, onClose, onRefresh, storeId }) => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");

  // ✅ Auth check
  const userRole = (userData?.role || userData?.primaryRole || "").toLowerCase();
  const userRoles = (userData?.roles || []).map((r) => r.toLowerCase());
  const isAuthorized =
    ["admin", "manager", "superadmin", "superAdmin".toLowerCase()].includes(userRole) ||
    userRoles.some((r) => ["admin", "manager", "superadmin"].includes(r));

  /* ─── Premium Theme ─── */
  const modalBg = isDark
    ? "bg-gradient-to-br from-[#13101a] to-[#0a080d] border border-white/[0.08] shadow-[0_30px_80px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.04)]"
    : "bg-gradient-to-br from-white to-gray-50 border border-black/[0.06] shadow-[0_30px_80px_rgba(0,0,0,0.15),inset_0_1px_0_rgba(255,255,255,0.8)]";

  const innerCard = isDark
    ? "bg-[#0d0a14]/80 border border-white/[0.06] shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]"
    : "bg-white border border-black/[0.06] shadow-sm";

  const innerCardHighlight = isDark
    ? "bg-[#1a1424] border border-white/[0.06]"
    : "bg-gray-50 border border-black/[0.04]";

  const border = isDark ? "border-white/[0.06]" : "border-black/[0.06]";
  const text = isDark ? "text-gray-50" : "text-gray-900";
  const subText = isDark ? "text-gray-400" : "text-gray-600";
  const mutedText = isDark ? "text-gray-500" : "text-gray-500";
  const inputBg = isDark
    ? "bg-[#0d0a14]/80 border border-white/[0.08] text-gray-100 placeholder:text-gray-500"
    : "bg-white border border-black/[0.08] text-gray-900 placeholder:text-gray-400";

  /* ─── Load review items ─── */
  const loadItems = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getManualReviewQueue(storeId);
      setItems(data || []);
    } catch (err) {
      console.error("[Review] Load failed:", err);
      toast.error("Failed to load review queue");
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  /* ─── ESC close ─── */
  useEffect(() => {
    const h = (e) => {
      if (e.key === "Escape" && !processing) {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose, processing]);

  /* ─── Resolve handler ─── */
  const handleResolve = async (item, decision) => {
    setProcessing(item.localId);
    const tid = toast.loading(`Marking as ${decision}...`);

    try {
      // 1. If approving, update bill to paid
      if (decision === "approve" && item.billId) {
        try {
          await updateDoc(doc(db, "orders", item.billId), {
            status: "paid",
            paymentType: item.paymentMethod || "Cash",
            paidAt: serverTimestamp(),
            paidBy: userData?.uid || "",
            paidByName: userData?.displayName || userData?.name || "Admin",
            amountReceived: item.enteredAmount,
            changeGiven: 0,
            manualReviewApproved: true,
            manualReviewBy: userData?.displayName || userData?.name || "Admin",
            manualReviewAt: serverTimestamp(),
            cashierHandover: true,
          });
        } catch (err) {
          console.warn("[Review] Bill update failed (might be manual entry):", err);
        }
      }

      // 2. Resolve in IndexedDB
      await resolveManualReview(item.localId, decision);

      // 3. Audit log
      await logCashierAction({
        action: `MANUAL_REVIEW_${decision.toUpperCase()}`,
        orderId: item.billId || "",
        billSerial: item.billSerial || "",
        userId: userData?.uid || "",
        userName: userData?.displayName || userData?.name || "Admin",
        storeId: item.storeId || storeId || "",
        amount: item.enteredAmount || 0,
        paymentType: item.paymentMethod || "Cash",
        metadata: {
          reason: item.reviewReason,
          decision,
          localId: item.localId,
          deviceId: item.deviceId,
          originalSavedAt: item.savedAt,
        },
      });

      toast.success(
        decision === "approve"
          ? "✓ Approved & marked paid"
          : decision === "investigate"
          ? "Flagged for investigation"
          : "Rejected",
        { id: tid }
      );

      await loadItems();
      onRefresh?.();
    } catch (err) {
      console.error("[Review] Resolve error:", err);
      toast.error("Failed to resolve", { id: tid });
    } finally {
      setProcessing(null);
    }
  };

  /* ─── Filter search ─── */
  const filteredItems = items.filter((item) => {
    if (!searchTerm.trim()) return true;
    const s = searchTerm.toLowerCase();
    return (
      (item.billSerial || "").toLowerCase().includes(s) ||
      (item.cashierName || "").toLowerCase().includes(s) ||
      (item.reviewReason || "").toLowerCase().includes(s)
    );
  });

  /* ─── Format date ─── */
  const fmtDate = (iso) => {
    try {
      return new Date(iso).toLocaleString("en-PK", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "—";
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4"
      data-modal-open="true"
    >
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/70 backdrop-blur-md"
        onClick={() => !processing && onClose()}
      />

      {/* Modal */}
      <motion.div
        initial={{ scale: 0.95, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0, y: 20 }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        className={`relative w-full max-w-3xl ${modalBg} rounded-2xl flex flex-col overflow-hidden`}
        style={{ maxHeight: "92vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Premium Header ── */}
        <div
          className={`flex items-center justify-between px-5 py-4 border-b ${border} flex-shrink-0 ${
            isDark
              ? "bg-gradient-to-r from-orange-900/20 via-amber-900/10 to-transparent"
              : "bg-gradient-to-r from-orange-50 via-amber-50/40 to-transparent"
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-amber-600 rounded-xl flex items-center justify-center shadow-[0_4px_15px_rgba(249,115,22,0.4),inset_0_1px_0_rgba(255,255,255,0.2)]">
                <FileWarning className="text-white w-5 h-5" />
              </div>
              <div className="absolute inset-0 w-10 h-10 bg-orange-500 rounded-xl blur-xl opacity-30" />
            </div>
            <div>
              <h2 className={`font-extrabold text-base ${text} tracking-tight`}>
                Manual Review
              </h2>
              <p className={`text-[11px] ${subText} font-medium`}>
                {filteredItems.length} payment{filteredItems.length !== 1 ? "s" : ""} need review
                · ESC to close
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <motion.button
              whileHover={{ scale: 1.05, rotate: 180 }}
              whileTap={{ scale: 0.95 }}
              transition={{ duration: 0.3 }}
              onClick={loadItems}
              disabled={loading}
              className={`p-2 rounded-lg ${innerCard} hover:border-amber-500/40 transition-all`}
              title="Refresh"
            >
              <RefreshCw className={`w-4 h-4 ${subText} ${loading ? "animate-spin" : ""}`} />
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.05, rotate: 90 }}
              whileTap={{ scale: 0.95 }}
              onClick={onClose}
              disabled={!!processing}
              className={`p-2 rounded-lg ${subText} hover:text-red-500 hover:bg-red-500/10 transition-all disabled:opacity-50`}
            >
              <X className="w-4 h-4" />
            </motion.button>
          </div>
        </div>

        {/* ── Search Bar (only if authorized + has items) ── */}
        {isAuthorized && items.length > 0 && (
          <div className={`px-5 py-3 border-b ${border} flex-shrink-0`}>
            <div className="relative">
              <Search className={`absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 ${mutedText}`} />
              <input
                type="text"
                placeholder="Search by serial, cashier, reason..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className={`w-full pl-9 pr-3 py-2 rounded-lg text-xs font-medium focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 transition-all ${inputBg}`}
              />
            </div>
          </div>
        )}

        {/* ── Body ── */}
        <div className="flex-1 overflow-y-auto p-5">
          {!isAuthorized ? (
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="text-center py-12"
            >
              <div className="relative inline-block">
                <Shield className="w-16 h-16 text-red-500 mx-auto mb-4" />
                <div className="absolute inset-0 w-16 h-16 bg-red-500 rounded-full blur-2xl opacity-20" />
              </div>
              <p className={`text-xl font-extrabold ${text} mb-1`}>Access Restricted</p>
              <p className={`text-sm ${subText}`}>
                Only Admin or Manager can review payments
              </p>
              <p className={`text-[10px] ${mutedText} mt-2`}>
                Your role: <span className="font-bold uppercase">{userRole || "unknown"}</span>
              </p>
            </motion.div>
          ) : loading ? (
            <div className="text-center py-12">
              <div className="relative inline-block">
                <Loader2 className="w-10 h-10 text-amber-500 animate-spin mx-auto" />
                <div className="absolute inset-0 w-10 h-10 bg-amber-500 rounded-full blur-2xl opacity-20 animate-pulse" />
              </div>
              <p className={`${subText} text-sm mt-3 font-medium`}>Loading queue...</p>
            </div>
          ) : filteredItems.length === 0 ? (
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="text-center py-12"
            >
              <div className="relative inline-block mb-4">
                <CheckCircle className="w-16 h-16 text-emerald-500 mx-auto" />
                <div className="absolute inset-0 w-16 h-16 bg-emerald-500 rounded-full blur-2xl opacity-20" />
              </div>
              <p className={`text-xl font-extrabold ${text} mb-1`}>
                {searchTerm ? "No Matches" : "All Clear"}
              </p>
              <p className={`text-sm ${subText}`}>
                {searchTerm
                  ? `No results for "${searchTerm}"`
                  : "No payments need review at this time"}
              </p>
            </motion.div>
          ) : (
            <div className="space-y-3">
              <AnimatePresence>
                {filteredItems.map((item, i) => (
                  <motion.div
                    key={item.localId}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: 50 }}
                    transition={{ delay: i * 0.04 }}
                    className={`rounded-xl p-4 ${innerCard} hover:shadow-[0_8px_25px_rgba(0,0,0,0.15)] transition-all`}
                  >
                    {/* Row 1: Header */}
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-orange-500/20 to-amber-500/10 border border-orange-500/30 flex items-center justify-center flex-shrink-0">
                          <Hash className="w-3.5 h-3.5 text-orange-500" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-extrabold ${text} tracking-tight truncate`}>
                            #{item.billSerial || "MANUAL"}
                          </p>
                          <div className="flex items-center gap-2 flex-wrap mt-0.5">
                            <span className={`text-[10px] ${mutedText} flex items-center gap-0.5`}>
                              <Smartphone className="w-2.5 h-2.5" />
                              {item.deviceId?.slice(0, 16) || "Unknown"}
                            </span>
                            <span className={`text-[10px] ${mutedText} flex items-center gap-0.5`}>
                              <Calendar className="w-2.5 h-2.5" />
                              {fmtDate(item.savedAt)}
                            </span>
                            {item.cashierName && (
                              <span className={`text-[10px] ${mutedText} flex items-center gap-0.5`}>
                                <User className="w-2.5 h-2.5" />
                                {item.cashierName}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <span className="text-[9px] px-2 py-1 rounded-full bg-orange-500/15 text-orange-500 font-extrabold tracking-wider whitespace-nowrap border border-orange-500/30">
                        MANUAL REVIEW
                      </span>
                    </div>

                    {/* Row 2: Amount + Method */}
                    <div className="grid grid-cols-2 gap-2 mb-3">
                      <div className={`p-3 rounded-lg ${innerCardHighlight}`}>
                        <p className={`text-[9px] ${subText} uppercase font-extrabold tracking-wider mb-0.5`}>
                          Amount Entered
                        </p>
                        <p className="text-lg font-black bg-gradient-to-br from-amber-400 to-orange-500 bg-clip-text text-transparent tabular-nums">
                          Rs.{Number(item.enteredAmount).toLocaleString()}
                        </p>
                      </div>
                      <div className={`p-3 rounded-lg ${innerCardHighlight}`}>
                        <p className={`text-[9px] ${subText} uppercase font-extrabold tracking-wider mb-0.5`}>
                          Payment Method
                        </p>
                        <p className={`text-sm font-bold ${text}`}>
                          {item.paymentMethod || "Cash"}
                        </p>
                      </div>
                    </div>

                    {/* Row 3: Reason */}
                    <div
                      className={`p-3 rounded-lg mb-3 ${
                        isDark
                          ? "bg-red-900/20 border border-red-700/40"
                          : "bg-red-50 border border-red-200"
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="text-[10px] text-red-500 font-extrabold uppercase tracking-wider mb-0.5">
                            Reason for Review
                          </p>
                          <p className={`text-xs ${text} font-medium`}>
                            {item.reviewReason || "Unspecified mismatch"}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Row 4: Action Buttons */}
                    <div className="flex gap-2">
                      <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => handleResolve(item, "approve")}
                        disabled={processing === item.localId}
                        className="flex-1 py-2 rounded-lg bg-gradient-to-r from-emerald-500 to-emerald-600 text-white text-xs font-extrabold flex items-center justify-center gap-1.5 shadow-[0_4px_15px_rgba(16,185,129,0.3)] hover:shadow-[0_6px_25px_rgba(16,185,129,0.5)] disabled:opacity-50 transition-all"
                      >
                        {processing === item.localId ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <CheckCircle className="w-3.5 h-3.5" />
                        )}
                        Approve
                      </motion.button>
                      <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => handleResolve(item, "investigate")}
                        disabled={processing === item.localId}
                        className="flex-1 py-2 rounded-lg bg-amber-500/15 text-amber-500 border border-amber-500/30 text-xs font-extrabold flex items-center justify-center gap-1.5 hover:bg-amber-500/25 hover:shadow-[0_0_15px_rgba(245,158,11,0.2)] disabled:opacity-50 transition-all"
                      >
                        <AlertTriangle className="w-3.5 h-3.5" />
                        Investigate
                      </motion.button>
                      <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => handleResolve(item, "reject")}
                        disabled={processing === item.localId}
                        className="flex-1 py-2 rounded-lg bg-red-500/15 text-red-500 border border-red-500/30 text-xs font-extrabold flex items-center justify-center gap-1.5 hover:bg-red-500/25 hover:shadow-[0_0_15px_rgba(239,68,68,0.2)] disabled:opacity-50 transition-all"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        Reject
                      </motion.button>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>

        {/* ── Footer Stats ── */}
        {isAuthorized && items.length > 0 && (
          <div
            className={`px-5 py-3 border-t ${border} flex-shrink-0 flex items-center justify-between text-[10px] ${subText} ${
              isDark ? "bg-white/[0.02]" : "bg-black/[0.02]"
            }`}
          >
            <span className="font-medium">
              Showing {filteredItems.length} of {items.length}
            </span>
            <span className="font-extrabold">
              Total: Rs.
              {filteredItems
                .reduce((s, i) => s + (Number(i.enteredAmount) || 0), 0)
                .toLocaleString()}
            </span>
          </div>
        )}
      </motion.div>
    </div>
  );
};

export default ManualReviewPanel;