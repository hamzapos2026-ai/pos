# 11 — VPS deployment overview (short)

**Date:** 10 Jul 2026

## Current live architecture (today)

```
Browser PWA (Vite build)
  → Firebase Auth + Firestore (+ optional Cloud Functions)
  → Optional LAN shop-server (Express) for multi-PC offline
```

Hosting for the SPA is typically **Netlify** or **Vercel** (`netlify.toml` / `vercel.json`).  
`firebase.json` in this repo configures **Firestore + Functions**, not Hosting.

**This is not a Hostinger VPS app today.**

---

## Future VPS path (documented, not current runtime)

Playbook: `docs/master/05-VPS-DEPLOYMENT.md` (+ index `docs/master/00-MASTER-INDEX.md`).

Planned target stack:

| Layer | Technology |
|-------|------------|
| Server | Hostinger VPS, Ubuntu 22.04/24.04 |
| Process | Node.js + PM2 |
| Reverse proxy / TLS | Nginx + Certbot |
| Database | PostgreSQL + Prisma |
| API | Express REST |
| Admin UI | React (same look; new platform) |

High-level migration idea: keep current Firebase POS running until new system passes testing; export/import data; cut over carefully.

### Suggested VPS sizing (from master docs)

| Resource | Minimum | Recommended |
|----------|---------|-------------|
| RAM | 4 GB | 8 GB |
| CPU | 2 vCPU | 4 vCPU |
| Disk | 80 GB SSD | 160 GB SSD |

---

## Shop-floor offline (related, not full VPS)

See `docs/OFFLINE_SHOP_DEPLOYMENT_GUIDE.md`:

- Install `shop-server` on one always-on PC
- Point clients via `VITE_SHOP_API_URL`
- Use for multi-terminal billing when internet is weak

---

## Auditor takeaway

- **Now:** Firebase-backed Operational POS PWA (+ optional LAN server).  
- **Later:** VPS + PostgreSQL admin/platform migration is planned in `docs/master/` — schedule it as a separate program of work, not as “already deployed.”
