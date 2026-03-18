-- Data Freaks Supabase schema
-- Run this in your Supabase SQL editor or as an initial migration.

-- ===========================
-- ENUMS
-- ===========================

do $$
begin
  if not exists (select 1 from pg_type where typname = 'plan_tier') then
    create type plan_tier as enum ('free', 'paid', 'premium');
  end if;
end$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'dealer_group_status') then
    create type dealer_group_status as enum (
      'pending',
      'active',
      'suspended',
      'disabled',
      'rejected'
    );
  end if;
end$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'user_status') then
    create type user_status as enum ('invited', 'active', 'disabled');
  end if;
end$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'app_role') then
    create type app_role as enum ('platform_admin', 'group_admin', 'store_admin');
  end if;
end$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'deal_status') then
    create type deal_status as enum ('pending', 'delivered', 'closed', 'dead', 'unwound');
  end if;
end$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'finance_type') then
    create type finance_type as enum ('prime', 'subprime', 'cash');
  end if;
end$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'trade_status') then
    create type trade_status as enum ('no_trade', 'has_trade');
  end if;
end$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'trade_exit_strategy') then
    create type trade_exit_strategy as enum ('wholesale', 'retail', 'auction', 'other');
  end if;
end$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'audit_event_type') then
    create type audit_event_type as enum (
      'deal_created',
      'deal_updated',
      'deal_status_changed',
      'trade_added',
      'trade_updated',
      'note_added',
      'impersonation_started',
      'impersonation_ended'
    );
  end if;
end$$;

-- ===========================
-- HELPERS
-- ===========================

create or replace function public.current_profile_id()
returns uuid
language sql
security definer
set search_path = public
as $$
  select id from public.profiles where user_id = auth.uid();
$$;

create or replace function public.is_platform_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where user_id = auth.uid()
      and role = 'platform_admin'
      and status = 'active'
  );
$$;

-- ===========================
-- PROFILES / USERS
-- ===========================

create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  email text not null,
  first_name text,
  last_name text,
  role app_role not null default 'store_admin',
  dealer_group_id uuid references public.dealer_groups(id),
  status user_status not null default 'active',
  is_impersonating boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index profiles_user_id_idx on public.profiles(user_id);
create index profiles_dealer_group_id_idx on public.profiles(dealer_group_id);

-- ===========================
-- DEALER GROUPS / REQUESTS
-- ===========================

create table public.dealer_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  website text,
  plan plan_tier not null default 'free',
  status dealer_group_status not null default 'pending',
  number_of_stores integer,
  is_demo boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index dealer_groups_plan_idx on public.dealer_groups(plan);
create index dealer_groups_status_idx on public.dealer_groups(status);

create table public.dealer_group_requests (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  last_name text not null,
  email text not null,
  phone text,
  dealer_group_name text not null,
  title text,
  number_of_stores integer,
  website text,
  requested_user_id uuid references auth.users(id),
  status dealer_group_status not null default 'pending',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index dealer_group_requests_status_idx on public.dealer_group_requests(status);
create index dealer_group_requests_email_idx on public.dealer_group_requests(email);

-- ===========================
-- STORES / DEPARTMENTS / ACCESS
-- ===========================

create table public.stores (
  id uuid primary key default gen_random_uuid(),
  dealer_group_id uuid not null references public.dealer_groups(id) on delete cascade,
  name text not null,
  code text,
  is_active boolean not null default true,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index stores_dealer_group_id_idx on public.stores(dealer_group_id);

create table public.departments (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  name text not null,
  is_active boolean not null default true,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index departments_store_id_idx on public.departments(store_id);

create table public.user_store_access (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  role app_role not null default 'store_admin',
  is_primary boolean not null default false,
  created_at timestamptz not null default now()
);

create unique index user_store_access_unique
  on public.user_store_access(profile_id, store_id);

-- ===========================
-- SALESPEOPLE / SOURCES
-- ===========================

create table public.salespeople (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  first_name text not null,
  last_name text not null,
  is_active boolean not null default true,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index salespeople_store_id_idx on public.salespeople(store_id);

create table public.acquisition_sources (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  name text not null,
  is_active boolean not null default true,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index acquisition_sources_store_id_idx on public.acquisition_sources(store_id);

-- ===========================
-- CONFIGURATION
-- ===========================

create table public.tracked_field_settings (
  id uuid primary key default gen_random_uuid(),
  dealer_group_id uuid not null references public.dealer_groups(id) on delete cascade,
  field_key text not null,
  is_enabled boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index tracked_field_settings_unique
  on public.tracked_field_settings(dealer_group_id, field_key);

create table public.price_bands (
  id uuid primary key default gen_random_uuid(),
  dealer_group_id uuid not null references public.dealer_groups(id) on delete cascade,
  name text not null,
  min_price integer,
  max_price integer,
  created_at timestamptz not null default now()
);

create index price_bands_dealer_group_id_idx on public.price_bands(dealer_group_id);

create table public.store_calendar_days (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  calendar_date date not null,
  is_working_day boolean not null default false,
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);

create unique index store_calendar_days_unique
  on public.store_calendar_days(store_id, calendar_date);

-- ===========================
-- DEALS / TRADES / NOTES
-- ===========================

create table public.deals (
  id uuid primary key default gen_random_uuid(),
  dealer_group_id uuid not null references public.dealer_groups(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  department_id uuid not null references public.departments(id),

  status deal_status not null default 'pending',
  trade_status trade_status not null default 'no_trade',
  finance finance_type,

  customer_last_name text not null,
  sale_date date not null,
  stock_number text not null,
  vehicle_year integer not null,
  vehicle_make text not null,
  vehicle_model text not null,
  vin text,
  trim text,
  color text,
  acquisition_source_id uuid references public.acquisition_sources(id),
  front_profit numeric(12,2),
  back_profit numeric(12,2),
  sale_price numeric(12,2),
  odometer integer,
  age integer,
  drivetrain text,
  body_style text,

  is_demo boolean not null default false,
  is_active boolean not null default true,

  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index deals_store_id_idx on public.deals(store_id);
create index deals_dealer_group_id_idx on public.deals(dealer_group_id);
create index deals_status_idx on public.deals(status);
create unique index deals_store_stock_unique on public.deals(store_id, stock_number);

create table public.deal_salespeople (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals(id) on delete cascade,
  salesperson_id uuid not null references public.salespeople(id),
  share_percent numeric(5,2) not null default 50
);

create index deal_salespeople_deal_id_idx on public.deal_salespeople(deal_id);
create index deal_salespeople_salesperson_id_idx on public.deal_salespeople(salesperson_id);

create table public.trades (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals(id) on delete cascade,
  trade_stock_number text not null,
  trade_year integer not null,
  trade_make text not null,
  trade_model text not null,
  trade_acv numeric(12,2) not null,
  trade_allowance numeric(12,2) not null,
  exit_strategy trade_exit_strategy not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index trades_deal_id_idx on public.trades(deal_id);

create table public.deal_notes (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals(id) on delete cascade,
  author_id uuid not null references public.profiles(id),
  body text not null,
  created_at timestamptz not null default now()
);

create index deal_notes_deal_id_idx on public.deal_notes(deal_id);

-- ===========================
-- AUDIT LOGS
-- ===========================

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id),
  actor_profile_id uuid references public.profiles(id),
  dealer_group_id uuid references public.dealer_groups(id),
  store_id uuid references public.stores(id),
  entity_type text not null,
  entity_id uuid not null,
  event_type audit_event_type not null,
  old_values jsonb,
  new_values jsonb,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index audit_logs_entity_idx on public.audit_logs(entity_type, entity_id);
create index audit_logs_dealer_group_id_idx on public.audit_logs(dealer_group_id);

-- ===========================
-- RLS POLICIES
-- ===========================

alter table public.profiles enable row level security;
alter table public.dealer_groups enable row level security;
alter table public.dealer_group_requests enable row level security;
alter table public.stores enable row level security;
alter table public.departments enable row level security;
alter table public.user_store_access enable row level security;
alter table public.salespeople enable row level security;
alter table public.acquisition_sources enable row level security;
alter table public.tracked_field_settings enable row level security;
alter table public.price_bands enable row level security;
alter table public.store_calendar_days enable row level security;
alter table public.deals enable row level security;
alter table public.deal_salespeople enable row level security;
alter table public.trades enable row level security;
alter table public.deal_notes enable row level security;
alter table public.audit_logs enable row level security;

-- Profiles: users see only their profile; platform admins see all.

create policy "profiles_select_own_or_admin"
on public.profiles
for select
using (
  is_platform_admin()
  or user_id = auth.uid()
);

create policy "profiles_update_self"
on public.profiles
for update
using (user_id = auth.uid());

-- Dealer groups: platform admins see all; members see their group.

create policy "dealer_groups_platform_admin_all"
on public.dealer_groups
for all
using (is_platform_admin());

create policy "dealer_groups_group_members_select"
on public.dealer_groups
for select
using (
  exists (
    select 1 from public.profiles p
    where p.dealer_group_id = dealer_groups.id
      and p.user_id = auth.uid()
      and p.status = 'active'
  )
);

-- Dealer group requests:
--  - public (anon) can insert requests
--  - platform admins can see/manage all
--  - authenticated requesters can see their own

create policy "dealer_group_requests_public_insert"
on public.dealer_group_requests
for insert
with check (true);

create policy "dealer_group_requests_platform_admin_all"
on public.dealer_group_requests
for all
using (is_platform_admin());

create policy "dealer_group_requests_requester_select"
on public.dealer_group_requests
for select
using (
  requested_user_id = auth.uid()
  or email = auth.email()
);

-- Stores, departments, salespeople, acquisition sources, config, calendar:
-- platform admins: full; group/store members: limited; anon: demo only.

create policy "stores_platform_admin_all"
on public.stores
for all
using (is_platform_admin());

create policy "stores_group_members_select"
on public.stores
for select
using (
  exists (
    select 1 from public.profiles p
    where p.dealer_group_id = stores.dealer_group_id
      and p.user_id = auth.uid()
      and p.status = 'active'
  )
);

create policy "stores_demo_public_select"
on public.stores
for select
using (is_demo = true and auth.role() = 'anon');

create policy "departments_platform_admin_all"
on public.departments
for all
using (is_platform_admin());

create policy "departments_group_members_select"
on public.departments
for select
using (
  exists (
    select 1
    from public.stores s
    join public.profiles p on p.dealer_group_id = s.dealer_group_id
    where departments.store_id = s.id
      and p.user_id = auth.uid()
      and p.status = 'active'
  )
);

create policy "departments_demo_public_select"
on public.departments
for select
using (is_demo = true and auth.role() = 'anon');

create policy "salespeople_platform_admin_all"
on public.salespeople
for all
using (is_platform_admin());

create policy "salespeople_group_members_select"
on public.salespeople
for select
using (
  exists (
    select 1
    from public.stores s
    join public.profiles p on p.dealer_group_id = s.dealer_group_id
    where salespeople.store_id = s.id
      and p.user_id = auth.uid()
      and p.status = 'active'
  )
);

create policy "salespeople_demo_public_select"
on public.salespeople
for select
using (is_demo = true and auth.role() = 'anon');

create policy "acquisition_sources_platform_admin_all"
on public.acquisition_sources
for all
using (is_platform_admin());

create policy "acquisition_sources_group_members_select"
on public.acquisition_sources
for select
using (
  exists (
    select 1
    from public.stores s
    join public.profiles p on p.dealer_group_id = s.dealer_group_id
    where acquisition_sources.store_id = s.id
      and p.user_id = auth.uid()
      and p.status = 'active'
  )
);

create policy "acquisition_sources_demo_public_select"
on public.acquisition_sources
for select
using (is_demo = true and auth.role() = 'anon');

create policy "config_platform_admin_all"
on public.tracked_field_settings
for all
using (is_platform_admin());

create policy "config_group_members_select"
on public.tracked_field_settings
for select
using (
  exists (
    select 1 from public.profiles p
    where p.dealer_group_id = tracked_field_settings.dealer_group_id
      and p.user_id = auth.uid()
      and p.status = 'active'
  )
);

create policy "price_bands_platform_admin_all"
on public.price_bands
for all
using (is_platform_admin());

create policy "price_bands_group_members_select"
on public.price_bands
for select
using (
  exists (
    select 1 from public.profiles p
    where p.dealer_group_id = price_bands.dealer_group_id
      and p.user_id = auth.uid()
      and p.status = 'active'
  )
);

create policy "store_calendar_platform_admin_all"
on public.store_calendar_days
for all
using (is_platform_admin());

create policy "store_calendar_group_members_select"
on public.store_calendar_days
for select
using (
  exists (
    select 1
    from public.stores s
    join public.profiles p on p.dealer_group_id = s.dealer_group_id
    where store_calendar_days.store_id = s.id
      and p.user_id = auth.uid()
      and p.status = 'active'
  )
);

create policy "store_calendar_demo_public_select"
on public.store_calendar_days
for select
using (is_demo = true and auth.role() = 'anon');

-- Deals and related: platform admins full; group/store members limited; anon demo only.

create policy "deals_platform_admin_all"
on public.deals
for all
using (is_platform_admin());

create policy "deals_group_members_select"
on public.deals
for select
using (
  exists (
    select 1 from public.profiles p
    where p.dealer_group_id = deals.dealer_group_id
      and p.user_id = auth.uid()
      and p.status = 'active'
  )
);

drop policy if exists "deals_group_members_modify" on public.deals;
drop policy if exists "deals_group_members_insert" on public.deals;
drop policy if exists "deals_group_members_update" on public.deals;

create policy "deals_group_members_insert"
on public.deals
for insert
with check (
  exists (
    select 1 from public.profiles p
    where p.dealer_group_id = deals.dealer_group_id
      and p.user_id = auth.uid()
      and p.status = 'active'
  )
);

create policy "deals_group_members_update"
on public.deals
for update
using (
  exists (
    select 1 from public.profiles p
    where p.dealer_group_id = deals.dealer_group_id
      and p.user_id = auth.uid()
      and p.status = 'active'
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.dealer_group_id = deals.dealer_group_id
      and p.user_id = auth.uid()
      and p.status = 'active'
  )
);

create policy "deals_demo_public_select"
on public.deals
for select
using (is_demo = true and auth.role() = 'anon');

create policy "deal_salespeople_platform_admin_all"
on public.deal_salespeople
for all
using (is_platform_admin());

create policy "deal_salespeople_group_members_select"
on public.deal_salespeople
for select
using (
  exists (
    select 1 from public.deals d
    join public.profiles p on p.dealer_group_id = d.dealer_group_id
    where deal_salespeople.deal_id = d.id
      and p.user_id = auth.uid()
      and p.status = 'active'
  )
);

drop policy if exists "deal_salespeople_group_members_modify" on public.deal_salespeople;
drop policy if exists "deal_salespeople_group_members_insert" on public.deal_salespeople;
drop policy if exists "deal_salespeople_group_members_update" on public.deal_salespeople;
drop policy if exists "deal_salespeople_group_members_delete" on public.deal_salespeople;

create policy "deal_salespeople_group_members_insert"
on public.deal_salespeople
for insert
with check (
  exists (
    select 1 from public.deals d
    join public.profiles p on p.dealer_group_id = d.dealer_group_id
    where deal_salespeople.deal_id = d.id
      and p.user_id = auth.uid()
      and p.status = 'active'
  )
);

create policy "deal_salespeople_group_members_update"
on public.deal_salespeople
for update
using (
  exists (
    select 1 from public.deals d
    join public.profiles p on p.dealer_group_id = d.dealer_group_id
    where deal_salespeople.deal_id = d.id
      and p.user_id = auth.uid()
      and p.status = 'active'
  )
)
with check (
  exists (
    select 1 from public.deals d
    join public.profiles p on p.dealer_group_id = d.dealer_group_id
    where deal_salespeople.deal_id = d.id
      and p.user_id = auth.uid()
      and p.status = 'active'
  )
);

create policy "deal_salespeople_group_members_delete"
on public.deal_salespeople
for delete
using (
  exists (
    select 1 from public.deals d
    join public.profiles p on p.dealer_group_id = d.dealer_group_id
    where deal_salespeople.deal_id = d.id
      and p.user_id = auth.uid()
      and p.status = 'active'
  )
);

create policy "deal_salespeople_demo_public_select"
on public.deal_salespeople
for select
using (
  exists (
    select 1 from public.deals d
    where d.id = deal_salespeople.deal_id
      and d.is_demo = true
  )
  and auth.role() = 'anon'
);

create policy "trades_platform_admin_all"
on public.trades
for all
using (is_platform_admin());

create policy "trades_group_members_select"
on public.trades
for select
using (
  exists (
    select 1 from public.deals d
    join public.profiles p on p.dealer_group_id = d.dealer_group_id
    where trades.deal_id = d.id
      and p.user_id = auth.uid()
      and p.status = 'active'
  )
);

drop policy if exists "trades_group_members_modify" on public.trades;
drop policy if exists "trades_group_members_insert" on public.trades;
drop policy if exists "trades_group_members_update" on public.trades;
drop policy if exists "trades_group_members_delete" on public.trades;

create policy "trades_group_members_insert"
on public.trades
for insert
with check (
  exists (
    select 1 from public.deals d
    join public.profiles p on p.dealer_group_id = d.dealer_group_id
    where trades.deal_id = d.id
      and p.user_id = auth.uid()
      and p.status = 'active'
  )
);

create policy "trades_group_members_update"
on public.trades
for update
using (
  exists (
    select 1 from public.deals d
    join public.profiles p on p.dealer_group_id = d.dealer_group_id
    where trades.deal_id = d.id
      and p.user_id = auth.uid()
      and p.status = 'active'
  )
)
with check (
  exists (
    select 1 from public.deals d
    join public.profiles p on p.dealer_group_id = d.dealer_group_id
    where trades.deal_id = d.id
      and p.user_id = auth.uid()
      and p.status = 'active'
  )
);

create policy "trades_group_members_delete"
on public.trades
for delete
using (
  exists (
    select 1 from public.deals d
    join public.profiles p on p.dealer_group_id = d.dealer_group_id
    where trades.deal_id = d.id
      and p.user_id = auth.uid()
      and p.status = 'active'
  )
);

create policy "trades_demo_public_select"
on public.trades
for select
using (
  exists (
    select 1 from public.deals d
    where d.id = trades.deal_id
      and d.is_demo = true
  )
  and auth.role() = 'anon'
);

create policy "deal_notes_platform_admin_all"
on public.deal_notes
for all
using (is_platform_admin());

create policy "deal_notes_group_members_select"
on public.deal_notes
for select
using (
  exists (
    select 1 from public.deals d
    join public.profiles p on p.dealer_group_id = d.dealer_group_id
    where deal_notes.deal_id = d.id
      and p.user_id = auth.uid()
      and p.status = 'active'
  )
);

create policy "deal_notes_group_members_insert"
on public.deal_notes
for insert
with check (
  exists (
    select 1 from public.deals d
    join public.profiles p on p.dealer_group_id = d.dealer_group_id
    where deal_notes.deal_id = d.id
      and p.user_id = auth.uid()
      and p.status = 'active'
  )
);

create policy "deal_notes_demo_public_select"
on public.deal_notes
for select
using (
  exists (
    select 1 from public.deals d
    where d.id = deal_notes.deal_id
      and d.is_demo = true
  )
  and auth.role() = 'anon'
);

create policy "audit_logs_platform_admin_all"
on public.audit_logs
for all
using (is_platform_admin());

-- ===========================
-- DEMO SEED PLACEHOLDERS
-- ===========================
-- Add concrete demo seed data in demo_seed.sql.

