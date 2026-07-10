# ZERO SE LIVE — Full AI Master Chat Guide

> **Roman Urdu · Beginner · Step by step**  
> Purana POS: `aone-jewelry-pos` (Firebase)  
> Naya system: `aone-admin-platform` (Hostinger VPS + PostgreSQL + Node.js + JWT)  
> **UI:** purani jaisi layout + functions, thori **modern stylish** colors  
> **Language:** Urdu + English · **Theme:** Light + Dark

---

## Pehle yeh 2 minute mein samajh lo

| Cheez | Kya hai |
|-------|---------|
| **Purana POS** | Dukan billing — biller/cashier — Firebase — **band mat karo** |
| **Naya system** | Super Admin + Manager admin panel — PostgreSQL — Hostinger VPS |
| **Export** | Purane POS → Backup → Migrate tab → JSON/ZIP (**MANUAL**) |
| **Import** | Naye server par script se PostgreSQL mein (**MANUAL**) |
| **AI ka kaam** | Code likhna, folder banana, database, API, UI clone |
| **Aap ka kaam** | VPS order, SSH login, prompts copy-paste, testing |

```
[Purana POS Firebase]  --export JSON-->  [Aap ka PC]  --import-->  [VPS PostgreSQL + Node API + React UI]
```

---

# PART A — AAP KE STEPS (ZERO SE) — Ek ek qadam

> Har step ke baad ✓ lagao jab ho jaye.

---

## STEP 0 — Tayyari (aaj — 30 minute)

### 0.1 — Accounts banao / check karo

| # | Account | Kyon |
|---|---------|------|
| 1 | **GitHub** | Naya code repo |
| 2 | **Hostinger** | VPS server |
| 3 | **Domain** (optional) | `admin.aonejewelry.com` jaisa naam |
| 4 | **Cursor** | AI coding |

### 0.2 — Purane POS se data export

1. Super Admin login  
2. **Admin → Backup & Restore**  
3. Tab **Jaiza** → **Poora ZIP** download (har module alag folder)  
4. Tab **Migrate** → **Migration JSON** download  
5. Dono files **2 jagah** save karo (PC + USB/Drive)

### 0.3 — Export check

File kholo — dekho:
- `collections.stores` — branches
- `collections.users` — staff
- `collections.orders` — bills count
- `collectionCounts` — har table kitni rows

✓ **Step 0 done** jab export safe ho.

---

## STEP 1 — GitHub repo (15 minute)

### 1.1 — Naya repo banao

1. GitHub.com → **New repository**  
2. Name: `aone-admin-platform`  
3. Private rakho  
4. README add mat karo (AI scaffold karega)  
5. **Create**

### 1.2 — Local folder (Windows)

```powershell
cd D:\Advance_POS
mkdir aone-admin-platform
cd aone-admin-platform
git init
git remote add origin https://github.com/YOUR_USERNAME/aone-admin-platform.git
```

### 1.3 — Pehla AI prompt (Cursor mein naya chat)

**Naya Cursor chat kholo** → poora **PROMPT M1** neeche copy karo → paste → Enter.

AI repo scaffold karega. Jab complete ho:

```powershell
cd D:\Advance_POS\aone-admin-platform
git add .
git commit -m "Initial scaffold: monorepo api + web"
git branch -M main
git push -u origin main
```

✓ **Step 1 done** jab GitHub par code dikhe.

---

## STEP 2 — Local test (aapke PC par — 20 minute)

Docker Desktop install ho to:

```powershell
cd D:\Advance_POS\aone-admin-platform
docker compose up -d
cd apps\api
copy .env.example .env
# .env mein DATABASE_URL edit karo
npm install
npx prisma migrate dev
npm run dev
```

Dusri terminal:

```powershell
cd D:\Advance_POS\aone-admin-platform\apps\web
copy .env.example .env
npm install
npm run dev
```

Browser: `http://localhost:5173`

✓ **Step 2 done** jab local login page khule.

---

## STEP 3 — Hostinger VPS order (aap — 20 minute)

### 3.1 — Plan

| Item | Recommendation |
|------|----------------|
| Type | KVM VPS |
| OS | **Ubuntu 22.04 LTS** |
| RAM | 4 GB (shuruat) — 8 GB better |
| CPU | 2 vCPU |
| Location | Karachi/Singapore (Pakistan ke qareeb) |

### 3.2 — Order ke baad note karo

Likh lo safe jagah:

```
VPS IP:        ___________________
Root password: ___________________
SSH port:      22 (default)
```

✓ **Step 3 done** jab VPS "Running" ho.

---

## STEP 4 — VPS par software install (copy-paste — 30 minute)

### 4.1 — SSH login (Windows PowerShell)

```powershell
ssh root@YOUR_VPS_IP
```

Pehli dafa "yes" type karo.

### 4.2 — Bootstrap script (sab ek saath)

Neeche **poora block** copy karo → VPS terminal mein paste → Enter:

```bash
#!/bin/bash
set -e

echo "=== A One Admin Platform — VPS Bootstrap ==="

apt update && apt upgrade -y

# Firewall
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

# Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs git

# PostgreSQL
apt install -y postgresql postgresql-contrib

# PM2
npm install -g pm2

# Nginx + SSL tool
apt install -y nginx certbot python3-certbot-nginx

# App user
useradd -m -s /bin/bash aoneapp 2>/dev/null || true

# PostgreSQL database
sudo -u postgres psql <<'EOSQL'
CREATE USER aone WITH PASSWORD 'CHANGE_THIS_STRONG_PASSWORD';
CREATE DATABASE aone_admin OWNER aone;
GRANT ALL PRIVILEGES ON DATABASE aone_admin TO aone;
EOSQL

echo "=== Done ==="
node -v
psql --version
nginx -v
```

**⚠️ `CHANGE_THIS_STRONG_PASSWORD` ko apna strong password se badlo!**

### 4.3 — Verify

```bash
node -v          # v20.x
psql --version   # 14+ ya 16
nginx -t         # syntax ok
```

✓ **Step 4 done**.

---

## STEP 5 — GitHub se VPS par code (15 minute)

VPS par (root ya aoneapp user):

```bash
# App folder
mkdir -p /var/www
cd /var/www

# Clone (apna GitHub URL)
git clone https://github.com/YOUR_USERNAME/aone-admin-platform.git
cd aone-admin-platform

# API env
cd apps/api
cp .env.example .env
nano .env
```

`.env` mein yeh set karo:

```env
NODE_ENV=production
PORT=3001
DATABASE_URL=postgresql://aone:YOUR_PASSWORD@localhost:5432/aone_admin
JWT_SECRET=random-long-string-min-32-chars
JWT_REFRESH_SECRET=another-random-long-string
CORS_ORIGIN=https://admin.yourdomain.com
```

Save: `Ctrl+O` → Enter → `Ctrl+X`

```bash
npm ci
npx prisma migrate deploy
npm run build

# Web build
cd ../web
cp .env.example .env
nano .env
```

Web `.env`:

```env
VITE_API_URL=https://api.yourdomain.com/api
```

```bash
npm ci
npm run build
```

✓ **Step 5 done** jab build error na ho.

---

## STEP 6 — PM2 + Nginx + SSL (30 minute)

### 6.1 — PM2 start API

```bash
cd /var/www/aone-admin-platform
pm2 start ecosystem.config.js
pm2 save
pm2 startup
# jo command print ho woh copy karke chalao
```

### 6.2 — Nginx config

```bash
nano /etc/nginx/sites-available/aone-admin
```

Paste:

```nginx
# API
server {
    listen 80;
    server_name api.yourdomain.com;
    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        client_max_body_size 50M;
    }
}

# Web (React)
server {
    listen 80;
    server_name admin.yourdomain.com;
    root /var/www/aone-admin-platform/apps/web/dist;
    index index.html;
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

```bash
ln -s /etc/nginx/sites-available/aone-admin /etc/nginx/sites-enabled/
nginx -t
systemctl reload nginx
```

### 6.3 — DNS (Hostinger ya domain panel)

| Type | Name | Value |
|------|------|-------|
| A | admin | VPS_IP |
| A | api | VPS_IP |

5–60 minute wait.

### 6.4 — SSL (HTTPS)

```bash
certbot --nginx -d admin.yourdomain.com -d api.yourdomain.com
```

✓ **Step 6 done** jab `https://admin.yourdomain.com` khule.

---

## STEP 7 — Data import (MANUAL — developer/AI)

1. Migration JSON VPS par upload karo:

```bash
mkdir -p /var/www/aone-admin-platform/data
# scp se PC se file bhejo:
# scp D:\backup\aone_migration.json root@VPS_IP:/var/www/aone-admin-platform/data/migration.json
```

2. Import script chalao (AI M3 se banega):

```bash
cd /var/www/aone-admin-platform
npm run migrate:dry-run    # pehle count check
npm run migrate            # asli import
npm run migrate:verify     # purane POS se match
```

✓ **Step 7 done** jab counts match hon.

---

## STEP 8 — Go live checklist

| # | Test | Pass? |
|---|------|-------|
| 1 | Super Admin login | ☐ |
| 2 | Manager login (apni branch) | ☐ |
| 3 | Manager dusri branch **nahi** dekhe | ☐ |
| 4 | Bills count match purane POS | ☐ |
| 5 | Customers search | ☐ |
| 6 | Reports / cash flow | ☐ |
| 7 | Urdu language switch | ☐ |
| 8 | Dark mode toggle | ☐ |
| 9 | Setup page (pehli dafa) skip after import | ☐ |
| 10 | Purana POS abhi bhi billing ke liye chal raha | ☐ |

**2 hafta parallel** chalao → phir managers ko naya URL do.

---

# PART B — FOLDER STRUCTURE (AI banayega)

```
aone-admin-platform/
├── apps/
│   ├── api/                          # Node.js Express API
│   │   ├── prisma/
│   │   │   ├── schema.prisma         # PostgreSQL tables
│   │   │   └── migrations/
│   │   ├── src/
│   │   │   ├── index.ts              # Server start
│   │   │   ├── routes/               # auth, orders, customers...
│   │   │   ├── middleware/           # JWT, branchScope, roles
│   │   │   ├── services/
│   │   │   └── repositories/
│   │   ├── .env.example
│   │   └── package.json
│   │
│   └── web/                          # React Vite frontend
│       ├── src/
│       │   ├── api/client.js         # JWT API calls (Firebase NAHI)
│       │   ├── context/              # Auth, Theme, Language
│       │   ├── components/           # admin + manager (old POS se copy)
│       │   ├── pages/
│       │   │   ├── auth/LoginPage.jsx
│       │   │   ├── setup/SetupPage.jsx
│       │   │   ├── admin/*
│       │   │   └── manager/*
│       │   ├── styles/
│       │   │   ├── index.css
│       │   │   └── theme-modern.css  # naye modern colors
│       │   └── lang/en.json, ur.json
│       ├── .env.example
│       └── package.json
│
├── packages/
│   └── shared/                       # Types, constants, role enums
│
├── scripts/
│   ├── migrate-from-firebase-json.ts # Import purane export se
│   ├── verify-migration.ts
│   ├── rollback-migration.ts
│   └── vps/
│       ├── 01-bootstrap.sh
│       ├── backup-db.sh
│       └── deploy.sh
│
├── data/
│   └── migration.json                # (gitignore) export file yahan
│
├── docker-compose.yml                # Local PostgreSQL
├── ecosystem.config.js               # PM2
├── nginx/
│   ├── api.conf
│   └── web.conf
├── .gitignore
└── README.md
```

---

# PART C — FULL AI MASTER PROMPTS (COPY-PASTE)

> **Rule:** Har prompt **alag nayi Cursor chat** ya same chat mein **ek ke baad ek**.  
> Pehla complete hone do, phir agla paste karo.  
> Old repo path: `D:\Advance_POS\aone-jewelry-pos`  
> New repo path: `D:\Advance_POS\aone-admin-platform`

---

## PROMPT M0 — Purana export (agar data zyada ho)

```
Repo: D:\Advance_POS\aone-jewelry-pos

Read src/services/backupService.js — buildMigrationExportPayload, EXPORT_MODULE_KEYS, downloadAllModulesSeparatedZip.

Agar Firebase per-collection 2500 limit issue ho to:
1. scripts/export-full-migration.js banao — pagination se FULL export
2. Roman Urdu README: docs/EXPORT_FULL_MIGRATION.md
3. Output: migration_FULL_YYYY-MM-DD.json with collectionCounts in meta

User manually chalayega — auto background export nahi.
```

---

## PROMPT M1 — Monorepo scaffold + GitHub ready

```
Read docs/master/00-MASTER-INDEX.md, 01-ARCHITECTURE-DECISIONS.md, and 09-ZERO-TO-LIVE-FULL-MASTER-CHAT.md Part B folder structure.

Create D:\Advance_POS\aone-admin-platform (sibling to aone-jewelry-pos):

STRUCTURE (exact):
- apps/api — Node 20, Express, TypeScript, Prisma, PostgreSQL
- apps/web — React 19, Vite, Tailwind (optional), same component style as old POS
- packages/shared — types, role constants, branch helpers
- scripts/ — migrate, verify, rollback, vps/
- docker-compose.yml — postgres:16, port 5432
- ecosystem.config.js — PM2 for production
- nginx/api.conf, nginx/web.conf templates
- .env.example for api and web
- .gitignore — node_modules, .env, data/*.json
- README.md — Roman Urdu beginner section + English summary

RULES:
- NO Firebase anywhere in new repo
- Auth: JWT (access + refresh), bcrypt passwords
- Roles: SUPER_ADMIN, MANAGER only (no biller/cashier in new app)
- npm workspaces or simple multi-package
- TypeScript in API, JSX in web

After scaffold: npm install at root, docker compose up works, README has git push steps.
```

---

## PROMPT M2 — PostgreSQL database (Prisma)

```
In D:\Advance_POS\aone-admin-platform\apps\api:

Read docs/master/02-DATABASE-MIGRATION.md fully.

Implement Prisma schema with:
- tenants, businesses, branches
- users (passwordHash, role, branchId nullable for super admin)
- customers, orders, order_items
- payments, expenses, returns
- activity_logs, daily_summaries
- notifications, archive_records, migration_logs
- settings (key-value JSON per business)

Every business table: branch_id where applicable.
Indexes: orders(branch_id, saved_at), customers(branch_id), users(email unique).

Run: npx prisma migrate dev --name init
Add scripts/seed-dev.ts — ONE super admin for local only (env SEED_PASSWORD).
Add npm scripts: db:migrate, db:seed, db:studio

Roman Urdu comments in seed file.
```

---

## PROMPT M3 — Import script (purane JSON se PostgreSQL)

```
Read docs/master/02-DATABASE-MIGRATION.md migration section.
Read old repo: src/services/backupService.js buildMigrationExportPayload output format.

In aone-admin-platform create scripts/migrate-from-firebase-json.ts:

INPUT: data/migration.json (from old POS Backup → Migrate tab)

STEPS:
1. Pre-import pg_dump backup → backups/pre-migration-{timestamp}.sql.gz
2. --dry-run mode: only print counts, no writes
3. Import ORDER (foreign keys):
   branches (from collections.stores)
   users (only superAdmin + manager roles; bcrypt temp password)
   customers, orders (+ order_items from bill lines)
   payments, expenses, returns, activity_logs, settings
4. Map storeId/primaryStore → branch_id
5. Save legacy_firestore_id on each row + raw_json JSONB for unmapped fields
6. Dedupe orders: serialNo primary, skip Dexie duplicates if cloud exists
7. Write reports/migration-{date}.json (imported, skipped, errors)
8. scripts/verify-migration.ts — compare counts vs export meta
9. scripts/rollback-migration.ts — restore from backup

npm scripts:
  migrate:dry-run, migrate, migrate:verify, migrate:rollback, db:backup

Roman Urdu README: scripts/README-MIGRATE.md
MANUAL only — no auto import on server start.
```

---

## PROMPT M4 — JWT Auth + Setup Page API

```
In apps/api per docs/master/03-API-BACKEND.md:

AUTH ROUTES:
- POST /api/auth/login { email, password } → { accessToken, user: { id, role, branchId, name } }
- POST /api/auth/refresh
- POST /api/auth/logout
- GET  /api/auth/me
- POST /api/auth/change-password
- POST /api/auth/forgot-password, /reset-password (email optional stub)

MIDDLEWARE:
- authenticate — verify JWT
- requireRole('SUPER_ADMIN' | 'MANAGER')
- branchScope — manager queries ALWAYS filter branch_id from token, NEVER trust client branchId param for scope

SETUP (first run):
- GET /api/setup/status → { needsSetup: boolean }
  needsSetup = false if branches>=1 AND users>=1 (migration import done)
- POST /api/setup/bootstrap — ONLY when needsSetup=true AND DB empty:
  { businessName, branchName, branchCode, adminEmail, adminPassword, shopPhone, currency }
  Creates first business, branch, super admin user

SECURITY:
- bcrypt cost 12
- JWT_SECRET from env
- rate limit login 10/min per IP
- helmet, cors from CORS_ORIGIN env

Vitest tests:
- manager token cannot GET orders from other branch_id
- setup/bootstrap blocked after data exists

Roman Urdu error messages optional via Accept-Language header.
```

---

## PROMPT M5 — REST APIs (saari functionality purani jaisi)

```
In apps/api implement ALL routes from docs/master/03-API-BACKEND.md:

MODULES:
- /api/businesses, /api/branches
- /api/users (CRUD, super admin only for create/delete)
- /api/customers (list, search, CRUD, archive soft-delete)
- /api/orders (list, detail, filters: date, branch, status, serial)
- /api/payments, /api/expenses, /api/returns
- /api/reports/dashboard, /api/reports/sales, /api/reports/cashflow
- /api/activity-logs
- /api/archive (list, restore, permanent delete super admin only)
- /api/notifications
- GET /api/health (db ping)

PATTERNS:
- routes → services → repositories → Prisma
- Zod validation on body/query
- Pagination: ?page=1&limit=50
- branchScope on every list endpoint
- Super admin: optional ?branchId= filter
- Manager: ignore client branchId, use token.branchId

Match business logic from old repo:
- branchAccess.js rules
- managerService.js report calculations
- billsFilterUtils.js filter ideas

No Firebase. Full OpenAPI comment or README endpoint list.
```

---

## PROMPT M6 — Frontend UI (same layout, modern colors, JWT)

```
In apps/web clone from D:\Advance_POS\aone-jewelry-pos per docs/master/04-FRONTEND-UI.md BUT with MODERN STYLISH theme:

COPY (same layout & UX):
- src/components/admin/* (Sidebar, Header, StatCard, DataTable patterns)
- src/components/manager/*
- src/components/shared/glassUiTheme.js (BASE — then modernize)
- src/components/ui/*
- src/context/ThemeContext.jsx, LanguageContext.jsx
- src/lang/en.json, ur.json (admin/manager keys; trim biller/cashier)
- src/pages/admin/* (dashboard, bills, customers, cashflow, reports, backup concept → data export via API)
- src/pages/manager/*
- src/hooks/useLanguage.js, useKeyboardShortcuts.js where needed

MODERN THEME (src/styles/theme-modern.css):
- Keep glass morphism layout SAME (sidebar left, header top, cards, tables)
- Update color palette ONLY:
  - Primary: deep gold/amber → slightly richer #D4A017 / #B8860B
  - Accent: subtle teal or emerald highlights for active states
  - Dark mode: #0f0f12 background, softer borders, better contrast
  - Light mode: warm off-white #FAF8F5, cleaner shadows
  - Rounded corners + subtle hover animations (150ms)
- Fonts: same or Inter + Noto Nastaliq Urdu for ur

DO NOT CHANGE:
- Page structure, sidebar menu order, table columns, button positions
- All features manager/admin had in old POS for reports/bills/customers

REPLACE Firebase:
- src/api/client.js — fetch/axios, JWT in memory + httpOnly refresh cookie
- AuthContext — login via POST /api/auth/login, store user { role, branchId }
- TanStack Query for data fetching
- Remove ALL firebase imports

ROUTES:
/ → RoleBasedRedirect
/login → LoginPage (wire JWT)
/setup → SetupPage (GET /api/setup/status — skip if needsSetup=false)
/admin/* → SUPER_ADMIN
/manager/* → MANAGER (branch locked)
/unauthorized → 403

SetupPage (copy idea from old src/pages/setup/SetupPage.jsx):
- Steps: business name, branch, admin email/password
- Only shows when needsSetup=true
- After migration import, setup AUTO-SKIPS

Language: Urdu + English toggle (same as old)
Theme: Light + Dark toggle (same as old)

Build must pass: npm run build in apps/web
```

---

## PROMPT M7 — Setup Page UI + Auth screens

```
In apps/web:

SETUP PAGE (src/pages/setup/SetupPage.jsx):
- Multi-step wizard (Roman Urdu + English via lang files)
- Step 1: Business / shop name, logo optional
- Step 2: Pehli branch — name, code (JM-1), address
- Step 3: Super Admin — name, email, password, confirm password
- Step 4: Review + "Shuru karo" → POST /api/setup/bootstrap
- On success → login redirect
- If GET /api/setup/status needsSetup=false → redirect /login

LOGIN PAGE:
- Copy old LoginPage.jsx design, modern theme colors from theme-modern.css
- Email + password, show/hide password
- "Bhool gaye?" forgot password link
- Error toast Roman Urdu
- After login: SUPER_ADMIN → /admin, MANAGER → /manager

PROTECTED ROUTES:
- SetupRoute.jsx — checks setup status
- PrivateRoute.jsx — checks JWT + role

Add lang keys: setup.*, auth.* in en.json and ur.json
```

---

## PROMPT M8 — Archive + Notifications UI

```
OLD POS reference: src/components/admin/ArchivePanel.jsx, backupNotificationService.js

NEW SYSTEM apps/web + apps/api:

API already has archive + notifications from M5 — now UI:

1. Admin sidebar link: "Archive (Dustbin)"
2. ArchivePanel — list archived orders/customers/users
   - Filter by type, date, branch (super admin)
   - Restore button → POST /api/archive/:id/restore
   - Permanent delete → super admin only, confirm phrase "PERMANENT DELETE"

3. Notifications bell in AdminHeader
   - GET /api/notifications
   - Events: migration_completed, backup_exported, user_archived, etc.

4. Delete buttons on Bills/Customers/Users pages → soft archive (not hard delete)

Roman Urdu labels when language=ur.
Match old POS behavior from archiveService.js.
```

---

## PROMPT M9 — VPS deploy scripts

```
Per docs/master/05-VPS-DEPLOYMENT.md and 09-ZERO-TO-LIVE-FULL-MASTER-CHAT.md Step 4-6:

Create in aone-admin-platform/scripts/vps/:

01-bootstrap.sh — full VPS setup (Node, PG, Nginx, PM2, firewall, DB user)
backup-db.sh — daily pg_dump cron
deploy.sh — git pull, npm ci, prisma migrate deploy, build api+web, pm2 reload

nginx/api.conf, nginx/web.conf — production templates
ecosystem.config.js — PM2 cluster mode for API

docs/DEPLOY_HOSTINGER_ROMAN_URDU.md — copy Steps 3-8 from master chat doc, beginner friendly

Include scp example for uploading migration.json
```

---

## PROMPT M10 — GitHub Actions CI (optional but recommended)

```
In aone-admin-platform add .github/workflows/ci.yml:

On push to main:
- jobs: lint, test, build api, build web
- services: postgres:16 for integration tests
- secrets: not required for CI (test DATABASE_URL localhost)

Add branch protection README note for user.
```

---

## PROMPT M11 — Testing + UAT

```
Per docs/master/06-TESTING-OPS.md:

1. Vitest unit tests — auth, branchScope, import dedupe
2. Integration tests — login, orders list scoped
3. scripts/fixtures/sample-migration.json — tiny test file
4. docs/UAT_CHECKLIST.md — Roman Urdu, 30 test cases:
   - Super admin all branches
   - Manager one branch only
   - Urdu/English switch
   - Dark/light theme
   - Setup skip after import
   - Archive restore
5. scripts/smoke-production.sh — curl health + login
```

---

## PROMPT M12 — Security hardening

```
apps/api:
- helmet, cors (strict origin), express-rate-limit
- pino logging, request ID
- no stack traces in production
- Zod on all inputs
- SQL injection safe (Prisma only)
- JWT short access (15m) + refresh (7d) rotation
- docs/SECURITY.md checklist

Never commit .env — verify .gitignore
```

---

## PROMPT M13 — Data export from new system (backup)

```
Naye system mein bhi backup chahiye (PostgreSQL se):

API:
- GET /api/backup/modules — list modules with counts
- GET /api/backup/export/:module?format=json|csv
- GET /api/backup/export-full.zip — alag alag folders (old POS jaisa)

UI: Admin → Settings → Backup page
- Har module alag JSON/CSV/ZIP
- Roman Urdu guide (4 steps MANUAL)
- Notifications on export

Reference old: src/components/admin/BackupModulesPanel.jsx
No Firebase — direct PostgreSQL queries.
```

---

## PROMPT M14 — ONE-SHOT MEGA (sirf advanced / patient users)

```
Read ALL docs/master/00 through 09 and docs/MIGRATION_POSTGRESQL_STEP_ZERO.md.

Scaffold and implement D:\Advance_POS\aone-admin-platform completely:
M1 through M13 in order. Commit after each phase. Run build after each phase.

Reference UI: D:\Advance_POS\aone-jewelry-pos
Migration JSON format: buildMigrationExportPayload in backupService.js

UI: same layout as old POS, modern stylish colors, Urdu+English, light+dark.
Auth: JWT only. DB: PostgreSQL Prisma. Deploy: Hostinger VPS scripts.

Do NOT touch old POS repo except reading for reference.
```

---

# PART D — PROMPT ORDER (timeline)

| Din | Prompt | Aap kya karo |
|-----|--------|--------------|
| 1 | M0 (agar zaroorat) + M1 | GitHub repo banao, export download |
| 2 | M2 + M3 | Docker local test, migration.json rakho |
| 3 | M4 + M5 | API test Postman/curl |
| 4–5 | M6 + M7 | UI browser mein dekho |
| 6 | M8 + M13 | Archive/backup test |
| 7 | M9 | VPS order + bootstrap |
| 8 | M3 run on VPS | Import + verify |
| 9 | M10 + M11 + M12 | Testing |
| 10 | Step 8 checklist | Go live |

---

# PART E — Beginner FAQ

**Q: PostgreSQL samajh nahi aati?**  
A: Theek hai. Aap VPS + prompts karo. AI/database developer ka kaam hai.

**Q: Password purane POS jaisa kyun nahi?**  
A: Firebase passwords export nahi hote. Naye system mein naya password — pehli login par change.

**Q: Biller/Cashier naye system mein?**  
A: Nahi abhi. Wo purane POS par. Naya system = Super Admin + Manager.

**Q: UI bilkul same?**  
A: Layout + functions same. Colors thore modern/stylish. Urdu/English + dark/light same.

**Q: Auto import hoga?**  
A: **NAHI.** Sab MANUAL — export → upload → script → verify → confirm.

**Q: GitHub connect kaise?**  
A: Step 1 + Step 5 dekho. `git clone` VPS par, `git push` PC se.

---

# PART F — Quick command cheat sheet

```bash
# LOCAL
docker compose up -d
cd apps/api && npm run dev
cd apps/web && npm run dev

# VPS
ssh root@VPS_IP
cd /var/www/aone-admin-platform && git pull
npm run migrate:verify
pm2 logs aone-api
pm2 restart all

# DB backup
pg_dump -U aone aone_admin | gzip > backup.sql.gz

# SSL renew
certbot renew --dry-run
```

---

**Related docs:**
- [00-MASTER-INDEX](./00-MASTER-INDEX.md)
- [07-CURSOR-PROMPTS-LIBRARY](./07-CURSOR-PROMPTS-LIBRARY.md)
- [MIGRATION_POSTGRESQL_STEP_ZERO](../MIGRATION_POSTGRESQL_STEP_ZERO.md)

*Yeh file Cursor master chat mein poori copy kar sakte ho — ya har PROMPT M1–M14 alag paste karo.*
