# Naya System — Poora Plan + Cursor AI Prompts (Beginner)

> **Aap ka goal:** Purane POS (Firebase) se data nikalo → **Hostinger VPS + PostgreSQL** par naya admin/manager system  
> **Firebase naye system mein NAHI**  
> **UI same** rakho (purani app jaisa admin + manager)  
> **Super Admin** = sab branches · **Manager** = sirf apni branch  
> **Aap ka kaam:** Sirf prompts copy-paste + Hostinger VPS order + final testing  
> **Baaki sab:** Cursor AI se karwao (neeche har step ka ready prompt hai)

---

## Pehle 3 sawal — seedha jawab

### 1) Kya Setup page banana hoga?

| Situation | Setup page? |
|-----------|-------------|
| **Data migrate kar rahe ho** (purane POS se export) | **Zaroori NAHI** — pehle data import, phir Super Admin ko password reset |
| **Bilkul naya server, koi user nahi** | **Haan, ek dafa** — sirf pehla Super Admin + shop name (purane `SetupPage` jaisa simple) |

**Recommendation (aap ke case mein):** Export file se `users` + `stores` import karo → Setup page **skip** karo → login page se Super Admin / Manager login (naya password set karke).

### 2) Kya Auth / Login same banana hoga?

**Haan** — same look (dark + amber glass UI), lekin:

- Sirf roles: **`superAdmin`** aur **`manager`**
- Login → **JWT session** (PostgreSQL users table) — Firebase Auth **nahi**
- Biller / Cashier login **naye app mein nahi**

### 3) UI same kaise rakhenge?

Purani repo se **copy** karo (CSS + components), Firebase hata kar **API** lagao:

| Copy from old repo | Use in new repo |
|--------------------|-----------------|
| `src/components/shared/glassUiTheme.js` | Same |
| `src/components/ui/*` | Same |
| `src/components/admin/*` (sidebar, header, StatCard) | Admin shell |
| `src/components/manager/*` | Manager shell |
| `src/pages/admin/*` (reports, cashflow, customers, bills) | Wire to API |
| `src/pages/manager/*` | Wire to API + branch filter |
| `src/styles/index.css` | Same theme |

**Purana POS (biller/cashier)** alag chalta rahega jab tak replace na karo.

---

## Big picture (ek line mein)

```
[Purana POS - Firebase]  --export JSON-->  [Import Script]  -->  [PostgreSQL on VPS]
                                                                  ↑
[Naya React App - same UI]  ----REST API (JWT)-------------------┘
```

---

## Aap vs Cursor AI — kaun kya karega

| Kaam | Aap | Cursor AI |
|------|-----|-----------|
| Migration JSON download | ✓ 5 minute | — |
| Hostinger VPS order | ✓ panel se | Prompt se server setup script |
| Naya GitHub repo | ✓ empty repo banao | Poora code likhe |
| PostgreSQL tables | — | ✓ migrations SQL |
| Backend API | — | ✓ Node + Express/Fastify |
| Frontend (same UI) | — | ✓ copy + API wire |
| Import purana data | — | ✓ `scripts/import-from-json.ts` |
| Deploy VPS | ✓ domain point karo | ✓ nginx + pm2 config |
| Rozana billing | Purana POS chalta rahe | — |

---

# PHASE 0 — Data export (purane POS se) — AAP

### Aap kya karein (15 min)

1. Purane app mein **Super Admin** login  
2. **Admin → Backup aur Export → Migrate aur Archive**  
3. **JSON Download**  
4. File save: `aone_migration_YYYY-MM-DD.json`  
5. **2 jagah backup** (PC + Google Drive)  
6. File kholo → `collectionCounts` dekho kitna data hai  

> Agar kisi collection mein **2500+** records hon to AI ko bolo bulk export script banaye.

### Cursor prompt — agar export limit issue ho

```
Purane repo D:\Advance_POS\aone-jewelry-pos mein backupService.js check karo.
Migration export ab 2500 records per collection limit hai.
Mujhe ek script banao jo Firebase se saari orders, customers, users, stores
pagination se export karke ek bari migration JSON file banaye.
Super Admin credentials .env se read hon. Beginner-friendly README Roman Urdu mein.
```

---

# PHASE 1 — Naya project repo — CURSOR

### Naya folder / repo

Hostinger par deploy karne ke liye alag repo best hai, maslan: `aone-admin-vps`

### Cursor prompt 1.1 — project scaffold

```
Naya monorepo banao (alag folder ya sibling repo):

aone-admin-vps/
  apps/
    web/          # React 19 + Vite — UI purane aone-jewelry-pos jaisa
    api/          # Node 20 + Express + PostgreSQL (pg)
  packages/
    shared/       # types, constants
  scripts/
    import-from-migration-json.js
  docker-compose.yml   # local dev: postgres
  README.md

Reference UI repo: D:\Advance_POS\aone-jewelry-pos
Copy glass theme, ui components, admin sidebar, manager layout — same look.
NO Firebase in new project. Use JWT auth.

Roles: only superAdmin and manager.
Super Admin: all branches. Manager: branch_id filter on every query.

Roman Urdu comments in README for beginner.
```

---

# PHASE 2 — PostgreSQL schema — CURSOR

### Cursor prompt 2.1 — database design

```
apps/api mein PostgreSQL migrations banao (node-pg-migrate ya raw SQL files).

Tables (minimum):
- tenants (id, name) — default 'aone'
- branches (id, code, name, is_active) — map from Firebase stores
- users (id, email, password_hash, role, branch_id nullable, name, is_active)
  - superAdmin: branch_id NULL
  - manager: branch_id required
- customers (id, branch_id, name, phone, email, city, visit_count, total_spent, raw_json jsonb)
- orders (id, branch_id, serial_no, customer_id, status, amounts, payment_status, saved_at, raw_json jsonb)
- order_items (id, order_id, product_name, price, qty, discount, ...) — from bill line items if needed
- payments (id, order_id, branch_id, amount, method, created_at, raw_json jsonb)
- expenses, returns, activity_logs (optional, raw_json jsonb for extra fields)

HAR table jisme business data hai usme branch_id index.
Document mapping from migration JSON:
  collections.stores -> branches
  collections.users -> users (role filter: superAdmin, manager only)
  collections.customers -> customers
  collections.orders -> orders

Include seed.sql example for one super admin (password: change on first login).
```

---

# PHASE 3 — Import script (export JSON → PostgreSQL) — CURSOR

### Cursor prompt 3.1 — importer

```
scripts/import-from-migration-json.js banao.

Input: path to aone_migration_*.json (format from backupService buildMigrationExportPayload)
Order: branches -> users -> customers -> orders -> payments

Rules:
- Map storeId / primaryStore / branchId fields to branches.id
- Import only users with role superAdmin or manager (skip biller/cashier)
- users.password_hash: generate random temp password OR bcrypt placeholder — log emails to reset-passwords.txt
- orders: dedupe — prefer collections.orders; add tables.orders only if firebaseId missing in cloud set
- Store full original object in raw_json column
- CLI: node scripts/import-from-migration-json.js --file ./data/migration.json --database-url postgres://...

Roman Urdu usage instructions in script header comment.
Dry-run mode: --dry-run counts only.
```

### Aap kya karein import ke baad

1. AI se report lo: kitni branches, users, orders import hue  
2. Purane POS **Reports** se ek din ka total compare karo  

---

# PHASE 4 — Backend API — CURSOR

### Cursor prompt 4.1 — API + auth

```
apps/api Express server banao:

POST /auth/login { email, password } -> JWT { userId, role, branchId }
GET  /auth/me -> current user

Middleware:
- authenticate JWT
- requireRole('superAdmin' | 'manager')
- branchScope: if manager, force branch_id = user.branchId on all reads/writes

Endpoints (manager auto-filtered):
GET /dashboard/summary?from=&to=
GET /orders?page=&limit=&from=&to=&status=
GET /orders/:id
GET /customers?search=&page=
GET /cashflow/snapshot?from=&to=
GET /reports/sales?from=&to=&groupBy=day
GET /branches (superAdmin only)

PostgreSQL parameterized queries only. No Firebase.

.env.example: DATABASE_URL, JWT_SECRET, PORT=3001
```

### Cursor prompt 4.2 — deploy API on VPS

```
Hostinger Ubuntu VPS ke liye deploy docs banao:
- install node 20, postgresql, nginx, pm2
- nginx reverse proxy api.domain.com -> localhost:3001
- certbot SSL
- pm2 ecosystem.config.js for apps/api
- environment variables secure setup

Beginner step-by-step Roman Urdu in docs/DEPLOY_HOSTINGER.md
```

---

# PHASE 5 — Frontend (same UI, no Firebase) — CURSOR

### Cursor prompt 5.1 — copy UI + wire API

```
apps/web mein purane repo se copy karo (same UI):
- src/styles/index.css
- components/ui, shared/glassUiTheme, admin/AdminSidebar, AdminHeader, manager/ManagerPageLayout
- pages/admin: DashboardHome, ReportsAnalytics, CashFlowMonitor, CustomersControl, BillsControl
- pages/manager: Dashboard, Reports, CashFlow, Customers, Bills (wrappers)

REMOVE: biller, cashier, firebase, dexie, sync workers, setup firebase guard.

ADD:
- src/api/client.js — fetch with JWT from localStorage
- src/context/AuthContext.jsx — login via POST /auth/login, no Firebase
- src/utils/branchScope.js — manager cannot change branch filter

LoginPage: same visual design as old LoginPage.jsx but only role select superAdmin/manager if needed (or auto-detect from API).

Routes:
  /login
  /admin/*  (superAdmin + optional admin)
  /manager/* (manager only)

Replace every Firestore call with api client calls.
Keep Roman Urdu i18n from lang/ur.json where exists.

Do not break styling — pixel-close to old admin/manager.
```

### Cursor prompt 5.2 — Setup page decision

```
Migration case: Setup page SKIP.
Agar users table empty ho (fresh install) tab hi /setup dikhao — sirf:
  - shop name, first super admin email/password
  - POST /auth/bootstrap (one-time, disabled after first user)

Otherwise /login redirect.
Implement setupGuard via GET /auth/setup-status.
Document in README Roman Urdu.
```

---

# PHASE 6 — Role rules (Super Admin vs Manager) — CURSOR verify

### Cursor prompt 6.1 — security audit

```
Naye repo mein security audit karo:

1. Manager kabhi dusri branch ka order/customer na dekh sake — API level test
2. Super Admin branch filter optional — all branches
3. JWT branchId manager ke liye tamper-proof (client se branchId accept mat karo)
4. List all API routes with required role

Vitest integration tests for branch isolation.
Roman Urdu summary of findings.
```

---

# PHASE 7 — Testing checklist — AAP + CURSOR

### Aap manually (30 min)

| # | Test |
|---|------|
| 1 | Super Admin login |
| 2 | Dashboard total = purane POS se match (same date) |
| 3 | Manager login — sirf 1 branch bills |
| 4 | Manager URL hack se dusri branch ID — **fail hona chahiye** |
| 5 | Customers search |
| 6 | Reports / cash flow export |

### Cursor prompt 7.1 — test script

```
E2E test plan + optional Playwright tests for:
- superAdmin sees all branches count >= manager single branch count
- login flows
Document in docs/TESTING_NEW_SYSTEM.md Roman Urdu
```

---

# PHASE 8 — Go live — AAP

1. Domain point karo VPS IP par (Hostinger DNS)  
2. HTTPS on karo (Certbot)  
3. Managers ko **naya URL** + **temp password**  
4. Purana POS biller/cashier ke liye **chalta rahe**  
5. 2 hafta parallel — roz totals match  

### Cursor prompt 8.1 — production checklist

```
Production go-live checklist banao Roman Urdu:
- backup PostgreSQL daily cron
- .env secrets
- CORS only your domain
- rate limit login
- migration rollback plan
File: docs/GO_LIVE_CHECKLIST.md
```

---

# Quick reference — Purane export file structure

```json
{
  "collections": {
    "stores": [ { "_docId": "...", "name": "...", "code": "..." } ],
    "users": [ { "_docId": "...", "email": "...", "role": "manager", "primaryStore": "..." } ],
    "customers": [ ... ],
    "orders": [ ... ],
    "payments": [ ... ]
  },
  "tables": {
    "orders": [ /* local offline bills */ ],
    "customers": [ ... ]
  },
  "collectionCounts": { "orders": 1200, "customers": 300 }
}
```

---

# Prompt order — ek hafta mein AI se banwane ka tareeqa

| Din | Cursor mein yeh prompt chalao |
|-----|-------------------------------|
| 1 | Prompt 1.1 (scaffold) |
| 2 | Prompt 2.1 (PostgreSQL) + docker local test |
| 3 | Prompt 3.1 (import script) + apni migration JSON import |
| 4 | Prompt 4.1 (API) |
| 5 | Prompt 5.1 + 5.2 (frontend same UI) |
| 6 | Prompt 6.1 (security) + Prompt 7.1 (tests) |
| 7 | Prompt 4.2 + 8.1 (deploy VPS) + manual testing |

**Har prompt alag Cursor chat mein chala sakte ho** — pehle wala complete hone do, phir agla.

---

# Aap ko sirf yeh yaad rakhna hai

1. **Export file** = purana sara data (JSON)  
2. **PostgreSQL** = naya database (Firebase nahi)  
3. **branch_id** = manager sirf apni branch  
4. **Super Admin** = branch_id null / no filter  
5. **UI** = purani repo copy + API  
6. **Setup page** = migration mein skip; fresh install par ek dafa  
7. **Login** = same design, JWT, sirf superAdmin + manager  
8. **Cursor** = har step ka prompt upar copy-paste  

---

# Related files (purani repo)

| File | Kaam |
|------|------|
| `docs/MIGRATION_POSTGRESQL_STEP_ZERO.md` | Short migration intro |
| `src/services/backupService.js` | Export format |
| `src/utils/branchAccess.js` | Branch logic reference |
| `src/pages/admin/*` | Admin UI copy source |
| `src/pages/manager/*` | Manager UI copy source |

---

*Is document ko naye repo ki `docs/` mein bhi copy kar dena jab Cursor scaffold bana de.*
