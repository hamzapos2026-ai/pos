# Offline Shop Deployment Guide

> **A One Jewelry POS** — Biller + Cashier offline (multi-PC) · Manager + Super Admin on Firebase  
> **Version:** 1.1 · **Date:** June 2026  
> **Related:** [OFFLINE_QUICK_START.md](./OFFLINE_QUICK_START.md) · [DEPLOYMENT_PWA.md](./DEPLOYMENT_PWA.md) · [OFFLINE_FIRST_ARCHITECTURE.md](./OFFLINE_FIRST_ARCHITECTURE.md) · [OFFLINE_PAYMENT_RECONCILIATION.md](./OFFLINE_PAYMENT_RECONCILIATION.md)

> **✅ Implemented in repo:** `shop-server/` + `VITE_SHOP_API_URL` — see [OFFLINE_QUICK_START.md](./OFFLINE_QUICK_START.md)

---

## 1. Summary (Urdu + English)

| Goal | Solution |
|------|----------|
| Biller + Cashier **offline**, alag-alag PCs, same branch | **Shop LAN Server** + local database (MongoDB / SQLite) |
| Manager + Super Admin | **Firebase** (online) — no change |
| Multi-branch | Har branch ka **apna shop server** → sab **Firebase** par sync |
| Har PC par VS Code / `npm run dev`? | **❌ Nahi** — sirf developer machine par |
| API khareedni hai? | **❌ Nahi** — apna free Node.js shop server |

---

## 2. Architecture Overview

### 2.1 Target hybrid model

```
┌─────────────────────────────────────────────────────────────┐
│                 BRANCH 1 (e.g. Lahore Shop)                  │
│                                                              │
│   ┌─────────┐   ┌─────────┐   ┌─────────┐   ┌────────────┐ │
│   │ Biller  │   │ Cashier │   │ Cashier │   │ Shop Server│ │
│   │  PC 1   │   │  PC 2   │   │  PC 3   │   │ LAN + DB   │ │
│   └────┬────┘   └────┬────┘   └────┬────┘   └─────┬──────┘ │
│        └─────────────┴─────────────┴──────────────┘        │
│                     LAN (internet optional)                  │
└────────────────────────────┬────────────────────────────────┘
                             │ sync when internet available
                             ▼
                    ☁️ Firebase (Firestore)
                             │
         ┌───────────────────┼───────────────────┐
         ▼                   ▼                   ▼
    Manager PC         Super Admin          Branch 2 Shop
    (online)           (online)             (same pattern)
```

### 2.2 Role matrix

| Role | Internet on shop PC | Data source | Install type |
|------|---------------------|-------------|--------------|
| **Biller** | Optional | Shop LAN server | Browser PWA / Electron |
| **Cashier** | Optional | Shop LAN server | Browser PWA / Electron |
| **Manager** | Required | Firebase | Web URL (hosting) |
| **Super Admin** | Required | Firebase | Web URL (hosting) |

### 2.3 Current vs target

| Feature | Current app (today) | Target (recommended) |
|---------|---------------------|---------------------|
| Biller offline, **same PC** as cashier | ✅ Dexie + BroadcastChannel | ✅ |
| Biller + Cashier **different PCs**, offline | ⚠️ Weak (per-browser IndexedDB) | ✅ LAN server |
| Manager / Super Admin on Firebase | ✅ | ✅ |
| Multi-branch central reports | ✅ Firebase | ✅ Firebase + per-branch sync |
| Shop install | `npm run build` → PWA / hosting | PWA + LAN server + optional `.exe` |

---

## 3. Important: What NOT to do on shop PCs

### ❌ Do NOT run on biller/cashier machines

```bash
npm run dev      # Development only — developer laptop
code .           # VS Code — developer only
npm install      # Shop staff should never use terminal
```

### ✅ DO on shop PCs

- Open **Chrome / Edge**
- Use installed **PWA** or bookmark: `http://<SHOP-SERVER-IP>:8080`
- Login as biller / cashier

### ✅ DO on developer machine (one time per release)

```bash
npm install
npm run build
# Output: dist/ folder — copy to shop via USB or LAN
```

---

## 4. Do you need to buy an API?

**No.** There is no third-party API subscription required.

| Component | Cost | Notes |
|-----------|------|-------|
| Node.js shop server | Free | You build & host on shop LAN |
| MongoDB Community / SQLite | Free | Local database on shop server |
| Firebase (Manager/Super Admin) | Free tier → usage-based | Already in project |
| Paid API (RapidAPI, etc.) | Not needed | — |

---

## 5. Database options for shop LAN server

Browsers **cannot** run MySQL/PostgreSQL/MongoDB directly. A **shop server PC** runs the database + API; biller/cashier browsers call it over LAN.

| Database | Best for | Multi-PC offline | Complexity |
|----------|----------|------------------|------------|
| **SQLite** | 1–2 branches, small shop | ✅ | Lowest |
| **MongoDB** | Medium shops, flexible JSON docs | ✅ | Medium |
| **PostgreSQL** | Large data, heavy SQL reports | ✅ | Medium–high |

**Recommendation:** Start with **SQLite** or **MongoDB** on one shop server per branch.

### 5.1 Example MongoDB collections

```javascript
// orders (bills)
{
  _id, billSerial, storeId, branchId, totalAmount, status,
  paymentStatus, billerId, items[], customer{},
  createdAt, syncedToFirebase: false
}

// payments
{
  _id, orderId, billSerial, amount, cashierId,
  paymentMethod, deviceId, createdAt, syncedToFirebase: false
}

// sync_queue
{
  _id, type: 'order' | 'payment', docId, status, retryCount, createdAt
}
```

**Golden rule (same as today):** Bills and payments are **separate entities** — matching runs after sync. See [OFFLINE_PAYMENT_RECONCILIATION.md](./OFFLINE_PAYMENT_RECONCILIATION.md).

---

## 6. Multi-PC same branch (offline flow)

### 6.1 Network layout

| Device | Example IP | Role |
|--------|------------|------|
| Shop Server | `192.168.1.100` | API + DB + serve `dist/` |
| Biller PC | `192.168.1.101` | Browser → server |
| Cashier PC | `192.168.1.102` | Browser → server |
| Router | Shop WiFi / LAN | No special hardware |

Set **static IP** on shop server in router (DHCP reservation).

### 6.2 Daily offline flow

```
1. Biller creates bill #000085 → POST /api/orders → Shop DB
2. Cashier sees bill in pending list → GET /api/orders/pending
3. Cashier pays → POST /api/payments → Shop DB updated
4. Biller sees paid status (same LAN, instant)
5. When internet returns → Shop server syncs → Firebase
6. Manager / Super Admin view reports on Firebase (anywhere)
```

### 6.3 MongoDB / LAN — how it works (simple)

```
Biller Browser  ──HTTP──►  Node.js API  ──►  MongoDB
Cashier Browser ──HTTP──►  (port 3001)  ──►  (same DB)
                                │
                    (when online) ▼
                           Firebase Firestore
                                │
                         Manager / Super Admin
```

---

## 7. Multi-branch setup

Each branch has its **own** shop server and local database. Firebase is the **central** layer for management.

```
Branch Lahore     → Server 192.168.1.100   → DB branch_lahore
Branch Karachi    → Server 192.168.10.100  → DB branch_karachi
Branch Islamabad  → Server 192.168.20.100 → DB branch_islamabad
                          │
                          ▼ (each syncs when online)
                    Firebase (all branches)
                          │
                    Super Admin dashboard
```

| Level | Purpose |
|-------|---------|
| Branch local DB | Fast offline billing & cashier on shop floor |
| Firebase | Cross-branch reports, manager approvals, super admin |
| Sync worker | Push `syncedToFirebase: false` records to Firestore |

---

## 8. Installation methods

### Method A — PWA (available today)

**On developer machine (internet):**

```bash
npm install
npm run build
```

Copy entire `dist/` folder to shop server.

**On shop server:**

```bash
# From inside dist/ folder
npx serve -s . -l 8080
```

Or use **nginx** / **Caddy** for production.

**On each biller/cashier PC:**

1. Open Chrome/Edge: `http://192.168.1.100:8080`
2. Menu → **Install app** / **Add to desktop**
3. Use desktop shortcut daily

> **Limitation today:** Without LAN API server, multi-PC offline bill sharing is limited to same-browser Dexie. See Method C for full offline multi-PC.

---

### Method B — Electron desktop app (recommended for shops)

| Pros | Cons |
|------|------|
| Double-click icon, no browser training | One-time packaging setup |
| No VS Code / npm on shop PCs | ~150MB installer size |
| Better printer/USB integration | Extra dev work |

**Flow:**

1. Developer builds `AOnePOS-Setup-1.0.0.exe`
2. Copy to USB
3. Install on each biller/cashier PC
4. App points to `http://192.168.1.100:3001` (shop API)

---

### Method C — Shop LAN server + browsers (best for offline multi-PC)

**Shop server PC (always ON):**

| Service | Port | Purpose |
|---------|------|---------|
| Node.js API | `3001` | Orders, payments, auth |
| MongoDB / SQLite | internal | Master shop database |
| Static app (`dist/`) | `8080` | React PWA files |

**Biller / Cashier PCs:** Browser or PWA → `http://192.168.1.100:8080`  
**API base URL in app config:** `http://192.168.1.100:3001`

---

## 9. Full installation checklist

### Phase 0 — Developer (once per release)

- [ ] `npm install && npm run build`
- [ ] Build shop-server package (when implemented)
- [ ] Optional: build Electron `.exe`
- [ ] Create USB **Install Kit** (see §10)

### Phase 1 — Branch shop server (once per branch)

- [ ] Dedicated PC (can be old Windows PC), always powered on
- [ ] Install Node.js LTS (offline MSI from USB if needed)
- [ ] Install MongoDB Community or use SQLite file
- [ ] Copy `dist/` + `shop-server/` to server
- [ ] Configure `.env`: `BRANCH_ID`, `STORE_ID`, Firebase sync keys
- [ ] Set static LAN IP (e.g. `192.168.1.100`)
- [ ] Run API with **PM2** or Windows Service (auto-start on boot)
- [ ] Test: `http://192.168.1.100:8080` and `http://192.168.1.100:3001/health`

### Phase 2 — Each biller / cashier PC (~5 minutes)

- [ ] Install Chrome or Edge (offline installer from USB)
- [ ] Connect to **same shop WiFi / LAN**
- [ ] Bookmark or install PWA: `http://192.168.1.100:8080`
- [ ] Login with biller or cashier account
- [ ] **Do not** install Node.js or VS Code on these PCs

### Phase 3 — Manager / Super Admin

- [ ] Use Firebase-hosted URL (internet required)
- [ ] No shop server needed on manager PC
- [ ] Can work from home / head office

---

## 10. USB Install Kit (no internet on shop PCs)

Prepare once on a machine with internet:

```
USB: AOnePOS-Install-Kit/
├── installers/
│   ├── node-v20-lts-x64.msi
│   ├── mongodb-community-installer.msi   (or skip if SQLite)
│   ├── ChromeStandaloneSetup.exe
│   └── pm2-setup-notes.txt
├── app/
│   ├── dist/                    # npm run build output
│   └── shop-server/             # Node API (when ready)
├── config/
│   ├── .env.example
│   └── branch-lahore.env
└── INSTALL-GUIDE-URDU.md        # printed steps for shop staff
```

### First-time without internet

| Item | How |
|------|-----|
| Node.js, Chrome, MongoDB | USB offline installers |
| App files (`dist/`) | USB copy |
| Firebase (manager only) | Needs internet on manager PC |

---

## 11. Firebase sync (shop → cloud)

When shop internet is available, background job on **shop server**:

```javascript
// Pseudocode — runs every 1–5 min or on reconnect
async function syncBranchToFirebase() {
  const pendingOrders = await db.orders.find({ syncedToFirebase: false });
  for (const order of pendingOrders) {
    await firestore.collection('orders').doc(order._id).set({ ...order, branchId });
    await db.orders.updateOne({ _id: order._id }, { syncedToFirebase: true });
  }
  // Repeat for payments, activity logs, etc.
}
```

Manager and Super Admin **only read Firebase** — they do not need shop LAN access.

---

## 12. Planned shop API endpoints

> To be implemented in `shop-server/` (future phase).

| Method | Endpoint | Used by |
|--------|----------|---------|
| `GET` | `/health` | Setup test |
| `POST` | `/api/auth/login` | Biller, Cashier |
| `GET` | `/api/orders/pending` | Cashier |
| `POST` | `/api/orders` | Biller |
| `GET` | `/api/orders/by-serial/:serial` | Cashier offline pay |
| `POST` | `/api/payments` | Cashier |
| `PATCH` | `/api/orders/:id/cancel` | Cashier |
| `POST` | `/api/sync/firebase` | Shop server (background) |

---

## 13. Cost estimate (PKR / USD rough)

| Item | Cost |
|------|------|
| VS Code, Node.js, MongoDB, SQLite | Free |
| Firebase (manager) | Free tier → ~$0–25/mo small shop |
| Buy third-party API | **Not required** |
| Shop server PC | ~15,000–40,000 PKR (old PC works) |
| LAN router | Usually already in shop |
| Developer time (LAN API + sync) | One-time ~3–5 weeks |

---

## 14. Implementation roadmap

| Phase | Work | Duration |
|-------|------|----------|
| **1** | Shop Node API + SQLite/MongoDB (`orders`, `payments`, `users`) | ~1 week |
| **2** | Biller `saveOrder` → local API (Dexie as optional cache) | ~1 week |
| **3** | Cashier pending list + pay → local API | ~1 week |
| **4** | Background sync shop DB → Firebase | ~3–5 days |
| **5** | USB install kit + per-branch setup doc | ~2 days |
| **6** | Optional Electron `.exe` installer | ~1 week |

### Quick win (no LAN server yet)

Same branch, same WiFi — test production build on LAN:

```bash
npm run build
npx serve -s dist -l 8080
# Other PCs: http://<YOUR-LAN-IP>:8080
```

See also: `npm run dev:network` for developer LAN testing only.

---

## 15. FAQ

**Q: Har branch mein alag server chahiye?**  
A: Haan — har physical shop ka apna LAN server. Super Admin Firebase se sab branches dekhta hai.

**Q: Cashier ghar se kaam kare?**  
A: Shop floor roles (biller/cashier) shop LAN se. Manager / Super Admin kahin se (internet + Firebase).

**Q: MongoDB ya SQLite?**  
A: Chhote shops → SQLite. Zyada branches / data → MongoDB.

**Q: Firebase completely hata dein?**  
A: Manager / Super Admin ke liye **mat hatao**. Sirf biller/cashier ko local LAN par shift karo.

**Q: Kya abhi code mein LAN server hai?**  
A: **Partial** — offline-first Dexie + Firebase sync exists. Full LAN API is **planned** (this doc is the blueprint).

**Q: Clerk auth ka kya?**  
A: Hybrid possible — shop local JWT for biller/cashier; Firebase/Clerk for manager (to be decided in implementation).

---

## 16. Security checklist (shop LAN)

- [ ] Shop API only listens on LAN (`192.168.x.x`), not public internet
- [ ] JWT or session tokens for biller/cashier login
- [ ] Firebase rules unchanged for manager paths
- [ ] HTTPS on Firebase hosting; LAN HTTP acceptable inside trusted shop network
- [ ] Daily backup of shop DB to USB or cloud when online

---

## 17. One-line summary

> **Shop PCs = browser + installed app only (no VS Code / npm).**  
> **No paid API — free shop server + MongoDB/SQLite on LAN.**  
> **Biller + Cashier = offline multi-PC per branch.**  
> **Manager + Super Admin = Firebase online, all branches.**

---

## 18. Document history

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | June 2026 | Initial hybrid offline deployment guide |
