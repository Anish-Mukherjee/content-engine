# Suprero v0 — Multi-Tenant SaaS Design

Date: 2026-05-08
Status: Approved (ready for implementation plan)

## Summary

v0 of Suprero — a multi-tenant SaaS content operations platform built on top of the existing single-tenant XeroGravity content pipeline. v0 bundles three subsystems into one ship:

- **A — Multi-tenant pipeline core**: refactor `content-pipeline/` from single-tenant to tenant-per-site
- **B — Auth + onboarding**: Better Auth with organizations plugin, invite-only signup
- **C — Operator dashboard**: new Next.js 15 app porting the Suprero design system mocks 1:1

XeroGravity becomes "tenant 0" in the new system. The same codebase that runs xerogravity.com today is refactored to be multi-tenant; xerogravity.com keeps working throughout via a hard-coded `XG_SITE_ID` constant.

Audience for v0 is a **closed beta** of 5–20 hand-picked customers. No billing, no public signup, no CMS publishing — articles are draft-only and customers export HTML/Markdown from the dashboard.

Subsystems explicitly **NOT** in v0 (each gets its own spec later):
- D — Recovery Center (auto-refresh losing-traffic articles)
- E — Analytics + Page Detail (GSC charts)
- F — Stripe billing
- G — Internal staff backoffice (partial inclusion only — see "Pages" below)

## Core decisions

| Decision | Choice |
|---|---|
| v0 audience | Closed beta, 5–20 invited customers |
| Publishing model | Draft-only — customer exports HTML/Markdown from the dashboard |
| Tenancy | Orgs with multiple members + roles (owner/admin/member) |
| Sites per org | Multiple |
| Auth provider | Better Auth (self-hosted, Drizzle adapter, organizations plugin) |
| Email delivery | Resend (transactional: invites, magic-link, password reset) |
| Dashboard stack | New Next.js 15 app at `tradingview/suprero-app/`, App Router + Server Components |
| Existing pipeline | Refactored in place — XeroGravity becomes tenant 0 |
| Refactor strategy | Strangler-fig: add multi-tenant columns, backfill, evolve |
| DB-access boundary | suprero-app reads/writes Postgres directly via shared Drizzle schema; calls content-pipeline HTTP API only for stage triggers |

## Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                         SUPRERO V0 TOPOLOGY                           │
└──────────────────────────────────────────────────────────────────────┘

   Customers' browsers                xerogravity.com readers
        │                                       │
        ▼                                       ▼
┌────────────────────┐            ┌──────────────────────────┐
│   suprero-app      │            │   frontend (existing)    │
│   Next.js 15       │            │   xerogravity.com        │
│   app.suprero.com  │            │   Next.js, ISR           │
│                    │            │                          │
│  - Better Auth     │            │  reads /api/articles     │
│  - Server actions  │            │  unchanged in v0         │
│  - Operator UI     │            └────────────┬─────────────┘
└────────┬───────────┘                         │
         │ x-admin-key + tenant scope          │
         │                                     │
         ▼                                     ▼
┌──────────────────────────────────────────────────────────────────────┐
│              content-pipeline (refactored, multi-tenant)              │
│                          /srv/content-pipeline                        │
│                                                                       │
│   server/   ──  /api/articles            (legacy, scoped to XG site)  │
│                  /api/admin/*            (tenant-scoped admin API)    │
│                  /api/sites/:siteId/...  (new, Suprero-facing)        │
│                                                                       │
│   stages/  ──   each stage(siteId): research-topic, outline, write,   │
│                  fetch-image, publish-due, drive-article,             │
│                  discover/harvest-keywords                            │
│                                                                       │
│   scheduler/ ── cron iterates over sites instead of running once      │
└────────┬──────────────────────────────────────────────────────────────┘
         │
         ▼
┌────────────────────────────────────────┐
│   Postgres (single shared DB)          │
│                                         │
│   New (Better Auth + tenancy):         │
│     user, session, account, verification│
│     organization, member, invitation   │
│     site, api_call_log                 │
│                                         │
│   Existing + site_id column:           │
│     articles, seed_keywords            │
│     keyword_results, dataforseo_tasks  │
│     image_usage                        │
└────────────────────────────────────────┘
```

**Three deployable units:**
1. `suprero-app` — Next.js, talks to content-pipeline via internal API + Postgres directly, hosts Better Auth
2. `content-pipeline` — same Express service, refactored multi-tenant, scheduler iterates sites
3. `frontend` — xerogravity.com unchanged; reads `/api/articles` which internally filters to XG site_id

**Schema sharing:** Both apps need the same Drizzle schema definitions. Convert the monorepo root to a **pnpm workspace** (add `pnpm-workspace.yaml` listing `content-pipeline`, `suprero-app`, `frontend`, `backend`). Move the Drizzle schema to a new shared package `packages/db-schema/` exporting `schema.ts`. Both apps import via `import { articles, site } from '@suprero/db-schema'`. Migration ownership stays with `content-pipeline` — it remains the single Drizzle migration runner; `suprero-app` doesn't run migrations.

## Data model

### New tables

Better Auth + organizations plugin provides most of these out of the box. Suprero-specific addition is `site` and `api_call_log`.

```
user                       Better Auth core
  id, email, name, image, emailVerified, createdAt

session                    Better Auth core
  id, userId → user, token, expiresAt, ipAddress, userAgent

account                    Better Auth core (OAuth/credentials)
  id, userId → user, providerId, ...

verification               Better Auth core (email verify, magic links)
  id, identifier, value, expiresAt

organization               Better Auth orgs plugin
  id, name, slug (unique), logo, metadata, createdAt
  metadata.isStaff = true marks Suprero's internal staff org

member                     Better Auth orgs plugin
  id, organizationId → organization, userId → user
  role: 'owner' | 'admin' | 'member'
  createdAt

invitation                 Better Auth orgs plugin
  id, organizationId, email, role, status, expiresAt, inviterId

site                       NEW — Suprero-specific
  id (uuid)
  organizationId → organization
  name (e.g. "XeroGravity Blog")
  slug (unique within org)
  categories (jsonb, e.g. ["ai","trading-tech"])
  defaultCategory (text, fallback for new seed keywords)
  publishingMode (enum: 'draft_only' — only valid value in v0)
  scheduleEnabled (bool, default true — pause/resume pipeline per site)
  targetWordCount (int, default 1500 — passed to write-article)
  toneOfVoice (text, nullable — passed to outline + write)
  createdAt, updatedAt

api_call_log               NEW — for future Admin API Costs page
  id, siteId, provider (e.g. 'dataforseo','anthropic','unsplash')
  costEstimateUsd (real, nullable)
  metadata (jsonb)
  createdAt
```

### Existing tables — add `siteId` column

`siteId` is denormalized to every pipeline table so all queries can be tenant-scoped at the index level (no JOIN-through required):

```
articles            + siteId uuid not null → site
                    + index (siteId, status)
                    + index (siteId, publishedAt desc)
                    + slug unique becomes (siteId, slug) unique

seed_keywords       + siteId uuid not null → site
                    + uniq (siteId, keyword, category)
                      replaces (keyword, category)

keyword_results     + siteId uuid not null → site
                    + index (siteId, status)

dataforseo_tasks    + siteId uuid not null → site

image_usage         + siteId uuid not null → site
                    + image dedup is now PER SITE
                      (one customer using an Unsplash photo
                       does not block another customer)
```

### Important schema changes

- **Article slug uniqueness** changes from global to per-site: different orgs may legitimately have an article slugged `seo-checklist`. Migration drops the global unique index and creates `(siteId, slug)`.
- **Image dedup is per-site**: `image_usage.contentHash` index becomes `(siteId, contentHash)` so customers don't compete for the same Unsplash photo.

### What's NOT in the data model for v0

- No `tenant_billing`, `usage_events`, `subscription` tables — billing is post-v0
- No `gsc_connection`, `gsc_metrics_daily` tables — Recovery Center / Analytics are separate specs
- No Postgres Row-Level Security — application-level tenant filtering only (revisit if compliance demands it)
- No soft-delete — hard delete only for v0

## Auth & onboarding

### Better Auth config (in `suprero-app/lib/auth.ts`)

```
adapter: drizzleAdapter (Postgres, shared schema)
plugins:
  - organization()          // orgs plugin
emailAndPassword:
  enabled: true
  requireEmailVerification: true
session:
  expiresIn: 30 days, refreshable
trustedOrigins: [APP_URL]
```

Email + password + magic-link only in v0. No Google OAuth yet (deferred to v0.1 — one extra screen, no architecture change).

### Onboarding flow (closed beta, invite-only)

There are **two distinct invitation flows** — they look similar but produce different outcomes:

**Flow 1: Suprero staff invites a brand-new customer (creates new org)**

```
┌──────────────────────────────────────────────────────────────┐
│  /staff/invites (Suprero operator only)                      │
│  Operator types email + intended org name → POST             │
│  Creates a "customer-invite" record (separate from Better    │
│  Auth invitation since no org exists yet)                    │
│  Sends email: "You're invited to Suprero. <link>"            │
└────────────────────────────┬─────────────────────────────────┘
                             ▼
┌──────────────────────────────────────────────────────────────┐
│  Recipient clicks → /accept-invite?token=...&new-org=true    │
│  Signup screen: email pre-filled, asks for password + org    │
│  name (defaulted from staff input, editable)                 │
│  On submit:                                                  │
│    - Create user, mark emailVerified = true (token implies   │
│      we already control the email)                           │
│    - Create org with that name (slug derived)                │
│    - Add user to org with role = 'owner'                     │
│    - Auto-create one default site "<orgName> Blog"           │
│    - Redirect to /app/<orgSlug>/<siteSlug>                   │
└──────────────────────────────────────────────────────────────┘
```

**Flow 2: Existing customer invites a teammate (joins existing org)**

```
┌──────────────────────────────────────────────────────────────┐
│  Settings → Team → "Invite member" (org owner/admin)         │
│  Calls Better Auth's auth.api.inviteUser({orgId, email, role})│
│  Better Auth creates an `invitation` row, sends email        │
└────────────────────────────┬─────────────────────────────────┘
                             ▼
┌──────────────────────────────────────────────────────────────┐
│  Recipient clicks → /accept-invite?token=...                 │
│  If user already exists: log in, then accept.                │
│  If user doesn't: signup screen, then accept on submit.      │
│  Accept = Better Auth adds user as `member` of the existing   │
│  org with the role from the invitation.                      │
│  No new org, no new site created.                            │
│  Redirect to /app/<orgSlug>/<siteSlug-of-org-default-site>   │
└──────────────────────────────────────────────────────────────┘
```

### Roles (Better Auth orgs plugin defaults)

| Role | Read | Write articles/keywords | Invite | Manage billing | Delete site/org |
|---|---|---|---|---|---|
| **owner** | ✓ | ✓ | ✓ | ✓ (post-v0) | ✓ |
| **admin** | ✓ | ✓ | ✓ | — | — |
| **member** | ✓ | ✓ | — | — | — |

### Internal staff vs customer

The mocks include `Admin Overview / Admin Users / Admin API Costs / Admin Settings` — these are for **Suprero's own team** (you), not customers. Modeled as a **special org** with `metadata.isStaff = true` and slug `__suprero_staff__`. Staff users see a `/staff` route group customers can't see. No new auth model — reuses orgs+memberships.

### Email delivery

- **Provider:** Resend
- **Templates in v0:** invite, magic-link, password-reset. Plain HTML, Suprero greyscale aesthetic.
- **From:** `noreply@suprero.com` — requires DKIM, SPF, DMARC on `suprero.com`.

### What's NOT in v0

- Google/GitHub OAuth (v0.1)
- 2FA / MFA
- Audit log of auth events
- SSO / SAML

## Pipeline tenancy threading

### Stage signature change

Every stage today runs implicitly against "the one site". After refactor, every stage takes `siteId`:

```ts
// Before:
export async function discoverKeywords(): Promise<void> { ... }

// After:
export async function discoverKeywords(siteId: string): Promise<void> { ... }
```

Files modified (all under `content-pipeline/src/stages/`):
- `discover-keywords.ts`
- `harvest-keywords.ts`
- `research-topic.ts`
- `outline-article.ts`
- `write-article.ts`
- `fetch-image.ts` (image dedup now per-site)
- `publish-due.ts`
- `drive-article.ts` (orchestrator, takes siteId)

`db/queries.ts` — every helper takes `siteId` and includes it in WHERE.

### Scheduler change

```ts
// scheduler/index.ts (sketch)
cron.schedule(SCHEDULE_DISCOVER, async () => {
  const sites = await db().select({ id: site.id })
    .from(site).where(eq(site.scheduleEnabled, true));
  for (const s of sites) {
    await runWithSiteLogger(s.id, () => discoverKeywords(s.id));
  }
});
```

**Concurrency:** sites run sequentially per stage in v0. 5–20 sites × cheap stages is fast enough; sequential keeps DataForSEO/Anthropic rate limits trivially safe.

**Rate-limit budgets:** v0 doesn't enforce per-site quotas. Tracks usage only — every external API call writes a row to `api_call_log` (`siteId`, `provider`, `costEstimate`, `createdAt`). Powers the future Admin API Costs page.

### Cron schedule (shared across sites in v0)

- Discover keywords: every 6 hours
- Harvest results: every 30 min
- Research/outline/write: every 15 min
- Fetch image: every 15 min
- Publish due: every 5 min

Per-site cron schedules are post-v0.

### XeroGravity backwards compat

Public route `/api/articles` (called by xerogravity.com frontend) keeps working unchanged — internally adds `WHERE siteId = $XG_SITE_ID`. The frontend never knows multi-tenancy exists. Same for `/api/articles/:slug` and `/api/sitemap-data`.

`XG_SITE_ID` is a const in `content-pipeline/src/config/tenants.ts`, set during the seeding migration.

### Failure isolation

A stage failing on Site A must not block Site B. Each per-site stage call is wrapped in a try/catch that logs the error to `articles.lastError` / `dataforseo_tasks.error` and continues. Pipeline-wide failures (DB down) still halt.

### What's NOT in v0

- Per-site cron schedules
- Per-site rate limit enforcement (logging only)
- Multi-region pipeline workers / horizontal scaling
- Pause/resume per stage (whole-pipeline via `scheduleEnabled` only)
- Tenant-level pipeline metrics in dashboard

## Operator dashboard surface

### Pages in v0 — 10 of 12 mocks port

**Customer-facing (6 screens):**

| Mock | Route | Purpose |
|---|---|---|
| `Dashboard Overview.html` | `/app/[org]/[site]` | Counts (researching/writing/scheduled/published), recent activity, "Add article" CTA |
| `Content Queue.html` | `/app/[org]/[site]/queue` | Add/list/filter/search articles, status pills, pagination, modal triggers research stage |
| (new — based on Page Detail) | `/app/[org]/[site]/articles/[id]` | Title, body preview, hero image, "Copy as HTML" / "Copy as Markdown" / "Download .zip" |
| `Settings.html` | `/app/[org]/[site]/settings` | Site config (name, categories, default category, target word count, tone, scheduleEnabled toggle) |
| `Profile.html` | `/app/profile` | Account: email, password, sign out, delete account |
| (new — Team subsection) | `/app/[org]/settings/team` | Invite/list/role-change/remove members |

**Internal staff (4 screens):**

| Mock | Route | Purpose |
|---|---|---|
| `Admin Overview.html` | `/staff` | All orgs, total articles, system health |
| `Admin Users.html` | `/staff/users` | All users across all orgs (read-only in v0) |
| `Admin API Costs.html` | `/staff/api-costs` | Reads `api_call_log`, daily/monthly spend by provider+site |
| `Admin Settings.html` | `/staff/settings` | Env display + invite-customer button |

**Deferred to later specs:** `Recovery Center.html` (D), `Analytics.html` + `Analytics Page Detail.html` (E), `Billing.html` (F).

### URL structure

```
app.suprero.com/
  /                                       redirects to login or last site
  /login                                  Better Auth UI
  /signup?token=...                       accept invitation
  /accept-invite?token=...                alias for above
  /app                                    redirects to first org/site
  /app/[orgSlug]/[siteSlug]               Dashboard Overview
  /app/[orgSlug]/[siteSlug]/queue         Content Queue
  /app/[orgSlug]/[siteSlug]/articles/[id] Article Detail / Export
  /app/[orgSlug]/[siteSlug]/settings      Site settings
  /app/[orgSlug]/settings/team            Team management
  /app/[orgSlug]/settings/sites           Site list, create/delete site
  /app/profile                            User profile
  /staff                                  Internal admin (gated by isStaff)
  /staff/users
  /staff/api-costs
  /staff/settings
```

`[orgSlug]` and `[siteSlug]` come from URL — server middleware verifies the session user is a member of `[orgSlug]` and the org owns `[siteSlug]`, else 404.

### Site switcher

Sidebar shows current site at the top under the logo: `[Site Name ▾]` — clicking opens a popover listing all sites in current org + "Create new site" + "Switch org" if user is in multiple orgs.

### Server actions vs API routes

| Action | Mechanism |
|---|---|
| List articles for queue | Server component fetches via Drizzle |
| List counts for Overview | Server component, Drizzle |
| Add article (modal submit) | Server action — inserts row with status='requested', pipeline picks up next cron tick |
| Update site settings | Server action |
| Trigger immediate stage run | Server action calls content-pipeline `POST /api/admin/trigger/:stage` with x-admin-key + siteId |
| Invite teammate | Server action calling Better Auth `auth.api.inviteUser({...})` |
| Export article | Server component renders HTML; "Copy" button (clipboard) and "Download .zip" route handler that streams a zip with HTML + images |

**No REST API in suprero-app for v0.** Server components + server actions only. content-pipeline's existing REST API stays for two callers: xerogravity.com frontend (legacy) and the suprero-app server (stage triggers).

### Mock-to-React port strategy

Mocks are vanilla HTML/CSS/JS in single files each.

1. Keep CSS as-is. Move per-page CSS files into `suprero-app/app/[org]/[site]/(...)/styles.css`. Tokens (`colors_and_type.css`) become `suprero-app/app/globals.css`.
2. Convert HTML → JSX. Drop `<style>`, replace `class=` → `className=`, replace inline event handlers with `onClick={...}`.
3. Replace fake `rows = [...]` data with real Drizzle queries in server components.
4. Theme toggle: `data-theme` attribute on `<html>` wired to a cookie + localStorage via context provider.
5. Lucide icons stay as inline SVG (already are in mocks). Extract to `components/icons.tsx`. No `lucide-react` package.

This is a port, not a redesign. Visual is locked.

### What's NOT in v0

- Real-time queue updates (no WebSockets / SSE)
- Article editing — only export. Customer accepts AI output or triggers a rewrite (v0.1)
- Bulk operations (multi-select)
- Dark mode persisted to DB (localStorage only)
- i18n
- Mobile responsive — desktop-only; mocks use `216px` fixed sidebar

## Migration & rollout plan

### The risky moment

Migration runs on production Postgres at `/srv/content-pipeline`. xerogravity.com depends on it. Three failure modes to defend against:

1. Data loss during backfill (a row's `siteId` miswritten or NULL'd)
2. Schema lock contention during `ALTER TABLE` on large tables
3. Code/schema mismatch during deploy

### Step-by-step rollout (4 phases)

**Phase 0 — Pre-flight (no production change):**
1. `pg_dump` from prod → restore to local Postgres
2. Run full migration script against local copy. Diff `count(*)` for each table — must match.
3. Spot-check 5 random articles for `siteId = $XG_SITE_ID`.
4. Run xerogravity.com frontend against local content-pipeline pointed at the migrated DB. Verify articles render.
5. Only proceed if all green.

**Phase 1 — Additive schema (low risk, deployed first):**
- Drizzle migration creates `user`, `session`, `account`, `verification`, `organization`, `member`, `invitation`, `site`, `api_call_log`.
- Adds `site_id uuid NULL` to `articles`, `seed_keywords`, `keyword_results`, `dataforseo_tasks`, `image_usage`. No FK, no NOT NULL.
- Pipeline code unchanged. Deploy. xerogravity.com unaffected.

**Phase 2 — Seed XeroGravity tenant (one-time script):**
- `scripts/seed-xerogravity-tenant.ts`:
  - Create `organization` (`name = 'XeroGravity'`, `slug = 'xerogravity'`)
  - Create `site` row with `id = XG_SITE_ID` (fixed UUID known to code)
  - Create user(s) for current operators with `emailVerified = true` and a temporary unguessable password; trigger Better Auth password-reset emails so operators set their own passwords on first login
  - Members of XG org with `role = 'owner'`
- Idempotent (ON CONFLICT). Run on prod once.

**Phase 3 — Backfill (one-time script):**
```sql
BEGIN;
UPDATE articles         SET site_id = $XG_SITE_ID WHERE site_id IS NULL;
UPDATE seed_keywords    SET site_id = $XG_SITE_ID WHERE site_id IS NULL;
UPDATE keyword_results  SET site_id = $XG_SITE_ID WHERE site_id IS NULL;
UPDATE dataforseo_tasks SET site_id = $XG_SITE_ID WHERE site_id IS NULL;
UPDATE image_usage      SET site_id = $XG_SITE_ID WHERE site_id IS NULL;
COMMIT;
```
- Verify: `SELECT count(*) FROM <each_table> WHERE site_id IS NULL` returns 0.
- Run during quiet cron window (4am UTC). Pause `node-cron` briefly if stage holds row locks.

**Phase 4 — Constraints + index swap + code change (atomic deploy):**
- Drizzle migration:
  - `ALTER COLUMN site_id SET NOT NULL` on each pipeline table
  - Add FK `site_id REFERENCES site(id)`
  - Drop global `articles.slug` unique → create `(site_id, slug)` unique
  - Drop global `(keyword, category)` unique on `seed_keywords` → `(site_id, keyword, category)`
  - Add `(site_id, content_hash)` index on `image_usage`
- Same deploy ships pipeline code that:
  - Threads `siteId` through every stage
  - Hardcodes `XG_SITE_ID` for legacy `/api/articles*` routes
  - Scheduler iterates over sites
- Tests against migrated local DB before deploying.
- Deploy via existing GitHub Actions (push to `main`).
- Smoke: `curl https://xerogravity.com/api/articles | head` returns articles.

### Rollback strategy

| Phase | Rollback if it fails |
|---|---|
| Phase 1 | `DROP TABLE` new tables, `ALTER TABLE ... DROP COLUMN site_id`. No data lost. |
| Phase 2 | `DELETE` seeded rows. No data lost. |
| Phase 3 | `UPDATE ... SET site_id = NULL WHERE site_id = $XG_SITE_ID`. No data lost. |
| Phase 4 | Revert deploy. Schema rollback is harder once `NOT NULL` is set — would need a migration back to NULL-able. Mitigation: don't ship phase 4 until phase 3 is verified clean. |

### Suprero-app rollout (independent of pipeline migration)

The new Next.js app `suprero-app/` doesn't run in production until **after Phase 4 succeeds**.
- Develop locally against a copy of post-migration prod DB
- DNS for `app.suprero.com` set up, points at 503 holding page until ready
- After phase 4 + 1 week of XG-only running fine: deploy `suprero-app`, invite first beta customer

This gives a "tenant 0 only" period to catch bugs before exposing external customers.

### Order-of-operations summary

```
Week 1   Build suprero-app skeleton + Better Auth locally  (no prod impact)
Week 2   Phase 1 migration → prod    (additive only)
         Pipeline siteId threading on a feature branch
Week 3   Phase 2 seed + Phase 3 backfill (off-hours)
         Phase 4 deploy + watch xerogravity.com closely
Week 4   suprero-app feature complete locally (port mocks, server actions)
         Deploy suprero-app to staging app.suprero.com
         Internal smoke test
Week 5   Invite first 1-2 beta customers
         Iterate on issues
Week 6+  Open up to 5-20 beta customers
```

This is a planning estimate, not a commitment — the implementation plan will sequence tasks more precisely.

## Testing strategy

content-pipeline already uses **Vitest** + integration tests against a real Drizzle schema. Same pattern extended.

**Three test layers:**

1. **Stage-level integration tests** (existing pattern, plus tenant isolation)
   - Set up two sites in a fresh test DB, run stage for site A, assert site B's data untouched.
   - Add: `discover-keywords.test.ts` covers "site A's seed keywords don't appear in site B's queue".
   - Add: `fetch-image.test.ts` covers "site A using image hash X doesn't block site B from using same hash X".

2. **suprero-app server-action tests** (new)
   - Vitest unit tests for: invite member, add article, update site settings.
   - Mock Better Auth session via injected context, hit real Postgres test DB.
   - Each test wraps fresh org+site+user setup in `beforeEach`; rollback via transaction or truncate.

3. **End-to-end smoke** (new, Playwright)
   - One happy-path E2E: invite-accept → login → add article → see queue update → open article → click export.
   - Runs against local stack before each merge.

**Coverage gates:** No numerical requirements. Require **every new endpoint and stage signature has at least one test exercising the multi-tenant case** (two sites, assert isolation).

**Migration testing:** the dry-run on a prod-snapshot copy *is* the migration test. No automated test catches what real-data dry-run catches.

**No mocking the database in pipeline tests** — integration tests must hit a real database (per user's standing rule from prior incident where mocked tests passed but prod migration failed).

### Observability

- Pino logs: every log line in stage code gets a `siteId` tag via child logger.
- Deploy verification (per project CLAUDE.md): `gh run watch <run-id>` after push, then `curl https://xerogravity.com/api/articles | head` to confirm legacy route works.
- New: `curl https://app.suprero.com/api/health` once that exists.

## Non-goals (explicit)

| Deferred | Spec |
|---|---|
| Recovery Center | Subsystem D |
| Analytics + Page Detail | Subsystem E |
| Stripe billing, plan tiers, usage metering | Subsystem F |
| Publishing to customer's CMS (WordPress, Webflow, etc.) | Post-v1 |
| Hosting customer's blog at customer.suprero.com | Post-v1 |
| Article editing in dashboard | v0.1 |
| Google/GitHub OAuth | v0.1 |
| 2FA / MFA | Post-v0 |
| Mobile-responsive dashboard | Post-v0 |
| Real-time queue updates (SSE/WebSocket) | Post-v0 |
| Per-site cron schedules | Post-v0 |
| Per-site rate limit enforcement | Post-v0 |
| Bulk article operations | Post-v0 |
| Audit log of auth events | Post-v0 |
| Postgres Row-Level Security | Defer until compliance demands |
| Marketing site (`suprero.com`) | Out of scope |

## Final scope summary

- **Schema:** 9 new tables (auth + tenancy + api_call_log), 5 existing tables get `siteId`
- **Auth:** Better Auth + organizations plugin, email+password + magic-link, invite-only signup, Resend
- **Pipeline:** every stage takes `siteId`; scheduler iterates sites sequentially; XG continues unchanged via `XG_SITE_ID`; `api_call_log` tracks usage
- **Dashboard:** Next.js 15 at `tradingview/suprero-app/`, App Router + Server Components, ports mocks 1:1, talks to shared Postgres via Drizzle, uses content-pipeline REST only for stage triggers
- **Pages:** 6 customer + 4 staff = 10 screens
- **Migration:** 4 phases, prod-snapshot dry-run, ~1 week of "tenant 0 only" before first beta customer
- **Tests:** stage-level multi-tenant isolation, server-action unit tests, one Playwright happy-path E2E
- **Deferred:** Recovery, Analytics, Billing, CMS publishing, hosted blogs, mobile, OAuth — all separate specs
