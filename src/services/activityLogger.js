// File: src/services/activityLogger.js
// Purpose: Multi-channel activity logging with offline support + audit trail
// Features: Logs to Firebase when online, falls back to Dexie activity_logs_local when offline
// 🔒 IMMUTABLE: All audit logs are permanent and cannot be modified/deleted
// Offline: Yes
// Dependencies: firebase/firestore, ./firebase, ../db/index

import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { db as firebaseDb, auth } from "./firebase";
import { db as dexieDb } from "../db/index";
import { getActivityContext } from "../utils/activityContext";

/** Supports logActivity(action, userId, storeId, details) and logActivity(action, detailsObject) */
const resolveLogArgs = (action, userIdOrDetails, storeIdOrDetails, detailsArg) => {
  if (
    userIdOrDetails &&
    typeof userIdOrDetails === 'object' &&
    !Array.isArray(userIdOrDetails)
  ) {
    const details = { ...userIdOrDetails };
    const userId =
      details.userId ||
      details.billerId ||
      details.cashierId ||
      details.managerId ||
      details.collectedBy ||
      details.requestedBy ||
      details.by ||
      auth?.currentUser?.uid ||
      'unknown';
    const storeId =
      details.storeId ||
      details.branchId ||
      details.primaryStore ||
      'default';
    return { action, userId, storeId, details };
  }
  return {
    action,
    userId: userIdOrDetails || auth?.currentUser?.uid || 'unknown',
    storeId: storeIdOrDetails || 'default',
    details: detailsArg || {},
  };
};

/**
 * Core log function with offline fallback
 * 🔒 Validates serial number is never blank
 * 🔒 Logs are immutable once written
 */
export const logActivity = async (action, userIdOrDetails, storeIdOrDetails, detailsArg) => {
  const { action: act, userId, storeId, details } = resolveLogArgs(
    action,
    userIdOrDetails,
    storeIdOrDetails,
    detailsArg,
  );

  // Device + location + network context — attached to EVERY log (online & offline)
  const ctx = getActivityContext();

  const logEntry = {
    action: act,
    userId,
    userName: details.userName || details.cashierName || details.billerName || '',
    storeId: storeId || 'default',
    timestamp: new Date().toISOString(),
    synced: true,
    // ── Context (only fill when caller didn't already provide) ──
    deviceId: details.deviceId || ctx.deviceId,
    deviceName: details.deviceName || ctx.deviceName,
    deviceInfo: details.deviceInfo || ctx.deviceInfo,
    deviceOS: ctx.deviceOS,
    deviceBrowser: ctx.deviceBrowser,
    userAgent: details.userAgent || ctx.userAgent,
    platform: ctx.platform,
    screenSize: ctx.screenSize,
    language: ctx.language,
    timezone: ctx.timezone,
    geo: details.geo || ctx.geo,
    geoAccuracy: ctx.geoAccuracy,
    capturedOnline: ctx.online,
    networkTag: ctx.networkTag,
    localDate: ctx.localDate,
    localTime: ctx.localTime,
    ...details,
  };

  // 🔒 VALIDATION: Ensure serialNo is not blank for bill operations
  if (details?.serialNo === "") {
    console.error("[activityLogger] ❌ BLOCKED: serialNo cannot be blank", { action: act, userId, details });
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
        // 🏷️ OFFLINE TAGS — so the dashboard clearly marks these records
        offlineCaptured: true,
        capturedOnline: false,
        networkTag: 'offline',
        source: 'offline',
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
  logActivity("BILL_HOLD_RESTORE", billerId, storeId, { holdId });

// ═══════════════════════════════════════════════════════════════
// COMPREHENSIVE BILL OPERATIONS LOGGING
// ═══════════════════════════════════════════════════════════════

export const logBillPaid = (userId, storeId, userName, billerName, billSerial, amount, paymentType) => {
  return logActivity("BILL_PAID", userId, storeId, {
    userName,
    billerName,
    billSerial,
    serialNo: billSerial,
    amount,
    paymentType,
    role: 'cashier'
  });
};

export const logBillCancelled = (userId, storeId, userName, billerName, billSerial, amount, reason) => {
  return logActivity("BILL_CANCELLED", userId, storeId, {
    userName,
    billerName,
    billSerial,
    serialNo: billSerial,
    amount,
    reason,
    role: 'cashier'
  });
};

export const logBillCleared = (userId, storeId, userName, billSerial, amount, items, reason) => {
  return logActivity("BILL_CLEARED", userId, storeId, {
    userName,
    billSerial,
    serialNo: billSerial,
    amount,
    itemsCount: items?.length || 0,
    reason,
    role: 'cashier'
  });
};

export const logBillDeleted = (userId, storeId, userName, billerName, billSerial, amount, reason) => {
  return logActivity("BILL_DELETED", userId, storeId, {
    userName,
    billerName,
    billSerial,
    serialNo: billSerial,
    amount,
    reason,
    role: 'cashier'
  });
};

export const logBillCreated = (userId, storeId, userName, billerName, billSerial, amount, itemsCount) => {
  return logActivity("BILL_CREATED", userId, storeId, {
    userName,
    billerName,
    billSerial,
    serialNo: billSerial,
    amount,
    itemsCount,
    role: 'biller'
  });
};

export const logItemAdded = (userId, storeId, userName, billSerial, productName, qty, price) => {
  return logActivity("ITEM_ADDED", userId, storeId, {
    userName,
    billSerial,
    serialNo: billSerial,
    productName,
    qty,
    price,
    role: 'biller'
  });
};

export const logUserLogin = (userId, storeId, userName, role, deviceInfo) => {
  return logActivity("USER_LOGIN", userId, storeId, {
    userName,
    role,
    deviceInfo,
    loginTime: new Date().toISOString()
  });
};

export const logUserLogout = (userId, storeId, userName, role, sessionDuration) => {
  return logActivity("USER_LOGOUT", userId, storeId, {
    userName,
    role,
    sessionDuration,
    logoutTime: new Date().toISOString()
  });
};

export const logDiscountApplied = (userId, storeId, userName, billSerial, discountAmount, discountType) => {
  return logActivity("DISCOUNT_APPLIED", userId, storeId, {
    userName,
    billSerial,
    serialNo: billSerial,
    discountAmount,
    discountType,
    role: 'biller'
  });
};

export const logBillReturned = (userId, storeId, userName, originalBillSerial, newBillSerial, returnAmount, reason) => {
  return logActivity("BILL_RETURNED", userId, storeId, {
    userName,
    originalBillSerial,
    newBillSerial,
    serialNo: newBillSerial,
    returnAmount,
    reason,
    role: 'cashier'
  });
};

export const logManagerApproval = (userId, storeId, userName, billSerial, approvalType, reason) => {
  return logActivity("MANAGER_APPROVAL", userId, storeId, {
    userName,
    billSerial,
    serialNo: billSerial,
    approvalType,
    reason,
    role: 'manager'
  });
};

const isSuperAdminRole = (role) => {
  const r = String(role || '').toLowerCase();
  return r === 'superadmin' || r === 'super_admin' || r === 'admin';
};

const normalizeSettleRole = (role) => (isSuperAdminRole(role) ? 'superAdmin' : 'manager');

/** Manager / Super Admin bill settlement — writes to activityLogs for audit dashboard */
export const logBillSettled = (actor, bill, { confirmCashier = false } = {}) => {
  const userId = actor?.userId || actor?.uid || '';
  const userName = actor?.userName || actor?.name || 'Unknown';
  const role = normalizeSettleRole(actor?.role);
  const storeId = bill?.storeId || bill?.branchId || actor?.storeId || actor?.primaryStore || 'default';
  const billSerial = bill?.billSerial || bill?.serialNo || bill?.serial || '';
  const amount = Number(bill?.grandTotal || bill?.totalAmount || bill?.total || actor?.amount || 0);
  const paymentType = bill?.paymentType || bill?.paymentMethod || 'Cash';
  const action = confirmCashier
    ? 'MANAGER_PAYMENT_CONFIRMED'
    : (isSuperAdminRole(actor?.role) ? 'SUPER_ADMIN_PAYMENT' : 'MANAGER_PAYMENT');

  return logActivity(action, userId, storeId, {
    userName,
    role,
    billSerial,
    serialNo: billSerial,
    amount,
    paymentType,
    billId: bill?.id || bill?.localId || '',
    billerName: bill?.billerName || '',
    settleType: confirmCashier ? 'confirm_cashier' : 'direct',
  });
};

export const logAdminAction = (userId, storeId, userName, actionType, targetId, details) => {
  return logActivity("ADMIN_ACTION", userId, storeId, {
    userName,
    actionType,
    targetId,
    ...details,
    role: 'superadmin'
  });
};

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
    amount: data?.totalAmount || data?.grandTotal || 0,
    itemCount: data?.items?.length || 0,
    billerId: data?.billerId || userId,
    billerName: data?.billerName || data?.userName || '',
    userName: data?.billerName || data?.userName || '',
    role: data?.role || (data?.billerId === userId || data?.source === 'biller' ? 'biller' : ''),
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
