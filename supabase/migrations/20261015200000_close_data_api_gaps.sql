-- Close remaining Data API exposure gaps. The app reads tables only as a
-- signed-in user (RLS) or through the server-side service role, so none of
-- these changes alter app behavior.
--
-- 1. store_has_inventory_coverage: signed-in callers only learn coverage for
--    stores they can access (same rule as resolve_inventory_pricing). Trusted
--    contexts with no JWT (service role, migrations) are unchanged.
-- 2. dealer_groups: only group admins of that group (plus platform/owner
--    admins via dealer_groups_platform_admin_all) can read the group row.
--    Store-scoped users no longer can. The app reads this table only with the
--    service role.
-- 3. Logged-out (anon) role: no table/sequence privileges in public, and RLS
--    helper functions are no longer executable by anon or PUBLIC. Signed-in
--    users keep their explicit authenticated grants. Future tables/functions
--    created by postgres are no longer auto-granted to anon.

-- ── 1. Inventory coverage respects store access ─────────────────────────────

create or replace function public.store_has_inventory_coverage(p_store_id uuid, p_on date)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from public.inv_snapshots s
    where s.store_id = p_store_id
      and s.snapshot_date <= coalesce(p_on, current_date)
      and ((select auth.uid()) is null or public.has_store_access(p_store_id))
  );
$$;

revoke execute on function public.store_has_inventory_coverage(uuid, date) from public, anon;
grant execute on function public.store_has_inventory_coverage(uuid, date) to authenticated, service_role;

-- ── 2. Dealer group row: group admins only ──────────────────────────────────

drop policy if exists "dealer_groups_group_members_select" on public.dealer_groups;
drop policy if exists "dealer_groups_group_admins_select" on public.dealer_groups;

create policy "dealer_groups_group_admins_select"
on public.dealer_groups
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.dealer_group_id = dealer_groups.id
      and (p.user_id = (select auth.uid()) or p.id = (select auth.uid()))
      and p.status = 'active'
      and p.role = 'group_admin'
  )
);

-- ── 3. Logged-out role has no direct database access ────────────────────────

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke execute on all functions in schema public from anon;

revoke execute on function public.accessible_store_ids() from public;
revoke execute on function public.can_mutate_store(uuid) from public;
revoke execute on function public.current_group_id() from public;
revoke execute on function public.current_profile_id() from public;
revoke execute on function public.has_store_access(uuid) from public;
revoke execute on function public.is_owner_admin() from public;
revoke execute on function public.is_platform_admin() from public;
revoke execute on function public.is_preowned_department(text) from public;
revoke execute on function public.list_price_enforced_from() from public;
revoke execute on function public.departments_validate_rollup() from public;

alter default privileges for role postgres in schema public revoke all on tables from anon;
alter default privileges for role postgres in schema public revoke all on sequences from anon;
alter default privileges for role postgres in schema public revoke execute on functions from anon;
