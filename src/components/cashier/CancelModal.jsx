// src/components/cashier/CancelBillModal.jsx
// Instant cancel with mandatory reason + activity logging

import React, { useState, useCallback, useEffect } from "react";
import { motion } from "framer-motion";
import {
  doc, updateDoc, addDoc, collection, serverTimestamp,
} from "firebase/firestore";
import { db } from "../../services/firebase";
import {
  X, XCircle, AlertTriangle, Edit3, Loader2,
  UserX, Copy, ShoppingCart, DollarSign, UserMinus, CreditCard,
  PhoneOff, PackageX, Wrench, AlertCircle, Clock, Briefcase,
  Scale, RotateCcw,
} from "lucide-react";
import { showFieldAlert, showValidationAlert } from "../../utils/fieldAlert";
import { toast } from "react-hot-toast";
import { logCancellation } from "../../services/cashierAuditService";
import { logBillCancelled } from "../../services/activityLogger";
import { markBillCancelledLocally } from "../../services/localBillService";
import { buildCashierCancelPatch } from "../../utils/cashierOrderUtils";
import { recordOptimisticCancelledBill, recordVisibleCancelledBill } from "../../utils/cashierCancelledIndex";
import { resolveFirestoreOrderId } from "../../utils/cancelledBillDisplayUtils";
import { useLanguage } from "../../hooks/useLanguage";

const CANCEL_REASONS = [
  { key: 'customerChangedMind', label: "Customer changed mind", icon: UserX },
  { key: 'duplicateBill', label: "Duplicate bill", icon: Copy },
  { key: 'wrongItems', label: "Wrong items entered", icon: ShoppingCart },
  { key: 'wrongPrice', label: "Wrong price entered", icon: DollarSign },
  { key: 'wrongCustomer', label: "Wrong customer selected", icon: UserMinus },
  { key: 'paymentIssue', label: "Payment issue", icon: CreditCard },
  { key: 'customerRequest', label: "Customer request", icon: AlertCircle },
  { key: 'outOfStock', label: "Item out of stock", icon: PackageX },
  { key: 'systemError', label: "System error / test bill", icon: Wrench },
  { key: 'billerMistake', label: "Biller mistake", icon: AlertTriangle },
  { key: 'customerUnavailable', label: "Customer not available", icon: PhoneOff },
  { key: 'managerRequest', label: "Manager request", icon: Briefcase },
  { key: 'priceDispute', label: "Price dispute", icon: Scale },
  { key: 'returnedGoods', label: "Returned goods", icon: RotateCcw },
];

const CancelModal = ({ order, isDark, userData, onClose, onCancelled }) => {
  const { t } = useLanguage();
  const [mode, setMode] = useState("select");
  const [selectedReason, setSelectedReason] = useState("");
  const [customReason, setCustomReason] = useState("");
  const [loading, setLoading] = useState(false);

  const finalReason = mode === "custom" ? customReason.trim() : selectedReason;

  const cardBg = isDark ? "bg-[#1a1208]" : "bg-white";
  const border = isDark ? "border-[#2a1f0f]" : "border-gray-200";
  const text = isDark ? "text-gray-100" : "text-gray-900";
  const subText = isDark ? "text-gray-400" : "text-gray-500";
  const inputBg = isDark
    ? "bg-[#120d06] border-[#2a1f0f] text-gray-100"
    : "bg-gray-50 border-gray-200 text-gray-900";

  useEffect(() => {
    const h = (e) => {
      if (e.key === "Escape") { e.preventDefault(); onClose(); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const handleCancel = useCallback(async () => {
    if (!finalReason) {
      showFieldAlert("cancelReason", {
        message: t("cashier.reasonRequired", "Please select or type a cancel reason"),
      });
      return;
    }
    setLoading(true);

    const storeId = userData?.storeId || order.storeId || "default";
    const cashierName = userData?.displayName || userData?.name || "Cashier";
    const cashierId = userData?.uid || "";
    const role = userData?.role || userData?.primaryRole || "cashier";
    const billSerial = order.billSerial || order.serialNo || "—";
    const now = new Date();
    const cancelPatch = buildCashierCancelPatch({
      reason: finalReason,
      userId: cashierId,
      userName: cashierName,
      role,
    });

    const cancelledOrder = { ...order, ...cancelPatch, id: order.id };

    recordOptimisticCancelledBill({
      serial: billSerial,
      billId: resolveFirestoreOrderId(order),
      localId: order.localId,
      storeId,
    });
    recordVisibleCancelledBill(cancelledOrder);

    onCancelled?.(cancelledOrder);

    toast.success(t('cashier.billCancelled', 'Bill #{serial} cancelled').replace('{serial}', billSerial), {
      icon: <XCircle className="w-4 h-4 text-red-500" />,
      duration: 2500,
    });
    onClose();
    setLoading(false);

    const firestoreOrderId = resolveFirestoreOrderId(order);
    if (!firestoreOrderId) {
      toast.error(t('cashier.cancelSyncPending', 'Saved locally — cloud sync when online'));
      return;
    }

    void (async () => {
      try {
        await Promise.all([
          updateDoc(doc(db, "orders", firestoreOrderId), {
            ...cancelPatch,
            cancelledAt: serverTimestamp(),
            cashierCancelledAt: serverTimestamp(),
          }),

          addDoc(collection(db, "cashierActions"), {
            actionType: "BILL_CANCELLED",
            orderId: firestoreOrderId,
            billSerial,
            serialNo: order.serialNo || billSerial,
            storeId,
            cashierId,
            cashierName,
            role,
            reason: finalReason,
            totalAmount: order.totalAmount || 0,
            customer: order.customer || {},
            date: now.toISOString().split("T")[0],
            time: now.toLocaleTimeString("en-PK"),
            timestamp: serverTimestamp(),
          }),

          logCancellation(
            { uid: cashierId, displayName: cashierName },
            storeId,
            { id: firestoreOrderId, serialNo: billSerial, totalAmount: order.totalAmount || 0 },
            finalReason,
          ),

          logBillCancelled(
            cashierId,
            storeId,
            cashierName,
            order.billerName || "",
            billSerial,
            order.totalAmount || 0,
            finalReason,
          ),
        ]);

        await markBillCancelledLocally(order, cancelPatch).catch(() => {});
      } catch (err) {
        console.error(err);
        toast.error(t('cashier.cancelFailed', 'Cloud sync failed — bill stays in Cancelled tab'));
      }
    })();
  }, [finalReason, order, userData, onClose, onCancelled, t]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" data-modal-open="true">
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
        className={`relative w-full max-w-md ${cardBg} rounded-2xl border ${border} shadow-2xl flex flex-col max-h-[min(92vh,640px)]`}
        onClick={(e) => e.stopPropagation()}
      >
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
              <h2 className={`font-bold text-base ${text}`}>{t('cashier.cancelBill', 'Cancel Bill')}</h2>
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

        <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-4">
          <div className={`flex items-start gap-3 p-3 rounded-xl ${
            isDark ? "bg-red-900/20 border border-red-800" : "bg-red-50 border border-red-200"
          }`}>
            <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-red-500">{t('cashier.cannotUndo', 'Cannot be undone')}</p>
              <p className={`text-xs ${subText} mt-0.5`}>
                #{order.billSerial || order.serialNo} · Rs. {(order.totalAmount || 0).toLocaleString()}
                {order.customer?.name ? ` · ${order.customer.name}` : ""}
              </p>
            </div>
          </div>

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
              {t('cashier.selectReason', 'Select Reason')}
            </motion.button>
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={() => { setMode("custom"); setSelectedReason(""); }}
              className={`flex-1 py-2 rounded-xl text-xs font-bold border transition-all flex items-center justify-center gap-1 ${
                mode === "custom"
                  ? "border-red-500 bg-red-500/10 text-red-500"
                  : `${border} ${subText}`
              }`}
            >
              <Edit3 className="w-3 h-3" /> {t('cashier.typeCustom', 'Type Custom')}
            </motion.button>
          </div>

          {mode === "select" && (
            <div>
              <label className={`block text-xs font-semibold ${subText} mb-2`}>
                {t('cashier.reason', 'Reason')} <span className="text-red-500">*</span>
              </label>
              <div
                className={`rounded-xl border ${border} overflow-hidden`}
                style={{ maxHeight: "min(280px, 42vh)" }}
              >
                <div className="overflow-y-auto overscroll-contain max-h-[inherit] p-1.5 space-y-1">
                  {CANCEL_REASONS.map((r) => {
                    const Icon = r.icon;
                    const displayLabel = t(`cashier.cancelReason.${r.key}`, r.label);
                    const picked = selectedReason === r.label;
                    return (
                      <button
                        type="button"
                        key={r.key}
                        onClick={() => setSelectedReason(r.label)}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left text-sm transition-all ${
                          picked
                            ? isDark
                              ? "bg-red-500/20 border border-red-500/50 text-red-400 shadow-sm"
                              : "bg-red-50 border border-red-300 text-red-700 shadow-sm"
                            : isDark
                              ? "hover:bg-white/5 text-gray-200 border border-transparent"
                              : "hover:bg-gray-50 text-gray-800 border border-transparent"
                        }`}
                      >
                        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                          picked ? "bg-red-500/30" : isDark ? "bg-white/5" : "bg-gray-100"
                        }`}>
                          <Icon className="w-4 h-4" />
                        </span>
                        <span className="flex-1 font-medium leading-snug">{displayLabel}</span>
                        {picked && (
                          <span className="shrink-0 text-red-500 font-bold text-xs">✓</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {mode === "custom" && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <label className={`block text-xs font-semibold ${subText} mb-2`}>
                {t('cashier.typeYourReason', 'Type your reason')} <span className="text-red-500">*</span>
              </label>
              <textarea
                value={customReason}
                onChange={(e) => setCustomReason(e.target.value)}
                rows={3}
                autoFocus
                placeholder={t('cashier.cancelReasonPh', 'Describe the cancel reason...')}
                className={`w-full px-3 py-2.5 rounded-xl border text-sm ${inputBg}
                  focus:outline-none focus:border-red-500 resize-none transition-all`}
              />
            </motion.div>
          )}
        </div>

        <div className={`px-5 py-4 border-t ${border} flex items-center gap-3 flex-shrink-0`}>
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={onClose}
            disabled={loading}
            className={`flex-1 py-2.5 rounded-xl border ${border} text-sm font-medium ${subText} hover:bg-gray-500/5 transition-colors`}
          >
            {t('back', 'Back')}
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
            {loading ? t('cashier.cancelling', 'Cancelling...') : t('cashier.cancelBill', 'Cancel Bill')}
          </motion.button>
        </div>
      </motion.div>
    </div>
  );
};

export default CancelModal;
