# Suprero v0 — Plan 5: Phase 2/3 Migration — Seed XeroGravity Tenant + Backfill site_id

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every existing pipeline row in prod belong to a real tenant. After this plan, the XeroGravity organization and a single `xerogravity` site exist, and every row in `articles`, `seed_keywords`, `keyword_results`, `dataforseo_tasks`, `image_usage` has `site_id` populated to point at that site. Pipeline code still doesn't read `site_id` (that lands in Plan 6), but the data is now ready for it.

**Architecture:** Pure data migration in `content-pipeline/`. One idempotent SQL script that:
1. UPSERTs an `organization` row (slug=`xerogravity`).
2. UPSERTs a `site` row (slug=`xerogravity` under that org), with `categories` populated from existing `seed_keywords`.
3. UPDATEs `site_id` on the 5 nullable columns added in Plan 1, only where currently NULL.

No schema changes. No drizzle migration. The script runs once on prod via `psql`. Idempotent — running twice is a no-op.

**Tech stack:** Plain SQL via psql. No code in suprero-app or pipeline changes.

**Spec:** [`docs/superpowers/specs/2026-05-08-suprero-v0-design.md`](../specs/2026-05-08-suprero-v0-design.md)

**Decisions:**

- **One site per tenant in v0.** XG gets one site, slug `xerogravity`. (Plan 7+ may add multi-site support per org if needed.)
- **No customer member row for XG.** Staff (Suprero Staff org) access XG via the staff guard — no need for a "fake customer" user. When operator-side dashboards land (Plan 7), staff sees XG in the site switcher because staff guard bypasses the membership join.
- **Idempotent SQL, not a drizzle migration.** This is data, not schema. Scripts in `content-pipeline/scripts/` is the existing convention for one-shot ops (e.g., `dedupe:run`, `dedupe:audit`).
- **Backfill is `WHERE site_id IS NULL` so re-running it skips already-tagged rows.** This also means rows added between the script run and Plan 6's NOT NULL deploy will still get `NULL` → must run a small backfill again right before Plan 6's `SET NOT NULL`.
- **Categories on the site row:** populate from `(SELECT DISTINCT category FROM seed_keywords)` so we don't lose the current XG taxonomy. Default category: `'concepts'` (matches the most-used).

---

## Pre-conditions

- Plan 3's migration 0004 deployed to prod (`customer_invite` table exists).
- Prod content-pipeline running stably on `feat/customer-invite` (or `main` once that branch merges).
- Staff seats verified working in suprero-app dev.
- xerogravity.com publishing pipeline currently green (no in-flight failures).

---

## File Structure

| Path | Action | Responsibility |
|---|---|---|
| `content-pipeline/scripts/seed-xg-and-backfill.sql` | Create | The idempotent SQL script |
| `content-pipeline/docs/superpowers/plans/2026-05-10-suprero-v0-plan-5-seed-xg-and-backfill.md` | Create | This file |

No application code changes.

---

## Tasks

### Task 1: Pre-flight

**Working directory:** `/Users/anish/Desktop/work/zeeahmed/tradingview/content-pipeline`

- [ ] **Step 1: Confirm clean working tree**

```bash
git status -sb
git log --oneline -3
```

- [ ] **Step 2: Confirm prod is healthy**

```bash
curl -s -o /dev/null -w "pipeline=%{http_code} xero=" "https://pipeline.xerogravity.com/api/articles?limit=1"
curl -s -o /dev/null -w "%{http_code}\n" "https://xerogravity.com"
```

Expected: `pipeline=200 xero=200`.

- [ ] **Step 3: Confirm 0004 is on prod**

```bash
SSHPASS='vY8$mK3#pL9@qZ2x' sshpass -e ssh -o StrictHostKeyChecking=no backend-vps \
  "sudo -u postgres psql -d content_pipeline -c '\\dt customer_invite'"
```

Expected: 1 row (table exists).

---

### Task 2: Write the seed + backfill SQL

**Files:**
- Create: `scripts/seed-xg-and-backfill.sql`

The script lives under `scripts/` and is idempotent — running it twice does nothing the second time.

- [ ] **Step 1: Write the script**

```sql
-- Seed the XeroGravity tenant and backfill site_id on existing pipeline rows.
-- Idempotent: re-running this script is a no-op once the tenant and backfill exist.
--
-- Run via:
--   psql "$DATABASE_URL" -f scripts/seed-xg-and-backfill.sql

\set ON_ERROR_STOP on
BEGIN;

-- 1. Upsert the XeroGravity organization
DO $$
DECLARE
  v_org_id text;
  v_site_id uuid;
  v_categories jsonb;
BEGIN
  -- Insert or get the organization
  INSERT INTO organization (id, name, slug, metadata, created_at)
  VALUES (gen_random_uuid()::text, 'XeroGravity', 'xerogravity',
          '{"isInternal":true,"description":"Original Suprero pipeline tenant"}'::jsonb, now())
  ON CONFLICT (slug) DO NOTHING;

  SELECT id INTO v_org_id FROM organization WHERE slug = 'xerogravity';
  RAISE NOTICE 'XG org id: %', v_org_id;

  -- Pull canonical categories from existing seed_keywords
  SELECT COALESCE(jsonb_agg(DISTINCT category ORDER BY category), '[]'::jsonb)
  INTO v_categories
  FROM seed_keywords
  WHERE category IS NOT NULL;
  RAISE NOTICE 'XG categories: %', v_categories;

  -- Insert or get the site
  INSERT INTO site (
    organization_id, name, slug, categories, default_category,
    publishing_mode, schedule_enabled, target_word_count, created_at, updated_at
  )
  VALUES (
    v_org_id, 'XeroGravity', 'xerogravity', v_categories, 'concepts',
    'auto_publish', true, 1500, now(), now()
  )
  ON CONFLICT (organization_id, slug) DO NOTHING;

  SELECT id INTO v_site_id FROM site WHERE organization_id = v_org_id AND slug = 'xerogravity';
  RAISE NOTICE 'XG site id: %', v_site_id;

  -- 2. Backfill site_id on all 5 pipeline tables (only NULL rows)
  UPDATE articles         SET site_id = v_site_id WHERE site_id IS NULL;
  UPDATE seed_keywords    SET site_id = v_site_id WHERE site_id IS NULL;
  UPDATE keyword_results  SET site_id = v_site_id WHERE site_id IS NULL;
  UPDATE dataforseo_tasks SET site_id = v_site_id WHERE site_id IS NULL;
  UPDATE image_usage      SET site_id = v_site_id WHERE site_id IS NULL;
END $$;

-- 3. Report final state
SELECT 'articles' AS t, count(*) AS total, count(site_id) AS with_site_id FROM articles
UNION ALL SELECT 'seed_keywords',    count(*), count(site_id) FROM seed_keywords
UNION ALL SELECT 'keyword_results',  count(*), count(site_id) FROM keyword_results
UNION ALL SELECT 'dataforseo_tasks', count(*), count(site_id) FROM dataforseo_tasks
UNION ALL SELECT 'image_usage',      count(*), count(site_id) FROM image_usage;

COMMIT;
```

Expected: `total = with_site_id` for every row → every row has been backfilled.

- [ ] **Step 2: Commit the script**

```bash
git add scripts/seed-xg-and-backfill.sql
git commit -m "chore: add idempotent SQL to seed XG tenant and backfill site_id"
```

---

### Task 3: Run locally (against dev DB)

**Working directory:** `/Users/anish/Desktop/work/zeeahmed/tradingview/content-pipeline`

- [ ] **Step 1: Capture row counts BEFORE**

```bash
DEV_URL=$(grep -E '^DATABASE_URL=' .env | head -1 | cut -d= -f2- | tr -d '"')

psql "$DEV_URL" -At -c "
SELECT 'articles' AS t, count(*) AS total, count(site_id) AS with_id FROM articles
UNION ALL SELECT 'seed_keywords',    count(*), count(site_id) FROM seed_keywords
UNION ALL SELECT 'keyword_results',  count(*), count(site_id) FROM keyword_results
UNION ALL SELECT 'dataforseo_tasks', count(*), count(site_id) FROM dataforseo_tasks
UNION ALL SELECT 'image_usage',      count(*), count(site_id) FROM image_usage;
" > /tmp/p5-before.txt
cat /tmp/p5-before.txt
```

- [ ] **Step 2: Run the script**

```bash
psql "$DEV_URL" -f scripts/seed-xg-and-backfill.sql 2>&1 | tail -20
```

Expected: `NOTICE` lines printing the org id, site id, and the categories array. Final SELECT shows `total = with_id` for every row.

- [ ] **Step 3: Run again to confirm idempotence**

```bash
psql "$DEV_URL" -f scripts/seed-xg-and-backfill.sql 2>&1 | tail -10
```

Expected: same final state. No new orgs/sites created. No backfill rows updated (because all are now non-NULL).

- [ ] **Step 4: Verify**

```bash
psql "$DEV_URL" -c "SELECT name, slug FROM organization WHERE slug='xerogravity';"
psql "$DEV_URL" -c "SELECT name, slug, categories, default_category FROM site WHERE slug='xerogravity';"
```

Expected: 1 row each. Categories array contains the categories used in the dev DB.

---

### Task 4: Dry-run against prod snapshot

**Working directory:** `/Users/anish/Desktop/work/zeeahmed/tradingview/content-pipeline`

This catches data-shape issues before prod. Mandatory.

- [ ] **Step 1: Snapshot prod**

```bash
SSHPASS='vY8$mK3#pL9@qZ2x' sshpass -e ssh -o StrictHostKeyChecking=no backend-vps \
  "sudo -u postgres pg_dump --format=plain --no-owner --no-privileges content_pipeline" \
  > prod-snapshot-pre-p5.sql
ls -la prod-snapshot-pre-p5.sql
```

- [ ] **Step 2: Restore to dryrun DB**

```bash
DEV_URL=$(grep -E '^DATABASE_URL=' .env | head -1 | cut -d= -f2- | tr -d '"')
ADMIN_URL=$(echo "$DEV_URL" | sed -E 's#/[^/?]+(\?|$)#/postgres\1#')
DRYRUN_URL=$(echo "$DEV_URL" | sed -E 's#/[^/?]+(\?|$)#/content_pipeline_dryrun\1#')

psql "$ADMIN_URL" -c "DROP DATABASE IF EXISTS content_pipeline_dryrun;"
psql "$ADMIN_URL" -c "CREATE DATABASE content_pipeline_dryrun;"
grep -v -E '^\\(restrict|unrestrict)' prod-snapshot-pre-p5.sql > /tmp/p5-clean.sql
psql "$DRYRUN_URL" -f /tmp/p5-clean.sql > /tmp/p5-restore.log 2>&1
tail -3 /tmp/p5-restore.log
```

- [ ] **Step 3: Capture prod row counts BEFORE**

```bash
psql "$DRYRUN_URL" -At -c "
SELECT 'articles' AS t, count(*) AS total, count(site_id) AS with_id FROM articles
UNION ALL SELECT 'seed_keywords',    count(*), count(site_id) FROM seed_keywords
UNION ALL SELECT 'keyword_results',  count(*), count(site_id) FROM keyword_results
UNION ALL SELECT 'dataforseo_tasks', count(*), count(site_id) FROM dataforseo_tasks
UNION ALL SELECT 'image_usage',      count(*), count(site_id) FROM image_usage;
" | sort > /tmp/p5-prod-before.txt
cat /tmp/p5-prod-before.txt
```

Expected: `with_id = 0` for every row (Plan 1 left them all NULL).

- [ ] **Step 4: Run the script against the dryrun**

```bash
psql "$DRYRUN_URL" -f scripts/seed-xg-and-backfill.sql 2>&1 | tail -15
```

Expected: NOTICE lines + final report. `total = with_id` for every row.

- [ ] **Step 5: Verify total counts unchanged (only `with_id` should change)**

```bash
psql "$DRYRUN_URL" -At -c "
SELECT 'articles' AS t, count(*) AS total, count(site_id) AS with_id FROM articles
UNION ALL SELECT 'seed_keywords',    count(*), count(site_id) FROM seed_keywords
UNION ALL SELECT 'keyword_results',  count(*), count(site_id) FROM keyword_results
UNION ALL SELECT 'dataforseo_tasks', count(*), count(site_id) FROM dataforseo_tasks
UNION ALL SELECT 'image_usage',      count(*), count(site_id) FROM image_usage;
" | sort > /tmp/p5-prod-after.txt
diff /tmp/p5-prod-before.txt /tmp/p5-prod-after.txt
echo "diff_exit=$?"
```

Expected: total counts identical (no rows added or removed). `with_id` changes from 0 → total for each table.

- [ ] **Step 6: Run pipeline tests against the dryrun DB**

```bash
DATABASE_URL="$DRYRUN_URL" npm test 2>&1 | tail -8
```

Expected: all tests pass. Pipeline code doesn't care about `site_id`, so backfilling shouldn't break anything.

- [ ] **Step 7: Boot pipeline locally against dryrun and curl /api/articles**

```bash
DATABASE_URL="$DRYRUN_URL" DISABLE_CRON=true PORT=4001 nohup npm run dev > /tmp/p5-dryrun-srv.log 2>&1 &
DEV_PID=$!
for i in $(seq 1 30); do curl -fsS -o /dev/null http://localhost:4001/api/articles?limit=1 2>/dev/null && break; sleep 1; done
curl -s "http://localhost:4001/api/articles?limit=3" | head -c 400
kill $DEV_PID 2>/dev/null
wait $DEV_PID 2>/dev/null
rm -f /tmp/p5-dryrun-srv.log
```

Expected: JSON with articles. Pipeline serves normally with backfilled rows.

- [ ] **Step 8: Cleanup dryrun**

```bash
psql "$ADMIN_URL" -c "DROP DATABASE content_pipeline_dryrun;"
rm -f prod-snapshot-pre-p5.sql /tmp/p5-clean.sql /tmp/p5-restore.log /tmp/p5-prod-before.txt /tmp/p5-prod-after.txt
```

---

### Task 5: USER GATE — Apply to prod

**STOP. The next step modifies prod data.** Confirm with the user before proceeding.

- [ ] **Step 1: Ask user for explicit go-ahead**

Wait for "Proceed with prod backfill (Plan 5 Phase 2/3)." If the user declines, stop here.

A "quiet window" matters less than for Plan 1 because no schema lock — UPDATEs only take row locks. But still avoid the cron tick: don't run at HH:00 or HH:15 etc.

- [ ] **Step 2: Push the script to origin**

```bash
git push origin feat/customer-invite
```

(Or whatever branch this work lives on. The script is on whatever branch we committed it to in Task 2 — likely the same `feat/customer-invite` until that merges to main.)

- [ ] **Step 3: SSH to prod, pull the script, run it**

```bash
SSHPASS='vY8$mK3#pL9@qZ2x' sshpass -e ssh -o StrictHostKeyChecking=no backend-vps "
  cd /srv/content-pipeline &&
  git fetch origin &&
  git checkout feat/customer-invite &&
  git pull --ff-only origin feat/customer-invite &&
  ls -la scripts/seed-xg-and-backfill.sql &&
  sudo -u postgres psql -d content_pipeline -f scripts/seed-xg-and-backfill.sql 2>&1 | tail -25
"
```

Expected: NOTICE lines printing the org/site ids + the categories. Final report shows `total = with_id` for every row.

- [ ] **Step 4: Verify prod state**

```bash
SSHPASS='vY8$mK3#pL9@qZ2x' sshpass -e ssh -o StrictHostKeyChecking=no backend-vps "
  sudo -u postgres psql -d content_pipeline -c \"
    SELECT name, slug FROM organization WHERE slug='xerogravity';
  \"
  sudo -u postgres psql -d content_pipeline -c \"
    SELECT 'articles' AS t, count(*) AS total, count(site_id) AS with_id FROM articles
    UNION ALL SELECT 'seed_keywords',    count(*), count(site_id) FROM seed_keywords
    UNION ALL SELECT 'keyword_results',  count(*), count(site_id) FROM keyword_results
    UNION ALL SELECT 'dataforseo_tasks', count(*), count(site_id) FROM dataforseo_tasks
    UNION ALL SELECT 'image_usage',      count(*), count(site_id) FROM image_usage;
  \"
"
```

Expected: XG org row exists; `total = with_id` for every row.

- [ ] **Step 5: Smoke test pipeline + xerogravity.com**

```bash
curl -s "https://pipeline.xerogravity.com/api/articles?limit=3" | head -c 400
echo ""
curl -s -o /dev/null -w "xero=%{http_code}\n" "https://xerogravity.com"
```

Expected: JSON with articles + xero=200. Pipeline still happily serves articles even though every row now has a `site_id`.

- [ ] **Step 6: Watch pm2 logs for 60 seconds for any error spike**

```bash
SSHPASS='vY8$mK3#pL9@qZ2x' sshpass -e ssh -o StrictHostKeyChecking=no backend-vps "
  source ~/.nvm/nvm.sh && pm2 logs content-pipeline --lines 50 --nostream 2>&1 | tail -30
"
```

Expected: only the routine "cron tick start" / "cron tick ok" lines. No errors.

- [ ] **Step 7: Confirm with user that prod is healthy**

End Task 5.

---

### Task 6: Rollback procedure (only if Task 5 fails)

If anything goes wrong, this puts everything back.

```bash
SSHPASS='vY8$mK3#pL9@qZ2x' sshpass -e ssh -o StrictHostKeyChecking=no backend-vps "
  sudo -u postgres psql -d content_pipeline <<'SQL'
BEGIN;
UPDATE articles         SET site_id = NULL;
UPDATE seed_keywords    SET site_id = NULL;
UPDATE keyword_results  SET site_id = NULL;
UPDATE dataforseo_tasks SET site_id = NULL;
UPDATE image_usage      SET site_id = NULL;
DELETE FROM site WHERE slug = 'xerogravity';
DELETE FROM organization WHERE slug = 'xerogravity';
COMMIT;
SQL
"
```

This reverses both the backfill and the seed atomically. Pipeline keeps running unchanged.

---

## Self-review

| Spec section requirement | Implemented in |
|---|---|
| Phase 2 (seed XG tenant) | Task 2 (script), 3 (local), 4 (dryrun), 5 (prod) |
| Phase 3 (backfill site_id) | Task 2 (script), 3 (local), 4 (dryrun), 5 (prod) |
| Idempotent migration | Task 2 (ON CONFLICT + WHERE site_id IS NULL), Task 3 step 3 |
| Reversible | Task 6 |
| xerogravity.com unaffected | Task 4 step 6-7, Task 5 step 5-6 |

| Spec sections **NOT** in this plan | Lives in |
|---|---|
| Phase 4 (NOT NULL + FK + index swap + pipeline siteId code) | Plan 6 |
| Operator dashboard pages | Plan 7 |
| Internal staff dashboard pages | Plan 8 |
| Production deploy of suprero-app | Plan 9 |

## Completion criteria

Plan 5 is done when:
1. All 5 tasks have all checkboxes checked (Task 6 only if Task 5 fails).
2. Prod has 1 row in `organization WHERE slug='xerogravity'` and 1 row in `site WHERE slug='xerogravity'`.
3. Every row in `articles`, `seed_keywords`, `keyword_results`, `dataforseo_tasks`, `image_usage` has `site_id` populated (count(site_id) = count(*)).
4. xerogravity.com publishing pipeline continues normally for ≥1h after the backfill.

After Plan 5 ships, Plan 6 can begin: pipeline siteId threading + NOT NULL + FK + index swap.
