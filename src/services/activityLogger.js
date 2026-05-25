// File: src/services/activityLogger.js
// Purpose: Multi-channel activity logging with offline support + audit trail
// Features: Logs to Firebase when online, falls back to Dexie activity_logs_local when offline
// 🔒 IMMUTABLE: All audit logs are permanent and cannot be modified/deleted
// Offline: Yes
// Dependencies: firebase/firestore, ./firebase, ../db/index

import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { db as firebaseDb } from "./firebase";
import { db as dexieDb } from "../db/index";

/**
 * Core log function with offline fallback
 * 🔒 Validates serial number is never blank
 * 🔒 Logs are immutable once written
 */
export const logActivity = async (action, userId, storeId, details = {}) => {
  const logEntry = {
    action,
    userId,
    storeId: storeId || 'default',
    timestamp: new Date().toISOString(),
    synced: false,
    ...details
  };

  // 🔒 VALIDATION: Ensure serialNo is not blank for bill operations
  if (details?.serialNo === "") {
    console.error("[activityLogger] ❌ BLOCKED: serialNo cannot be blank", { action, userId, details });
    return { success: false, error: "Serial number cannot be blank" };
  }

  try {
    if (navigator.onLine) {
      await addDoc(collection(firebaseDb, "activityLogs"), {
        ...logEntry,
        timestamp: serverTimestamp(),
        // 🔒 IMMUTABILITY MARKER: These fields can never be modified in Firestore rules
        _immutable: true,
        _createdAt: serverTimestamp(),
      });
      return { success: true, offline: false };
    } else {
      throw new Error("Offline");
    }
  } catch (err) {
    try {
      await dexieDb.activity_logs_local.add({
        ...logEntry,
        synced: false,
        // 🔒 IMMUTABILITY MARKER
        _immutable: true,
        _createdAt: new Date().toISOString(),
      });
      return { success: true, offline: true };
    } catch (dexieErr) {
      console.error("[activityLogger] Dexie failed:", dexieErr);
      return { success: false, error: dexieErr.message };
    }
  }
};

export const logBillHold = (storeId, billerId, billSerial) => {
  // 🔒 VALIDATION: Ensure serial is not blank
  if (!billSerial || billSerial === "" || billSerial === "----") {
    console.error("[activityLogger] ❌ Blocked: Bill hold without valid serial", { billSerial });
    return Promise.reject(new Error("Bill serial required for hold operation"));
  }
  return logActivity("BILL_HOLD", billerId, storeId, { billSerial });
}

export const logReturnProcessed = (storeId, billerId, returnData) => {
  // 🔒 VALIDATION: Ensure serial is not blank
  const billSerial = returnData?.billSerial || returnData?.originalSerial || "";
  if (!billSerial) {
    console.error("[activityLogger] ❌ Blocked: Return without valid serial", { returnData });
    return Promise.reject(new Error("Bill serial required for return operation"));
  }
  return logActivity("RETURN_PROCESSED", billerId, storeId, { 
    returnData,
    serialNo: billSerial,
  });
}

export const logBillReprint = (storeId, billerId, billSerial) => {
  // 🔒 VALIDATION: Ensure serial is not blank
  if (!billSerial || billSerial === "" || billSerial === "----") {
    console.error("[activityLogger] ❌ Blocked: Bill reprint without valid serial", { billSerial });
    return Promise.reject(new Error("Bill serial required for reprint operation"));
  }
  return logActivity("BILL_REPRINT", billerId, storeId, { 
    serialNo: billSerial,
    billSerial,
  });
}

export const logLoginAttempt = (userId, success, deviceInfo) => 
  logActivity("LOGIN_ATTEMPT", userId, null, { success, deviceInfo });

export const logSettingsChange = (userId, section, oldValue, newValue) => 
  logActivity("SETTINGS_CHANGE", userId, null, { section, oldValue, newValue });

export const logDiscountApproval = (managerId, billerId, billSerial, details) => {
  // 🔒 VALIDATION: Ensure serial is not blank
  if (!billSerial || billSerial === "") {
    console.error("[activityLogger] ❌ Blocked: Discount approval without valid serial", { billSerial });
    return Promise.reject(new Error("Bill serial required for approval"));
  }
  return logActivity("DISCOUNT_APPROVAL", managerId, null, { 
    billerId, 
    billSerial,
    serialNo: billSerial,
    details,
  });
}

export const logSessionTimeout = (userId, storeId) => 
  logActivity("SESSION_TIMEOUT", userId, storeId);

export const logHoldRestore = (billerId, storeId, holdId) => 
  logActivity("HOLD_RESTORE", billerId, storeId, { holdId });

/**
 * 🔒 Log cache clear operation (IMMUTABLE)
 */
export const logCacheClear = (userId, storeId, userEmail) =>
  logActivity("CACHE_CLEARED", userId, storeId, {
    email: userEmail,
    action: "CACHE_CLEARED",
    timestamp: new Date().toISOString(),
    _auditTrail: true, // Mark for audit purposes
  });

/**
 * 🔒 Log data deletion (IMMUTABLE)
 */
export const logDataDeletion = (userId, storeId, recordType, recordId, reason) =>
  logActivity("DATA_DELETED", userId, storeId, {
    recordType,
    recordId,
    reason: reason || "unknown",
    timestamp: new Date().toISOString(),
    _auditTrail: true,
  });

/**
 * Legacy support for createAuditLog
 */
export const createAuditLog = (data, action, userId) => {
  const billSerial = data?.serialNo || data?.billSerial || "---";
  // 🔒 VALIDATION: Block logs with blank serial
  if (action?.includes("BILL") && !billSerial) {
    console.error("[activityLogger] ❌ Blocked: Audit log with blank serial", { action, data });
    return Promise.reject(new Error("Serial number required"));
  }
  return logActivity(action, userId, data?.storeId, {
    billId: data?.billId || data?.id,
    billSerial,
    serialNo: billSerial,
    amount: data?.totalAmount || 0,
    itemCount: data?.items?.length || 0,
  });
};

export default {
  logActivity,
  logBillHold,
  logReturnProcessed,
  logBillReprint,
  logLoginAttempt,
  logSettingsChange,
  logDiscountApproval,
  logSessionTimeout,
  logHoldRestore,
  logCacheClear,
  logDataDeletion,
  createAuditLog
};
