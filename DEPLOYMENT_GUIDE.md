# 🚀 A One Jewelry POS — Deployment Guide

## Overview

This POS works in 3 modes:
1. **Development** — `npm run dev` (HTTPS auto via basic-ssl)
2. **Local Network** — Shop devices on WiFi (HTTPS required for PWA)
3. **Production** — Cloud hosting (HTTPS via Firebase Hosting)

---

## ✅ MODE 1: Development (Localhost)

```bash
npm run dev
```

Access:
- `https://localhost:3000` (your dev machine)
- Accept SSL warning (click "Advanced" → "Proceed")
- ✅ PWA installable
- ✅ Service Worker active

---

## ✅ MODE 2: Local Network (Shop WiFi) — RECOMMENDED FOR SHOPS

### Prerequisites:
- Server PC and shop devices on SAME WiFi network
- Server PC IP: e.g., `192.168.0.118` (find via `ipconfig` / `ifconfig`)

### Setup:

```bash
# On server PC:
npm run dev
```

Access from shop devices:
1. Open Chrome on Chromebook/tablet
2. Visit: `https://192.168.0.118:3000` (replace with your IP)
3. SSL warning appears → Click "Advanced" → "Proceed to 192.168.0.118 (unsafe)"
4. App loads
5. Chrome address bar → install icon (⊕) → Install
6. App now available as standalone PWA

### Make IP Permanent:
Configure router to assign static IP to server PC.

---

## ✅ MODE 3: Production (Cloud Hosting)

### Option A: Firebase Hosting (RECOMMENDED — Free + Easy)

```bash
# 1. Install Firebase CLI
npm install -g firebase-tools

# 2. Login
firebase login

# 3. Initialize hosting
firebase init hosting
# → Select project
# → Public directory: dist
# → Configure as SPA: Yes
# → Set up automatic builds: No
# → Overwrite index.html: No

# 4. Build production
npm run build

# 5. Deploy
firebase deploy --only hosting

# Output:
# ✔ Deploy complete!
# Hosting URL: https://your-project.web.app
```

✅ Auto HTTPS  
✅ Auto PWA  
✅ Global CDN  
✅ Free SSL certificate

### Option B: Vercel

```bash
npm install -g vercel
vercel
# Follow prompts
```

### Option C: Netlify

```bash
npm install -g netlify-cli
npm run build
netlify deploy --prod --dir=dist
```

### Option D: Self-Hosted (VPS / Server)

```bash
# 1. Build
npm run build

# 2. Upload `dist/` folder to server

# 3. Setup Nginx with HTTPS (Let's Encrypt)
sudo certbot --nginx -d yourdomain.com

# 4. Nginx config:
```

```nginx
server {
    listen 443 ssl;
    server_name yourdomain.com;
    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;
    
    root /var/www/aone-pos/dist;
    index index.html;
    
    location / {
        try_files $uri $uri/ /index.html;
    }
    
    # Service Worker
    location /sw.js {
        add_header Cache-Control "no-cache";
        proxy_cache_bypass $http_pragma;
        proxy_cache_revalidate on;
        expires off;
        access_log off;
    }
}
```

---

## 🔐 SECURITY CHECKLIST (BEFORE GOING LIVE)

- [ ] Firestore rules deployed and tested
- [ ] All users have role field set (`biller`, `admin`, `superadmin`, `cashier`)
- [ ] Super admin account created and tested
- [ ] Biller cannot delete (verified)
- [ ] HTTPS active (no http:// access)
- [ ] Firebase API keys restricted to your domain
- [ ] Environment variables not committed to Git
- [ ] `.env` in `.gitignore`
- [ ] Audit logs flowing to Firestore

---

## 🛠️ TROUBLESHOOTING

### Problem: PWA not installing on LAN IP
**Solution:** Make sure URL starts with `https://`, not `http://`

### Problem: SSL certificate error in browser
**Solution:** Click "Advanced" → "Proceed". This is expected for self-signed cert.

### Problem: Other devices can't connect to LAN URL
**Solution:**
- Check Windows Firewall: Allow Node.js / Vite on port 3000
- Verify all devices on same WiFi
- Try `ping 192.168.0.118` from device

### Problem: "Failed to fetch" errors
**Solution:**
- Check Firebase API keys in `.env`
- Verify Firebase project active
- Check internet connection

### Problem: Service worker not updating
**Solution:**
- Chrome DevTools → Application → Service Workers
- Click "Unregister"
- Hard refresh (Ctrl+Shift+R)

---

## 📞 SUPPORT

- Firebase Console: https://console.firebase.google.com
- Project URL: [your-project-url]
- Admin Email: [your-email]
