# 06 — Firebase overview

**Date:** 10 Jul 2026 · **No secrets included**

## Products in use

| Product | Status | Notes |
|---------|--------|-------|
| Authentication | **In use** | Email/Password primary; offline cached login with password hash |
| Cloud Firestore | **In use** | Primary online datastore |
| Cloud Functions | **In use (optional deploy)** | See exports below; Blaze may be required |
| Cloud Storage | **Not used in app code** | `storageBucket` config field only; logos as data URL / URL in settings |
| Firebase Hosting | **Not configured in `firebase.json`** | SPA typically on Netlify/Vercel |
| Analytics / FCM | Config field optional | Not a core POS path |

## Authentication

- **Primary:** Email + password (`signInWithEmailAndPassword` / create user)
- **Offline login:** Cached profile + password hash (~30-day window)
- **Password reset / admin user create:** Secondary Firebase app (`aone-secondary`) so admin session is not replaced
- **Not used:** Google, phone, anonymous, Clerk (Clerk package unused)

## Firestore collections (from `firestore.rules`)

See also `10-DATABASE-STRUCTURE.md` for fields/local DBs.

Top-level matches include:

`settings`, `backups`, `systemBackups` (+ `chunks`), `archiveBatches`, `archive_records`, `backup_notifications`, `orders`, `dailySummaries`, `bills`, `stores` (+ `meta`), `serialCounters`, `serialLocks`, `users`, `email_verify_tokens`, `user_email_otps`, `user_tombstones`, `mail`, `sync_ops`, `customers`, `activityLogs`, `billerStallAlerts`, `cashierActions`, `auditLogs`, `superAdminActivityLogs`, `notifications`, `deletedBills`, `system`, `payments`, `expenses`, `returns`, `heldBills`, `clearedData`, `fraudAlerts`, `payment_matches`, `fraud_reviews`, `shifts`, `cashTransactions`, `approvalRequests`, `superApprovalRequests`, `managerApprovedOrders`, `managerCancelledOrders`, `globalCounters`, `commissions` (+ `snapshots`), `devices`, plus catch-all `/{document=**}`.

## Storage

- No `firebase/storage` uploads in `src/`
- Shop logo: processed client-side into settings (data URL) or external URL

## Cloud Functions (`functions/index.js`)

| Export | Trigger | Purpose |
|--------|---------|---------|
| `maintainDailySummary` | `orders/{orderId}` write | Maintain `dailySummaries` aggregates |
| `deleteUserAccount` | Callable | Super Admin deletes Auth user |
| `ensureUserProfile` | Callable | Repair/bootstrap `users/{uid}` |
| `repairAllUserProfiles` | Callable | Bulk Auth → Firestore profile sync |
| `trimCashierPaidKeysNightly` | Scheduled | Nightly cleanup of paid keys |

Region: `us-central1`.

## Rules & indexes

- Rules: `firestore.rules`
- Indexes: `firestore.indexes.json`
- Config: `firebase.json` (Firestore + Functions only)

## Known security gaps (for planning)

- Branch isolation incomplete in rules (cross-branch risk)
- Manager returns may be blocked by rules
- Some admin UI edits require Super Admin write path

## Cost / billing notes

See `docs/FIREBASE_BILLING_AND_ARCHITECTURE.md` and `docs/FIRESTORE_USAGE_AUDIT.md` (in repo docs). Prefer pagination, summary docs, selective listeners — avoid full collection scans.
