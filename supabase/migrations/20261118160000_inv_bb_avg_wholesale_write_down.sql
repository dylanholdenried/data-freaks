-- Black Book Average Wholesale on inventory units + 2026 year-end write-down cohort tracking.
-- Manual BB overrides persist across daily uploads; cohort rows move to "sold" when a stock
-- number leaves the latest upload.

alter table public.inv_units
  add column if not exists bb_avg_wholesale numeric;

comment on column public.inv_units.bb_avg_wholesale is
  'Black Book Average Wholesale from the daily inventory upload.';

create table if not exists public.inv_write_down_cohort (
  store_id uuid not null references public.stores(id) on delete cascade,
  write_down_year int not null,
  stk text not null,
  vin text,
  veh_year int,
  make text,
  model text,
  age int,
  cost numeric,
  bb_avg_wholesale numeric,
  first_seen_date date not null,
  last_seen_date date not null,
  status text not null check (status in ('in_stock', 'sold')),
  sold_date date,
  updated_at timestamptz not null default now(),
  primary key (store_id, write_down_year, stk)
);

comment on table public.inv_write_down_cohort is
  'Year-end write-down watch list. Units that will be 60+ days old on Dec 31; sold when they leave inventory.';

create index if not exists inv_write_down_cohort_store_year_status_idx
  on public.inv_write_down_cohort (store_id, write_down_year, status);

create table if not exists public.inv_write_down_bb_manual (
  store_id uuid not null references public.stores(id) on delete cascade,
  write_down_year int not null,
  stk text not null,
  bb_avg_wholesale numeric not null,
  entered_on date not null,
  set_by uuid references auth.users(id) on delete set null,
  set_at timestamptz not null default now(),
  primary key (store_id, write_down_year, stk)
);

comment on table public.inv_write_down_bb_manual is
  'Manual Black Book Average Wholesale for write-down units missing a book value. Stays flagged with entered_on.';

alter table public.inv_write_down_cohort enable row level security;
alter table public.inv_write_down_bb_manual enable row level security;

drop policy if exists inv_write_down_cohort_select on public.inv_write_down_cohort;
create policy inv_write_down_cohort_select
  on public.inv_write_down_cohort for select
  using (public.has_store_access(store_id));

drop policy if exists inv_write_down_cohort_platform_write on public.inv_write_down_cohort;
create policy inv_write_down_cohort_platform_write
  on public.inv_write_down_cohort for all
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

drop policy if exists inv_write_down_bb_manual_select on public.inv_write_down_bb_manual;
create policy inv_write_down_bb_manual_select
  on public.inv_write_down_bb_manual for select
  using (public.has_store_access(store_id));

drop policy if exists inv_write_down_bb_manual_write on public.inv_write_down_bb_manual;
create policy inv_write_down_bb_manual_write
  on public.inv_write_down_bb_manual for all
  using (public.has_store_access(store_id))
  with check (public.has_store_access(store_id));

revoke all on table public.inv_write_down_cohort from PUBLIC;
revoke all on table public.inv_write_down_cohort from anon;
grant select, insert, update, delete on table public.inv_write_down_cohort to authenticated;
grant all on table public.inv_write_down_cohort to service_role;

revoke all on table public.inv_write_down_bb_manual from PUBLIC;
revoke all on table public.inv_write_down_bb_manual from anon;
grant select, insert, update, delete on table public.inv_write_down_bb_manual to authenticated;
grant all on table public.inv_write_down_bb_manual to service_role;
