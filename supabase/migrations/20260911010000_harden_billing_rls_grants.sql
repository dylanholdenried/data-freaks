-- Harden Phase 0 billing / RLS: close public EXECUTE on write helpers,
-- re-revoke anon on RLS helpers, and remove table write grants that RLS already blocks.

-- 1) sync_dealer_group_plan_cache must be service_role only
revoke all on function public.sync_dealer_group_plan_cache(uuid) from public;
revoke all on function public.sync_dealer_group_plan_cache(uuid) from anon;
revoke all on function public.sync_dealer_group_plan_cache(uuid) from authenticated;
grant execute on function public.sync_dealer_group_plan_cache(uuid) to service_role;

-- 2) Trigger / maintenance helpers should not be callable via PostgREST
do $$
begin
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'profiles_protect_privileged_columns'
      and pg_get_function_identity_arguments(p.oid) = ''
  ) then
    revoke all on function public.profiles_protect_privileged_columns() from public;
    revoke all on function public.profiles_protect_privileged_columns() from anon;
    revoke all on function public.profiles_protect_privileged_columns() from authenticated;
  end if;

  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'log_deal_created'
      and pg_get_function_identity_arguments(p.oid) = ''
  ) then
    revoke all on function public.log_deal_created() from public;
    revoke all on function public.log_deal_created() from anon;
    revoke all on function public.log_deal_created() from authenticated;
  end if;

  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'log_deal_status_changed'
      and pg_get_function_identity_arguments(p.oid) = ''
  ) then
    revoke all on function public.log_deal_status_changed() from public;
    revoke all on function public.log_deal_status_changed() from anon;
    revoke all on function public.log_deal_status_changed() from authenticated;
  end if;

  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'rls_auto_enable'
      and pg_get_function_identity_arguments(p.oid) = ''
  ) then
    revoke all on function public.rls_auto_enable() from public;
    revoke all on function public.rls_auto_enable() from anon;
    revoke all on function public.rls_auto_enable() from authenticated;
  end if;
end$$;

-- 3) Re-apply anon revoke on RLS helpers (authenticated still needs EXECUTE for policies)
revoke execute on function public.accessible_store_ids() from anon;
revoke execute on function public.can_mutate_store(uuid) from anon;
revoke execute on function public.current_group_id() from anon;
revoke execute on function public.current_profile_id() from anon;
revoke execute on function public.has_store_access(uuid) from anon;
revoke execute on function public.is_owner_admin() from anon;
revoke execute on function public.is_platform_admin() from anon;

-- 4) Defense in depth: JWT clients cannot write stores / dealer_groups
-- (RLS already SELECT-only for members; admin mutations use service_role)
revoke insert, update, delete, truncate on table public.stores from anon;
revoke insert, update, delete, truncate on table public.stores from authenticated;
revoke insert, update, delete, truncate on table public.dealer_groups from anon;
revoke insert, update, delete, truncate on table public.dealer_groups from authenticated;

-- Keep SELECT for authenticated (and anon if demo/public policies need it)
grant select on table public.stores to authenticated;
grant select on table public.dealer_groups to authenticated;
