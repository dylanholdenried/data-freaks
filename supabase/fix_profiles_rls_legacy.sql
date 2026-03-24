-- Run in Supabase SQL Editor (full script, in order).
-- Legacy: profiles.id may equal auth user id; user_id may be null.

-- 0) Optional: add user_id if missing
-- alter table public.profiles add column if not exists user_id uuid references auth.users (id) on delete cascade;

-- 1) Backfill user_id when missing
update public.profiles
set user_id = id
where user_id is null;

-- 2) Drop policies that call is_platform_admin() BEFORE replacing that function
--    (otherwise CREATE OR REPLACE FUNCTION can fail with 42883 in some setups)
drop policy if exists "profiles_select_own_or_admin" on public.profiles;
drop policy if exists "profiles_update_self" on public.profiles;

-- 3) Recreate helper functions (no dependency on the policies above)
create or replace function public.current_profile_id()
returns uuid
language sql
security definer
set search_path = public
as $$
  select id
  from public.profiles
  where user_id = auth.uid() or id = auth.uid()
  limit 1;
$$;

create or replace function public.is_platform_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where (p.user_id = auth.uid() or p.id = auth.uid())
      and (p.role)::text = 'platform_admin'
      and (p.status)::text = 'active'
  );
$$;

-- 4) Recreate policies
create policy "profiles_select_own_or_admin"
on public.profiles
for select
using (
  is_platform_admin()
  or user_id = auth.uid()
  or id = auth.uid()
);

create policy "profiles_update_self"
on public.profiles
for update
using (user_id = auth.uid() or id = auth.uid());
