# Part 7 — Cursor Prompts Library (Copy-Paste)

> Har prompt ko **ek waqt mein ek** Cursor chat mein paste karo.  
> Pehle prompt complete hone do, phir agla.

---

## M0 — Export data (old POS repo)

```
Repo: D:\Advance_POS\aone-jewelry-pos

Read backupService.js — buildMigrationExportPayload and MIGRATION_COLLECTIONS.
Agar 2500 per collection limit issue ho to Firebase pagination se full export script banao:
scripts/export-full-migration.js
Roman Urdu README: docs/EXPORT_FULL_MIGRATION.md
Output: migration_FULL_YYYY-MM-DD.json with collectionCounts in meta.
```

---

## M1 — Scaffold monorepo

```
Read docs/master/00-MASTER-INDEX.md and docs/master/01-ARCHITECTURE-DECISIONS.md.

Create sibling folder D:\Advance_POS\aone-admin-platform with:
- apps/api (Node 20, Express, TypeScript, Prisma, PostgreSQL)
- apps/web (React 19, Vite — UI clone from aone-jewelry-pos)
- packages/shared
- scripts/ (migrate, verify, rollback, backup)
- docker-compose.yml (postgres:16)
- .env.example for api and web
- README.md Roman Urdu beginner section

NO Firebase. JWT auth. Roles: SUPER_ADMIN, MANAGER only.
Match folder structure in Part 1.5 exactly.
```

---

## M2 — Prisma schema + migrations

```
In aone-admin-platform/apps/api:

Implement full Prisma schema per docs/master/02-DATABASE-MIGRATION.md:
tenants, businesses, branches, users, customers, orders, order_items,
payments, expenses, returns, activity_logs, daily_summaries, notifications,
archive_records, migration_logs.

Add all indexes from Part 2.7.
Run prisma migrate dev --name init.
Add seed script with one super admin (dev only).
```

---

## M3 — Migration import pipeline

```
Read docs/master/02-DATABASE-MIGRATION.md migration section.

Create scripts/migrate-from-firebase-json.ts that:
1. Reads data/migration.json (format from old POS buildMigrationExportPayload)
2. Backs up DB via pg_dump wrapper
3. Dry-run mode (--dry-run) counts only
4. Imports in order: branches, users, customers, orders, payments, etc.
5. Maps storeId → branch_id, legacy_firestore_id on all entities
6. Dedupes orders by serialNo
7. Imports only superAdmin + manager users; temp password file passwords.csv
8. Writes reports/migration-{date}.json
9. scripts/verify-migration.ts compares counts
10. scripts/rollback-migration.ts restores backup

Roman Urdu comments. npm scripts: migrate, migrate:dry-run, migrate:verify, db:backup
```

---

## M4 — Auth + middleware

```
In apps/api implement per docs/master/03-API-BACKEND.md:
- POST /api/auth/login, refresh, logout, me, change-password, forgot/reset
- bcrypt passwords, JWT access + refresh in httpOnly cookie option
- middleware: authenticate, requireRole, branchScope
- GET /api/setup/status, POST /api/setup/bootstrap (empty DB only)
- Vitest tests: manager cannot access other branch
```

---

## M5 — Core REST APIs

```
Implement all routes in docs/master/03-API-BACKEND.md sections 3.2:
businesses, branches, users, customers, orders, payments, reports,
expenses, returns, activity-logs, archive restore, notifications, health.

Every list endpoint: pagination, branchScope, Zod validation.
Repository pattern: routes → services → repositories → Prisma.
```

---

## M6 — Frontend UI clone (modern theme)

```
In apps/web clone from D:\Advance_POS\aone-jewelry-pos per docs/master/04-FRONTEND-UI.md and 09-ZERO-TO-LIVE-FULL-MASTER-CHAT.md PROMPT M6:

COPY: glass theme base, ui components, admin sidebar/header, manager layout, styles, lang files.
COPY: LoginPage, SetupPage, admin pages (dashboard, bills, customers, cashflow, reports), manager pages.

MODERNIZE colors only (theme-modern.css): richer gold primary, better dark/light contrast, subtle animations.
Layout, menu order, table columns, button positions — SAME as old POS.

Replace ALL Firebase with api/client.js + TanStack Query.
AuthContext stores JWT user { role, branchId }.
SetupRoute calls GET /api/setup/status — auto-skip if migration import done.
Urdu + English + light + dark — same toggles as old app.
```

---

## M7 — Migration notifications

```
Old POS (aone-jewelry-pos): In BackupMigratePanel on export start/complete/fail,
write to Firestore collection migration_status latest doc OR show persistent banner.

New API: notifications table + GET /api/notifications.
On import complete create notifications for all SUPER_ADMIN users:
migration_started, migration_completed, migration_failed, migration_verified.

Optional webhook POST from old to new /api/migration/notify.
```

---

## M8 — Archive system

```
Per docs/master/03-API-BACKEND.md section 3.5:
Soft delete on customers, users, orders.
archive_records table with full JSON snapshot.
GET /api/archive, POST restore, DELETE permanent (super admin only).
Audit: deleted_by, deleted_at, restored_by, restored_at.
Admin UI: Archive tab in relevant pages.
```

---

## M9 — VPS deploy scripts

```
Per docs/master/05-VPS-DEPLOYMENT.md create:
scripts/vps/01-bootstrap.sh
scripts/vps/backup-db.sh
scripts/vps/deploy.sh
nginx/api.conf and nginx/web.conf templates
ecosystem.config.js for PM2
docs/master/DEPLOY_QUICKSTART.md Roman Urdu
```

---

## M10 — Testing suite

```
Per docs/master/06-TESTING-OPS.md:
Vitest unit + integration tests for API.
scripts/fixtures/sample-migration.json
npm run test:integration with test database.
Postman collection docs/master/postman/A-One-Admin-API.json
scripts/smoke-production.sh
UAT checklist markdown in docs/master/UAT_CHECKLIST.md
```

---

## M11 — Restore technical documentation

```
Read entire aone-jewelry-pos codebase.
Rewrite docs/TECHNICAL_DOCUMENTATION.md as complete reference:
architecture, folder structure, Firebase collections, roles, auth flow,
IndexedDB/Dexie, sync workers, admin/manager/biller/cashier routes,
backup/migration export format, branch scoping, key services.
Beginner-friendly but complete. 500+ lines if needed.
```

---

## M12 — Security hardening

```
apps/api: helmet, cors, rate-limit login, request ID, pino logging,
no stack traces in production, validate all inputs with Zod,
security checklist from Part 6.7 implemented and documented.
```

---

## Prompt order summary

| Order | Prompt | When |
|-------|--------|------|
| 1 | M0 | Before migration (if large data) |
| 2 | M1 | Day 1 |
| 3 | M2 | Day 1–2 |
| 4 | M3 | Day 2–3 |
| 5 | M4 | Day 4 |
| 6 | M5 | Day 4–6 |
| 7 | M6 | Day 7–9 |
| 8 | M7–M8 | Day 10 |
| 9 | M9 | Day 11 |
| 10 | M10–M12 | Day 12–13 |

---

## One-shot mega prompt (advanced users only)

```
Read ALL files in docs/master/00 through 08.
Scaffold aone-admin-platform completely per master package:
Prisma, import scripts, full API, UI clone, VPS scripts, tests.
Work phase by phase; commit logical chunks; run build after each phase.
Reference old repo D:\Advance_POS\aone-jewelry-pos for UI and migration JSON format.
```

---

**Next:** [Part 8 — Admin & Manager Guides](./08-ADMIN-MANAGER-GUIDES.md)
