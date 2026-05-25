// File: src/db/index.js
// Purpose: Dexie IndexedDB configuration for offline-first application storage
// Features: Bills, bill items, customers, payments, expenses, logs, sync queue
// Offline: Yes
// Dependencies: dexie
// ✅ ADDED: syncStatus index on orders store

import Dexie from 'dexie';

/**
 * A One Jewelry POS — App Storage (LAYER-2)
 * Purpose: Local storage for application state, shifts, and background sync data
 */
let db;
try {
  db = new Dexie('aone_pos_db');

  db.version(5).stores({
    // Existing tables
    drafts: 'key, userId, storeId, tabId, version, timestamp',
    settings_cache: 'key, storeId, updatedAt',
    held_bills: '++id, holdId, billerId, storeId, heldAt, reason, totalAmount',
    returns: '++id, returnId, originalBillId, billerId, storeId, processedAt, refundAmount',
    shifts: '++id, shiftId, managerId, storeId, status, openedAt, closedAt, openingBalance',
    cash_transactions: '++id, txId, shiftId, storeId, type, amount, reason, createdAt',
    activity_logs_local: '++id, action, userId, storeId, timestamp, synced',
    deleted_records: '++id, originalId, type, reason, deletedAt, deletedBy, synced',
    sync_queue_local: '++id, type, data, attempts, status, createdAt, lastAttempt',
    products: '++id, barcode, name, price, storeId, isActive',
    customer_credits: '++id, customerId, storeId, outstanding, limit',

    // Master Prompt Tables
    users: '++id, uid, email, name, role, storeId, active, synced',
    roles: '++id, roleId, name, permissions, synced',
    sessions: '++id, sessionId, userId, deviceId, loginTime, lastActive',
    settings: '++id, key, storeId, value, synced',

    // Bills store with syncStatus index
    bills: '++id, billId, billSerial, storeId, billerId, customerId, totalAmount, discountAmount, finalAmount, status, createdAt, updatedAt, synced',

    // ✅ FIXED: orders store with proper indexes for sync
    orders: '&localId, billId, storeId, billerId, status, savedAt, serialNo, dateKey, firebaseId, syncStatus, synced',

    bill_items: '++id, billId, itemId, productName, serialId, price, qty, discount, discountType, total, salespersonId, salespersonName, commissionPercent, commissionType, commissionFixed, createdAt',
    customers: '++id, customerId, name, phone, email, city, market, address, creditLimit, outstandingBalance, createdAt, updatedAt, synced',
    payments: '++id, paymentId, billId, amount, paymentType, paymentMethod, reference, createdAt, synced',
    expenses: '++id, expenseId, category, amount, description, billerId, storeId, date, synced',
    logs: '++id, logId, action, userId, storeId, details, timestamp, synced',
    sync_queue: '++id, queueId, type, operation, data, priority, attempts, status, createdAt, lastAttempt, synced',
  });

  db.version(6).stores({
    // Keep all other tables the same as version 5 schema:
    drafts: 'key, userId, storeId, tabId, version, timestamp',
    settings_cache: 'key, storeId, updatedAt',
    held_bills: '++id, holdId, billerId, storeId, heldAt, reason, totalAmount',
    returns: '++id, returnId, originalBillId, billerId, storeId, processedAt, refundAmount',
    shifts: '++id, shiftId, managerId, storeId, status, openedAt, closedAt, openingBalance',
    cash_transactions: '++id, txId, shiftId, storeId, type, amount, reason, createdAt',
    activity_logs_local: '++id, action, userId, storeId, timestamp, synced',
    deleted_records: '++id, originalId, type, reason, deletedAt, deletedBy, synced',
    sync_queue_local: '++id, type, data, attempts, status, createdAt, lastAttempt',
    products: '++id, barcode, name, price, storeId, isActive',
    customer_credits: '++id, customerId, storeId, outstanding, limit',

    users: '++id, uid, email, name, role, storeId, active, synced',
    roles: '++id, roleId, name, permissions, synced',
    sessions: '++id, sessionId, userId, deviceId, loginTime, lastActive',
    settings: '++id, key, storeId, value, synced',

    bills: '++id, billId, billSerial, storeId, billerId, customerId, totalAmount, discountAmount, finalAmount, status, createdAt, updatedAt, synced',
    orders: '&localId, billId, storeId, billerId, status, savedAt, serialNo, dateKey, firebaseId, syncStatus, synced',
    bill_items: '++id, billId, itemId, productName, serialId, price, qty, discount, discountType, total, salespersonId, salespersonName, commissionPercent, commissionType, commissionFixed, createdAt',
    
    // Upgraded for Version 6
    // Keep primary key unchanged (was ++id in version 5). Changing primary key
    // across versions causes Dexie UpgradeError: "Not yet support for changing primary key".
    customers: '++id, customerId, name, nameLower, phone, email, city, market, purchaseCount, totalSpent, createdAt, updatedAt, synced',
    processed_orders: 'orderId, customerId, amount, status',

    payments: '++id, paymentId, billId, amount, paymentType, paymentMethod, reference, createdAt, synced',
    expenses: '++id, expenseId, category, amount, description, billerId, storeId, date, synced',
    logs: '++id, logId, action, userId, storeId, details, timestamp, synced',
    sync_queue: '++id, queueId, type, operation, data, priority, attempts, status, createdAt, lastAttempt, synced',
  });

  // Version 7: add approval requests and manager approved orders for offline-first support
  db.version(7).stores({
    approval_requests: '++id, requestId, billId, localBillId, status, requestedBy, storeId, createdAt',
    manager_approved_orders: '++id, requestId, billId, approvedBy, approvedAt, storeId, createdAt',
  });

  // Version 8: add super-admin approval stores
  db.version(8).stores({
    super_approval_requests: '++id, requestId, parentRequestId, billId, localBillId, status, requestedBy, storeId, createdAt',
    super_admin_approved_orders: '++id, requestId, billId, approvedBy, approvedAt, storeId, createdAt',
  });

  // Version 9: add cancelled orders stores for manager and super-admin
  db.version(9).stores({
    manager_cancelled_orders: '++id, requestId, billId, cancelledBy, cancelledAt, storeId, reason, createdAt',
    super_admin_cancelled_orders: '++id, requestId, billId, cancelledBy, cancelledAt, storeId, reason, createdAt',
  });
} catch (err) {
  console.error('[Dexie] Initialization failed:', err && err.name, err && err.message, err && err.stack);
  db = new Dexie('aone_pos_db');
}

export { db };

export const initDatabase = async () => {
  try {
    await db.open();
    console.log('[Dexie] Database opened successfully');
    return db;
  } catch (err) {
    console.error('[Dexie] Failed to open database:', err && err.name, err && err.message, err && err.stack);
    return null;
  }
};

export default db;