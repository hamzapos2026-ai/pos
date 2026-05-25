// File: src/services/shiftService.js
// Purpose: Manage shifts and cash transactions
// Features: Open/close shift, cash in/out, shift summary
// Offline: Yes
// Dependencies: firebase/firestore, ./firebase, ../db/index

import { collection, addDoc, getDocs, query, where, doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "./firebase";
import { db as dexieDb } from "../db/index";
import { v4 as uuidv4 } from "uuid";

/**
 * Open a new shift
 */
export const openShift = async ({ managerId, storeId, openingBalance, notes }) => {
  try {
    const shiftId = uuidv4();
    const shiftData = {
      shiftId,
      managerId,
      storeId,
      status: "open",
      openedAt: new Date().toISOString(),
      openingBalance: Number(openingBalance) || 0,
      notes: notes || "",
      synced: !navigator.onLine,
    };

    // Save to Dexie
    await dexieDb.shifts.add(shiftData);

    // Save to Firebase if online
    if (navigator.onLine) {
      await addDoc(collection(db, "shifts"), {
        ...shiftData,
        openedAt: serverTimestamp(),
      });
    }

    return { success: true, shiftId };
  } catch (err) {
    console.error("[shiftService] openShift:", err);
    return { success: false, error: err.message };
  }
};

/**
 * Close a shift
 */
export const closeShift = async (shiftId, { closingBalance, notes }) => {
  try {
    const shift = await dexieDb.shifts.get(shiftId);
    if (!shift) return { success: false, error: "Shift not found" };

    const updated = {
      ...shift,
      status: "closed",
      closedAt: new Date().toISOString(),
      closingBalance: Number(closingBalance) || 0,
      notes: notes || shift.notes,
    };

    await dexieDb.shifts.put(updated);

    if (navigator.onLine) {
      await updateDoc(doc(db, "shifts", shift.firebaseId || shiftId), {
        status: "closed",
        closedAt: serverTimestamp(),
        closingBalance: Number(closingBalance) || 0,
      });
    }

    return { success: true };
  } catch (err) {
    console.error("[shiftService] closeShift:", err);
    return { success: false, error: err.message };
  }
};

/**
 * Get current open shift
 */
export const getCurrentShift = async (managerId, storeId) => {
  try {
    return await dexieDb.shifts
      .where({ managerId, storeId, status: "open" })
      .first();
  } catch (err) {
    console.error("[shiftService] getCurrentShift:", err);
    return null;
  }
};

/**
 * Get shift history
 */
export const getShiftHistory = async (storeId, limitCount = 20) => {
  try {
    return await dexieDb.shifts
      .where({ storeId })
      .reverse()
      .sortBy("openedAt")
      .then((shifts) => shifts.slice(0, limitCount));
  } catch (err) {
    console.error("[shiftService] getShiftHistory:", err);
    return [];
  }
};

/**
 * Add cash in to shift
 */
export const addCashIn = async (shiftId, amount, reason, category = "general") => {
  try {
    const txId = uuidv4();
    const shift = await dexieDb.shifts.get(shiftId);
    const txData = {
      txId,
      shiftId,
      storeId: shift?.storeId || null,
      type: "in",
      amount: Number(amount),
      reason,
      category,
      createdAt: new Date().toISOString(),
      synced: !navigator.onLine,
    };

    await dexieDb.cash_transactions.add(txData);
    return { success: true, txId };
  } catch (err) {
    console.error("[shiftService] addCashIn:", err);
    return { success: false, error: err.message };
  }
};

/**
 * Add cash out from shift
 */
export const addCashOut = async (shiftId, amount, reason, approvedBy = null) => {
  try {
    const txId = uuidv4();
    const shift = await dexieDb.shifts.get(shiftId);
    const txData = {
      txId,
      shiftId,
      storeId: shift?.storeId || null,
      type: "out",
      amount: Number(amount),
      reason,
      approvedBy: approvedBy || null,
      createdAt: new Date().toISOString(),
      synced: !navigator.onLine,
    };

    await dexieDb.cash_transactions.add(txData);
    return { success: true, txId };
  } catch (err) {
    console.error("[shiftService] addCashOut:", err);
    return { success: false, error: err.message };
  }
};

/**
 * Get shift summary with expected closing
 */
export const getShiftSummary = async (shiftId) => {
  try {
    const shift = await dexieDb.shifts.get(shiftId);
    if (!shift) return { success: false, error: "Shift not found" };

    const transactions = await dexieDb.cash_transactions
      .where({ shiftId })
      .toArray();

    const totalIn = transactions
      .filter((t) => t.type === "in")
      .reduce((sum, t) => sum + t.amount, 0);

    const totalOut = transactions
      .filter((t) => t.type === "out")
      .reduce((sum, t) => sum + t.amount, 0);

    return {
      success: true,
      data: {
        openingBalance: shift.openingBalance,
        totalIn,
        totalOut,
        salesTotal: 0, // Would need to calculate from orders
        expectedClosing: shift.openingBalance + totalIn - totalOut,
      },
    };
  } catch (err) {
    console.error("[shiftService] getShiftSummary:", err);
    return { success: false, error: err.message };
  }
};

export default {
  openShift,
  closeShift,
  getCurrentShift,
  getShiftHistory,
  addCashIn,
  addCashOut,
  getShiftSummary,
};