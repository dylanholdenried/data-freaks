-- Speed up group_admin / store-scoped SELECTs.
-- has_store_access(store_id) was evaluated per deal row (~4.5k for Jim Butler),
-- which made dashboard/registry navigation take minutes. Compute accessible
-- store IDs once, then use IN (SELECT ...) so Postgres can initPlan the set.

create or replace function public.accessible_store_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select s.id
  from public.stores s
  where (select public.is_platform_admin())
     or exists (
       select 1
       from public.profiles p
       where (p.user_id = (select auth.uid()) or p.id = (select auth.uid()))
         and p.status = 'active'
         and (
           (p.role = 'group_admin' and p.dealer_group_id = s.dealer_group_id)
           or exists (
             select 1
             from public.user_store_access usa
             where usa.store_id = s.id
               and (usa.user_id = p.user_id or usa.user_id = p.id)
           )
         )
     );
$$;

create or replace function public.has_store_access(p_store_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_store_id in (select public.accessible_store_ids());
$$;

-- High-traffic SELECT policies: filter by the once-computed store set.
drop policy if exists "deals_group_members_select" on public.deals;
create policy "deals_group_members_select"
on public.deals
for select
using (store_id in (select public.accessible_store_ids()));

drop policy if exists "stores_group_members_select" on public.stores;
create policy "stores_group_members_select"
on public.stores
for select
using (id in (select public.accessible_store_ids()));

drop policy if exists "departments_group_members_select" on public.departments;
create policy "departments_group_members_select"
on public.departments
for select
using (store_id in (select public.accessible_store_ids()));

drop policy if exists "salespeople_group_members_select" on public.salespeople;
create policy "salespeople_group_members_select"
on public.salespeople
for select
using (store_id in (select public.accessible_store_ids()));

drop policy if exists "store_calendar_group_members_select" on public.store_calendar_days;
create policy "store_calendar_group_members_select"
on public.store_calendar_days
for select
using (store_id in (select public.accessible_store_ids()));

drop policy if exists "acquisition_sources_group_members_select" on public.acquisition_sources;
create policy "acquisition_sources_group_members_select"
on public.acquisition_sources
for select
using (store_id in (select public.accessible_store_ids()));

drop policy if exists "finance_managers_members_select" on public.finance_managers;
create policy "finance_managers_members_select"
on public.finance_managers
for select
using (store_id in (select public.accessible_store_ids()));

drop policy if exists "trades_group_members_select" on public.trades;
create policy "trades_group_members_select"
on public.trades
for select
using (
  exists (
    select 1 from public.deals d
    where d.id = trades.deal_id
      and d.store_id in (select public.accessible_store_ids())
  )
);

drop policy if exists "deal_salespeople_group_members_select" on public.deal_salespeople;
create policy "deal_salespeople_group_members_select"
on public.deal_salespeople
for select
using (
  exists (
    select 1 from public.deals d
    where d.id = deal_salespeople.deal_id
      and d.store_id in (select public.accessible_store_ids())
  )
);

drop policy if exists "deal_notes_group_members_select" on public.deal_notes;
create policy "deal_notes_group_members_select"
on public.deal_notes
for select
using (
  exists (
    select 1 from public.deals d
    where d.id = deal_notes.deal_id
      and d.store_id in (select public.accessible_store_ids())
  )
);

drop policy if exists "department_goals_members_select" on public.department_goals;
create policy "department_goals_members_select"
on public.department_goals
for select
using (
  exists (
    select 1 from public.departments d
    where d.id = department_goals.department_id
      and d.store_id in (select public.accessible_store_ids())
  )
);
