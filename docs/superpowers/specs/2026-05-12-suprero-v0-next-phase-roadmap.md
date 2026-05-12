# Suprero v0 — Next-Phase Roadmap (Plans 7–10)

Date: 2026-05-12
Status: Draft — pending review
Parent spec: [`2026-05-08-suprero-v0-design.md`](./2026-05-08-suprero-v0-design.md)

## Purpose

Plans 1–6 delivered the multi-tenant *foundation*: schema, auth, invites, password flows, the seed/backfill for XG, and the pipeline siteId threading. Plans 7–10 deliver the *application*: the operator dashboard customers actually use, the deploy story that puts it on the internet, the pipeline change that lets cron service tenants other than XG, and the staff observability that lets us run the closed beta safely.

This doc decomposes the v0 spec's remaining scope into four sub-plans, fixes their order, and names the dependencies between them. Each sub-plan gets its own detailed plan file under `docs/superpowers/plans/` once approved.

## Current state (as of 2026-05-12)

| Plan | Status | Where |
|---|---|---|
| 1 — additive schema | ✓ on main | content-pipeline `f7d29bc` |
| 2 — suprero-app auth | ✓ on main | suprero-app `a0968f9` |
| 3 — invite flow | ⏳ on `feat/customer-invite` only | not merged, not deployed |
| 4 — auth follow-ups | ✓ on main | suprero-app `1b14468` |
| 5 — seed XG + backfill | ⏳ script committed, not run on prod | branch `feat/customer-invite` |
| 6 — pipeline siteId threading | ⏳ code + migration `0005` committed, not deployed | branch `feat/customer-invite` |

**Pre-condition for Plans 7–10:** Plans 3, 5, 6 must be merged to main and rolled out to prod in the order specified in their own plan files (`0004` migration → backfill SQL → Phase A code → `0005` migration). The roadmap below assumes that rollout has completed.

## Sub-plan ordering (Approach A — customer-value-first)

```
   ┌──────────────────────────┐
   │ Plans 1–6 deployed       │
   │ to prod (precondition)   │
   └────────────┬─────────────┘
                ▼
   ┌──────────────────────────┐
   │ Plan 7                   │
   │ Operator dashboard       │  built locally, no prod impact
   │ (6 customer pages)       │
   └────────────┬─────────────┘
                ▼
   ┌──────────────────────────┐
   │ Plan 8                   │
   │ Suprero-app prod deploy  │  DNS, hosting, GH Actions
   │ (app.suprero.com live)   │
   └────────────┬─────────────┘
                ▼
   ┌──────────────────────────┐
   │ Plan 9                   │  hard blocker for first non-XG
   │ Multi-site scheduler +   │  customer — cron would otherwise
   │ shim refactor            │  only service XG
   └────────────┬─────────────┘
                ▼
   ┌──────────────────────────┐
   │ ── First beta customer ──│
   └────────────┬─────────────┘
                ▼
   ┌──────────────────────────┐
   │ Plan 10                  │
   │ Staff dashboard +        │  not customer-blocking; ships
   │ api_call_log writes      │  after we know what's actually
   │ (4 admin pages)          │  worth observing in prod
   └──────────────────────────┘
```

Rationale: customers are the value-delivery path. Plan 7 builds the UI locally (no prod risk). Plan 8 deploys it. Plan 9 unblocks the cron pipeline for tenants other than XG — without it, a beta customer's articles would sit in `status='requested'` forever. Plan 10 is internal-only and can ship after the first customer onboards.

Originally Plan 9 and Plan 10 were swapped in the decomposition discussion; this doc commits to the corrected order because Plan 9 is customer-blocking and Plan 10 is not.

---

## Plan 7 — Operator dashboard

**Goal:** Port the 6 customer-facing mocks from `Suprero Design System/` into `suprero-app/` 1:1, wire them to real Drizzle queries and server actions, and tenant-scope every route via middleware.

**Pages (5 new, 1 already exists):**

| Route | Source mock | Status |
|---|---|---|
| `/app/[org]/[site]` | `Dashboard Overview.html` | new |
| `/app/[org]/[site]/queue` | `Content Queue.html` | new |
| `/app/[org]/[site]/articles/[id]` | (derived from Page Detail mock) | new |
| `/app/[org]/[site]/settings` | `Settings.html` | new |
| `/app/[org]/settings/team` | (Team subsection) | new |
| `/app/[org]/settings/sites` | (Sites subsection) | new |
| `/app/profile` | `Profile.html` | exists (Plan 4) |

**Plus:**
- Tenant-scoping middleware: verify session user is a member of `[orgSlug]`, and `[siteSlug]` belongs to that org; else 404.
- Sidebar site switcher: popover with org's sites + "Switch org" if user belongs to multiple.
- Server actions: `addArticle`, `updateSiteSettings`, `triggerStageRun` (calls content-pipeline `POST /api/admin/trigger/:stage` with `x-admin-key` header), `inviteMember` (wraps Better Auth), `removeMember`, `createSite`, `deleteSite`.
- Export route handler: streams `.zip` with article HTML + hero image + inline images.
- Theme toggle: `data-theme` attribute on `<html>`, cookie + localStorage.

**Out of scope (per spec):** real-time updates, article editing, bulk multi-select, mobile responsive, persisted dark mode.

**Dependencies:** Plans 3+5+6 on prod (multi-tenant DB ready). Local dev only — no prod impact yet.

**Estimated size:** Largest plan to date. Rough comparable: Plan 3 (`feat/customer-invite`) was 2039 lines; Plan 7 will likely match or exceed.

**Key decisions to lock during plan-writing:**
- Where to host the shared design tokens (`colors_and_type.css` → `globals.css` per spec; need to confirm).
- Whether to extract Lucide SVGs into a single `components/icons.tsx` (per spec) or keep inline per mock.
- Server action error handling pattern (Next.js 16 has breaking changes per `AGENTS.md` — must read `node_modules/next/dist/docs/` first).
- `triggerStageRun` retry/timeout policy when content-pipeline is slow.

---

## Plan 8 — Suprero-app prod deploy

**Goal:** Ship `suprero-app` to `app.suprero.com` with the same git-push-auto-deploys pattern as content-pipeline.

**Scope:**
- Hosting: same backend VPS as content-pipeline (`/srv/suprero-app`), pm2 process `suprero-app`, fronted by nginx (per `reference_content_pipeline_prod`).
- DNS: `app.suprero.com` A record → backend VPS.
- TLS: certbot (matches existing pipeline.xerogravity.com setup).
- Env: `BETTER_AUTH_URL=https://app.suprero.com`, `BETTER_AUTH_SECRET` (prod-only), `DATABASE_URL` pointing at prod content-pipeline DB, `RESEND_API_KEY` (prod), `CONTENT_PIPELINE_URL=https://pipeline.xerogravity.com`, `CONTENT_PIPELINE_ADMIN_KEY`.
- GitHub Actions workflow: build (`next build`), rsync to VPS, `pm2 reload suprero-app`. Mirrors `.github/workflows/deploy.yml` pattern.
- Health endpoint: `GET /api/health` returns DB + content-pipeline reachability.
- Holding page: 503 until first deploy lands.
- DKIM/SPF/DMARC on `suprero.com` for Resend's `noreply@suprero.com` sender (already required by spec).

**Out of scope:** CDN, multi-region, staging env (closed beta deploys direct to prod), zero-downtime deploys (pm2 reload is good enough).

**Dependencies:** Plan 7 functionally complete locally. DNS provisioning may have a few-day lead time — start it in parallel with Plan 7's later tasks.

**Estimated size:** Smallest of the four plans. Rough comparable: Plan 5 (438 lines).

**Key decisions to lock:**
- pm2 vs Docker for hosting. Content-pipeline uses pm2 with `tsx`; suprero-app builds to a Next.js standalone output, so `node .next/standalone/server.js` under pm2 is the simplest match.
- Sharing the prod Postgres directly vs read replica. v0 spec says direct; revisit if contention shows up.
- Whether to use `NEXT_PUBLIC_*` env vars at build time or runtime (Next.js 16 nuance — verify against `node_modules/next/dist/docs/`).

---

## Plan 9 — Multi-site scheduler + shim refactor

**Goal:** Replace the `getDefaultSiteId()` shim from Plan 6 with parent-propagation, and make the cron scheduler iterate over `site.scheduleEnabled = true` instead of running once for XG. After this plan, a beta customer's articles actually progress through the pipeline on cron, not just on manual trigger.

**Scope:**

Code changes in `content-pipeline/src/`:
- `scheduler/index.ts`: each cron handler does `SELECT id FROM site WHERE scheduleEnabled = true`, then loops over sites, calling the stage with each `siteId`. Sequential per the spec (concurrency post-v0).
- `stages/discover-keywords.ts`: takes `siteId` parameter; `seed_keywords` query already scoped (per Plan 6) — verify.
- `stages/harvest-keywords.ts`: drop `getDefaultSiteId()` call; siteId comes from the loop in scheduler.
- `stages/research-topic.ts`, `outline-article.ts`, `write-article.ts`: drop `getDefaultSiteId()`; siteId comes from the article row being processed.
- `stages/fetch-image.ts`: same.
- `stages/publish-due.ts`: same.
- `stages/drive-article.ts` (orchestrator): siteId comes from the article row.
- `db/queries.ts`: delete `getDefaultSiteId()` helper and the `TODO(multi-tenant)` comment.
- Per-site logger: `runWithSiteLogger(siteId, () => stage(siteId))` wraps each call so logs get a `siteId` tag (Pino child logger, per spec).
- Failure isolation: try/catch around each per-site stage call; one site's failure must not block others (per spec).

Tests:
- New: `scheduler.test.ts` verifies two sites both get serviced in one cron tick.
- Update existing stage tests to take `siteId` explicitly rather than calling `seedXgSite()`.
- Tenant isolation tests already exist from Plans 1+6 — extend to cover scheduler.

Migration: none (purely code).

**Out of scope:** per-site cron schedules, per-site rate limits (still logging-only via `api_call_log` — see Plan 10), horizontal scaling.

**Dependencies:**
- Plan 6 (Phase A + B) on prod — `getDefaultSiteId()` must currently exist as the thing being removed.
- Plan 8 on prod — without app.suprero.com customers can't be onboarded, so this plan's value isn't realized otherwise. (Plan 9 is still safe to ship before Plan 8 lands; the value just sits dormant.)

**Estimated size:** Medium. Comparable: Plan 6 (624 lines).

**Key decisions to lock:**
- Whether the staff `__suprero_staff__` org gets a `site` row (probably not — staff has no pipeline). If not, ensure scheduler skips orgs with no sites.
- What happens when a site has `scheduleEnabled=false` mid-run — current run finishes, next cron skips. Verify against `publish-due` (5-min cron is most frequent).
- Error semantics when one site's `discoverKeywords` throws — log + continue; do we surface to the dashboard or just logs? v0: logs only.

---

## Plan 10 — Staff dashboard + `api_call_log` writes

**Goal:** Make the four staff admin pages live, and add the pipeline writes that populate `api_call_log` (so the API Costs page has data to show).

**Scope:**

Pages (4 staff routes):

| Route | Source mock | Notes |
|---|---|---|
| `/staff` | `Admin Overview.html` | counts across all orgs, system health snapshot |
| `/staff/users` | `Admin Users.html` | read-only list, all users + their orgs |
| `/staff/api-costs` | `Admin API Costs.html` | daily/monthly spend by provider+site, reads `api_call_log` |
| `/staff/settings` | `Admin Settings.html` | env display + extend existing `/staff/invites` |

(`/staff/invites` already exists from Plan 3 — Plan 10 adds nav to it but doesn't rebuild it.)

Plus:
- Middleware: gate `/staff/*` on `user.memberships` containing an org with `metadata.isStaff = true`. Non-staff users get 404, not 403, to avoid revealing the route exists.
- Seed script: create `__suprero_staff__` org in prod, add current operators as members with `role='owner'`. Modeled on Plan 5's `seed-xg-and-backfill.sql`. New file: `scripts/seed-staff-org.sql`.

Pipeline changes (the `api_call_log` writes):
- New helper: `db/queries.ts::recordApiCall(siteId, provider, costEstimateUsd?, metadata?)`.
- Call sites: every external API call in `stages/`:
  - DataForSEO (in `discover-keywords`, `harvest-keywords`)
  - Anthropic (in `research-topic`, `outline-article`, `write-article`)
  - Unsplash / Openverse (in `fetch-image`)
- Cost estimation: rough per-call constants (e.g. Anthropic = tokens × per-token price from a const table). v0 doesn't need precision — just trend visibility.

**Out of scope:** real-time staff alerts, per-staff-user permissions (all staff members are equal in v0), audit log, RLS.

**Dependencies:**
- Plan 8 on prod (suprero-app reachable).
- Plan 9 on prod (so cron is actually generating multi-site API call traffic worth observing).
- First beta customer onboarded (otherwise API Costs page is just XG data, which we already have other tools for).

**Estimated size:** Medium-large. Comparable: Plan 4 (482 lines) plus pipeline write changes — roughly 500–700 lines.

**Key decisions to lock:**
- Cost estimation accuracy bar — order-of-magnitude is enough for v0; do we ever want exact? Probably not until billing (subsystem F) is on the table.
- Whether `api_call_log` rows are written sync (inside the stage transaction) or fire-and-forget. Fire-and-forget is fine — a missing log row is not a correctness bug.
- Health snapshot definition for `/staff` Overview — counts of articles in each status, last-cron-tick timestamps, pm2 process state? Pick the cheapest signal that surfaces real failures.

---

## Cross-cutting concerns

### Schema sharing path-alias

The v0 spec proposes converting the monorepo to a pnpm workspace with a `packages/db-schema/` shared between content-pipeline and suprero-app. This has *not* happened yet — suprero-app currently imports via a TypeScript path alias `@suprero/db-schema` → `../content-pipeline/src/db/schema.ts` (`README.md` is explicit about this). The pnpm workspace conversion is **out of scope for Plans 7–10**; the path alias works fine. Revisit only if a third app needs the schema.

### Order of prod deploys

Plans 7–10 must roll out in this strict order; out-of-order deploys break things:

1. **Plan 7** — local only. No prod impact.
2. **Plan 8** — deploy `suprero-app` to prod. Requires Plan 7 to have something worth deploying.
3. **Plan 9** — deploy `content-pipeline` scheduler change. Safe to ship before Plan 8 (no app-side dependency), but the value is realized only once customers exist.
4. **Plan 10** — deploy `content-pipeline` (`api_call_log` writes) + `suprero-app` (staff pages). Requires both Plans 8 and 9 on prod.

If timeline pressure shifts, Plan 9 can ship in parallel with the back half of Plan 7 (different repo, no code conflicts).

### What's still deferred to specs beyond v0

Unchanged from the parent spec: Recovery Center (D), Analytics (E), Stripe billing (F), OAuth, 2FA, mobile, real-time, audit log, RLS, marketing site. None of these are in Plans 7–10.

## Open questions for the user to resolve before Plan 7 starts

1. **Hosting target for `suprero-app`:** backend VPS via pm2 (matches content-pipeline), or somewhere else (Vercel, Render, Fly)? Default if unanswered: backend VPS + pm2 + nginx.
2. **First beta customer identity:** decided yet? Affects how cautious Plan 8's "first deploy" needs to be (a known internal user is more forgiving than a real external one).
3. **Plan 7 task split for subagent-driven execution:** one mega-plan (~2000 lines like Plan 3) or split into 7a (Dashboard + Queue) and 7b (Article Detail + Settings + Team + Sites)? Spec is silent; default if unanswered: one mega-plan, parallelisable inside via subagent-driven-development.

## Next step

Once this roadmap is approved, invoke the `superpowers:writing-plans` skill to draft Plan 7 (Operator dashboard) in detail.
