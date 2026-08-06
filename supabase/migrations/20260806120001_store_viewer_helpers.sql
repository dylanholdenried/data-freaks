-- store_viewer helpers + write policies.
-- SELECT stays on has_store_access; mutations require can_mutate_store.

create or replace function public.can_mutate_store(p_store_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select
    public.has_store_access(p_store_id)
    and not exists (
      select 1
      from public.profiles p
      where (p.user_id = auth.uid() or p.id = auth.uid())
        and p.status = 'active'
        and p.role = 'store_viewer'
    );
$$;

-- Departments
drop policy if exists "departments_members_insert" on public.departments;
create policy "departments_members_insert"
on public.departments
for insert
with check (public.can_mutate_store(store_id));

drop policy if exists "departments_members_update" on public.departments;
create policy "departments_members_update"
on public.departments
for update
using (public.can_mutate_store(store_id))
with check (public.can_mutate_store(store_id));

-- Salespeople
drop policy if exists "salespeople_members_insert" on public.salespeople;
create policy "salespeople_members_insert"
on public.salespeople
for insert
with check (public.can_mutate_store(store_id));

drop policy if exists "salespeople_members_update" on public.salespeople;
create policy "salespeople_members_update"
on public.salespeople
for update
using (public.can_mutate_store(store_id))
with check (public.can_mutate_store(store_id));

-- Acquisition sources
drop policy if exists "acquisition_sources_members_insert" on public.acquisition_sources;
create policy "acquisition_sources_members_insert"
on public.acquisition_sources
for insert
with check (public.can_mutate_store(store_id));

drop policy if exists "acquisition_sources_members_update" on public.acquisition_sources;
create policy "acquisition_sources_members_update"
on public.acquisition_sources
for update
using (public.can_mutate_store(store_id))
with check (public.can_mutate_store(store_id));

-- Finance managers
drop policy if exists "finance_managers_members_insert" on public.finance_managers;
create policy "finance_managers_members_insert"
on public.finance_managers
for insert
with check (public.can_mutate_store(store_id));

drop policy if exists "finance_managers_members_update" on public.finance_managers;
create policy "finance_managers_members_update"
on public.finance_managers
for update
using (public.can_mutate_store(store_id))
with check (public.can_mutate_store(store_id));

-- Department goals
drop policy if exists "department_goals_members_insert" on public.department_goals;
create policy "department_goals_members_insert"
on public.department_goals
for insert
with check (
  exists (
    select 1
    from public.departments d
    where d.id = department_goals.department_id
      and public.can_mutate_store(d.store_id)
  )
);

drop policy if exists "department_goals_members_update" on public.department_goals;
create policy "department_goals_members_update"
on public.department_goals
for update
using (
  exists (
    select 1
    from public.departments d
    where d.id = department_goals.department_id
      and public.can_mutate_store(d.store_id)
  )
)
with check (
  exists (
    select 1
    from public.departments d
    where d.id = department_goals.department_id
      and public.can_mutate_store(d.store_id)
  )
);

-- Store calendar
drop policy if exists "store_calendar_members_insert" on public.store_calendar_days;
create policy "store_calendar_members_insert"
on public.store_calendar_days
for insert
with check (public.can_mutate_store(store_id));

drop policy if exists "store_calendar_members_update" on public.store_calendar_days;
create policy "store_calendar_members_update"
on public.store_calendar_days
for update
using (public.can_mutate_store(store_id))
with check (public.can_mutate_store(store_id));

-- Deals
drop policy if exists "deals_group_members_insert" on public.deals;
create policy "deals_group_members_insert"
on public.deals
for insert
with check (public.can_mutate_store(store_id));

drop policy if exists "deals_group_members_update" on public.deals;
create policy "deals_group_members_update"
on public.deals
for update
using (public.can_mutate_store(store_id))
with check (public.can_mutate_store(store_id));

-- Deal salespeople
drop policy if exists "deal_salespeople_group_members_insert" on public.deal_salespeople;
create policy "deal_salespeople_group_members_insert"
on public.deal_salespeople
for insert
with check (
  exists (
    select 1 from public.deals d
    where deal_salespeople.deal_id = d.id
      and public.can_mutate_store(d.store_id)
  )
);

drop policy if exists "deal_salespeople_group_members_update" on public.deal_salespeople;
create policy "deal_salespeople_group_members_update"
on public.deal_salespeople
for update
using (
  exists (
    select 1 from public.deals d
    where deal_salespeople.deal_id = d.id
      and public.can_mutate_store(d.store_id)
  )
)
with check (
  exists (
    select 1 from public.deals d
    where deal_salespeople.deal_id = d.id
      and public.can_mutate_store(d.store_id)
  )
);

drop policy if exists "deal_salespeople_group_members_delete" on public.deal_salespeople;
create policy "deal_salespeople_group_members_delete"
on public.deal_salespeople
for delete
using (
  exists (
    select 1 from public.deals d
    where deal_salespeople.deal_id = d.id
      and public.can_mutate_store(d.store_id)
  )
);

-- Trades
drop policy if exists "trades_group_members_insert" on public.trades;
create policy "trades_group_members_insert"
on public.trades
for insert
with check (
  exists (
    select 1 from public.deals d
    where trades.deal_id = d.id
      and public.can_mutate_store(d.store_id)
  )
);

drop policy if exists "trades_group_members_update" on public.trades;
create policy "trades_group_members_update"
on public.trades
for update
using (
  exists (
    select 1 from public.deals d
    where trades.deal_id = d.id
      and public.can_mutate_store(d.store_id)
  )
)
with check (
  exists (
    select 1 from public.deals d
    where trades.deal_id = d.id
      and public.can_mutate_store(d.store_id)
  )
);

drop policy if exists "trades_group_members_delete" on public.trades;
create policy "trades_group_members_delete"
on public.trades
for delete
using (
  exists (
    select 1 from public.deals d
    where trades.deal_id = d.id
      and public.can_mutate_store(d.store_id)
  )
);

-- Deal notes
drop policy if exists "deal_notes_group_members_insert" on public.deal_notes;
create policy "deal_notes_group_members_insert"
on public.deal_notes
for insert
with check (
  exists (
    select 1 from public.deals d
    where deal_notes.deal_id = d.id
      and public.can_mutate_store(d.store_id)
  )
);
