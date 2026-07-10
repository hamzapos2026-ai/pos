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
    const rows = await db.held_bills
      .where('billerId')
      .equals(billerId)
      .filter((row) => row.storeId === storeId)
      .toArray();
    return rows.sort((a, b) => String(b.heldAt || '').localeCompare(String(a.heldAt || '')));
  } catch (err) {
    console.error("[holdBillService] getHeldBills failed:", err);
    return [];
  }
};

/**
 * Restore a held bill by holdId (UUID) or Dexie auto id
 */
export const restoreHeldBill = async (idOrHoldId) => {
  try {
    let bill = await db.held_bills.where('holdId').equals(idOrHoldId).first();
    if (!bill) {
      const numericId = Number(idOrHoldId);
      if (Number.isFinite(numericId)) bill = await db.held_bills.get(numericId);
    }
    if (bill) {
      if (bill.id != null) await db.held_bills.delete(bill.id);
      else if (bill.holdId) await db.held_bills.where('holdId').equals(bill.holdId).delete();
      return { success: true, data: bill };
    }
    return { success: false, error: "Bill not found" };
  } catch (err) {
    console.error("[holdBillService] restoreHeldBill failed:", err);
    return { success: false, error: err.message };
  }
};

/**
 * Delete a held bill without restoring (holdId or Dexie id)
 */
export const deleteHeldBill = async (idOrHoldId) => {
  try {
    const bill = await db.held_bills.where('holdId').equals(idOrHoldId).first()
      || (Number.isFinite(Number(idOrHoldId)) ? await db.held_bills.get(Number(idOrHoldId)) : null);
    if (bill?.id != null) await db.held_bills.delete(bill.id);
    else if (bill?.holdId) await db.held_bills.where('holdId').equals(bill.holdId).delete();
    else return { success: false, error: "Bill not found" };
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