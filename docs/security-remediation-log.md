# Security remediation log

Running record of changes from the vibe-security audit / remediation checklist.
Each entry: what changed, why, how to verify, and any manual follow-ups.

Source skill: [raroque/vibe-security-skill](https://github.com/raroque/vibe-security-skill) (local: `.agents/skills/vibe-security/`).

---

## 2026-08-10 — Gap check (vibe-security skill)

**What:** Re-passed secrets, database, auth, rate-limit, deployment, and data-access references.

**Result:** Confirmed prior Critical/High findings. Additional notes:
- Widespread `getSession()` in Server Actions and RSC pages (fixed below).
- Payments / mobile / AI skill areas N/A.
- No `jwt.decode`-only auth; theme uses `localStorage` (non-secret).

**Verify:** N/A (audit only).

---

## 2026-08-10 — P0 Secrets: untrack `.env.local` + IMPERSONATION_SECRET

**What:**
- `git rm --cached .env.local` (file remains on disk; ignored via `.gitignore` `.env*`).
- [`lib/impersonation.ts`](../lib/impersonation.ts): HMAC requires `IMPERSONATION_SECRET` only (no service_role fallback).
- [`.env.example`](../.env.example): documented `IMPERSONATION_SECRET`.
- Generated `IMPERSONATION_SECRET` into local `.env.local` (not committed).

**Why:** Service role key lived in a tracked `.env.local` on `origin/main`.

**Manual follow-up (required):**
1. Supabase Dashboard → API → **rotate** `service_role` and preferably `anon`.
2. Update Vercel + local env with new keys.
3. Set `IMPERSONATION_SECRET` on Vercel (`openssl rand -base64 32`).
4. Rotate Resend if it was ever in a committed env file.
5. Commit the staged removal of `.env.local` from git when you next commit.

**Verify:** `git ls-files .env.local` empty; impersonation fails without `IMPERSONATION_SECRET`.

---

## 2026-08-10 — P0 Profile privileged-column lock (production)

**What:** Applied migration `profiles_lock_privileged_columns` (also in repo as [`supabase/migrations/20260810180000_profiles_lock_privileged_columns.sql`](../supabase/migrations/20260810180000_profiles_lock_privileged_columns.sql)).

**Why:** Authenticated users could `UPDATE profiles SET role/status/dealer_group_id` and escalate to platform admin.

**Verify:** `SELECT tgname FROM pg_trigger WHERE tgname='profiles_protect_privileged_columns'` → exists. Self-update of `role` raises `42501`.

---

## 2026-08-10 — P1 Lock deal-import RPCs (production)

**What:** Applied `lock_deal_import_rpcs` ([`20260810180100_lock_deal_import_rpcs.sql`](../supabase/migrations/20260810180100_lock_deal_import_rpcs.sql)):
- Auth gate: `service_role` or `is_platform_admin()` required inside functions.
- `EXECUTE` revoked from `anon`/`authenticated`/`PUBLIC`; granted to `service_role` only.

**Why:** SECURITY DEFINER commit/unwind had no auth and were world-callable via REST RPC.

**Verify:** Grants only `postgres` + `service_role`. Admin bulk-upload confirm/unwind still works.

---

## 2026-08-10 — P1 Drop legacy `current_group_id()` policies (production)

**What:** Applied `drop_legacy_current_group_id_policies` ([`20260810180200_...`](../supabase/migrations/20260810180200_drop_legacy_current_group_id_policies.sql)).
- Dropped all `p_*` policies using `current_group_id()`.
- Replaced `department_makes` with store-scoped `has_store_access` / `can_mutate_store` policies.

**Why:** Permissive OR with store-scoped policies allowed group-wide mutate (including store_viewer).

**Behavior note:** Access is now strictly store-scoped via `has_store_access` / `can_mutate_store` (intended model).

**Verify:** `legacy_count = 0` for policies referencing `current_group_id()`. Store viewer cannot update deals.

---

## 2026-08-10 — P1 Signup hardening

**What:**
- Rate limit signup: 5 / hour / IP ([`app/api/auth/signup/route.ts`](../app/api/auth/signup/route.ts)).
- `email_confirm: false` on public signup createUser.
- Provision paths confirm Auth email on activate ([`app/admin/provision-actions.ts`](../app/admin/provision-actions.ts)).

**Why:** Open signup + auto-confirmed emails enabled account spam and immediate credential use.

**Verify:** Rapid signup returns 429. New signup cannot login until provision confirms email + sets profile active.

---

## 2026-08-10 — P2 Hardening

**What:**
- Rate limits on login (20/min), magic-link (5/min), set-password (10/min) via [`lib/rate-limit.ts`](../lib/rate-limit.ts).
- Replaced `getSession()` → `getUser()` across app Server Actions / RSC pages (17 files).
- Vehicle catalog RLS: authenticated read; platform-admin write ([`20260810180300_...`](../supabase/migrations/20260810180300_vehicle_catalog_and_anon_grants.sql)).
- Revoked `anon` SELECT on sensitive tables (audit_logs, profiles, import tables, etc.).
- Revoked `anon` EXECUTE on SECURITY DEFINER helpers ([`20260810180400_...`](../supabase/migrations/20260810180400_revoke_anon_security_definer_helpers.sql)).
- Security headers in [`next.config.mjs`](../next.config.mjs) (XFO, nosniff, Referrer-Policy, Permissions-Policy, HSTS).

**Manual follow-up:**
- Supabase Auth → enable **leaked password protection** (HaveIBeenPwned): Dashboard → Authentication → Providers / Attack Protection.
- Set `IMPERSONATION_SECRET` on Vercel before deploying impersonation changes.

**Verify:** Advisors no longer list commit/unwind as anon-executable. Login spam returns 429. Vehicle write as non-admin fails RLS.

---

## 2026-08-10 — Hotfix: Profit Center / deals statement timeout (production)

**Symptom:** owner_admin saw slow login/navigation; Profit Center crashed with digest `3978832795`.

**Cause (Vercel runtime errors):** `canceling statement due to statement timeout` on `/app/profit-center`. After dropping legacy `current_group_id()` policies, `profit_center_deal_bundle` (SECURITY INVOKER) re-evaluated `has_store_access()` via RLS on ~4700 deal rows (+ trades/dsp).

**What:** Applied `rls_perf_profit_center_hotfix` ([`20260810190000_rls_perf_profit_center_hotfix.sql`](../supabase/migrations/20260810190000_rls_perf_profit_center_hotfix.sql)):
- `profit_center_deal_bundle` → SECURITY DEFINER (still filters stores with `has_store_access` once first)
- Optimized `is_platform_admin` / `has_store_access` / `can_mutate_store` with `(select auth.uid())`
- Added platform-admin fast-path SELECT policies on deals/stores/trades/deal_salespeople

**Verify:** Reload Profit Center and Sales Registry as owner_admin; should load without timeout. Check Vercel runtime errors for digest `3978832795` stops recurring.

---

## 2026-08-13 — Hotfix: group_admin dashboard/nav slowness (production)

**Symptom:** New Jim Butler `group_admin` (`dylan@dealeracq.com`) could log in but dashboard/nav took minutes. owner_admin was already fast.

**Cause:** Platform staff had a one-shot `is_platform_admin()` SELECT policy. `group_admin` still used per-row `has_store_access(store_id)` over ~4,481 Jim Butler deals.

**What:** Applied `rls_accessible_store_ids_initplan` ([`20260813120000_rls_accessible_store_ids_initplan.sql`](../supabase/migrations/20260813120000_rls_accessible_store_ids_initplan.sql)):
- `accessible_store_ids()` computes the store set once (platform / group / assigned stores)
- High-traffic SELECT policies use `store_id IN (SELECT accessible_store_ids())`

**Verify:** Hard refresh as `dylan@dealeracq.com` — dashboard, Sales Registry, Profit Center, Calendar should navigate in a couple seconds.

---

## 2026-08-13 — Same store-set SELECT path for leftover tables (production)

**Why:** `store_admin` / `store_viewer` already used `accessible_store_ids()` on dashboard/registry tables. Remaining SELECTs (deal flags/events, department_makes, inventory) still called `has_store_access()` per row.

**What:** Applied `rls_remaining_select_store_set` ([`20260813121000_rls_remaining_select_store_set.sql`](../supabase/migrations/20260813121000_rls_remaining_select_store_set.sql)).

**Verify:** Open a deal as store_admin; open Inventory Command if on plan; View Only dashboard/registry/calendar.

---

## 2026-08-13 — Owner-admin TOTP MFA

**What:**
- `/mfa` enroll + verify (authenticator app) required for `owner_admin` after password/magic-link.
- Layouts, `requireAdminContext`, and login redirect until session is AAL2.
- `is_platform_admin()` / `is_owner_admin()` now require JWT `aal=aal2` for owner_admin so a password-only session cannot use the platform-admin data fast-path.
- Verify/enroll APIs rate-limited (10/min). Other roles unchanged.

**Why:** Stolen owner password was the remaining realistic path to all dealer data.

**Verify:** Log in as owner_admin → scan QR → enter code → app/admin load. Log in as group_admin → no MFA screen. Lose-phone recovery: Supabase → Authentication → Users → remove factor, then re-enroll.

---

## Remaining manual checklist

- [x] Rotate Supabase service_role (+ anon) keys; update Vercel (migrated to `sb_publishable_` / `sb_secret_`; legacy JWT keys disabled)
- [x] Set `IMPERSONATION_SECRET` on Vercel
- [ ] Enable Auth leaked-password protection in Supabase Dashboard (optional; Captcha left off)
- [x] Commit staged `.env.local` untrack + migration/code changes
- [ ] Smoke test leftover: admin bulk-upload confirm/unwind, store_viewer read-only
- [ ] Enroll owner_admin authenticator on next login (`/mfa`)
