# Part 1 — Architecture & Key Decisions

---

## 1.1 System purpose

### 1. Purpose
Naya **admin/manager platform** banana jo purane Firebase POS ka data PostgreSQL par le aaye — **same UI**, **no Firebase**, Super Admin = all data, Manager = branch only.

### 2. Why recommended
- Firebase cost + vendor lock-in kam
- Reporting/admin alag scale ho sakta hai
- Purana billing POS disturb nahi hota (parallel run)

### 3. AI tasks
- Monorepo scaffold `aone-admin-platform/`
- Architecture diagram in README
- `.env.example` files
- Docker Compose for local PostgreSQL

### 4. User tasks
- Migration JSON export from old POS
- Hostinger VPS order (Part 5)

### 5. Expected output
```
aone-admin-platform/
├── apps/api/          # Express + Prisma
├── apps/web/          # React Vite (UI clone)
├── packages/shared/   # Types, constants
├── scripts/           # migrate, verify, seed
├── prisma/            # Schema + migrations
├── docs/
└── docker-compose.yml
```

### 6. Folder location
New repo root (sibling to `aone-jewelry-pos` or separate GitHub repo)

### 7. Files created
`package.json`, `turbo.json` or npm workspaces, `docker-compose.yml`, `README.md`

### 8. Commands
```bash
git clone <new-repo>
cd aone-admin-platform
docker compose up -d
```

### 9. Verification
`docker ps` shows postgres running

### 10. Common errors
Port 5432 already in use → change docker port

### 11. Troubleshooting
`docker compose logs postgres`

### 12. Best practices
Separate repos: old POS stays, new admin platform new repo

### 13. Production notes
Never commit `.env` with secrets

### 14. Beginner explanation
Socho: purani dukan (POS) alag, naya office (admin website) alag — dono ek waqt chal sakte hain.

### 15. Next step
→ Part 2 Database

---

## 1.2 Authentication — Firebase vs JWT (full comparison)

### 1. Purpose
Login system choose karna jo naye VPS par chale.

### 2. Why JWT + PostgreSQL (recommended)

| Criteria | Firebase Auth | JWT + PostgreSQL |
|----------|---------------|------------------|
| Security | Good | Good (bcrypt + JWT + HTTPS) |
| Cost | Per MAU / project | Included in VPS |
| Performance | Cloud latency | Same VPS as API = fast |
| Scalability | Auto | VPS scale up |
| Maintenance | Google manages auth | You manage (simple with Prisma) |
| Migration | Passwords **cannot** export | Import users + force password reset |
| No Firebase goal | ❌ Still tied | ✅ Fully independent |

**Verdict:** **Option 2 — JWT + PostgreSQL** for new system.

**Exception:** Keep Firebase Auth only if you want single sign-on across OLD and NEW app temporarily — adds complexity, **not recommended** for your case.

### 3. AI tasks
- `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`
- `POST /auth/forgot-password`, `POST /auth/reset-password`
- Prisma `User` model with `passwordHash`
- Middleware `authenticate`, `requireRole`, `branchScope`
- Copy LoginPage UI from old repo, wire to API

### 4. User tasks
- After import: distribute temp passwords to managers
- First login: change password screen

### 5. Expected output
JWT in `httpOnly` cookie or `Authorization: Bearer` header

### 6. Folder location
`apps/api/src/routes/auth.ts`, `apps/api/src/middleware/auth.ts`

### 7. Files created
See Part 3 API list

### 8. Commands
```bash
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@shop.com","password":"***"}'
```

### 9. Verification
Returns `{ token, user: { role, branchId } }`

### 10. Common errors
401 Invalid credentials → check bcrypt hash on import

### 11. Troubleshooting
Compare `users.email` in DB vs login email (lowercase trim)

### 12. Best practices
JWT_SECRET min 32 chars random; refresh tokens in DB table

### 13. Production notes
HTTPS only; `secure` cookies; rate limit login 5/min/IP

### 14. Beginner explanation
Firebase = Google ka login box. Naya system = apna login box, passwords apni PostgreSQL table mein.

### 15. Next step
Part 2 — import users with temp password file

---

## 1.3 Setup wizard — auto skip logic

### 1. Purpose
Pehli dafa app khule to setup ya login?

### 2. Why auto-skip on migration
Aap ke paas purana data hai — dubara business naam type karne ki zaroorat nahi.

**Logic:**
```
IF businesses.count > 0 AND branches.count > 0 AND users.count >= 1
  THEN needsSetup = false → redirect /login
ELSE needsSetup = true → show /setup (one wizard)
```

### 3. AI tasks
- `GET /api/setup/status`
- `POST /api/setup/bootstrap` (only when needsSetup=true, one-time)
- Frontend `SetupRoute` clone from old `SetupRoute.jsx` simplified

### 4. User tasks
Migration import ke baad kuch mat karo — setup khud skip hoga

### 5. Expected output
`/setup` only on empty DB

### 6–15. (abbreviated)
- **Folder:** `apps/web/src/routes/SetupRoute.jsx`, `apps/api/src/routes/setup.ts`
- **Verify:** After import, open `/` → goes to `/login` not `/setup`
- **Error:** Setup shows after import → check businesses table empty → re-run import

---

## 1.4 Permissions — Super Admin vs Manager

### 1. Purpose
Manager kabhi dusri branch na dekhe.

### 2. Why API-level enforcement
UI hide karna enough nahi — hacker URL change kar sakta hai. **Database query hamesha filter.**

```typescript
// Pseudo
const branchId = user.role === 'SUPER_ADMIN' ? query.branchId : user.branchId;
if (user.role === 'MANAGER' && query.branchId !== user.branchId) throw 403;
```

### 3. AI tasks
- `branchScope` middleware on ALL data routes
- Prisma extension or service layer `withBranchScope(user)`
- Vitest: manager A cannot read branch B order

### 4. User tasks
UAT: 2 manager accounts, different branches, cross-check

### 5. Expected output
403 on cross-branch access

### 14. Beginner explanation
Manager = ek dukan ka darwaza. Super Admin = poore mall ki chabi.

### 15. Next step
Part 2 ER diagram

---

## 1.5 Project folder structure (auto-generated)

```
aone-admin-platform/
├── apps/
│   ├── api/
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── app.ts
│   │   │   ├── config/
│   │   │   ├── middleware/
│   │   │   ├── routes/
│   │   │   ├── services/
│   │   │   ├── repositories/
│   │   │   └── utils/
│   │   ├── prisma/
│   │   │   └── schema.prisma
│   │   └── package.json
│   └── web/
│       ├── src/
│       │   ├── main.jsx
│       │   ├── App.jsx
│       │   ├── api/client.js
│       │   ├── context/
│       │   ├── pages/admin/
│       │   ├── pages/manager/
│       │   ├── pages/auth/
│       │   ├── components/   # copied from old POS
│       │   ├── styles/
│       │   └── lang/
│       └── package.json
├── scripts/
│   ├── migrate-from-firebase-json.ts
│   ├── verify-migration.ts
│   ├── rollback-migration.ts
│   └── backup-db.sh
├── docs/master/              # this package
├── .github/workflows/ci.yml
├── docker-compose.yml
├── .env.example
└── README.md
```

**Naming:** `kebab-case` files, `PascalCase` React components, `camelCase` functions.

**Coding standard:** ESLint + Prettier, TypeScript on API, JSX on web.

---

## 1.6 Environment variables

```env
# apps/api/.env
DATABASE_URL=postgresql://aone:password@localhost:5432/aone_admin
JWT_SECRET=change-me-min-32-chars-random-string-here
JWT_EXPIRES_IN=7d
PORT=3001
NODE_ENV=development
CORS_ORIGIN=http://localhost:5173

# Migration
MIGRATION_JSON_PATH=./data/migration.json
OLD_POS_NOTIFY_URL=          # optional webhook to old system

# apps/web/.env
VITE_API_URL=http://localhost:3001/api
```

---

## 1.7 Sequence — first login after migration

```mermaid
sequenceDiagram
  participant U as User Browser
  participant W as React Web
  participant A as Express API
  participant D as PostgreSQL

  U->>W: Open admin.yourdomain.com
  W->>A: GET /setup/status
  A->>D: COUNT businesses, users
  D-->>A: counts > 0
  A-->>W: needsSetup false
  W->>U: Show /login
  U->>W: email + password
  W->>A: POST /auth/login
  A->>D: find user, verify bcrypt
  A-->>W: JWT + role + branchId
  W->>U: Redirect /admin or /manager
```

---

**Next:** [Part 2 — Database & Migration](./02-DATABASE-MIGRATION.md)
