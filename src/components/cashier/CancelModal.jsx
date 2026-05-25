// src/components/cashier/CancelBillModal.jsx
// ✅ MERGED: 14 reasons + custom + audit logs + deletedBills + Framer Motion
// ✨ NEW: Reversible logging, immutable audit, animated transitions

import React, { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  doc, updateDoc, addDoc, collection, serverTimestamp,
} from "firebase/firestore";
import { db } from "../../services/firebase";
import {
  X, XCircle, AlertTriangle, ChevronDown, Edit3, Loader2,
  UserX, Copy, ShoppingCart, DollarSign, UserMinus, CreditCard,
  PhoneOff, PackageX, Wrench, AlertCircle, Clock, Briefcase,
  Scale, RotateCcw,
} from "lucide-react";
import { toast } from "react-hot-toast";
import { logCancellation } from "../../services/cashierAuditService";

// 14 reasons with Lucide icons
const CANCEL_REASONS = [
  { label: "Customer changed mind", icon: UserX },
  { label: "Duplicate bill", icon: Copy },
  { label: "Wrong items entered", icon: ShoppingCart },
  { label: "Wrong price entered", icon: DollarSign },
  { label: "Wrong customer selected", icon: UserMinus },
  { label: "Payment issue", icon: CreditCard },
  { label: "Customer request", icon: AlertCircle },
  { label: "Item out of stock", icon: PackageX },
  { label: "System error / test bill", icon: Wrench },
  { label: "Biller mistake", icon: AlertTriangle },
  { label: "Customer not available", icon: PhoneOff },
  { label: "Manager request", icon: Briefcase },
  { label: "Price dispute", icon: Scale },
  { label: "Returned goods", icon: RotateCcw },
];

const CancelModal = ({ order, isDark, userData, onClose }) => {
  const [mode, setMode] = useState("select"); // "select" or "custom"
  const [selectedReason, setSelectedReason] = useState("");
  const [customReason, setCustomReason] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const finalReason = mode === "custom" ? customReason.trim() : selectedReason;

  const cardBg = isDark ? "bg-[#1a1208]" : "bg-white";
  const border = isDark ? "border-[#2a1f0f]" : "border-gray-200";
  const text = isDark ? "text-gray-100" : "text-gray-900";
  const subText = isDark ? "text-gray-400" : "text-gray-500";
  const inputBg = isDark
    ? "bg-[#120d06] border-[#2a1f0f] text-gray-100"
    : "bg-gray-50 border-gray-200 text-gray-900";
  const dropBg = isDark ? "bg-[#1a1208]" : "bg-white";

  // ESC close
  useEffect(() => {
    const h = (e) => {
      if (e.key === "Escape") { e.preventDefault(); onClose(); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const handleCancel = useCallback(async () => {
    if (!finalReason) {
      toast.error("Please provide a reason!", {
        icon: <AlertTriangle className="w-4 h-4 text-red-500" />,
      });
      return;
    }
    setLoading(true);

    const storeId = userData?.storeId || order.storeId || "default";
    const cashierName = userData?.displayName || userData?.name || "Cashier";
    const now = new Date();

    try {
      await Promise.all([
        // 1. Update order status (with isDeleted flag)
        updateDoc(doc(db, "orders", order.id), {
          status: "cancelled",
          isDeleted: true, // ✨ NEW: For soft delete
          cancelReason: finalReason,
          cancelledBy: cashierName,
          cancelledUserId: userData?.uid || "",
          cancelledAt: serverTimestamp(),
        }),

        // 2. ✨ NEW: Save full copy to deletedBills (reversible)
        addDoc(collection(db, "deletedBills"), {
          originalOrderId: order.id,
          billSerial: order.billSerial || order.serialNo || "—",
          serialNo: order.serialNo || order.billSerial || "—",
          storeId,
          orderSnapshot: { ...order }, // Full copy
          cancelledBy: cashierName,
          cancelledUserId: userData?.uid || "",
          reason: finalReason,
          cancelledAt: serverTimestamp(),
        }),

        // 3. Save to cashierActions
        addDoc(collection(db, "cashierActions"), {
          actionType: "CANCELLED",
          orderId: order.id,
          billSerial: order.billSerial || order.serialNo || "—",
          serialNo: order.serialNo || order.billSerial || "—",
          storeId,
          cashierId: userData?.uid || "",
          cashierName,
          reason: finalReason,
          totalAmount: order.totalAmount || 0,
          totalDiscount: order.totalDiscount || 0,
          totalQty: order.totalQty || 0,
          customer: order.customer || {},
          items: order.items || [],
          billerName: order.billerName || "",
          billerId: order.billerId || "",
          billStartTime: order.billStartTime || null,
          date: now.toISOString().split("T")[0],
          time: now.toLocaleTimeString("en-PK"),
          timestamp: serverTimestamp(),
        }),

// 4. Immutable audit log
         logCancellation(
           { uid: userData?.uid || "", displayName: cashierName },
           storeId,
           { id: order.id, serialNo: order.serialNo || order.billSerial, totalAmount: order.totalAmount || 0 },
           finalReason,
         ),
      ]);

      toast.success(`Bill #${order.billSerial || order.serialNo} cancelled`, {
        icon: <XCircle className="w-4 h-4 text-red-500" />,
      });
      onClose();
    } catch (err) {
      console.error(err);
      toast.error("Cancel failed!");
    } finally {
      setLoading(false);
    }
  }, [finalReason, order, userData, onClose, mode]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" data-modal-open="true">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <motion.div
        initial={{ scale: 0.95, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0, y: 20 }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        className={`relative w-full max-w-sm ${cardBg} rounded-2xl border ${border} shadow-2xl flex flex-col`}
        style={{ maxHeight: "90vh" }}
      >
        {/* Header */}
        <div className={`flex items-center justify-between px-5 py-4 border-b ${border} flex-shrink-0`}>
          <div className="flex items-center gap-3">
            <motion.div
              animate={{ rotate: [0, -10, 10, -10, 0] }}
              transition={{ duration: 0.5 }}
              className="w-9 h-9 bg-red-500/20 rounded-xl flex items-center justify-center"
            >
              <XCircle className="text-red-500 w-5 h-5" />
            </motion.div>
            <div>
              <h2 className={`font-bold text-base ${text}`}>Cancel Bill</h2>
              <p className={`text-xs ${subText}`}>#{order.billSerial || order.serialNo}</p>
            </div>
          </div>
          <motion.button
            whileHover={{ scale: 1.1, rotate: 90 }}
            whileTap={{ scale: 0.9 }}
            onClick={onClose}
            className={`p-1.5 rounded-lg ${subText} hover:text-red-500`}
          >
            <X className="w-5 h-5" />
          </motion.button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Warning */}
          <div className={`flex items-start gap-3 p-3 rounded-xl ${
            isDark ? "bg-red-900/20 border border-red-800" : "bg-red-50 border border-red-200"
          }`}>
            <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-red-500">Cannot be undone</p>
              <p className={`text-xs ${subText} mt-0.5`}>
                #{order.billSerial || order.serialNo} · Rs. {(order.totalAmount || 0).toLocaleString()}
                {order.customer?.name ? ` · ${order.customer.name}` : ""}
              </p>
            </div>
          </div>

          {/* Mode toggle */}
          <div className="flex gap-2">
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={() => { setMode("select"); setCustomReason(""); }}
              className={`flex-1 py-2 rounded-xl text-xs font-bold border transition-all ${
                mode === "select"
                  ? "border-red-500 bg-red-500/10 text-red-500"
                  : `${border} ${subText}`
              }`}
            >
              Select Reason
            </motion.button>
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={() => { setMode("custom"); setSelectedReason(""); setDropdownOpen(false); }}
              className={`flex-1 py-2 rounded-xl text-xs font-bold border transition-all flex items-center justify-center gap-1 ${
                mode === "custom"
                  ? "border-red-500 bg-red-500/10 text-red-500"
                  : `${border} ${subText}`
              }`}
            >
              <Edit3 className="w-3 h-3" /> Type Custom
            </motion.button>
          </div>

          {/* Select dropdown */}
          {mode === "select" && (
            <div>
              <label className={`block text-xs font-semibold ${subText} mb-2`}>
                Reason <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <button
                  onClick={() => setDropdownOpen((v) => !v)}
                  className={`w-full flex items-center justify-between px-4 py-3
                    rounded-xl border text-sm font-medium transition-all ${
                    selectedReason
                      ? "border-red-500 bg-red-500/5 text-red-500"
                      : `${inputBg} ${isDark ? "text-gray-400" : "text-gray-500"}`
                  }`}
                >
                  <span className="truncate flex items-center gap-2">
                    {selectedReason && (() => {
                      const r = CANCEL_REASONS.find(x => x.label === selectedReason);
                      const Icon = r?.icon;
                      return Icon ? <Icon className="w-4 h-4" /> : null;
                    })()}
                    {selectedReason || "Select a reason..."}
                  </span>
                  <motion.div animate={{ rotate: dropdownOpen ? 180 : 0 }}>
                    <ChevronDown className="w-4 h-4 shrink-0" />
                  </motion.div>
                </button>

                <AnimatePresence>
                  {dropdownOpen && (
                    <motion.div
                      data-dropdown-open="true"
                      initial={{ opacity: 0, y: -8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      className={`absolute top-full left-0 right-0 mt-1 z-50
                        rounded-xl border ${border} ${dropBg} shadow-xl max-h-60
                        overflow-y-auto`}
                    >
                      {CANCEL_REASONS.map((r) => {
                        const Icon = r.icon;
                        return (
                          <button
                            key={r.label}
                            onClick={() => { setSelectedReason(r.label); setDropdownOpen(false); }}
                            className={`w-full text-left px-4 py-2.5 text-sm border-b
                              last:border-0 transition-colors flex items-center gap-2 ${
                              isDark ? "border-[#2a1f0f] hover:bg-red-900/20" : "border-gray-100 hover:bg-red-50"
                            } ${selectedReason === r.label ? "text-red-500 font-bold bg-red-500/10" : text}`}
                          >
                            <Icon className="w-4 h-4 flex-shrink-0" />
                            {selectedReason === r.label && <span>✓</span>}
                            {r.label}
                          </button>
                        );
                      })}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          )}

          {/* Custom type */}
          {mode === "custom" && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <label className={`block text-xs font-semibold ${subText} mb-2`}>
                Type your reason <span className="text-red-500">*</span>
              </label>
              <textarea
                value={customReason}
                onChange={(e) => setCustomReason(e.target.value)}
                rows={3}
                autoFocus
                placeholder="Describe the cancel reason..."
                className={`w-full px-3 py-2.5 rounded-xl border text-sm ${inputBg}
                  focus:outline-none focus:border-red-500 resize-none transition-all`}
              />
              {customReason.trim() && (
                <p className={`text-[10px] ${subText} mt-1`}>
                  {customReason.trim().length} characters
                </p>
              )}
            </motion.div>
          )}
        </div>

        {/* Footer */}
        <div className={`px-5 py-4 border-t ${border} flex items-center gap-3 flex-shrink-0`}>
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={onClose}
            disabled={loading}
            className={`flex-1 py-2.5 rounded-xl border ${border} text-sm font-medium ${subText} hover:bg-gray-500/5 transition-colors`}
          >
            Back
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleCancel}
            disabled={loading || !finalReason}
            className="flex-1 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 disabled:opacity-50
              text-white text-sm font-bold flex items-center justify-center gap-2 transition-colors"
          >
            {loading
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <XCircle className="w-4 h-4" />}
            {loading ? "Cancelling..." : "Cancel Bill"}
          </motion.button>
        </div>
      </motion.div>
    </div>
  );
};

export default CancelModal;