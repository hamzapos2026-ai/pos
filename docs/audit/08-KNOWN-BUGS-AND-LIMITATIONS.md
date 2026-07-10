# 08 — Known bugs & limitations

**Date:** 10 Jul 2026  
**Source:** Project audit memory, code inventory, commission troubleshooting docs

---

## Open bugs / design tradeoffs

| ID | Issue | Impact | Notes |
|----|-------|--------|-------|
| B1 | Print-before-save | Receipt may print before save fully confirms | By design for speed; save has duplicate guard |
| B2 | Manager returns blocked | Manager may fail returns | Linked to `firestore.rules` |
| B3 | Branch isolation incomplete | Cross-branch data risk if rules/queries weak | Security priority for next roadmap |
| B4 | NetworkContext “sync” stub | Shows toast only; not real sync health | Misleading offline UX |
| B5 | Payment write fragmentation | Multiple cashier write paths | Harder to reason about conflicts/duplicates |
| B6 | Admin user edit vs SuperAdmin write | Admin opens form; write may fail | Permission UX gap |
| B7 | Invoice serial config partial | Prefix/date/counter UI fields partially ignored | Serial service vs admin settings mismatch |
| B8 | Commission Rs. 0 for some agents | SP reports show zero | Commission off / SP not on item / inactive agent — see `COMMISSION_TROUBLESHOOTING.md` |

## Fixed / mitigated (keep for regression)

| Item | Status |
|------|--------|
| Serial collision on billing | Fixed via `claimSerialForBilling` (online atomic + offline/LAN fallback) |
| InvoicePrint reliability (F8) | Improved waits, window-first print, timeouts, retry |
| Hold bill Dexie query / restore | Service fixed; **UI still not wired** to BillerDashboard |
| Commission page flicker | Documented as fixed in troubleshooting doc |

---

## Dead / orphaned code (limitation: maintenance noise)

- `HoldBillModal` + `holdBillService` — not wired to BillerDashboard
- `ReprintDialog.jsx` — orphaned
- `useOfflinePayments.js` — broken imports / unused
- `useBillerTabs.js`, `useBillerBill.js`, `BillerPaymentModal`, cashier `PaymentModal` — unused duplicates
- Manager `BillDetail.jsx` — not routed
- `/reports/*` — placeholder only
- SalesHistory reprint — toast stub
- `@clerk/clerk-react` — dependency unused

---

## Architectural / operational limitations

1. **Offline is per-browser** unless LAN `shop-server` is deployed — multi-PC offline needs shop-server or shared network design.
2. **Firebase cost** grows with listeners/scans; summary docs + pagination required for scale.
3. **Cloud Functions** need correct deploy + billing; `deploy:functions` script currently targets a subset.
4. **VPS + PostgreSQL** is documentation-only; current live path is Firebase SPA.
5. **Catch-all Firestore rule** `/{document=**}` increases risk if not tightly constrained — review in security pass.
6. **Customer Persona** is incremental foundation only — not a full CRM/analytics hub.

---

## Testing gaps (for auditors)

- No claim of 100% automated E2E coverage; vitest covers selected units (e.g. serial, asyncBatch).
- Formal screen recording (item 9) should exercise offline + print + pay paths manually.
- Regression checklist: F8 checkout online/offline, cashier pay, reconnect flush, manager reports, admin user create, print thermal/A4.
