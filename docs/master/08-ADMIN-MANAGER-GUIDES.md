# Part 8 — Administrator & Manager Guides (Roman Urdu)

---

## 8.1 Super Admin — pehli dafa login

### Kya hoga?
Migration ke baad aap ko **email** aur **temporary password** milega (`passwords.csv` file import script banati hai).

### Steps
1. Browser kholo: `https://admin.aapki-dukan.com`
2. Setup page **nahi** aani chahiye (data pehle se import hai)
3. Email + temp password daalo → **Login**
4. System bolega: **naya password set karo** — strong password rakho
5. Dashboard khul jayega — purane POS jaisa dikhega

### Agar setup page aa jaye?
- Import dubara check karo — shayad `businesses` table khali hai
- Cursor ko bolo: `npm run migrate` dubara chalao

---

## 8.2 Super Admin — rozana kaam

| Kaam | Kahan |
|------|-------|
| Saari branches ki sales dekho | Admin → Reports |
| Kisi branch ka cash flow | Admin → Cash Flow → branch select |
| Naya manager banana | Admin → Users → Add |
| Manager ko branch assign | User edit → Branch dropdown |
| Purana data export | Admin → Backup (naye system mein bhi rakho) |
| Archive restore | Admin → Archive |

**Yaad rakho:** Aap **har branch** dekh sakte ho. Manager sirf apni.

---

## 8.3 Manager — login aur scope

### Kya hoga?
Manager sirf **apni branch** ka data dekhega — automatic. Koi alag setting nahi.

### Steps
1. `https://admin.aapki-dukan.com` → Login
2. Temp password → naya password set
3. Manager dashboard — sirf apni dukan ke bills, customers, reports

### Test (khud check karo)
- Bills list mein doosri branch ka serial **nahi** hona chahiye
- URL mein `branchId` change karke try karo — **403** ya empty

---

## 8.4 Migration — aap ka step-by-step

### Pehle (purana POS)
1. Super Admin login  
2. **Backup → Migrate → JSON Download**  
3. File 2 jagah save (PC + Google Drive)  
4. `collectionCounts` dekho — agar koi 2500 par ruka ho to Part 7 **M0** prompt chalao  

### Phir (naya server)
1. File server par upload: `data/migration.json`  
2. SSH: `npm run db:backup`  
3. `npm run migrate:dry-run` — errors padho  
4. `npm run migrate`  
5. `npm run migrate:verify` — green hona chahiye  
6. Managers ko naye password bhejo  

### Notification
- Purane app mein banner: "Migration export complete"  
- Naye app mein bell icon: "Migration verified"  

---

## 8.5 Agar migration fail ho

1. **Ghabrao mat** — backup hai  
2. `npm run migrate:rollback`  
3. `reports/migration-*.json` mein `errors` array padho  
4. Cursor ko error paste karo + **M3** prompt dubara  
5. Fix ke baad dubara migrate  

**Kabhi bhi purana POS mat band karo** jab tak naya system UAT pass na ho.

---

## 8.6 Security — aam user ke liye

| Rule | Kyun |
|------|------|
| Password share mat karo | Har manager apna login |
| Public WiFi par admin mat kholo | JWT chori ho sakta hai |
| Logout karo shared PC par | |
| Super Admin sirf 1–2 logon ko do | Full access |

---

## 8.7 FAQ

**S: Purana biller/cashier POS band hoga?**  
J: Nahi. Abhi sirf admin/manager naye system par. Billing purane app par.

**S: Firebase bill ab bhi aayega?**  
J: Purane POS ke liye haan jab tak Firebase use karte ho. Naye admin par nahi.

**S: Manager galat branch dekh raha hai?**  
J: Purane `users` doc mein `storeId` check karo → import dubara ya user edit.

**S: Data duplicate?**  
J: Import script dedupe karti hai serial se — verify script chalao.

---

## 8.8 Support escalation

| Level | Contact | When |
|-------|---------|------|
| 1 | Shop IT / aap khud | Login, password |
| 2 | Cursor AI + Part 6 troubleshooting | API errors |
| 3 | Hostinger support | VPS down, network |

---

## 8.9 Beginner glossary

| English | Roman Urdu simple |
|---------|-------------------|
| API | App aur database ke beech dalal |
| JWT | Login ticket (digital) |
| PostgreSQL | Excel se strong database |
| Migration | Purana data naye ghar mein shift |
| Branch scope | Sirf apni dukan ka data |
| Soft delete | Dustbin — restore ho sakta hai |
| VPS | Internet par rent ki machine |

---

## 8.10 Congratulations — go live

Jab yeh sab ho jaye:
- [ ] Super Admin UAT pass  
- [ ] 2 managers alag branches test pass  
- [ ] SSL green lock  
- [ ] Backup cron chal raha  
- [ ] Purana POS parallel chal raha  

**Aap ka naya system live hai.** 🎉

Pehle hafta sirf **dekhna/report** naye system par; billing purane POS par.

---

**Wapas index:** [00-MASTER-INDEX.md](./00-MASTER-INDEX.md)
