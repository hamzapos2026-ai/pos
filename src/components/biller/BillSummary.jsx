// src/components/biller/BillSummary.jsx
// ✅ MASTER ARCHITECTURE v4 — Dashboard Compatible
// ✅ ADDED: F8/ESC keyboard shortcuts
// ✅ ADDED: BroadcastChannel for parent sync
// ═══════════════════════════════════════════════════════════════

import { memo, useMemo, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Receipt, User, Phone, MapPin, Store,
  ArrowLeft, ArrowRight, X, Tag, ShoppingCart,
} from "lucide-react";
import { cn } from "../../utils/cn";
import { useTheme } from "../../context/ThemeContext";
import { computeBillDiscountValuePKR, isDiscountInputAllowed, showDiscountLimitToast } from "../../utils/discountPolicy";
import {
  getItemQtyLess,
  getItemFraqLessAmount,
  getItemDisplayUnitPrice,
  getItemLineTotal,
} from "../../utils/invoiceUtils";

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
const fmtItemSerial = (n) => String(Math.max(1, Number(n) || 1));
const fmtRs = (n) => `Rs.${Math.max(0, Number(n) || 0).toLocaleString()}`;

const focusSelectAll = (el) => {
  if (!el) return;
  el.focus();
  requestAnimationFrame(() => {
    try {
      if (typeof el.select === "function") el.select();
    } catch { /* ignore */ }
  });
};

// ─── Animation variants ──────────────────────────────────────
const overlayVariants = {
  initial: { opacity: 1 },
  animate: { opacity: 1 },
  exit:    { opacity: 0, transition: { duration: 0 } },
};

const cardVariants = {
  initial: { opacity: 1, y: 0 },
  animate: { opacity: 1, y: 0, transition: { duration: 0 } },
  exit: { opacity: 0, transition: { duration: 0 } },
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
  showBillDiscount = true,
  allowBillDiscountPKR = true,
  allowBillDiscountPercent = true,
  maxSummaryDiscountPKR = 0,
  maxSummaryDiscountPercent = 0,
  // ✅ NEW: External F8 control
  onF8Press,
}) => {
  const { isDark } = useTheme();
  const salespersonRef = useRef(null);
  const discountRef = useRef(null);
  const discountTypeRef = useRef(null);
  const proceedRef = useRef(null);
  const backRef = useRef(null);

  const showSalespersonPicker = salespersonEnabled && salespersonAgents.length > 0;
  const showDiscountField = showBillDiscount && (allowBillDiscountPKR || allowBillDiscountPercent);
  const showDiscountTypeToggle = allowBillDiscountPKR && allowBillDiscountPercent;

  const effectiveDiscountType = useMemo(() => {
    if (allowBillDiscountPKR && !allowBillDiscountPercent) return "fixed";
    if (!allowBillDiscountPKR && allowBillDiscountPercent) return "percent";
    return billDiscountType || "fixed";
  }, [allowBillDiscountPKR, allowBillDiscountPercent, billDiscountType]);

  const focusDiscount = useCallback(() => {
    if (showDiscountField) {
      focusSelectAll(discountRef.current);
      return;
    }
    proceedRef.current?.focus();
  }, [showDiscountField]);

  const handleProceed = useCallback(() => {
    broadcastEvent('BILL_SUMMARY_PROCEED', { billSerial });
    onProceed?.();
  }, [billSerial, onProceed]);

  const handleSalespersonKeyDown = useCallback((e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    focusDiscount();
  }, [focusDiscount]);

  const handleDiscountKeyDown = useCallback((e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (showDiscountTypeToggle) {
      discountTypeRef.current?.focus();
      return;
    }
    proceedRef.current?.focus();
  }, [showDiscountTypeToggle]);

  const handleDiscountTypeKeyDown = useCallback((e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onBillDiscountTypeChange?.(effectiveDiscountType === "fixed" ? "percent" : "fixed");
      proceedRef.current?.focus();
    }
  }, [effectiveDiscountType, onBillDiscountTypeChange]);

  const handleProceedKeyDown = useCallback((e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    handleProceed();
  }, [handleProceed]);

  const handleBackKeyDown = useCallback((e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    onClose?.();
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) return;
    const t = window.setTimeout(() => {
      if (showSalespersonPicker) {
        salespersonRef.current?.focus();
        return;
      }
      focusDiscount();
    }, 0);
    return () => window.clearTimeout(t);
  }, [isOpen, showSalespersonPicker, focusDiscount]);

  // ── Bill discount computed value (summary caps) ──────────
  const billDiscountValue = useMemo(() => computeBillDiscountValuePKR(
    subtotal,
    billDiscount,
    effectiveDiscountType,
    { maxPercent: maxSummaryDiscountPercent, maxPKR: maxSummaryDiscountPKR },
  ), [subtotal, billDiscount, effectiveDiscountType, maxSummaryDiscountPercent, maxSummaryDiscountPKR]);

  const displayGrandTotal = useMemo(
    () => Math.round(subtotal - billDiscountValue),
    [subtotal, billDiscountValue],
  );

  const fraqTotal = useMemo(
    () => items.reduce((sum, item) => {
      const discAmt = item.discountType === "percent"
        ? Math.round(item.price * item.discount / 100)
        : (item.discount || 0);
      return sum + getItemFraqLessAmount(item, discAmt);
    }, 0),
    [items],
  );

  const signedQtyTotal = useMemo(
    () => items.reduce((sum, item) => sum + Number(item.qty ?? 0), 0),
    [items],
  );

  const showMinimizeSummary = useMemo(
    () => items.some((item) => Number(item.qty ?? 0) < 0) || signedQtyTotal < 0,
    [items, signedQtyTotal],
  );

  const handleBillDiscountInput = (raw) => {
    const cleaned = String(raw ?? "").replace(/[^\d.]/g, "");
    const type = effectiveDiscountType;
    const pctCap = maxSummaryDiscountPercent > 0 ? maxSummaryDiscountPercent : Infinity;
    const pkrCap = maxSummaryDiscountPKR > 0 ? maxSummaryDiscountPKR : Infinity;
    const pctLimitRs = pctCap !== Infinity ? Math.round((subtotal * pctCap) / 100) : subtotal;
    let maxAllowed = subtotal;
    if (pctCap !== Infinity) maxAllowed = Math.min(maxAllowed, pctLimitRs);
    if (pkrCap !== Infinity) maxAllowed = Math.min(maxAllowed, pkrCap);
    const inputCap = type === "percent"
      ? (pctCap !== Infinity ? pctCap : 100)
      : maxAllowed;

    if (!isDiscountInputAllowed(cleaned, inputCap)) {
      showDiscountLimitToast({
        maxAllowed: type === "percent" ? inputCap : maxAllowed,
        attempted: Number(cleaned) || 0,
        percentLimit: type === "percent" ? pctCap : null,
        title: "Summary discount limit se zyada hai",
      });
      return;
    }
    onBillDiscountChange?.(cleaned);
  };

  // ── Total savings ─────────────────────────────────────────
  const totalSavings = totalDiscount + billDiscountValue;

  // ── ESC only — F8 handled centrally by BillerDashboard ───
  useEffect(() => {
    if (!isOpen) return;

    const handler = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose?.();
        return;
      }
      if (e.key === "Enter" && e.target === document.body) {
        e.preventDefault();
        proceedRef.current?.focus();
      }
    };

    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70"
      data-biller-modal="true"
      onClick={onClose}
    >
      <div
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
                {["Enter", "F8", "ESC"].map((k) => (
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

            {/* ── Customer info (small text at top) ── */}
            {(() => {
              const cName = (customer?.name || "").trim();
              const cPhone = (customer?.phone || "").trim();
              if (!cName && !cPhone) return null;
              return (
                <div className={cn("px-5 py-2 border-b shrink-0", isDark ? "border-yellow-500/10 bg-black/10" : "border-yellow-100 bg-yellow-50/50")}>
                  <p className={cn("text-[10px] leading-relaxed", isDark ? "text-gray-400" : "text-gray-600")}>
                    {cName && <span className={cn("font-medium", isDark ? "text-gray-300" : "text-gray-800")}>{cName}</span>}
                    {cName && cPhone && <span className="mx-1.5 opacity-40">·</span>}
                    {cPhone && <span className={cn("font-mono", isDark ? "text-yellow-400/90" : "text-yellow-700")}>{cPhone}</span>}
                    {customer?.city && (
                      <span className={cn("ml-1.5 opacity-70", isDark ? "text-gray-500" : "text-gray-500")}>
                        · {customer.city}{customer.market ? ` / ${customer.market}` : ""}
                      </span>
                    )}
                  </p>
                </div>
              );
            })()}

            {/* ── Salesperson section ── */}
            {showSalespersonPicker && (
              <div className={cn("px-5 py-3 border-b shrink-0 space-y-2", isDark ? "border-yellow-500/10" : "border-yellow-100")}>
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className={cn("text-xs font-semibold uppercase", isDark ? "text-gray-400" : "text-gray-500")}>Salesperson</div>
                    <p className={cn("text-[11px]", isDark ? "text-gray-500" : "text-gray-500")}>↑↓ select · Enter → discount</p>
                  </div>
                </div>
                <select
                  ref={salespersonRef}
                  value={selectedSalespersonId || ""}
                  onChange={(e) => onSalespersonChange?.(e.target.value)}
                  onKeyDown={handleSalespersonKeyDown}
                  className={cn(
                    "w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-500/30",
                    isDark ? "border-yellow-500/20 bg-[#0f0d09] text-white" : "border-gray-200 bg-white text-gray-900",
                  )}
                >
                  <option value="">Select agent</option>
                  {salespersonAgents.map((agent) => (
                    <option key={agent.id} value={agent.id}>
                      {agent.name}
                    </option>
                  ))}
                </select>
                {selectedSalespersonId === "" && (
                  <div className={cn("text-xs text-rose-400 mt-1", isDark ? "text-rose-300" : "text-rose-500")}>
                    Please select a salesperson.
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
                        const qtyLess = getItemQtyLess(item);
                        const fraqAmt = getItemFraqLessAmount(item, discAmt);
                        const lineTotal = getItemLineTotal(item, discAmt);
                        const displayPrice = getItemDisplayUnitPrice(item, discAmt);
                        return (
                          <div key={item.id || index} className={cn('flex items-center justify-between py-1.5 px-2 rounded-lg text-xs', gi % 2 === 0 ? (isDark ? 'bg-yellow-500/5' : 'bg-yellow-50/50') : '')}>
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              <span className={cn('w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0', isDark ? 'bg-yellow-500/20 text-yellow-400' : 'bg-yellow-100 text-yellow-700')}>{fmtItemSerial(index + 1)}</span>
                              <span className={cn('truncate', isDark ? 'text-gray-300' : 'text-gray-700')}>{item.productName || `Item ${fmtItemSerial(index + 1)}`}</span>
                            </div>
                            <div className="flex items-center gap-3 shrink-0">
                              <span className={isDark ? 'text-gray-500' : 'text-gray-400'}>
                                {qtyLess > 0 ? (
                                  <>
                                    <span className="line-through">{(item.price - discAmt).toLocaleString()}</span>
                                    {' '}
                                    <span className="text-orange-500">{displayPrice.toLocaleString()}</span>
                                    {' × '}{item.qty}
                                    <span className="text-orange-500 ml-1">Fraq {fraqAmt.toLocaleString()}</span>
                                  </>
                                ) : (
                                  <>{item.price.toLocaleString()} × {item.qty}</>
                                )}
                              </span>
                              {hasDisc && <span className="text-red-400 text-[10px]">−{discAmt.toLocaleString()}</span>}
                              <span className={cn(
                                'font-mono font-bold min-w-[60px] text-right',
                                lineTotal < 0 ? 'text-orange-500' : (isDark ? 'text-yellow-400' : 'text-yellow-700'),
                              )}>{lineTotal.toLocaleString()}</span>
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
                    const qtyLess = getItemQtyLess(item);
                    const fraqAmt = getItemFraqLessAmount(item, discAmt);
                    const lineTotal = getItemLineTotal(item, discAmt);
                    const displayPrice = getItemDisplayUnitPrice(item, discAmt);

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
                            {qtyLess > 0 ? (
                              <>
                                <span className="line-through">{(item.price - discAmt).toLocaleString()}</span>
                                {' '}
                                <span className="text-orange-500">{displayPrice.toLocaleString()}</span>
                                {' × '}{item.qty}
                                <span className="text-orange-500 ml-1">Fraq {fraqAmt.toLocaleString()}</span>
                              </>
                            ) : (
                              <>{item.price.toLocaleString()} × {item.qty}</>
                            )}
                          </span>
                          {hasDisc && <span className="text-red-400 text-[10px]">−{discAmt.toLocaleString()}</span>}
                          <span className={cn(
                            "font-mono font-bold min-w-[60px] text-right",
                            lineTotal < 0 ? "text-orange-500" : (isDark ? "text-yellow-400" : "text-yellow-700"),
                          )}>{lineTotal.toLocaleString()}</span>
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

              {/* Bill discount (editable) — controlled by super admin summary settings */}
              {showDiscountField && (
              <>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Tag size={11} className={isDark ? "text-orange-400" : "text-orange-500"} />
                  <span className={cn("text-xs", isDark ? "text-gray-400" : "text-gray-500")}>Bill Discount</span>
                </div>
                <div className="flex items-center gap-1">
                  <input
                    ref={discountRef}
                    type="number"
                    min="0"
                    value={billDiscount || ""}
                    onChange={(e) => handleBillDiscountInput(e.target.value)}
                    onFocus={(e) => focusSelectAll(e.target)}
                    onKeyDown={handleDiscountKeyDown}
                    placeholder="0"
                    className={cn(
                      "w-16 rounded-lg border px-2 py-1 text-center text-xs font-semibold outline-none focus:ring-1 focus:ring-amber-500/30",
                      isDark ? "border-yellow-500/20 bg-[#0f0d09] text-white" : "border-yellow-200 bg-white text-gray-900",
                    )}
                  />
                  {showDiscountTypeToggle && (
                  <motion.button
                    ref={discountTypeRef}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => onBillDiscountTypeChange?.(effectiveDiscountType === "fixed" ? "percent" : "fixed")}
                    onKeyDown={handleDiscountTypeKeyDown}
                    className={cn(
                      "text-xs font-bold px-2 py-1 rounded-lg transition-colors outline-none focus:ring-2 focus:ring-amber-500/30",
                      isDark ? "bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20" : "bg-yellow-50 text-yellow-700 hover:bg-yellow-100",
                    )}
                  >
                    {effectiveDiscountType === "percent" ? "%" : "Rs"}
                  </motion.button>
                  )}
                  {!allowBillDiscountPKR && allowBillDiscountPercent && (
                    <span className="text-[10px] font-bold text-amber-500/80">%</span>
                  )}
                  {allowBillDiscountPKR && !allowBillDiscountPercent && (
                    <span className="text-[10px] font-bold text-amber-500/80">Rs</span>
                  )}
                  {billDiscountValue > 0 && <span className="text-xs font-bold text-red-400">−{fmtRs(billDiscountValue)}</span>}
                </div>
              </div>
              {(maxSummaryDiscountPercent > 0 || maxSummaryDiscountPKR > 0) && (
                <p className={cn("text-[10px] text-right -mt-1", isDark ? "text-gray-500" : "text-gray-400")}>
                  {maxSummaryDiscountPercent > 0 && `Max ${maxSummaryDiscountPercent}%`}
                  {maxSummaryDiscountPercent > 0 && maxSummaryDiscountPKR > 0 && " · "}
                  {maxSummaryDiscountPKR > 0 && `Max Rs ${Number(maxSummaryDiscountPKR).toLocaleString()}`}
                </p>
              )}
              </>
              )}

              {totalSavings > 0 && (
                <div className={cn("flex items-center justify-center gap-2 rounded-lg px-3 py-1.5 text-xs bg-green-500/10 border border-green-500/20")}>
                  <ShoppingCart size={11} className="text-green-400" />
                  <span className="text-green-400 font-semibold">Total Savings: {fmtRs(totalSavings)}</span>
                </div>
              )}

              {showMinimizeSummary && (
                <>
                  <div className="flex justify-between text-xs">
                    <span className={isDark ? "text-gray-400" : "text-gray-500"}>Total Items</span>
                    <span className="text-orange-500 font-mono font-bold">{signedQtyTotal}</span>
                  </div>
                  {fraqTotal !== 0 && (
                    <div className="flex justify-between text-xs">
                      <span className="text-orange-500 font-semibold">Fraq Less Total</span>
                      <span className="text-orange-500 font-mono font-bold">Rs. {fraqTotal.toLocaleString()}</span>
                    </div>
                  )}
                </>
              )}

              <div className={cn("h-px", isDark ? "bg-yellow-500/20" : "bg-yellow-200")} />

              <div className="flex items-center justify-between py-1">
                <span className={cn("text-sm font-bold uppercase", isDark ? "text-gray-300" : "text-gray-700")}>Grand Total</span>
                <motion.span
                  key={displayGrandTotal}
                  initial={{ scale: 1.1 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", damping: 15 }}
                  className="text-2xl font-extrabold text-yellow-500 font-mono"
                >
                  {fmtRs(displayGrandTotal)}
                </motion.span>
              </div>
            </div>

            {/* ── Action buttons ── */}
            <div className={cn("flex gap-3 px-5 py-4 border-t shrink-0", isDark ? "border-yellow-500/10" : "border-yellow-100")}>
              <motion.button
                ref={backRef}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={onClose}
                onKeyDown={handleBackKeyDown}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold border transition-colors outline-none focus:ring-2 focus:ring-amber-500/30",
                  isDark ? "border-gray-700 text-gray-300 hover:bg-white/5" : "border-gray-200 text-gray-600 hover:bg-gray-50",
                )}
              >
                <ArrowLeft size={14} />Back
              </motion.button>

              <motion.button
                ref={proceedRef}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleProceed}
                onKeyDown={handleProceedKeyDown}
                className={cn(
                  "flex-[2] flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold outline-none focus:ring-2 focus:ring-amber-500/40",
                  "bg-gradient-to-r from-yellow-500 to-amber-500 text-black hover:from-yellow-400 hover:to-amber-400",
                  "transition-all shadow-lg shadow-amber-500/20",
                )}
              >
                Proceed (Enter / F8) <ArrowRight size={14} />
              </motion.button>
            </div>
          </div>
        </div>
  );
});

BillSummary.displayName = "BillSummary";
export default BillSummary;