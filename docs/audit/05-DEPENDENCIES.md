# 05 — package.json & major dependencies

**App:** `aone-jewelry-pos` · **version:** `1.0.0` · **type:** `module`

## Root scripts

| Script | Purpose |
|--------|---------|
| `dev` / `dev:https` | Vite dev server |
| `build` / `preview` | Production build / local preview |
| `test` | Vitest |
| `lint` | ESLint |
| `network` / `dev:network` | LAN IP helper + dev |
| `shop:install` / `shop:server` / `shop:dev` | Optional LAN shop-server |
| `deploy:functions` | Deploy selected Cloud Function(s) |

## Major runtime dependencies (root)

| Package | Role |
|---------|------|
| `react` / `react-dom` ^19 | UI |
| `react-router-dom` ^7 | Routing |
| `firebase` ^12 | Auth + Firestore client |
| `dexie` ^4 | IndexedDB (offline-first) |
| `framer-motion` | Motion |
| `lucide-react` | Icons |
| `react-hot-toast` | Toasts |
| `chart.js` / `react-chartjs-2` / `recharts` | Charts |
| `jspdf` / `jspdf-autotable` / `xlsx` | Export PDF/Excel |
| `qrcode` / `react-barcode` | QR / barcode |
| `react-to-print` | Printing |
| `howler` | Sounds |
| `date-fns` | Dates |
| `react-hook-form` | Forms |
| `uuid` / `js-sha256` / `bcryptjs` | IDs / hashing |
| `@tanstack/react-table` / `react-virtual` / `react-window` | Tables / virtualization |
| `clsx` / `tailwind-merge` / `tailwindcss-rtl` | Styling helpers |
| `@clerk/clerk-react` | **Present in package.json but unused in `src/`** |

## Major devDependencies (root)

| Package | Role |
|---------|------|
| `vite` ^5 / `@vitejs/plugin-react` | Build |
| `vite-plugin-pwa` / `workbox-window` | PWA |
| `tailwindcss` / `postcss` / `autoprefixer` | CSS |
| `eslint` + React plugins | Lint |
| `vitest` | Tests |
| `firebase-tools` / `firebase-admin` / `@firebase/rules-unit-testing` | Firebase tooling |
| `@vitejs/plugin-basic-ssl` | HTTPS dev |

## `functions/` (Cloud Functions)

- `firebase-admin`, `firebase-functions` (v2)
- Engine: Node 20

## `shop-server/` (optional LAN)

- `express`, `cors`
- Local JSON file DB under `shop-server/data/` (runtime data gitignored)

## Source of truth

Copy of root `package.json` / `package-lock.json` is included in the source ZIP. Do not treat this markdown as a lockfile substitute.
