-- Retail store for internal transfers, and admin-only reported payable economics.
-- Reported numbers live on their own table so store and group users cannot read them
-- through row access on acq_purchases.

alter table public.acq_purchases
  add column if not exists retail_store_id uuid references public.stores(id) on delete set null;

comment on column public.acq_purchases.retail_store_id is
  'Other store in the auto group that retailed an internal transfer. Next store gross is credited there.';

create index if not exists acq_purchases_retail_store_id_idx
  on public.acq_purchases (retail_store_id)
  where retail_store_id is not null;

create table if not exists public.acq_purchase_reported (
  purchase_id uuid primary key references public.acq_purchases(id) on delete cascade,
  reported_front_gross numeric(12,2),
  reported_back_gross numeric(12,2),
  pack_amount numeric(12,2),
  buy_fee numeric(12,2),
  updated_at timestamptz not null default now()
);

comment on table public.acq_purchase_reported is
  'Payable commission inputs. Platform admin and owner admin only.';

comment on column public.acq_purchase_reported.pack_amount is
  'Pack added into payable gross.';

comment on column public.acq_purchase_reported.buy_fee is
  'Buy fee added into payable gross.';

alter table public.acq_purchase_reported enable row level security;

drop policy if exists acq_purchase_reported_platform_all on public.acq_purchase_reported;
create policy acq_purchase_reported_platform_all
  on public.acq_purchase_reported
  for all
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

revoke all on table public.acq_purchase_reported from PUBLIC;
revoke all on table public.acq_purchase_reported from anon;
grant select, insert, update, delete on table public.acq_purchase_reported to authenticated;
grant all on table public.acq_purchase_reported to service_role;
