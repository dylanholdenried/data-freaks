-- Drop legacy current_group_id() policies that OR-bypass store-scoped RLS.
-- Keep has_store_access / can_mutate_store policies.
-- Replace department_makes policies (only had legacy policies).

-- deals
drop policy if exists "p_deals_read" on public.deals;
drop policy if exists "p_deals_write" on public.deals;
drop policy if exists "p_deals_update" on public.deals;

-- trades
drop policy if exists "p_trades_read" on public.trades;
drop policy if exists "p_trades_write" on public.trades;

-- deal_notes
drop policy if exists "p_notes_read" on public.deal_notes;
drop policy if exists "p_notes_write" on public.deal_notes;

-- deal_salespeople
drop policy if exists "p_dsp_read" on public.deal_salespeople;
drop policy if exists "p_dsp_write" on public.deal_salespeople;
drop policy if exists "p_dsp_update" on public.deal_salespeople;
drop policy if exists "p_dsp_delete" on public.deal_salespeople;

-- salespeople
drop policy if exists "p_salespeople_read" on public.salespeople;
drop policy if exists "p_salespeople_write" on public.salespeople;
drop policy if exists "p_salespeople_update" on public.salespeople;

-- finance_managers
drop policy if exists "p_finmgr_read" on public.finance_managers;
drop policy if exists "p_finmgr_write" on public.finance_managers;
drop policy if exists "p_finmgr_update" on public.finance_managers;

-- acquisition_sources
drop policy if exists "p_acqsrc_read" on public.acquisition_sources;
drop policy if exists "p_acqsrc_write" on public.acquisition_sources;
drop policy if exists "p_acqsrc_update" on public.acquisition_sources;

-- store_calendar_days
drop policy if exists "p_calendar_read" on public.store_calendar_days;
drop policy if exists "p_calendar_write" on public.store_calendar_days;
drop policy if exists "p_calendar_update" on public.store_calendar_days;

-- department_goals
drop policy if exists "p_deptgoals_read" on public.department_goals;
drop policy if exists "p_deptgoals_write" on public.department_goals;
drop policy if exists "p_deptgoals_update" on public.department_goals;

-- departments
drop policy if exists "p_departments_read" on public.departments;

-- stores
drop policy if exists "p_stores_read" on public.stores;

-- department_makes: replace group-wide policies with store-scoped ones
drop policy if exists "p_department_makes_read" on public.department_makes;
drop policy if exists "p_department_makes_write" on public.department_makes;
drop policy if exists "p_department_makes_delete" on public.department_makes;

create policy "department_makes_select"
on public.department_makes
for select
using (
  exists (
    select 1
    from public.departments d
    where d.id = department_makes.department_id
      and public.has_store_access(d.store_id)
  )
);

create policy "department_makes_insert"
on public.department_makes
for insert
with check (
  exists (
    select 1
    from public.departments d
    where d.id = department_makes.department_id
      and public.can_mutate_store(d.store_id)
  )
);

create policy "department_makes_delete"
on public.department_makes
for delete
using (
  exists (
    select 1
    from public.departments d
    where d.id = department_makes.department_id
      and public.can_mutate_store(d.store_id)
  )
);
