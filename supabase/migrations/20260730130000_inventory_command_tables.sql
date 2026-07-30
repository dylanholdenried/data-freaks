-- Inventory Command tables + RLS
-- Apply via Supabase MCP / SQL editor after review.
--
-- Semantics:
--   * One snapshot per (store_id, snapshot_date). Re-upload replaces the snapshot
--     (ON DELETE CASCADE clears inv_units); app recomputes metrics/movements/price_actions.
--   * SELECT: has_store_access(store_id)
--   * INSERT/UPDATE/DELETE: is_platform_admin()
--   * ttl_fail is NOT derivable from vAuto Merchandising export — nullable for a later feed.

-- ---------------------------------------------------------------------------
-- inv_snapshots
-- ---------------------------------------------------------------------------
create table if not exists public.inv_snapshots (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  snapshot_date date not null,
  source_filename text,
  row_count int,
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (store_id, snapshot_date)
);

create index if not exists inv_snapshots_store_date_idx
  on public.inv_snapshots (store_id, snapshot_date desc);

-- ---------------------------------------------------------------------------
-- inv_units
-- ---------------------------------------------------------------------------
create table if not exists public.inv_units (
  id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null references public.inv_snapshots(id) on delete cascade,
  stk text not null,
  veh text,
  body text,
  age int,
  ph int,
  cost numeric,
  price numeric,
  pom numeric,
  dsr int,
  srp int,
  vdp int,
  vr numeric,
  mmr numeric,
  jd numeric,
  pt text,
  disp text not null default 'retail',
  d_vdp numeric,
  d_srp numeric,
  d_p numeric,
  d_ph numeric,
  unique (snapshot_id, stk)
);

create index if not exists inv_units_snapshot_idx on public.inv_units (snapshot_id);
create index if not exists inv_units_stk_idx on public.inv_units (stk);
create index if not exists inv_units_disp_idx on public.inv_units (snapshot_id, disp);

-- ---------------------------------------------------------------------------
-- inv_daily_metrics
-- ---------------------------------------------------------------------------
create table if not exists public.inv_daily_metrics (
  store_id uuid not null references public.stores(id) on delete cascade,
  snapshot_date date not null,
  units int not null default 0,
  avg_age numeric,
  over60 int not null default 0,
  over90 int not null default 0,
  full_photos int not null default 0,
  no_ph int not null default 0,
  stale int not null default 0,
  no_price int not null default 0,
  hot int not null default 0,
  hot_cost numeric not null default 0,
  ttl_fail int,
  retail_count int not null default 0,
  subprime_count int not null default 0,
  primary key (store_id, snapshot_date)
);

create index if not exists inv_daily_metrics_store_date_idx
  on public.inv_daily_metrics (store_id, snapshot_date desc);

-- ---------------------------------------------------------------------------
-- inv_movements
-- ---------------------------------------------------------------------------
create table if not exists public.inv_movements (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  movement_date date not null,
  type text not null check (type in ('arrive', 'exit')),
  stk text not null,
  veh text,
  age int,
  cost numeric,
  created_at timestamptz not null default now()
);

create index if not exists inv_movements_store_date_idx
  on public.inv_movements (store_id, movement_date desc);

-- ---------------------------------------------------------------------------
-- inv_price_actions
-- ---------------------------------------------------------------------------
create table if not exists public.inv_price_actions (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  action_date date not null,
  stk text not null,
  veh text,
  age int,
  type text not null check (type in ('cut', 'raise')),
  price numeric,
  d_p numeric,
  created_at timestamptz not null default now()
);

create index if not exists inv_price_actions_store_date_idx
  on public.inv_price_actions (store_id, action_date desc);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.inv_snapshots enable row level security;
alter table public.inv_units enable row level security;
alter table public.inv_daily_metrics enable row level security;
alter table public.inv_movements enable row level security;
alter table public.inv_price_actions enable row level security;

-- inv_snapshots
drop policy if exists inv_snapshots_select on public.inv_snapshots;
create policy inv_snapshots_select
  on public.inv_snapshots for select
  using (public.has_store_access(store_id));

drop policy if exists inv_snapshots_platform_write on public.inv_snapshots;
create policy inv_snapshots_platform_write
  on public.inv_snapshots for all
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

-- inv_units (via snapshot → store)
drop policy if exists inv_units_select on public.inv_units;
create policy inv_units_select
  on public.inv_units for select
  using (
    exists (
      select 1 from public.inv_snapshots s
      where s.id = snapshot_id
        and public.has_store_access(s.store_id)
    )
  );

drop policy if exists inv_units_platform_write on public.inv_units;
create policy inv_units_platform_write
  on public.inv_units for all
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

-- inv_daily_metrics
drop policy if exists inv_daily_metrics_select on public.inv_daily_metrics;
create policy inv_daily_metrics_select
  on public.inv_daily_metrics for select
  using (public.has_store_access(store_id));

drop policy if exists inv_daily_metrics_platform_write on public.inv_daily_metrics;
create policy inv_daily_metrics_platform_write
  on public.inv_daily_metrics for all
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

-- inv_movements
drop policy if exists inv_movements_select on public.inv_movements;
create policy inv_movements_select
  on public.inv_movements for select
  using (public.has_store_access(store_id));

drop policy if exists inv_movements_platform_write on public.inv_movements;
create policy inv_movements_platform_write
  on public.inv_movements for all
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

-- inv_price_actions
drop policy if exists inv_price_actions_select on public.inv_price_actions;
create policy inv_price_actions_select
  on public.inv_price_actions for select
  using (public.has_store_access(store_id));

drop policy if exists inv_price_actions_platform_write on public.inv_price_actions;
create policy inv_price_actions_platform_write
  on public.inv_price_actions for all
  using (public.is_platform_admin())
  with check (public.is_platform_admin());
