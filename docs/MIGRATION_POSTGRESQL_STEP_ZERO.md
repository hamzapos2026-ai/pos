# Step Zero — Purane POS se Naye System (PostgreSQL) Tak

> **Roman Urdu beginner guide**  
> Purana system: Firebase + React POS (yeh app)  
> Naya system: Hostinger VPS + PostgreSQL (Firebase **nahi**)  
> Naye system mein: **Super Admin = sab data** · **Manager = sirf apni branch**

---

## Pehle samajh lo — 3 cheezein alag hain

| Cheez | Kya hai | Example |
|-------|---------|---------|
| **Purana POS (abhi)** | Dukan par billing — biller/cashier | Yeh `aone-jewelry-pos` app |
| **Export file** | Data ki backup JSON/CSV/ZIP | PC par download |
| **Naya system** | Reporting / admin panel VPS par | Hostinger + PostgreSQL |

**Firebase sirf purane POS mein hai.** Naye system mein data **PostgreSQL tables** mein hoga.

```
[Purana POS]  --export-->  [JSON/ZIP file]  --import-->  [Naya VPS + PostgreSQL]
   Firebase                      aap ke PC                    Hostinger
```

---

## Naye system mein kaun kya dekhega?

| Role | Data scope |
|------|------------|
| **Super Admin** | **Sari branches** — orders, customers, users, reports, cash flow, sab |
| **Manager** | **Sirf apni branch** — `storeId` / `branchId` se filter |
| **Biller / Cashier** | Naye system mein **nahi** (aap ne kaha sirf super admin + manager) — wo purane POS par kaam karte rahenge jab tak replace na karo |

**Rule (naya system code mein):**

- Har table mein `branch_id` (ya `store_id`) column honi chahiye  
- Super Admin login → query **bina branch filter**  
- Manager login → query **hamesha** `WHERE branch_id = user.branch_id`

Yeh logic purane app mein `branchAccess.js` jaisa hai — naye system mein bhi wahi idea.

---

# PHASE 0 — Tayyari (kuch din pehle)

### Step 0.1 — List banao: kya migrate karna hai

Naye system ke liye **kam az kam** yeh data chahiye:

| # | Data | Kyon chahiye |
|---|------|----------------|
| 1 | **stores** (branches) | Manager kis branch ka hai |
| 2 | **users** | Super admin + managers login |
| 3 | **customers** | Reports, customer list |
| 4 | **orders** (bills) | Sales, reports, cash flow |
| 5 | **payments** | Cash flow, reconciliation |
| 6 | **expenses** | Manager expenses |
| 7 | **returns** | Returns history |
| 8 | **activityLogs** (optional) | Audit |
| 9 | **settings** | Shop name, receipt settings |

**Products:** Jewelry POS mein zyada tar **bill line items** orders ke andar hain — alag product catalog kam hai.

### Step 0.2 — Purane system se export kahan se karein

1. Login karo **Super Admin** se  
2. **Admin → Backup aur Export**  
3. Language **Urdu** → Roman Urdu guide dikhegi  
4. Tab **Migrate aur Archive**  
5. **JSON Download** (ya **Cloud Mein Save** agar internet strong ho)

**File name example:** `aone_migration_2026-06-23.json`

Is file mein:

- `tables` → PC/local Dexie data (offline bills bhi)  
- `collections` → Firebase cloud data (orders, customers, users, stores, …)

### Step 0.3 — Export ke baad check karo

File kholo (Notepad++ ya VS Code). Dekho:

- `collections.stores` — branches ki list  
- `collections.users` — staff  
- `collections.orders` — kitne bills (count)  
- `collectionCounts` — har collection mein kitni rows

> **Note:** Ek export mein per collection **~2500** records tak limit ho sakti hai. Agar zyada data hai to alag modules se export karo (**Shop Settings → Data tab** → orders, users, etc.) ya developer se bulk export script mangwao.

### Step 0.4 — Backup safe rakho

- Export file **2 jagah** copy karo (PC + USB / Google Drive)  
- Import se **pehle** purana POS **mat band** karo — jab naya system 100% verify ho tab switch karo

---

# PHASE 1 — Hostinger VPS (server) — beginner steps

### Step 1.1 — Hostinger par VPS lo

- Hostinger → **VPS** plan (KVM)  
- OS: **Ubuntu 22.04** (recommended)  
- Kam az kam: 2 GB RAM, 2 CPU (choti dukan ke liye enough shuruat mein)

### Step 1.2 — Server par login

- Hostinger panel se **SSH password** ya SSH key lo  
- Windows se: **PuTTY** ya terminal:  
  `ssh root@YOUR_SERVER_IP`

### Step 1.3 — Basic software install (developer karega ya aap copy-paste)

```bash
# Updates
apt update && apt upgrade -y

# Node.js (API ke liye) — example
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# PostgreSQL
apt install -y postgresql postgresql-contrib

# Nginx (website/API reverse proxy)
apt install -y nginx

# SSL (HTTPS) — baad mein Certbot
apt install -y certbot python3-certbot-nginx
```

### Step 1.4 — PostgreSQL database banao

```bash
sudo -u postgres psql
```

```sql
CREATE USER aone_app WITH PASSWORD 'strong-password-yahan';
CREATE DATABASE aone_pos OWNER aone_app;
\q
```

**Yeh password safe jagah likh lo** — `.env` file mein jayega, GitHub par kabhi mat dalo.

---

# PHASE 2 — PostgreSQL tables (naya system ka skeleton)

Har important table mein **`branch_id`** hona zaroori hai (manager filter ke liye).

### Step 2.1 — Core tables (simple idea)

```sql
-- Branches (pehle import karo)
CREATE TABLE branches (
  id          TEXT PRIMARY KEY,        -- purana Firebase store doc id
  code        TEXT,                    -- JM-1, AON, etc.
  name        TEXT NOT NULL,
  is_active   BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Users (super admin + managers only in naya system)
CREATE TABLE users (
  id            TEXT PRIMARY KEY,      -- Firebase uid
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,         -- naya system apna hash — Firebase password copy NAHI hota
  role          TEXT NOT NULL,         -- 'superAdmin' | 'manager'
  branch_id     TEXT REFERENCES branches(id),  -- NULL = super admin (all branches)
  name          TEXT,
  is_active     BOOLEAN DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Customers
CREATE TABLE customers (
  id            TEXT PRIMARY KEY,
  branch_id     TEXT REFERENCES branches(id),
  name          TEXT,
  phone         TEXT,
  email         TEXT,
  city          TEXT,
  total_spent   NUMERIC(14,2) DEFAULT 0,
  visit_count   INT DEFAULT 0,
  raw_json      JSONB,                 -- purana extra fields yahan
  created_at    TIMESTAMPTZ,
  updated_at    TIMESTAMPTZ
);

-- Orders (bills)
CREATE TABLE orders (
  id              TEXT PRIMARY KEY,
  branch_id       TEXT NOT NULL REFERENCES branches(id),
  serial_no       TEXT,
  biller_id       TEXT,
  customer_id     TEXT REFERENCES customers(id),
  status          TEXT,
  total_amount    NUMERIC(14,2),
  discount_amount NUMERIC(14,2),
  final_amount    NUMERIC(14,2),
  payment_status  TEXT,
  saved_at        TIMESTAMPTZ,
  raw_json        JSONB,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_orders_branch_saved ON orders(branch_id, saved_at DESC);
CREATE INDEX idx_customers_branch ON customers(branch_id);
```

**`raw_json`:** Purane Firebase fields jo abhi map nahi kiye — kho nahi jayenge. Baad mein columns add kar sakte ho.

### Step 2.2 — Import order (zaroori)

Galat order se foreign key error aayega. **Is order mein import karo:**

```
1. branches (stores)
2. users
3. customers
4. orders
5. payments
6. expenses
7. returns
8. activity_logs (optional)
```

---

# PHASE 3 — Export file se PostgreSQL mein data dalna

### Step 3.1 — Kaun karega?

- **Option A:** Developer **import script** likhe (Node.js + `pg`) — recommended  
- **Option B:** CSV export karke **pgAdmin** se import — chota data ke liye  
- **Option C:** Manual SQL — sirf testing, production ke liye nahi

### Step 3.2 — Mapping (purana → naya)

| Export path | PostgreSQL table | branch_id kahan se |
|-------------|------------------|-------------------|
| `collections.stores[]` | `branches` | `id` = `_docId` |
| `collections.users[]` | `users` | `branch_id` = `primaryStore` ya `storeId` |
| `collections.customers[]` | `customers` | `storeId` / `branchId` field |
| `collections.orders[]` | `orders` | `storeId` field (har bill par) |
| `collections.payments[]` | `payments` | order se join karke branch nikalo |

**Example — ek order JSON (Firebase):**

```json
{
  "_docId": "abc123",
  "storeId": "JM-1",
  "serialNo": "JM-1-USER-20260623-0001",
  "finalAmount": 15000,
  "status": "paid",
  "savedAt": "2026-06-23T10:30:00.000Z"
}
```

**PostgreSQL row:**

- `id` = `abc123`  
- `branch_id` = resolve `JM-1` → branches table ki `id`  
- baaki columns map karo  
- poora object `raw_json` mein bhi save karo

### Step 3.3 — Duplicate / offline bills

Purane system mein **same bill** kabhi:

- Dexie `tables.orders` (local)  
- `collections.orders` (cloud)

**dono** mein ho sakti hai.

Import script ko:

1. Pehle cloud `collections.orders` import karo  
2. Local `tables.orders` sirf woh jo cloud mein **nahi** mili (`firebaseId` missing)

Developer ko yeh rule dena.

### Step 3.4 — Users / passwords

- Firebase passwords **export file mein nahi** aate (security)  
- Naye system mein managers ko **naya password set** karna hoga (ya invite email)  
- Super Admin pehla user manually `users` table mein banao

---

# PHASE 4 — Naya web app (API + frontend)

### Step 4.1 — Architecture (simple)

```
[Browser]  →  HTTPS  →  [Nginx on VPS]  →  [Node API :3001]  →  [PostgreSQL]
```

Firebase **kahin nahi**.

### Step 4.2 — API rules (Super Admin vs Manager)

Har API endpoint par:

```javascript
// Pseudo-code
if (user.role === 'superAdmin') {
  // SELECT * FROM orders WHERE date BETWEEN ...
} else if (user.role === 'manager') {
  // SELECT * FROM orders WHERE branch_id = user.branch_id AND date BETWEEN ...
}
```

**Kabhi bhi** manager ke request par `branch_id` client se trust mat karo — hamesha **logged-in user** ki branch use karo.

### Step 4.3 — Kya screens banenge (naya system)

| Screen | Super Admin | Manager |
|--------|-------------|---------|
| Dashboard KPIs | All branches | Own branch |
| Bills / Orders list | All | Own branch |
| Customers | All | Own branch |
| Cash flow / Reports | All | Own branch |
| Users manage | Yes | No (usually) |
| Branches manage | Yes | No |

---

# PHASE 5 — Testing checklist (import ke baad)

| # | Test | Super Admin | Manager |
|---|------|-------------|---------|
| 1 | Login | ✓ | ✓ |
| 2 | Orders count purane POS se match | All branches sum | Sirf 1 branch |
| 3 | Aaj ki sales | ✓ | ✓ apni branch |
| 4 | Customer search | ✓ | ✓ branch filter |
| 5 | Manager dusri branch ka data **nahi** dekhe | — | ✓ must fail |
| 6 | Export CSV/PDF reports | ✓ | ✓ scoped |

**Match kaise check karein:** Purane POS **Admin → Reports** se aaj ka total nikalo → naye system se compare karo (same date range, same branch).

---

# PHASE 6 — Go live (switch)

1. Naya system **2 hafta parallel** chalao (purana POS bhi chalta rahe)  
2. Roz totals compare karo  
3. Jab match ho → managers ko naya URL + login do  
4. Purana POS: biller/cashier ke liye **abhi bhi** chal sakta hai jab tak naya billing na banao  
5. Optional: purane Firebase par **archive** (Backup → Migrate → soft archive) — storage kam karne ke liye, **pehle backup verify**

---

# Aap abhi personally kya karein? (Action list)

| # | Aap kya karein | Kaun help kare |
|---|----------------|----------------|
| 1 | Super Admin se **migration JSON download** | Khud — Backup page |
| 2 | File 2 jagah backup | Khud |
| 3 | `collectionCounts` screenshot / note — kitna data hai | Khud |
| 4 | Hostinger VPS order | Khud (panel) |
| 5 | PostgreSQL + tables + import script | **Developer** |
| 6 | Naya admin/manager website | **Developer** |
| 7 | Testing + go-live date | Aap + developer |

---

# Common beginner questions

**Q: Kya purana POS band ho jayega?**  
A: Nahi, jab tak naya billing na banao. Sirf **reports/admin** naye system par shift ho sakta hai.

**Q: Firebase bill delete karna zaroori hai?**  
A: Nahi. Pehle naya system sahi chalao, phir optional archive.

**Q: Manager 2 branches dekhe?**  
A: Naye system mein **ek manager = ek branch** (purane app ka rule bhi yahi hai).

**Q: Export file bahut bari hai?**  
A: ZIP use karo; agar 2500+ orders hain to module-wise export ya developer bulk script.

**Q: PostgreSQL samajh nahi aati?**  
A: Theek hai — aap export + VPS order karo; developer database handle karega. Aap ko sirf **branch_id wala idea** samajhna hai (manager = apni branch).

---

# Developer ko yeh file dena

Saath mein dena:

1. Migration JSON (`aone_migration_*.json`)  
2. `docs/TECHNICAL_DOCUMENTATION.md` (schema detail)  
3. Yeh file: `docs/MIGRATION_POSTGRESQL_STEP_ZERO.md`  
4. Branch codes list (JM-1, etc.) — `collections.stores` se

**Import script** example location (future): `scripts/import-to-postgres/` — abhi banwana hoga naye repo mein.

---

*Last updated: migration guide for Hostinger VPS + PostgreSQL, Super Admin (all) + Manager (branch-scoped).*
