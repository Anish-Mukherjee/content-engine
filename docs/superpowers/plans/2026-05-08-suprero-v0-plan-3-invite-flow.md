# Suprero v0 — Plan 3: Email + Invite-Only Flow + Org/Site Auto-Creation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lock down Suprero to invite-only signup, add Resend for transactional email, and auto-create the org + default site when a customer accepts their invite. After this plan, an operator can: create a customer invite from `/staff/invites`, the customer receives a real email, clicks the link, sets their password, and lands in `/app/<orgSlug>/<siteSlug>` with their org and a default site already created.

**Architecture:** New `customer_invite` table in the shared Drizzle schema (separate from Better Auth's `invitation` table — staff invites pre-date the org's existence). Resend SDK in suprero-app for sending. Three new pages in suprero-app: `/staff/invites` (operator-only), `/accept-invite?token=...` (recipient), and a hardened `/signup` that's gated by `ALLOW_OPEN_SIGNUP` env var. A new accept-invite server action handles the user → org → site → membership atomic creation.

**Tech Stack:** Next.js 16, Better Auth, Drizzle ORM, Postgres, Resend SDK (`resend@^4`), zod for env. No new framework dependencies in suprero-app beyond Resend.

**Spec:** [`docs/superpowers/specs/2026-05-08-suprero-v0-design.md`](../specs/2026-05-08-suprero-v0-design.md)

**Cross-repo nature:** Tasks 1–6 modify `content-pipeline/` (the shared schema). Tasks 7–17 modify `suprero-app/`. Each task explicitly states its working directory and target repo.

**Decision: open signup gated by env var.** Plan 2's open signup stays in place but only works when `ALLOW_OPEN_SIGNUP=true` is set (dev mode). Production deploys leave it unset, making /signup return a "use your invite link" message. This avoids removing/restoring the signup page across plans.

**Decision: email templates as raw HTML strings, not React Email.** Three templates in v0 (invite, password-reset, magic-link). Plain HTML strings in TS are sufficient and avoid adding `react-email` + a build step.

---

## Pre-conditions

- Plan 1 deployed to prod and stable (all 9 new tables exist; 5 nullable `site_id` columns added).
- Plan 2 shipped to GitHub at `Anish-Mukherjee/suprero-app`. `npm run dev` works locally; signup/login/profile/sign-out all work.
- A Resend account exists with at least one verified sending domain (or use Resend's sandbox `onboarding@resend.dev` during dev). Capture the API key.
- `content-pipeline` and `suprero-app` working trees are both clean.

---

## File Structure

### `content-pipeline/` files this plan touches

| Path | Action | Responsibility |
|---|---|---|
| `content-pipeline/src/db/schema.ts` | Modify | Add `customerInvite` table |
| `content-pipeline/drizzle/0004_<auto>.sql` | Generated | Migration 0004 |
| `content-pipeline/drizzle/meta/_journal.json` | Generated | Drizzle ledger |
| `content-pipeline/drizzle/meta/0004_snapshot.json` | Generated | Drizzle snapshot |
| `content-pipeline/src/db/schema.test.ts` | Modify | Add 1 test asserting `customer_invite` table exists |

### `suprero-app/` files this plan creates

| Path | Action | Responsibility |
|---|---|---|
| `suprero-app/src/lib/env.ts` | Modify | Add `RESEND_API_KEY`, `EMAIL_FROM`, optional `ALLOW_OPEN_SIGNUP` |
| `suprero-app/.env.local.example` | Modify | Document new env vars |
| `suprero-app/src/lib/email/client.ts` | Create | Lazy Resend client |
| `suprero-app/src/lib/email/send.ts` | Create | `sendEmail({to, subject, html, text?})` wrapper |
| `suprero-app/src/lib/email/templates/invite.ts` | Create | HTML+text invite template |
| `suprero-app/src/lib/invites.ts` | Create | `createCustomerInvite`, `findInviteByToken`, `markInviteAccepted` |
| `suprero-app/src/lib/staff.ts` | Create | `isStaffUser` helper — checks if user is member of `__suprero_staff__` org |
| `suprero-app/src/app/signup/page.tsx` | Modify | Hide form when `ALLOW_OPEN_SIGNUP` is not set |
| `suprero-app/src/app/signup/actions.ts` | Modify | Reject signup when `ALLOW_OPEN_SIGNUP` is not set |
| `suprero-app/src/app/accept-invite/page.tsx` | Create | Token-validated signup form |
| `suprero-app/src/app/accept-invite/actions.ts` | Create | Accept-invite server action — creates user, org, site, membership |
| `suprero-app/src/app/accept-invite/accept-invite.css` | Create | Reuses login.css for shell + a few additions |
| `suprero-app/src/app/staff/invites/page.tsx` | Create | Operator UI for managing invites |
| `suprero-app/src/app/staff/invites/actions.ts` | Create | `createInviteAction` — DB insert + Resend send |
| `suprero-app/src/app/staff/invites/staff-invites.css` | Create | Styles |
| `suprero-app/src/app/staff/layout.tsx` | Create | Staff route guard — redirects non-staff users |
| `suprero-app/src/middleware.ts` | Modify | Add `/staff` to `PROTECTED` list |

---

## Tasks

### Task 1: Add `customerInvite` table to shared schema (content-pipeline)

**Working directory:** `/Users/anish/Desktop/work/zeeahmed/tradingview/content-pipeline`

**Files:**
- Modify: `src/db/schema.ts`

- [ ] **Step 1: Verify content-pipeline state**

```bash
cd /Users/anish/Desktop/work/zeeahmed/tradingview/content-pipeline
git status -sb
```

Expected: working tree clean. Branch is `main` (Plan 1 has merged) OR `feat/multi-tenant-phase-1` if the 24h soak hasn't completed yet. Either is fine; this plan's migration is independent.

If on `feat/multi-tenant-phase-1`, create a new branch from there:
```bash
git checkout -b feat/customer-invite
```

If on `main`, create from main:
```bash
git checkout -b feat/customer-invite
```

- [ ] **Step 2: Append `customerInvite` to `src/db/schema.ts`**

Append this block to the bottom of `src/db/schema.ts` (after `apiCallLog`):

```ts
// ─────────────────────────────────────────────────────────────────
// customer_invite — staff-issued invites that pre-date org existence
// (separate from better-auth invitation, which requires an org)
// ─────────────────────────────────────────────────────────────────

export const customerInvite = pgTable('customer_invite', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull(),
  token: text('token').notNull().unique(), // url-safe random; verified by /accept-invite
  intendedOrgName: text('intended_org_name').notNull(), // pre-filled on accept; user can edit
  inviterUserId: text('inviter_user_id').references(() => user.id, { onDelete: 'set null' }),
  status: text('status').notNull().default('pending'), // 'pending' | 'accepted' | 'expired' | 'revoked'
  expiresAt: timestamp('expires_at').notNull(),
  acceptedAt: timestamp('accepted_at'),
  acceptedUserId: text('accepted_user_id').references(() => user.id, { onDelete: 'set null' }),
  acceptedOrgId: text('accepted_org_id').references(() => organization.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => ({
  idxStatusEmail: index('idx_ci_status_email').on(t.status, t.email),
  idxToken: uniqueIndex('uniq_ci_token').on(t.token),
}));
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add src/db/schema.ts
git commit -m "feat(schema): add customer_invite table for staff-issued invites"
```

---

### Task 2: Generate Drizzle migration 0004 (content-pipeline)

**Working directory:** `/Users/anish/Desktop/work/zeeahmed/tradingview/content-pipeline`

**Files:**
- Generated: `drizzle/0004_<auto>.sql`
- Generated: `drizzle/meta/_journal.json` (updated)
- Generated: `drizzle/meta/0004_snapshot.json`

- [ ] **Step 1: Generate**

```bash
npm run db:generate
ls drizzle/0004_*.sql
```

Expected: a new file `drizzle/0004_<some-name>.sql` is created. Note the filename for the report.

- [ ] **Step 2: Inspect SQL — confirm additive only**

```bash
cat drizzle/0004_*.sql
```

Required SQL statements:
- `CREATE TABLE "customer_invite"` with all the columns from Task 1
- 2 FKs: `inviter_user_id → user.id` (ON DELETE SET NULL) and `accepted_user_id → user.id` (ON DELETE SET NULL) and `accepted_org_id → organization.id` (ON DELETE SET NULL) — total 3 FKs to existing **new** tables (user, organization). All targets are tables added in Plan 1, so this is "FKs between new tables" — additive-safe.
- 2 indexes: `idx_ci_status_email`, `uniq_ci_token`

Forbidden:
- `DROP TABLE`, `DROP COLUMN`, `DROP INDEX`
- Any `ALTER TABLE` on the 5 existing pipeline tables (articles/seed_keywords/etc.)
- Any `UPDATE` on existing tables

If forbidden statements appear, stop and roll back the schema changes from Task 1.

- [ ] **Step 3: Commit**

```bash
git add drizzle/
git commit -m "feat(db): generate migration 0004 — customer_invite table"
```

---

### Task 3: Add smoke test for migration 0004 (content-pipeline)

**Working directory:** `/Users/anish/Desktop/work/zeeahmed/tradingview/content-pipeline`

**Files:**
- Modify: `src/db/schema.test.ts`

- [ ] **Step 1: Append a new test block**

Open `src/db/schema.test.ts` and add a new `describe` block at the bottom (before the file's closing brace if any):

```ts
describe('schema 0004 — customer_invite table', () => {
  it('creates the customer_invite table', async () => {
    const tables = await db().execute<{ table_name: string }>(sql`
      select table_name from information_schema.tables
      where table_schema = 'public'
      and table_name = 'customer_invite'
    `);
    expect(tables.length).toBe(1);
  });

  it('customer_invite.token is uniquely indexed', async () => {
    const rows = await db().execute<{ indexname: string }>(sql`
      select indexname from pg_indexes
      where schemaname = 'public'
        and tablename = 'customer_invite'
        and indexname = 'uniq_ci_token'
    `);
    expect(rows.length).toBe(1);
  });

  it('customer_invite has FKs to user and organization', async () => {
    const fks = await db().execute<{ constraint_name: string; column_name: string }>(sql`
      select tc.constraint_name, kcu.column_name
      from information_schema.table_constraints tc
      join information_schema.key_column_usage kcu
        on tc.constraint_name = kcu.constraint_name
      where tc.table_name = 'customer_invite'
        and tc.constraint_type = 'FOREIGN KEY'
      order by kcu.column_name
    `);
    const cols = fks.map((f) => f.column_name).sort();
    expect(cols).toEqual(['accepted_org_id', 'accepted_user_id', 'inviter_user_id']);
  });
});
```

Note: this assumes `describe`, `it`, `expect`, `db`, `sql` are already imported at the top of the file from the existing schema 0003 tests. If not, add the missing imports.

- [ ] **Step 2: Apply migration locally**

```bash
npm run db:migrate
```

Expected: drizzle reports 0004 applied.

- [ ] **Step 3: Run the new tests**

```bash
npm test -- src/db/schema.test.ts
```

Expected: 8 tests pass (5 from 0003 + 3 new for 0004).

- [ ] **Step 4: Commit**

```bash
git add src/db/schema.test.ts
git commit -m "test(db): smoke test migration 0004 customer_invite"
```

---

### Task 4: Dry-run migration 0004 against prod snapshot (content-pipeline)

**Working directory:** `/Users/anish/Desktop/work/zeeahmed/tradingview/content-pipeline`

**Files:**
- None modified

- [ ] **Step 1: Snapshot current prod**

```bash
./scripts/snapshot-prod-db.sh prod-snapshot-pre-0004.sql
```

Expected: file created, multi-megabyte. (Note: prod already has 0003 applied as of Plan 1.)

- [ ] **Step 2: Restore to dry-run DB**

```bash
DEV_URL=$(grep -E '^DATABASE_URL=' .env | head -1 | cut -d= -f2- | tr -d '"')
ADMIN_URL=$(echo "$DEV_URL" | sed -E 's#/[^/?]+(\?|$)#/postgres\1#')

psql "$ADMIN_URL" -c "DROP DATABASE IF EXISTS content_pipeline_dryrun;"
psql "$ADMIN_URL" -c "CREATE DATABASE content_pipeline_dryrun;"

# Strip the SSH \restrict / \unrestrict meta-commands that some servers inject
grep -v -E '^\\(restrict|unrestrict)' prod-snapshot-pre-0004.sql > /tmp/snapshot-clean.sql

DRYRUN_URL=$(echo "$DEV_URL" | sed -E 's#/[^/?]+(\?|$)#/content_pipeline_dryrun\1#')
psql "$DRYRUN_URL" -f /tmp/snapshot-clean.sql > /tmp/restore.log 2>&1
tail -5 /tmp/restore.log
```

Expected: restore completes; tail shows successful CREATE TABLE / COPY statements.

- [ ] **Step 3: Capture row counts BEFORE migration**

```bash
psql "$DRYRUN_URL" -At -c "
SELECT 'articles' AS t, count(*) FROM articles
UNION ALL SELECT 'seed_keywords', count(*) FROM seed_keywords
UNION ALL SELECT 'keyword_results', count(*) FROM keyword_results
UNION ALL SELECT 'dataforseo_tasks', count(*) FROM dataforseo_tasks
UNION ALL SELECT 'image_usage', count(*) FROM image_usage
UNION ALL SELECT 'user', count(*) FROM \"user\"
UNION ALL SELECT 'organization', count(*) FROM organization;
" | sort > /tmp/counts-before.txt
cat /tmp/counts-before.txt
```

- [ ] **Step 4: Apply migration**

```bash
DATABASE_URL="$DRYRUN_URL" npm run db:migrate
```

Expected: 0004 applied successfully.

- [ ] **Step 5: Capture row counts AFTER migration**

```bash
psql "$DRYRUN_URL" -At -c "
SELECT 'articles' AS t, count(*) FROM articles
UNION ALL SELECT 'seed_keywords', count(*) FROM seed_keywords
UNION ALL SELECT 'keyword_results', count(*) FROM keyword_results
UNION ALL SELECT 'dataforseo_tasks', count(*) FROM dataforseo_tasks
UNION ALL SELECT 'image_usage', count(*) FROM image_usage
UNION ALL SELECT 'user', count(*) FROM \"user\"
UNION ALL SELECT 'organization', count(*) FROM organization;
" | sort > /tmp/counts-after.txt

diff /tmp/counts-before.txt /tmp/counts-after.txt
echo "diff exit: $?"
```

Expected: `diff` exits 0 (counts identical).

- [ ] **Step 6: Verify customer_invite table exists in dry-run**

```bash
DATABASE_URL="$DRYRUN_URL" npm test -- src/db/schema.test.ts
```

Expected: all 8 tests pass.

- [ ] **Step 7: Cleanup**

```bash
psql "$ADMIN_URL" -c "DROP DATABASE content_pipeline_dryrun;"
rm -f prod-snapshot-pre-0004.sql /tmp/snapshot-clean.sql /tmp/restore.log /tmp/counts-before.txt /tmp/counts-after.txt
```

No commits in Task 4 (verification only).

---

### Task 5: Push feat/customer-invite + deploy 0004 to prod (content-pipeline) [USER GATE]

**Working directory:** `/Users/anish/Desktop/work/zeeahmed/tradingview/content-pipeline`

**Files:**
- None modified

- [ ] **Step 1: Push the branch**

```bash
git push -u origin feat/customer-invite
```

- [ ] **Step 2: ASK USER for explicit go-ahead before touching prod**

Wait for user confirmation: "Proceed with prod deploy of migration 0004 (customer_invite)." If the user declines, stop here.

- [ ] **Step 3: Deploy via SSH (mirror of Plan 1 Task 11)**

```bash
SSHPASS="$(awk -F': ' '/^password: / {print $2; exit}' /Users/anish/Desktop/work/zeeahmed/tradingview/creds.txt)" \
sshpass -e ssh backend-vps "
  source ~/.nvm/nvm.sh &&
  pm2 stop content-pipeline &&
  cd /srv/content-pipeline &&
  git fetch origin &&
  git checkout feat/customer-invite &&
  npm ci &&
  npm run db:migrate &&
  pm2 start content-pipeline &&
  sleep 4 &&
  pm2 list | head -10
"
```

Expected: pm2 reports content-pipeline `online`. Migration 0004 applied.

- [ ] **Step 4: Smoke test the legacy public API still works**

```bash
curl -sS "https://pipeline.xerogravity.com/api/articles?limit=1" | head -c 400
echo ""
```

Expected: JSON with at least 1 article. If error, run rollback (drop customer_invite table, revert prod to main):

```bash
SSHPASS="$(awk -F': ' '/^password: / {print $2; exit}' /Users/anish/Desktop/work/zeeahmed/tradingview/creds.txt)" \
sshpass -e ssh backend-vps "
  sudo -u postgres psql -d content_pipeline -c 'DROP TABLE IF EXISTS customer_invite CASCADE; DELETE FROM drizzle.__drizzle_migrations WHERE id IN (SELECT id FROM drizzle.__drizzle_migrations ORDER BY created_at DESC LIMIT 1);'
"
```

Then `git checkout main` on prod and pm2 restart.

- [ ] **Step 5: Verify customer_invite exists in prod**

```bash
SSHPASS="$(awk -F': ' '/^password: / {print $2; exit}' /Users/anish/Desktop/work/zeeahmed/tradingview/creds.txt)" \
sshpass -e ssh backend-vps "sudo -u postgres psql -d content_pipeline -c 'SELECT count(*) FROM customer_invite;'"
```

Expected: `count` = 0 (table exists, no rows yet).

- [ ] **Step 6: Confirm with user that prod is healthy**

End Task 5. Subsequent tasks (6+) are all in suprero-app/ — no further prod-touching this plan.

---

### Task 6: Add `RESEND_API_KEY`, `EMAIL_FROM`, `ALLOW_OPEN_SIGNUP` env vars (suprero-app)

**Working directory:** `/Users/anish/Desktop/work/zeeahmed/tradingview/suprero-app`

**Files:**
- Modify: `src/lib/env.ts`
- Modify: `.env.local.example`

- [ ] **Step 1: Update `src/lib/env.ts`**

Use Edit tool. The current `schema` is:

```ts
const schema = z.object({
  DATABASE_URL: z.string().url(),
  BETTER_AUTH_SECRET: z.string().min(32, 'BETTER_AUTH_SECRET must be at least 32 chars'),
  APP_URL: z.string().url(),
  NEXT_PUBLIC_APP_URL: z.string().url(),
});
```

Replace with:

```ts
const schema = z.object({
  DATABASE_URL: z.string().url(),
  BETTER_AUTH_SECRET: z.string().min(32, 'BETTER_AUTH_SECRET must be at least 32 chars'),
  APP_URL: z.string().url(),
  NEXT_PUBLIC_APP_URL: z.string().url(),
  RESEND_API_KEY: z.string().min(1),
  EMAIL_FROM: z.string().email(),
  ALLOW_OPEN_SIGNUP: z
    .union([z.literal('true'), z.literal('false'), z.boolean()])
    .optional()
    .transform((v) => v === true || v === 'true'),
});
```

- [ ] **Step 2: Update `.env.local.example`**

Append (or use Edit tool to append below the existing block):

```
# Resend transactional email
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
EMAIL_FROM=noreply@suprero.com  # for dev: onboarding@resend.dev (Resend sandbox)

# Open signup (dev only)
# Set to 'true' to allow public /signup. Leave unset in prod for invite-only mode.
ALLOW_OPEN_SIGNUP=true
```

- [ ] **Step 3: Update your local `.env.local`**

```bash
echo "
RESEND_API_KEY=$(read -p 'Enter your Resend API key: ' k && echo $k)
EMAIL_FROM=onboarding@resend.dev
ALLOW_OPEN_SIGNUP=true
" >> .env.local
```

(Or edit the file by hand.) Use `onboarding@resend.dev` for now — it's the Resend sandbox address that doesn't require domain verification. Switch to `noreply@suprero.com` once `suprero.com` DNS is set up in Resend.

- [ ] **Step 4: Verify env loads**

```bash
npx tsx --env-file=.env.local -e "import('./src/lib/env.js').then(m => console.log(m.env()))" 2>&1 || \
npx tsx --env-file=.env.local -e "import('./src/lib/env').then(m => console.log(m.env()))"
```

Expected: prints the env object including RESEND_API_KEY (will appear in plaintext — that's fine in your local terminal).

If you see "Environment validation failed", fix the missing values in `.env.local`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/env.ts .env.local.example
git commit -m "feat(env): add resend + email-from + allow-open-signup env vars"
```

---

### Task 7: Install Resend SDK and create email service (suprero-app)

**Working directory:** `/Users/anish/Desktop/work/zeeahmed/tradingview/suprero-app`

**Files:**
- Modify: `package.json` (adds resend)
- Create: `src/lib/email/client.ts`
- Create: `src/lib/email/send.ts`

- [ ] **Step 1: Install Resend**

```bash
npm install resend@^4
```

- [ ] **Step 2: Create `src/lib/email/client.ts`**

```bash
mkdir -p src/lib/email
```

```ts
import { Resend } from 'resend';
import { env } from '../env';

let client: Resend | null = null;

export function resendClient(): Resend {
  if (!client) {
    client = new Resend(env().RESEND_API_KEY);
  }
  return client;
}
```

- [ ] **Step 3: Create `src/lib/email/send.ts`**

```ts
import { resendClient } from './client';
import { env } from '../env';

export type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  text?: string;
};

export async function sendEmail({ to, subject, html, text }: SendEmailInput): Promise<{ id: string }> {
  const result = await resendClient().emails.send({
    from: env().EMAIL_FROM,
    to,
    subject,
    html,
    text: text ?? stripHtml(html),
  });
  if (result.error) {
    throw new Error(`Resend error: ${result.error.name} - ${result.error.message}`);
  }
  if (!result.data?.id) {
    throw new Error('Resend returned no message id');
  }
  return { id: result.data.id };
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: exits 0.

- [ ] **Step 5: Smoke test (real email send)**

Create a temporary script `src/lib/email/_smoke.ts`:

```ts
import { sendEmail } from './send';

async function main() {
  const result = await sendEmail({
    to: process.env.TEST_RECIPIENT ?? 'test@example.com',
    subject: 'Suprero email smoke test',
    html: '<p>Hello from Suprero! This is the Plan 3 Task 7 smoke test.</p>',
  });
  console.log('Sent message id:', result.id);
}

main().catch((err) => { console.error(err); process.exit(1); });
```

Run it (substitute your own real email address):

```bash
TEST_RECIPIENT=anish@onesmartsheep.com npx tsx --env-file=.env.local src/lib/email/_smoke.ts
```

Expected: prints a message id like `Sent message id: 8a1f...`. Check the recipient inbox — the test email should arrive within seconds (or in spam).

If Resend errors out:
- "Domain not verified": you're trying to send from a domain that's not yet verified in Resend. Use `EMAIL_FROM=onboarding@resend.dev` for now.
- "Invalid API key": check `RESEND_API_KEY` in `.env.local`.

- [ ] **Step 6: Remove the smoke test**

```bash
rm src/lib/email/_smoke.ts
```

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json src/lib/email
git commit -m "feat(email): add resend client and sendEmail wrapper"
```

---

### Task 8: Build the invite email template (suprero-app)

**Working directory:** `/Users/anish/Desktop/work/zeeahmed/tradingview/suprero-app`

**Files:**
- Create: `src/lib/email/templates/invite.ts`

- [ ] **Step 1: Create the template**

```bash
mkdir -p src/lib/email/templates
```

`src/lib/email/templates/invite.ts`:

```ts
export type InviteEmailInput = {
  recipientEmail: string;
  inviterName: string;
  intendedOrgName: string;
  acceptUrl: string;
};

export function inviteEmail({ recipientEmail, inviterName, intendedOrgName, acceptUrl }: InviteEmailInput) {
  const subject = `${inviterName} invited you to Suprero`;

  const html = `<!doctype html>
<html>
<head><meta charset="utf-8"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:'Google Sans Code',ui-monospace,monospace;color:#000;">
  <table cellpadding="0" cellspacing="0" border="0" width="100%" style="padding:48px 24px;">
    <tr>
      <td align="center">
        <table cellpadding="0" cellspacing="0" border="0" width="480" style="background:#fff;border:1px solid #e8e8e8;border-radius:4px;padding:32px;">
          <tr><td style="padding-bottom:16px;">
            <div style="font-size:18px;font-weight:600;letter-spacing:-0.02em;">SUPRERO</div>
          </td></tr>
          <tr><td style="font-size:14px;line-height:1.6;color:#000;padding-bottom:24px;">
            <p style="margin:0 0 16px;"><strong>${escapeHtml(inviterName)}</strong> has invited you to join <strong>${escapeHtml(intendedOrgName)}</strong> on Suprero — your content operation, fully on autopilot.</p>
            <p style="margin:0 0 16px;">Click the button below to set your password and get started.</p>
          </td></tr>
          <tr><td style="padding-bottom:24px;">
            <a href="${escapeAttr(acceptUrl)}" style="display:inline-block;padding:10px 20px;background:#000;color:#fff;text-decoration:none;border-radius:4px;font-size:13px;font-weight:500;">Accept invite</a>
          </td></tr>
          <tr><td style="font-size:11px;color:#999;line-height:1.6;padding-top:16px;border-top:1px solid #e8e8e8;">
            <p style="margin:0 0 8px;">This invite will expire in 7 days.</p>
            <p style="margin:0;">If the button doesn't work, copy and paste this URL: <br><span style="word-break:break-all;color:#666;">${escapeHtml(acceptUrl)}</span></p>
          </td></tr>
        </table>
        <div style="font-size:11px;color:#999;padding-top:24px;">Sent to ${escapeHtml(recipientEmail)} because someone invited you to Suprero.</div>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = `${inviterName} has invited you to join ${intendedOrgName} on Suprero.

Click here to set your password and get started:
${acceptUrl}

This invite will expire in 7 days.

Sent to ${recipientEmail} because someone invited you to Suprero.`;

  return { subject, html, text };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(s: string): string {
  return escapeHtml(s);
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/email/templates
git commit -m "feat(email): add invite html+text template"
```

---

### Task 9: Build invite domain helpers (suprero-app)

**Working directory:** `/Users/anish/Desktop/work/zeeahmed/tradingview/suprero-app`

**Files:**
- Create: `src/lib/invites.ts`

- [ ] **Step 1: Create the helpers**

`src/lib/invites.ts`:

```ts
import { randomBytes } from 'node:crypto';
import { eq, and, gt } from 'drizzle-orm';
import { db, schema } from './db';

const INVITE_TTL_DAYS = 7;

export type CustomerInvite = typeof schema.customerInvite.$inferSelect;

export function newInviteToken(): string {
  // url-safe base64, 32 bytes of entropy = 43-char token
  return randomBytes(32).toString('base64url');
}

export async function createCustomerInvite(input: {
  email: string;
  intendedOrgName: string;
  inviterUserId: string;
}): Promise<CustomerInvite> {
  const token = newInviteToken();
  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);

  const [row] = await db()
    .insert(schema.customerInvite)
    .values({
      email: input.email.toLowerCase(),
      token,
      intendedOrgName: input.intendedOrgName,
      inviterUserId: input.inviterUserId,
      expiresAt,
    })
    .returning();

  if (!row) throw new Error('Failed to insert customer_invite');
  return row;
}

export async function findInviteByToken(token: string): Promise<CustomerInvite | null> {
  const [row] = await db()
    .select()
    .from(schema.customerInvite)
    .where(
      and(
        eq(schema.customerInvite.token, token),
        eq(schema.customerInvite.status, 'pending'),
        gt(schema.customerInvite.expiresAt, new Date())
      )
    )
    .limit(1);
  return row ?? null;
}

export async function markInviteAccepted(input: {
  inviteId: string;
  userId: string;
  organizationId: string;
}): Promise<void> {
  await db()
    .update(schema.customerInvite)
    .set({
      status: 'accepted',
      acceptedAt: new Date(),
      acceptedUserId: input.userId,
      acceptedOrgId: input.organizationId,
    })
    .where(eq(schema.customerInvite.id, input.inviteId));
}

export async function listPendingInvites(): Promise<CustomerInvite[]> {
  return db()
    .select()
    .from(schema.customerInvite)
    .where(eq(schema.customerInvite.status, 'pending'))
    .orderBy(schema.customerInvite.createdAt);
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

If you get an error about `customerInvite` not being exported from `@suprero/db-schema`, the schema migration from Task 1 hasn't been applied to your local TS resolution — re-run `npx tsc --noEmit` after a fresh `npm run dev` or restart your editor.

- [ ] **Step 3: Commit**

```bash
git add src/lib/invites.ts
git commit -m "feat(invites): add createCustomerInvite, findInviteByToken, markInviteAccepted helpers"
```

---

### Task 10: Build staff helper + staff layout guard (suprero-app)

**Working directory:** `/Users/anish/Desktop/work/zeeahmed/tradingview/suprero-app`

**Files:**
- Create: `src/lib/staff.ts`
- Create: `src/app/staff/layout.tsx`

The staff org is identified by `organization.slug = '__suprero_staff__'`. A user is "staff" iff they're a `member` of that org.

- [ ] **Step 1: Create `src/lib/staff.ts`**

```ts
import { eq, and } from 'drizzle-orm';
import { db, schema } from './db';

const STAFF_ORG_SLUG = '__suprero_staff__';

export async function isStaffUser(userId: string): Promise<boolean> {
  const [row] = await db()
    .select({ id: schema.member.id })
    .from(schema.member)
    .innerJoin(schema.organization, eq(schema.member.organizationId, schema.organization.id))
    .where(
      and(
        eq(schema.member.userId, userId),
        eq(schema.organization.slug, STAFF_ORG_SLUG)
      )
    )
    .limit(1);
  return row !== undefined;
}

export const SUPRERO_STAFF_ORG_SLUG = STAFF_ORG_SLUG;
```

- [ ] **Step 2: Create `src/app/staff/layout.tsx`**

```bash
mkdir -p src/app/staff
```

```tsx
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { isStaffUser } from '@/lib/staff';

export default async function StaffLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    redirect('/login');
  }
  const staff = await isStaffUser(session.user.id);
  if (!staff) {
    redirect('/profile');
  }
  return <>{children}</>;
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/staff.ts src/app/staff
git commit -m "feat(staff): add staff helper and route layout guard"
```

---

### Task 11: Build /staff/invites UI + create-invite action (suprero-app)

**Working directory:** `/Users/anish/Desktop/work/zeeahmed/tradingview/suprero-app`

**Files:**
- Create: `src/app/staff/invites/staff-invites.css`
- Create: `src/app/staff/invites/actions.ts`
- Create: `src/app/staff/invites/page.tsx`

- [ ] **Step 1: Create the CSS at `src/app/staff/invites/staff-invites.css`**

```bash
mkdir -p src/app/staff/invites
```

```css
@import url('../../login/login.css');

.staff-shell {
  min-height: 100vh;
  padding: var(--space-8);
  background: var(--bg-base);
}

.staff-container {
  max-width: 880px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: var(--space-8);
}

.staff-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  border-bottom: 1px solid var(--border-default);
  padding-bottom: var(--space-4);
}

.staff-title {
  font-size: 20px;
  font-weight: 600;
  letter-spacing: -0.02em;
  color: var(--fg-primary);
}

.staff-sub {
  font-size: 12px;
  color: var(--fg-muted);
  margin-top: 2px;
}

.invite-form {
  display: grid;
  grid-template-columns: 1fr 1fr auto;
  gap: var(--space-3);
  padding: var(--space-4);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  background: var(--bg-subtle);
  align-items: end;
}

.invite-form .auth-field {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.invite-list {
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  overflow: hidden;
}

.invite-row {
  display: grid;
  grid-template-columns: 2fr 2fr 1fr 1fr;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  border-bottom: 1px solid var(--border-default);
  align-items: center;
  font-size: 13px;
}

.invite-row:last-child {
  border-bottom: none;
}

.invite-row-head {
  background: var(--bg-subtle);
  font-size: 10px;
  font-weight: 500;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--fg-muted);
}

.invite-empty {
  padding: var(--space-8);
  text-align: center;
  color: var(--fg-muted);
  font-size: 13px;
}

.invite-success {
  font-size: 12px;
  color: #166534;
  padding: var(--space-2) var(--space-3);
  border: 1px solid #bbf7d0;
  border-radius: var(--radius-md);
  background: #f0fdf4;
}
```

- [ ] **Step 2: Create the action at `src/app/staff/invites/actions.ts`**

```ts
'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { isStaffUser } from '@/lib/staff';
import { createCustomerInvite } from '@/lib/invites';
import { sendEmail } from '@/lib/email/send';
import { inviteEmail } from '@/lib/email/templates/invite';
import { env } from '@/lib/env';

export type InviteState = { error?: string; success?: { email: string } } | null;

export async function createInviteAction(
  _prev: InviteState,
  formData: FormData
): Promise<InviteState> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    redirect('/login');
  }
  if (!(await isStaffUser(session.user.id))) {
    return { error: 'You must be a staff member to create invites.' };
  }

  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const intendedOrgName = String(formData.get('intendedOrgName') ?? '').trim();

  if (!email || !intendedOrgName) {
    return { error: 'Email and org name are required.' };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: 'Please enter a valid email address.' };
  }

  try {
    const invite = await createCustomerInvite({
      email,
      intendedOrgName,
      inviterUserId: session.user.id,
    });

    const acceptUrl = `${env().APP_URL}/accept-invite?token=${encodeURIComponent(invite.token)}`;
    const tpl = inviteEmail({
      recipientEmail: email,
      inviterName: session.user.name || session.user.email,
      intendedOrgName,
      acceptUrl,
    });
    await sendEmail({
      to: email,
      subject: tpl.subject,
      html: tpl.html,
      text: tpl.text,
    });

    return { success: { email } };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error.';
    if (msg.toLowerCase().includes('uniq_ci_token')) {
      return { error: 'Token collision (extremely rare). Try again.' };
    }
    return { error: `Failed to send invite: ${msg}` };
  }
}
```

- [ ] **Step 3: Create the page at `src/app/staff/invites/page.tsx`**

The page is a server component that reads pending invites via Drizzle. The form needs `useActionState` (a client hook), so it's split into its own client component file (`InviteFormClient.tsx`, created in Step 4).

```tsx
import { listPendingInvites } from '@/lib/invites';
import { InviteFormClient } from './InviteFormClient';
import './staff-invites.css';

export const dynamic = 'force-dynamic';

export default async function StaffInvitesPage() {
  const invites = await listPendingInvites();

  return (
    <main className="staff-shell">
      <div className="staff-container">
        <div className="staff-header">
          <div>
            <div className="staff-title">Customer invites</div>
            <div className="staff-sub">Invite a customer to create a Suprero account.</div>
          </div>
        </div>

        <InviteFormClient />

        <div className="invite-list">
          <div className="invite-row invite-row-head">
            <div>Email</div>
            <div>Org name</div>
            <div>Expires</div>
            <div>Created</div>
          </div>
          {invites.length === 0 ? (
            <div className="invite-empty">No pending invites yet.</div>
          ) : (
            invites.map((inv) => (
              <div key={inv.id} className="invite-row">
                <div>{inv.email}</div>
                <div>{inv.intendedOrgName}</div>
                <div>{new Date(inv.expiresAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>
                <div>{new Date(inv.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>
              </div>
            ))
          )}
        </div>
      </div>
    </main>
  );
}
```

Then create the client component at `src/app/staff/invites/InviteFormClient.tsx`:

```tsx
'use client';

import { useActionState } from 'react';
import { createInviteAction, type InviteState } from './actions';

export function InviteFormClient() {
  const [state, action, pending] = useActionState<InviteState, FormData>(createInviteAction, null);

  return (
    <div>
      {state?.error && (
        <div className="auth-error" style={{ marginBottom: 'var(--space-3)' }}>{state.error}</div>
      )}
      {state?.success && (
        <div className="invite-success" style={{ marginBottom: 'var(--space-3)' }}>
          Invite sent to {state.success.email}.
        </div>
      )}
      <form action={action} className="invite-form">
        <div className="auth-field">
          <label className="auth-label" htmlFor="email">Customer email</label>
          <input className="auth-input" id="email" name="email" type="email" autoComplete="off" required />
        </div>
        <div className="auth-field">
          <label className="auth-label" htmlFor="intendedOrgName">Org name (default for new account)</label>
          <input className="auth-input" id="intendedOrgName" name="intendedOrgName" type="text" autoComplete="off" required />
        </div>
        <button className="auth-button" type="submit" disabled={pending} style={{ height: '36px' }}>
          {pending ? 'Sending…' : 'Send invite'}
        </button>
      </form>
    </div>
  );
}
```

The server page reads `listPendingInvites()` directly via Drizzle (no extra round-trip). The form is a small client island.

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add src/app/staff/invites
git commit -m "feat(staff): add /staff/invites page and create-invite action"
```

---

### Task 12: Add /staff to middleware protected paths (suprero-app)

**Working directory:** `/Users/anish/Desktop/work/zeeahmed/tradingview/suprero-app`

**Files:**
- Modify: `src/middleware.ts`

- [ ] **Step 1: Update middleware**

Open `src/middleware.ts`. Find:

```ts
const PROTECTED = ['/profile'];
```

Replace with:

```ts
const PROTECTED = ['/profile', '/staff'];
```

And update the matcher config at the bottom:

```ts
export const config = {
  matcher: ['/profile/:path*'],
};
```

Replace with:

```ts
export const config = {
  matcher: ['/profile/:path*', '/staff/:path*'],
};
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/middleware.ts
git commit -m "feat(middleware): protect /staff routes"
```

---

### Task 13: Build /accept-invite page + action (suprero-app)

**Working directory:** `/Users/anish/Desktop/work/zeeahmed/tradingview/suprero-app`

**Files:**
- Create: `src/app/accept-invite/accept-invite.css`
- Create: `src/app/accept-invite/actions.ts`
- Create: `src/app/accept-invite/page.tsx`

The accept flow: GET `/accept-invite?token=...` → validate token → render signup form pre-filled with email and org name. POST creates user → creates org → adds user as owner → creates default site → marks invite accepted → signs user in → redirects to /profile.

For Plan 3, we redirect to /profile after sign-in (Plan 5 will redirect to `/app/[orgSlug]/[siteSlug]` once that route exists).

- [ ] **Step 1: Create the CSS at `src/app/accept-invite/accept-invite.css`**

```bash
mkdir -p src/app/accept-invite
```

```css
@import url('../login/login.css');

.accept-meta {
  font-size: 12px;
  color: var(--fg-muted);
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-md);
  background: var(--bg-subtle);
  border: 1px solid var(--border-default);
}

.accept-meta strong {
  color: var(--fg-primary);
  font-weight: 500;
}
```

- [ ] **Step 2: Create the action at `src/app/accept-invite/actions.ts`**

```ts
'use server';

import { eq, and } from 'drizzle-orm';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { db, schema } from '@/lib/db';
import { findInviteByToken, markInviteAccepted } from '@/lib/invites';

export type AcceptState = { error?: string } | null;

export async function acceptInviteAction(
  _prev: AcceptState,
  formData: FormData
): Promise<AcceptState> {
  const token = String(formData.get('token') ?? '').trim();
  const name = String(formData.get('name') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  const orgName = String(formData.get('orgName') ?? '').trim();

  if (!token) return { error: 'Missing invite token.' };
  if (!name) return { error: 'Name is required.' };
  if (!password || password.length < 8) return { error: 'Password must be at least 8 characters.' };
  if (!orgName) return { error: 'Org name is required.' };

  const invite = await findInviteByToken(token);
  if (!invite) {
    return { error: 'This invite link is invalid or has expired.' };
  }

  // Step A: Create the user via Better Auth (sign-up sets the session cookie too)
  let userId: string;
  try {
    const result = await auth.api.signUpEmail({
      body: { email: invite.email, password, name },
      headers: await headers(),
    });
    userId = result.user.id;
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Sign-up failed.';
    if (msg.toLowerCase().includes('already exists') || msg.toLowerCase().includes('user_already_exists')) {
      return { error: 'An account with that email already exists. Sign in instead.' };
    }
    return { error: `Sign-up failed: ${msg}` };
  }

  // Step B: Create the org + add user as owner + create default site
  // We do this in a single transaction so partial failures don't leave dangling rows.
  let orgId: string;
  let siteSlug: string;
  try {
    const result = await db().transaction(async (tx) => {
      const orgSlug = slugify(orgName) + '-' + Math.random().toString(36).slice(2, 8);
      const [org] = await tx.insert(schema.organization).values({
        id: crypto.randomUUID(),
        name: orgName,
        slug: orgSlug,
      }).returning();

      if (!org) throw new Error('Failed to insert organization.');

      await tx.insert(schema.member).values({
        id: crypto.randomUUID(),
        organizationId: org.id,
        userId,
        role: 'owner',
      });

      const slug = 'blog';
      const [site] = await tx.insert(schema.site).values({
        organizationId: org.id,
        name: `${orgName} Blog`,
        slug,
        categories: [],
      }).returning();

      if (!site) throw new Error('Failed to insert default site.');

      return { orgId: org.id, siteSlug: slug };
    });
    orgId = result.orgId;
    siteSlug = result.siteSlug;
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Org/site creation failed.';
    return { error: `Could not finalize account: ${msg}` };
  }

  // Step C: Mark invite as accepted (best-effort — failure here doesn't block the user)
  try {
    await markInviteAccepted({
      inviteId: invite.id,
      userId,
      organizationId: orgId,
    });
  } catch (err) {
    console.warn('Failed to mark invite accepted', err);
  }

  // Plan 5 will redirect to /app/<orgSlug>/<siteSlug>; for Plan 3 we send to /profile.
  redirect('/profile');
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'org';
}
```

Note: `crypto.randomUUID()` is the global Web Crypto API; it works in Node 19+ and Next.js server components.

- [ ] **Step 3: Create the page at `src/app/accept-invite/page.tsx`**

```tsx
import Link from 'next/link';
import { findInviteByToken } from '@/lib/invites';
import { AcceptInviteFormClient } from './AcceptInviteFormClient';
import './accept-invite.css';

export const dynamic = 'force-dynamic';

export default async function AcceptInvitePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  if (!token) {
    return <ExpiredState reason="missing" />;
  }

  const invite = await findInviteByToken(token);
  if (!invite) {
    return <ExpiredState reason="invalid" />;
  }

  return (
    <main className="auth-shell">
      <div className="auth-card">
        <img src="/logo.webp" alt="Suprero" className="auth-logo" />
        <div>
          <div className="auth-title">Accept your invite</div>
          <div className="auth-sub">Set your password to finish creating your Suprero account.</div>
        </div>

        <div className="accept-meta">
          Invited as <strong>{invite.email}</strong>
        </div>

        <AcceptInviteFormClient
          token={token}
          email={invite.email}
          intendedOrgName={invite.intendedOrgName}
        />
      </div>
    </main>
  );
}

function ExpiredState({ reason }: { reason: 'missing' | 'invalid' }) {
  return (
    <main className="auth-shell">
      <div className="auth-card">
        <img src="/logo.webp" alt="Suprero" className="auth-logo" />
        <div>
          <div className="auth-title">{reason === 'missing' ? 'Missing invite token' : 'Invite expired or invalid'}</div>
          <div className="auth-sub">
            {reason === 'missing'
              ? 'Open the link from your invite email — it should include a token.'
              : 'This invite has expired or has already been used. Ask whoever invited you to send a new one.'}
          </div>
        </div>
        <div className="auth-link-row">
          Already have an account? <Link href="/login">Sign in</Link>
        </div>
      </div>
    </main>
  );
}
```

- [ ] **Step 4: Create the client form at `src/app/accept-invite/AcceptInviteFormClient.tsx`**

```tsx
'use client';

import { useActionState } from 'react';
import { acceptInviteAction, type AcceptState } from './actions';

export function AcceptInviteFormClient({
  token,
  email,
  intendedOrgName,
}: {
  token: string;
  email: string;
  intendedOrgName: string;
}) {
  const [state, action, pending] = useActionState<AcceptState, FormData>(acceptInviteAction, null);

  return (
    <>
      {state?.error && <div className="auth-error">{state.error}</div>}

      <form action={action} className="auth-form">
        <input type="hidden" name="token" value={token} />

        <div className="auth-field">
          <label className="auth-label" htmlFor="email-display">Email</label>
          <input
            className="auth-input"
            id="email-display"
            type="email"
            value={email}
            disabled
            readOnly
            style={{ opacity: 0.6 }}
          />
        </div>

        <div className="auth-field">
          <label className="auth-label" htmlFor="name">Your name</label>
          <input className="auth-input" id="name" name="name" type="text" autoComplete="name" required />
        </div>

        <div className="auth-field">
          <label className="auth-label" htmlFor="orgName">Org name</label>
          <input
            className="auth-input"
            id="orgName"
            name="orgName"
            type="text"
            defaultValue={intendedOrgName}
            required
          />
        </div>

        <div className="auth-field">
          <label className="auth-label" htmlFor="password">Password</label>
          <input
            className="auth-input"
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
          />
        </div>

        <button className="auth-button" type="submit" disabled={pending}>
          {pending ? 'Creating account…' : 'Create account'}
        </button>
      </form>
    </>
  );
}
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add src/app/accept-invite
git commit -m "feat(invites): add /accept-invite page with org+site auto-creation"
```

---

### Task 14: Gate /signup behind ALLOW_OPEN_SIGNUP env var (suprero-app)

**Working directory:** `/Users/anish/Desktop/work/zeeahmed/tradingview/suprero-app`

**Files:**
- Modify: `src/app/signup/page.tsx`
- Modify: `src/app/signup/actions.ts`

- [ ] **Step 1: Update `src/app/signup/actions.ts`**

Read the existing file. The current action is:

```ts
'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';

export type SignupState = { error?: string } | null;

export async function signupAction(
  _prev: SignupState,
  formData: FormData
): Promise<SignupState> {
  // ... existing implementation ...
```

Replace the entire file with:

```ts
'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { env } from '@/lib/env';

export type SignupState = { error?: string } | null;

export async function signupAction(
  _prev: SignupState,
  formData: FormData
): Promise<SignupState> {
  if (!env().ALLOW_OPEN_SIGNUP) {
    return { error: 'Open signup is disabled. Use your invite link or contact your administrator.' };
  }

  const name = String(formData.get('name') ?? '').trim();
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const password = String(formData.get('password') ?? '');

  if (!name || !email || !password) {
    return { error: 'Name, email, and password are all required.' };
  }
  if (password.length < 8) {
    return { error: 'Password must be at least 8 characters.' };
  }

  try {
    await auth.api.signUpEmail({
      body: { email, password, name },
      headers: await headers(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Signup failed.';
    if (msg.toLowerCase().includes('already exists') || msg.toLowerCase().includes('user_already_exists')) {
      return { error: 'An account with that email already exists. Try signing in.' };
    }
    return { error: 'Signup failed. Try again.' };
  }

  redirect('/profile');
}
```

- [ ] **Step 2: Update `src/app/signup/page.tsx`**

Read the existing file. Replace it with:

```tsx
import { env } from '@/lib/env';
import Link from 'next/link';
import { SignupFormClient } from './SignupFormClient';
import '../login/login.css';

export default function SignupPage() {
  if (!env().ALLOW_OPEN_SIGNUP) {
    return (
      <main className="auth-shell">
        <div className="auth-card">
          <img src="/logo.webp" alt="Suprero" className="auth-logo" />
          <div>
            <div className="auth-title">Invite required</div>
            <div className="auth-sub">Suprero is currently invite-only. Use your invite link, or contact your administrator.</div>
          </div>
          <div className="auth-link-row">
            Already have an account? <Link href="/login">Sign in</Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="auth-shell">
      <div className="auth-card">
        <img src="/logo.webp" alt="Suprero" className="auth-logo" />
        <div>
          <div className="auth-title">Create your account</div>
          <div className="auth-sub">Get started with Suprero in under a minute.</div>
        </div>
        <SignupFormClient />
      </div>
    </main>
  );
}
```

- [ ] **Step 3: Move the existing client form into a client component file at `src/app/signup/SignupFormClient.tsx`**

Read the previous content of `src/app/signup/page.tsx` from your shell history (or `git show HEAD:src/app/signup/page.tsx` if it's been committed) — copy the form portion into a new client component.

Or just write this new file:

```tsx
'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { signupAction, type SignupState } from './actions';

export function SignupFormClient() {
  const [state, action, pending] = useActionState<SignupState, FormData>(signupAction, null);

  return (
    <>
      {state?.error && <div className="auth-error">{state.error}</div>}

      <form action={action} className="auth-form">
        <div className="auth-field">
          <label className="auth-label" htmlFor="name">Name</label>
          <input className="auth-input" id="name" name="name" type="text" autoComplete="name" required />
        </div>
        <div className="auth-field">
          <label className="auth-label" htmlFor="email">Email</label>
          <input className="auth-input" id="email" name="email" type="email" autoComplete="email" required />
        </div>
        <div className="auth-field">
          <label className="auth-label" htmlFor="password">Password</label>
          <input className="auth-input" id="password" name="password" type="password" autoComplete="new-password" minLength={8} required />
        </div>
        <button className="auth-button" type="submit" disabled={pending}>
          {pending ? 'Creating account…' : 'Create account'}
        </button>
      </form>

      <div className="auth-link-row">
        Already have an account? <Link href="/login">Sign in</Link>
      </div>
    </>
  );
}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add src/app/signup
git commit -m "feat(signup): gate open signup behind ALLOW_OPEN_SIGNUP env var"
```

---

### Task 15: Seed __suprero_staff__ org locally + invite yourself as staff (suprero-app)

**Working directory:** `/Users/anish/Desktop/work/zeeahmed/tradingview/suprero-app`

**Files:**
- None modified (one-time SQL seed)

For your local dev environment, you need to be a staff user before you can use `/staff/invites`. Run a one-time SQL seed.

- [ ] **Step 1: Sign up as your own user (open signup is enabled in dev)**

```bash
PORT=3000 nohup npm run dev > /tmp/staff-seed.log 2>&1 &
DEV_PID=$!
for i in $(seq 1 30); do curl -fsS -o /dev/null http://localhost:3000/login 2>/dev/null && break; sleep 1; done
```

In your browser, go to http://localhost:3000/signup and create a user with your real email + a memorable password.

- [ ] **Step 2: Look up your user ID**

```bash
DEV_DB_URL="$(grep -E '^DATABASE_URL=' /Users/anish/Desktop/work/zeeahmed/tradingview/content-pipeline/.env | cut -d= -f2- | tr -d '"')"
psql "$DEV_DB_URL" -c "SELECT id, email FROM \"user\" ORDER BY created_at DESC LIMIT 5;"
```

Note your user's `id`.

- [ ] **Step 3: Seed the `__suprero_staff__` org and add yourself as a member**

Replace `<USER_ID>` with the id from step 2:

```bash
psql "$DEV_DB_URL" <<EOF
DO \$\$
DECLARE
  v_org_id text := gen_random_uuid()::text;
  v_member_id text := gen_random_uuid()::text;
BEGIN
  INSERT INTO organization (id, name, slug, metadata, created_at)
  VALUES (v_org_id, 'Suprero Staff', '__suprero_staff__', '{"isStaff":true}'::jsonb, now())
  ON CONFLICT (slug) DO NOTHING
  RETURNING id INTO v_org_id;

  IF v_org_id IS NULL THEN
    SELECT id INTO v_org_id FROM organization WHERE slug = '__suprero_staff__';
  END IF;

  INSERT INTO member (id, organization_id, user_id, role, created_at)
  VALUES (v_member_id, v_org_id, '<USER_ID>', 'owner', now())
  ON CONFLICT DO NOTHING;
END
\$\$;
EOF
```

- [ ] **Step 4: Verify**

```bash
psql "$DEV_DB_URL" -c "
SELECT u.email, o.slug, m.role
FROM member m
JOIN \"user\" u ON u.id = m.user_id
JOIN organization o ON o.id = m.organization_id
WHERE o.slug = '__suprero_staff__';
"
```

Expected: 1 row showing your email, `__suprero_staff__`, role `owner`.

- [ ] **Step 5: Stop the dev server**

```bash
kill $DEV_PID
wait $DEV_PID 2>/dev/null
rm -f /tmp/staff-seed.log
```

(Use only the specific PID — never `pkill -f next`.)

No commits in Task 15 (one-time local seed).

---

### Task 16: End-to-end smoke test (suprero-app)

**Working directory:** `/Users/anish/Desktop/work/zeeahmed/tradingview/suprero-app`

**Files:**
- None modified

This task exercises the complete invite flow against your local dev server.

- [ ] **Step 1: Start the dev server**

```bash
cd /Users/anish/Desktop/work/zeeahmed/tradingview/suprero-app
PORT=3000 nohup npm run dev > /tmp/p3-e2e.log 2>&1 &
DEV_PID=$!
for i in $(seq 1 60); do curl -fsS -o /dev/null http://localhost:3000/login 2>/dev/null && break; sleep 1; done
echo "ready"
```

- [ ] **Step 2: Sign in as your staff user via browser**

Open http://localhost:3000/login. Sign in with the staff user from Task 15. Verify you land on `/profile`.

- [ ] **Step 3: Visit /staff/invites**

http://localhost:3000/staff/invites — expected: page renders with empty list and a form.

- [ ] **Step 4: Create an invite**

Use a real email you can check (your own + a `+test1` alias works: e.g. `you+suprero1@yourdomain.com`). Give an org name like "Test Acme". Submit.

Expected: green success message "Invite sent to ...". The page should refresh showing 1 row in the pending list.

Check the recipient inbox for the invite email. Note the URL in the email.

- [ ] **Step 5: Sign out, then accept the invite**

Sign out. Open the URL from the email (or extract the token from the DB):

```bash
DEV_DB_URL="$(grep -E '^DATABASE_URL=' /Users/anish/Desktop/work/zeeahmed/tradingview/content-pipeline/.env | cut -d= -f2- | tr -d '"')"
psql "$DEV_DB_URL" -c "SELECT email, token, intended_org_name FROM customer_invite WHERE status='pending' ORDER BY created_at DESC LIMIT 1;"
```

Copy the token. Open http://localhost:3000/accept-invite?token=<token> in a browser (incognito or after signing out).

Expected: the accept-invite page renders with the email pre-filled and the org name pre-filled.

- [ ] **Step 6: Submit the form**

Fill in your name, leave the org name as suggested, set a password. Submit.

Expected: redirected to `/profile`. The profile shows the new user.

- [ ] **Step 7: Verify the org and site were created**

```bash
psql "$DEV_DB_URL" -c "
SELECT o.name AS org, o.slug AS org_slug, s.name AS site, s.slug AS site_slug, m.role
FROM \"user\" u
JOIN member m ON m.user_id = u.id
JOIN organization o ON o.id = m.organization_id
JOIN site s ON s.organization_id = o.id
WHERE u.email = '<the test invitee email>';
"
```

Expected: 1 row showing the org name, a slugified org slug, site name `<orgname> Blog`, site slug `blog`, role `owner`.

- [ ] **Step 8: Verify invite is marked accepted**

```bash
psql "$DEV_DB_URL" -c "SELECT email, status, accepted_at FROM customer_invite WHERE email = '<the test invitee email>';"
```

Expected: 1 row with status='accepted', accepted_at populated.

- [ ] **Step 9: Verify open signup gate works**

Sign out. Edit `.env.local`: change `ALLOW_OPEN_SIGNUP=true` to `ALLOW_OPEN_SIGNUP=false`.

```bash
kill $DEV_PID; wait $DEV_PID 2>/dev/null
PORT=3000 nohup npm run dev > /tmp/p3-e2e.log 2>&1 &
DEV_PID=$!
for i in $(seq 1 30); do curl -fsS -o /dev/null http://localhost:3000/login 2>/dev/null && break; sleep 1; done
```

Visit http://localhost:3000/signup. Expected: "Invite required" message instead of the form.

Restore `ALLOW_OPEN_SIGNUP=true` and restart server when done.

- [ ] **Step 10: Verify staff guard rejects non-staff users**

Sign in as the test invitee (the user you just created via accept-invite). They are NOT a staff member.

Visit http://localhost:3000/staff/invites. Expected: redirected to `/profile` (or to `/login` if the cookie was cleared).

- [ ] **Step 11: Stop dev server**

```bash
kill $DEV_PID
wait $DEV_PID 2>/dev/null
rm -f /tmp/p3-e2e.log
```

- [ ] **Step 12: Cleanup test data**

```bash
psql "$DEV_DB_URL" -c "
DELETE FROM \"user\" WHERE email IN ('<test invitee email>');
DELETE FROM customer_invite WHERE email IN ('<test invitee email>');
"
```

(Cascades will remove member, session, organization where applicable.)

No commits in Task 16.

---

### Task 17: Push suprero-app + summary (suprero-app)

**Working directory:** `/Users/anish/Desktop/work/zeeahmed/tradingview/suprero-app`

**Files:**
- None modified

- [ ] **Step 1: Push**

```bash
git status -sb
git log --oneline main..HEAD 2>/dev/null || git log --oneline -15
git push origin main
```

Expected: push succeeds. `git status -sb` shows clean.

- [ ] **Step 2: Summary**

Print a final summary of what changed:

```bash
echo "=== Plan 3 commits in suprero-app ==="
git log --oneline -15

echo ""
echo "=== Plan 3 commits in content-pipeline ==="
cd /Users/anish/Desktop/work/zeeahmed/tradingview/content-pipeline
git log --oneline -10
```

---

## Self-review

| Spec section requirement | Implemented in |
|---|---|
| customer_invite table | Tasks 1, 2, 3 |
| Phase 1-style additive migration safety | Tasks 4, 5 |
| Resend integration | Tasks 6, 7 |
| Invite email template | Task 8 |
| Invite domain helpers | Task 9 |
| Staff guard (org slug `__suprero_staff__`) | Tasks 10, 12 |
| /staff/invites operator UI | Task 11 |
| /accept-invite recipient flow | Task 13 |
| Org + site auto-creation on accept | Task 13 |
| Open signup gated by env var | Task 14 |
| End-to-end smoke test | Task 16 |
| Push suprero-app | Task 17 |

| Spec sections **NOT** in this plan | Lives in |
|---|---|
| Magic-link auth | Plan 4 (small follow-up) |
| Email verification gate | Plan 4 |
| Password reset flow | Plan 4 |
| Profile editing (change name/password) | Plan 4 |
| Team invitations within an existing org (Better Auth orgs plugin invite flow) | Plan 6 (with Team page) |
| Phase 2/3 migration (seed XG tenant, backfill site_id) | Plan 5 |
| Phase 4 migration (NOT NULL + FK + index swap + pipeline siteId code) | Plan 6 |
| Operator dashboard pages (Content Queue etc.) | Plan 7 |
| Internal staff dashboard pages (Admin Overview etc.) | Plan 8 |
| Production deploy of suprero-app | Plan 9 |

## Completion criteria

Plan 3 is done when:
1. All 17 tasks have all checkboxes checked.
2. `content-pipeline` migration 0004 is deployed to prod.
3. `suprero-app/main` includes all 11+ task commits and is pushed to GitHub.
4. End-to-end test (Task 16) passes: staff user creates invite → real email sent → invitee accepts → org and site auto-created → invitee lands on /profile authenticated.
5. `npm run dev` (in suprero-app) keeps working with `ALLOW_OPEN_SIGNUP=true` for dogfooding.
6. No regression to xerogravity.com (same smoke test as Plan 1 Task 11 step 8).

After Plan 3 ships, you have invite-only Suprero accounts working end-to-end. Plan 4 (small) can add magic-link / password-reset / profile editing. Plan 5 (larger) is the Phase 2/3/4 migration to make the pipeline tenant-aware.
