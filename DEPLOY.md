# content-pipeline deployment

Target host: **backend VPS** (same host as the existing tradingview pipeline).

## Hard constraints

- Zero impact on the tradingview screenshot + Claude analysis pipeline running on this host.
- All operations below are scoped, reversible, and additive.

## Pre-deployment checklist

Run on the target VPS before installing anything:

```bash
pm2 list                                    # snapshot current apps + memory
sudo ss -tlnp | grep -E ':80|:443|:4000'    # confirm 4000 is free; identify 80/443 owner
df -h /                                     # confirm ≥10GB free
free -m                                     # confirm ≥600MB RAM headroom
```

Decision points:
- **Ports 80/443:** if nginx already fronts 80/443, skip the Caddy install and add a `pipeline.xerogravity.com` vhost to the existing nginx config instead. If nothing, proceed with Caddy.
- **Port 4000:** if in use, pick another unused high port and update `PORT=` in `.env`.
- **03:00 UTC drive time:** if the tradingview backend has heavy cron windows at 03:00 UTC, edit `src/scheduler/index.ts` and pick a different hour.

## First-time install

```bash
ssh backend-vps

# 1. Infra
sudo apt install -y caddy postgresql-15
sudo systemctl enable --now postgresql
sudo -u postgres psql -c "CREATE DATABASE content_pipeline;"
sudo -u postgres psql -c "CREATE USER pipeline WITH PASSWORD 'REPLACE_ME';"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE content_pipeline TO pipeline;"

# 2. App
sudo mkdir -p /srv/content-pipeline && sudo chown "$USER:" /srv/content-pipeline
cd /srv/content-pipeline
git clone <your-content-pipeline-repo-url> .
cp .env.example .env && vim .env            # fill keys; set DISABLE_CRON=true
source ~/.nvm/nvm.sh
npm ci
npm run build
npm run db:migrate
npm run seed:keywords

# 3. Secrets
# Place google-service-account.json in /srv/content-pipeline/ (gitignored).
# Ensure GOOGLE_SERVICE_ACCOUNT_JSON_PATH in .env points to it.
#
# Inline images use Openverse (anonymous, no key) with Wikimedia Commons as
# fallback — no additional setup needed.

# 4. Start (cron disabled for first hour)
pm2 start ecosystem.config.cjs
pm2 save
curl http://localhost:4000/health           # expect {"ok":true,...}

# 5. Proxy
sudo vim /etc/caddy/Caddyfile               # append the Caddyfile.example block
sudo systemctl reload caddy

# 6. Observe 1hr, compare `pm2 list` with baseline — tradingview memory should be unchanged
pm2 set content-pipeline:DISABLE_CRON false
pm2 restart content-pipeline
```

## Ongoing deploys

```bash
ssh backend-vps
cd /srv/content-pipeline
git pull
source ~/.nvm/nvm.sh
npm ci
npm run build
npm run db:migrate
pm2 restart content-pipeline
```

## Rollback

```bash
pm2 delete content-pipeline
pm2 save
# Postgres install stays but is inert. Caddy vhost removal: one block in /etc/caddy/Caddyfile.
```

## Backups

Add the following to the host's own crontab (system cron, not node-cron):

```
0 3 * * * pg_dump -U pipeline -F c content_pipeline | gzip > $HOME/backups/cp-$(date +\%F).dump.gz
30 3 * * * rsync -a --delete /srv/content-pipeline/storage/images/ $HOME/backups/cp-images/
0 4 * * 0 find $HOME/backups -name 'cp-*.dump.gz' -mtime +14 -delete
```
