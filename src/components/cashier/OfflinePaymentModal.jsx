// src/components/cashier/OfflinePaymentModal.jsx
// ✨ NEW: Manual bill entry for OFFLINE payment when QR/bill not found
// Used when scanned QR has no matching bill in local DB

import React, { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import {
  X, WifiOff, Save, AlertTriangle, User, Phone,
  Banknote, Smartphone, CreditCard, Building2, Loader2,
  Hash, Receipt,
} from "lucide-react";
import { toast } from "react-hot-toast";
import { saveManualOfflineBill } from "../../services/offlinePaymentService";
import { useSettings } from "../../context/SettingsContext";
import { logCashierAction } from "../../services/cashierAuditService";

const PAY_METHODS = [
  { v: "Cash", icon: Banknote, color: "emerald" },
  { v: "EasyPaisa", icon: Smartphone, color: "green" },
  { v: "JazzCash", icon: Smartphone, color: "orange" },
  { v: "Bank Transfer", icon: Building2, color: "blue" },
  { v: "Card", icon: CreditCard, color: "purple" },
];

const OfflinePaymentModal = ({
  isDark,
  userData,
  prefilledSerial = "",
  onClose,
  onSaved,
}) => {
  const [billSerial, setBillSerial] = useState(prefilledSerial);
  const [customerName, setCustomerName] = useState("Walking Customer");
  const [customerPhone, setCustomerPhone] = useState("");
  const [amount, setAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("Cash");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const { getSetting } = useSettings();

  const cardBg = isDark ? "bg-[#1a1208]" : "bg-white";
  const border = isDark ? "border-[#2a1f0f]" : "border-gray-200";
  const text = isDark ? "text-gray-100" : "text-gray-900";
  const subText = isDark ? "text-gray-400" : "text-gray-500";
  const inputBg = isDark
    ? "bg-[#120d06] border-[#2a1f0f] text-gray-100 placeholder:text-gray-600"
    : "bg-gray-50 border-gray-200 text-gray-900 placeholder:text-gray-400";

  // ESC close
  useEffect(() => {
    const h = (e) => {
      if (e.key === "Escape" && !saving) {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose, saving]);

  const handleSave = useCallback(async () => {
    const disableOffline = getSetting('disableCashierOffline', false);
    if (disableOffline) {
      toast.error('Offline cashier mode is disabled');
      return;
    }

    if (!billSerial.trim()) {
      toast.error("Bill serial required");
      return;
    }
    if (!amount || Number(amount) <= 0) {
      toast.error("Valid amount required");
      return;
    }

    setSaving(true);
    const tid = toast.loading("Saving offline...");

    try {
      const result = await saveManualOfflineBill({
        billSerial: billSerial.trim().toUpperCase(),
        amount: Number(amount),
        paymentMethod,
        customer: {
          name: customerName || "Walking Customer",
          phone: customerPhone || "",
        },
        items: [
          {
            productName: "Manual Entry",
            qty: 1,
            price: Number(amount),
            total: Number(amount),
          },
        ],
        notes,
        cashierId: userData?.uid || "",
        cashierName: userData?.displayName || userData?.name || "Cashier",
        storeId: userData?.storeId || userData?.primaryStore || "default",
      });

      if (result.success) {
        // Log audit
        await logCashierAction({
          action: "OFFLINE_MANUAL_BILL_CREATED",
          billSerial: billSerial.trim().toUpperCase(),
          userId: userData?.uid,
          userName: userData?.displayName || userData?.name,
          storeId: userData?.storeId || userData?.primaryStore,
          amount: Number(amount),
          paymentType: paymentMethod,
          metadata: {
            localId: result.localId,
            queueId: result.queueId,
            customerName,
            customerPhone,
            notes,
          },
        });

        toast.success(`Saved offline — #${billSerial}`, {
          id: tid,
          icon: <WifiOff className="w-4 h-4 text-blue-500" />,
          duration: 2500,
        });

        if (onSaved) onSaved(result);
        onClose();
      } else {
        toast.error("Save failed", { id: tid });
      }
    } catch (err) {
      console.error(err);
      toast.error(err.message || "Save failed", { id: tid });
    } finally {
      setSaving(false);
    }
  }, [
    billSerial, amount, paymentMethod, customerName,
    customerPhone, notes, userData, onClose, onSaved,
  ]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4"
      data-modal-open="true"
    >
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/70 backdrop-blur-md"
        onClick={() => !saving && onClose()}
      />
      <motion.div
        initial={{ scale: 0.95, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0, y: 20 }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        className={`relative w-full max-w-md ${cardBg} rounded-2xl border ${border} shadow-2xl flex flex-col overflow-hidden`}
        style={{ maxHeight: "95vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className={`flex items-center justify-between px-5 py-3 border-b ${border} flex-shrink-0 ${
          isDark ? "bg-blue-900/20" : "bg-blue-50/50"
        }`}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-blue-500/20 rounded-xl flex items-center justify-center">
              <WifiOff className="text-blue-500 w-5 h-5" />
            </div>
            <div>
              <h2 className={`font-bold text-sm ${text}`}>Offline Payment</h2>
              <p className={`text-[10px] ${subText}`}>
                Bill will sync when online · ESC to close
              </p>
            </div>
          </div>
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={onClose}
            disabled={saving}
            className={`p-1.5 rounded-lg ${subText} hover:text-red-500 disabled:opacity-50`}
          >
            <X className="w-4 h-4" />
          </motion.button>
        </div>

        {/* Warning */}
        <div className={`px-5 py-2 flex items-start gap-2 ${
          isDark ? "bg-amber-900/15" : "bg-amber-50"
        } border-b ${border}`}>
          <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
          <p className={`text-[11px] ${text}`}>
            Bill not found locally. Saving as offline manual entry — will sync when internet returns.
          </p>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">

          {/* Bill Serial */}
          <div>
            <label className={`text-[10px] font-bold uppercase tracking-wider block mb-1 ${subText}`}>
              <Hash className="inline w-3 h-3 mr-0.5" /> Bill Serial *
            </label>
            <input
              type="text"
              value={billSerial}
              onChange={(e) => setBillSerial(e.target.value.toUpperCase())}
              placeholder="AON-BIL-XXXXXX-000001"
              autoFocus={!prefilledSerial}
              className={`w-full px-3 py-2 rounded-lg border text-sm font-mono font-bold uppercase focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all ${inputBg}`}
            />
          </div>

          {/* Amount */}
          <div>
            <label className={`text-[10px] font-bold uppercase tracking-wider block mb-1 ${subText}`}>
              Amount (Rs.) *
            </label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0"
              min="1"
              autoFocus={!!prefilledSerial}
              className={`w-full px-3 py-3 rounded-lg border text-lg font-extrabold text-amber-500 focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 transition-all ${inputBg}`}
            />
          </div>

          {/* Customer */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={`text-[10px] font-bold uppercase tracking-wider block mb-1 ${subText}`}>
                <User className="inline w-3 h-3 mr-0.5" /> Customer
              </label>
              <input
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Walking Customer"
                className={`w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 transition-all ${inputBg}`}
              />
            </div>
            <div>
              <label className={`text-[10px] font-bold uppercase tracking-wider block mb-1 ${subText}`}>
                <Phone className="inline w-3 h-3 mr-0.5" /> Phone
              </label>
              <input
                type="tel"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder="03XX..."
                className={`w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 transition-all ${inputBg}`}
              />
            </div>
          </div>

          {/* Payment Method */}
          <div>
            <label className={`text-[10px] font-bold uppercase tracking-wider block mb-1.5 ${subText}`}>
              Payment Method
            </label>
            <div className="flex gap-1.5 flex-wrap">
              {PAY_METHODS.map((m) => {
                const Icon = m.icon;
                const active = paymentMethod === m.v;
                return (
                  <motion.button
                    key={m.v}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setPaymentMethod(m.v)}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold transition-all ${
                      active
                        ? "border-amber-500 bg-amber-500/15 text-amber-500"
                        : isDark
                        ? "border-[#2a1f0f] text-gray-400 hover:border-amber-500/30"
                        : "border-gray-200 text-gray-500 hover:border-amber-300"
                    }`}
                  >
                    <Icon className="w-3 h-3" />
                    {m.v}
                  </motion.button>
                );
              })}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className={`text-[10px] font-bold uppercase tracking-wider block mb-1 ${subText}`}>
              Notes (Optional)
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any details..."
              className={`w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 transition-all ${inputBg}`}
            />
          </div>
        </div>

        {/* Footer */}
        <div className={`px-5 py-3 border-t ${border} flex items-center gap-2 flex-shrink-0`}>
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={onClose}
            disabled={saving}
            className={`px-4 py-2 rounded-lg border ${border} text-xs font-medium ${subText} hover:bg-gray-500/5 disabled:opacity-50`}
          >
            Cancel
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.98 }}
            onClick={handleSave}
            disabled={saving || !billSerial.trim() || !amount}
            className="flex-1 py-2 rounded-lg bg-gradient-to-r from-blue-500 to-blue-600 text-white text-sm font-bold flex items-center justify-center gap-2 shadow-lg shadow-blue-500/25 disabled:opacity-50 transition-all"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            {saving ? "Saving..." : "Save Offline"}
          </motion.button>
        </div>
      </motion.div>
    </div>
  );
};

export default OfflinePaymentModal;