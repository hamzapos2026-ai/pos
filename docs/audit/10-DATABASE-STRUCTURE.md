# 10 — Database structure (Firestore + local)

**Date:** 10 Jul 2026 · No production data dumps

---

## A. Cloud Firestore collections

Derived from `firestore.rules` (authoritative access map). Field shapes vary by document; key entities below.

| Collection | Typical purpose |
|------------|-----------------|
| `orders` | Bills/orders (billing + cashier + manager) |
| `bills` | Legacy/alternate bill docs (if used) |
| `customers` | Customers + persona fields |
| `payments` | Payment records |
| `expenses` | Expenses |
| `returns` | Returns |
| `users` | User profiles / roles / branch |
| `stores` | Stores/branches (+ `meta` subcollection) |
| `settings` | App/shop settings docs |
| `dailySummaries` | Per-day aggregates (Functions + clients) |
| `serialCounters` / `serialLocks` | Invoice serial allocation |
| `globalCounters` | Global counters (e.g. serials) |
| `heldBills` | Held bills (cloud) |
| `deletedBills` | Deleted/cancelled bill records |
| `activityLogs` / `auditLogs` / `cashierActions` | Audit trails |
| `superAdminActivityLogs` | Super-admin activity |
| `billerStallAlerts` | Biller stall monitoring |
| `shifts` / `cashTransactions` | Shift & cash movement |
| `approvalRequests` / `superApprovalRequests` | Approvals |
| `managerApprovedOrders` / `managerCancelledOrders` | Manager actions index |
| `commissions` (+ `snapshots`) | Commission data |
| `devices` | Device registry |
| `notifications` / `backup_notifications` | Notifications |
| `backups` / `systemBackups` (+ `chunks`) | Backup metadata |
| `archiveBatches` / `archive_records` | Archive |
| `payment_matches` / `fraud_reviews` / `fraudAlerts` | Reconciliation / fraud |
| `sync_ops` | Sync operations |
| `email_verify_tokens` / `user_email_otps` / `user_tombstones` / `mail` | User lifecycle / email |
| `system` / `clearedData` | System docs |

**Multi-tenant fields (target schema):** `tenantId`, `storeId`, `branchId`, `userId` on entities — enforcement completeness varies (see features status).

### Customer persona (foundation fields)

Incremental updates after bill/payment/return/credit — see `src/utils/customerPersonaSchema.js`. Includes identity, visit dates, totals, frequency, credit history, preferred branch/salesperson, VIP/inactive flags, notes, etc.

---

## B. Local Dexie — `aone_pos_db` (`src/db/index.js`)

Tables include:  
`drafts`, `settings_cache`, `held_bills`, `returns`, `shifts`, `cash_transactions`, `activity_logs_local`, `deleted_records`, `sync_queue_local`, `products`, `customer_credits`, `users`, `roles`, `sessions`, `settings`, `bills`, `orders`, `bill_items`, `customers`, `processed_orders`, `payments`, `expenses`, `logs`, `sync_queue`, `approval_requests`, `manager_approved_orders`, `super_approval_requests`, `super_admin_approved_orders`, `manager_cancelled_orders`, `super_admin_cancelled_orders`, `commission_transactions`, `failedSync`, `serial_claims`

## C. Local Dexie — `aone_local_db_v1` (`src/services/localDB.js`)

`users`, `bills`, `settings`, `syncQueue`

## D. Other IndexedDB

- `cashier_offline_payments` — offline cashier payments (`offlinePaymentService.js`)

## E. LAN shop-server

- File: `shop-server/data/shop-db.json` (runtime; gitignored)  
- Not Firestore; used for multi-PC shop floor when configured

## F. Indexes

Composite indexes: `firestore.indexes.json` (deploy with Firebase CLI when changed).
