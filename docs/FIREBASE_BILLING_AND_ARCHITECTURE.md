# A One Jewelry POS — Firebase Billing + Cost-Efficient Architecture

> **Audience:** Fahad Store / project stakeholders  
> **Purpose:** Billing decisions + long-term architecture direction (combined short reference)  
> **Project:** `aone-jewelry-pos`  
> **Date:** June 2026

---

## Part A — Firebase Billing (Technical Q&A)

### 1. Current plan: Spark ya Blaze?

**Codebase se plan detect nahi hota.** Firebase Console se verify karein:

| Check | Path |
|-------|------|
| Plan name | [Firebase Console](https://console.firebase.google.com) → Project select → ⚙️ **Project settings** → **Usage and billing** |
| Blaze upgrade prompt | Same page — agar "Upgrade to Blaze" dikhe = abhi **Spark** |
| GCP billing link | Google Cloud Console → **Billing** → linked project |

**Likely situation (codebase ke mutabiq):**
- Core POS (bills, cashier, manager) **Spark par chal sakta hai** agar quotas ke andar rahein.
- **Blaze tab zaroori** jab Cloud Functions deploy hon ya Firebase Extensions (email) use hon.

---

### 2. Kis exact feature ke liye billing account required hai?

| Feature | Plan | Reason |
|---------|------|--------|
| **Cloud Functions** (`deleteUserAccount`) | **Blaze** | Google Cloud Functions = paid GCP service; Spark par deploy nahi hota |
| **Firebase Extension: Trigger Email** (`mail` collection) | **Blaze** | Extension outbound network use karti hai |
| **Firestore** (reads/writes/storage) | Spark **free quota** tak free; us ke baad Blaze | Pay-as-you-go overage |
| **Firebase Auth** (email/password login) | Spark free tier (generous) | Usually no card for normal shop usage |
| **Hosting / Storage** | Spark quotas | Card tab jab quota exceed ho |

**Hamare project mein Blaze-triggering code:**

```
functions/index.js          → deleteUserAccount (callable Cloud Function)
src/services/firebaseUserService.js  → httpsCallable('deleteUserAccount')
src/services/emailVerificationService.js → mail collection (Trigger Email extension)
```

---

### 3. Screenshot — kahan card / billing demand hoti hai?

> **Note:** Ye document repo mein hai; live Firebase Console screenshots yahan attach nahi hain.  
> Fahad bhai in screens ki screenshots le kar team ko share karein:

| # | Screen | Navigation |
|---|--------|------------|
| 1 | **Current plan** | Firebase Console → Project Settings → **Usage and billing** |
| 2 | **Upgrade to Blaze** | Same page → **Modify plan** / **Upgrade** button |
| 3 | **Add payment method** | Google Cloud Console → **Billing** → **Payment methods** → Add card |
| 4 | **Functions deploy block** | Terminal: `firebase deploy --only functions` → billing error (agar Spark ho) |
| 5 | **Trigger Email extension** | Firebase Console → **Extensions** → Trigger Email → Install (Blaze prompt) |

---

### 4. Card attach na kiya jaye to kya kaam nahi karega?

| Feature | Without Blaze / Card | App behaviour |
|---------|----------------------|---------------|
| Super Admin **Auth user delete** | Cloud Function deploy nahi | User Firestore se remove hota hai; **login Firebase Auth mein reh sakta hai** — manual delete Console se |
| **Email OTP** (new user create) | `mail` queue process nahi | OTP Firestore mein save hota hai lekin **email nahi jati** |
| Core billing (biller → cashier) | Works on Spark | Local Dexie save + background sync |
| Offline mode | Works | IndexedDB primary |
| Reports / dashboards | Works within quota | Quota exceed = Firestore errors / throttling |

Code already handles Spark gracefully:

```text
firebaseUserService.js → skipped: true, reason: 'spark_or_disabled'
```

Env flag: `VITE_AUTH_DELETE_ENABLED=false` se Auth delete call skip ho sakti hai.

---

### 5. Alternatives (paid service avoid karna)

| Paid need | Free / low-cost alternative |
|-----------|----------------------------|
| Auth user delete | Manual: Firebase Console → Authentication → Delete user |
| Email OTP | Resend / SendGrid free tier via custom API; ya admin-only user create (OTP skip) |
| Cloud Functions | Client-side Admin SDK **use mat karo** (security risk); optional feature rakho |
| Heavy dashboard reads | **Summary collections** + local cache (Part B) |
| Realtime everywhere | **Polling / on-demand fetch** jahan live update zaroori na ho |

---

### 6. Firebase ki requirement ya Google Cloud?

**Dono linked hain.**

- **Firebase** = developer-facing product (Auth, Firestore, Hosting UI).
- **Blaze plan** = Firebase project ko **Google Cloud Billing account** se link karta hai.
- **Cloud Functions** technically **Google Cloud Functions** hain — Firebase unhe wrap karta hai.
- **Firestore** = Firebase-branded, GCP infrastructure par chalti hai.

Card add karna = **Google Cloud Billing**, Firebase Console se trigger hota hai.

---

### 7. Expected monthly usage & cost estimate

**Assumptions (single branch, ~100 bills/day, 5–10 active devices):**

| Metric | Rough monthly | Spark free daily limit |
|--------|---------------|------------------------|
| Firestore writes | ~6,000–15,000 | 20,000/day ✅ |
| Firestore reads | **HIGH RISK** — depends on listeners | 50,000/day ⚠️ |
| Auth MAU | < 20 users | 50,000/month ✅ |
| Cloud Functions | ~50–200 invocations (user deletes only) | N/A on Spark |
| Email (Trigger Email) | ~100–500/month | Extension needs Blaze |

**Cost estimate (Blaze, optimized architecture):**

| Scenario | Est. monthly USD |
|----------|------------------|
| Small shop, listeners controlled, summaries added | **$0 – $5** (often inside free tier) |
| Current pattern: many `onSnapshot` on open dashboards | **$10 – $50+** at scale |
| 500+ bills/day, full history listeners | **$50 – $200+** without redesign |

**Firestore pricing (reference):** ~$0.06 / 100K reads, ~$0.18 / 100K writes (region-dependent).

> Exact number Firebase Console → **Usage and billing** → Usage tab se milega.

---

### 8. Cloud Functions / aur paid GCP services?

**Haan — ek Cloud Function defined hai:**

| Function | File | Why needed |
|----------|------|------------|
| `deleteUserAccount` | `functions/index.js` | Firebase Admin SDK se Auth user delete — **client par Admin SDK safe nahi** |

**Deploy command:** `firebase deploy --only functions:deleteUserAccount`

**Aur paid-adjacent services (extensions, not code):**
- **Trigger Email** — `emailVerificationService.js` → `mail` collection
- **Firestore persistent cache** — client-side, no extra billing

**Abhi use NAHI ho rahi:** Cloud Run, BigQuery, Cloud Storage (heavy), Pub/Sub.

---

### 9. Kya POS Spark par chal sakta hai?

**Short answer: Haan — core POS ke liye; kuch admin features limited.**

| Works on Spark | Needs Blaze / workaround |
|----------------|--------------------------|
| Biller bill create (local-first) | Auth user auto-delete |
| Cashier payment queue (realtime) | Email OTP delivery |
| Manager bills / approvals | Functions deploy |
| Offline sync queue | — |
| Login / roles | — |

**Technical reasons Spark enough for core:**
1. `localBillService.js` — bill pehle **Dexie** mein save, phir background sync
2. `syncWorker.js` / `localSyncService.js` — queue-based Firebase writes
3. `firebase.js` — offline persistent cache enabled
4. Auth delete + email = **optional** admin flows, graceful skip on Spark

**Technical reason Spark may fail at scale:**
- Bahut se screens par `onSnapshot` / `subscribeOrdersHybrid` — har change par reads multiply
- Reports raw `orders` scan karte hain (`ReportsAnalytics.jsx`, `DashboardHome.jsx`, etc.)
- Activity logs screen par multiple live listeners (`ActivityLogsDashboard.jsx`)

---

### 10. Blaze required ho to cost control & budget alerts

**Setup checklist:**

1. **Budget alert (Google Cloud)**  
   Cloud Console → Billing → **Budgets & alerts** → e.g. $10 / $25 / $50 thresholds → email alert

2. **Firebase usage alerts**  
   Project Settings → Integrations → link billing → monitor Firestore reads daily

3. **Quotas (optional hard cap)**  
   GCP → APIs → Firestore → Quotas (advanced; careful with production)

4. **Architecture controls (best ROI)**  
   - Summary collections (Part B)  
   - Listeners sirf cashier queue / alerts  
   - Pagination + `limit()` everywhere  
   - `getDocs` on-demand for reports

5. **Env flags (already in project)**  
   - `VITE_AUTH_DELETE_ENABLED=false` — skip paid function path

---

## Part B — Cost-Efficient Architecture (Project Roadmap)

### Current state vs target

| Principle | Current (`aone-jewelry-pos`) | Target |
|-----------|------------------------------|--------|
| **Local-first DB** | ✅ Dexie (`src/db/index.js`) + `localBillService` | Firebase = sync layer only |
| **Background sync** | ✅ `syncWorker`, `localSyncService`, `cashierSyncWorker` | Same; no user wait on Firebase |
| **Unnecessary reads** | ⚠️ Admin/manager dashboards often load full collections | `DailySalesSummary`, `BranchSummary`, etc. |
| **Realtime listeners** | ⚠️ Cashier ✅ justified; admin/reports ⚠️ heavy | Live only: payment queue, fraud, notifications |
| **Activity logs** | ✅ Pagination exists (`ActivityLogsDashboard`) | Open screen par load; no dashboard auto-read |
| **Reports scale** | ⚠️ Raw orders scan | Pre-aggregated summaries |
| **Service layer** | ⚠️ Partial (`managerService`, etc.) | `*Service` → `FirebaseRepository` abstraction |
| **Vendor lock-in** | Firebase-specific queries in UI | Move Firestore calls behind repositories |

### Offline-first rule (mandatory)

```
User Action → Local Save (Dexie) → UI Update → Sync Queue → Background Firebase Sync
```

**Kabhi na karein:** `User Action → await Firebase → UI Update`

Already implemented for billing; extend to settings, customers, logs.

### Read optimization examples

| Bad (expensive) | Good (cheap) |
|-----------------|--------------|
| Dashboard open → `onSnapshot(orders)` all bills | Dashboard → `getDoc(dailySummary/2026-06-10)` |
| Reports → full history scan | Monthly rollup docs updated on each paid bill |
| Activity logs on app load | Logs only when admin opens Activity page |
| `useStoresMap` live listener globally | Cache stores in Dexie; refresh on demand |

### Realtime — sirf jahan zaroorat

| Screen | Realtime OK? |
|--------|--------------|
| Cashier payment queue | ✅ Yes |
| Manager pending approvals | ✅ Yes |
| Admin reports / analytics | ❌ On-demand fetch |
| Branch list / users | ❌ Cache + manual refresh |
| Commission dashboard | ⚠️ Polling acceptable |

### Future-proof reports structure (proposed Firestore)

```
summaries/
  daily/{YYYY-MM-DD}     → totalSales, billCount, branchId, ...
  monthly/{YYYY-MM}      → rollups
  branch/{storeId}/daily → per-branch
  salesperson/{id}/monthly
```

Update summary doc in same sync transaction when bill is paid — **1 write, avoids 1000s of reads**.

### Service layer pattern (migration-ready)

```
UI Component
    ↓
BillingService / ReportService / CustomerService
    ↓
FirebaseRepository (today) | SupabaseRepository (future)
```

Kal PostgreSQL / Supabase migration par sirf repository swap — UI same.

### Cost philosophy

> Firebase avoid nahi karna — **smart use** karna hai.  
> Galat architecture = chhoti app bhi mahangi.  
> Sahi architecture = Blaze par bhi $0–$5/month possible.

### Long-term product goals

- Fast, reliable, offline-first  
- Fraud-resistant (activity logs, audit trail)  
- Multi-branch, multi-market reports  
- International-standard codebase (sellable product)  
- Strong foundation > quick Firebase shortcuts  

---

## Quick Decision Matrix

| Goal | Recommendation |
|------|----------------|
| Sirf shop chalana, low budget | **Stay Spark**; skip Functions deploy; manual Auth delete; OTP optional |
| Production admin (email OTP + auto user delete) | **Upgrade Blaze**; set $10–25 budget alert |
| Scale 500+ bills/day | **Blaze + architecture Part B** (summaries mandatory) |
| Avoid card completely | Spark + architecture fixes; no Extensions, no Functions |

---

## Related project docs

- `docs/OFFLINE_FIRST_ARCHITECTURE.md` — existing offline/sync design  
- `docs/OFFLINE_PAYMENT_RECONCILIATION.md` — payment sync  
- `functions/index.js` — Cloud Function source  
- `src/services/firebaseUserService.js` — Spark/Blaze graceful handling  

---

## Action items (recommended)

1. Firebase Console se **current plan screenshot** share karein (Section A.3).  
2. Decide: Blaze chahiye ya Spark + workarounds (Decision Matrix).  
3. Agar Blaze: budget alert $10 + $25 set karein.  
4. Phase 1 architecture: dashboard listeners → summary docs.  
5. Phase 2: repository layer for `orders`, `customers`, `reports`.

---

*JazakAllah Khair — ye document project codebase (`aone-jewelry-pos`) ke actual implementation par based hai.*
