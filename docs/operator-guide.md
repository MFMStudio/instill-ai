# Instill AI — Operator Guide

Self-hosting, backup/restore, and production hardening.

---

## Quick start

```bash
git clone <repo>
cd ai-consistency-platform
npm install
npm run build
node dist/server.js
```

Server listens on `PORT` (default 3500).

---

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `SESSION_SECRET` | **Yes (prod)** | 32+ random chars. Never use the default in production. |
| `NODE_ENV` | Recommended | Set to `production` to enable HTTPS-only cookies and HSTS. |
| `PORT` | No | Override default port 3500. |
| `APP_URL` | Yes (prod) | Your public URL, e.g. `https://instill.example.com`. Used for Stripe redirects. |
| `STRIPE_SECRET_KEY` | Checkout | Stripe secret key (`sk_live_…`). Leave blank to disable checkout. |
| `STRIPE_WEBHOOK_SECRET` | Checkout | Webhook signing secret (`whsec_…`). |
| `STRIPE_PRICE_PRO` | Checkout | Stripe Price ID for Pro plan. |
| `STRIPE_PRICE_TEAM` | Checkout | Stripe Price ID for Team plan. |
| `STRIPE_PRICE_BUSINESS` | Checkout | Stripe Price ID for Business plan. |

Generate a strong secret:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## Database

The SQLite database lives at `data/platform.db` (relative to the project root).

### WAL mode

WAL mode is enabled automatically on boot. It allows concurrent reads while a write is in progress — important for MCP clients that hit the server simultaneously.

### Backup

**Simple copy (safest):**
```bash
# While server is running — WAL checkpoint first
sqlite3 data/platform.db ".checkpoint TRUNCATE"
cp data/platform.db backups/platform-$(date +%Y%m%d-%H%M%S).db
```

**Or use SQLite's online backup API:**
```bash
sqlite3 data/platform.db ".backup backups/platform-$(date +%Y%m%d).db"
```

**Automated daily backup (cron):**
```cron
0 2 * * * cd /path/to/ai-consistency-platform && sqlite3 data/platform.db ".backup backups/platform-$(date +\%Y\%m\%d).db"
```

Keep at least 7 days of backups. Rotate with:
```bash
find backups/ -name "*.db" -mtime +7 -delete
```

### Restore

1. Stop the server.
2. Replace `data/platform.db` with the backup file.
3. Delete the WAL files if present: `rm -f data/platform.db-wal data/platform.db-shm`
4. Start the server.

```bash
pkill -f dist/server.js
cp backups/platform-20260508.db data/platform.db
rm -f data/platform.db-wal data/platform.db-shm
node dist/server.js
```

### Restore drill

Run a restore drill before you need it in an emergency:

1. Take a backup.
2. Stop the server.
3. Rename `data/platform.db` to `data/platform.db.orig`.
4. Restore the backup.
5. Start the server on a different port and verify `/api/me` returns correctly.
6. Swap back.

---

## Production TLS

The server does not terminate TLS itself. Use a reverse proxy:

**nginx snippet:**
```nginx
server {
    listen 443 ssl;
    server_name instill.example.com;

    ssl_certificate     /etc/letsencrypt/live/instill.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/instill.example.com/privkey.pem;

    location / {
        proxy_pass         http://127.0.0.1:3500;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection keep-alive;
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
    }
}
```

---

## macOS auto-start (Launch Agent)

```xml
<!-- ~/Library/LaunchAgents/com.instill.server.plist -->
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.instill.server</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/local/bin/node</string>
    <string>/path/to/ai-consistency-platform/dist/server.js</string>
  </array>
  <key>WorkingDirectory</key>
  <string>/path/to/ai-consistency-platform</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>SESSION_SECRET</key>
    <string>your-secret-here</string>
    <key>NODE_ENV</key>
    <string>production</string>
  </dict>
  <key>KeepAlive</key>
  <true/>
  <key>RunAtLoad</key>
  <true/>
  <key>StandardOutPath</key>
  <string>/tmp/instill.log</string>
  <key>StandardErrorPath</key>
  <string>/tmp/instill-error.log</string>
</dict>
</plist>
```

```bash
launchctl load ~/Library/LaunchAgents/com.instill.server.plist
```

---

## Log rotation

Server logs structured JSON to stdout. Pipe to a file and rotate:

```bash
node dist/server.js >> /var/log/instill/server.log 2>&1
```

With `logrotate`:
```
/var/log/instill/server.log {
    daily
    rotate 14
    compress
    missingok
    notifempty
    postrotate
        kill -USR1 $(cat /var/run/instill.pid) 2>/dev/null || true
    endscript
}
```

---

## Security checklist (before going live)

- [ ] `SESSION_SECRET` set to a 32+ char random value
- [ ] `NODE_ENV=production`
- [ ] TLS terminated at reverse proxy
- [ ] `APP_URL` set to your public HTTPS URL
- [ ] Stripe live keys configured (if using billing)
- [ ] Webhook endpoint registered in Stripe Dashboard
- [ ] First user registered (becomes admin automatically)
- [ ] Database backup cron scheduled
- [ ] Firewall: only expose 443 publicly; 3500 bound to localhost
