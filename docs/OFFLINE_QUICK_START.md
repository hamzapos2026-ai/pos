# Offline Quick Start — Biller + Cashier (Multi-PC Same Branch)

> **Urgent setup** — same project, no API purchase. Manager/Super Admin stay on Firebase.

---

## 0. Same PC — shop server **nahi** chahiye (sab se aasaan)

**Ek laptop, do tabs — WiFi ON ho ya internet band, farq nahi** (jab tak pehle login ho chuka ho).

### Setup (2 minute)

```bash
npm install
npm run dev
```

Browser console **ek baar** (shop URL hata do agar pehle set ki thi):

```javascript
localStorage.removeItem('aone_shop_api_url');
location.reload();
```

### Do tabs — same Chrome profile

| Tab | Role | URL |
|-----|------|-----|
| Tab 1 | Biller | `http://localhost:3000/biller` |
| Tab 2 | Cashier | `http://localhost:3000/cashier` |

**Zaroori:** dono tabs **normal window** — Incognito mat use karo (alag storage hoti hai, bill sync nahi hota).

### Offline test (same PC)

1. Pehle **dono tabs login** karo (internet ON — sirf ek baar)
2. Internet band karo: router modem cable nikal do **ya** mobile data off (WiFi router ON rehne do)
3. Tab 1: bill banao → **2–3 sec** me Tab 2 pending list me dikhega
4. Tab 2: payment karo → Tab 1 paid dikhega
5. Internet wapas → Firebase sync background me

**Shop server:** run mat karo. **BroadcastChannel + Dexie** same browser me kaam karte hain.

---

## Internet — kis ko chahiye?

| Situation | Biller internet? | Cashier internet? | Shop server? |
|-----------|------------------|-------------------|--------------|
| **Pehli login** (naya user) | Haan (ek baar) | Haan (ek baar) | Nahi |
| **Pehle login ho chuka** — offline bill/pay | **Nahi** | **Nahi** | Nahi (same PC) |
| **Alag device** — WiFi ON, server **nahi** | Nahi | Nahi | Nahi — lekin bill **auto pending me nahi** aayega |
| **Alag device** — WiFi ON, server **haan** | Nahi | Nahi | Haan (laptop par `shop:server`) |
| Manager / Admin panel | Haan | — | — |

**Short answer:** Offline bill + pay ke liye **na biller na cashier ko internet lazmi** — bas **pehle ek baar login** chahiye tha. Alag devices par bina server ke **dono offline** reh sakte hain; cashier ko bill **serial se manually** lena padega (Offline Payment).

### WiFi ON, shop server **nahi** — ab kya hota hai?

| Same PC (2 tabs) | Alag device (laptop + phone) |
|------------------|------------------------------|
| Bill cashier list me **automatic** | Bill sirf biller ke browser me — cashier **pending me nahi** |
| Pay automatic match | Cashier: **Offline Payment** → serial + amount |
| WiFi = sirf app load; sync = local | WiFi = app load; data **share nahi** hota devices ke beech |

---

## 1. One-time setup (developer PC)

```bash
npm install
npm run shop:install
```

Add to `.env` (or set on each shop PC via browser console):

```env
VITE_SHOP_API_URL=http://192.168.1.100:3001
```

Replace `192.168.1.100` with your **shop server PC** LAN IP.

---

## 2. Shop server PC (always ON)

```bash
npm run shop:server
```

You should see:

```
[shop-server] ✅ http://localhost:3001
[shop-server] LAN: other PCs use http://<THIS-PC-IP>:3001
```

**Windows firewall:** Allow port **3001** for private network.

---

## 3. Biller + Cashier PCs (no VS Code, no npm)

```bash
# On developer PC — build once
npm run build
npx serve -s dist -l 8080
```

Other PCs open: `http://<SHOP-SERVER-IP>:8080`

Or use `npm run dev:network` during testing.

**Set shop API URL** (if not in `.env` build):

```javascript
// Browser console on each biller/cashier PC
localStorage.setItem('aone_shop_api_url', 'http://192.168.1.100:3001');
location.reload();
```

---

## 4. Test offline multi-PC

| Step | Action |
|------|--------|
| 1 | Start `npm run shop:server` on server PC |
| 2 | Biller PC: create bill offline (wifi off OK on biller if LAN works) |
| 3 | Cashier PC: bill appears in pending list within ~5–12 sec |
| 4 | Cashier: pay bill |
| 5 | Biller: sees paid / sync when internet returns |

---

## 5. Home WiFi testing (developer — laptop + Chromebook / mobile)

**No shop LAN needed.** Same home WiFi = same as LAN (`192.168.x.x`).

### Your setup

| Device | Role |
|--------|------|
| Laptop (Windows) | Shop server + optional biller tab |
| Chromebook or phone | Cashier (or biller) in Chrome |

### Step A — Laptop par 2 terminals

**Terminal 1 — shop server:**
```bash
npm run shop:server
```

**Terminal 2 — app (WiFi par share):**
```bash
npm run dev:network
```
Note the IP from output, e.g. `http://192.168.0.105:3000`

### Step B — Laptop IP dhoondo

```bash
ipconfig
```
Look for **IPv4** under WiFi, e.g. `192.168.0.105`

### Step C — Chromebook / mobile

1. Same WiFi connect karo (ghar wala router)
2. Chrome open: `http://192.168.0.105:3000` (apna IP use karo)
3. Console (F12) ya bookmark se API set karo:
```javascript
localStorage.setItem('aone_shop_api_url', 'http://192.168.0.105:3001');
location.reload();
```
4. Ek device par **Biller** login, doosri par **Cashier** login

### Step D — “Offline” test (internet band, WiFi ON)

| ✅ Do this | ❌ Not this |
|-----------|------------|
| Router se **modem/internet cable** nikal do (WiFi still ON) | Chrome DevTools → **Offline** (LAN bhi band ho jati hai) |
| Ya phone **mobile data OFF**, WiFi ON | Poora WiFi router band karna (devices connect nahi honge) |

App internet check karti hai Google se — internet na ho to **offline mode**, lekin `192.168.x.x:3001` shop server **chalta rahega**.

### Step E — Windows firewall (agar Chromebook connect na ho)

Allow ports **3000** and **3001** for **Private network**.

### Quick test — sirf laptop (no Chromebook)

Do browser windows: one **Biller**, one **Cashier** (incognito). Shop server optional; same PC Dexie bhi kaam karta hai.

---

## 6. Without shop server (reminder)

Same PC: Section **0** dekho. Alag device: Section **Internet** table — manual serial payment.

---

## 7. Scripts reference

| Command | Purpose |
|---------|---------|
| `npm run shop:install` | Install shop-server deps |
| `npm run shop:server` | Start LAN API (port 3001) |
| `npm run shop:dev` | Shop server with auto-reload |
| `npm run build` | Production app for shop PCs |
| `npm run dev:network` | Dev app on LAN (port 3000) |

---

## 8. Files added

| Path | Role |
|------|------|
| `shop-server/index.js` | LAN API + shared JSON DB |
| `src/services/shopApiService.js` | Frontend client |
| `src/utils/shopApiConfig.js` | `VITE_SHOP_API_URL` + localStorage |

---

## 9. Netlify — laptop biller offline + mobile cashier online

**No shop server.** Firebase = bridge between devices.

| Step | Device | Action |
|------|--------|--------|
| 1 | Both | Login once on `https://your-app.netlify.app` |
| 2 | Laptop | Biller — create bill **offline** (modem off, WiFi ON) |
| 3 | Mobile | Cashier **online** → **Offline Payment** → serial + amount from receipt |
| 4 | Laptop | Internet ON → bill auto-syncs → payment auto-matches |
| 5 | Laptop Biller | **Toast only:** "Bill paid by cashier" — Top 5 **not** shown as paid |
| 6 | Wrong amount | Mobile: review panel → **Correct serial/amount once** → Offline Payment again |

Cashier payment is saved to cloud as `pending_bill` until biller bill syncs.

---

## 10. Related docs

- [OFFLINE_SHOP_DEPLOYMENT_GUIDE.md](./OFFLINE_SHOP_DEPLOYMENT_GUIDE.md) — full architecture
- [OFFLINE_PAYMENT_RECONCILIATION.md](./OFFLINE_PAYMENT_RECONCILIATION.md) — payment matching
