# Suprero v0 — Plan 2: suprero-app Skeleton + Better Auth Core

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the Suprero customer-facing Next.js app with working email+password authentication. By the end of this plan, an operator can `pnpm dev` (or `npm run dev`), open `http://localhost:3000/signup`, register an account, log in, see a Profile page, and sign out — using the auth tables that Plan 1 created.

**Architecture:** New Next.js 15 app at `tradingview/suprero-app/` (own git repo, follows the project pattern of separate repos per app). Reads/writes Postgres directly via Drizzle. The Drizzle schema is **shared via TypeScript path alias** to `content-pipeline/src/db/schema.ts` (single source of truth, no workspace tooling). Better Auth (organizations plugin enabled but not exercised yet) handles auth. Open signup during this plan; Plan 3 locks it to invite-only.

**Tech Stack:** Next.js 15 (App Router, Server Components, Server Actions), TypeScript 5, Drizzle ORM 0.45+, Better Auth ^1.x with organizations plugin, postgres-js driver, zod for env validation. No CSS framework — hand-rolled CSS using the design system tokens from `Suprero Design System/colors_and_type.css`.

**Spec:** [`docs/superpowers/specs/2026-05-08-suprero-v0-design.md`](../specs/2026-05-08-suprero-v0-design.md)

**Why this plan defers email + invite + org auto-creation:** Those land in Plan 3. Plan 2 ships the skeleton: a working Next.js app with Better Auth wiring and a minimal UI. Open email+password signup during dev so we can manually create users. Plan 3 turns invite-only on, adds Resend, and auto-creates org+site on first signup.

**Why path alias instead of npm workspaces (deviation from spec):** The spec called for `pnpm-workspace.yaml` + `packages/db-schema/`. Adopting that now would force a content-pipeline prod-deploy structure change with no immediate benefit. A TS path alias gives us the same outcome — single source of schema truth — without touching content-pipeline's deploy. Confirmed with the user.

---

## Pre-conditions

Before starting Task 1, the following must be true:

- Plan 1 has been deployed to prod and is stable. The auth tables (`user`, `session`, `account`, `verification`, `organization`, `member`, `invitation`, `site`, `api_call_log`) and the nullable `site_id` column on the 5 pipeline tables exist in the local dev DB and prod DB.
- `content-pipeline` is on branch `main` or `feat/multi-tenant-phase-1` (does not matter — the schema additions are present in both).
- Local Postgres is running with the migration applied. You should be able to run `psql "$DATABASE_URL" -c "SELECT 1 FROM \"user\" LIMIT 1;"` and get a "0 rows" result without error.
- Node 20+ and npm installed.
- `tradingview/suprero-app/` does **not** exist yet.

---

## File Structure

Files this plan creates (all under `tradingview/suprero-app/` unless otherwise noted):

| Path | Action | Responsibility |
|---|---|---|
| `suprero-app/` | Create | New Next.js 15 project root, own git repo |
| `suprero-app/.gitignore` | Create | Standard Next.js + .env exclusions |
| `suprero-app/package.json` | Create | Dependencies + scripts |
| `suprero-app/tsconfig.json` | Create | TS config + path alias `@suprero/db-schema` |
| `suprero-app/next.config.mjs` | Create | Webpack alias mirroring tsconfig path alias |
| `suprero-app/.env.local.example` | Create | Template env file (DATABASE_URL, BETTER_AUTH_SECRET, APP_URL, NEXT_PUBLIC_APP_URL) |
| `suprero-app/src/lib/env.ts` | Create | Zod-validated env loader |
| `suprero-app/src/lib/db.ts` | Create | Singleton Drizzle client |
| `suprero-app/src/lib/auth.ts` | Create | Better Auth server config |
| `suprero-app/src/lib/auth-client.ts` | Create | Better Auth React client |
| `suprero-app/src/app/api/auth/[...all]/route.ts` | Create | Better Auth handler mount |
| `suprero-app/src/app/globals.css` | Create | Tokens copied from Suprero Design System (colors_and_type.css minus @font-face) |
| `suprero-app/src/app/layout.tsx` | Create | Root layout with theme attribute |
| `suprero-app/src/app/page.tsx` | Create | Home page — redirects to /profile if signed in, else /login |
| `suprero-app/src/app/login/page.tsx` | Create | Login form |
| `suprero-app/src/app/login/actions.ts` | Create | Login server action |
| `suprero-app/src/app/login/login.css` | Create | Login form styles |
| `suprero-app/src/app/signup/page.tsx` | Create | Signup form (open during dev) |
| `suprero-app/src/app/signup/actions.ts` | Create | Signup server action |
| `suprero-app/src/app/profile/page.tsx` | Create | Profile view + sign-out button |
| `suprero-app/src/app/profile/actions.ts` | Create | Sign-out server action |
| `suprero-app/src/middleware.ts` | Create | Redirects unauthenticated users from `/profile` to `/login` |
| `suprero-app/README.md` | Create | Quick-start instructions |
| `Suprero Design System/fonts/GoogleSansCode-*.ttf` | Copy from | Fonts go to `suprero-app/public/fonts/` |
| `Suprero Design System/assets/logo.webp` | Copy from | Logo goes to `suprero-app/public/logo.webp` |

No changes to `content-pipeline/`. No changes to `frontend/`. No changes to `backend/`.

---

## Tasks

### Task 1: Pre-flight + bootstrap suprero-app

**Files:**
- Create: `tradingview/suprero-app/` (Next.js scaffold)
- Create: `tradingview/suprero-app/.git/`

- [ ] **Step 1: Verify Plan 1 prod state**

```bash
cd /Users/anish/Desktop/work/zeeahmed/tradingview/content-pipeline
git log --oneline -3
psql "$(grep -E '^DATABASE_URL=' .env | cut -d= -f2- | tr -d '"')" -c "\dt user;" -c "\dt site;" -c "\dt organization;"
```

Expected: Recent commits include the Plan 1 schema changes. The 3 `\dt` commands list each table in the public schema. If any of these tables don't exist in your local DB, stop and re-run `npm run db:migrate` from `content-pipeline/` first.

- [ ] **Step 2: Confirm `tradingview/suprero-app/` does not exist**

```bash
cd /Users/anish/Desktop/work/zeeahmed/tradingview
ls suprero-app 2>&1 | head -2
```

Expected: `ls: suprero-app: No such file or directory`. If it exists, stop and report BLOCKED — this plan creates it from scratch.

- [ ] **Step 3: Bootstrap Next.js 15 app**

```bash
cd /Users/anish/Desktop/work/zeeahmed/tradingview
npx create-next-app@latest suprero-app \
  --typescript \
  --eslint \
  --app \
  --src-dir \
  --no-tailwind \
  --no-turbopack \
  --import-alias "@/*" \
  --use-npm
```

Expected: a new directory `suprero-app/` is created with Next.js 15 default scaffold. The flags ensure: TypeScript, ESLint, App Router, `src/` directory, no Tailwind, no Turbopack (stick with webpack for predictable behavior), `@/*` import alias, npm.

- [ ] **Step 4: Initialize git in suprero-app and capture the bootstrap as initial commit**

`create-next-app` may have already initialized git. Verify and adjust:

```bash
cd suprero-app
git status
```

If git was already initialized: skip `git init`. If not: `git init`.

Either way, ensure the .git dir exists:

```bash
ls -la .git/HEAD
```

Expected: `.git/HEAD` exists. If `create-next-app` made an initial commit already, run `git log --oneline` to see it. Otherwise, make one:

```bash
git add .
git commit -m "chore: bootstrap Next.js 15 app via create-next-app"
```

- [ ] **Step 5: Verify the bootstrap dev server boots**

```bash
PORT=3000 npm run dev > /tmp/suprero-bootstrap.log 2>&1 &
DEV_PID=$!

# Wait up to 30s for ready
for i in $(seq 1 30); do
  if curl -fs http://localhost:3000/ > /tmp/suprero-bootstrap.html 2>/dev/null; then
    echo "Server ready after ${i}s"
    break
  fi
  sleep 1
done

# Confirm response
head -c 200 /tmp/suprero-bootstrap.html
echo ""

# Stop the server
kill $DEV_PID 2>/dev/null
wait $DEV_PID 2>/dev/null
rm /tmp/suprero-bootstrap.log /tmp/suprero-bootstrap.html
```

Expected: HTML response containing "Welcome to Next.js" or similar. If the server doesn't come up, check the log.

**IMPORTANT:** If the dev server hangs, do NOT use `pkill -f next` or `pkill -f node` — there are multiple Node processes on this system. Use only the specific PID.

---

### Task 2: Configure shared schema via path alias

**Files:**
- Modify: `suprero-app/tsconfig.json`
- Create: `suprero-app/next.config.mjs` (overwrites the auto-generated `.ts` or `.mjs` if present)

- [ ] **Step 1: Read the existing `tsconfig.json`**

```bash
cd /Users/anish/Desktop/work/zeeahmed/tradingview/suprero-app
cat tsconfig.json
```

Note its current `paths` block (typically `"@/*": ["./src/*"]`).

- [ ] **Step 2: Add `@suprero/db-schema` path alias**

Use the Edit tool to modify `tsconfig.json`. Find the existing `paths` block:

```json
    "paths": {
      "@/*": ["./src/*"]
    }
```

Replace with:

```json
    "paths": {
      "@/*": ["./src/*"],
      "@suprero/db-schema": ["../content-pipeline/src/db/schema.ts"]
    }
```

The relative path `../content-pipeline/src/db/schema.ts` is resolved relative to the project root (where `tsconfig.json` lives).

- [ ] **Step 3: Replace `next.config.mjs` (or create if missing)**

`create-next-app` may have generated a `next.config.ts` or `next.config.mjs`. Whichever it made, replace its entire contents with this `.mjs` version. (If a `.ts` was generated, delete it first: `rm next.config.ts`.)

```bash
ls next.config.* 2>/dev/null
```

Then create `suprero-app/next.config.mjs` with these exact contents:

```js
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      '@suprero/db-schema': path.resolve(
        __dirname,
        '../content-pipeline/src/db/schema.ts'
      ),
    };
    return config;
  },
};

export default nextConfig;
```

- [ ] **Step 4: Smoke test the path alias by importing in a temp file**

Create `src/app/_alias-smoke-test.tsx` (Next.js ignores files starting with `_`):

```tsx
import { user, articles, site } from '@suprero/db-schema';

console.log(user, articles, site);
export {};
```

```bash
npx tsc --noEmit
```

Expected: exits 0 with no errors. If TS reports "Cannot find module '@suprero/db-schema'", verify your `tsconfig.json` paths block matches exactly.

- [ ] **Step 5: Remove the smoke test file**

```bash
rm src/app/_alias-smoke-test.tsx
```

- [ ] **Step 6: Commit**

```bash
git add tsconfig.json next.config.mjs
# Also remove the auto-generated config file if it was a .ts
[ -f next.config.ts ] && git rm -f next.config.ts || true
git commit -m "chore: add @suprero/db-schema path alias to content-pipeline schema"
```

---

### Task 3: Set up env validation and Drizzle client

**Files:**
- Create: `suprero-app/.env.local.example`
- Modify: `suprero-app/.gitignore` (ensure `.env*.local` is ignored)
- Create: `suprero-app/src/lib/env.ts`
- Create: `suprero-app/src/lib/db.ts`

- [ ] **Step 1: Install Drizzle dependencies**

```bash
cd /Users/anish/Desktop/work/zeeahmed/tradingview/suprero-app
npm install drizzle-orm@^0.45 postgres@^3.4 zod@^3
```

Expected: package.json updated, no errors.

- [ ] **Step 2: Create `.env.local.example`**

```bash
cat > .env.local.example <<'EOF'
# Suprero app local env
# Copy this file to .env.local and fill in real values.

# Database — must be the same Postgres + database that content-pipeline uses
# (so Better Auth tables and pipeline tables share the same DB)
DATABASE_URL=postgresql://user:pass@localhost:5432/content_pipeline

# Better Auth — generate with: openssl rand -base64 32
BETTER_AUTH_SECRET=replace-with-32-byte-base64-string

# Public URL of this app (used by Better Auth for trustedOrigins and the client)
APP_URL=http://localhost:3000
NEXT_PUBLIC_APP_URL=http://localhost:3000
EOF
```

- [ ] **Step 3: Verify `.gitignore` excludes env files**

Read `.gitignore` and look for a line matching `.env*.local` or `.env.local`. The Next.js default usually has this. If it does NOT, append:

```
# Local environment overrides
.env*.local
```

Verify with:

```bash
touch .env.local.tmp
git check-ignore .env.local.tmp
rm .env.local.tmp
```

Expected: `git check-ignore` prints `.env.local.tmp` (means ignored) and exits 0. If exit 1, add the rule.

- [ ] **Step 4: Create `src/lib/env.ts`**

```ts
import { z } from 'zod';

const schema = z.object({
  DATABASE_URL: z.string().url(),
  BETTER_AUTH_SECRET: z.string().min(32, 'BETTER_AUTH_SECRET must be at least 32 chars'),
  APP_URL: z.string().url(),
  NEXT_PUBLIC_APP_URL: z.string().url(),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Environment validation failed:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}
```

- [ ] **Step 5: Create `src/lib/db.ts`**

```ts
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '@suprero/db-schema';
import { env } from './env';

let client: ReturnType<typeof postgres> | null = null;
let dbInstance: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function db() {
  if (!dbInstance) {
    client = postgres(env().DATABASE_URL, { max: 5 });
    dbInstance = drizzle(client, { schema });
  }
  return dbInstance;
}

export async function closeDb(): Promise<void> {
  if (client) await client.end();
  client = null;
  dbInstance = null;
}

export { schema };
```

Note: `max: 5` (not 10) because suprero-app is a separate process from content-pipeline; both share the Postgres pool. Be polite.

- [ ] **Step 6: Create your local `.env.local` from the example**

```bash
cp .env.local.example .env.local
```

Now edit `.env.local`:

```bash
# Generate a random secret
SECRET=$(openssl rand -base64 32)
echo "Generated BETTER_AUTH_SECRET: $SECRET"
```

Edit `.env.local` and:
- Replace the `DATABASE_URL` with the same value from `content-pipeline/.env` (so both apps point at the same local Postgres database)
- Replace `BETTER_AUTH_SECRET` with the generated `$SECRET` value
- Leave `APP_URL` and `NEXT_PUBLIC_APP_URL` as `http://localhost:3000`

Verify the file is gitignored:

```bash
git check-ignore .env.local
```

Expected: prints `.env.local`, exit 0.

- [ ] **Step 7: Smoke test the DB connection**

Create a temporary file `src/lib/_db-smoke.ts`:

```ts
import { db, closeDb, schema } from './db';
import { sql } from 'drizzle-orm';

async function main() {
  const result = await db().execute<{ count: number }>(
    sql`select count(*)::int as count from ${schema.user}`
  );
  console.log('user table count:', result[0]?.count ?? '(no rows returned)');
  await closeDb();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

Run it:

```bash
npx tsx src/lib/_db-smoke.ts
```

Expected: prints `user table count: 0` (or whatever the row count is). If it errors with "relation 'user' does not exist", your local DB doesn't have Plan 1's migration applied — go fix that in `content-pipeline/`.

If it errors with "Environment validation failed", check `.env.local`.

If you don't have `tsx` globally, install it:
```bash
npm install --save-dev tsx
npx tsx src/lib/_db-smoke.ts
```

- [ ] **Step 8: Remove the smoke test**

```bash
rm src/lib/_db-smoke.ts
```

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json .env.local.example .gitignore src/lib/env.ts src/lib/db.ts
git commit -m "feat(db): add env validation and drizzle client wired to shared schema"
```

---

### Task 4: Install and configure Better Auth

**Files:**
- Modify: `suprero-app/package.json` (adds better-auth)
- Create: `suprero-app/src/lib/auth.ts`
- Create: `suprero-app/src/lib/auth-client.ts`
- Create: `suprero-app/src/app/api/auth/[...all]/route.ts`

- [ ] **Step 1: Install Better Auth**

```bash
cd /Users/anish/Desktop/work/zeeahmed/tradingview/suprero-app
npm install better-auth@^1
```

Expected: package.json gains `"better-auth": "^1.x.x"`.

- [ ] **Step 2: Create the Better Auth server config at `src/lib/auth.ts`**

```ts
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { organization } from 'better-auth/plugins';
import { db, schema } from './db';
import { env } from './env';

export const auth = betterAuth({
  database: drizzleAdapter(db(), {
    provider: 'pg',
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
      organization: schema.organization,
      member: schema.member,
      invitation: schema.invitation,
    },
  }),
  secret: env().BETTER_AUTH_SECRET,
  baseURL: env().APP_URL,
  trustedOrigins: [env().APP_URL],
  emailAndPassword: {
    enabled: true,
    // Plan 2 leaves verification off so we can test signup locally without Resend.
    // Plan 3 turns this on with Resend wired up.
    requireEmailVerification: false,
    minPasswordLength: 8,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 days
    updateAge: 60 * 60 * 24, // refresh once per day
  },
  plugins: [organization()],
});

export type AuthSession = typeof auth.$Infer.Session;
```

- [ ] **Step 3: Create the Better Auth React client at `src/lib/auth-client.ts`**

```ts
import { createAuthClient } from 'better-auth/react';
import { organizationClient } from 'better-auth/client/plugins';

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_APP_URL!,
  plugins: [organizationClient()],
});

export const { signIn, signUp, signOut, useSession } = authClient;
```

- [ ] **Step 4: Create the catch-all auth route at `src/app/api/auth/[...all]/route.ts`**

```ts
import { auth } from '@/lib/auth';
import { toNextJsHandler } from 'better-auth/next-js';

export const { GET, POST } = toNextJsHandler(auth);
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: exits 0. If you get errors about `auth.$Infer.Session` not existing, your Better Auth version may have a slightly different API — fall back to `type AuthSession = Awaited<ReturnType<typeof auth.api.getSession>>` instead.

- [ ] **Step 6: Smoke test that the auth handler responds**

Start the dev server:

```bash
PORT=3000 npm run dev > /tmp/suprero-auth-test.log 2>&1 &
DEV_PID=$!

for i in $(seq 1 30); do
  curl -fs http://localhost:3000/api/auth/get-session > /tmp/suprero-session.json 2>/dev/null && break
  sleep 1
done

cat /tmp/suprero-session.json
echo ""

kill $DEV_PID 2>/dev/null
wait $DEV_PID 2>/dev/null
rm /tmp/suprero-auth-test.log /tmp/suprero-session.json
```

Expected: response is `null` or `{}` (no active session). The fact that it responds at all proves the auth route is wired.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json src/lib/auth.ts src/lib/auth-client.ts src/app/api/auth
git commit -m "feat(auth): configure better auth with drizzle adapter + organizations plugin"
```

---

### Task 5: Add design system tokens + root layout

**Files:**
- Create: `suprero-app/public/fonts/GoogleSansCode-*.ttf` (copied from design system)
- Create: `suprero-app/public/logo.webp` (copied from design system)
- Modify: `suprero-app/src/app/globals.css` (overwrite Next.js default with design tokens)
- Modify: `suprero-app/src/app/layout.tsx` (add theme attribute, font links, app metadata)
- Delete: `suprero-app/src/app/page.module.css` (Next.js default, unused)
- Modify: `suprero-app/src/app/page.tsx` (replace default with auth-redirect)

- [ ] **Step 1: Copy fonts and logo**

```bash
cd /Users/anish/Desktop/work/zeeahmed/tradingview/suprero-app

mkdir -p public/fonts
cp "/Users/anish/Desktop/work/zeeahmed/tradingview/Suprero Design System/fonts/"GoogleSansCode-{Light,Regular,Medium,SemiBold,Bold,ExtraBold}.ttf public/fonts/
cp "/Users/anish/Desktop/work/zeeahmed/tradingview/Suprero Design System/assets/logo.webp" public/logo.webp

ls public/fonts/ public/logo.webp
```

Expected: 6 font files and 1 logo file.

- [ ] **Step 2: Replace `src/app/globals.css` with design system tokens**

Read the existing file at `src/app/globals.css` to know what you're replacing. Then overwrite it entirely with this content:

```css
/*
 * Suprero design tokens — derived from
 * Suprero Design System/colors_and_type.css
 */

@font-face { font-family: 'Google Sans Code'; src: url('/fonts/GoogleSansCode-Light.ttf') format('truetype'); font-weight: 300; font-display: swap; }
@font-face { font-family: 'Google Sans Code'; src: url('/fonts/GoogleSansCode-Regular.ttf') format('truetype'); font-weight: 400; font-display: swap; }
@font-face { font-family: 'Google Sans Code'; src: url('/fonts/GoogleSansCode-Medium.ttf') format('truetype'); font-weight: 500; font-display: swap; }
@font-face { font-family: 'Google Sans Code'; src: url('/fonts/GoogleSansCode-SemiBold.ttf') format('truetype'); font-weight: 600; font-display: swap; }
@font-face { font-family: 'Google Sans Code'; src: url('/fonts/GoogleSansCode-Bold.ttf') format('truetype'); font-weight: 700; font-display: swap; }
@font-face { font-family: 'Google Sans Code'; src: url('/fonts/GoogleSansCode-ExtraBold.ttf') format('truetype'); font-weight: 800; font-display: swap; }

:root {
  --color-black: #000000;
  --color-white: #ffffff;
  --color-grey-100: #f5f5f5;
  --color-grey-200: #e8e8e8;
  --color-grey-300: #cccccc;
  --color-grey-400: #999999;
  --color-grey-500: #666666;
  --color-grey-600: #444444;
  --color-grey-700: #2a2a2a;
  --color-grey-800: #1a1a1a;
  --color-grey-900: #0d0d0d;

  --fg-primary: var(--color-black);
  --fg-secondary: var(--color-grey-500);
  --fg-muted: var(--color-grey-400);
  --fg-inverse: var(--color-white);

  --bg-base: var(--color-white);
  --bg-subtle: var(--color-grey-100);
  --bg-inset: var(--color-grey-200);
  --bg-inverse: var(--color-black);

  --border-default: var(--color-grey-200);
  --border-strong: var(--color-grey-300);

  --font-mono: 'Google Sans Code', ui-monospace, 'Cascadia Code', 'Fira Code', monospace;

  --radius-sm: 2px;
  --radius-md: 4px;
  --radius-pill: 9999px;

  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-6: 24px;
  --space-8: 32px;

  --duration-fast: 120ms;
  --duration-base: 200ms;
  --ease-default: cubic-bezier(0.2, 0, 0, 1);
}

[data-theme="dark"] {
  --fg-primary: var(--color-white);
  --fg-secondary: var(--color-grey-300);
  --fg-muted: var(--color-grey-500);
  --fg-inverse: var(--color-black);
  --bg-base: var(--color-grey-900);
  --bg-subtle: var(--color-grey-800);
  --bg-inset: var(--color-grey-700);
  --bg-inverse: var(--color-white);
  --border-default: var(--color-grey-700);
  --border-strong: var(--color-grey-600);
}

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

html, body { height: 100%; }

body {
  font-family: var(--font-mono);
  font-size: 14px;
  line-height: 1.5;
  color: var(--fg-primary);
  background: var(--bg-base);
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}

a {
  color: inherit;
  text-decoration: none;
}

button {
  font-family: inherit;
  font-size: inherit;
}

input, textarea, select {
  font-family: inherit;
  font-size: inherit;
  color: inherit;
}
```

- [ ] **Step 3: Replace `src/app/layout.tsx`**

```tsx
import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Suprero',
  description: 'Your content operation, fully on autopilot.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" data-theme="light">
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 4: Replace `src/app/page.tsx` with an auth-aware redirect**

```tsx
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';

export default async function HomePage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  if (session?.user) {
    redirect('/profile');
  }
  redirect('/login');
}
```

- [ ] **Step 5: Remove the unused Next.js default CSS module**

```bash
rm -f src/app/page.module.css
```

- [ ] **Step 6: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: exits 0.

- [ ] **Step 7: Commit**

```bash
git add public/fonts public/logo.webp src/app/globals.css src/app/layout.tsx src/app/page.tsx
git rm -f src/app/page.module.css
git commit -m "feat(ui): add design system tokens, fonts, logo, and root layout"
```

---

### Task 6: Build login page + server action

**Files:**
- Create: `suprero-app/src/app/login/page.tsx`
- Create: `suprero-app/src/app/login/actions.ts`
- Create: `suprero-app/src/app/login/login.css`

- [ ] **Step 1: Create the login server action at `src/app/login/actions.ts`**

```ts
'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';

export type LoginState = { error?: string } | null;

export async function loginAction(
  _prev: LoginState,
  formData: FormData
): Promise<LoginState> {
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const password = String(formData.get('password') ?? '');

  if (!email || !password) {
    return { error: 'Email and password are required.' };
  }

  try {
    await auth.api.signInEmail({
      body: { email, password },
      headers: await headers(),
      asResponse: false,
    });
  } catch (err) {
    return { error: 'Invalid email or password.' };
  }

  redirect('/profile');
}
```

- [ ] **Step 2: Create the login styles at `src/app/login/login.css`**

```css
.auth-shell {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-6);
  background: var(--bg-base);
}

.auth-card {
  width: 100%;
  max-width: 360px;
  padding: var(--space-8);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  background: var(--bg-base);
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
}

.auth-logo {
  display: block;
  height: 28px;
  width: auto;
  margin-bottom: var(--space-2);
}

.auth-title {
  font-size: 18px;
  font-weight: 600;
  letter-spacing: -0.02em;
  color: var(--fg-primary);
}

.auth-sub {
  font-size: 12px;
  color: var(--fg-muted);
  margin-top: -4px;
}

.auth-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.auth-field {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.auth-label {
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--fg-muted);
}

.auth-input {
  height: 36px;
  padding: 0 var(--space-3);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  background: var(--bg-base);
  color: var(--fg-primary);
  font-family: var(--font-mono);
  font-size: 13px;
  outline: none;
  transition: border-color var(--duration-fast) var(--ease-default);
}

.auth-input:focus {
  border-color: var(--border-strong);
}

.auth-button {
  height: 36px;
  padding: 0 var(--space-4);
  background: var(--fg-primary);
  color: var(--fg-inverse);
  border: none;
  border-radius: var(--radius-md);
  font-weight: 500;
  cursor: pointer;
  transition: background var(--duration-fast) var(--ease-default), transform 80ms var(--ease-default);
}

.auth-button:hover {
  background: var(--color-grey-700);
}

.auth-button:active {
  transform: scale(0.98);
}

.auth-error {
  font-size: 12px;
  color: #c0392b;
  padding: var(--space-2) var(--space-3);
  border: 1px solid #f5d4d0;
  border-radius: var(--radius-md);
  background: #fdf2f1;
}

.auth-link-row {
  font-size: 12px;
  color: var(--fg-muted);
  text-align: center;
}

.auth-link-row a {
  color: var(--fg-primary);
  text-decoration: underline;
}
```

- [ ] **Step 3: Create the login page at `src/app/login/page.tsx`**

```tsx
'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { loginAction, type LoginState } from './actions';
import './login.css';

export default function LoginPage() {
  const [state, action, pending] = useActionState<LoginState, FormData>(loginAction, null);

  return (
    <main className="auth-shell">
      <div className="auth-card">
        <img src="/logo.webp" alt="Suprero" className="auth-logo" />
        <div>
          <div className="auth-title">Sign in</div>
          <div className="auth-sub">Welcome back to Suprero.</div>
        </div>

        {state?.error && <div className="auth-error">{state.error}</div>}

        <form action={action} className="auth-form">
          <div className="auth-field">
            <label className="auth-label" htmlFor="email">Email</label>
            <input className="auth-input" id="email" name="email" type="email" autoComplete="email" required />
          </div>
          <div className="auth-field">
            <label className="auth-label" htmlFor="password">Password</label>
            <input className="auth-input" id="password" name="password" type="password" autoComplete="current-password" required />
          </div>
          <button className="auth-button" type="submit" disabled={pending}>
            {pending ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <div className="auth-link-row">
          New here? <Link href="/signup">Create an account</Link>
        </div>
      </div>
    </main>
  );
}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: exits 0.

- [ ] **Step 5: Commit**

```bash
git add src/app/login
git commit -m "feat(auth): add login page and server action"
```

---

### Task 7: Build signup page + server action (open during dev)

**Files:**
- Create: `suprero-app/src/app/signup/page.tsx`
- Create: `suprero-app/src/app/signup/actions.ts`

Reuses `src/app/login/login.css` styles via the same className convention.

- [ ] **Step 1: Create the signup server action at `src/app/signup/actions.ts`**

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
      asResponse: false,
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

- [ ] **Step 2: Create the signup page at `src/app/signup/page.tsx`**

```tsx
'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { signupAction, type SignupState } from './actions';
import '../login/login.css'; // reuse styles

export default function SignupPage() {
  const [state, action, pending] = useActionState<SignupState, FormData>(signupAction, null);

  return (
    <main className="auth-shell">
      <div className="auth-card">
        <img src="/logo.webp" alt="Suprero" className="auth-logo" />
        <div>
          <div className="auth-title">Create your account</div>
          <div className="auth-sub">Get started with Suprero in under a minute.</div>
        </div>

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
      </div>
    </main>
  );
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add src/app/signup
git commit -m "feat(auth): add open email+password signup page (locked down in plan 3)"
```

---

### Task 8: Build /profile page + sign-out action + middleware

**Files:**
- Create: `suprero-app/src/app/profile/page.tsx`
- Create: `suprero-app/src/app/profile/actions.ts`
- Create: `suprero-app/src/app/profile/profile.css`
- Create: `suprero-app/src/middleware.ts`

- [ ] **Step 1: Create the sign-out action at `src/app/profile/actions.ts`**

```ts
'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';

export async function signOutAction(): Promise<void> {
  await auth.api.signOut({
    headers: await headers(),
  });
  redirect('/login');
}
```

- [ ] **Step 2: Create the profile styles at `src/app/profile/profile.css`**

```css
.profile-shell {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-6);
}

.profile-card {
  width: 100%;
  max-width: 480px;
  padding: var(--space-8);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
}

.profile-header {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.profile-avatar {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: var(--fg-primary);
  color: var(--fg-inverse);
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  font-size: 14px;
  letter-spacing: 0.02em;
}

.profile-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.profile-name {
  font-size: 16px;
  font-weight: 600;
  color: var(--fg-primary);
}

.profile-email {
  font-size: 12px;
  color: var(--fg-muted);
}

.profile-section {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.profile-section-label {
  font-size: 10px;
  font-weight: 500;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--fg-muted);
}

.profile-row {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
  padding: var(--space-2) 0;
  border-bottom: 1px solid var(--border-default);
}

.profile-row:last-child {
  border-bottom: none;
}

.profile-row-key {
  color: var(--fg-muted);
}

.profile-row-value {
  color: var(--fg-primary);
}

.profile-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: var(--space-2);
}

.profile-signout {
  height: 32px;
  padding: 0 var(--space-4);
  background: transparent;
  color: var(--fg-secondary);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: border-color var(--duration-fast) var(--ease-default), color var(--duration-fast) var(--ease-default);
}

.profile-signout:hover {
  border-color: var(--border-strong);
  color: var(--fg-primary);
}
```

- [ ] **Step 3: Create the profile page at `src/app/profile/page.tsx`**

```tsx
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { signOutAction } from './actions';
import './profile.css';

export default async function ProfilePage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    redirect('/login');
  }

  const user = session.user;
  const initials = (user.name || user.email)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? '')
    .join('') || user.email[0]!.toUpperCase();

  return (
    <main className="profile-shell">
      <div className="profile-card">
        <div className="profile-header">
          <div className="profile-avatar">{initials}</div>
          <div className="profile-meta">
            <div className="profile-name">{user.name}</div>
            <div className="profile-email">{user.email}</div>
          </div>
        </div>

        <div className="profile-section">
          <div className="profile-section-label">Account</div>
          <div className="profile-row">
            <span className="profile-row-key">User ID</span>
            <span className="profile-row-value">{user.id}</span>
          </div>
          <div className="profile-row">
            <span className="profile-row-key">Email verified</span>
            <span className="profile-row-value">{user.emailVerified ? 'Yes' : 'No'}</span>
          </div>
          <div className="profile-row">
            <span className="profile-row-key">Created</span>
            <span className="profile-row-value">
              {new Date(user.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
            </span>
          </div>
        </div>

        <div className="profile-actions">
          <form action={signOutAction}>
            <button className="profile-signout" type="submit">Sign out</button>
          </form>
        </div>
      </div>
    </main>
  );
}
```

- [ ] **Step 4: Create the middleware at `src/middleware.ts`**

```ts
import { NextResponse, type NextRequest } from 'next/server';

const PROTECTED = ['/profile'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (!PROTECTED.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Better Auth session cookies are named "better-auth.session_token" by default
  // (and "better-auth.session_data" for cached session data).
  // We treat presence of the cookie as a hint to NOT redirect; the actual
  // server-side session validation happens in the page itself (see profile/page.tsx).
  // This keeps middleware fast and avoids a DB hit per request.
  const sessionCookie = request.cookies.get('better-auth.session_token')
    ?? request.cookies.get('__Secure-better-auth.session_token');

  if (!sessionCookie) {
    const loginUrl = new URL('/login', request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/profile/:path*'],
};
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: exits 0.

- [ ] **Step 6: Commit**

```bash
git add src/app/profile src/middleware.ts
git commit -m "feat(auth): add profile page, sign-out action, and route-protection middleware"
```

---

### Task 9: End-to-end manual smoke test

**Files:**
- None modified

This is a manual verification — you exercise the full happy path against your local dev server, then a few error paths, then confirm cleanup.

- [ ] **Step 1: Start the dev server**

```bash
cd /Users/anish/Desktop/work/zeeahmed/tradingview/suprero-app
npm run dev
```

Wait for "Ready in <ms>". Leave the server running for the rest of Task 9.

- [ ] **Step 2: In a browser, visit `http://localhost:3000/`**

Expected: redirected to `/login`. The login page renders with the Suprero logo, a "Sign in" title, two fields, a button, and a link to "Create an account".

- [ ] **Step 3: Click "Create an account" → fill the form**

Use a test email like `dev@suprero.test`, password `dev-password-123`, name `Dev User`. Submit.

Expected: redirected to `/profile`. The profile page shows the avatar with initials "DU", the name "Dev User", the email, the user ID, "Email verified: No" (because we have verification off), and a "Sign out" button.

If you see an error like `relation "user" does not exist` in the dev server log, your local DB doesn't have the migration. Stop and fix.

- [ ] **Step 4: Click "Sign out"**

Expected: redirected to `/login`.

- [ ] **Step 5: Sign in with the credentials from step 3**

Expected: redirected to `/profile`. Same data shown.

- [ ] **Step 6: While signed in, manually visit `http://localhost:3000/login`**

Expected: the login page renders (no automatic redirect to /profile in this plan; that's a small UX improvement we'll add in Plan 5 with org/site routing).

- [ ] **Step 7: Test bad-password error path**

Sign out. Visit `/login`. Submit with the right email but a wrong password.

Expected: page reloads with the red error box "Invalid email or password."

- [ ] **Step 8: Test middleware redirect**

Sign out. Manually visit `http://localhost:3000/profile`.

Expected: redirected to `/login` (because the session cookie is gone).

- [ ] **Step 9: Inspect the database for the new user**

In another terminal:

```bash
psql "$(grep -E '^DATABASE_URL=' /Users/anish/Desktop/work/zeeahmed/tradingview/content-pipeline/.env | cut -d= -f2- | tr -d '"')" -c "SELECT id, email, name, email_verified FROM \"user\" WHERE email='dev@suprero.test';"
```

Expected: 1 row matching the test signup.

- [ ] **Step 10: Stop the dev server**

Back in the terminal running `npm run dev`, press Ctrl-C. Confirm it exits cleanly.

- [ ] **Step 11: Cleanup the test user**

```bash
psql "$(grep -E '^DATABASE_URL=' /Users/anish/Desktop/work/zeeahmed/tradingview/content-pipeline/.env | cut -d= -f2- | tr -d '"')" -c "DELETE FROM \"user\" WHERE email='dev@suprero.test';"
```

Expected: `DELETE 1`. Cascade deletes any session/account rows for this user.

- [ ] **Step 12: Self-review**

```bash
cd /Users/anish/Desktop/work/zeeahmed/tradingview/suprero-app
git log --oneline -10
git status
```

Expected:
- 8 commits since the initial Next.js bootstrap (Task 1's bootstrap + 7 task commits)
- Working tree clean

---

### Task 10: Add README and push to GitHub

**Files:**
- Create: `suprero-app/README.md`
- Push to: a new GitHub repo for `suprero-app/`

- [ ] **Step 1: Write `README.md`**

```bash
cat > README.md <<'EOF'
# Suprero App

Customer-facing Next.js 15 app for Suprero — the AI content operations platform.

This app is the operator dashboard. It reads/writes Postgres directly via Drizzle, sharing the schema with `content-pipeline/` via TypeScript path alias.

## Prerequisites

- Node 20+
- A local Postgres database with the `content-pipeline` schema migrated (see `../content-pipeline/DEPLOY.md`)
- A clone of `../content-pipeline/` as a sibling directory (this app's `tsconfig.json` and `next.config.mjs` reference it via `../content-pipeline/src/db/schema.ts`)

## Getting started

```bash
cp .env.local.example .env.local
# Edit .env.local — set DATABASE_URL to match content-pipeline/.env, generate BETTER_AUTH_SECRET
npm install
npm run dev
```

Open http://localhost:3000 — you'll be redirected to `/login`.

To create your first account, click "Create an account" and fill the signup form. (Open signup is enabled in this plan; locked down to invite-only in Plan 3.)

## Stack

- Next.js 15 (App Router, Server Components, Server Actions)
- Better Auth ^1.x with the organizations plugin
- Drizzle ORM (schema shared with `content-pipeline/`)
- Postgres
- Hand-rolled CSS (no framework) using design tokens from `../Suprero Design System/`

## Plans

Implementation plans live in `../content-pipeline/docs/superpowers/plans/`. The Suprero v0 spec lives in `../content-pipeline/docs/superpowers/specs/2026-05-08-suprero-v0-design.md`.

## Deploy

Not yet — this app runs only locally during v0. Deployment is part of a future plan.
EOF
```

- [ ] **Step 2: Commit the README**

```bash
git add README.md
git commit -m "docs: initial readme for suprero-app"
```

- [ ] **Step 3: Create the GitHub repo (manual or via gh CLI)**

```bash
gh repo create Anish-Mukherjee/suprero-app --private --source=. --remote=origin --push
```

If `gh` isn't authenticated, run `gh auth login` first.

If you don't want a private repo or have a different naming convention, adjust the slug. The expected end state is: a GitHub repo containing this app, with `main` as the default branch, and `origin` set as the remote on local.

- [ ] **Step 4: Confirm the push**

```bash
git status -sb
git log --oneline -3
```

Expected: `## main...origin/main` with no `[ahead/behind]`. The latest commit is the README commit.

---

## Self-review

After all tasks complete:

| Spec section requirement | Implemented in |
|---|---|
| Suprero app at `tradingview/suprero-app/` (Next.js 15 + App Router + Server Components) | Task 1 |
| Drizzle schema shared between apps | Task 2 (path alias mechanism) |
| Drizzle client in suprero-app pointing at shared Postgres | Task 3 |
| Env validation (zod) | Task 3 |
| Better Auth with organizations plugin | Task 4 |
| Email + password signup (open during dev) | Task 7 |
| Login + sign-out | Tasks 6, 8 |
| Profile page | Task 8 |
| Middleware for route protection | Task 8 |
| Hand-rolled CSS using design system tokens | Task 5 |
| README + GitHub repo | Task 10 |

| Spec sections **NOT** in this plan | Lives in |
|---|---|
| Resend / email-sending | Plan 3 |
| Magic-link auth | Plan 3 |
| Email verification gate | Plan 3 |
| Invite-only signup (lockdown) | Plan 3 |
| Org auto-creation on signup | Plan 3 |
| Default site auto-creation | Plan 3 |
| Team invite UI (member invitations within an org) | Plan 3 |
| Profile editing (change name, change password) | Plan 3 |
| `/staff/invites` UI | Plan 3 |
| Operator dashboard pages (Content Queue, etc.) | Plan 5 |
| Internal staff pages | Plan 6 |
| Production deploy | Plan 7 |

## Completion criteria

Plan 2 is done when:
1. All 10 tasks have all checkboxes checked.
2. `tradingview/suprero-app/` exists with its own `.git/` and is pushed to GitHub.
3. `npm run dev` starts the app and you can sign up, log in, view `/profile`, and sign out — all backed by real rows in the `user`/`session` tables of the same Postgres your `content-pipeline` uses locally.
4. `npx tsc --noEmit` exits 0 in `suprero-app/`.
5. The README accurately describes the prerequisites and the getting-started flow.

After Plan 2 ships, Plan 3 (Resend + invite-only flow + org/site auto-creation) is the natural next step. Plan 4 (Phase 2/3 migration — seed XG tenant + backfill `site_id`) can be done in parallel with Plan 3 because the two don't share files.
