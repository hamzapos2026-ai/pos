# Part 3 — API & Backend (Express + Prisma)

---

## 3.1 API overview

### 1. Purpose
React UI ko PostgreSQL data REST APIs se dena — JWT auth, branch scope, archive, migration hooks.

### 2. Why Express + Prisma
Industry standard, TypeScript-friendly, Prisma migrations = beginner-safe SQL.

### 3. AI tasks
Full `apps/api` scaffold with all routes below.

### 4. User tasks
Set `DATABASE_URL`, `JWT_SECRET` in `.env`

### 5. Expected output
API at `http://localhost:3001/api` with OpenAPI/Swagger optional

### 6. Folder location
`apps/api/src/routes/`, `apps/api/src/services/`

### 7–15. See route table below; verify with `npm run test:api`

---

## 3.2 Complete REST API list

### Authentication
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/auth/login` | — | Email + password → JWT |
| POST | `/api/auth/refresh` | Cookie/refresh token | New access token |
| POST | `/api/auth/logout` | JWT | Invalidate refresh |
| GET | `/api/auth/me` | JWT | Current user + branch |
| POST | `/api/auth/forgot-password` | — | Email reset link |
| POST | `/api/auth/reset-password` | Token | Set new password |
| POST | `/api/auth/change-password` | JWT | Logged-in change |

### Setup
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/setup/status` | `{ needsSetup, businessCount }` |
| POST | `/api/setup/bootstrap` | First-time only (empty DB) |

### Businesses & Branches
| Method | Path | Role | Description |
|--------|------|------|-------------|
| GET | `/api/businesses` | Super Admin | List businesses |
| GET | `/api/branches` | All | Super Admin: all; Manager: own |
| GET | `/api/branches/:id` | Scoped | Branch detail |
| PATCH | `/api/branches/:id` | Super Admin | Update branch |

### Users
| Method | Path | Role | Description |
|--------|------|------|-------------|
| GET | `/api/users` | Super Admin | All users |
| GET | `/api/users/me` | JWT | Self |
| POST | `/api/users` | Super Admin | Create manager |
| PATCH | `/api/users/:id` | Super Admin | Update |
| DELETE | `/api/users/:id` | Super Admin | Soft archive |

### Customers
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/customers` | Paginated, branch-scoped |
| GET | `/api/customers/:id` | Detail |
| POST | `/api/customers` | Create |
| PATCH | `/api/customers/:id` | Update |
| DELETE | `/api/customers/:id` | Archive |

### Orders & Bills
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/orders` | Filters: date, status, serial, branch |
| GET | `/api/orders/:id` | Full order + items |
| GET | `/api/orders/stats` | Dashboard aggregates |

### Payments
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/payments` | Branch-scoped list |
| GET | `/api/payments/summary` | By method, date range |

### Reports
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/reports/sales` | Sales report |
| GET | `/api/reports/cashflow` | Cash flow |
| GET | `/api/reports/commission` | Commission |
| GET | `/api/reports/daily-summary` | Daily summaries |
| GET | `/api/reports/export` | CSV/JSON export |

### Expenses & Returns
| Method | Path | Description |
|--------|------|-------------|
| GET/POST/PATCH/DELETE | `/api/expenses` | CRUD + archive |
| GET/POST | `/api/returns` | Returns list |

### Activity & Audit
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/activity-logs` | Filter by user, action, date |
| GET | `/api/audit-logs` | Admin audit trail |

### Archive & Restore
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/archive` | List archived entities |
| POST | `/api/archive/:type/:id/restore` | Restore |
| DELETE | `/api/archive/:type/:id` | Permanent delete (Super Admin) |

### Migration (internal)
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/migration/import` | Upload JSON (Super Admin, maintenance mode) |
| GET | `/api/migration/status` | Last run report |
| POST | `/api/migration/verify` | Re-run verification |

### Notifications
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/notifications` | In-app notifications |
| PATCH | `/api/notifications/:id/read` | Mark read |
| POST | `/api/migration/notify` | Webhook from old POS (optional) |

### Health
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | `{ ok, db, version }` |

---

## 3.3 Middleware stack

```typescript
// Order matters
app.use(helmet());
app.use(cors({ origin: CORS_ORIGIN, credentials: true }));
app.use(express.json({ limit: '50mb' })); // migration upload
app.use(rateLimit({ windowMs: 60000, max: 100 }));
app.use('/api/auth/login', rateLimit({ max: 5 }));

// Per route
authenticate → requireRole('SUPER_ADMIN' | 'MANAGER') → branchScope → handler
```

### branchScope rules
- `SUPER_ADMIN`: optional `?branchId=` query filter
- `MANAGER`: `branchId` forced from JWT; 403 if URL param differs

---

## 3.4 Migration notification system

### 1. Purpose
Purane aur naye system dono mein migration status dikhao.

### 2. Why dual notification
Operators ko pata chale export/import kab ho raha hai; failure pe turant action.

### 3. AI tasks

**Old POS (minimal patch):**
- `migration_notifications` Firestore collection OR localStorage banner
- On export start/complete: write doc `{ status, at, message }`
- BackupMigratePanel shows banner

**New API:**
- `notifications` table: `type`, `title`, `body`, `userId`, `readAt`
- On import: create system notification for all Super Admins
- Events: `migration_started`, `migration_completed`, `migration_failed`, `migration_verified`

### 4. User tasks
None — automatic on export/import

### 5. Expected output
Toast + notification bell in both apps

### 8. Commands
```bash
curl -X POST http://localhost:3001/api/migration/notify \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"event":"migration_completed","counts":{"orders":1200}}'
```

### 14. Beginner explanation
Jaise WhatsApp "backup complete" — waisi app ke andar message.

### 15. Next step
Part 4 Frontend

---

## 3.5 Archive system (full)

### Behavior
| Action | DB effect | UI |
|--------|-----------|-----|
| Delete customer | `is_archived=true` + `archive_records` snapshot | Hidden from list, in Archive tab |
| Restore | `is_archived=false`, `restored_at` set | Back in list |
| Permanent delete | Hard delete + audit log | Super Admin only, confirm twice |

### Audit fields on every mutation
`created_by`, `updated_by`, `deleted_by`, `deleted_at`, `restored_by`, `restored_at`

---

## 3.6 Error response format

```json
{
  "error": {
    "code": "BRANCH_FORBIDDEN",
    "message": "You cannot access this branch",
    "requestId": "req_abc123"
  }
}
```

Log full stack server-side only; never leak to client in production.

---

## 3.7 Section — API implementation (15 points)

### 1. Purpose
Production-ready backend.

### 2. Why recommended
Layered: routes → services → repositories → Prisma.

### 3. AI tasks
Implement all routes; Vitest integration tests; `pnpm dev` hot reload.

### 4. User tasks
Run `npm run prisma:migrate` once locally.

### 5. Expected output
`npm run test` green.

### 6. Folder
`apps/api/`

### 7. Files
`src/index.ts`, `src/routes/*.ts`, `prisma/schema.prisma`

### 8. Commands
```bash
cd apps/api
npm install
npx prisma migrate dev
npm run dev
```

### 9. Verification
`GET /api/health` → `{ ok: true }`

### 10. Common errors
| Error | Fix |
|-------|-----|
| ECONNREFUSED postgres | `docker compose up -d` |
| Prisma migrate failed | Check DATABASE_URL |

### 11. Troubleshooting
`npx prisma studio` to browse data

### 12. Best practices
Use Zod for request validation; never trust client branchId for managers

### 13. Production
PM2 cluster mode; `NODE_ENV=production`

### 14. Beginner
API = waiter; UI order deti hai, API kitchen (database) se khana laati hai.

### 15. Next
Part 4

---

**Next:** [Part 4 — Frontend & UI](./04-FRONTEND-UI.md)
