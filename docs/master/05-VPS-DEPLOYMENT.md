# Part 5 — Hostinger VPS Deployment

---

## 5.1 VPS purchase & specs

### 1. Purpose
Production server jahan PostgreSQL + API + Nginx chalega.

### 2. Why Hostinger VPS
Cost-effective, Ubuntu LTS, full root access.

### 3. Recommended specs (start)
| Resource | Minimum | Recommended |
|----------|---------|-------------|
| RAM | 4 GB | 8 GB |
| CPU | 2 vCPU | 4 vCPU |
| Disk | 80 GB SSD | 160 GB SSD |
| OS | Ubuntu 22.04 LTS | Ubuntu 24.04 LTS |

### 4. User tasks
1. Hostinger → VPS → Order plan  
2. Choose **Ubuntu 22.04/24.04**  
3. Note **IP address** and **root password**  
4. Domain: `admin.yourshop.com` + `api.yourshop.com` (or single domain `/api` proxy)

---

## 5.2 Initial server setup (AI generates script)

### `scripts/vps/01-bootstrap.sh`

```bash
#!/bin/bash
set -euo pipefail

# Update
apt update && apt upgrade -y

# Firewall
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

# Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# PostgreSQL 16
apt install -y postgresql postgresql-contrib

# PM2
npm install -g pm2

# Nginx + Certbot
apt install -y nginx certbot python3-certbot-nginx

# App user
useradd -m -s /bin/bash aoneapp || true
```

### 3. AI tasks
- Full bootstrap + deploy scripts
- `ecosystem.config.js` for PM2
- Nginx site configs
- Cron backup

### 4. User tasks
SSH into server, run bootstrap once

### 8. Commands (from your PC)
```bash
ssh root@YOUR_VPS_IP
# upload script or git clone repo
bash scripts/vps/01-bootstrap.sh
```

### 9. Verification
`node -v` → v20.x; `psql --version`; `nginx -t`

---

## 5.3 PostgreSQL production setup

```bash
sudo -u postgres psql <<EOF
CREATE USER aone WITH PASSWORD 'STRONG_PASSWORD_HERE';
CREATE DATABASE aone_admin OWNER aone;
GRANT ALL PRIVILEGES ON DATABASE aone_admin TO aone;
EOF
```

**Connection string:**
```
DATABASE_URL=postgresql://aone:PASSWORD@localhost:5432/aone_admin
```

Bind PostgreSQL localhost only (`/etc/postgresql/*/main/postgresql.conf`):
```
listen_addresses = 'localhost'
```

---

## 5.4 Deploy application

```bash
# As aoneapp user
cd /var/www/aone-admin-platform
git pull
cd apps/api && npm ci && npx prisma migrate deploy
cd ../web && npm ci && npm run build

pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

### `ecosystem.config.js`
```javascript
module.exports = {
  apps: [{
    name: 'aone-api',
    cwd: './apps/api',
    script: 'dist/index.js',
    instances: 2,
    exec_mode: 'cluster',
    env: { NODE_ENV: 'production', PORT: 3001 },
  }],
};
```

---

## 5.5 Nginx configuration

### API — `api.yourshop.com`
```nginx
server {
    listen 443 ssl http2;
    server_name api.yourshop.com;

    ssl_certificate /etc/letsencrypt/live/api.yourshop.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.yourshop.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        client_max_body_size 50M;
    }
}
```

### Web — `admin.yourshop.com`
```nginx
server {
    listen 443 ssl http2;
    server_name admin.yourshop.com;
    root /var/www/aone-admin-platform/apps/web/dist;
    index index.html;

    ssl_certificate /etc/letsencrypt/live/admin.yourshop.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/admin.yourshop.com/privkey.pem;

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

### SSL
```bash
certbot --nginx -d api.yourshop.com -d admin.yourshop.com
```

---

## 5.6 Automatic backup

### `scripts/vps/backup-db.sh` (cron daily 2 AM)
```bash
#!/bin/bash
BACKUP_DIR=/var/backups/aone
mkdir -p $BACKUP_DIR
FILENAME=aone_admin_$(date +%Y%m%d_%H%M).sql.gz
pg_dump -U aone aone_admin | gzip > "$BACKUP_DIR/$FILENAME"
find $BACKUP_DIR -name "*.sql.gz" -mtime +14 -delete
```

```bash
crontab -e
# 0 2 * * * /var/www/aone-admin-platform/scripts/vps/backup-db.sh
```

**Off-site:** rsync to Google Drive / Hostinger backup storage weekly.

---

## 5.7 Monitoring & auto-restart

| Tool | Purpose |
|------|---------|
| PM2 | Auto-restart on crash |
| `pm2 monit` | CPU/memory |
| UptimeRobot | HTTPS ping alert (free) |
| `GET /api/health` | DB connectivity |

```bash
pm2 install pm2-logrotate
```

---

## 5.8 DNS setup (user)

| Type | Name | Value |
|------|------|-------|
| A | admin | VPS_IP |
| A | api | VPS_IP |

Wait 5–60 min propagation.

---

## 5.9 Section — Production deploy (15 points)

### 1. Purpose
Live system on internet with SSL.

### 2. Why Nginx + PM2
Standard, reliable, beginner tutorials abundant.

### 3. AI tasks
All scripts in `scripts/vps/`

### 4. User tasks
DNS, SSL email, first deploy SSH

### 5. Expected output
`https://admin.yourshop.com` loads login

### 6. Folder
`scripts/vps/`, `/var/www/aone-admin-platform`

### 7. Files
`01-bootstrap.sh`, `backup-db.sh`, `nginx/*.conf`, `ecosystem.config.js`

### 8. Commands
See above sections

### 9. Verification
- SSL padlock in browser  
- Login works  
- Manager sees only own branch  

### 10. Common errors
| Error | Fix |
|-------|-----|
| 502 Bad Gateway | `pm2 logs aone-api` |
| Certbot failed | DNS not pointed yet |
| DB connection refused | Check DATABASE_URL localhost |

### 11. Troubleshooting
`journalctl -u nginx -f`

### 12. Best practices
SSH key not password; disable root SSH after setup

### 13. Production
Separate staging VPS optional; never `prisma migrate dev` on prod — use `migrate deploy`

### 14. Beginner
VPS = rent computer internet par; Nginx = darwaza; PM2 = guard jo app restart kare.

### 15. Next
Part 6 Testing

---

**Next:** [Part 6 — Testing & Operations](./06-TESTING-OPS.md)
