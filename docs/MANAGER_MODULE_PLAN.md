# Manager Module — Design & API Spec

This document captures the initial design, data models, and API endpoints to implement the Manager role features described by the product owner.

## Goals (high level)
- Provide managers with branch-level operational control (view + act) while respecting Admin permissions.
- Support offline read/write with later sync.
- Keep audit logs for approvals and sensitive actions.

## Principal Data Models
- `Manager` (user claim): assignedBranches: [branchId], permissions: {customers, salespersons, approvals}
- `Branch`: id, name, location, openingCash, currentCash
- `Bill`: existing app bill model — ensure fields: status, totals, payments[], customerId, salespersonId, branchId, notes, activityLog[]
- `Expense`: id, branchId, amount, category, description, createdBy, approvedBy, status, createdAt
- `Return`: id, billId, amount, reason, approvedBy, status, createdAt
- `CreditPayment`: id, billId, amount, payer, collectedBy, branchId, createdAt
- `ActivityLog`: entityType, entityId, action, oldValue, newValue, userId, ts

## Auth & Role Checks
- Use Firebase customClaims or `users` collection `role` + `assignedBranches`.
- Middleware should enforce: manager can act only on bills/records in their `assignedBranches` unless Admin overrides.

## API Endpoints (backend/service layer)
Note: adapt to existing `services/*.js` patterns (Firebase functions or client-side service wrappers).

- GET `/manager/dashboard?branchId&from&to` — returns aggregated cards + charts data
- GET `/manager/bills?branchId&status&page` — paginated bills list
- GET `/manager/bills/:id` — bill details + activity log
- POST `/manager/bills/:id/notes` — add note (permission)
- POST `/manager/bills/:id/pay` — record payment (partial/full) — updates register + commission
- GET `/manager/credits?branchId` — list credit bills
- POST `/manager/credits/:id/collect` — record credit collection
- GET `/manager/customers?query` — search
- POST `/manager/customers` — add customer
- PUT `/manager/customers/:id` — edit (permission guarded)
- GET `/manager/salespersons?branchId` — list (if allowed)
- POST `/manager/salespersons` — add (if allowed)
- PUT `/manager/salespersons/:id` — edit (if allowed)
- GET `/manager/expenses?branchId` — list
- POST `/manager/expenses` — add expense (may require approval)
- POST `/manager/expenses/:id/approve` — approve expense
- GET `/manager/returns?branchId` — list returns
- POST `/manager/returns/:id/approve` — approve return and process refund
- GET `/manager/reports` — generate reports with filters (date range, branch, user, customer, salesperson, payment method)
- GET `/manager/activity?branchId&since` — activity logs
- POST `/manager/export` — generate Excel/PDF (async)

## Offline & Sync Notes
- Cache dashboard/stale lists in IndexedDB. Use existing `indexedDBService.js` conventions.
- Queue write operations (payments, expenses, approvals) locally when offline and sync with `syncService.js`.

## Audit & Approval
- Every approval action should write an `ActivityLog` entry and, for critical changes, store previous value.

## UI Surface (high level)
- `pages/manager/Dashboard.jsx` — cards + charts
- `pages/manager/Bills.jsx` — filters, lists, open bill modal
- `pages/manager/CashFlow.jsx` — opening/closing, transfers
- `pages/manager/Credits.jsx` — credit list + collect modal
- `pages/manager/Customers.jsx` — search/add/edit
- `pages/manager/Expenses.jsx` — add/approve
- `pages/manager/Returns.jsx` — verify/approve
- `pages/manager/Reports.jsx` — filters + export

## Next steps (implementation order)
1. Wire auth/role checks and `assignedBranches` enforcement.
2. Implement dashboard endpoint + minimal UI cards.
3. Implement bills listing + bill detail view (read-only).
4. Add payment collection API and partial payments handling.

---
Placeholders and further details will be implemented per todo steps.
