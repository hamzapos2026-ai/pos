# Final Testing Checklist — A One Jewelry POS

**Project:** `aone-jewelry-pos`  
**Purpose:** Manual QA before GitHub push / production release  
**Multi-Role:** Har test mein dual-role user (Biller + Cashier) bhi verify karein

---

## How to Use

- [ ] = Not tested  
- [x] = Pass  
- [!] = Fail — note in Issues column  

| # | Test | Pass | Issues / Notes |
|---|------|------|----------------|
| | | | |

---

## 1. Authentication & Multi-Role

### Login / Logout
| # | Test Case | Pass | Notes |
|---|-----------|------|-------|
| 1.1 | Valid email/password login | [ ] | |
| 1.2 | Invalid credentials error | [ ] | |
| 1.3 | Logout clears session | [ ] | |
| 1.4 | Protected route redirect without login | [ ] | `/biller`, `/cashier`, `/admin` |
| 1.5 | Offline login (cached credentials) | [ ] | |
| 1.6 | Deactivated user blocked online | [ ] | Admin disables user |
| 1.7 | Deactivated user offline (known gap) | [ ] | Document if still works — **expected fail** |

### Multi-Role (Dual Role)
| # | Test Case | Pass | Notes |
|---|-----------|------|-------|
| 1.8 | User with `biller + cashier` — role picker on login | [ ] | |
| 1.9 | Role switch header Biller ↔ Cashier | [ ] | |
| 1.10 | Two browser tabs — different active roles | [ ] | Tab A biller, Tab B cashier |
| 1.11 | URL `/cashier` while activeRole=biller (has both roles) | [ ] | **Should document: allowed by design** |
| 1.12 | User with only biller — `/cashier` blocked | [ ] | |
| 1.13 | Admin removes cashier role — reconnect behavior | [ ] | |
| 1.14 | Permissions merge: biller+cashier can create + receive payment | [ ] | |

### Session / Multi-Device
| # | Test Case | Pass | Notes |
|---|-----------|------|-------|
| 1.15 | Same user two PCs simultaneously | [ ] | |
| 1.16 | Device registry entry on login | [ ] | `devices/` collection |
| 1.17 | Device lock (if enabled) — verify enforcement | [ ] | **Known gap: may not enforce** |

---

## 2. Biller POS Flow

### Item Entry
| # | Test Case | Pass | Notes |
|---|-----------|------|-------|
| 2.1 | Add item — price × qty | [ ] | |
| 2.2 | Duplicate item increments qty | [ ] | |
| 2.3 | Remove item | [ ] | |
| 2.4 | Bill discount (within role cap) | [ ] | `discountPolicy.js` |
| 2.5 | Discount over cap blocked | [ ] | |
| 2.6 | Salesperson assign per item | [ ] | |
| 2.7 | Customer name (optional) | [ ] | |

### Serial & Save
| # | Test Case | Pass | Notes |
|---|-----------|------|-------|
| 2.8 | Serial shows instantly on lock screen | [ ] | `bootstrapNextSerial` |
| 2.9 | INSERT opens with serial (not blank) | [ ] | |
| 2.10 | Save bill — print invoice | [ ] | |
| 2.11 | Offline save — pending sync badge | [ ] | |
| 2.12 | Duplicate serial prevention | [ ] | **Known gap** |
| 2.13 | Draft restore after refresh | [ ] | |

### Hold / Split (Missing Features)
| # | Test Case | Pass | Notes |
|---|-----------|------|-------|
| 2.14 | Hold bill | [ ] | **Feature not wired — expect N/A** |
| 2.15 | Split payment | [ ] | **Feature missing — expect N/A** |

### Counting Voice
| # | Test Case | Pass | Notes |
|---|-----------|------|-------|
| 2.16 | Urdu counting on item add | [ ] | `countingSpeech.js` |
| 2.17 | English counting | [ ] | |
| 2.18 | Test button preview | [ ] | BillerHeader |
| 2.19 | Speed slider | [ ] | |

### Top 5 Recent Orders
| # | Test Case | Pass | Notes |
|---|-----------|------|-------|
| 2.20 | New bill appears in Top 5 | [ ] | |
| 2.21 | Latest first sorting | [ ] | |
| 2.22 | Pending + synced both show | [ ] | |
| 2.23 | Offline — local Top 5 works | [ ] | |
| 2.24 | Firestore error — local fallback | [ ] | |

---

## 3. Cashier Flow

### Pending Bills
| # | Test Case | Pass | Notes |
|---|-----------|------|-------|
| 3.1 | Biller bill appears in cashier pending | [ ] | |
| 3.2 | Filter tabs (pending/paid/cancelled) | [ ] | |
| 3.3 | Search by serial/customer | [ ] | |
| 3.4 | View bill detail modal | [ ] | |

### Payment
| # | Test Case | Pass | Notes |
|---|-----------|------|-------|
| 3.5 | Instant pay — Cash | [ ] | |
| 3.6 | Instant pay — EasyPaisa/JazzCash/Card | [ ] | |
| 3.7 | Cashier-side discount | [ ] | |
| 3.8 | Already paid bill — blocked | [ ] | |
| 3.9 | Cancelled bill — blocked | [ ] | |
| 3.10 | Split payment | [ ] | **Missing — N/A** |

### QR / Serial Entry
| # | Test Case | Pass | Notes |
|---|-----------|------|-------|
| 3.11 | Scan invoice QR (6-digit serial) | [ ] | |
| 3.12 | Paste serial `000032` in field | [ ] | |
| 3.13 | USB barcode scanner input | [ ] | |
| 3.14 | QR camera modal | [ ] | `QRScannerModal.jsx` |
| 3.15 | Wrong serial — error | [ ] | |
| 3.16 | Fake QR / tampered (security) | [ ] | **Known: raw serial auto-valid** |

### Offline Payment
| # | Test Case | Pass | Notes |
|---|-----------|------|-------|
| 3.17 | Pay pending bill offline (same PC) | [ ] | |
| 3.18 | Cross-PC offline — serial + amount | [ ] | `OfflinePaymentModal` |
| 3.19 | Offline payment sync on reconnect | [ ] | |
| 3.20 | Duplicate offline payment blocked | [ ] | |
| 3.21 | Manual review panel for failed sync | [ ] | |

---

## 4. Invoice & Print

| # | Test Case | Pass | Notes |
|---|-----------|------|-------|
| 4.1 | Invoice shows correct serial | [ ] | |
| 4.2 | QR encodes 6-digit serial | [ ] | `#000032` |
| 4.3 | Thermal print | [ ] | |
| 4.4 | A4 / A5 print | [ ] | |
| 4.5 | Reprint watermark | [ ] | |
| 4.6 | Salesperson on invoice | [ ] | |
| 4.7 | Duplicate invoice prevention | [ ] | |

---

## 5. Offline / Online Sync

| # | Test Case | Pass | Notes |
|---|-----------|------|-------|
| 5.1 | Biller saves offline — Dexie record | [ ] | |
| 5.2 | Reconnect — bill syncs to Firebase | [ ] | |
| 5.3 | No duplicate bills after sync | [ ] | **Critical** |
| 5.4 | Cashier offline pay syncs | [ ] | |
| 5.5 | Settings sync | [ ] | `settingsSyncWorker` |
| 5.6 | Two devices offline same serial | [ ] | **Known collision risk** |
| 5.7 | Server-wins conflict behavior | [ ] | Document data loss risk |

---

## 6. Admin / Manager

| # | Test Case | Pass | Notes |
|---|-----------|------|-------|
| 6.1 | Admin dashboard loads | [ ] | |
| 6.2 | User create with multi-role | [ ] | |
| 6.3 | Role change reflects on re-login | [ ] | |
| 6.4 | Branch management | [ ] | |
| 6.5 | Bills control | [ ] | |
| 6.6 | Commission settings | [ ] | |
| 6.7 | Role permissions matrix | [ ] | |
| 6.8 | Audit / activity logs | [ ] | |
| 6.9 | Backup export | [ ] | |
| 6.10 | Device management | [ ] | |
| 6.11 | Manager reports — sales totals | [ ] | Paid filter |
| 6.12 | Admin analytics totals | [ ] | **Check unpaid inclusion** |
| 6.13 | Commission dashboard | [ ] | |
| 6.14 | Pay commission modal | [ ] | |

---

## 7. Commission

| # | Test Case | Pass | Notes |
|---|-----------|------|-------|
| 7.1 | Percent commission calculation | [ ] | |
| 7.2 | Fixed commission calculation | [ ] | **Report may wrong** |
| 7.3 | Commission after cashier pay | [ ] | **Known gap** |
| 7.4 | Refund adjusts commission | [ ] | |
| 7.5 | No duplicate commission entries | [ ] | |

---

## 8. Language (EN / UR)

| # | Test Case | Pass | Notes |
|---|-----------|------|-------|
| 8.1 | Toggle English ↔ Urdu | [ ] | |
| 8.2 | Header translations | [ ] | |
| 8.3 | RTL layout — Admin sidebar | [ ] | |
| 8.4 | RTL layout — Manager | [ ] | |
| 8.5 | RTL layout — Cashier | [ ] | |
| 8.6 | RTL layout — Biller | [ ] | Check margins |
| 8.7 | Urdu fonts render | [ ] | |
| 8.8 | Commission dashboard UR | [ ] | |

---

## 9. Branch / Location

| # | Test Case | Pass | Notes |
|---|-----------|------|-------|
| 9.1 | User sees only assigned branch data | [ ] | Client-side |
| 9.2 | Multi-branch admin view | [ ] | |
| 9.3 | Cross-branch data leak (API test) | [ ] | **Firestore rules gap** |

---

## 10. Logs & Audit

| # | Test Case | Pass | Notes |
|---|-----------|------|-------|
| 10.1 | Sale logged in activity logs | [ ] | |
| 10.2 | Payment logged | [ ] | `cashierActions` |
| 10.3 | QR mismatch logged | [ ] | |
| 10.4 | Role change logged | [ ] | |
| 10.5 | Multi-role user actions tagged | [ ] | |

---

## 11. UI / UX / Responsive

| # | Test Case | Pass | Notes |
|---|-----------|------|-------|
| 11.1 | Desktop 1920×1080 — all dashboards | [ ] | |
| 11.2 | Laptop 1366×768 — Biller layout | [ ] | |
| 11.3 | Tablet 768px — Cashier | [ ] | |
| 11.4 | Mobile 375px — login + cashier FAB | [ ] | |
| 11.5 | Keyboard shortcuts biller | [ ] | |
| 11.6 | POS speed — item add < 200ms feel | [ ] | |
| 11.7 | Long session — no memory leak | [ ] | 4+ hours |

---

## 12. Performance & Edge Cases

| # | Test Case | Pass | Notes |
|---|-----------|------|-------|
| 12.1 | 50+ items on one bill | [ ] | |
| 12.2 | Large amount (7+ digits) | [ ] | |
| 12.3 | Tax/rounding on invoice total | [ ] | |
| 12.4 | Rapid double-click save | [ ] | `saveDoneRef` |
| 12.5 | Print before save completes | [ ] | Race condition |
| 12.6 | Network flap during payment | [ ] | |

---

## 13. Security Spot Checks (Manual)

| # | Test Case | Pass | Notes |
|---|-----------|------|-------|
| 13.1 | Browser console — no secrets in logs | [ ] | |
| 13.2 | Firestore rules — user self role change | [ ] | **Expected fail until fixed** |
| 13.3 | Unauthorized route access | [ ] | |
| 13.4 | XSS in customer name on invoice | [ ] | |

---

## 14. Build & Deploy Readiness

| # | Check | Pass | Notes |
|---|-------|------|-------|
| 14.1 | `npm run build` success | [ ] | |
| 14.2 | `npm test` pass | [ ] | |
| 14.3 | `npm run lint` pass | [ ] | |
| 14.4 | PWA service worker builds | [ ] | |
| 14.5 | No `.env` in git | [ ] | |
| 14.6 | `TROUBLESHOOTING.md` no live keys | [ ] | |

---

## Test Accounts Needed

| Role | Email | Password | Notes |
|------|-------|----------|-------|
| SuperAdmin | | | |
| Admin | | | |
| Manager | | | |
| Biller only | | | |
| Cashier only | | | |
| Biller + Cashier | | | **Required for multi-role** |
| Salesperson | | | |

---

## Known Expected Failures (Document, Don't Block Internal Testing)

1. Hold bill — not wired in UI
2. Split payment — not implemented
3. Biller reports — mock data
4. Firestore self-escalation — security test will fail
5. Offline revoked user — may still work
6. QR tamper protection — serial-only QR
7. Admin analytics — may include unpaid bills

---

## Sign-Off

| Role | Name | Date | Signature |
|------|------|------|-----------|
| QA Engineer | | | |
| Developer | | | |
| Product Owner | | | |

**Overall Result:** [ ] PASS for GitHub Push  [ ] PASS for Production  [ ] FAIL

**Production Readiness Score:** _____ / 10

---

*Full audit: `docs/final-pos-audit-report-roman-urdu.md`*  
*Push checklist: `docs/github-push-checklist.md`*
