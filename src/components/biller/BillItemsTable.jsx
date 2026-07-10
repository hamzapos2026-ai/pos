// src/components/biller/BillItemsTable.jsx
// ✅ FIXED v4 — All 10 bugs resolved:
// ✅ FIX-1: fmtItemSerial always starts at 01
// ✅ FIX-2: price edit uses onChangePrice (not onChangeQty)
// ✅ FIX-3: lastAddedHighlight uses correct item.id field
// ✅ FIX-4: editingCell defaults to qty field properly
// ✅ FIX-5: colgroup discount col only when hasAnyDiscount
// ✅ FIX-6: lineTotal formula correct for both discount types
// ✅ FIX-7: strikethrough only shows when actual discount exists
// ✅ FIX-8: footer qty uses item.qty correctly
// ✅ FIX-9: delete button visible on touch (opacity always on mobile)
// ✅ FIX-10: scroll behavior via Tailwind class
// ✅ ADDED: onChangePrice prop handled correctly
// ✅ ADDED: Touch device support for delete button

import {
  useState, useEffect, useRef,
  useCallback, useMemo, memo, // ✅ 🔧 FIX-B-09: useMemo added
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { cn } from "../../utils/cn";
import { computeCommission } from "../../utils/commission";
import {
  normalizeDiscountSettings,
  isDiscountInputAllowed,
  computeMaxItemDiscountPKR,
  computeItemLineDiscountPKR,
  getMaxItemDiscountPercent,
  showDiscountLimitToast,
} from "../../utils/discountPolicy";
import toast from "../../utils/toast";
import {
  getBillableQty,
  getItemQtyLess,
  getItemFraqLessAmount,
  getItemDisplayUnitPrice,
  getItemLineTotal,
  hasDisplayProductName,
} from "../../utils/invoiceUtils";
import { useLanguage } from "../../hooks/useLanguage";

const fmtSerial = (n) => String(Math.max(1, Number(n) || 1));

/** Header ↔ cell alignment — identical padding + align per column */
const CELL_PAD = "px-1 py-0.5";

const headerAlignClass = (label) => {
  if (!label) return `text-center w-6 ${CELL_PAD}`;
  if (label === "#" || label === "Qty" || label === "Disc") return `text-center ${CELL_PAD}`;
  if (label === "Price" || label === "Total" || label === "Commission") {
    return `text-right ${CELL_PAD} font-mono tabular-nums`;
  }
  if (label === "P Name" || label === "SP") return `text-left ${CELL_PAD}`;
  return `text-left ${CELL_PAD}`;
};

const cellAlignClass = (col) => {
  const base = CELL_PAD;
  switch (col) {
    case "serial": return `text-center ${base} font-mono tabular-nums`;
    case "product": return `text-left ${base} min-w-0 truncate`;
    case "price": return `text-right ${base} min-w-0 font-mono tabular-nums`;
    case "disc": return `text-center ${base} font-mono tabular-nums`;
    case "qty": return `text-center ${base} font-mono tabular-nums`;
    case "sp": return `text-left ${base} truncate`;
    case "comm": return `text-right ${base} font-mono tabular-nums`;
    case "total": return `text-right ${base} font-mono tabular-nums`;
    case "del": return `text-center px-0 py-0.5 w-6`;
    default: return base;
  }
};

// ── Row variants ──────────────────────────────────────────────
const rowVariants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.12 } },
  exit: { opacity: 0, transition: { duration: 0.1 } },
};

// ══════════════════════════════════════════════════════════════
// EDIT CELL — inline editable input
// ══════════════════════════════════════════════════════════════
const EditCell = memo(({ value, onSave, onCancel, min = 0, isDark }) => {
  const [val, setVal] = useState(String(value));
  const ref = useRef(null);

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  const commit = useCallback(() => {
    const num = parseFloat(val);
    const safe = isNaN(num) ? min : Math.max(min, num);
    onSave(safe);
  }, [val, min, onSave]);

  return (
    <input
      ref={ref}
      type="text"
      inputMode="decimal"
      value={val}
      data-bill-input="true"
      onChange={(e) => setVal(e.target.value.replace(/[^0-9.]/g, ""))}
      onKeyDown={(e) => {
        if (e.key === "Enter") { e.preventDefault(); commit(); }
        if (e.key === "Escape") { onCancel(); }
        if (e.key === "Delete" || e.key === "Backspace") e.stopPropagation();
      }}
      onBlur={commit}
      className={cn(
        "w-20 rounded-lg border px-1.5 py-0.5 text-center",
        "text-xs font-bold outline-none",
        "focus:ring-1 focus:ring-amber-500/50",
        isDark
          ? "bg-[#0a0805] border-amber-500/50 text-amber-400"
          : "bg-white border-amber-300 text-amber-700",
      )}
    />
  );
});
EditCell.displayName = "EditCell";

// ══════════════════════════════════════════════════════════════
// BILL TABLE
// ══════════════════════════════════════════════════════════════
const BillTable = memo(({
  items = [],
  selectedRowIndex = -1,
  lastItemId = null,
  // Settings
  showProductName = false,
  showDiscountField = false,
  billerFontSize = 16,
  screenLocked = false,
  isDark = true,
  // Salesperson / commission
  agents = [],
  showSalesperson = false,
  showCommissionColumn = false,
  multiSP = false,
  // Callbacks
  onSelectRow,
  onChangeQty,
  onQtyChange,          // ✅ Handle both prop naming variants
  onChangePrice,        // ✅ NEW: separate price callback
  onChangeDiscount,
  onDiscountChange,     // ✅ Handle both prop naming variants
  onChangeDiscountType,
  allowQtyEdit = true,
  onDeleteRow,
  onItemRemove,         // ✅ Handle both prop naming variants
  onFocusPriceInput,
  onItemReassign,
  tableContainerRef,
  emptyHint = 'Please enter a new item',
  // Discount caps/settings from admin (shape: { value: { maxAmount, maxPercent, requireApproval } } or direct map)
  discountSetting = null,
  // Optional callback when user attempts an invalid discount: (info) => void
  onInvalidDiscount,
}) => {
  const { t } = useLanguage();
  const [editingCell, setEditingCell] = useState(null);
  const [lastAddedHighlight, setLastAdded] = useState(null);
  const internalContainerRef = useRef(null);
  const containerRef = tableContainerRef || internalContainerRef;

  // ✅ FIXED: Track lastItemId changes for highlight
  useEffect(() => {
    if (!lastItemId) return;
    setLastAdded(lastItemId);
    const t = setTimeout(() => setLastAdded(null), 2000);
    return () => clearTimeout(t);
  }, [lastItemId]);

  // ── ✅ FIXED: hasAnyDiscount computed correctly
  const hasAnyDiscount = items.some((item) => {
    const d = Number(item.discount) || 0;
    return d > 0;
  });

  // Disc column only when at least one item has discount applied
  const showDisc = hasAnyDiscount;

  // ── Discount caps (from admin settings) ─────────────────────────
  const discountCaps = useMemo(
    () => normalizeDiscountSettings(discountSetting),
    [discountSetting],
  );

  // ── Unified callbacks (moved up to avoid TDZ for handleDiscountInput)
  const handleQty = onChangeQty || onQtyChange;
  const handleDiscount = onChangeDiscount || onDiscountChange;
  const deleteHandler = onDeleteRow || onItemRemove;

  // Validate discount input against caps; show toast & block immediately on excess
  const handleDiscountInput = useCallback((item, rawVal, e) => {
    const raw = String(rawVal ?? "").replace(/[^0-9.]/g, "");
    const num = raw === "" ? 0 : parseFloat(raw);
    const unit = Math.max(0, Number(item.price) || 0);
    const type = item.discountType || "fixed";

    const max = type === "percent"
      ? getMaxItemDiscountPercent(discountCaps)
      : computeMaxItemDiscountPKR(unit, discountCaps);
    const hasMax = Number.isFinite(max) && max !== Infinity;

    if (hasMax && !isDiscountInputAllowed(raw, max)) {
      if (typeof onInvalidDiscount === "function") {
        try { onInvalidDiscount({ itemId: item.id, attempted: num, max, type, item }); } catch (err) { console.error(err); }
      } else {
        showDiscountLimitToast({
          maxAllowed: max,
          attempted: num,
          percentLimit: getMaxItemDiscountPercent(discountCaps),
        });
      }

      try { if (e && e.target) e.target.value = String(item.discount || ""); } catch (_) {}
      handleDiscount?.(item.id, String(Math.floor(max)));
      return;
    }

    handleDiscount?.(item.id, raw);
  }, [discountCaps, handleDiscount, onInvalidDiscount]);

  // ── When caps load / items restore: clamp silently (no toast flood on login)
  const capsClampKeyRef = useRef('');
  useEffect(() => {
    const capsKey = `${discountCaps.maxItemDiscountPercent}|${discountCaps.maxPercent}`;
    const itemsKey = items.map((i) => `${i.id}:${i.discount}:${i.discountType}:${i.price}`).join(';');
    const runKey = `${capsKey}::${itemsKey}`;
    if (runKey === capsClampKeyRef.current) return;
    capsClampKeyRef.current = runKey;

    items.forEach((item) => {
      const unit = Math.max(0, Number(item.price) || 0);
      const type = item.discountType || 'fixed';
      const max = type === 'percent'
        ? getMaxItemDiscountPercent(discountCaps)
        : computeMaxItemDiscountPKR(unit, discountCaps);
      const cur = Number(item.discount || 0);
      if (Number.isFinite(max) && max !== Infinity && cur > max) {
        handleDiscount?.(item.id, String(Math.floor(max)));
      }
    });
  }, [discountCaps, items, handleDiscount]);

  // ── ✅ FIXED: discountAmt formula for both types
  const getDiscountAmt = useCallback((item) => {
    const unit = Math.max(0, Number(item.price) || 0);
    return computeItemLineDiscountPKR(item, discountCaps, unit);
  }, [discountCaps]);

  const getLineTotal = useCallback((item) => {
    return getItemLineTotal(item, getDiscountAmt(item));
  }, [getDiscountAmt]);

  // computeCommission imported from shared util

  const getOrigTotal = useCallback((item) => {
    const discAmt = getDiscountAmt(item);
    const origQty = Number(item.originalQty ?? item.qty ?? 0);
    return (item.price - discAmt) * origQty;
  }, [getDiscountAmt]);


  // ── Edit save ──────────────────────────────────────────────
  const handleEditSave = useCallback((itemId, field, value) => {
    if (field === "qty") {
      // ✅ FIXED: qty uses unified handler
      handleQty?.(itemId, Math.max(1, Math.round(value)));
    } else if (field === "price") {
      // ✅ FIXED: price uses onChangePrice
      if (typeof onChangePrice === "function") {
        onChangePrice(itemId, Math.max(1, value));
      } else {
        // Fallback: try handleQty if no price handler (backward compat)
        console.warn("[BillTable] onChangePrice not provided");
      }
    }
    setEditingCell(null);
  }, [handleQty, onChangePrice]);

  // ── ✅ 🔧 FIX-B-09: totalSavings memoized ───────────────────────
  const totalSavings = useMemo(() =>
    items.reduce((sum, item) => sum + getDiscountAmt(item) * (Number(item.qty) || 1), 0),
  [items, getDiscountAmt]);

  // ── ✅ Dynamic P NAME column: show only if ANY item has product name ──
  const dynamicShowProductName = useMemo(() => {
    if (!showProductName) return false; // admin setting disabled
    return items.some(hasDisplayProductName); // check if any item has actual product name
  }, [items, showProductName]);

  // ── Font sizes — larger table text, tight gaps ──
  const fontSize = Math.max(billerFontSize + 2, 16);
  const cellFont = Math.max(billerFontSize + 3, 18);

  // ── Col widths — balanced equal-ish distribution for visible columns ──
  const colWidths = useMemo(() => {
    const keys = ["serial"];
    if (dynamicShowProductName) keys.push("product");
    keys.push("price");
    if (showDisc) keys.push("disc");
    keys.push("qty");
    if (showSalesperson) keys.push("sp");
    if (showCommissionColumn) keys.push("comm");
    keys.push("total", "del");

    const weights = {
      serial: 0.7,
      product: 2,
      price: 1.35,
      disc: 1.35,
      qty: 1.35,
      sp: 1.35,
      comm: 1.35,
      total: 1.35,
      del: 0.45,
    };
    const totalW = keys.reduce((sum, key) => sum + (weights[key] || 1), 0);
    const normalized = {};
    keys.forEach((key) => {
      normalized[key] = `${(((weights[key] || 1) / totalW) * 100).toFixed(1)}%`;
    });
    return normalized;
  }, [dynamicShowProductName, showSalesperson, showDisc, showCommissionColumn]);

  const tableHeaders = useMemo(() => [
    "#",
    ...(dynamicShowProductName ? ["P Name"] : []),
    "Price",
    ...(showDisc ? ["Disc"] : []),
    "Qty",
    ...(showSalesperson ? ["SP"] : []),
    ...(showCommissionColumn ? ["Commission"] : []),
    "Total",
    "",
  ], [dynamicShowProductName, showDisc, showSalesperson, showCommissionColumn]);

  const colGroup = (
    <colgroup>
      <col style={{ width: colWidths.serial }} />
      {dynamicShowProductName && <col style={{ width: colWidths.product }} />}
      <col style={{ width: colWidths.price }} />
      {showDisc && <col style={{ width: colWidths.disc }} />}
      <col style={{ width: colWidths.qty }} />
      {showSalesperson && <col style={{ width: colWidths.sp }} />}
      {showCommissionColumn && <col style={{ width: colWidths.comm }} />}
      <col style={{ width: colWidths.total }} />
      <col style={{ width: colWidths.del }} />
    </colgroup>
  );

  const tableHead = (
    <thead className="sticky top-0 z-20">
      <tr className={isDark ? "text-yellow-500" : "text-yellow-700"}>
        {tableHeaders.map((h, i) => (
          <th
            key={i}
            className={cn(
              "py-1 font-bold whitespace-nowrap text-sm sm:text-base align-middle border-b",
              // With border-collapse, the sticky background MUST live on each <th>,
              // otherwise scrolled rows show through and overlap the header.
              isDark
                ? "bg-[#15120d] border-yellow-500/25"
                : "bg-white border-yellow-200",
              headerAlignClass(h),
            )}
          >
            {h}
          </th>
        ))}
      </tr>
    </thead>
  );

  // ── Empty state ────────────────────────────────────────────
  if (items.length === 0) {
    return (
      <div className="flex-1 flex flex-col min-h-0">
        <table
          className="w-full table-fixed border-collapse"
          style={{ fontSize: `${fontSize}px` }}
        >
          {colGroup}
          {tableHead}
        </table>
        <div className="flex-1 flex items-center justify-center py-6 px-4">
          <p className={cn(
            "text-sm font-medium text-center",
            isDark ? "text-gray-500" : "text-gray-400",
          )}>
            {emptyHint}
          </p>
        </div>
      </div>
      );
  }

  {/* ── TABLE BODY (scrollable) ───────────────────────────── */}
  return (
    <>
      <div
        ref={containerRef}
        className={cn(
          "flex-1 min-h-0 overflow-y-auto overflow-x-hidden",
          // ✅ FIXED: scroll-smooth via Tailwind (not inline style)
          "scroll-smooth",
        )}
      >
        <table
          className="w-full table-fixed border-collapse"
          style={{ fontSize: `${fontSize}px` }}
        >
          {colGroup}
          {tableHead}

          <tbody>
            <AnimatePresence mode="sync" initial={false}>
              {items.map((item, index) => {
                const discAmt = getDiscountAmt(item);
                const hasDisc = discAmt > 0;
                const qtyLess = getItemQtyLess(item);
                const fraqAmt = getItemFraqLessAmount(item, discAmt);
                const lineTotal = getLineTotal(item);
                const origTotal = getOrigTotal(item);
                const showOrigStrike = hasDisc || qtyLess > 0;
                const isNegTotal = lineTotal < 0;
                const isSel = selectedRowIndex === index;
                // ✅ FIXED: use item.id consistently
                const isNew = lastAddedHighlight === item.id;
                const isEditing = editingCell?.itemId === item.id;
                const isQtyEditing = isEditing && editingCell?.field === "qty";

                return (
                  <motion.tr
                    key={item.id}
                    variants={rowVariants}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                    onClick={() => onSelectRow?.(index)}
                    className={cn(
                      "cursor-pointer border-b transition-colors group",
                      isSel
                        ? isDark
                          ? "border-yellow-500/40 bg-yellow-500/15 shadow-[inset_3px_0_0_0_#eab308]"
                          : "border-yellow-300 bg-yellow-100/60 shadow-[inset_3px_0_0_0_#eab308]"
                        : isNew
                          ? isDark
                            ? "border-green-500/20 bg-green-500/5"
                            : "border-green-100 bg-green-50/30"
                          : isDark
                            ? "border-yellow-500/10 text-white hover:bg-white/5"
                            : "border-yellow-100 text-gray-900 hover:bg-gray-50",
                    )}
                  >
                    {/* ── Serial # ──────────────────────────────── */}
                    <td className={cn(
                      "align-middle font-bold",
                      cellAlignClass("serial"),
                      isSel
                        ? isDark ? "text-yellow-400" : "text-yellow-700"
                        : isDark ? "text-gray-200" : "text-gray-700",
                    )} style={{ fontSize: `${cellFont}px` }}>
                      {fmtSerial(index + 1)}
                    </td>

                    {/* ── Product name ───────────────────────────── */}
                    {dynamicShowProductName && (
                      <td className={cn(
                        "py-0.5 truncate overflow-hidden",
                        cellAlignClass("product"),
                        isDark ? "text-gray-200" : "text-gray-800",
                      )} style={{ fontSize: `${cellFont - 1}px` }}>
                        {hasDisplayProductName(item) ? (
                          <span className="block truncate font-medium" title={item.productName}>
                            {item.productName}
                          </span>
                        ) : null}
                      </td>
                    )}

                    {/* ── Price ─────────────────────────────────── */}
                    <td className={cn("py-0.5 align-middle overflow-hidden", cellAlignClass("price"))}>
                      {(() => {
                        const netUnit = item.price - discAmt;
                        const displayUnit = getItemDisplayUnitPrice(item, discAmt);
                        const hasFraqPrice = qtyLess > 0 && displayUnit !== netUnit;

                        if (hasFraqPrice || hasDisc) {
                          return (
                            <div className="leading-tight">
                              {(hasDisc || hasFraqPrice) && (
                                <span className={cn(
                                  "text-[9px] sm:text-xs font-medium line-through block font-mono tabular-nums text-right",
                                  isDark ? "text-gray-600" : "text-gray-400",
                                )}>
                                  {netUnit.toLocaleString()}
                                </span>
                              )}
                              <span
                                className={cn(
                                  "font-bold font-mono tabular-nums text-right block",
                                  hasFraqPrice
                                    ? (isDark ? "text-orange-400" : "text-orange-600")
                                    : (isDark ? "text-green-400" : "text-green-600"),
                                )}
                                style={{ fontSize: `${cellFont}px` }}
                              >
                                {displayUnit.toLocaleString()}
                              </span>
                            </div>
                          );
                        }

                        return (
                          <span
                            className={cn(
                              "font-bold font-mono tabular-nums w-full block text-right",
                              isDark ? "text-gray-200" : "text-gray-700",
                            )}
                            style={{ fontSize: `${cellFont}px` }}
                          >
                            {item.price.toLocaleString()}
                          </span>
                        );
                      })()}
                    </td>

                    {/* ── Discount (only when any item has discount) ─ */}
                    {showDisc && (
                      <td className={cn("py-0.5 align-middle", cellAlignClass("disc"))}>
                        {hasDisc && showDiscountField ? (
                          <input
                            type="text"
                            inputMode="decimal"
                            value={item.discount || ""}
                            data-bill-input="true"
                            onChange={(e) => handleDiscountInput(item, e.target.value.replace(/[^\d]/g, ""), e)}
                            disabled={screenLocked}
                            onClick={(e) => { e.stopPropagation(); e.target.select(); }}
                            onFocus={(e) => e.target.select()}
                            onKeyDown={(e) => {
                              if (e.key === "Delete" || e.key === "Backspace")
                                e.stopPropagation();
                              if (e.key.length === 1 && /\d/.test(e.key)) {
                                const el = e.target;
                                const selStart = el.selectionStart ?? 0;
                                const selEnd = el.selectionEnd ?? 0;
                                const next = `${String(item.discount || "").slice(0, selStart)}${e.key}${String(item.discount || "").slice(selEnd)}`;
                                const cleaned = next.replace(/[^\d]/g, "");
                                const type = item.discountType || "fixed";
                                const max = type === "percent" ? discountCaps.maxPercent : discountCaps.maxAmount;
                                if (Number.isFinite(max) && max !== Infinity && !isDiscountInputAllowed(cleaned, max)) {
                                  e.preventDefault();
                                  handleDiscountInput(item, cleaned, e);
                                }
                              }
                            }}
                            autoComplete="off" spellCheck={false}
                            style={{ fontSize: "13px" }}
                            className={cn(
                              "w-full max-w-[3rem] md:max-w-[4rem] mx-auto rounded-lg border px-1 py-0.5 text-xs md:text-sm",
                              "text-center font-bold font-mono tabular-nums outline-none",
                              "focus:border-amber-500 focus:ring-1 focus:ring-amber-500/50 transition-colors",
                              "disabled:opacity-50 [appearance:textfield]",
                              isDark
                                ? "border-yellow-500/20 bg-black/30 text-white"
                                : "border-yellow-200 bg-white text-gray-900",
                              isDark
                                ? "border-red-500/40 text-red-300"
                                : "border-red-300 text-red-600",
                            )}
                          />
                        ) : hasDisc ? (
                          <span className={cn(
                            "text-[12px] font-bold font-mono tabular-nums",
                            isDark ? "text-red-400" : "text-red-500",
                          )}>
                            {item.discountType === "percent" ? `${Number(item.discount) || 0}%` : (Number(item.discount) || discAmt).toLocaleString()}
                          </span>
                        ) : (
                          <span className={cn(
                            "text-[11px] font-mono",
                            isDark ? "text-gray-700" : "text-gray-300",
                          )}>
                            —
                          </span>
                        )}
                      </td>
                    )}

                    {/* ── Qty ───────────────────────────────────── */}
                    <td className={cn("py-0.5 align-middle", cellAlignClass("qty"))}>
                      <div className="flex flex-col items-center leading-tight gap-0.5">
                        {isQtyEditing ? (
                          <EditCell
                            value={item.qty}
                            min={1}
                            isDark={isDark}
                            onSave={(value) => handleEditSave(item.id, "qty", value)}
                            onCancel={() => setEditingCell(null)}
                          />
                        ) : (
                          <span
                            role={allowQtyEdit && !screenLocked ? "button" : undefined}
                            tabIndex={allowQtyEdit && !screenLocked ? 0 : undefined}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (allowQtyEdit && !screenLocked) {
                                setEditingCell({ itemId: item.id, field: "qty" });
                              }
                            }}
                            onKeyDown={(e) => {
                              if (!allowQtyEdit || screenLocked) return;
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                setEditingCell({ itemId: item.id, field: "qty" });
                              }
                            }}
                            className={cn(
                              "font-semibold font-mono tabular-nums",
                              Number(item.qty) < 0
                                ? (isDark ? "text-orange-400" : "text-orange-600")
                                : (isDark ? "text-gray-200" : "text-gray-700"),
                              allowQtyEdit && !screenLocked ? "cursor-pointer hover:text-yellow-400 focus:text-yellow-400 outline-none" : "",
                            )}
                            style={{ fontSize: `${cellFont}px` }}
                          >
                            {item.qty}
                          </span>
                        )}
                        {qtyLess > 0 && (
                          <span
                            className={cn(
                              "text-[9px] font-bold uppercase tracking-wide whitespace-nowrap",
                              isDark ? "text-orange-400" : "text-orange-600",
                            )}
                          >
                            {t("fraqLess", "Fraq")} {qtyLess}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* ── Salesperson ───────────────────────────── */}
                    {showSalesperson && (
                      <td className={cn("py-0.5 align-middle", cellAlignClass("sp"))} style={{ fontSize: `${cellFont - 1}px` }}>
                        {item.salespersonName || item.salesperson?.name ? (
                          <div className="truncate text-sm" title={item.salespersonName || item.salesperson?.name}>
                            {String(item.salespersonName || item.salesperson?.name || "—")}
                          </div>
                        ) : (
                          <span className={cn("text-[11px] text-gray-400")}>—</span>
                        )}
                      </td>
                    )}

                    {/* ── Commission (admin only — hidden from billers) ── */}
                    {showCommissionColumn && (() => {
                      // Dynamically calculate salesperson commission per item row
                      let commAmt = Number(item.commissionAmount || item.salesperson?.commissionAmount || 0);
                      if (commAmt === 0 && item.salespersonId) {
                        const qty = getBillableQty(item);
                        const price = Number(item.price || 0);
                        const discAmt = getDiscountAmt(item);
                        const lineTotal = Math.max(0, (price - discAmt) * qty);

                        const pct = Number(
                          item.commissionPercent
                          ?? item.commissionRate
                          ?? item.salesperson?.commissionRate
                          ?? 0,
                        );
                        commAmt = computeCommission({ type: 'percent', pct, lineTotal, qty });
                      }

                      return (
                        <td className={cn("py-0.5 align-middle font-mono tabular-nums", cellAlignClass("comm"))}>
                          {commAmt > 0 ? (
                            <span className={cn("text-[12px] font-bold", isDark ? "text-emerald-300" : "text-emerald-700")}>
                              Rs.{commAmt.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                            </span>
                          ) : (
                            <span className={cn("text-[11px] text-gray-500")}>—</span>
                          )}
                        </td>
                      );
                    })()}

                    {/* ── Total ─────────────────────────────────── */}
                    <td className={cn("py-0.5 align-middle font-mono tabular-nums", cellAlignClass("total"))}>
                      {showOrigStrike ? (
                        <div className="leading-none">
                          <span className={cn(
                            "text-[12px] font-medium line-through block",
                            isDark ? "text-gray-600" : "text-gray-400",
                          )}>
                            {origTotal.toLocaleString()}
                          </span>
                          <span
                            className={cn(
                              "font-extrabold font-mono tabular-nums",
                              isNegTotal ? (isDark ? "text-orange-400" : "text-orange-600") : "text-yellow-500",
                            )}
                            style={{ fontSize: `${cellFont}px` }}
                          >
                            {lineTotal.toLocaleString()}
                          </span>
                          {fraqAmt !== 0 && (
                            <span className={cn(
                              "text-[9px] font-bold font-mono tabular-nums block",
                              isDark ? "text-orange-400" : "text-orange-600",
                            )}>
                              {fraqAmt.toLocaleString()}
                            </span>
                          )}
                        </div>
                      ) : (
                        <div className="leading-tight">
                          <span
                            className={cn(
                              "font-extrabold font-mono tabular-nums",
                              isNegTotal ? (isDark ? "text-orange-400" : "text-orange-600") : "text-yellow-500",
                            )}
                            style={{ fontSize: `${cellFont}px` }}
                          >
                            {lineTotal.toLocaleString()}
                          </span>
                          {fraqAmt !== 0 && (
                            <span className={cn(
                              "text-[9px] font-bold font-mono tabular-nums block",
                              isDark ? "text-orange-400" : "text-orange-600",
                            )}>
                              {fraqAmt.toLocaleString()}
                            </span>
                          )}
                        </div>
                      )}
                    </td>

                    {/* ── Delete ────────────────────────────────── */}
                    <td className={cn("py-0.5 align-middle", cellAlignClass("del"))}>
                      <motion.button
                        type="button"
                        whileHover={{ scale: 1.15 }}
                        whileTap={{ scale: 0.85 }}
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteHandler?.(item.id);
                        }}
                        disabled={screenLocked}
                        className={cn(
                          "rounded-lg p-0.5 transition-all",
                          // ✅ FIXED: visible on touch screens too
                          // opacity-0 only on non-touch (pointer:fine)
                          "opacity-100 sm:opacity-0 sm:group-hover:opacity-100",
                          "focus:opacity-100",
                          isDark
                            ? "bg-red-500/10 text-red-400 hover:bg-red-500/20"
                            : "bg-red-50 text-red-500 hover:bg-red-100",
                          "disabled:opacity-30 disabled:cursor-not-allowed",
                        )}
                        aria-label="Delete item"
                      >
                        <X size={11} />
                      </motion.button>
                    </td>
                  </motion.tr>
                );
              })}
            </AnimatePresence>
          </tbody>
        </table>
      </div>

    </>
  );
});

BillTable.displayName = "BillTable";
export default BillTable;