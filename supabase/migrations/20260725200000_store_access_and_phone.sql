-- Store-scoped access for store_admin + profiles.phone
-- group_admin: all stores in profiles.dealer_group_id
-- store_admin: only stores listed in user_store_access

-- ===========================
-- PROFILES.PHONE
-- ===========================

alter table public.profiles
  add column if not exists phone text;

-- ===========================
-- ACCESS HELPERS
-- ===========================

create or replace function public.has_store_access(p_store_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select
    public.is_platform_admin()
    or exists (
      select 1
      from public.stores s
      join public.profiles p
        on (p.user_id = auth.uid() or p.id = auth.uid())
      where s.id = p_store_id
        and p.status = 'active'
        and (
          (p.role = 'group_admin' and p.dealer_group_id = s.dealer_group_id)
          or exists (
            select 1
            from public.user_store_access usa
            where usa.store_id = p_store_id
              and (usa.user_id = p.user_id or usa.user_id = p.id)
          )
        )
    );
$$;

create or replace function public.accessible_store_ids()
returns setof uuid
language sql
security definer
stable
set search_path = public
as $$
  select s.id
  from public.stores s
  where public.has_store_access(s.id);
$$;

-- ===========================
-- USER_STORE_ACCESS POLICIES
-- ===========================

drop policy if exists "user_store_access_platform_admin_all" on public.user_store_access;
create policy "user_store_access_platform_admin_all"
on public.user_store_access
for all
using (public.is_platform_admin())
with check (public.is_platform_admin());

drop policy if exists "user_store_access_select_own" on public.user_store_access;
create policy "user_store_access_select_own"
on public.user_store_access
for select
using (
  user_id = auth.uid()
  or user_id = public.current_profile_id()
);

-- ===========================
-- STORES
-- ===========================

drop policy if exists "stores_group_members_select" on public.stores;
create policy "stores_group_members_select"
on public.stores
for select
using (public.has_store_access(id));

-- ===========================
-- DEPARTMENTS
-- ===========================

drop policy if exists "departments_group_members_select" on public.departments;
create policy "departments_group_members_select"
on public.departments
for select
using (public.has_store_access(store_id));

drop policy if exists "departments_members_insert" on public.departments;
create policy "departments_members_insert"
on public.departments
for insert
with check (public.has_store_access(store_id));

drop policy if exists "departments_members_update" on public.departments;
create policy "departments_members_update"
on public.departments
for update
using (public.has_store_access(store_id))
with check (public.has_store_access(store_id));

-- ===========================
-- SALESPEOPLE
-- ===========================

drop policy if exists "salespeople_group_members_select" on public.salespeople;
create policy "salespeople_group_members_select"
on public.salespeople
for select
using (public.has_store_access(store_id));

drop policy if exists "salespeople_members_insert" on public.salespeople;
create policy "salespeople_members_insert"
on public.salespeople
for insert
with check (public.has_store_access(store_id));

drop policy if exists "salespeople_members_update" on public.salespeople;
create policy "salespeople_members_update"
on public.salespeople
for update
using (public.has_store_access(store_id))
with check (public.has_store_access(store_id));

-- ===========================
-- ACQUISITION SOURCES
-- ===========================

drop policy if exists "acquisition_sources_group_members_select" on public.acquisition_sources;
create policy "acquisition_sources_group_members_select"
on public.acquisition_sources
for select
using (public.has_store_access(store_id));

drop policy if exists "acquisition_sources_members_insert" on public.acquisition_sources;
create policy "acquisition_sources_members_insert"
on public.acquisition_sources
for insert
with check (public.has_store_access(store_id));

drop policy if exists "acquisition_sources_members_update" on public.acquisition_sources;
create policy "acquisition_sources_members_update"
on public.acquisition_sources
for update
using (public.has_store_access(store_id))
with check (public.has_store_access(store_id));

-- ===========================
-- FINANCE MANAGERS (live table)
-- ===========================

alter table public.finance_managers enable row level security;

drop policy if exists "finance_managers_platform_admin_all" on public.finance_managers;
create policy "finance_managers_platform_admin_all"
on public.finance_managers
for all
using (public.is_platform_admin())
with check (public.is_platform_admin());

drop policy if exists "finance_managers_members_select" on public.finance_managers;
create policy "finance_managers_members_select"
on public.finance_managers
for select
using (public.has_store_access(store_id));

drop policy if exists "finance_managers_members_insert" on public.finance_managers;
create policy "finance_managers_members_insert"
on public.finance_managers
for insert
with check (public.has_store_access(store_id));

drop policy if exists "finance_managers_members_update" on public.finance_managers;
create policy "finance_managers_members_update"
on public.finance_managers
for update
using (public.has_store_access(store_id))
with check (public.has_store_access(store_id));

-- ===========================
-- DEPARTMENT GOALS (live table)
-- ===========================

alter table public.department_goals enable row level security;

drop policy if exists "department_goals_platform_admin_all" on public.department_goals;
create policy "department_goals_platform_admin_all"
on public.department_goals
for all
using (public.is_platform_admin())
with check (public.is_platform_admin());

drop policy if exists "department_goals_members_select" on public.department_goals;
create policy "department_goals_members_select"
on public.department_goals
for select
using (
  exists (
    select 1
    from public.departments d
    where d.id = department_goals.department_id
      and public.has_store_access(d.store_id)
  )
);

drop policy if exists "department_goals_members_insert" on public.department_goals;
create policy "department_goals_members_insert"
on public.department_goals
for insert
with check (
  exists (
    select 1
    from public.departments d
    where d.id = department_goals.department_id
      and public.has_store_access(d.store_id)
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
      and public.has_store_access(d.store_id)
  )
)
with check (
  exists (
    select 1
    from public.departments d
    where d.id = department_goals.department_id
      and public.has_store_access(d.store_id)
  )
);

-- ===========================
-- STORE CALENDAR
-- ===========================

drop policy if exists "store_calendar_group_members_select" on public.store_calendar_days;
create policy "store_calendar_group_members_select"
on public.store_calendar_days
for select
using (public.has_store_access(store_id));

drop policy if exists "store_calendar_members_insert" on public.store_calendar_days;
create policy "store_calendar_members_insert"
on public.store_calendar_days
for insert
with check (public.has_store_access(store_id));

drop policy if exists "store_calendar_members_update" on public.store_calendar_days;
create policy "store_calendar_members_update"
on public.store_calendar_days
for update
using (public.has_store_access(store_id))
with check (public.has_store_access(store_id));

-- ===========================
-- DEALS
-- ===========================

drop policy if exists "deals_group_members_select" on public.deals;
create policy "deals_group_members_select"
on public.deals
for select
using (public.has_store_access(store_id));

drop policy if exists "deals_group_members_insert" on public.deals;
create policy "deals_group_members_insert"
on public.deals
for insert
with check (public.has_store_access(store_id));

drop policy if exists "deals_group_members_update" on public.deals;
create policy "deals_group_members_update"
on public.deals
for update
using (public.has_store_access(store_id))
with check (public.has_store_access(store_id));

-- ===========================
-- DEAL SALESPEOPLE / TRADES / NOTES (via parent deal store)
-- ===========================

drop policy if exists "deal_salespeople_group_members_select" on public.deal_salespeople;
create policy "deal_salespeople_group_members_select"
on public.deal_salespeople
for select
using (
  exists (
    select 1 from public.deals d
    where d.id = deal_salespeople.deal_id
      and public.has_store_access(d.store_id)
  )
);

drop policy if exists "deal_salespeople_group_members_insert" on public.deal_salespeople;
create policy "deal_salespeople_group_members_insert"
on public.deal_salespeople
for insert
with check (
  exists (
    select 1 from public.deals d
    where d.id = deal_salespeople.deal_id
      and public.has_store_access(d.store_id)
  )
);

drop policy if exists "deal_salespeople_group_members_update" on public.deal_salespeople;
create policy "deal_salespeople_group_members_update"
on public.deal_salespeople
for update
using (
  exists (
    select 1 from public.deals d
    where d.id = deal_salespeople.deal_id
      and public.has_store_access(d.store_id)
  )
)
with check (
  exists (
    select 1 from public.deals d
    where d.id = deal_salespeople.deal_id
      and public.has_store_access(d.store_id)
  )
);

drop policy if exists "deal_salespeople_group_members_delete" on public.deal_salespeople;
create policy "deal_salespeople_group_members_delete"
on public.deal_salespeople
for delete
using (
  exists (
    select 1 from public.deals d
    where d.id = deal_salespeople.deal_id
      and public.has_store_access(d.store_id)
  )
);

drop policy if exists "trades_group_members_select" on public.trades;
create policy "trades_group_members_select"
on public.trades
for select
using (
  exists (
    select 1 from public.deals d
    where d.id = trades.deal_id
      and public.has_store_access(d.store_id)
  )
);

drop policy if exists "trades_group_members_insert" on public.trades;
create policy "trades_group_members_insert"
on public.trades
for insert
with check (
  exists (
    select 1 from public.deals d
    where d.id = trades.deal_id
      and public.has_store_access(d.store_id)
  )
);

drop policy if exists "trades_group_members_update" on public.trades;
create policy "trades_group_members_update"
on public.trades
for update
using (
  exists (
    select 1 from public.deals d
    where d.id = trades.deal_id
      and public.has_store_access(d.store_id)
  )
)
with check (
  exists (
    select 1 from public.deals d
    where d.id = trades.deal_id
      and public.has_store_access(d.store_id)
  )
);

drop policy if exists "trades_group_members_delete" on public.trades;
create policy "trades_group_members_delete"
on public.trades
for delete
using (
  exists (
    select 1 from public.deals d
    where d.id = trades.deal_id
      and public.has_store_access(d.store_id)
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
      and public.has_store_access(d.store_id)
  )
);

drop policy if exists "deal_notes_group_members_insert" on public.deal_notes;
create policy "deal_notes_group_members_insert"
on public.deal_notes
for insert
with check (
  exists (
    select 1 from public.deals d
    where d.id = deal_notes.deal_id
      and public.has_store_access(d.store_id)
  )
);
