# Offline Billing & Payment Reconciliation

> **Golden Rule:** Workflow online aur offline mein **same** hai. Sirf sync method change hoti hai.  
> Customer kabhi wait nahi karta — cash flow nahi rukta — baad mein system automatically reconcile karta hai.

**Version:** v1.0 · **Date:** June 2026  
**Related:** [`OFFLINE_FIRST_ARCHITECTURE.md`](./OFFLINE_FIRST_ARCHITECTURE.md)

---

## 1. High-Level Overview

```mermaid
flowchart TB
    subgraph WORKFLOW["Business Workflow (Always Same)"]
        C[Customer] --> B[Biller]
        B --> P[Print Receipt]
        P --> CS[Cashier]
        CS --> D[Delivery / Handover]
    end

    subgraph ONLINE["Online Mode"]
        B -->|saveOrder| LD1[(Local DB)]
        LD1 -->|immediate sync| FB1[(Firebase)]
        CS -->|saveOfflinePayment| LD2[(Local Payments IDB)]
        LD2 -->|sync worker| REC1[Reconciliation Engine]
        REC1 --> FB1
    end

    subgraph OFFLINE["Offline Mode"]
        B -->|saveOrder| LD3[(Local DB)]
        LD3 -->|sync_queue| Q1[Sync Queue]
        CS -->|saveOfflinePayment| LD4[(Local Payments IDB)]
        LD4 -->|sync_queue| Q2[Payment Queue]
        Q1 & Q2 -->|internet returns| REC2[Reconciliation Engine]
        REC2 --> FB2[(Firebase)]
    end

    style WORKFLOW fill:#1a1a2e,stroke:#f59e0b,color:#fff
    style REC1 fill:#065f46,stroke:#10b981,color:#fff
    style REC2 fill:#065f46,stroke:#10b981,color:#fff
```

---

## 2. Golden Rule

| Mode | Customer Journey | User Experience |
|------|------------------|-----------------|
| **Online** | Customer → Biller → Cashier → Delivery | Normal — no "offline" message |
| **Offline** | Customer → Biller → Cashier → Delivery | **Identical** — no "offline" message |

**Principle:** Har action pehle **local database** mein save → phir **sync queue** → internet aate hi background sync.

---

## 3. Database Architecture (Independent Entities)

Bills aur Payments alag entities hain. Matching alag collection mein record hoti hai.

```mermaid
erDiagram
    ORDERS ||--o{ PAYMENTS : "matched via"
    PAYMENTS ||--o| PAYMENT_MATCHES : "creates"
    PAYMENTS ||--o| FRAUD_REVIEWS : "flags"
    ORDERS ||--o| FRAUD_REVIEWS : "flags"
    PAYMENTS ||--o{ CASHIER_ACTIONS : "audit"
    ORDERS ||--o{ ACTIVITY_LOGS : "audit"

    ORDERS {
        string id PK
        string billSerial
        string storeId
        number totalAmount
        string status
        string paymentStatus
        string matchStatus
        string deliveryStatus
        boolean offlineSyncPending
    }

    PAYMENTS {
        string id PK
        string localId
        string billId
        string billSerial
        number amount
        string storeId
        string deviceId
        boolean isOffline
    }

    PAYMENT_MATCHES {
        string id PK
        string paymentLocalId
        string billId
        string billSerial
        number paymentAmount
        number billAmount
        string branchId
        string status
        string reason
    }

    FRAUD_REVIEWS {
        string id PK
        string reason
        string details
        string paymentLocalId
        string billId
        string severity
        string status
    }
```

### Local Storage (Device)

```mermaid
flowchart LR
    subgraph DEXIE["Dexie — aone_pos_db"]
        O[orders]
        SQ[sync_queue]
        B[bills]
        E[expenses]
        CU[customers]
    end

    subgraph IDB["IndexedDB — cashier_offline_payments"]
        PAY[payments]
        PSQ[sync_queue]
        MR[manual_review]
    end

    O --> SQ
    PAY --> PSQ
    PSQ -->|cashierSyncWorker| REC[Reconciliation Engine]
    SQ -->|localSyncService| REC
```

| Store | Database | Purpose |
|-------|----------|---------|
| `orders` | Dexie `aone_pos_db` | Biller offline bills |
| `sync_queue` | Dexie | Bill/expense/customer sync ops |
| `payments` | IDB `cashier_offline_payments` | Cashier offline payments |
| `sync_queue` | IDB | Payment sync queue |
| `manual_review` | IDB | Local mismatch queue |

### Cloud Collections (Firebase)

| Collection | Access | Purpose |
|------------|--------|---------|
| `orders` | All staff | Bills (source of truth) |
| `payments` | All staff | Independent payment records |
| `payment_matches` | Manager+ | Match history & status |
| `fraud_reviews` | Manager+ | Suspicious activity queue |
| `fraudAlerts` | Admin+ | Discount/other fraud (existing) |
| `cashierActions` | Audit | Payment action trail |
| `activityLogs` | Audit | System activity |

---

## 4. Scenario Flows

### Scenario 1 — Biller Offline, Cashier Online

```mermaid
sequenceDiagram
    participant B as Biller (Offline)
    participant LD as Local Dexie
    participant C as Customer
    participant CS as Cashier (Online)
    participant PI as Payment IDB
    participant SW as Sync Workers
    participant FB as Firebase
    participant REC as Reconciliation

    B->>LD: saveOrder() — bill + sync_queue
    B->>C: Print receipt
    C->>CS: Pays at cashier
    CS->>PI: saveOfflinePayment() — instant
    CS->>C: ✅ Paid (same toast, no wait)
    CS->>SW: runPaymentSync() background

    Note over SW,FB: Bill not in Firebase yet
    SW->>REC: reconcilePayment()
    REC-->>SW: needsRetry (bill_not_found)
    Note over SW: Stays in queue — no penalty

    LD->>FB: localSyncService syncs bill
    FB->>REC: reconcileAfterBillSync()
    REC->>FB: payment_matches + update bill paid
    REC->>FB: payments collection record
```

### Scenario 2 — Biller Offline, Cashier Offline

```mermaid
sequenceDiagram
    participant B as Biller Device
    participant CS as Cashier Device
    participant LD1 as Biller Local DB
    participant LD2 as Cashier Payment IDB
    participant C as Customer
    participant NET as Internet
    participant FB as Firebase
    participant REC as Reconciliation

    B->>LD1: Bill saved locally
    B->>C: Print + customer leaves for cashier
    C->>CS: Payment
    CS->>LD2: saveOfflinePayment()
    CS->>C: ✅ Paid — customer takes goods

    C->>C: Leaves shop

    NET->>LD1: Bill syncs to Firebase
    NET->>LD2: Payment syncs to Firebase
    LD1->>REC: reconcileAfterBillSync()
    LD2->>REC: reconcilePayment()
    REC->>FB: Auto match by billSerial + amount + branch
    REC->>FB: payment_matches (status: matched)
```

---

## 5. Cashier Payment Flow (Offline-First Always)

Pehle online direct Firebase write hoti thi. Ab **hamesha** same path:

```mermaid
flowchart TD
    A[Cashier: Instant Pay / QR Pay] --> B{Already paid?}
    B -->|Yes| X[❌ Block duplicate]
    B -->|No| C[saveOfflinePayment]
    C --> D[updateBillStatus — local Dexie]
    D --> E[markBillPaidLocally]
    E --> F[Remove from cashier queue]
    F --> G["Toast: 💰 Paid Rs.X"]
    G --> H{Online?}
    H -->|Yes| I[runPaymentSync background]
    H -->|No| J[Queue waits for internet]
    I --> K[cashierSyncWorker]
    J --> K
    K --> L[reconcilePayment]

    style G fill:#065f46,stroke:#10b981,color:#fff
    style X fill:#7f1d1d,stroke:#ef4444,color:#fff
```

**Key file:** `src/pages/cashier/CashierDashboard.jsx` → `handleInstantPay()`

---

## 6. Sync Queue System

```mermaid
flowchart LR
    subgraph BILLER_OPS["Biller Operations"]
        BC[Bill Create]
        EC[Expense Create]
        CC[Customer Create]
        RC[Return Create]
    end

    subgraph CASHIER_OPS["Cashier Operations"]
        PC[Payment Create]
        MB[Manual Bill]
    end

    BC --> SQ1[Dexie sync_queue]
    EC --> SQ1
    CC --> SQ1
    RC --> SQ1

    PC --> SQ2[Payment IDB sync_queue]
    MB --> SQ2

    SQ1 --> LSW[localSyncService<br/>every sync cycle]
    SQ2 --> CSW[cashierSyncWorker<br/>every 15s + on reconnect]

    LSW --> FB[(Firebase)]
    CSW --> REC[Reconciliation Engine]
    REC --> FB

    LSW -->|bill synced| REC
```

| Worker | Interval | Triggers |
|--------|----------|----------|
| `localSyncService` | On reconnect + manual | Bill sync from Dexie |
| `cashierSyncWorker` | 15s + `online` event | Payment sync from IDB |
| `syncWorker` | Background | Settings, generic ops |

---

## 7. Auto Matching Engine

**File:** `src/services/paymentReconciliationService.js`

### Match Criteria

```mermaid
flowchart TD
    START[Payment sync triggered] --> DUP{Duplicate payment<br/>in Firebase?}
    DUP -->|Yes| FRAUD1[fraud_reviews<br/>duplicate_payment]
    DUP -->|No| FIND{Find bill by<br/>billId / billSerial + branch}
    FIND -->|Not found| WAIT[pending_match<br/>keep in queue]
    FIND -->|Found| BRANCH{branchId match?}
    BRANCH -->|No| FRAUD2[fraud_reviews<br/>branch_mismatch]
    BRANCH -->|Yes| AMT{amount match?}
    AMT -->|No| FRAUD3[fraud_reviews<br/>amount_mismatch]
    AMT -->|Yes| PAID{bill already paid?}
    PAID -->|Yes| FRAUD4[fraud_reviews<br/>duplicate_bill]
    PAID -->|No| OK[✅ MATCHED]

    OK --> M1[payment_matches record]
    OK --> M2[payments collection]
    OK --> M3[orders → cashier_paid]
    OK --> M4[cashierActions audit]

    WAIT -->|bill syncs later| FIND

    style OK fill:#065f46,stroke:#10b981,color:#fff
    style FRAUD1 fill:#7f1d1d,stroke:#ef4444,color:#fff
    style FRAUD2 fill:#7f1d1d,stroke:#ef4444,color:#fff
    style FRAUD3 fill:#7f1d1d,stroke:#ef4444,color:#fff
    style FRAUD4 fill:#7f1d1d,stroke:#ef4444,color:#fff
    style WAIT fill:#78350f,stroke:#f59e0b,color:#fff
```

### Match Status Values

| Status | Meaning | Action |
|--------|---------|--------|
| `matched` | Bill + payment aligned | Bill marked paid |
| `pending` | Bill not synced yet | Retry when bill arrives |
| `review_required` | Needs manager review | Manual review panel |
| `fraud` | Suspicious activity | `fraud_reviews` + alert |

### Fraud Reasons

| Code | Trigger |
|------|---------|
| `bill_not_found` | Bill not in Firebase (temporary) |
| `amount_mismatch` | Payment Rs.X ≠ Bill Rs.Y |
| `branch_mismatch` | Wrong store/branch |
| `duplicate_payment` | Same bill paid twice |
| `duplicate_bill` | Bill already fully paid |
| `bill_id_mismatch` | Wrong bill ID |

---

## 8. Fraud Review Flow

```mermaid
flowchart TD
    subgraph TRIGGERS["Fraud Triggers"]
        T1[Amount mismatch]
        T2[Duplicate payment]
        T3[Duplicate bill]
        T4[Branch mismatch]
    end

    T1 & T2 & T3 & T4 --> LOCAL[manual_review — local IDB]
    T1 & T2 & T3 & T4 --> CLOUD[fraud_reviews — Firebase]
    CLOUD --> DASH[Reconciliation Dashboard]
    LOCAL --> MRP[ManualReviewPanel — Cashier UI]
    DASH --> MGR[Manager / Admin alert]
    MRP --> MGR

    MGR -->|Approve| PAID[Bill marked paid]
    MGR -->|Reject| REJ[Payment rejected]
    MGR -->|Investigate| INV[Under investigation]

    style CLOUD fill:#7f1d1d,stroke:#ef4444,color:#fff
    style DASH fill:#1e3a5f,stroke:#3b82f6,color:#fff
```

---

## 9. Delivery Security

Product issue karne wale staff ko **sirf status** dikhe — raw bill se maal issue na ho.

```mermaid
flowchart LR
    BILL[Bill / Payment data] --> DS[getDeliveryStatus]
    DS --> V[✅ Payment Verified]
    DS --> R[⚠️ Pending Review]
    DS --> N[❌ Not Paid]

    V -->|Allow| ISSUE[Issue product]
    R -->|Hold| HOLD[Wait for manager]
    N -->|Block| BLOCK[Do not issue]

    style V fill:#065f46,stroke:#10b981,color:#fff
    style R fill:#78350f,stroke:#f59e0b,color:#fff
    style N fill:#7f1d1d,stroke:#ef4444,color:#fff
```

| Status | Label | Product Issue? |
|--------|-------|----------------|
| `payment_verified` | Payment Verified | ✅ Yes |
| `pending_review` | Pending Review | ⚠️ Hold |
| `not_paid` | Not Paid | ❌ Block |

**Files:**
- `src/utils/deliveryStatus.js` — logic
- `src/components/shared/DeliveryStatusBadge.jsx` — UI badge
- `toDeliverySafeView()` — strips sensitive fields for delivery staff

---

## 10. Reconciliation Dashboard

Admin aur Manager ke liye daily audit screen.

```mermaid
flowchart TB
    subgraph UI["Dashboard UI"]
        S1[Unmatched Bills]
        S2[Unmatched Payments]
        S3[Pending Reviews]
        S4[Fraud Alerts]
        S5[Sync Failures]
        BTN[Force Sync Button]
    end

    subgraph DATA["Data Sources"]
        FB[(Firebase)]
        LD[(Local IDB)]
    end

    S1 & S2 & S3 & S4 --> FB
    S2 & S5 --> LD
    BTN --> LSW[localSyncService]
    BTN --> CSW[cashierSyncWorker]

    subgraph ROUTES["Routes"]
        AD["/admin/reconciliation"]
        MG["/manager/reconciliation"]
    end
```

| Stat Card | Source |
|-----------|--------|
| Unmatched Bills | Firebase `orders` where `paymentStatus = pending_payment` |
| Unmatched Payments | Firebase `payments` + local IDB pending |
| Pending Reviews | Firebase `fraud_reviews` where `status = open` |
| Fraud Alerts | High severity `fraud_reviews` |
| Sync Failures | Local queue items with `status = failed` |

**Files:**
- `src/components/reconciliation/ReconciliationDashboard.jsx`
- `src/pages/admin/Reconciliation.jsx`
- `src/pages/manager/Reconciliation.jsx`

---

## 11. File Map

```
src/
├── services/
│   ├── offlinePaymentService.js      # Local payment save + sync queue
│   ├── paymentReconciliationService.js  # ★ Matching engine (NEW)
│   ├── cashierSyncWorker.js          # Payment sync worker (updated)
│   └── localSyncService.js           # Bill sync + reconcileAfterBillSync
│
├── pages/
│   ├── cashier/CashierDashboard.jsx  # Offline-first payment (updated)
│   ├── admin/Reconciliation.jsx      # Admin dashboard page (NEW)
│   └── manager/Reconciliation.jsx    # Manager dashboard page (NEW)
│
├── components/
│   ├── reconciliation/ReconciliationDashboard.jsx  # (NEW)
│   ├── shared/DeliveryStatusBadge.jsx              # (NEW)
│   └── cashier/ManualReviewPanel.jsx               # Local review UI
│
└── utils/
    └── deliveryStatus.js             # Delivery security logic (NEW)

firestore.rules          # payment_matches + fraud_reviews rules
firestore.indexes.json   # Composite indexes for new collections
```

---

## 12. Deploy Checklist

```powershell
# 1. Firestore rules + indexes deploy
firebase deploy --only firestore:rules,firestore:indexes

# 2. App build
npm run build

# 3. Hosting deploy (if needed)
firebase deploy --only hosting
```

---

## 13. Test Checklist

| # | Test | Expected |
|---|------|----------|
| 1 | Biller offline → create bill | Bill in Dexie + print works |
| 2 | Cashier pays (online) | Same toast, no "offline" message |
| 3 | Bill syncs after payment | Auto-match in `payment_matches` |
| 4 | Wrong amount payment | `fraud_reviews` entry created |
| 5 | Duplicate payment attempt | Blocked at local save |
| 6 | Admin dashboard | `/admin/reconciliation` shows stats |
| 7 | Force Sync button | Bills + payments sync |
| 8 | Delivery badge | Shows Verified / Pending / Not Paid |

---

## 14. Known Limitations (Future Work)

```mermaid
mindmap
  root((Future))
    Unified Sync Queue
      Merge Dexie + Payment IDB queues
      Single worker for all entity types
    Delivery Lookup Screen
      QR scan for delivery staff
      Only status visible
    Single IndexedDB
      Merge cashier_offline_payments into Dexie
    Real-time Alerts
      Push notification to Manager on fraud
```

| Item | Status |
|------|--------|
| Unified sync queue (all entity types) | Partial — bills/payments separate paths |
| Dual IndexedDB (Dexie + payment IDB) | Functional, not merged |
| Dedicated delivery lookup screen | Badge ready, screen pending |
| Real-time manager push alerts | Dashboard only (no push yet) |

---

## 15. Quick Reference — Key Functions

| Function | File | Purpose |
|----------|------|---------|
| `saveOfflinePayment()` | `offlinePaymentService.js` | Local save + queue |
| `reconcilePayment()` | `paymentReconciliationService.js` | Match payment → bill |
| `reconcileAfterBillSync()` | `paymentReconciliationService.js` | Match after bill arrives |
| `attemptPaymentMatch()` | `paymentReconciliationService.js` | Core match logic |
| `flagFraudReview()` | `paymentReconciliationService.js` | Create fraud record |
| `getDeliveryStatus()` | `deliveryStatus.js` | Delivery security check |
| `getReconciliationDashboardData()` | `paymentReconciliationService.js` | Dashboard stats |
| `runSync()` | `cashierSyncWorker.js` | Process payment queue |
| `syncOfflineOrders()` | `localSyncService.js` | Process bill queue |

---

*JazakAllah Khair — A One Jewelry POS · Offline-First Reconciliation v1.0*
