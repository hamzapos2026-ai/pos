# ADPOS — Firestore Usage Audit (Kahan Zyada Reads/Writes Ho Rahi Hain)

> **Project:** ADPOS / A-One Jewelry POS  
> **Date:** June 2026  
> **Problem:** Google Cloud Console — *"You have gone over your daily usage limits"*  
> **Spark free limit:** ~**50,000 reads/day**, ~**20,000 writes/day** (resets daily, US Pacific midnight)

---

## 1. Short Summary (Urdu)

| Sawal | Jawab |
|-------|--------|
| POS band ho jayega? | **Nahi poora** — local bills (Dexie) chal sakti hain, lekin **cloud sync / live dashboards ruk jate hain** |
| Sab se zyada kis ne khaya? | **Super Admin screens** (Bills, Reports, Dashboard, Cash Flow, Payment Methods) + **Cashier background reconcile** |
| Biller kitna use karta hai? | **Medium** — Top 5 listener + serial counter (kam docs) |
| Cashier kitna? | **High** — pending queue listeners + paid-index reconcile har boot par |
| Manager kitna? | **High** — Bills page = same 10,000 hybrid listener + har 30s refresh |
| Fix kya hai? | Blaze upgrade + code mein limits/polling kam karna (neeche priority list) |

---

## 2. Firebase Quota — Kya Count Hota Hai?

Har **`getDocs` / `getDoc` / `onSnapshot` initial load** = **1 read per document**  
Har **document update** jisko listener sun raha ho = **1 read per changed doc**  
Har **`setDoc` / `updateDoc` / `addDoc`** = **1 write**

> **Important:** `onSnapshot` query with `limit(10000)` on 378 bills = **378 reads** first time.  
> Lekin agar **har 12 second** wahi query dubara `getDocsFromServer` se chale = **378 × 5/min × 60 = ~113,000 reads/hour** sirf ek tab se!

---

## 3. Usage By Role

### Legend

| Risk | Meaning |
|------|---------|
| 🔴 **CRITICAL** | Poori `orders` collection / 10K limit / no limit — quota killer |
| 🟠 **HIGH** | Bar bar chalti queries ya multiple listeners |
| 🟡 **MEDIUM** | Choti collections ya single doc listeners |
| 🟢 **LOW** | Kam reads, local-first |

---

### 3.1 Biller (`/biller`)

| Feature | File | Type | Limit / Scope | Risk | Notes |
|---------|------|------|---------------|------|-------|
| Bill save (sync) | `localBillService.js` | write | 1 doc/bill | 🟡 | Local pehle, background Firebase write |
| Top 5 recent orders | `BillerHeader.jsx` | `onSnapshot` + poll | `limit(250)` per store | 🟡 | Listener + **90s poll** + offline **25s poll** |
| Top 5 fetch | `BillerHeader.jsx` | `getDocs` | ~150–400 | 🟡 | Har listener trigger par fetch |
| Bill serial counter | `serialService.js` | `onSnapshot` | **1 doc** (`globalSerial`) | 🟢 | Sirf ek document — theek hai |
| Settings sync | `settingsRemoteSync.js` | `onSnapshot` | `settings` collection | 🟢 | Choti collection |
| Dual mode setting | `settingsRemoteSync.js` | `onSnapshot` | 1 doc | 🟢 | |
| Biller stall alerts | `billerStallService.js` | `onSnapshot` | `limit()` small | 🟢 | Admin dashboard bhi use karta hai |
| Customer search | `CustomerDialog.jsx` | `getDocs` | limited | 🟡 | Jab dialog khule |
| Background sync worker | `syncWorker.js` | writes | queue items | 🟡 | Sirf pending bills — writes |

**Biller daily estimate (1 device, 8 hours):** ~**2,000–8,000 reads** (Top 5 + serial + saves) — **moderate**, quota ka main culprit nahi.

---

### 3.2 Cashier (`/cashier`)

| Feature | File | Type | Limit / Scope | Risk | Notes |
|---------|------|------|---------------|------|-------|
| Pending queue listener | `ordersQueryUtils.js` → `subscribeCashierPendingOrders` | **Multiple `onSnapshot`** | up to **2500 × 2–4 listeners**/store | 🔴 | Har store par broad + pending queries |
| Pending boot fetch | `CashierDashboard.jsx` | `getDocs` | 120 then 2500 | 🟠 | Fast boot + full load background |
| Paid bill index reconcile | `paidBillIndexService.js` | many `getDocs` | 300–2000 per query | 🔴 | Boot par **orders + payments + cashierActions** scan |
| Cloud paid-keys listener | `paidBillIndexService.js` | `onSnapshot` | 1 doc/store | 🟢 | Theek |
| Local pending poll | `CashierDashboard.jsx` | interval | Dexie only | 🟢 | Firebase nahi |
| Payment sync worker | `cashierSyncWorker.js` | writes + reads | periodic | 🟠 | Offline payments Firebase par |
| Reconciliation panel | `paymentReconciliationService.js` | 3× `onSnapshot` | 150 each | 🟡 | Jab panel khula ho |
| Deleted bill flags | `cashierDeletedBillService.js` | `onSnapshot` | small | 🟡 | |
| Edit/pay bill | `EditBillModal.jsx` | `getDoc` + `updateDoc` | 1–few | 🟢 | Per action |

**Cashier daily estimate (1 device, full day open):** ~**15,000–40,000+ reads** (listeners + reconcile + queue updates)

---

### 3.3 Manager (`/manager`)

| Feature | File | Type | Limit / Scope | Risk | Notes |
|---------|------|------|---------------|------|-------|
| **Bills page live** | `manager/Bills.jsx` → `subscribeToOrdersLive` | `subscribeOrdersHybrid` | **`limitCount: 10000`** | 🔴 | Same as Super Admin Bills |
| Bills initial fetch | `managerService.getBills` | `fetchOrdersFallback` | **10000** | 🔴 | Page load / 30s `useManagerData` refresh |
| Manager dashboard | `useManagerData.js` | poll 30–60s | varies | 🟠 | Reports/stats fetch |
| Customers page | `manager/Customers.jsx` | `onSnapshot` customers + orders | orders listener | 🟠 | |
| Cash flow | `manager/CashFlow.jsx` | via `useManagerData` | 60s refresh | 🟠 | |
| Approvals | `manager/Approvals.jsx` | fetch | limited | 🟡 | |
| Activity logs | `ActivityLogsDashboard.jsx` | shared component | see Admin | 🟠 | |

**Manager daily estimate (Bills page open 2–3 hours):** ~**20,000–80,000 reads** (hybrid listener + 12s fallback polling)

---

### 3.4 Super Admin (`/admin`)

| Feature | File | Type | Limit / Scope | Risk | Notes |
|---------|------|------|---------------|------|-------|
| **Bills Control** | `BillsControl.jsx` | `subscribeOrdersHybrid` | **10000** + **12s poll** | 🔴🔴 | **Sab se bara culprit** |
| **Reports & Analytics** | `ReportsAnalytics.jsx` | `subscribeOrdersHybrid` | **10000** + customers 60s | 🔴🔴 | Bills jaisa pipeline |
| **Dashboard Home** | `DashboardHome.jsx` | `getDocs` | **ALL orders, NO limit** | 🔴🔴 | `getDocs(collection(db,'orders'))` — poori history |
| **Cash Flow Monitor** | `CashFlowMonitor.jsx` | `onSnapshot` | **`limit(10000)` orders** | 🔴🔴 | Live listener 10K bills |
| **Payment Methods** | `PaymentMethods.jsx` | `onSnapshot` | **ENTIRE `orders` collection** | 🔴🔴 | Koi limit nahi — stats ke liye |
| **Customers Control** | `CustomersControl.jsx` | paginated `getDocs` | **500/batch — ALL orders** | 🔴 | Page khulte hi saari orders load |
| Activity / Audit Logs | `ActivityLogsDashboard.jsx` | 5× `onSnapshot` | **1000 × 5 collections** | 🟠 | auditLogs, cashierActions, clearedData, deletedBills, activityLogs |
| Users + Stores maps | `useStoresMap.js`, BranchManagement | `onSnapshot` | users + stores | 🟡 | Choti collections |
| Device Management | `DeviceManagement.jsx` | `onSnapshot` | devices | 🟡 | |
| Sync Monitor | `SyncMonitor.jsx` | poll 15s | mixed | 🟡 | |
| Super Approvals | `SuperApprovals.jsx` | poll 5s | fetch | 🟠 | |
| Backup Export | `BackupExport.jsx` | `onSnapshot` | backup meta | 🟡 | |
| Commission Settings | `CommissionSettings.jsx` | `onSnapshot` | agents/orders | 🟠 | |
| User Management | `UserManagement.jsx` | poll 30s | user sync | 🟡 | |

**Super Admin — agar ek hi din mein Bills + Reports + Dashboard + Cash Flow kholein:** easily **50,000+ reads in 1–2 hours** → quota khatam.

---

## 4. Background Services (Role se Independent — Har Login par)

| Service | File | Interval | Firebase Impact |
|---------|------|----------|-----------------|
| Settings remote sync | `settingsRemoteSync.js` | listener +  pull timer | 🟢 reads low |
| Bill sync worker | `syncWorker.js` | queue loop | 🟡 writes |
| Cashier sync worker | `cashierSyncWorker.js` | periodic | 🟠 reads/writes |
| Paid bill reconcile | `paidBillIndexService.js` | cashier boot + events | 🔴 many reads |
| Local sync | `localSyncService.js` | periodic | 🟡 writes |
| Auth user doc | `AuthContext.jsx` | `onSnapshot` 1 user | 🟢 |
| Stores map (global hook) | `useStoresMap.js` | `onSnapshot` stores | 🟢 |

---

## 5. Worst Offenders — Priority Fix List

### 🔴 Priority 1 (Quota killers — fix pehle)

| # | Problem | File | Fix |
|---|---------|------|-----|
| 1 | **`subscribeOrdersHybrid` har 12s full fetch** | `ordersQueryUtils.js:460` | Poll hatao ya 5 min+ karo; sirf `onSnapshot` rakho |
| 2 | **Bills + Reports `limitCount: 10000`** | `BillsControl.jsx`, `ReportsAnalytics.jsx`, `managerService.js` | **200–500** recent + pagination |
| 3 | **Dashboard `getDocs(all orders)`** | `DashboardHome.jsx:48` | Summary doc / aaj ki bills `limit(500)` |
| 4 | **Cash Flow `onSnapshot limit(10000)`** | `CashFlowMonitor.jsx:233` | Date filter + `limit(500)` |
| 5 | **Payment Methods `onSnapshot(all orders)`** | `PaymentMethods.jsx:68` | Pre-aggregated stats doc ya paid bills only |
| 6 | **Customers page loads ALL orders** | `CustomersControl.jsx:340` | Customer-linked orders only / `limit` |

### 🟠 Priority 2

| # | Problem | Fix |
|---|---------|-----|
| 7 | Cashier **4 listeners** per store | Ek filtered listener: `pending_payment` + `limit(200)` |
| 8 | `paidBillIndexService` boot scan | Sirf paid-keys doc + last 50 pending |
| 9 | `fetchOrdersFallback` sorted + plain **double fetch** | Ek query try karo |
| 10 | Manager `getBills limit 10000` har 30s | Cache + live listener overlap — ek rakhna |

### 🟡 Priority 3

| # | Problem | Fix |
|---|---------|-----|
| 11 | Activity logs 5×1000 listeners | On-demand fetch + pagination |
| 12 | Biller Top 5 poll 90s + listener | Sirf listener ya sirf poll |
| 13 | Reports customers `getDocs` har 60s | Cache 10 min |

---

## 6. Example: Aaj Quota Kaise Khatam Hui? (378 Bills)

**Scenario:** 1 Super Admin + 1 Cashier + 1 Biller + 1 Manager, sab online 4 hours.

| Source | Calculation | Reads |
|--------|-------------|-------|
| Admin Bills open + 12s poll | 378 × 2 (sorted+plain) × 5/min × 60 × 2hr | **~452,000** ⚠️ theoretical max |
| Admin Reports (same hybrid) | same pipeline parallel | **+200,000** |
| Dashboard open once | 378 users + stores + **378 orders** | ~800 |
| Cash Flow listener | 378 initial + updates | ~2,000 |
| Cashier reconcile boot × 2 devices | ~3,000 × 2 | ~6,000 |
| Cashier pending listeners | ~1,500 × 2 | ~3,000 |
| Biller × 2 | ~5,000 × 2 | ~10,000 |

> **Realistic:** Agar sirf **Bills Control 1 ghanta** khula + **12s polling** → **50,000 limit ~40–60 min mein khatam** ho sakti hai 378 bills par.

---

## 7. Role-wise: Kya Band Hota Hai Jab Limit Hit Ho?

| Role | Limit hit par |
|------|----------------|
| **Biller** | Bill **local save** ho sakti hai; Firebase sync queue mein wait; serial counter read fail ho sakta hai |
| **Cashier** | Pending queue Firebase se nahi aayegi; **local/offline pay** partial; naye bills dusre device se nahi dikhenge |
| **Manager** | Bills page empty/error; approvals stuck |
| **Super Admin** | Console screenshot jaisa — Firestore UI band; app mein bills/reports fail |
| **Reports** | Kuch nahi load — blank ya cached Dexie |

**Local Dexie data safe rehti hai** — quota reset ya Blaze ke baad sync ho sakti hai.

---

## 8. Immediate Actions (Aaj Ke Liye)

1. **Firebase Console → View Usage** — dekho **Reads** vs Writes kaun zyada hai (99% reads hongi).
2. **Super Admin tabs band rakho** jab zaroorat na ho — khas kar **Bills, Reports, Cash Flow, Dashboard**.
3. **Blaze upgrade** + **$10 budget alert** (recommended live shop ke liye) — [`docs/FIREBASE_BILLING_AND_ARCHITECTURE.md`](./FIREBASE_BILLING_AND_ARCHITECTURE.md)
4. Quota **roz reset** hoti hai — dopahar tak wait kar ke phir sirf **ek admin tab** kholo.

---

## 9. Recommended Architecture (Long Term)

```
┌─────────────┐     writes      ┌──────────────────┐
│ Biller/Cash │ ──────────────► │ orders (recent)  │
│  (local IDB)│                 │ limit + indexes  │
└─────────────┘                 └────────┬─────────┘
                                         │
                    ┌────────────────────┼────────────────────┐
                    ▼                    ▼                    ▼
           dailySummary/{date}   storeStats/meta      cashierPaidKeys
           (1 doc/day)           (1 doc/store)        (1 doc/store)
                    │                    │                    │
                    └──────── Dashboard / Reports sirf summary read
```

- **Cashier:** filtered listener `pending_payment` + `limit(150)`
- **Admin/Manager Bills:** `limit(300)` + "Load more"
- **Dashboard/Reports:** `dailySummary` collection — **10 reads** instead of 10,000
- **Polling:** minimum 5 minutes ya hata do

---

## 10. File Index (Quick Reference)

| Category | Main Files |
|----------|------------|
| Hybrid listener + 12s poll | `src/utils/ordersQueryUtils.js` |
| Admin Bills | `src/pages/admin/BillsControl.jsx` |
| Admin Reports | `src/pages/admin/ReportsAnalytics.jsx` |
| Admin Dashboard | `src/pages/admin/DashboardHome.jsx` |
| Admin Cash Flow | `src/pages/admin/CashFlowMonitor.jsx` |
| Admin Payment Methods | `src/pages/admin/PaymentMethods.jsx` |
| Admin Customers | `src/pages/admin/CustomersControl.jsx` |
| Manager Bills | `src/pages/manager/Bills.jsx`, `src/services/managerService.js` |
| Cashier queue | `src/pages/cashier/CashierDashboard.jsx` |
| Paid index / reconcile | `src/services/paidBillIndexService.js` |
| Biller Top 5 | `src/components/biller/BillerHeader.jsx` |
| Activity logs | `src/components/activity/ActivityLogsDashboard.jsx` |
| Serial counter | `src/services/serialService.js` |
| Settings sync | `src/services/settingsRemoteSync.js` |

---

## 11. Related Docs

- [`FIREBASE_BILLING_AND_ARCHITECTURE.md`](./FIREBASE_BILLING_AND_ARCHITECTURE.md) — Spark vs Blaze, cost estimate
- [`OFFLINE_SHOP_DEPLOYMENT_GUIDE.md`](./OFFLINE_SHOP_DEPLOYMENT_GUIDE.md) — local-first shop setup

---

*Generated from codebase audit — June 2026. Counts assume ~378–500 orders in Firestore; scale up = quota faster exhaust.*
