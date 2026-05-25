// File: src/services/holdBillService.js
// Purpose: Manage held bills in Dexie IndexedDB
// Features: Hold bill, restore bill, delete held, get count
// Offline: Yes
// Dependencies: ../db/index, uuid

import { db } from "../db/index";
import { v4 as uuidv4 } from 'uuid';

/**
 * Save current bill to held_bills table
 */
export const holdBill = async ({ billId, items, customer, billDiscount, billDiscountType, totalAmount, billerId, storeId, reason }) => {
  try {
    const holdId = uuidv4();
    await db.held_bills.add({
      holdId,
      billId,
      items,
      customer,
      billDiscount,
      billDiscountType,
      totalAmount,
      billerId,
      storeId,
      reason: reason || 'No reason provided',
      heldAt: new Date().toISOString()
    });
    return { success: true, holdId };
  } catch (err) {
    console.error("[holdBillService] holdBill failed:", err);
    return { success: false, error: err.message };
  }
};

/**
 * Get all held bills for a specific biller and store
 */
export const getHeldBills = async (billerId, storeId) => {
  try {
    return await db.held_bills
      .where({ billerId, storeId })
      .reverse()
      .sortBy('heldAt');
  } catch (err) {
    console.error("[holdBillService] getHeldBills failed:", err);
    return [];
  }
};

/**
 * Restore a held bill by its ID
 */
export const restoreHeldBill = async (id) => {
  try {
    const bill = await db.held_bills.get(id);
    if (bill) {
      // After restoring, we typically delete it from held list
      await db.held_bills.delete(id);
      return { success: true, data: bill };
    }
    return { success: false, error: "Bill not found" };
  } catch (err) {
    console.error("[holdBillService] restoreHeldBill failed:", err);
    return { success: false, error: err.message };
  }
};

/**
 * Delete a held bill without restoring
 */
export const deleteHeldBill = async (id) => {
  try {
    await db.held_bills.delete(id);
    return { success: true };
  } catch (err) {
    console.error("[holdBillService] deleteHeldBill failed:", err);
    return { success: false, error: err.message };
  }
};

/**
 * Get count of held bills
 */
export const getHeldBillsCount = async (billerId, storeId) => {
  try {
    return await db.held_bills
      .where({ billerId, storeId })
      .count();
  } catch (err) {
    console.error("[holdBillService] getHeldBillsCount failed:", err);
    return 0;
  }
};

export default {
  holdBill,
  getHeldBills,
  restoreHeldBill,
  deleteHeldBill,
  getHeldBillsCount
};