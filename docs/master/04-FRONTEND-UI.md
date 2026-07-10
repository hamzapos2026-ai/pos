# Part 4 — Frontend (Same UI, New API)

---

## 4.1 Golden rule — same UX, modern look

### 1. Purpose
Purani admin/manager UI ka **layout, menus, tables, flows same** rakho; data source Firebase → REST API; colors **thore modern/stylish**.

### 2. Why copy-not-redesign
Users ko retraining nahi; risk kam; faster go-live. Sirf color palette refresh.

### 3. AI tasks
- Copy files from old repo (list below)
- Add `theme-modern.css` — richer gold, better dark mode, subtle hover
- Create `src/api/client.js` axios/fetch wrapper with JWT
- Replace Firestore hooks with React Query + API calls
- Remove Firebase imports from new web app entirely

### 4. User tasks
Side-by-side screenshot compare old vs new (Part 6 UAT)

### 5. Expected output
Visually identical; network tab shows `api.yourdomain.com` not `firestore.googleapis.com`

---

## 4.2 Files to copy from old POS

| Source (old repo) | Destination (new repo) |
|-------------------|------------------------|
| `src/styles/index.css` | `apps/web/src/styles/index.css` |
| `src/components/shared/glassUiTheme.js` | same path |
| `src/components/ui/*` | same |
| `src/components/admin/AdminSidebar.jsx` | same |
| `src/components/admin/AdminHeader.jsx` | same |
| `src/components/admin/StatCard.jsx` | same |
| `src/components/manager/ManagerPageLayout.jsx` | same |
| `src/components/manager/DataTable.jsx` | same |
| `src/context/ThemeContext.jsx` | same |
| `src/context/LanguageContext.jsx` | same |
| `src/lang/en.json`, `ur.json` | same (trim biller/cashier keys optional) |
| `src/pages/auth/LoginPage.jsx` | wire to `/api/auth/login` |
| `src/pages/admin/*` (reports, customers, bills, cashflow) | API wire |
| `src/pages/manager/*` | API wire |

**Do NOT copy:** biller, cashier pages, Firebase services, sync workers.

---

## 4.3 Routes (new app only)

```
/                 → RoleBasedRedirect
/login            → LoginPage
/setup            → SetupPage (only if needsSetup)
/admin/*          → Super Admin (all branches)
/manager/*        → Manager (branch locked)
/unauthorized     → 403 page
```

### Roles in new app
| Role | Home |
|------|------|
| SUPER_ADMIN | `/admin` |
| MANAGER | `/manager` |

---

## 4.4 API client pattern

```javascript
// apps/web/src/api/client.js
const API = import.meta.env.VITE_API_URL;

export async function apiGet(path, token) {
  const res = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    credentials: 'include',
  });
  if (res.status === 401) { /* redirect login */ }
  if (!res.ok) throw await res.json();
  return res.json();
}
```

Use **TanStack Query** for caching:
```javascript
const { data } = useQuery({
  queryKey: ['orders', filters],
  queryFn: () => apiGet(`/orders?${qs}`, token),
});
```

---

## 4.5 Allowed UI improvements only

| OK | NOT OK |
|----|--------|
| Faster table load (virtualization) | New color scheme |
| `aria-label` on buttons | Different sidebar layout |
| Smoother page transitions | New font family |
| Mobile overflow fix | Removing dark mode |
| Skeleton loaders (same colors) | Redesign cards |

---

## 4.6 Dark / light mode

Copy `ThemeContext` unchanged. CSS variables in `index.css` stay same:
- Background `#0a0805`
- Accent `#f59e0b` (amber)
- Glass cards `backdrop-filter`

---

## 4.7 Section — Frontend build (15 points)

### 1. Purpose
Deployable React app.

### 2. Why Vite
Same as old POS; fast HMR.

### 3. AI tasks
Full `apps/web` with all admin/manager pages wired.

### 4. User tasks
`VITE_API_URL` point to API.

### 5. Expected output
`npm run build` → `dist/` static files for Nginx.

### 6. Folder
`apps/web/`

### 7. Files
`vite.config.js`, `src/App.jsx`, pages, components

### 8. Commands
```bash
cd apps/web
npm install
npm run dev      # http://localhost:5173
npm run build
```

### 9. Verification
Login as Super Admin → Dashboard loads same stats layout

### 10. Common errors
| Error | Fix |
|-------|-----|
| CORS blocked | Set API `CORS_ORIGIN` |
| 401 loop | Check token storage |

### 11. Troubleshooting
React DevTools → check AuthContext user.branchId

### 12. Best practices
One `api/` module per domain (orders, customers)

### 13. Production
Nginx serves `dist/`; `try_files $uri /index.html`

### 14. Beginner
UI same painting; sirf painting ke peeche wire badli (Firebase → API).

### 15. Next
Part 5 VPS

---

**Next:** [Part 5 — VPS Deployment](./05-VPS-DEPLOYMENT.md)
