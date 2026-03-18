# Data Freaks – V1 MVP

Dealer-group focused sales log and acquisition-intelligence platform built with Next.js 14, Supabase, Tailwind, and shadcn-style components.

## Stack

- Next.js 14 App Router (TypeScript)
- Tailwind CSS + shadcn-style primitives
- Supabase (Auth, Postgres, RLS)
- Vercel deployment

## Quick start

1. **Install dependencies**

   ```bash
   cd data-freaks
   npm install
   ```

2. **Configure Supabase**

   - Create a new Supabase project.
   - In the SQL editor, run:
     - `supabase/schema.sql`
     - `supabase/demo_seed.sql`
   - In Supabase Auth settings:
     - Enable **email/password**, **magic link**, and **Google OAuth** (optional for now).
     - Require **email verification**.

3. **Set environment variables**

   Copy `.env.example` to `.env.local` and fill in:

   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (server-only, used for signup/admin flows)
   - `NEXT_PUBLIC_SITE_URL` (e.g. your Vercel URL)

4. **Run the app**

   ```bash
   npm run dev
   ```

   - Landing page: `/`
   - Public demo dashboard (demo data, read-only): `/demo`
   - Sign up / request access: `/signup`
   - Login: `/login`
   - Awaiting approval placeholder: `/awaiting-approval`
   - Authenticated customer app dashboard: `/app/dashboard`
   - Platform admin requests screen: `/admin/requests`

## Admin / initial users

- Create your first platform admin user directly in Supabase:
  - Sign up with email/password via `/login` (or create user in Supabase Auth).
  - Insert a row into `profiles` referencing the `auth.users.id` with:
    - `role = 'platform_admin'`
    - `status = 'active'`
- Platform admins can:
  - View and manage dealer group requests at `/admin/requests`.
  - Manually create `dealer_groups`, `stores`, `departments`, `salespeople`, and `user_store_access`.

## What’s implemented in V1

- **Supabase schema & RLS** for:
  - Dealer groups, stores, departments, salespeople, acquisition sources.
  - Deals, split deals, trades, notes, calendar days, audit logs.
  - Plan tiers and basic role separation (`platform_admin`, `group_admin`, `store_admin`).
  - Demo data that is accessible to anonymous users only where `is_demo = true`.
- **Public experiences**
  - Landing page `/` with positioning, tier breakdown, and CTA buttons.
  - Sign up / request access `/signup` posting into `dealer_group_requests` via Supabase service role.
  - Demo dashboard `/demo` showing:
    - Booked vs closed volume
    - Closed gross and gross pace
    - Working days completed / total
    - Department table
    - Salesperson leaderboard
    - Clearly labeled as **Demo Data** and read-only.
- **Auth**
  - Email/password login wired via `/api/auth/login`.
  - Magic-link endpoint `/api/auth/magic-link` (uses Supabase OTP).
  - Layout-level guard on `/app` and `/admin` using Supabase session.
  - Awaiting-approval page `/awaiting-approval` for users whose profile is not yet active.
- **Customer app**
  - App shell `/app` with nav and sign-out.
  - Main dashboard `/app/dashboard`:
    - Same KPI logic as demo, but scoped by the user’s `dealer_group_id`.
    - Department table and salesperson leaderboard.
- **Platform admin**
  - Admin shell `/admin`.
  - Requests screen `/admin/requests`:
    - Lists inbound applications from `/signup`.
    - Buttons to mark requests as `active` or `rejected`.

## Manual configuration you must do

- **Supabase**
  - Run `supabase/schema.sql` and `supabase/demo_seed.sql`.
  - Configure Auth (providers, email templates, redirect URLs).
  - Create at least one `profiles` row for a platform admin linked to an `auth.users` record.
  - When approving a dealer group request, manually:
    - Create a `dealer_groups` row (if not created yet).
    - Create `stores`, `departments`, `salespeople`, and `store_calendar_days`.
    - Attach users to a group via `profiles.dealer_group_id` and `user_store_access`.

- **Vercel**
  - Create a new Vercel project from this repo.
  - Add the environment variables from `.env.local` into the Vercel dashboard.
  - Deploy; your production URL becomes your `NEXT_PUBLIC_SITE_URL`.

## Next steps / extensions

- Flesh out:
  - `/app/deals`, `/app/deals/new`, `/app/deals/[id]` (full deal CRUD + notes and trades).
  - `/app/setup` (store/dept/salespeople/source setup checklist).
  - `/app/calendar` (calendar editor per store).
  - `/admin/groups` and `/admin/users` for richer internal tooling.
- Add feature flags by `plan_tier` to gate KPI analytics, exports, and premium features.

