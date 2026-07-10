# A One Jewelry POS

Professional Point of Sale for jewelry stores. React 19 + Vite + Firebase, offline-first (Dexie/IndexedDB), multi-role, PWA.

**Current branch:** `main`  
**Stack today:** Vite SPA (Netlify / Vercel) + Firebase Auth/Firestore (+ optional Cloud Functions) + optional LAN `shop-server`.  
**Not live yet:** Hostinger VPS + PostgreSQL migration (see `docs/master/`).

---

## Prerequisites

- Node.js **18+** (20 recommended) and npm
- Firebase project with **Authentication (Email/Password)** and **Firestore** enabled
- (Optional) Firebase Blaze plan if deploying Cloud Functions
- (Optional) Second PC on same LAN for multi-terminal offline via `shop-server`

---

## Quick start (local)

```bash
# 1. Clone
git clone <repository-url>
cd aone-jewelry-pos

# 2. Install
npm install

# 3. Environment (never commit real secrets)
copy .env.example .env
# Edit .env with your Firebase web app config (see below)

# 4. Dev server
npm run dev
```

Open **http://localhost:5173**

### First-time setup

1. If no Super Admin exists, app redirects to `/setup`
2. Create Super Admin + shop/business info
3. Create branches/users from Admin
4. Log in as Biller / Cashier / Manager as needed

---

## Environment variables (names only)

Create `.env` in project root (gitignored). Use Firebase Console → Project settings → Your apps.

```env
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
VITE_FIREBASE_MEASUREMENT_ID=

# Optional
VITE_FIREBASE_FUNCTIONS_REGION=us-central1
VITE_AUTH_DELETE_ENABLED=false
VITE_SHOP_API_URL=http://127.0.0.1:3001
```

**Never share** real API keys, service account JSON, or passwords in audit packages or chat.

---

## npm scripts

| Script | Purpose |
|--------|---------|
| `npm run dev` | Vite development server |
| `npm run dev:https` | HTTPS dev (PWA / mobile testing) |
| `npm run build` | Production build → `dist/` |
| `npm run preview` | Serve production build locally |
| `npm test` | Vitest unit tests |
| `npm run lint` | ESLint |
| `npm run network` | Show LAN IP for multi-device testing |
| `npm run shop:install` | Install LAN shop-server deps |
| `npm run shop:server` | Start LAN shop-server (port 3001) |
| `npm run deploy:functions` | Deploy selected Cloud Function(s) |

---

## Roles

| Role | Primary use |
|------|-------------|
| Super Admin | Full system, users, Firebase assistant, all branches |
| Admin | Users/settings/reports (some writes Super-Admin-only) |
| Manager | Branch ops: bills, cash flow, expenses, returns, reports |
| Biller | Create bills, F8 checkout, print invoices |
| Cashier | Collect payments, offline pay queue, cancelled flags |

---

## Keyboard shortcuts (high level)

**Biller:** `F8` checkout · `INSERT` lock · `ESC` cancel · `DELETE` clear items  
**Cashier:** `INSERT` search · `F2` QR · `F9` refresh  
**Global:** `Ctrl+L` logout · `Ctrl+D` theme · `F1` shortcuts

---

## Project structure (summary)

```
aone-jewelry-pos/
├── docs/                 # Deployment, offline, Firebase, master migration, audit
├── functions/            # Firebase Cloud Functions
├── shop-server/          # Optional LAN Express server for multi-PC offline
├── public/               # Static + PWA assets
├── src/
│   ├── components/       # admin, biller, cashier, manager, shared, ui
│   ├── context/          # Auth, Settings, Network, Language
│   ├── db/               # Dexie aone_pos_db
│   ├── hooks/
│   ├── pages/            # Role dashboards + setup/login
│   ├── repositories/     # Data access layer (UI → services → repos)
│   ├── services/         # Business logic + sync workers
│   ├── routes/
│   └── utils/
├── firestore.rules
├── firestore.indexes.json
├── firebase.json
├── package.json
└── README.md
```

Full tree export: `docs/audit/04-FOLDER-STRUCTURE.txt`  
Formal audit package index: `docs/audit/00-AUDIT-PACKAGE-INDEX.md`

---

## Architecture (current)

```
UI (pages/components)
  → Services
    → Repositories
      → Firebase (online) / Dexie + IndexedDB (offline)
```

Sync workers: `localSyncService`, `syncWorker` (~5s), `cashierSyncWorker` (~15s), `settingsSyncWorker` (~30s).

---

## Deploy (SPA)

```bash
npm run build
```

Deploy `dist/` to **Netlify**, **Vercel**, or static HTTPS host (PWA needs HTTPS).  
Config files: `netlify.toml`, `vercel.json`.  
Firestore rules/indexes: deploy via Firebase CLI when changing `firestore.rules` / `firestore.indexes.json`.

Shop-floor multi-PC offline: see `docs/OFFLINE_SHOP_DEPLOYMENT_GUIDE.md`.

---

## Documentation map

| Doc | Content |
|-----|---------|
| `docs/audit/` | **Formal audit package** (features, bugs, Firebase, DB, VPS overview) |
| `docs/DEPLOYMENT_PWA.md` | PWA / build / SW notes |
| `docs/OFFLINE_SHOP_DEPLOYMENT_GUIDE.md` | Offline shop + LAN server |
| `docs/TECHNICAL_DOCUMENTATION.md` | Technical reference |
| `docs/master/` | Future VPS + PostgreSQL migration playbook |

---

## Security reminder

- Do not commit `.env`, service accounts, or password lists
- Do not put secrets in screenshots or screen recordings shared for audit
- Firestore rules + role checks are required; never rely on UI-only permission

---

## License

MIT — see LICENSE if present.

Built for jewelry retail operations (fast billing, offline-first, multi-branch).
