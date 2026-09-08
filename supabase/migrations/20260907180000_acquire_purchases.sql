-- Acquire addon: purchase pipeline + performance (separate from Inventory Command DH Purchases).

alter table public.dealer_groups
  add column if not exists acquire_enabled boolean not null default false;

comment on column public.dealer_groups.acquire_enabled is
  'Addon flag: unlocks Acquire (Purchases + Performance) for the dealer group.';

update public.dealer_groups
set acquire_enabled = true
where name = 'Jim Butler Auto Group';

do $$
begin
  if not exists (select 1 from pg_type where typname = 'acq_purchase_stage') then
    create type public.acq_purchase_stage as enum (
      'in_transit',
      'need_to_stock_in',
      'recon',
      'frontline',
      'pending_sale',
      'sold',
      'wholesale',
      'arbitration'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'acq_source_type') then
    create type public.acq_source_type as enum (
      'auction',
      'rental',
      'private',
      'dealer',
      'other'
    );
  end if;
end $$;

create table if not exists public.acq_purchases (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  dealer_group_id uuid not null references public.dealer_groups(id) on delete cascade,

  stage public.acq_purchase_stage not null default 'in_transit',
  is_incoming boolean not null default true,

  -- Identity (partial OK while incoming)
  stock_number text,
  vin text,
  vehicle_year integer,
  vehicle_make text,
  vehicle_model text,
  vehicle_trim text,
  color text,
  odometer integer,

  -- Acquisition
  source_type public.acq_source_type not null default 'other',
  auction_house text,
  seller_name text,
  sale_channel text,
  cr_grade text,
  cr_link text,
  carfax_status text,
  carfax_link text,
  purchase_date date,

  -- Cost stack (manual)
  purchase_price numeric(12,2),
  auction_fees numeric(12,2),
  transport_cost numeric(12,2),
  recon_cost numeric(12,2),
  pack_amount numeric(12,2),

  -- Books at purchase (manual, never overwritten by inventory)
  purchase_mmr numeric(12,2),
  purchase_jd numeric(12,2),

  -- Live overlay from inventory (writable only by sync / platform)
  live_matched boolean not null default false,
  live_cost numeric(12,2),
  live_mmr numeric(12,2),
  live_jd numeric(12,2),
  live_price numeric(12,2),
  live_pom numeric(8,2),
  live_srp integer,
  live_vdp integer,
  live_photo_count integer,
  live_age integer,
  live_synced_at timestamptz,

  -- Frozen books when unit leaves inventory
  frozen_mmr numeric(12,2),
  frozen_jd numeric(12,2),
  frozen_at timestamptz,

  -- Manual exit economics (admin only; never auto-copied from deals)
  sold_date date,
  sold_price numeric(12,2),
  front_gross numeric(12,2),
  back_gross numeric(12,2),
  total_gross numeric(12,2),
  wholesale_price numeric(12,2),
  arb_reason text,
  arb_outcome text,
  arb_resolved_at timestamptz,

  notes text,

  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists acq_purchases_store_id_idx on public.acq_purchases(store_id);
create index if not exists acq_purchases_dealer_group_id_idx on public.acq_purchases(dealer_group_id);
create index if not exists acq_purchases_stage_idx on public.acq_purchases(stage);
create index if not exists acq_purchases_stock_number_idx on public.acq_purchases(store_id, stock_number);
create index if not exists acq_purchases_vin_idx on public.acq_purchases(store_id, vin);

create table if not exists public.acq_stage_events (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references public.acq_purchases(id) on delete cascade,
  from_stage public.acq_purchase_stage,
  to_stage public.acq_purchase_stage not null,
  actor_profile_id uuid references public.profiles(id),
  note text,
  created_at timestamptz not null default now()
);

create index if not exists acq_stage_events_purchase_id_idx
  on public.acq_stage_events(purchase_id);

alter table public.acq_purchases enable row level security;
alter table public.acq_stage_events enable row level security;

-- Reads: any user with store access
drop policy if exists acq_purchases_select on public.acq_purchases;
create policy acq_purchases_select
  on public.acq_purchases for select
  using (store_id in (select public.accessible_store_ids()));

-- Writes: platform staff only (V1 admin-only editing)
drop policy if exists acq_purchases_platform_write on public.acq_purchases;
create policy acq_purchases_platform_write
  on public.acq_purchases for all
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

drop policy if exists acq_stage_events_select on public.acq_stage_events;
create policy acq_stage_events_select
  on public.acq_stage_events for select
  using (
    exists (
      select 1 from public.acq_purchases p
      where p.id = acq_stage_events.purchase_id
        and p.store_id in (select public.accessible_store_ids())
    )
  );

drop policy if exists acq_stage_events_platform_write on public.acq_stage_events;
create policy acq_stage_events_platform_write
  on public.acq_stage_events for all
  using (public.is_platform_admin())
  with check (public.is_platform_admin());
