// src/components/biller/BillSummary.jsx
// ✅ MASTER ARCHITECTURE v4 — Dashboard Compatible
// ✅ ADDED: F8/ESC keyboard shortcuts
// ✅ ADDED: BroadcastChannel for parent sync
// ═══════════════════════════════════════════════════════════════

import { memo, useMemo, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Receipt, User, Phone, MapPin, Store,
  ArrowLeft, ArrowRight, X, Tag, ShoppingCart,
} from "lucide-react";
import { cn } from "../../utils/cn";
import { useTheme } from "../../context/ThemeContext";

// ─── BroadcastChannel ─────────────────────────────────────────
const BILLING_CHANNEL = 'aone_pos_billing';

const broadcastEvent = (type, data) => {
  try {
    const ch = new BroadcastChannel(BILLING_CHANNEL);
    ch.postMessage({ type, ...data, timestamp: Date.now() });
    ch.close();
  } catch { /* ignore */ }
};

// ─── Format helpers ───────────────────────────────────────────
const fmtItemSerial = (n) => String(Math.max(0, Number(n) || 0)).padStart(2, "0");
const fmtRs = (n) => `Rs.${Math.max(0, Number(n) || 0).toLocaleString()}`;

// ─── Animation variants ──────────────────────────────────────
const overlayVariants = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit:    { opacity: 0 },
};

const cardVariants = {
  initial: { scale: 0.9, y: 30, opacity: 0 },
  animate: {
    scale: 1, y: 0, opacity: 1,
    transition: { type: "spring", damping: 22, stiffness: 300 },
  },
  exit: { scale: 0.95, y: 20, opacity: 0, transition: { duration: 0.15 } },
};

// ═══════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════
const BillSummary = memo(({
  isOpen,
  // Bill data
  items = [],
  totalQty = 0,
  totalDiscount = 0,
  subtotal = 0,
  billDiscount = 0,
  billDiscountType = "fixed",
  grandTotal = 0,
  billSerial = "----",
  // Customer
  customer = {},
  // Salesperson / commission
  salespersonEnabled = false,
  salespersonAgents = [],
  showSalespersonColumn = false,
  groupBySalesperson = false,
  selectedSalespersonId = "",
  salespersonCommission = 0,
  onSalespersonChange,
  // Callbacks
  onProceed,
  onClose,
  onBillDiscountChange,
  onBillDiscountTypeChange,
  // ✅ NEW: External F8 control
  onF8Press,
}) => {
  const { isDark } = useTheme();

  // ── Bill discount computed value ──────────────────────────
  const billDiscountValue = useMemo(() => {
    const v = Number(billDiscount || 0);
    return billDiscountType === "percent"
      ? Math.round(subtotal * Math.min(100, Math.max(0, v)) / 100)
      : Math.max(0, v);
  }, [billDiscount, billDiscountType, subtotal]);

  // ── Total savings ─────────────────────────────────────────
  const totalSavings = totalDiscount + billDiscountValue;

  // ── ✅ F8 / ESC Keyboard Shortcuts ───────────────────────
  useEffect(() => {
    if (!isOpen) return;

    const handler = (e) => {
      // F8 → Proceed
      if (e.key === "F8") {
        e.preventDefault();
        e.stopPropagation();
        broadcastEvent('BILL_SUMMARY_PROCEED', { billSerial });
        onProceed?.();
        return;
      }

      // ESC → Close
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose?.();
        return;
      }
    };

    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [isOpen, onProceed, onClose, billSerial]);

  // ── Listen for F8 from parent (BroadcastChannel) ─────────
  useEffect(() => {
    if (!isOpen) return;

    const ch = new BroadcastChannel(BILLING_CHANNEL);
    const handler = (e) => {
      if (e.data?.type === 'F8_PRESSED') {
        e.preventDefault();
        onF8Press?.();
        onProceed?.();
      }
    };
    ch.addEventListener('message', handler);
    return () => {
      ch.removeEventListener('message', handler);
      ch.close();
    };
  }, [isOpen, onF8Press, onProceed]);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="bill-summary-overlay"
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
              "w-full max-w-lg mx-4 rounded-3xl shadow-2xl",
              "max-h-[90vh] flex flex-col",
              isDark
                ? "bg-[#15120d] border border-yellow-500/20"
                : "bg-white border border-yellow-200",
            )}
          >
            {/* ── Header ── */}
            <div className={cn(
              "flex items-center justify-between px-5 py-4 border-b shrink-0",
              isDark ? "border-yellow-500/10" : "border-yellow-100",
            )}>
              <div className="flex items-center gap-3">
                <div className={cn("rounded-xl p-2 bg-gradient-to-br from-yellow-500 to-amber-600")}>
                  <Receipt size={18} className="text-white" />
                </div>
                <div>
                  <h2 className={cn("text-lg font-bold", isDark ? "text-white" : "text-gray-900")}>
                    Bill Summary
                  </h2>
                  <p className={cn("text-xs font-mono", isDark ? "text-yellow-500/60" : "text-yellow-600/60")}>
                    #{billSerial}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {/* Hotkey hints */}
                {["F8", "ESC"].map((k) => (
                  <span key={k} className={cn(
                    "text-[9px] px-1.5 py-0.5 rounded font-mono font-bold",
                    isDark ? "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20" : "bg-yellow-50 text-yellow-700 border border-yellow-200",
                  )}>
                    {k}
                  </span>
                ))}
                <motion.button
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={onClose}
                  className={cn(
                    "rounded-full p-1.5 transition-colors",
                    isDark ? "text-gray-400 hover:text-white hover:bg-white/10" : "text-gray-500 hover:text-gray-900 hover:bg-gray-100",
                  )}
                >
                  <X size={16} />
                </motion.button>
              </div>
            </div>

            {/* ── Customer info ── */}
            {customer?.name && (
              <div className={cn("px-5 py-2.5 border-b shrink-0", isDark ? "border-yellow-500/10" : "border-yellow-100")}>
                <div className="flex flex-wrap items-center gap-3 text-xs">
                  <div className="flex items-center gap-1.5">
                    <User size={11} className={isDark ? "text-yellow-500" : "text-yellow-600"} />
                    <span className={isDark ? "text-gray-300" : "text-gray-700"}>{customer.name}</span>
                  </div>
                  {customer.phone && (
                    <div className="flex items-center gap-1.5">
                      <Phone size={11} className={isDark ? "text-gray-500" : "text-gray-400"} />
                      <span className={cn("font-mono", isDark ? "text-yellow-400" : "text-yellow-600")}>{customer.phone}</span>
                    </div>
                  )}
                  {customer.city && (
                    <div className="flex items-center gap-1.5">
                      <MapPin size={11} className={isDark ? "text-gray-500" : "text-gray-400"} />
                      <span className={isDark ? "text-gray-400" : "text-gray-500"}>
                        {customer.city}{customer.market ? ` · ${customer.market}` : ""}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── Salesperson section ── */}
            {salespersonEnabled && salespersonAgents.length > 0 && (
              <div className={cn("px-5 py-3 border-b shrink-0 space-y-2", isDark ? "border-yellow-500/10" : "border-yellow-100")}>
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className={cn("text-xs font-semibold uppercase", isDark ? "text-gray-400" : "text-gray-500")}>Salesperson</div>
                    <p className={cn("text-[11px]", isDark ? "text-gray-500" : "text-gray-500")}>Select the commission agent for this bill.</p>
                  </div>
                </div>
                <select
                  value={selectedSalespersonId || ""}
                  onChange={(e) => onSalespersonChange?.(e.target.value)}
                  className={cn(
                    "w-full rounded-xl border px-3 py-2 text-sm outline-none",
                    isDark ? "border-yellow-500/20 bg-[#0f0d09] text-white" : "border-gray-200 bg-white text-gray-900",
                  )}
                >
                  <option value="">Select agent</option>
                  {salespersonAgents.map((agent) => (
                    <option key={agent.id} value={agent.id}>
                      {agent.name} {agent.commissionType === 'percent' ? `(${agent.commissionRate}%)` : `(Rs.${agent.commissionRate})`}
                    </option>
                  ))}
                </select>
                {selectedSalespersonId === "" && (
                  <div className={cn("text-xs text-rose-400 mt-1", isDark ? "text-rose-300" : "text-rose-500")}>
                    Select an agent to calculate commission.
                  </div>
                )}
                {salespersonCommission > 0 && (
                  <div className={cn("rounded-lg px-3 py-2 text-xs font-semibold", isDark ? "bg-green-500/10 text-green-200" : "bg-green-50 text-green-700")}>
                    Commission: Rs.{salespersonCommission.toLocaleString()}
                  </div>
                )}
              </div>
            )}

            {salespersonEnabled && salespersonAgents.length === 0 && (
              <div className={cn("px-5 py-3 border-b shrink-0 rounded-xl", isDark ? "border-yellow-500/10 bg-[#1a1208] text-yellow-200" : "border-gray-200 bg-yellow-50 text-gray-700")}>
                <p className="text-xs">Salesperson system is active, but no agents are configured yet. Add agents in the Admin Settings panel.</p>
              </div>
            )}

            {/* ── Items list (scrollable) ── */}
            <div className="flex-1 min-h-0 overflow-y-auto px-5 py-3">
              <div className="space-y-1">
                {groupBySalesperson ? (() => {
                  const groups = {};
                  items.forEach((it) => {
                    const key = it.salespersonName || 'Unassigned';
                    if (!groups[key]) groups[key] = [];
                    groups[key].push(it);
                  });
                  return Object.entries(groups).map(([spName, arr], gi) => (
                    <div key={`grp-${gi}`} className="space-y-1">
                      <div className={cn('text-sm font-semibold py-1 px-2', isDark ? 'text-yellow-400' : 'text-yellow-700')}>{`--- ${spName} ---`}</div>
                      {arr.map((item, index) => {
                        const discAmt = item.discountType === "percent" ? Math.round(item.price * item.discount / 100) : item.discount || 0;
                        const hasDisc = discAmt > 0;
                        const lineTotal = (item.price - discAmt) * item.qty;
                        return (
                          <div key={item.id || index} className={cn('flex items-center justify-between py-1.5 px-2 rounded-lg text-xs', gi % 2 === 0 ? (isDark ? 'bg-yellow-500/5' : 'bg-yellow-50/50') : '')}>
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              <span className={cn('w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0', isDark ? 'bg-yellow-500/20 text-yellow-400' : 'bg-yellow-100 text-yellow-700')}>{fmtItemSerial(index + 1)}</span>
                              <span className={cn('truncate', isDark ? 'text-gray-300' : 'text-gray-700')}>{item.productName || `Item ${fmtItemSerial(index + 1)}`}</span>
                            </div>
                            <div className="flex items-center gap-3 shrink-0">
                              <span className={isDark ? 'text-gray-500' : 'text-gray-400'}>{item.price.toLocaleString()} × {item.qty}</span>
                              {hasDisc && <span className="text-red-400 text-[10px]">−{discAmt.toLocaleString()}</span>}
                              <span className={cn('font-mono font-bold min-w-[60px] text-right', isDark ? 'text-yellow-400' : 'text-yellow-700')}>{lineTotal.toLocaleString()}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ));
                })() : (
                  items.map((item, index) => {
                    const discAmt = item.discountType === "percent" ? Math.round(item.price * item.discount / 100) : item.discount || 0;
                    const hasDisc = discAmt > 0;
                    const lineTotal = (item.price - discAmt) * item.qty;

                    return (
                      <div
                        key={item.id || index}
                        className={cn(
                          "flex items-center justify-between py-1.5 px-2 rounded-lg text-xs",
                          index % 2 === 0 ? isDark ? "bg-yellow-500/5" : "bg-yellow-50/50" : "",
                        )}
                      >
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <span className={cn(
                            "w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0",
                            isDark ? "bg-yellow-500/20 text-yellow-400" : "bg-yellow-100 text-yellow-700",
                          )}>
                            {fmtItemSerial(index + 1)}
                          </span>
                          <span className={cn("truncate", isDark ? "text-gray-300" : "text-gray-700")}>
                            {item.productName || `Item ${fmtItemSerial(index + 1)}`}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <span className={isDark ? "text-gray-500" : "text-gray-400"}>
                            {item.price.toLocaleString()} × {item.qty}
                          </span>
                          {hasDisc && <span className="text-red-400 text-[10px]">−{discAmt.toLocaleString()}</span>}
                          <span className={cn("font-mono font-bold min-w-[60px] text-right", isDark ? "text-yellow-400" : "text-yellow-700")}>{lineTotal.toLocaleString()}</span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* ── Totals section ── */}
            <div className={cn("px-5 py-3 border-t shrink-0 space-y-2", isDark ? "border-yellow-500/10" : "border-yellow-100")}>
              <div className="flex justify-between text-xs">
                <span className={isDark ? "text-gray-400" : "text-gray-500"}>Subtotal ({items.length} items, {totalQty} qty)</span>
                <span className={cn("font-mono font-semibold", isDark ? "text-gray-300" : "text-gray-700")}>{fmtRs(subtotal)}</span>
              </div>

              {totalDiscount > 0 && (
                <div className="flex justify-between text-xs">
                  <span className={isDark ? "text-gray-500" : "text-gray-400"}>Item Discounts</span>
                  <span className="text-red-400 font-mono font-semibold">−{fmtRs(totalDiscount)}</span>
                </div>
              )}

              {/* Bill discount (editable) */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Tag size={11} className={isDark ? "text-orange-400" : "text-orange-500"} />
                  <span className={cn("text-xs", isDark ? "text-gray-400" : "text-gray-500")}>Bill Discount</span>
                </div>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min="0"
                    value={billDiscount || ""}
                    onChange={(e) => onBillDiscountChange?.(e.target.value)}
                    placeholder="0"
                    className={cn(
                      "w-16 rounded-lg border px-2 py-1 text-center text-xs font-semibold outline-none focus:ring-1 focus:ring-amber-500/30",
                      isDark ? "border-yellow-500/20 bg-[#0f0d09] text-white" : "border-yellow-200 bg-white text-gray-900",
                    )}
                  />
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => onBillDiscountTypeChange?.(billDiscountType === "fixed" ? "percent" : "fixed")}
                    className={cn(
                      "text-xs font-bold px-2 py-1 rounded-lg transition-colors",
                      isDark ? "bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20" : "bg-yellow-50 text-yellow-700 hover:bg-yellow-100",
                    )}
                  >
                    {billDiscountType === "percent" ? "%" : "Rs"}
                  </motion.button>
                  {billDiscountValue > 0 && <span className="text-xs font-bold text-red-400">−{fmtRs(billDiscountValue)}</span>}
                </div>
              </div>

              {totalSavings > 0 && (
                <div className={cn("flex items-center justify-center gap-2 rounded-lg px-3 py-1.5 text-xs bg-green-500/10 border border-green-500/20")}>
                  <ShoppingCart size={11} className="text-green-400" />
                  <span className="text-green-400 font-semibold">Total Savings: {fmtRs(totalSavings)}</span>
                </div>
              )}

              <div className={cn("h-px", isDark ? "bg-yellow-500/20" : "bg-yellow-200")} />

              <div className="flex items-center justify-between py-1">
                <span className={cn("text-sm font-bold uppercase", isDark ? "text-gray-300" : "text-gray-700")}>Grand Total</span>
                <motion.span
                  key={grandTotal}
                  initial={{ scale: 1.1 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", damping: 15 }}
                  className="text-2xl font-extrabold text-yellow-500 font-mono"
                >
                  {fmtRs(grandTotal)}
                </motion.span>
              </div>
            </div>

            {/* ── Action buttons ── */}
            <div className={cn("flex gap-3 px-5 py-4 border-t shrink-0", isDark ? "border-yellow-500/10" : "border-yellow-100")}>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={onClose}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold border transition-colors",
                  isDark ? "border-gray-700 text-gray-300 hover:bg-white/5" : "border-gray-200 text-gray-600 hover:bg-gray-50",
                )}
              >
                <ArrowLeft size={14} />Back
              </motion.button>

              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => {
                  broadcastEvent('BILL_SUMMARY_PROCEED', { billSerial });
                  onProceed?.();
                }}
                className={cn(
                  "flex-[2] flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold",
                  "bg-gradient-to-r from-yellow-500 to-amber-500 text-black hover:from-yellow-400 hover:to-amber-400",
                  "transition-all shadow-lg shadow-amber-500/20",
                )}
              >
                Proceed <ArrowRight size={14} />
              </motion.button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
});

BillSummary.displayName = "BillSummary";
export default BillSummary;