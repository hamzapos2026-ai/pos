// src/components/biller/BillerPaymentModal.jsx
// ✅ COMPLETE v3 — Dashboard Compatible
// ═══════════════════════════════════════════════════════════════
// F8 Step 4: Payment Collection Modal
// ═══════════════════════════════════════════════════════════════
// FEATURES:
// ✅ Total due display (large amber)
// ✅ Payment method selector (Cash / Card / Online / EasyPaisa / JazzCash)
// ✅ Amount received input (auto-focus)
// ✅ Change amount calculator (green badge)
// ✅ Confirm & Save button
// ✅ Enter to confirm (when amount >= total)
// ✅ Close → back to summary
// ✅ AnimatePresence modal entrance/exit
// ✅ Spring animation on card
// ✅ Dark/Light mode via isDark
// ✅ cn() utility everywhere
// ✅ whileHover + whileTap on all buttons
// ✅ Disabled state during save
// ✅ Bill serial display
// ✅ Responsive (mobile + desktop)
// ═══════════════════════════════════════════════════════════════

import { memo, useRef, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  CreditCard, X, Send, Loader2,
  Banknote, Smartphone, Building2,
} from "lucide-react";
import { cn } from "../../utils/cn";
import { useTheme } from "../../context/ThemeContext";
import { useSettings } from "../../context/SettingsContext";
import { getEnabledPaymentMethods } from "../../utils/paymentMethodsUtils";

const METHOD_UI = {
  cash: { icon: Banknote, color: "green" },
  easypaisa: { icon: Smartphone, color: "green" },
  jazzcash: { icon: Smartphone, color: "red" },
  bankTransfer: { icon: Building2, color: "purple" },
  creditCard: { icon: CreditCard, color: "blue" },
};

// ─── Animation variants ──────────────────────────────────────
const overlayVariants = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit:    { opacity: 0 },
};

const cardVariants = {
  initial: { scale: 0.9, y: 20, opacity: 0 },
  animate: {
    scale: 1, y: 0, opacity: 1,
    transition: { type: "spring", damping: 20, stiffness: 300 },
  },
  exit: {
    scale: 0.9, y: 20, opacity: 0,
    transition: { duration: 0.15 },
  },
};

// ═══════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════
const BillerPaymentModal = memo(({
  isOpen,
  finalTotal = 0,
  currentBillSerial = "----",
  paymentType = "cash",
  amountReceived = "",
  changeAmount = 0,
  submitting = false,
  saveDone = false,
  // Callbacks
  onPaymentTypeChange,
  onAmountChange,
  onConfirm,
  onClose,
}) => {
  const { isDark } = useTheme();
  const { settings } = useSettings();
  const paymentMethods = useMemo(() => getEnabledPaymentMethods(settings).map((m) => {
    const ui = METHOD_UI[m.key] || METHOD_UI.cash;
    return {
      key: m.key === 'creditCard' ? 'card' : m.key === 'bankTransfer' ? 'bank' : m.key,
      label: m.label,
      icon: ui.icon,
      color: ui.color,
    };
  }), [settings?.paymentMethods]);
  const amountRef  = useRef(null);

  // ── Auto-focus amount input when opening ──────────────────
  useEffect(() => {
    if (isOpen && paymentType === "cash") {
      setTimeout(() => {
        amountRef.current?.focus();
        amountRef.current?.select();
      }, 200);
    }
  }, [isOpen, paymentType]);

  // ── Can confirm? ──────────────────────────────────────────
  const canConfirm =
    !submitting &&
    !saveDone &&
    (paymentType !== "cash" || Number(amountReceived || 0) >= finalTotal);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="payment-overlay"
          variants={overlayVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70"
          onClick={onClose}
        >
          <motion.div
            variants={cardVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            onClick={(e) => e.stopPropagation()}
            className={cn(
              "w-full max-w-md mx-4 rounded-3xl p-6 shadow-2xl",
              isDark
                ? "bg-[#15120d] border border-yellow-500/20"
                : "bg-white border border-yellow-200",
            )}
          >
            {/* ── Header ── */}
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className={cn(
                  "rounded-xl p-2",
                  "bg-gradient-to-br from-green-500 to-emerald-600",
                )}>
                  <CreditCard size={18} className="text-white" />
                </div>
                <div>
                  <h2 className={cn(
                    "text-lg font-bold",
                    isDark ? "text-white" : "text-gray-900",
                  )}>
                    Collect Payment
                  </h2>
                  <p className={cn(
                    "text-xs font-mono",
                    isDark ? "text-gray-400" : "text-gray-500",
                  )}>
                    #{currentBillSerial}
                  </p>
                </div>
              </div>
              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={onClose}
                className={cn(
                  "rounded-full p-1.5 transition-colors",
                  isDark
                    ? "text-gray-400 hover:text-white hover:bg-white/10"
                    : "text-gray-500 hover:text-gray-900 hover:bg-gray-100",
                )}
              >
                <X size={16} />
              </motion.button>
            </div>

            {/* ── Total due ── */}
            <div className={cn(
              "rounded-2xl p-4 mb-5 text-center",
              isDark
                ? "bg-yellow-500/10 border border-yellow-500/20"
                : "bg-yellow-50 border border-yellow-200",
            )}>
              <p className={cn(
                "text-xs uppercase font-semibold mb-1",
                isDark ? "text-gray-500" : "text-gray-400",
              )}>
                Total Due
              </p>
              <p className="text-4xl font-extrabold text-yellow-500 font-mono">
                Rs.{finalTotal.toLocaleString()}
              </p>
            </div>

            {/* ── Payment method ── */}
            <div className="mb-5">
              <label className={cn(
                "block text-xs font-bold uppercase mb-2",
                isDark ? "text-gray-400" : "text-gray-500",
              )}>
                Payment Method
              </label>
              <div className="grid grid-cols-3 gap-2">
                {paymentMethods.slice(0, 3).map((method) => {
                  const Icon      = method.icon;
                  const isActive  = paymentType === method.key;

                  return (
                    <motion.button
                      key={method.key}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => onPaymentTypeChange?.(method.key)}
                      className={cn(
                        "py-2.5 rounded-xl text-xs font-bold",
                        "capitalize transition-all flex items-center justify-center gap-1.5",
                        isActive
                          ? "bg-yellow-500 text-black shadow-lg shadow-yellow-500/20"
                          : isDark
                            ? "bg-white/5 text-gray-300 border border-yellow-500/20 hover:bg-white/10"
                            : "bg-gray-100 text-gray-700 border border-gray-200 hover:bg-gray-200",
                      )}
                    >
                      <Icon size={12} />
                      {method.label}
                    </motion.button>
                  );
                })}
              </div>
              {/* More methods row */}
              <div className="grid grid-cols-2 gap-2 mt-2">
                {paymentMethods.slice(3).map((method) => {
                  const Icon     = method.icon;
                  const isActive = paymentType === method.key;

                  return (
                    <motion.button
                      key={method.key}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => onPaymentTypeChange?.(method.key)}
                      className={cn(
                        "py-2 rounded-xl text-xs font-bold",
                        "capitalize transition-all flex items-center justify-center gap-1.5",
                        isActive
                          ? "bg-yellow-500 text-black shadow-lg shadow-yellow-500/20"
                          : isDark
                            ? "bg-white/5 text-gray-300 border border-yellow-500/20 hover:bg-white/10"
                            : "bg-gray-100 text-gray-700 border border-gray-200 hover:bg-gray-200",
                      )}
                    >
                      <Icon size={12} />
                      {method.label}
                    </motion.button>
                  );
                })}
              </div>
            </div>

            {/* ── Amount received (cash only) ── */}
            <AnimatePresence>
              {paymentType === "cash" && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mb-5 overflow-hidden"
                >
                  <label className={cn(
                    "block text-xs font-bold uppercase mb-2",
                    isDark ? "text-gray-400" : "text-gray-500",
                  )}>
                    Amount Received
                  </label>
                  <input
                    ref={amountRef}
                    type="number"
                    min={finalTotal}
                    value={amountReceived}
                    onChange={(e) => onAmountChange?.(e.target.value)}
                    onFocus={(e) => e.target.select()}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && canConfirm) onConfirm?.();
                    }}
                    placeholder={`Min: ${finalTotal.toLocaleString()}`}
                    className={cn(
                      "w-full rounded-xl border px-4 py-3",
                      "text-2xl font-bold outline-none",
                      "focus:ring-2 focus:ring-yellow-500/30",
                      isDark
                        ? "border-yellow-500/30 bg-[#0f0d09] text-yellow-400"
                        : "border-yellow-300 bg-white text-yellow-700",
                    )}
                  />

                  {/* Change amount */}
                  <AnimatePresence>
                    {changeAmount > 0 && (
                      <motion.div
                        initial={{ opacity: 0, y: -5 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -5 }}
                        className={cn(
                          "mt-3 rounded-xl px-4 py-3",
                          "flex items-center justify-between",
                          "bg-green-500/10 border border-green-500/20",
                        )}
                      >
                        <span className="text-sm font-semibold text-green-400">
                          Change
                        </span>
                        <span className="text-2xl font-extrabold text-green-400 font-mono">
                          Rs.{changeAmount.toLocaleString()}
                        </span>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Insufficient warning */}
                  <AnimatePresence>
                    {Number(amountReceived || 0) > 0 &&
                     Number(amountReceived || 0) < finalTotal && (
                      <motion.p
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="mt-2 text-xs text-red-400 text-center"
                      >
                        ⚠️ Amount is less than total
                        (need Rs.{(finalTotal - Number(amountReceived || 0)).toLocaleString()} more)
                      </motion.p>
                    )}
                  </AnimatePresence>
                </motion.div>
              )}
            </AnimatePresence>

            {/* ── Non-cash hint ── */}
            <AnimatePresence>
              {paymentType !== "cash" && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className={cn(
                    "mb-5 rounded-xl px-4 py-3 text-center text-xs",
                    isDark
                      ? "bg-blue-500/10 border border-blue-500/20 text-blue-400"
                      : "bg-blue-50 border border-blue-200 text-blue-600",
                  )}
                >
                  {paymentType === "card" && "💳 Swipe/tap card to confirm"}
                  {paymentType === "easypaisa" && "📱 Confirm EasyPaisa payment received"}
                  {paymentType === "jazzcash" && "📲 Confirm JazzCash payment received"}
                  {paymentType === "bank" && "🏦 Confirm bank transfer received"}
                </motion.div>
              )}
            </AnimatePresence>

            {/* ── Confirm button ── */}
            <motion.button
              whileHover={{ scale: canConfirm ? 1.02 : 1 }}
              whileTap={{ scale: canConfirm ? 0.98 : 1 }}
              onClick={onConfirm}
              disabled={!canConfirm}
              className={cn(
                "w-full rounded-xl px-4 py-3 text-base font-bold",
                "flex items-center justify-center gap-2",
                "transition-all",
                canConfirm
                  ? "bg-gradient-to-r from-green-500 to-emerald-500 text-white hover:from-green-400 hover:to-emerald-400 shadow-lg shadow-green-500/20"
                  : isDark
                    ? "bg-gray-800 text-gray-500 cursor-not-allowed"
                    : "bg-gray-200 text-gray-400 cursor-not-allowed",
              )}
            >
              {submitting ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Send size={14} />
                  Confirm & Save
                </>
              )}
            </motion.button>

            {/* ── Back hint ── */}
            <p className={cn(
              "text-center text-[10px] mt-3",
              isDark ? "text-gray-600" : "text-gray-400",
            )}>
              ESC to go back · F8 to confirm
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
});

BillerPaymentModal.displayName = "BillerPaymentModal";
export default BillerPaymentModal;