-- Platform staff helpers: owner_admin has all platform_admin powers;
-- is_owner_admin() is for god-mode-only checks (edit other platform admins).

create or replace function public.is_platform_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where (user_id = auth.uid() or id = auth.uid())
      and role in ('platform_admin', 'owner_admin')
      and status = 'active'
  );
$$;

create or replace function public.is_owner_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where (user_id = auth.uid() or id = auth.uid())
      and role = 'owner_admin'
      and status = 'active'
  );
$$;

update public.profiles
set role = 'owner_admin'
where lower(email) = 'dylanholdenried@gmail.com'
  and role::text in ('platform_admin', 'owner_admin');
