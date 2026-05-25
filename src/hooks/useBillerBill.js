// src/hooks/useBillerBill.js
// ✅ FIXED v3 — Item naming bug fixed
// ✅ FIX: Item names use cumulative count (not active count)
//        Prevents duplicate "Item 02" after removing items
// ✅ All v2 fixes preserved

import { useCallback, useMemo } from "react";
import { useFraudDetection } from "./useFraudDetection";
import { getNextItemSerial } from "../services/serialService";
import { generateLineItemId } from "../utils/billIdGenerator";

const fmtItemSerial = (n) =>
  String(Math.max(1, Number(n) || 1)).padStart(2, "0");

const lineUnitPrice = (p) => {
  if (typeof p === "number" && Number.isFinite(p)) return Math.max(0, p);
  const n = Number(String(p ?? "").replace(/,/g, ""));
  return Number.isFinite(n) && n >= 0 ? n : 0;
};

export const useBillerBill = ({
  items = [],
  screenLocked = false,
  showProductName = false,
  updateTab,
  billerId,
  storeId,
  onSuccess,
  onError,
}) => {
  const { checkFraud } = useFraudDetection();

  const activeItems = useMemo(
    () => items.filter((i) => !i.isRemoved),
    [items],
  );

  // ──────────────────────────────────────────────────────────
  // ADD ITEM — FIXED Item name uses cumulative counter
  // ──────────────────────────────────────────────────────────
  const addItem = useCallback(
    (form, lastEntry, intentionalDupRef) => {
      if (screenLocked) {
        onError?.("Screen is locked");
        return false;
      }

      const rawPrice = String(form.price ?? "").trim();
      const priceEmpty = rawPrice === "";
      const price = Number(rawPrice);
      const priceValid = !priceEmpty && Number.isFinite(price) && price > 0;
      const qtyRaw = String(form.qty ?? "").trim();
      const qty = Number(qtyRaw) > 0 ? Number(qtyRaw) : 1;

      // ── Case A: Empty price → duplicate last ──
      if (priceEmpty) {
        if (!activeItems.length) {
          onError?.("Enter a price first");
          return false;
        }

        const last = activeItems[activeItems.length - 1];
        const dupQty = intentionalDupRef?.current ? qty : last.qty;
        const unit = lineUnitPrice(last.price);
        const lastDiscAmt =
          last.discountType === "percent"
            ? Math.round((unit * last.discount) / 100)
            : Number(last.discount || 0);

        if (lastDiscAmt > unit) {
          onError?.("Discount exceeds item price!");
          return false;
        }

        const newItemBase = {
          id: generateLineItemId(),
          serialId: getNextItemSerial(),
          productName: last.productName,
          price: unit,
          qty: dupQty,
          discount: last.discount,
          discountType: last.discountType,
          isRemoved: false,
          addedAt: new Date().toISOString(),
        };

        updateTab((tab) => {
          const salespersonId = tab.salespersonId || null;
          const salespersonName = tab.salespersonName || null;
          const newItem = { ...newItemBase, salespersonId, salespersonName };
          return {
            ...tab,
            items: [...tab.items, newItem],
            lastItemId: newItem.id,
            activeBill: true,
          };
        });

        if (intentionalDupRef) intentionalDupRef.current = false;
        onSuccess?.({ type: "duplicate", price: unit, qty: dupQty });
        return true;
      }

      // ── Case B: Invalid price ──
      if (!priceValid) { onError?.("Valid price required"); return false; }
      if (qty <= 0) { onError?.("Valid quantity required"); return false; }
      if (showProductName && !(form.productName || "").trim()) {
        onError?.("Product name required");
        return false;
      }

      // ── Case C: Valid price → new row ──
      const rawDisc =
        form.discount !== "" && form.discount !== undefined
          ? Number(form.discount)
          : Number(lastEntry?.discount) || 0;
      const discType = form.discountType || lastEntry?.discountType || "percent";

      let discAmt;
      if (discType === "percent") {
        discAmt = Math.min(100, Math.max(0, rawDisc));
      } else {
        discAmt = Math.max(0, rawDisc);
        if (discAmt > price) {
          onError?.("Discount exceeds item price!");
          return false;
        }
      }

      // ✅ FIX: Use TOTAL items count (including removed) for unique naming
      // Old: activeItems.length + 1  → "Item 02" duplicates after remove
      // New: items.length + 1        → always unique
      const prodName = showProductName
        ? (form.productName || "").trim()
        : `Item ${fmtItemSerial(items.length + 1)}`;

      const newItemBase = {
        id: generateLineItemId(),
        serialId: getNextItemSerial(),
        productName: prodName,
        price,
        qty,
        discount: discAmt,
        discountType: discType,
        isRemoved: false,
        addedAt: new Date().toISOString(),
      };

      checkFraud("discount", {
        discount: discAmt, price, discountType: discType,
        userId: billerId, storeId,
      });

      updateTab((tab) => {
        const salespersonId = tab.salespersonId || null;
        const salespersonName = tab.salespersonName || null;
        const commissionPercent = tab.salespersonCommissionPercent ?? tab.salespersonCommission ?? undefined;
        const commissionType = tab.salespersonCommissionType || undefined;
        const newItem = { ...newItemBase, salespersonId, salespersonName, commissionPercent, commissionType };
        return {
          ...tab,
          items: [...tab.items, newItem],
          lastItemId: newItem.id,
          activeBill: true,
        };
      });

      if (intentionalDupRef) intentionalDupRef.current = false;
      onSuccess?.({ type: "new", price, qty, discAmt, discType });
      return true;
    },
    [
      screenLocked, items, activeItems, showProductName,
      updateTab, checkFraud, billerId, storeId,
      onSuccess, onError,
    ],
  );

  // ──────────────────────────────────────────────────────────
  // REMOVE ITEM (soft delete)
  // ──────────────────────────────────────────────────────────
  const removeItem = useCallback(
    (itemId) => {
      if (screenLocked) { onError?.("Screen is locked"); return; }
      updateTab((tab) => ({
        ...tab,
        items: tab.items.map((i) =>
          i.id === itemId ? { ...i, isRemoved: true } : i,
        ),
        selectedRowIndex: -1,
      }));
    },
    [screenLocked, updateTab, onError],
  );

  const removeLastItem = useCallback(() => {
    if (screenLocked) return;
    if (!activeItems.length) return;
    const lastItem = activeItems[activeItems.length - 1];
    removeItem(lastItem.id);
  }, [screenLocked, activeItems, removeItem]);

  const changeQty = useCallback(
    (itemId, value) => {
      if (screenLocked) return;
      const n = parseInt(String(value).replace(/\D/g, ""), 10);
      updateTab((tab) => ({
        ...tab,
        items: tab.items.map((i) =>
          i.id === itemId
            ? { ...i, qty: Math.max(1, n || 1), price: lineUnitPrice(i.price) }
            : i,
        ),
      }));
    },
    [screenLocked, updateTab],
  );

  const changeDiscount = useCallback(
    (itemId, value) => {
      if (screenLocked) return;
      updateTab((tab) => ({
        ...tab,
        items: tab.items.map((i) =>
          i.id === itemId
            ? { ...i, discount: Math.max(0, Number(value) || 0), price: lineUnitPrice(i.price) }
            : i,
        ),
      }));
    },
    [screenLocked, updateTab],
  );

  const changeDiscountType = useCallback(
    (itemId, type) => {
      if (screenLocked) return;
      updateTab((tab) => ({
        ...tab,
        items: tab.items.map((i) =>
          i.id === itemId
            ? { ...i, discountType: type, price: lineUnitPrice(i.price) }
            : i,
        ),
      }));
    },
    [screenLocked, updateTab],
  );

  const changePrice = useCallback(
    (itemId, value) => {
      if (screenLocked) return;
      const n = parseFloat(value) || 0;
      if (n <= 0) return;
      updateTab((tab) => ({
        ...tab,
        items: tab.items.map((i) =>
          i.id === itemId ? { ...i, price: n } : i,
        ),
      }));
    },
    [screenLocked, updateTab],
  );

  const navigateRow = useCallback(
    (direction, selectedRowIndex) => {
      const count = activeItems.length;
      if (!count) return -1;
      const cur = selectedRowIndex < 0 ? 0 : selectedRowIndex;
      if (direction === "up") return Math.max(0, cur - 1);
      if (direction === "down") return Math.min(count - 1, cur + 1);
      if (direction === "pageUp") return Math.max(0, cur - 5);
      if (direction === "pageDown") return Math.min(count - 1, cur + 5);
      return selectedRowIndex;
    },
    [activeItems],
  );

  const computeTotals = useCallback(
    (billDiscount = 0, billDiscountType = "fixed") => {
      const active = items.filter((i) => !i.isRemoved);
      const totalQty = active.reduce((s, i) => s + Number(i.qty || 0), 0);

      const totalDiscount = active.reduce((s, i) => {
        const u = Number(i.price || 0);
        const q = Number(i.qty || 0);
        const d = Number(i.discount || 0);
        return s + (i.discountType === "percent"
          ? Math.round((u * q * d) / 100)
          : d * q);
      }, 0);

      const subtotal = active.reduce((s, i) => {
        const u = Number(i.price || 0);
        const q = Number(i.qty || 0);
        const d = Number(i.discount || 0);
        const da = i.discountType === "percent"
          ? Math.round((u * d) / 100)
          : d;
        return s + (u - da) * q;
      }, 0);

      const billDiscAmt = billDiscountType === "percent"
        ? Math.round((subtotal * Math.min(100, Math.max(0, billDiscount))) / 100)
        : Math.max(0, Number(billDiscount || 0));

      const grandTotal = Math.max(0, subtotal - billDiscAmt);
      return { totalQty, totalDiscount, subtotal, billDiscAmt, grandTotal };
    },
    [items],
  );

  return {
    activeItems,
    addItem,
    removeItem,
    removeLastItem,
    changeQty,
    changeDiscount,
    changeDiscountType,
    changePrice,
    navigateRow,
    computeTotals,
  };
};

export default useBillerBill;