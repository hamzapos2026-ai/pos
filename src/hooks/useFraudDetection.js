// src/hooks/useFraudDetection.js
// ✅ FIXED v2
// ✅ FIX-1: Firebase logging on high-severity alerts
// ✅ FIX-2: shouldBlock returned for high severity
// ✅ FIX-3: Threshold configurable via storeId/settings
// ✅ FIX-4: Multiple delete detection added
// ✅ Both named + default export

import { useCallback, useRef } from "react";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "../services/firebase";

export const useFraudDetection = ({
  maxDiscountPct = 50,
  maxFixedDiscount = 10000,
  maxQty = 100,
  maxOverpayMult = 2,
  storeId,
  billerId,
} = {}) => {

  // Track delete count per session (multiple deletes = suspicious)
  const deleteCountRef = useRef(0);
  const deleteTimerRef = useRef(null);

  // ── Log to Firebase (non-blocking) ───────────────────────
  const _logAlert = useCallback(
    async (alertType, details, severity) => {
      if (severity !== "high" && severity !== "critical") return;
      try {
        await addDoc(collection(db, "fraudAlerts"), {
          alertType,
          details,
          severity,
          billerId: billerId || null,
          storeId: storeId || "default",
          flaggedAt: serverTimestamp(),
          resolved: false,
        });
      } catch (_err) {
        // Non-critical — audit trail failure should not break billing
        console.warn("[useFraudDetection] Firebase log failed:", _err?.message);
      }
    },
    [billerId, storeId],
  );

  // ──────────────────────────────────────────────────────────
  // CHECK FRAUD
  // ──────────────────────────────────────────────────────────
  const checkFraud = useCallback(
    (type, data = {}) => {
      try {
        switch (type) {

          case "discount": {
            const {
              discount = 0,
              price = 0,
              discountType = "fixed",
              userId,
            } = data;

            const disc = Number(discount) || 0;
            const prc = Number(price) || 0;

            // ✅ FIX-1: percent > maxDiscountPct → high severity → Firebase log
            if (discountType === "percent" && disc > maxDiscountPct) {
              const result = {
                flagged: true,
                reason: "high_discount_percent",
                severity: disc > 80 ? "critical" : "high",
                shouldBlock: disc > 90,
              };
              console.warn(
                `[FRAUD] High % discount: ${disc}% by ${userId || billerId}`,
              );
              _logAlert("high_discount_percent", data, result.severity);
              return result;
            }

            // Fixed discount > maxFixedDiscount → medium severity
            if (discountType === "fixed" && disc > maxFixedDiscount) {
              const result = {
                flagged: true,
                reason: "high_discount_fixed",
                severity: "high",
                // ✅ FIX-2: shouldBlock on high severity
                shouldBlock: disc > maxFixedDiscount * 2,
              };
              console.warn(
                `[FRAUD] Large fixed discount: Rs.${disc} by ${userId || billerId}`,
              );
              _logAlert("high_discount_fixed", data, result.severity);
              return result;
            }

            // Fixed discount > item price → always block
            if (discountType === "fixed" && prc > 0 && disc > prc) {
              return {
                flagged: true,
                reason: "discount_exceeds_price",
                severity: "high",
                shouldBlock: true,
              };
            }

            return { flagged: false, shouldBlock: false };
          }

          case "quantity": {
            const { qty = 0 } = data;
            const q = Number(qty) || 0;

            if (q > maxQty) {
              return {
                flagged: true,
                reason: "unusual_quantity",
                severity: q > maxQty * 2 ? "high" : "low",
                shouldBlock: false,
              };
            }
            return { flagged: false, shouldBlock: false };
          }

          case "payment": {
            const { amount = 0, total = 0 } = data;
            const a = Number(amount) || 0;
            const t = Number(total) || 0;

            if (t > 0 && a > t * maxOverpayMult) {
              return {
                flagged: true,
                reason: "overpayment",
                severity: "medium",
                shouldBlock: false,
              };
            }
            return { flagged: false, shouldBlock: false };
          }

          // ✅ FIX-4: Multiple deletes detection
          case "delete": {
            deleteCountRef.current += 1;
            clearTimeout(deleteTimerRef.current);
            deleteTimerRef.current = setTimeout(() => {
              deleteCountRef.current = 0;
            }, 60_000); // reset after 1 min

            if (deleteCountRef.current > 5) {
              const result = {
                flagged: true,
                reason: "multiple_deletes",
                severity: deleteCountRef.current > 10 ? "high" : "medium",
                shouldBlock: false,
              };
              if (result.severity === "high") {
                _logAlert("multiple_deletes", data, result.severity);
              }
              return result;
            }
            return { flagged: false, shouldBlock: false };
          }

          default:
            return { flagged: false, reason: "unknown_type", shouldBlock: false };
        }
      } catch (err) {
        console.error("[useFraudDetection] checkFraud error:", err);
        return { flagged: false, error: err.message, shouldBlock: false };
      }
    },
    [
      maxDiscountPct, maxFixedDiscount, maxQty,
      maxOverpayMult, billerId, _logAlert,
    ],
  );

  return { checkFraud };
};

export default useFraudDetection;