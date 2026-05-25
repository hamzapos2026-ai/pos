# Enterprise Architecture for A One Jewelry POS

## Purpose
This document defines the enterprise-grade architecture for the A One Jewelry POS system, aligned with the existing React + Firebase + Dexie foundation.

## Key Principles
- Firebase Auth + Firestore as primary backend
- Dexie IndexedDB for offline writes and queueing
- Permission-based RBAC, not fixed role gating
- Enterprise inventory + branch + multi-store support
- Audit, sync, and security-first design
- PWA offline behavior with manual retry and conflict handling

## Collection Design
### stores
- `storeName`, `branchCode`, `location`, `address`, `city`, `country`
- `currency`, `timezone`, `phone`, `email`, `logoUrl`
- `isActive`, `status`, `createdAt`, `updatedAt`

### branches
- `storeId`, `branchName`, `branchCode`, `location`, `contact`
- `managerId`, `enabled`, `inventoryPolicy`, `createdAt`, `updatedAt`

### users
- `uid`, `email`, `name`, `displayName`, `roles[]`, `primaryRole`
- `permissions` (map), `storeIds[]`, `primaryStore`
- `isActive`, `isDeleted`, `loginCount`, `lastLoginAt`
- `deviceIds[]`, `userCode`, `createdAt`, `updatedAt`

### roles
- `roleId`, `name`, `label`, `description`, `permissions` (map)
- `isSystemRole`, `createdAt`, `updatedAt`

### permissions
- `permissionId`, `code`, `label`, `category`, `description`
- Example: `createBills`, `viewAllReports`, `deleteBills`, `manageInventory`

### products
- `sku`, `barcode`, `name`, `category`, `metalType`, `weight`, `purity`
- `makingCharge`, `stoneCharge`, `costPrice`, `sellPrice`, `branchStocks[]`
- `storeId`, `isActive`, `createdAt`, `updatedAt`

### inventory
- `productId`, `branchId`, `storeId`, `qtyAvailable`, `qtyReserved`
- `cost`, `batchId`, `stockStatus`, `updatedAt`

### orders
- `orderId`, `localId`, `billId`, `billSerial`, `storeId`, `branchId`
- `createdBy`, `customerId`, `salesAgentId`
- `items[]`, `totalAmount`, `discountAmount`, `taxAmount`, `finalAmount`
- `paymentStatus`, `status`, `source`, `offlineMeta`, `createdAt`, `updatedAt`

### payments
- `paymentId`, `billId`, `orderId`, `amount`, `paymentType`, `paymentMethod`
- `cashierId`, `storeId`, `branchId`, `timestamp`, `synced`, `offlineSavedAt`

### auditLogs
- `action`, `entityType`, `entityId`, `before`, `after`
- `userId`, `userName`, `branchId`, `storeId`, `deviceId`, `timestamp`, `reason`

### cashTransactions
- `txId`, `shiftId`, `branchId`, `storeId`, `type`, `amount`, `reason`, `createdAt`

### settings
- store or branch config values
- `key`, `value`, `scope`, `storeId`, `branchId`, `updatedAt`

### syncQueue
- `queueId`, `type`, `operation`, `data`, `priority`
- `attempts`, `status`, `createdAt`, `lastAttempt`, `synced`

## Offline Strategy
- Use Dexie to persist local actions and queue them for synchronization
- Keep `localId`, `syncStatus`, `syncedAt`, `offlineDeviceId` on orders/payments
- Flush queue on reconnect and mark `synced=true` once confirmed
- Maintain offline login cache for up to 30 days
- Use `serviceWorker` only for shell and asset delivery, not for Firestore sync logic

## RBAC Strategy
- Preserve legacy role support, but enforce boundaries using permission keys
- Use `permissions` map on user documents for custom overrides
- Merge role permission maps to derive effective permissions
- Use permission-aware route guards and UI feature flags

## Audit / Alert Strategy
- Log every create/edit/delete for financial entities
- Write audit entries with full before/after state where possible
- Detect suspicious patterns: repeated deletes, high discounts, multi-device logins
- Surface audit alerts in admin dashboards and log pages

## Report Architecture
- Use Firestore indexes for `storeId`, `branchId`, `dateKey`, `userId`, `status`
- Build daily/branch summaries as precomputed documents for high-volume reports
- Use pagination with `startAfter` and `limit`
- Support CSV/Excel export for top-level reports

## Deployment Notes
- Keep Firebase rules in source control
- Use environment variables for Firebase config
- Enable Firestore offline persistence only for client caches, not for sync control
- Document branch activation, user creation, and store assignment clearly

## Current Implementation Updates
1. Added permission-aware route guard in `src/routes/RoleBasedRoute.jsx`
2. Updated key route definitions in `src/App.jsx` to honor permission keys
3. Future upgrade path:
   - migrate route protection fully to permissions
   - add `roles` and `permissions` management UI
   - add `stores` / `branches` collection support
   - add `auditLogs` and `syncQueue` harden rules
