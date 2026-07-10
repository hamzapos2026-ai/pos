# 07 — Features status

**Date:** 10 Jul 2026  
**Scope:** Operational POS + Customer Persona Foundation  
**Out of scope (do not treat as pending for this phase):** Business Hub, WhatsApp Hub, heavy AI analytics inside Operational POS

---

## Complete (production / wired)

### Auth & setup
- Login (online email/password + offline cached login)
- Setup wizard (first Super Admin / shop)
- Role-based redirect (Admin / Manager / Biller / Cashier)
- Multi-language EN / UR (RTL)
- Theme toggle

### Biller
- Multi-tab billing UI, item entry, discounts, salesperson
- F8 checkout with serial claim (`claimSerialForBilling`)
- Invoice print (thermal / A4 / A5, QR) — InvoicePrint v7
- Customer dialog / selection
- Draft save on tab switch
- Offline bill create → Dexie → cashier pending queue
- Returns modal (biller path)
- Stall monitor / alerts (admin panel support)

### Cashier
- Pending bills queue, pay flows, payment method menu
- Offline payment queue + flush on reconnect
- Paid bill index / optimistic paid / cross-device paid keys
- Cancel / deleted bill flags
- Edit / view bill modals, recent bills, manual review
- Discount / pay-all policy hooks

### Manager
- Dashboard, bills list, cash flow, credits, customers
- Expenses, returns, salespersons, shifts, reports
- Approvals, activity logs
- Reconciliation dashboard (scoped)
- Payment modal (manager)

### Admin / Super Admin
- Dashboard home, users, branches, customers control, bills control
- Cash flow monitor, reconciliation, reports / salesperson reports
- Audit logs, sync monitor, devices
- Shop settings, logos, role permissions / role UI settings
- Product catalog settings, payment methods
- Discount settings (biller / cashier / summary)
- Commission settings + commission dashboard
- Backup / migrate / archive / data manager panels
- Firebase assistant (Super Admin)
- Cashier deleted-flags panel, biller stall panel

### Customers / persona foundation (Phases 1–3)
- Persona schema + incremental updates on bill/payment/return/credit
- `customerRepository` / `customerPersonaService` / admin+manager customer UIs via services
- Offline persona merge via sync queue
- Tenant scope helpers

### Platform
- PWA (vite-plugin-pwa)
- Sync workers (bills, cashier, settings)
- Activity logging
- Optional LAN `shop-server` for multi-PC shop floor
- Cloud Functions for daily summaries + user admin helpers
- Repository stubs: orders, payments, expenses, inventory
- Dashboard stats via summary-oriented service

---

## In progress / partial

| Item | Notes |
|------|--------|
| Repository migration | Persona/customers done; many admin/biller/cashier paths still service→Firebase direct |
| `tenantId` enforcement | Customers + helpers; not full on all orders/payments/expenses rules |
| Payment write path | Canonical `billPaymentWriteService` exists; cashier still uses multiple write paths |
| Daily summaries | Functions maintain; client also has summary read paths — ops must deploy functions |
| Invoice serial admin UI | Some config fields partially ignored by `serialService` |
| Admin user edit | UI open to Admin; writes often Super-Admin-only |
| `/reports/*` route | Placeholder; real reports under manager/admin |

---

## Pending (planned / known gaps — not blocking “Operational POS exists”)

| Item | Priority hint |
|------|----------------|
| Firestore branch isolation hardening | Security |
| Manager returns rules unblock (if still blocked) | Bugfix |
| NetworkContext real sync status (not stub toast) | Reliability UX |
| Wire or remove dead Hold / Reprint / unused payment modals | Cleanup |
| Route manager `BillDetail` or remove | Cleanup |
| Consolidate cashier payment writes to one service | Architecture |
| Full remaining pages → repositories | Architecture |
| Cloud Function daily summary as sole writer (client read-only) | Cost/consistency |
| Hostinger VPS + PostgreSQL migration | Future platform (`docs/master/`) |
| Business Hub / WhatsApp / heavy analytics | Explicitly out of current phase |

---

## Explicitly out of scope (current phase)

- Business Hub
- WhatsApp Hub
- Heavy AI / historical analytics inside Operational POS
