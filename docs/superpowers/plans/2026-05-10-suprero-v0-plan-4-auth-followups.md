# Suprero v0 — Plan 4: Auth Follow-ups (Email Verification, Password Reset, Magic Link, Profile Edit)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the auth surface so a real user can recover from forgotten passwords, prove ownership of new email signups, optionally sign in via magic link, and edit their profile (name + password). After this plan, the auth UX is feature-complete for v0 and ready for the dashboard surface to layer on top.

**Architecture:** Pure suprero-app work — no schema changes, no content-pipeline touches. Better Auth's built-in flows for `forgetPassword`, `resetPassword`, email verification, and the magicLink plugin all use the existing `verification` table that Plan 1 created. Three new HTML email templates (reuse the invite-email shape). Four new pages (`/forgot-password`, `/reset-password`, `/verify-email`, `/profile/edit`). One config change in `auth.ts` to enable the verification gate and wire the new senders.

**Tech Stack:** Next.js 16, Better Auth ^1.x with `magicLink` plugin (built into `better-auth/plugins`), Drizzle, Resend (already wired), zod (already wired). No new dependencies.

**Spec:** [`docs/superpowers/specs/2026-05-08-suprero-v0-design.md`](../specs/2026-05-08-suprero-v0-design.md)

**Decisions for this plan:**

- **Verification gate ON for /signup, OFF for /accept-invite.** New `/signup` users (open-signup mode) must verify email before they can log in. Invite-accepted users skip the gate because Plan 3's fix already sets `emailVerified=true` (the invite token *is* the verification). This means `requireEmailVerification: true` in `auth.ts`.
- **Magic link goes through `/login` as a secondary option, not a separate page.** A small "Email me a sign-in link instead" link below the password form. Clicking sends a magic-link email; the user is told to check their inbox. The link lands on `/api/auth/magic-link/verify?token=...` which is built-in.
- **Password reset is two pages, not one.** `/forgot-password` (enter email → flash success) and `/reset-password?token=...` (enter new password). Same shape as competitors (Stripe, Linear, Notion).
- **Profile edit is a single page.** `/profile/edit` with two server actions: update name, change password. Lives under `/profile` for discoverability; protected by middleware (already protects `/profile`).
- **Plan 3's open-signup gate stays.** When `ALLOW_OPEN_SIGNUP=true`, /signup works (with verification gate). When unset, /signup shows "Invite required". This plan adds the verification gate; it doesn't change the invite-only mode.
- **No deploy in this plan.** Suprero-app is local-only until Plan 9. All testing is local against the dev DB.

---

## Pre-conditions

- Plan 3 shipped to `suprero-app/main`. Login + signup + invite flow + accept-invite all work locally.
- Resend is verified for `suprero.com` (DNS green in Resend dashboard).
- `RESEND_API_KEY`, `EMAIL_FROM`, `ALLOW_OPEN_SIGNUP` already in `.env.local`.
- Local dev DB has the customer_invite table (migration 0004 applied).
- Working tree on suprero-app is clean.

---

## File Structure

All files under `/Users/anish/Desktop/work/zeeahmed/tradingview/suprero-app/`.

| Path | Action | Responsibility |
|---|---|---|
| `src/lib/auth.ts` | Modify | Enable `requireEmailVerification`, wire `sendVerificationEmail` + `sendResetPassword`, add `magicLink` plugin |
| `src/lib/email/templates/verify-email.ts` | Create | "Verify your email" HTML+text template |
| `src/lib/email/templates/reset-password.ts` | Create | "Reset your password" HTML+text template |
| `src/lib/email/templates/magic-link.ts` | Create | "Sign in to Suprero" HTML+text template |
| `src/app/verify-email/page.tsx` | Create | Landing page after clicking verify link — shows success or error |
| `src/app/forgot-password/page.tsx` | Create | Form to request a reset email |
| `src/app/forgot-password/actions.ts` | Create | Server action calls `auth.api.forgetPassword` |
| `src/app/forgot-password/ForgotPasswordFormClient.tsx` | Create | Client form with useActionState |
| `src/app/forgot-password/forgot-password.css` | Create | Reuses login.css base + minor tweaks |
| `src/app/reset-password/page.tsx` | Create | Token-validated form to set a new password |
| `src/app/reset-password/actions.ts` | Create | Server action calls `auth.api.resetPassword` |
| `src/app/reset-password/ResetPasswordFormClient.tsx` | Create | Client form |
| `src/app/login/page.tsx` | Modify | Add "Forgot password?" link + "Email me a sign-in link" toggle |
| `src/app/login/LoginFormClient.tsx` | Create | Extract form into client component (split from page.tsx) |
| `src/app/login/actions.ts` | Modify | Surface `EMAIL_NOT_VERIFIED` error specifically |
| `src/app/login/magic-link-action.ts` | Create | Server action that calls `auth.api.signInMagicLink` |
| `src/app/profile/edit/page.tsx` | Create | Server-component edit form |
| `src/app/profile/edit/actions.ts` | Create | `updateNameAction` + `changePasswordAction` |
| `src/app/profile/edit/EditProfileClient.tsx` | Create | Client form with both sections |
| `src/app/profile/edit/profile-edit.css` | Create | Form styles |
| `src/app/profile/page.tsx` | Modify | Add "Edit profile" link |

No changes to `content-pipeline/` and no schema changes. The `verification` table from Plan 1 handles all token storage.

---

## Tasks

### Task 1: Pre-flight verification

**Working directory:** `/Users/anish/Desktop/work/zeeahmed/tradingview/suprero-app`

- [ ] **Step 1: Confirm clean state**

```bash
git status -sb
git log --oneline -3
```

Expected: clean working tree, latest commit is the Plan 3 fixes (`fix(accept-invite): set emailVerified=true ...`).

- [ ] **Step 2: Confirm Resend is healthy**

```bash
TEST_RECIPIENT=anishmukherjee03@gmail.com cat > /tmp/resend-ping.ts <<'EOF'
import { sendEmail } from './src/lib/email/send';
sendEmail({ to: process.env.TEST_RECIPIENT!, subject: 'Plan 4 preflight', html: '<p>ok</p>' })
  .then((r) => { console.log('msg id:', r.id); process.exit(0); })
  .catch((e) => { console.error(e); process.exit(1); });
EOF
TEST_RECIPIENT=anishmukherjee03@gmail.com npx tsx --env-file=.env.local /tmp/resend-ping.ts
rm /tmp/resend-ping.ts
```

Expected: prints message id. Skip if you've already confirmed Resend works in this session.

- [ ] **Step 3: Start dev server**

```bash
PORT=3000 nohup npm run dev > /tmp/suprero-dev.log 2>&1 &
echo $! > /tmp/suprero-dev.pid
for i in $(seq 1 30); do curl -fsS -o /dev/null http://localhost:3000/login 2>/dev/null && break; sleep 1; done
echo "ready"
```

---

### Task 2: Create the three new email templates

**Files:**
- Create: `src/lib/email/templates/verify-email.ts`
- Create: `src/lib/email/templates/reset-password.ts`
- Create: `src/lib/email/templates/magic-link.ts`

Each follows the same shape as `invite.ts` from Plan 3 — exported function takes `{ recipientEmail, ctaUrl, ... }`, returns `{ subject, html, text }`. Reuse the `escapeHtml` / `escapeAttr` helpers (or extract to a shared `_escape.ts` file if you prefer).

- [ ] **Step 1: `verify-email.ts`**

Inputs: `recipientEmail`, `verifyUrl`. Body: "Click to verify your email and start using Suprero." CTA button: "Verify email". Footer: "If you didn't create an account, you can safely ignore this email."

- [ ] **Step 2: `reset-password.ts`**

Inputs: `recipientEmail`, `resetUrl`. Body: "Click to set a new password for your Suprero account." CTA button: "Reset password". Footer: "If you didn't request a password reset, ignore this email — your password is unchanged."

- [ ] **Step 3: `magic-link.ts`**

Inputs: `recipientEmail`, `loginUrl`. Body: "Click to sign in to Suprero. This link expires in 10 minutes." CTA button: "Sign in". Footer: "If you didn't try to sign in, ignore this email."

- [ ] **Step 4: tsc + commit**

```bash
npx tsc --noEmit
git add src/lib/email/templates
git commit -m "feat(email): add verify-email, reset-password, magic-link templates"
```

---

### Task 3: Wire up auth.ts — verification gate + email senders + magicLink plugin

**Files:**
- Modify: `src/lib/auth.ts`

- [ ] **Step 1: Add imports**

```ts
import { magicLink } from 'better-auth/plugins';
import { sendEmail } from './email/send';
import { verifyEmail as verifyEmailTpl } from './email/templates/verify-email';
import { resetPasswordEmail as resetPasswordTpl } from './email/templates/reset-password';
import { magicLinkEmail as magicLinkTpl } from './email/templates/magic-link';
```

(Adjust template export names to match what you wrote in Task 2.)

- [ ] **Step 2: Enable verification gate**

In the `emailAndPassword` block, change `requireEmailVerification` from `false` to `true`. Add `sendResetPassword`:

```ts
emailAndPassword: {
  enabled: true,
  requireEmailVerification: true,
  minPasswordLength: 8,
  sendResetPassword: async ({ user, url }) => {
    const tpl = resetPasswordTpl({ recipientEmail: user.email, resetUrl: url });
    await sendEmail({ to: user.email, subject: tpl.subject, html: tpl.html, text: tpl.text });
  },
},
```

- [ ] **Step 3: Add `emailVerification` config block**

```ts
emailVerification: {
  sendOnSignUp: true,
  autoSignInAfterVerification: true,
  sendVerificationEmail: async ({ user, url }) => {
    const tpl = verifyEmailTpl({ recipientEmail: user.email, verifyUrl: url });
    await sendEmail({ to: user.email, subject: tpl.subject, html: tpl.html, text: tpl.text });
  },
},
```

- [ ] **Step 4: Add magicLink to plugins**

```ts
plugins: [
  organization(),
  magicLink({
    sendMagicLink: async ({ email, url }) => {
      const tpl = magicLinkTpl({ recipientEmail: email, loginUrl: url });
      await sendEmail({ to: email, subject: tpl.subject, html: tpl.html, text: tpl.text });
    },
  }),
  nextCookies(),
],
```

`nextCookies()` must remain LAST in the array (it intercepts other plugins' cookie writes).

- [ ] **Step 5: tsc + commit**

```bash
npx tsc --noEmit
git add src/lib/auth.ts
git commit -m "feat(auth): enable email verification gate and wire reset-password + magic-link senders"
```

---

### Task 4: Build /forgot-password

**Files:**
- Create: `src/app/forgot-password/page.tsx`
- Create: `src/app/forgot-password/actions.ts`
- Create: `src/app/forgot-password/ForgotPasswordFormClient.tsx`
- Create: `src/app/forgot-password/forgot-password.css`

- [ ] **Step 1: CSS** — `@import url('../login/login.css');` plus a `.flash-success` style for the post-submit message (light green background, monospace, small).

- [ ] **Step 2: Server action**

```ts
'use server';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';

export type ForgotState = { error?: string; success?: boolean } | null;

export async function forgotPasswordAction(_prev: ForgotState, formData: FormData): Promise<ForgotState> {
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: 'Enter a valid email.' };
  }
  try {
    await auth.api.forgetPassword({
      body: { email, redirectTo: '/reset-password' },
      headers: await headers(),
    });
  } catch {
    // Always return success to avoid leaking whether the email exists.
  }
  return { success: true };
}
```

- [ ] **Step 3: Client form** — same pattern as `LoginFormClient` (Task 7). After submit, show "Check your email — if an account exists with that address, we sent a reset link." Hide the form after success.

- [ ] **Step 4: Page** — server component, renders the auth-card shell + form client. No env gate (works in any mode).

- [ ] **Step 5: Verify TS + commit**

---

### Task 5: Build /reset-password

**Files:**
- Create: `src/app/reset-password/page.tsx`
- Create: `src/app/reset-password/actions.ts`
- Create: `src/app/reset-password/ResetPasswordFormClient.tsx`
- (CSS reused — `@import url('../login/login.css');` is sufficient.)

- [ ] **Step 1: Server action**

```ts
'use server';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

export type ResetState = { error?: string } | null;

export async function resetPasswordAction(_prev: ResetState, formData: FormData): Promise<ResetState> {
  const token = String(formData.get('token') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  if (!token) return { error: 'Missing token.' };
  if (password.length < 8) return { error: 'Password must be at least 8 characters.' };
  try {
    await auth.api.resetPassword({
      body: { newPassword: password, token },
      headers: await headers(),
    });
  } catch (err) {
    return { error: 'This reset link is invalid or has expired.' };
  }
  redirect('/login?reset=ok');
}
```

- [ ] **Step 2: Page** — reads `?token=...` from `searchParams` (Promise<{}> in Next 16). If missing, show "Missing token" empty state. Otherwise render the form.

- [ ] **Step 3: Client form** — single password input, hidden token field, submit button.

- [ ] **Step 4: Verify TS + commit**

---

### Task 6: Build /verify-email landing

**Files:**
- Create: `src/app/verify-email/page.tsx`

Better Auth's verify endpoint at `/api/auth/verify-email` already does the token exchange. After verification, the user is redirected here.

- [ ] **Step 1: Page**

Server component. Reads optional `?error=...` and `?status=...` query params. Renders one of three states:
- `status=success` (user just verified) → "Email verified. You're signed in." + link to `/profile`.
- `error=invalid_token` → "This verification link is invalid or expired." + link to `/login`.
- Default (no params) → "Click the verification link in your email to confirm your account."

- [ ] **Step 2: Configure Better Auth `callbackURL`**

In `auth.ts`'s `emailVerification` block, set `callbackURL: '/verify-email?status=success'` (newer Better Auth versions use `redirectTo`; check your version).

- [ ] **Step 3: Verify TS + commit**

---

### Task 7: Update /login — extract form, add forgot-password link, add magic-link toggle

**Files:**
- Create: `src/app/login/LoginFormClient.tsx`
- Modify: `src/app/login/page.tsx` (extract form into client component)
- Modify: `src/app/login/actions.ts` (surface verification-required error)
- Create: `src/app/login/magic-link-action.ts`

- [ ] **Step 1: Extract form**

Move the existing form JSX from `page.tsx` into `LoginFormClient.tsx`. The page becomes a server component shell.

- [ ] **Step 2: Add forgot-password link**

Inside the form, after the password field: `<Link href="/forgot-password" className="auth-link">Forgot password?</Link>`.

- [ ] **Step 3: Add magic-link toggle**

Below the form, a second small button: "Email me a sign-in link instead". Wired to `magicLinkAction`. After click, replaces the form with "Check your email — we sent a sign-in link to {email}."

- [ ] **Step 4: Surface verification error**

In `actions.ts`, catch the specific error code from `auth.api.signInEmail` for `EMAIL_NOT_VERIFIED` and return `{ error: 'Verify your email to sign in. Check your inbox for the verification link.', resendVerificationFor: email }`. The form client renders a "Resend verification email" button when this error is present.

- [ ] **Step 5: Verify TS + commit**

---

### Task 8: Build /profile/edit

**Files:**
- Create: `src/app/profile/edit/page.tsx`
- Create: `src/app/profile/edit/actions.ts`
- Create: `src/app/profile/edit/EditProfileClient.tsx`
- Create: `src/app/profile/edit/profile-edit.css`
- Modify: `src/app/profile/page.tsx` (add "Edit profile" link)

- [ ] **Step 1: Server actions**

`updateNameAction(name)` calls `auth.api.updateUser({ body: { name }, headers: await headers() })`.

`changePasswordAction(currentPassword, newPassword)` calls `auth.api.changePassword({ body: { currentPassword, newPassword, revokeOtherSessions: true }, headers: await headers() })`. After success, redirect to `/profile`.

- [ ] **Step 2: Page**

Two card sections: "Display name" (single text input, save button) + "Change password" (current pw + new pw + save button).

- [ ] **Step 3: Add link from /profile**

Add `<Link href="/profile/edit" className="profile-edit-link">Edit profile</Link>` inside the profile-meta block or as an icon button next to the name.

- [ ] **Step 4: Middleware** — `/profile/edit` is auto-protected because middleware already covers `/profile/:path*`.

- [ ] **Step 5: Verify TS + commit**

---

### Task 9: End-to-end manual test

**Files:**
- None modified

For each flow, use a fresh test email (e.g. `e2e+timestamp@example.invalid` for verification, real address you can check for magic-link/reset).

- [ ] **Step 1: Fresh signup → verification gate**

1. With `ALLOW_OPEN_SIGNUP=true`, go to /signup, create user with `e2e-verify+1@anishmukherjee03.com`.
2. Try to log in → should see "Verify your email" error.
3. Open the verify email Resend sent (or pull URL from console logs / verification table), click link.
4. Expected: lands on `/verify-email?status=success`, signed in, can navigate to `/profile`.

- [ ] **Step 2: Forgot password**

1. Sign out.
2. Go to `/forgot-password`, enter the email of an existing user.
3. Expected: "Check your email" message.
4. Open email, click reset link → `/reset-password?token=...` form renders.
5. Set new password → redirects to `/login?reset=ok`.
6. Sign in with new password → `/profile`.

- [ ] **Step 3: Magic link**

1. Sign out.
2. On `/login`, click "Email me a sign-in link instead", enter email.
3. Expected: "Check your email."
4. Open email, click link → signed in, lands on `/profile` (or whatever default callback is).

- [ ] **Step 4: Edit profile**

1. Sign in.
2. Visit `/profile/edit`.
3. Change name to something new → submit. /profile shows new name.
4. Change password (current + new) → submit. Sign out. Sign in with new password works; old password fails.

- [ ] **Step 5: Invite-accept still bypasses verification gate**

(Plan 3's fix is what makes this work; this step is regression coverage.)

1. As staff, invite a new email.
2. Accept the invite, set password.
3. Land on `/profile`. **Must NOT** see the "verify your email" gate.
4. `email_verified` in DB should be `true` for the new user.

- [ ] **Step 6: Cleanup test users**

```bash
psql "$DEV_DB_URL" -c "DELETE FROM \"user\" WHERE email LIKE 'e2e-%';"
```

---

### Task 10: Push + summary

**Files:**
- None modified

- [ ] **Step 1: Push**

```bash
git status -sb
git log --oneline main..HEAD
git push origin main
```

- [ ] **Step 2: Print summary**

```bash
echo "=== Plan 4 commits ==="
git log --oneline -10
```

---

## Self-review

| Spec section requirement | Implemented in |
|---|---|
| Email verification gate for /signup | Tasks 3, 6, 9.1 |
| Verify email template + sender | Tasks 2, 3 |
| Password reset flow | Tasks 2, 3, 4, 5, 9.2 |
| Magic-link login | Tasks 2, 3, 7, 9.3 |
| Profile editing (name + password) | Tasks 8, 9.4 |
| Invite-accepted users skip gate | Plan 3's fix (regression-tested in Task 9.5) |

| Spec sections **NOT** in this plan | Lives in |
|---|---|
| Phase 2/3 migration (seed XG tenant, backfill site_id) | Plan 5 |
| Phase 4 migration (NOT NULL + FK + pipeline siteId code) | Plan 6 |
| Operator dashboard pages | Plan 7 |
| Internal staff dashboard pages | Plan 8 |
| Production deploy of suprero-app | Plan 9 |

## Completion criteria

Plan 4 is done when:
1. All 10 tasks have all checkboxes checked.
2. End-to-end test (Task 9) passes for all five flows.
3. `suprero-app/main` includes ~10 new commits and is pushed to GitHub.
4. `requireEmailVerification` is active in prod-config (will be when Plan 9 deploys).
5. Existing tests still pass (currently the suprero-app has none; this remains a Plan 4+ follow-up).
6. No regression to xerogravity.com (zero touches to content-pipeline in this plan).

After Plan 4 ships, the auth surface is complete. Plan 5 can begin: seed XeroGravity as a tenant + backfill `site_id` on existing pipeline rows.
