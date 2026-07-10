# A One Jewelry — Poora Kaam Roman Urdu Guide (Step Zero se Live Tak)

> **Yeh ek hi file hai** — purana POS (Firebase) + naya system (PostgreSQL VPS)  
> **Super Admin** = sab branches · **Manager** = sirf apni branch  
> **95% kaam AI (Cursor)** karega · aap sirf neeche **"AAP"** wale steps follow karo

---

## Pehle 1 minute mein samajh lo

| System | Kya hai | Firebase? |
|--------|---------|-----------|
| **Purana POS** | Dukan billing — biller, cashier, admin | Haan |
| **Naya Admin** | Reports, users, data — Super Admin + Manager | **Nahi** |

**Sab se important rule:**

```
Super Admin EK dafa export kare (purana POS se)
        ↓
AI import kare (naya server PostgreSQL mein)
        ↓
Manager ko alag export ki ZAROORAT NAHI
        ↓
Manager login kare → apni branch ka data AUTOMATIC dikhe
```

**Export / Import MANUAL hain** (button dabao, file save karo) — automatic background export **nahi** chalega billing disturb na ho.  
**Backup AUTO** hoga (roz / hafta) — sirf backup, import nahi.

---

# TABLE — Kaun kya karta hai

| Kaam | Super Admin | Manager | AI (Cursor) |
|------|-------------|---------|-------------|
| Purane POS se migration export | ✓ Sirf woh | ✗ | Script/limit fix |
| Naye server par import | ✗ | ✗ | ✓ Poora code |
| Naya login / password | ✓ Pehla | ✓ Apna | ✓ Auth system |
| Manager account banana | ✓ | ✗ | ✓ Users API |
| Rozana billing | Purana POS | Purana POS | — |
| Naye admin mein reports | ✓ Sab branches | ✓ Apni branch | ✓ Branch filter |
| Manager ko export chahiye? | — | **NAHI** | ✓ Auto scope |
| Delete → Archive → Restore | ✓ | Limited | ✓ Code |
| Notifications migration | ✓ Dekhega | ✓ Apni branch | ✓ Dono systems |

---

# STEP ZERO — Tayyari (Aaj, 30 minute)

## STEP 0.1 — Socho kya migrate hoga

### AAP ka kaam
Kuch nahi — sirf padho aur samjho.

### Kyon
Taake baad mein data kam na rahe.

### Migrate hoga (kam az kam)
| # | Data | Kyon |
|---|------|------|
| 1 | Branches (`stores`) | Manager kis dukan ka hai |
| 2 | Users (superAdmin + manager) | Login |
| 3 | Customers | List + reports |
| 4 | Orders (bills) | Sales, cash flow |
| 5 | Payments | Cash flow |
| 6 | Expenses, Returns | Manager reports |
| 7 | Settings | Shop naam, receipt |

### AI ka kaam
Abhi kuch nahi.

---

## STEP 0.2 — Purane POS se pehli export (MANUAL)

### AAP ka kaam — yahan jao, yeh karo

1. Purana app kholo (browser)
2. **Super Admin** se login karo
3. Sidebar: **Admin → Backup aur Export**
4. Upar language **Urdu** rakho (Roman Urdu guide dikhegi)
5. Tab: **Migrate aur Archive**
6. Button: **JSON Download** dabao (yeh **MANUAL** hai — khud dabana hai)
7. File save karo: `aone_migration_2026-06-23.json` jaisa naam
8. **2 jagah copy:** PC + Google Drive / USB
9. File kholo → `collectionCounts` dekho kitna data hai

### Kyon MANUAL export
- Aap control mein ho — galat waqt par auto export billing slow kar sakta hai
- File aap ke paas proof + backup hai
- Import baad mein AI script se **ek dafa** hoga

### AI ka kaam
Abhi kuch nahi (jab tak 2500+ records na hon).

### Agar data zyada ho (2500+ per collection)

**Cursor mein yeh MASTER PROMPT paste karo:**

```
Repo: D:\Advance_POS\aone-jewelry-pos

backupService.js mein buildMigrationExportPayload aur MIGRATION_COLLECTIONS dekho.
Firebase se pagination se POORA data export karo — har collection ki saari rows.
Script: scripts/export-full-migration.js
Output: migration_FULL_YYYY-MM-DD.json
Roman Urdu README: docs/EXPORT_FULL_MIGRATION.md
Super Admin .env credentials se login ho.
```

**AI is prompt se kya karega (samjhao):**
- Purane code ko padhega jahan 2500 ki limit hai
- Naya script likhega jo Firebase se **page by page** saara data kheench lega
- Ek bari JSON file banegi jisme `collectionCounts` sahi honge
- Aap ko sirf script chalani hogi: `node scripts/export-full-migration.js`
- **Data loss nahi** — saari rows export hongi

### Verify (aap)
- [ ] File size 0 se bari hai
- [ ] `collections.stores` mein branches hain
- [ ] `collections.users` mein managers hain

---

## STEP 0.3 — Purana POS band mat karo

### AAP ka kaam
Kuch nahi — yaad rakho: naya system 100% test hone tak purana POS chalta rahe.

### Kyon
Agar migration fail ho to dukan band nahi hogi.

---

# STEP ONE — Purane POS mein Archive + Delete + Restore (AI banayega)

> **Maqsad:** Delete karne par data **gayab na ho** — Archive mein save rahe, baad mein **Restore** ho sake.  
> Abhi kuch cheezein hain (`deletedBills`, soft archive) — poora system AI complete karega.

## STEP 1.1 — Archive system purane POS mein

### AAP ka kaam
Abhi wait — pehle AI code likhe. Phir test: ek test bill delete karo → Archive tab mein dikhe → Restore dabao.

### AI MASTER PROMPT (Cursor — purana repo)

```
Repo: D:\Advance_POS\aone-jewelry-pos

Purane POS mein complete Archive system banao (Roman Urdu UI strings ur.json backup.* mein):

1. DELETE kabhi permanent na ho UI se — pehle soft delete:
   - orders/customers/users par isArchived=true + archivedAt
   - archive_records Firestore collection (full JSON snapshot)

2. Admin → Backup aur Export → naya tab "Archive" ya Migrate panel ke andar:
   - Archive list (kya delete hua, kab, kis ne)
   - Restore button (snapshot wapas)
   - Permanent delete SIRF Super Admin + double confirm

3. deletedBills + backupService archive functions ko is system se joro:
   - backupAndArchiveOldData, restoreArchivedBatch, listArchiveBatches

4. Har delete par activity log + notification toast Roman Urdu

5. Manager: sirf apni branch ke archive dekh sake

backupService.js, BackupMigratePanel.jsx, naya ArchivePanel.jsx
Roman Urdu labels. Build pass karo.
```

**AI is prompt se kya karega:**
- Delete dabane par data **dustbin (Archive)** mein jayega — hard delete nahi
- Poora bill/customer JSON `archive_records` mein save hoga
- **Restore** se wapas active list mein aa jayega
- Super Admin ko history dikhegi: kis ne delete kiya, kab
- Manager sirf apni branch ka archive dekhega
- Purani `deletedBills` collection ke sath link rahega taake cashier flow na toote

### Kyon zaroori
Migration se pehle/baad mein galti se delete ho to data wapas la sako. **No data loss** policy.

---

## STEP 1.2 — Auto Backup (roz / hafta) — purana POS

### AAP ka kaam
AI code ke baad:
1. Admin → Backup → **Schedule** ya settings dekho
2. Rozana backup ON karo (agar option ho)
3. Weekly backup Google Drive / PC par copy (aap ya staff)

### Kyon AUTO backup alag hai export se
| Cheez | Manual / Auto | Kyon |
|-------|---------------|------|
| **Migration export** | MANUAL | Bari file, aap decide karo kab |
| **Rozana backup** | AUTO | Choti backup, billing affect nahi |
| **Import naye server** | MANUAL trigger (AI script) | Sirf migration ke waqt |

### AI MASTER PROMPT

```
Repo: D:\Advance_POS\aone-jewelry-pos

Auto backup system banao:
1. settings mein backupSchedule: daily | weekly | off
2. Roz 2 AM (local) par JSON backup ban kar:
   - IndexedDB + cloud counts snapshot
   - Firestore backups collection mein metadata
   - Optional: last 7 daily + 4 weekly rakho, purani delete
3. Admin UI: Backup tab mein "Auto Backup ON/OFF", last run time, next run
4. Roman Urdu toasts: "Rozana backup mukammal"
5. Offline ho to queue — online aate hi chale

backupService.js + BackupExport.jsx
```

**AI is prompt se kya karega:**
- Har raat (ya hafte) khud choti backup banayega
- Aap ko har roz button nahi dabana
- **Import nahi** karega — sirf backup file / cloud metadata
- Purana POS fast rahega

---

## STEP 1.3 — Migration notifications purane POS mein

### AAP ka kaam
Jab export karo to screen par message dikhe: "Export shuru" / "Export mukammal" / "Export fail"

### AI MASTER PROMPT

```
Repo: D:\Advance_POS\aone-jewelry-pos

Migration notifications purane POS mein:
1. Firestore migration_status collection (latest doc):
   - status: started | completed | failed | verified
   - message Roman Urdu, timestamp, adminEmail
2. BackupMigratePanel: export start/complete/fail par write karo
3. Admin header mein choti banner jab migration chal rahi ho
4. backupRomanUrdu.js strings use karo

Koi automatic export NAHI — sirf notify jab user manually export kare.
```

**AI is prompt se kya karega:**
- Jab aap **JSON Download** dabao ge → "Migration export shuru hui"
- Complete → "Export mukammal — file save karo"
- Fail → "Export fail — dubara try karo"
- **Auto export nahi** — sirf aap ke button par message

---

# STEP TWO — Naya system banana (AI poora scaffold)

## STEP 2.1 — Naya project folder

### AAP ka kaam
1. Folder banao ya GitHub par empty repo: `aone-admin-platform`
2. Cursor mein woh folder kholo (ya sibling: `D:\Advance_POS\aone-admin-platform`)

### AI MASTER PROMPT — M1

```
Read docs/master/00-MASTER-INDEX.md aur docs/master/01-ARCHITECTURE-DECISIONS.md.

D:\Advance_POS\aone-admin-platform banao:
- apps/api — Node 20, Express, TypeScript, Prisma, PostgreSQL
- apps/web — React 19, Vite, UI clone aone-jewelry-pos se (same colors, sidebar)
- packages/shared
- scripts/ migrate, verify, rollback, backup
- docker-compose.yml postgres:16
- .env.example
- README Roman Urdu beginner

NO Firebase. JWT auth. Roles: SUPER_ADMIN, MANAGER only.
```

**AI is prompt se kya karega:**
- Poora folder structure khud banayega
- Docker se local PostgreSQL chal jayega
- API + Web dono projects ready
- Aap ko sirf `docker compose up` aur `npm install` chalana hoga

---

## STEP 2.2 — Database tables (PostgreSQL)

### AAP ka kaam
Kuch nahi — AI migrate chalayega.

### AI MASTER PROMPT — M2

```
aone-admin-platform/apps/api mein full Prisma schema:
docs/master/02-DATABASE-MIGRATION.md ke mutabiq —
tenants, businesses, branches, users, customers, orders, order_items,
payments, expenses, returns, activity_logs, notifications, archive_records, migration_logs.

Indexes + prisma migrate dev --name init
```

**AI is prompt se kya karega:**
- Firebase collections ka PostgreSQL version tables mein
- `branch_id` har business table par
- `legacy_firestore_id` taake import map ho sake
- Relations + foreign keys sahi

---

## STEP 2.3 — Import script (Super Admin ki export file → PostgreSQL)

### AAP ka kaam (migration ke din)
1. Export JSON server par copy: `data/migration.json`
2. Terminal: `npm run db:backup` → `npm run migrate:dry-run` → `npm run migrate` → `npm run migrate:verify`

### AI MASTER PROMPT — M3

```
scripts/migrate-from-firebase-json.ts banao:
1. data/migration.json read (purane POS buildMigrationExportPayload format)
2. Import order: branches → users → customers → orders → payments → ...
3. storeId → branch_id map
4. Dedupe orders by serialNo
5. Sirf superAdmin + manager users; passwords.csv temp passwords
6. Dry-run, verify, rollback scripts
7. migration report JSON reports/ folder mein
Roman Urdu comments README mein
```

**AI is prompt se kya karega:**
- Aap ki **ek** JSON file se **saara** data PostgreSQL mein
- Duplicate orders skip — **no duplicate data**
- Fail ho to **rollback** purani DB snapshot se
- Report: kitni rows import hui, errors kya thi
- **Manager alag export nahi karega** — sab branches ek saath import, baad mein API filter karega

### Kyon Manager ko export nahi chahiye
```
Import mein SARI branches jaati hain
        ↓
Manager login → API check: user.branch_id = "Lahore"
        ↓
Sirf Lahore orders dikhte hain — automatic
```

---

# STEP THREE — Naya system: Setup + Auth + Users

## STEP 3.1 — Setup page

### AAP ka kaam
- **Agar migration import ho chuka** → Setup **nahi** dikhega, seedha Login
- **Agar khali server** → ek dafa Setup: shop naam + pehla Super Admin

### AI MASTER PROMPT — M4

```
Auth + Setup:
- GET /api/setup/status → needsSetup true/false
- Agar businesses+branches+users > 0 → needsSetup false (AUTO SKIP)
- POST /api/setup/bootstrap sirf khali DB par
- JWT login, bcrypt, refresh token
- branchScope middleware — manager doosri branch na dekhe
- LoginPage UI purane jaisa clone
Vitest: manager cross-branch 403
```

**AI is prompt se kya karega:**
- Migration ke baad setup skip — aap dubara business naam type nahi karoge
- Login same dark + amber UI
- Password import ke baad temp → change password screen

---

## STEP 3.2 — Super Admin manager account banaye

### AAP ka kaam (naya system live hone ke baad)
1. Super Admin login
2. **Admin → Users → Add Manager**
3. Email, naam, **Branch select** → Save
4. Manager ko email + temp password bhejo

### AI MASTER PROMPT — M5 (users part)

```
Users API:
- POST /api/users — Super Admin only, role MANAGER, branchId required
- PATCH /api/users/:id
- DELETE soft archive
- Import ke managers pehle se hon to branch_id Firestore storeId se map ho chuka ho

Frontend: UserManagement page purane jaisa UI
```

**AI is prompt se kya karega:**
- Naye manager bina code likhe ban sakte hain
- Har manager **ek** branch se bind
- Galat branch assign nahi hogi agar import sahi tha

---

# STEP FOUR — Naya system: Data, Export, Import, Archive

## STEP 4.1 — Super Admin data dekhe (sab branches)

### AAP ka kaam
Login → Dashboard, Bills, Customers, Reports — purane jaisa dikhe, numbers match karo purane POS se.

### AI MASTER PROMPT — M5 full APIs

```
docs/master/03-API-BACKEND.md ki saari routes implement karo:
orders, customers, payments, reports, cashflow, expenses, returns,
activity-logs, archive, notifications, health
Har list: pagination + branchScope
```

**AI is prompt se kya karega:**
- Super Admin ko **dropdown** se branch choose ya sab dikhe
- Reports, cash flow sab API se

---

## STEP 4.2 — Manager data (AUTOMATIC — export ki zaroorat NAHI)

### AAP ka kaam
Manager account se login → check karo:
- [ ] Sirf apni branch ke bills
- [ ] Doosri branch serial search mein **nahi**
- [ ] Reports sirf apni dukan ke

### Kyon export nahi
Super Admin ne **ek dafa** poora data import kar diya. Manager ka login server ko batata hai `branch_id` — server sirf wohi data bhejta hai.

### AI MASTER PROMPT — M6 (frontend manager scope)

```
apps/web manager pages wire karo API se:
- Manager dashboard branch-scoped stats
- Koi branch dropdown NAHI (locked)
- URL ?branchId= hack → 403
UI bilkul purane manager jaisa — colors same
```

**AI is prompt se kya karega:**
- Manager ko lagta hai "mera data ready hai" — kyunki hai
- Koi **Export** button manager ke liye zaroori nahi (optional choti CSV report ho sakti hai baad mein)

---

## STEP 4.3 — Naye system mein Export / Import (MANUAL + Super Admin)

### AAP ka kaam
| Role | Export | Import |
|------|--------|--------|
| Super Admin | Haan — backup JSON/CSV/ZIP | Haan — migration JSON upload |
| Manager | Optional choti report CSV | **Nahi** — zaroorat nahi |

### AI MASTER PROMPT — M8 + backup UI

```
Naye system mein BackupExport clone:
- Super Admin: full export JSON/CSV/ZIP (MANUAL button)
- Super Admin: import migration JSON (MANUAL upload) + verify
- Manager: sirf apni branch ka CSV export (optional) — import NAHI
- Archive tab: soft delete, restore, permanent delete Super Admin only
- Auto backup VPS par daily pg_dump (cron) — scripts/vps/backup-db.sh
```

**AI is prompt se kya karega:**
- Purane Backup UI jaisa naya admin mein
- Import **automatic background nahi** — Super Admin file choose kare
- Server par database **auto backup** roz — aap button nahi dabate

---

## STEP 4.4 — Delete → Archive → Restore (naya system)

### AAP ka kaam
Test customer delete → Archive mein jaye → Restore → wapas list mein.

### AI MASTER PROMPT

```
archive_records table + APIs:
GET /api/archive, POST restore, DELETE permanent (super admin)
Har delete pe snapshot JSON
Audit: deleted_by, deleted_at, restored_by
Admin UI Archive tab Roman Urdu
```

**AI is prompt se kya karega:**
- Purane POS jaisa behavior naye system mein
- Permanent delete sirf Super Admin double confirm

---

## STEP 4.5 — Notifications naye system mein

### AAP ka kaam
Migration ke baad bell icon check karo: "Migration mukammal" / "Verified"

### AI MASTER PROMPT — M7

```
notifications table + GET /api/notifications
Import complete par saare Super Admin ko notify
Events: migration_started, completed, failed, verified
Manager ko sirf apni branch se related (agar ho)
Header bell icon purane style
```

**AI is prompt se kya karega:**
- Purane POS: export pe message
- Naye system: import + verify pe message
- Dono jagah pata chale kya hua

---

# STEP FIVE — VPS Hostinger (server live)

## STEP 5.1 — VPS order

### AAP ka kaam
1. Hostinger → VPS → Ubuntu 22.04
2. IP address note karo
3. Domain: `admin.aapkidukan.com` + `api.aapkidukan.com` DNS → VPS IP

### AI MASTER PROMPT — M9

```
docs/master/05-VPS-DEPLOYMENT.md:
scripts/vps/01-bootstrap.sh, backup-db.sh, deploy.sh
nginx configs, PM2 ecosystem.config.js
DEPLOY_QUICKSTART Roman Urdu
```

**AI is prompt se kya karega:**
- Server par Node, PostgreSQL, Nginx, SSL scripts
- Rozana `pg_dump` cron
- Deploy ek command: `bash scripts/vps/deploy.sh`

---

## STEP 5.2 — Pehli live migration

### AAP ka kaam (order mein)
1. SSH server
2. `data/migration.json` upload
3. `npm run db:backup`
4. `npm run migrate:dry-run` — errors padho
5. `npm run migrate`
6. `npm run migrate:verify` — green
7. Browser: `https://admin...` → Super Admin login
8. Manager login test — alag branches

### AI ka kaam
Pehle se scripts M3 mein ban chuki hon.

---

# STEP SIX — Testing (aap + AI)

## STEP 6.1 — Aap ka checklist (UAT)

### Super Admin (30 min)
- [ ] Login + password change
- [ ] Dashboard numbers purane POS se match (same date)
- [ ] 3 branches ki bills dikhen
- [ ] Customer search phone se
- [ ] Naya manager user banao
- [ ] Export JSON backup (manual)
- [ ] Archive restore test

### Manager (20 min)
- [ ] Login apni branch
- [ ] Doosri branch data **nahi**
- [ ] Reports sirf apni branch
- [ ] **Export ki zaroorat feel na ho** — data pehle se hai

### AI MASTER PROMPT — M10

```
Vitest integration tests, sample-migration.json fixture,
UAT_CHECKLIST.md Roman Urdu, smoke-production.sh
```

---

# STEP SEVEN — Rozana life (go live ke baad)

| Kaam | Kahan | Kon | Auto? |
|------|-------|-----|-------|
| Billing | Purana POS | Biller/Cashier | — |
| Reports admin | Naya admin URL | Super Admin / Manager | — |
| POS backup | Purana POS | Auto roz/hafta | ✓ Auto |
| DB backup VPS | Server cron | Auto roz | ✓ Auto |
| Migration export | Purana POS | Super Admin jab chaho | ✗ Manual |
| Full re-import | Naya server | Super Admin + AI script | ✗ Manual |

---

# PROMPTS KA ORDER (ek ek karke Cursor mein)

| # | Prompt naam | Kab chalao |
|---|-------------|------------|
| 0 | Export limit fix (STEP 0.2) | Agar 2500+ data |
| 1 | Archive purana POS (STEP 1.1) | Pehle |
| 2 | Auto backup purana POS (STEP 1.2) | Pehle |
| 3 | Notifications purana POS (STEP 1.3) | Pehle |
| 4 | M1 Scaffold (STEP 2.1) | Naya folder ready |
| 5 | M2 Database (STEP 2.2) | M1 ke baad |
| 6 | M3 Import (STEP 2.3) | M2 ke baad |
| 7 | M4 Auth Setup (STEP 3.1) | M3 ke baad |
| 8 | M5 APIs (STEP 4.1) | M4 ke baad |
| 9 | M6 Frontend (STEP 4.2) | M5 ke baad |
| 10 | M7 Notifications naya (STEP 4.5) | M6 ke baad |
| 11 | M8 Archive naya (STEP 4.4) | M6 ke baad |
| 12 | M9 VPS (STEP 5.1) | Deploy se pehle |
| 13 | M10 Tests (STEP 6.1) | Live se pehle |

**Har prompt ke baad:** `npm run build` ya `npm test` — AI khud chalaye jahan likha ho.

---

# FAQ Roman Urdu

**S: Manager ko naye system par data kaise milega bina export ke?**  
J: Super Admin ne ek migration import ki — usme sab branches hain. Manager login par server sirf uski `branch_id` bhejta hai.

**S: Automatic export kyun nahi?**  
J: Bari file + billing slow — aap khud decide karo kab export. Rozana **backup** auto alag cheez hai.

**S: Delete ke baad data wapas?**  
J: Archive → Restore. Permanent delete sirf Super Admin.

**S: Purana POS kab band karein?**  
J: Jab STEP 6 testing pass + 1 hafta parallel chala kar confident ho jao.

**S: Firebase bill naye system par?**  
J: Nahi. Naya system = VPS sirf.

---

# Abhi aap ka pehla kaam (5 minute)

1. **Super Admin** login purane POS  
2. **Admin → Backup aur Export → Migrate**  
3. **JSON Download** (MANUAL)  
4. File 2 jagah save  
5. Cursor kholo → **STEP 1.1 ka prompt** paste karo (Archive system)  
6. Phir order mein baaki prompts  

---

**Related files (detail English):**
- `docs/master/00-MASTER-INDEX.md`
- `docs/master/07-CURSOR-PROMPTS-LIBRARY.md`
- `docs/MIGRATION_POSTGRESQL_STEP_ZERO.md`

*Version 1.0 · Roman Urdu · Step Zero se Live · AI 95%+*
