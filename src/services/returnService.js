// File: src/services/returnService.js
// Purpose: Manage bill returns and refunds
// Features: Process return, search bill for return, return history
// Offline: Yes
// Dependencies: ../db/index, firebase/firestore, ./firebase, ./activityLogger

import { db as dexieDb } from "../db/index";
import { collection, addDoc, serverTimestamp, query, where, getDocs } from "firebase/firestore";
import { db as firebaseDb } from "./firebase";
import { logReturnProcessed } from "./activityLogger";
import { v4 as uuidv4 } from 'uuid';

/**
 * Process a return/refund
 * @param {Object} params - Return parameters
 * @param {string} params.originalBillId - Original bill ID
 * @param {Array} params.returnItems - Items being returned
 * @param {number} params.refundAmount - Refund amount
 * @param {string} params.reason - Reason for return
 * @param {string} params.billerId - Biller ID
 * @param {string} params.storeId - Store ID
 * @param {Object} params.customer - Customer info
 * @returns {Promise<{success: boolean, returnId?: string, error?: string}>}
 */
export const processReturn = async ({ originalBillId, returnItems, refundAmount, reason, billerId, storeId, customer }) => {
  try {
    const returnId = uuidv4();
    const processedAt = new Date().toISOString();
    
    const returnData = {
      returnId,
      originalBillId,
      returnItems,
      refundAmount,
      reason,
      billerId,
      storeId,
      customer,
      processedAt,
      status: 'completed',
      synced: false
    };

    // 1. Save to Dexie
    await dexieDb.returns.add(returnData);

    // 2. Log activity
    await logReturnProcessed(storeId, billerId, { returnId, originalBillId, refundAmount });

    // 3. Try Firebase if online
    if (navigator.onLine) {
      await addDoc(collection(firebaseDb, "returns"), {
        ...returnData,
        processedAt: serverTimestamp()
      });
      // Mark as synced in Dexie (optional, depending on sync strategy)
    }

    void import('./customerPersonaService').then(({ applyReturnTransaction }) =>
      applyReturnTransaction({
        customer,
        storeId,
        branchId: storeId,
        refundAmount,
        userId: billerId,
      }),
    );

    return { success: true, returnId };
  } catch (err) {
    console.error("[returnService] processReturn failed:", err);
    return { success: false, error: err.message };
  }
};

/**
 * Search for a bill to return (IDB first, then Firebase)
 * @param {string} serial - Bill serial number
 * @param {string} storeId - Store ID
 * @returns {Promise<{success: boolean, data?: Object, error?: string}>}
 */
export const searchBillForReturn = async (serial, storeId) => {
  try {
    // Check local bills first (using pos_bills_v2 since it stores completed bills)
    const { getBillBySerial } = await import('./localBillService');
    const bill = await getBillBySerial(serial, storeId);
    if (bill) {
      return { success: true, data: bill };
    }
    return { success: false, error: 'Bill not found' };
  } catch (err) {
    console.error("[returnService] searchBillForReturn failed:", err);
    return { success: false, error: err.message };
  }
};

/**
 * Get returns for a specific bill
 * @param {string} billId - Original bill ID
 * @returns {Promise<{success: boolean, data?: Array, error?: string}>}
 */
export const getReturnsByBill = async (billId) => {
  try {
    const returns = await dexieDb.returns
      .where('originalBillId').equals(billId)
      .toArray();
    return { success: true, data: returns };
  } catch (err) {
    console.error("[returnService] getReturnsByBill failed:", err);
    return { success: false, error: err.message };
  }
};

/**
 * Get return history for a store
 * @param {string} storeId - Store ID
 * @param {Object} dateRange - Date range {startDate, endDate}
 * @param {number} limit - Max results
 * @returns {Promise<{success: boolean, data?: Array, error?: string}>}
 */
export const getReturnHistory = async (storeId, dateRange = null, limit = 50) => {
  try {
    let query = dexieDb.returns.where('storeId').equals(storeId);
    if (dateRange && dateRange.startDate && dateRange.endDate) {
      query = query.and(item => item.processedAt >= dateRange.startDate && item.processedAt <= dateRange.endDate);
    }
    const returns = await query.reverse().limit(limit).toArray();
    return { success: true, data: returns };
  } catch (err) {
    console.error("[returnService] getReturnHistory failed:", err);
    return { success: false, error: err.message };
  }
};

export default {
  processReturn,
  searchBillForReturn,
  getReturnsByBill,
  getReturnHistory
};