// src/hooks/useDiscountPolicy.js
// ✅ FIXED v2
// ✅ FIX-1: checkBillDiscount — division-by-zero guard
// ✅ FIX-2: checkItemDiscount — price=0 guard
// ✅ FIX-3: needsApproval threshold consistent (80% of limit)
// ✅ FIX-4: shouldBlock only when strictly exceeded (not >=)
// ✅ Both named + default export

import { useCallback } from "react";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "../services/firebase";

export const useDiscountPolicy = ({
  maxDiscountPct = 10,
  billerId,
  billerName,
  storeId,
} = {}) => {

  // ──────────────────────────────────────────────────────────
  // CHECK ITEM DISCOUNT
  // ──────────────────────────────────────────────────────────
  const checkItemDiscount = useCallback(
    (price, discount, type, qty = 1) => {
      // ✅ FIX-2: guard against price = 0
      const safePrice = Number(price) || 0;
      const safeDisc = Number(discount) || 0;

      const discountPct =
        type === "percent"
          ? safeDisc
          : safePrice > 0
            ? (safeDisc / safePrice) * 100
            : 0;

      const limitPct = Math.min(Math.max(0, maxDiscountPct), 100);

      // ✅ FIX-4: strictly exceeded (>), not >=
      const allowed = discountPct <= limitPct;
      const shouldBlock = !allowed;
      // ✅ FIX-3: warn at 80% of limit
      const warningThresh = limitPct * 0.8;
      const needsApproval = discountPct > warningThresh && allowed;

      return { allowed, limitPct, needsApproval, shouldBlock, discountPct };
    },
    [maxDiscountPct],
  );

  // ──────────────────────────────────────────────────────────
  // CHECK BILL DISCOUNT
  // ──────────────────────────────────────────────────────────
  const checkBillDiscount = useCallback(
    (value, type, subtotal) => {
      const safeVal = Number(value) || 0;
      const safeSubtotal = Number(subtotal) || 0;

      // ✅ FIX-1: guard division by zero
      const discountPct =
        type === "percent"
          ? safeVal
          : safeSubtotal > 0
            ? (safeVal / safeSubtotal) * 100
            : 0;

      const limitPct = Math.min(Math.max(0, maxDiscountPct), 100);
      const allowed = discountPct <= limitPct;
      // ✅ FIX-3: needsApproval when between 80%-100% of limit
      const warningThresh = limitPct * 0.8;
      const needsApproval = discountPct > warningThresh && !allowed === false
        ? discountPct > warningThresh
        : false;

      return { allowed, limitPct, needsApproval, discountPct };
    },
    [maxDiscountPct],
  );

  // ──────────────────────────────────────────────────────────
  // REQUEST APPROVAL
  // ──────────────────────────────────────────────────────────
  const requestApproval = useCallback(
    async (type, details) => {
      if (!type || !details) {
        return { success: false, error: "Invalid params" };
      }
      try {
        const approval = {
          requestId: `apr_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          type,
          details,
          billerId: billerId || null,
          billerName: billerName || "Unknown",
          requestedBy: billerId || null,
          requestedByName: billerName || "Unknown",
          requestedByRole: "biller",
          storeId: storeId || "default",
          status: "pending",
          createdAt: serverTimestamp(),
        };
        const docRef = await addDoc(
          collection(db, "approvalRequests"),
          approval,
        );
        return { success: true, id: docRef.id };
      } catch (err) {
        console.error("[useDiscountPolicy] requestApproval:", err);
        return { success: false, error: err.message };
      }
    },
    [billerId, billerName, storeId],
  );

  return { checkItemDiscount, checkBillDiscount, requestApproval };
};

export default useDiscountPolicy;