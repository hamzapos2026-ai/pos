// File: src/hooks/useReprintBill.js
// Purpose: Find and reprint bills from IndexedDB
// Features: reprintLast, reprintBySerial, show/hide dialog
// Offline: Yes
// Dependencies: react, ../services/localBillService

import { useState, useCallback } from "react";
import { getBillBySerial, getLastCompletedBill } from "../services/localBillService";

/**
 * Hook for finding and reprinting bills
 */
export const useReprintBill = ({ storeId, billerId } = {}) => {
  const [reprintOrder, setReprintOrder] = useState(null);
  const [showReprint, setShowReprint] = useState(false);

  /**
   * Reprint the last completed bill for this biller
   */
  const reprintLast = useCallback(async () => {
    try {
      const bill = await getLastCompletedBill(billerId, storeId);
      if (bill) {
        setReprintOrder(bill);
        setShowReprint(true);
        return { success: true, bill };
      }
      return { success: false, error: "No previous bill found" };
    } catch (err) {
      console.error("[useReprintBill] reprintLast:", err);
      return { success: false, error: err.message };
    }
  }, [billerId, storeId]);

  /**
   * Reprint bill by serial number
   */
  const reprintBySerial = useCallback(async (serial) => {
    if (!serial) return { success: false, error: "Serial required" };

    try {
      const bill = await getBillBySerial(serial, storeId);
      if (bill) {
        setReprintOrder(bill);
        setShowReprint(true);
        return { success: true, bill };
      }
      return { success: false, error: "Bill not found" };
    } catch (err) {
      console.error("[useReprintBill] reprintBySerial:", err);
      return { success: false, error: err.message };
    }
  }, [storeId]);

  /**
   * Close reprint dialog
   */
  const closeReprint = useCallback(() => {
    setShowReprint(false);
    setReprintOrder(null);
  }, []);

  return {
    reprintOrder,
    showReprint,
    reprintLast,
    reprintBySerial,
    closeReprint,
  };
};

export default useReprintBill;