-- Inventory Command "Inventory" tab:
--   * inv_acq_tags: manual acquisition source per (store, stock #). Manual tags persist across
--     daily uploads and after the unit sells; auto tags are derived from the stock # in the app.
--   * inv_units: keep every column from the vAuto Merchandising export (raw) and promote the
--     fields the Inventory tab shows (VIN, Y/M/M/T, odometer, cost-to-market, Black Book, etc.).

create table if not exists public.inv_acq_tags (
  store_id uuid not null references public.stores(id) on delete cascade,
  stk text not null,
  source text not null,
  set_by uuid references auth.users(id) on delete set null,
  set_at timestamptz not null default now(),
  primary key (store_id, stk)
);

comment on table public.inv_acq_tags is
  'Manual acquisition source per store + stock #. Overrides the stock-number rule forever until changed.';

alter table public.inv_acq_tags enable row level security;

drop policy if exists inv_acq_tags_select on public.inv_acq_tags;
create policy inv_acq_tags_select
  on public.inv_acq_tags for select
  using (public.has_store_access(store_id));

drop policy if exists inv_acq_tags_platform_write on public.inv_acq_tags;
create policy inv_acq_tags_platform_write
  on public.inv_acq_tags for all
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

revoke all on table public.inv_acq_tags from PUBLIC;
revoke all on table public.inv_acq_tags from anon;
grant select, insert, update, delete on table public.inv_acq_tags to authenticated;
grant all on table public.inv_acq_tags to service_role;

alter table public.inv_units
  add column if not exists vin text,
  add column if not exists year int,
  add column if not exists make text,
  add column if not exists model text,
  add column if not exists trim text,
  add column if not exists odometer int,
  add column if not exists ctm_pct numeric,
  add column if not exists pt_align text,
  add column if not exists markup numeric,
  add column if not exists site_srp int,
  add column if not exists site_vdp int,
  add column if not exists bb_retail numeric,
  add column if not exists market_price numeric,
  add column if not exists raw jsonb;

comment on column public.inv_units.ctm_pct is 'vAuto Adj Cost to Market, as a percent (85 = 85%).';
comment on column public.inv_units.site_srp is 'Dealer website (eProcess) SRP; srp/vdp stay AutoTrader + Cars.com.';
comment on column public.inv_units.market_price is 'Derived: price / (pom / 100).';
comment on column public.inv_units.raw is 'Full export row keyed by header text.';
