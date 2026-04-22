# VPS deployment

This document describes a sanitized production deployment shape for BCBE Votes. It is intentionally example-only and must not be treated as a source of live secrets, certificates, or host-specific values.

## Production shape

Traffic flow:

Cloudflare -> VPS -> Nginx -> static frontend + proxied Node API

Runtime components:

- Nginx serves the built frontend from `client/dist`
- Nginx proxies `/api/*` to the local Node/Express backend on `127.0.0.1:4000`
- systemd manages the backend process
- PostgreSQL runs locally on the VPS
- certbot manages TLS certificates

## App build commands

Backend:

```bash
cd /srv/bcbe-votes/server
npm install
npm run build
```

Frontend:

```bash
cd /srv/bcbe-votes/client
npm install
npm run build
```

## Recommended filesystem layout

Example only:

```text
/srv/bcbe-votes/
  client/
  server/
```

Example publish target:

```text
/var/www/bcbe-votes/
```

## Backend environment

Create a real `.env` on the server only. Do not commit it.

Example:

```env
NODE_ENV=production
PORT=4000
DATABASE_URL=postgresql:///bcbe_votes?host=/var/run/postgresql
CORS_ORIGIN=https://example.com,https://www.example.com
RATE_LIMIT_WINDOW_MINUTES=15
RATE_LIMIT_MAX=300
ADMIN_BASIC_USER=
ADMIN_BASIC_PASS=
LOG_LEVEL=info
ENABLE_REQUEST_LOGS=false
```

Notes:

- Keep real credentials out of git.
- If the backend uses local PostgreSQL over a unix socket or localhost, the application should not force SSL for that DB connection.
- The frontend can use same-origin `/api` and usually does not need `VITE_API_URL` in production when Nginx proxies `/api/*`.

## Nginx example

See `deploy/nginx/site.conf.example`.

High-level behavior:

- serve static files from the built frontend
- proxy `/api/` to `http://127.0.0.1:4000`
- fall back to `/index.html` for SPA routes
- redirect HTTP to HTTPS after certificates are issued

## systemd example

See `deploy/systemd/bcbe-votes-api.service.example`.

High-level behavior:

- `WorkingDirectory` points at the server directory
- `EnvironmentFile` points at the server-only `.env`
- `ExecStart` runs `npm run start`
- `Restart=always`

## TLS

Install certbot and the nginx plugin on the VPS, then issue certificates for the intended public hostnames.

Example:

```bash
sudo apt-get update
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d example.com -d www.example.com --redirect
```

Do not commit anything from:

- `/etc/letsencrypt/`
- `/etc/nginx/sites-available/`
- `/etc/nginx/sites-enabled/`
- `/etc/systemd/system/`

Those paths contain live machine state and may contain sensitive material.

## Verification checklist

Public checks:

```bash
curl -I https://example.com
curl https://example.com/api/health
curl https://example.com/api/stats
curl -I https://example.com/votes
```

Local checks:

```bash
systemctl status bcbe-votes-api.service
sudo nginx -t
curl http://127.0.0.1:4000/api/health
curl http://127.0.0.1/api/health
```

## Rollback outline

- keep a backup copy of the previous nginx config before replacing it
- keep deploy backups outside git
- if a deploy fails:
  - restore previous nginx config
  - reload nginx
  - restore prior build artifacts if needed
  - restart the backend service

## Keep local only

Never commit:

- `.env`
- deploy backups
- live nginx config from `/etc/nginx`
- live systemd units from `/etc/systemd/system`
- certbot and letsencrypt files
- built frontend or backend output unless the repository explicitly intends to version build artifacts
