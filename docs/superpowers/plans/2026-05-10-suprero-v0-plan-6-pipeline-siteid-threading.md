# Suprero v0 — Plan 6: Pipeline siteId Threading + Schema Lockdown

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every new pipeline row carry a `site_id` from the moment it's created, then add `NOT NULL` + foreign-key constraints so the database enforces tenancy. After this plan, the schema is multi-tenant-ready and the existing pipeline workers continue to publish XeroGravity articles unchanged.

**Architecture:** Two phases, deployed separately:
- **Phase A — code threading:** add a `getDefaultSiteId()` helper that returns the XG site_id (cached at startup). Update the 4 INSERT call sites to include `siteId`. Plain code change, no schema change. Deploy and soak.
- **Phase B — schema lockdown:** generate Drizzle migration 0005 that sets `site_id NOT NULL` and adds the FK to `site.id` on all 5 pipeline tables. Apply via the same dry-run-against-snapshot pattern as Plans 1, 3, 5.

Phase A must ship and soak first because Phase B's `NOT NULL` would reject any insert where the code forgot to populate `site_id`.

**Tech stack:** No new dependencies. Drizzle, Postgres, TypeScript.

**Spec:** [`docs/superpowers/specs/2026-05-08-suprero-v0-design.md`](../specs/2026-05-08-suprero-v0-design.md)

**Decisions:**

- **Single-tenant shim, not parent-propagation, for v0.** A `getDefaultSiteId()` helper returns the XG site_id from the DB (cached). Every insert uses it. This is single-tenant by construction — fine for v0 because XG is the only tenant. Plan 7+ will refactor to "propagate from parent" when multi-tenancy actually has callers. The shim is marked with a `// TODO(multi-tenant)` comment so the next refactor knows where to look.
- **No scheduler changes.** Scheduler still picks one article at a time across the (single) tenant. Multi-site iteration is a Plan 7+ concern.
- **No index swap.** The spec mentions per-site composite indexes for query performance; v0 single-tenant doesn't have query patterns that need them. Defer to whatever plan introduces multi-site dashboards.
- **Phase A and Phase B are two separate prod deploys.** A is a pm2 restart; B is a `npm run db:migrate`. Each has its own user gate.
- **Tests need an XG site to exist.** The existing test fixture flow (no site) will fail once we look up `getDefaultSiteId()`. Solution: a small test helper `seedXgSite()` invoked in `beforeAll` for tests that hit the pipeline stages. Tests that don't touch inserts are unaffected.

---

## Pre-conditions

- Plan 5 deployed to prod and stable (XG org/site rows exist; every pipeline row has `site_id` populated).
- `feat/customer-invite` branch is current on prod (or whatever branch carries Plan 5).
- xerogravity.com publishing is green; no in-flight failures.
- Suprero-app dev still works locally.

---

## File Structure

| Path | Action | Responsibility |
|---|---|---|
| `content-pipeline/src/db/queries.ts` | Modify | Add `getDefaultSiteId()` helper; thread `siteId` through `recordImageUsage` |
| `content-pipeline/src/stages/discover-keywords.ts` | Modify | Set `siteId` on `dataforseoTasks` insert |
| `content-pipeline/src/stages/harvest-keywords.ts` | Modify | Set `siteId` on `keywordResults` and `articles` inserts |
| `content-pipeline/src/test/seed-xg.ts` | Create | Helper that seeds the XG org/site for tests |
| `content-pipeline/src/stages/discover-keywords.test.ts` | Modify | Call `seedXgSite()` in `beforeAll` |
| `content-pipeline/src/stages/harvest-keywords.test.ts` | Modify | Same |
| `content-pipeline/drizzle/0005_<auto>.sql` | Generated | Migration: NOT NULL + FK on 5 site_id columns |
| `content-pipeline/drizzle/meta/_journal.json` | Generated | Drizzle ledger |
| `content-pipeline/drizzle/meta/0005_snapshot.json` | Generated | Drizzle snapshot |
| `content-pipeline/src/db/schema.ts` | Modify | Mark `siteId` as `.notNull()` and add FK reference on the 5 pipeline tables |
| `content-pipeline/src/db/schema.test.ts` | Modify | Update Plan 1 assertions (`site_id is_nullable=NO`, FK exists) |

No suprero-app touches. No content-pipeline `package.json` changes.

---

## Tasks

### Task 1: Pre-flight

**Working directory:** `/Users/anish/Desktop/work/zeeahmed/tradingview/content-pipeline`

- [ ] **Step 1: Confirm clean state**

```bash
git status -sb
git log --oneline -5
```

- [ ] **Step 2: Confirm prod is healthy**

```bash
curl -s -o /dev/null -w "pipeline=%{http_code} xero=" "https://pipeline.xerogravity.com/api/articles?limit=1"
curl -s -o /dev/null -w "%{http_code}\n" "https://xerogravity.com"
```

- [ ] **Step 3: Confirm Plan 5 backfill is on prod**

```bash
SSHPASS='vY8$mK3#pL9@qZ2x' sshpass -e ssh -o StrictHostKeyChecking=no backend-vps \
  "sudo -u postgres psql -d content_pipeline -At -c \"
    SELECT count(*) FROM organization WHERE slug='xerogravity';
    SELECT count(site_id) FROM articles;
  \""
```

Expected: `1` (org row exists) and a count matching prod's article count (every row has `site_id`).

---

### Task 2: Add `getDefaultSiteId()` helper

**Files:**
- Modify: `src/db/queries.ts`

- [ ] **Step 1: Add the helper at the top of `queries.ts` (after the imports)**

```ts
// TODO(multi-tenant): replace with parent-propagation once Plan 7 adds multi-site callers.
// For v0 we have one tenant (XG); every new row gets the XG site_id.
let _defaultSiteId: string | null = null;
export async function getDefaultSiteId(): Promise<string> {
  if (_defaultSiteId) return _defaultSiteId;
  const [row] = await db()
    .select({ id: site.id })
    .from(site)
    .where(eq(site.slug, 'xerogravity'))
    .limit(1);
  if (!row) {
    throw new Error('No site with slug=xerogravity. Run scripts/seed-xg-and-backfill.sql first.');
  }
  _defaultSiteId = row.id;
  return _defaultSiteId;
}

// Test-only: reset the cache between tests.
export function _resetDefaultSiteIdCache(): void {
  _defaultSiteId = null;
}
```

Make sure the imports include `site` from `./schema` and `eq` from `drizzle-orm`.

- [ ] **Step 2: Verify TS compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/db/queries.ts
git commit -m "feat(db): add getDefaultSiteId() helper (v0 single-tenant shim)"
```

---

### Task 3: Thread siteId through the 4 INSERT call sites

**Files:**
- Modify: `src/stages/discover-keywords.ts` (line 35: `dataforseoTasks` insert)
- Modify: `src/stages/harvest-keywords.ts` (line 64: `keywordResults` insert; line 256: `articles` insert)
- Modify: `src/db/queries.ts` (line 108: `recordImageUsage` → add `siteId` to input or look up internally)

For all four, the pattern is:
```ts
const siteId = await getDefaultSiteId();
await db().insert(<table>).values({
  ...existingFields,
  siteId,
});
```

For `recordImageUsage`, simplest is to add `siteId` to the insert internally rather than threading it through every caller:
```ts
export async function recordImageUsage(input: RecordImageUsageInput): Promise<void> {
  const siteId = await getDefaultSiteId();
  await db().insert(imageUsage).values({ ...input, siteId });
}
```

- [ ] **Step 1: Update `discover-keywords.ts`**

Change line 35 region to call `getDefaultSiteId()` once at the top of the for-loop (or once per function invocation) and pass `siteId` in the values block.

- [ ] **Step 2: Update `harvest-keywords.ts`**

Two insert sites — `keywordResults` (line ~64) and `articles` (line ~256). Both call `getDefaultSiteId()` and pass `siteId`.

- [ ] **Step 3: Update `recordImageUsage` in `queries.ts`**

Add the lookup inside the helper.

- [ ] **Step 4: Verify TS compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add src/stages/discover-keywords.ts src/stages/harvest-keywords.ts src/db/queries.ts
git commit -m "feat(pipeline): thread siteId through dataforseoTasks/keywordResults/articles/imageUsage inserts"
```

---

### Task 4: Add `seedXgSite()` test helper + update affected tests

**Files:**
- Create: `src/test/seed-xg.ts`
- Modify: `src/stages/discover-keywords.test.ts`
- Modify: `src/stages/harvest-keywords.test.ts`
- Modify: any other test that hits an INSERT path (image-fetch.test.ts, etc. — search by running tests after step 3 and seeing what fails)

- [ ] **Step 1: Create `src/test/seed-xg.ts`**

```ts
import { db } from '../db/client';
import { organization, site } from '../db/schema';
import { _resetDefaultSiteIdCache } from '../db/queries';
import { eq } from 'drizzle-orm';

const ORG_SLUG = 'xerogravity';
const SITE_SLUG = 'xerogravity';

export async function seedXgSite(): Promise<{ orgId: string; siteId: string }> {
  // Idempotent: insert org + site if missing.
  let [orgRow] = await db().select().from(organization).where(eq(organization.slug, ORG_SLUG)).limit(1);
  if (!orgRow) {
    const [created] = await db().insert(organization).values({
      id: crypto.randomUUID(),
      name: 'XeroGravity',
      slug: ORG_SLUG,
    }).returning();
    if (!created) throw new Error('failed to seed XG org');
    orgRow = created;
  }
  let [siteRow] = await db().select().from(site).where(eq(site.organizationId, orgRow.id)).limit(1);
  if (!siteRow) {
    const [created] = await db().insert(site).values({
      organizationId: orgRow.id,
      name: 'XeroGravity',
      slug: SITE_SLUG,
      categories: [],
    }).returning();
    if (!created) throw new Error('failed to seed XG site');
    siteRow = created;
  }
  _resetDefaultSiteIdCache(); // force lookup to pick up the freshly seeded row
  return { orgId: orgRow.id, siteId: siteRow.id };
}
```

- [ ] **Step 2: Run the test suite, see what fails**

```bash
npm test 2>&1 | tail -30
```

Failing tests are the ones that exercise insert paths without an XG site seeded. Add `await seedXgSite()` in their `beforeAll` (or `beforeEach` if data is wiped between tests).

- [ ] **Step 3: Patch each failing test**

For each failing test file, add at the top:
```ts
import { seedXgSite } from '../test/seed-xg';
```
And in the appropriate setup hook:
```ts
beforeAll(async () => { await seedXgSite(); });
```

- [ ] **Step 4: Run again until green**

```bash
npm test 2>&1 | tail -10
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/test/seed-xg.ts src/stages/*.test.ts
git commit -m "test: add seedXgSite helper and seed XG in stage tests so getDefaultSiteId resolves"
```

---

### Task 5: USER GATE — Deploy Phase A code to prod

**STOP. The next step deploys the new code to prod.** Confirm with the user.

- [ ] **Step 1: Push branch**

```bash
git push origin feat/customer-invite
```

- [ ] **Step 2: Ask user for explicit go-ahead**

Wait for "Proceed with Plan 6 Phase A deploy."

- [ ] **Step 3: Deploy via SSH**

```bash
SSHPASS='vY8$mK3#pL9@qZ2x' sshpass -e ssh -o StrictHostKeyChecking=no backend-vps "
  source ~/.nvm/nvm.sh &&
  cd /srv/content-pipeline &&
  git fetch origin &&
  git checkout feat/customer-invite &&
  git pull --ff-only origin feat/customer-invite &&
  npm ci &&
  pm2 restart content-pipeline &&
  sleep 5 &&
  pm2 list | grep content-pipeline
"
```

Expected: pm2 reports content-pipeline `online`. (No db:migrate this round — Phase B's migration comes in Task 8.)

- [ ] **Step 4: Smoke test**

```bash
curl -s "https://pipeline.xerogravity.com/api/articles?limit=3" | head -c 400
echo ""
curl -s -o /dev/null -w "xero=%{http_code}\n" "https://xerogravity.com"
```

- [ ] **Step 5: Watch pm2 logs for the next cron tick**

```bash
SSHPASS='vY8$mK3#pL9@qZ2x' sshpass -e ssh -o StrictHostKeyChecking=no backend-vps \
  "source ~/.nvm/nvm.sh && pm2 logs content-pipeline --lines 50 --nostream 2>&1 | tail -15"
```

Wait for one harvestKeywords or publishDue tick to complete after deploy. Confirm "cron tick ok" with no errors.

- [ ] **Step 6: Verify any new rows have site_id set**

```bash
SSHPASS='vY8$mK3#pL9@qZ2x' sshpass -e ssh -o StrictHostKeyChecking=no backend-vps \
  "sudo -u postgres psql -d content_pipeline -c \"
    SELECT count(*) FILTER (WHERE site_id IS NULL) AS null_site_id, count(*) AS total
    FROM articles
    WHERE created_at > now() - interval '1 hour';
  \""
```

Expected: `null_site_id = 0` (any new rows already have site_id). Note: if no new rows in the last hour, this query returns `0 / 0` which is also fine.

End Phase A.

---

### Task 6: Generate Drizzle migration 0005 (NOT NULL + FK)

**Files:**
- Modify: `src/db/schema.ts`
- Generated: `drizzle/0005_<auto>.sql`
- Generated: `drizzle/meta/_journal.json`
- Generated: `drizzle/meta/0005_snapshot.json`

- [ ] **Step 1: Edit `src/db/schema.ts` to mark site_id as NOT NULL + FK on the 5 pipeline tables**

Change each of these from:
```ts
siteId: uuid('site_id'),
```
to:
```ts
siteId: uuid('site_id').notNull().references(() => site.id),
```

For all 5 tables: `articles`, `seedKeywords`, `keywordResults`, `dataforseoTasks`, `imageUsage`.

⚠️ **Order matters in schema.ts.** The `site` table must be defined BEFORE the pipeline tables that reference it. Currently in Plan 1's schema.ts the order is: pipeline tables → BetterAuth → orgs → site → api_call_log. We need to verify this works at TypeScript compile time (forward references are fine in JS but TS can complain).

If TS complains about hoisting, refactor by either: (a) moving the `site` table definition above the pipeline tables, or (b) using a deferred reference: `references((): AnyPgColumn => site.id)`. The plan default is (b) since it's a smaller change.

- [ ] **Step 2: Generate the migration**

```bash
npm run db:generate
ls drizzle/0005_*.sql
```

- [ ] **Step 3: Inspect the generated SQL**

```bash
cat drizzle/0005_*.sql
```

Required statements:
- `ALTER TABLE <each of 5> ALTER COLUMN "site_id" SET NOT NULL`
- `ALTER TABLE <each of 5> ADD CONSTRAINT ... FOREIGN KEY ("site_id") REFERENCES "site"("id")`

Forbidden:
- `DROP TABLE`, `DROP COLUMN`
- Any `UPDATE`
- Any change to columns other than `site_id`

If forbidden statements appear, stop and review the schema diff.

- [ ] **Step 4: Commit**

```bash
git add src/db/schema.ts drizzle/
git commit -m "feat(db): generate migration 0005 — site_id NOT NULL + FK on 5 pipeline tables"
```

---

### Task 7: Update schema.test.ts and run locally

**Files:**
- Modify: `src/db/schema.test.ts`

The Plan 1 test currently asserts `site_id is_nullable=YES` and "no FK from articles.site_id to site.id". After 0005, both flip.

- [ ] **Step 1: Update assertions**

Find these tests (added in Plan 1):
- `'adds nullable site_id column to all existing pipeline tables'`
- `'does NOT yet add a foreign key from articles.site_id to site.id (deferred to plan 4)'`

Change them to:
- Assert `is_nullable='NO'`
- Assert `count(FK) >= 1` for `articles.site_id → site.id`

- [ ] **Step 2: Apply migration locally**

```bash
npm run db:migrate
```

- [ ] **Step 3: Run schema tests**

```bash
npm test -- src/db/schema.test.ts
```

Expected: all 8 tests pass (5 from 0003 + 3 from 0004; with the Plan 1 ones now asserting the post-Plan-6 state).

- [ ] **Step 4: Run full test suite**

```bash
npm test 2>&1 | tail -8
```

Expected: all green. The seedXgSite() helper added in Task 4 ensures inserts succeed.

- [ ] **Step 5: Commit**

```bash
git add src/db/schema.test.ts
git commit -m "test(db): update schema 0003 tests to reflect 0005 NOT NULL + FK lockdown"
```

---

### Task 8: Dry-run 0005 against prod snapshot

This is the **most important verification step in Phase B.**

- [ ] **Step 1: Snapshot prod**

```bash
SSHPASS='vY8$mK3#pL9@qZ2x' sshpass -e ssh -o StrictHostKeyChecking=no backend-vps \
  "sudo -u postgres pg_dump --format=plain --no-owner --no-privileges content_pipeline" \
  > prod-snapshot-pre-0005.sql
```

- [ ] **Step 2: Restore to dryrun DB**

(Use the same recipe as Plan 5 Task 4.)

- [ ] **Step 3: Apply migration**

```bash
DEV_URL=$(grep -E '^DATABASE_URL=' .env | head -1 | cut -d= -f2- | tr -d '"')
DRYRUN_URL=$(echo "$DEV_URL" | sed -E 's#/[^/?]+(\?|$)#/content_pipeline_dryrun\1#')
DATABASE_URL="$DRYRUN_URL" npm run db:migrate 2>&1 | tail -10
```

Expected: `0005_<name>.sql applied`. If errors mention a `NOT NULL` violation, **stop** — there's a row in prod with `site_id IS NULL` that Plan 5 missed (run the seed-xg-and-backfill script first to catch it).

- [ ] **Step 4: Run schema test against the dryrun**

```bash
DATABASE_URL="$DRYRUN_URL" npm test -- src/db/schema.test.ts 2>&1 | tail -10
```

- [ ] **Step 5: Boot pipeline against dryrun + curl /api/articles**

```bash
DATABASE_URL="$DRYRUN_URL" DISABLE_CRON=true PORT=4001 nohup npm run dev > /tmp/p6-srv.log 2>&1 &
DEV_PID=$!
for i in $(seq 1 30); do curl -fsS -o /dev/null 'http://localhost:4001/api/articles?limit=1' 2>/dev/null && break; sleep 1; done
curl -s 'http://localhost:4001/api/articles?limit=2' | head -c 400
kill $DEV_PID
```

Expected: JSON with articles. Constraint enforcement doesn't break reads.

- [ ] **Step 6: Cleanup**

```bash
psql "$ADMIN_URL" -c "DROP DATABASE content_pipeline_dryrun;"
rm -f prod-snapshot-pre-0005.sql
```

---

### Task 9: USER GATE — Deploy Phase B (migration 0005) to prod

**STOP.** Confirm with user.

- [ ] **Step 1: Push branch**

```bash
git push origin feat/customer-invite
```

- [ ] **Step 2: Ask user for explicit go-ahead**

- [ ] **Step 3: Deploy migration**

```bash
SSHPASS='vY8$mK3#pL9@qZ2x' sshpass -e ssh -o StrictHostKeyChecking=no backend-vps "
  source ~/.nvm/nvm.sh &&
  cd /srv/content-pipeline &&
  git pull --ff-only origin feat/customer-invite &&
  npm ci &&
  npm run db:migrate &&
  pm2 restart content-pipeline &&
  sleep 4 &&
  pm2 list | grep content-pipeline
"
```

- [ ] **Step 4: Verify constraint**

```bash
SSHPASS='vY8$mK3#pL9@qZ2x' sshpass -e ssh -o StrictHostKeyChecking=no backend-vps "
  sudo -u postgres psql -d content_pipeline -c \"
    SELECT column_name, is_nullable FROM information_schema.columns
    WHERE table_name='articles' AND column_name='site_id';
  \"
  sudo -u postgres psql -d content_pipeline -c \"
    SELECT tc.constraint_name FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
    WHERE tc.table_name='articles' AND kcu.column_name='site_id' AND tc.constraint_type='FOREIGN KEY';
  \"
"
```

Expected: `is_nullable=NO`, FK constraint exists.

- [ ] **Step 5: Smoke test prod**

```bash
curl -s "https://pipeline.xerogravity.com/api/articles?limit=3" | head -c 400
curl -s -o /dev/null -w "xero=%{http_code}\n" "https://xerogravity.com"
```

- [ ] **Step 6: Watch pm2 logs for the next cron tick**

```bash
SSHPASS='vY8$mK3#pL9@qZ2x' sshpass -e ssh -o StrictHostKeyChecking=no backend-vps \
  "source ~/.nvm/nvm.sh && pm2 logs content-pipeline --lines 50 --nostream 2>&1 | tail -15"
```

End Phase B.

---

### Task 10: Rollback procedures

Documented for both phases. Run only if the corresponding deploy fails.

**Phase A rollback (revert code, keep schema):**
```bash
SSHPASS='...' sshpass -e ssh backend-vps "
  cd /srv/content-pipeline && git checkout main && npm ci && pm2 restart content-pipeline
"
```

**Phase B rollback (revert schema, leave code in place):**
```bash
SSHPASS='...' sshpass -e ssh backend-vps "
  sudo -u postgres psql -d content_pipeline <<'SQL'
BEGIN;
ALTER TABLE articles         DROP CONSTRAINT IF EXISTS articles_site_id_site_id_fk;
ALTER TABLE seed_keywords    DROP CONSTRAINT IF EXISTS seed_keywords_site_id_site_id_fk;
ALTER TABLE keyword_results  DROP CONSTRAINT IF EXISTS keyword_results_site_id_site_id_fk;
ALTER TABLE dataforseo_tasks DROP CONSTRAINT IF EXISTS dataforseo_tasks_site_id_site_id_fk;
ALTER TABLE image_usage      DROP CONSTRAINT IF EXISTS image_usage_site_id_site_id_fk;
ALTER TABLE articles         ALTER COLUMN site_id DROP NOT NULL;
ALTER TABLE seed_keywords    ALTER COLUMN site_id DROP NOT NULL;
ALTER TABLE keyword_results  ALTER COLUMN site_id DROP NOT NULL;
ALTER TABLE dataforseo_tasks ALTER COLUMN site_id DROP NOT NULL;
ALTER TABLE image_usage      ALTER COLUMN site_id DROP NOT NULL;
DELETE FROM drizzle.__drizzle_migrations WHERE id = (SELECT id FROM drizzle.__drizzle_migrations ORDER BY created_at DESC LIMIT 1);
COMMIT;
SQL
"
```

(Adjust constraint names to match what `\d articles` shows on prod. Drizzle's auto-generated names follow the pattern `<table>_<col>_<reftbl>_<refcol>_fk` but verify before running.)

---

## Self-review

| Spec section requirement | Implemented in |
|---|---|
| Pipeline siteId threading (4 INSERT sites) | Tasks 2, 3 |
| NOT NULL on site_id (5 tables) | Task 6 (schema.ts), Task 8 (apply) |
| FK from site_id → site.id (5 tables) | Task 6 (schema.ts), Task 8 (apply) |
| Pipeline behavior unchanged | Tasks 5 step 4-6 (Phase A), 9 step 5-6 (Phase B) |
| xerogravity.com unaffected | Tasks 5 step 4 + 9 step 5 |
| Rollback path for both phases | Task 10 |

| Spec sections **NOT** in this plan | Lives in |
|---|---|
| Index swap (per-site composite indexes) | Plan 7 (when multi-site queries exist) |
| Scheduler iterating over sites | Plan 7 |
| Operator dashboard pages | Plan 7 |
| Internal staff dashboard pages | Plan 8 |
| Production deploy of suprero-app | Plan 9 |

## Completion criteria

Plan 6 is done when:
1. All 9 tasks (1–9) checkboxes checked. Task 10 is rollback only.
2. Prod has all 5 pipeline tables with `site_id is_nullable=NO` and a FK to `site.id`.
3. New rows created by the cron pipeline carry `site_id` (verified via `count(*) FILTER (WHERE site_id IS NULL)` on rows created after deploy = 0).
4. xerogravity.com publishing remains green for ≥1h after Phase B.
5. All tests pass with `seedXgSite()` setup helper.

After Plan 6 ships, the pipeline is fully tenant-aware at the data layer. Plan 7 can begin: operator dashboard pages that read per-site data.
