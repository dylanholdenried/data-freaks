-- Acquire field model rebuild: buyers, recon/merch/exit/trade fields, exit strategies as text.

create table if not exists public.acq_buyers (
  id uuid primary key default gen_random_uuid(),
  dealer_group_id uuid not null references public.dealer_groups(id) on delete cascade,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists acq_buyers_dealer_group_id_idx on public.acq_buyers(dealer_group_id);

alter table public.acq_buyers enable row level security;

drop policy if exists acq_buyers_select on public.acq_buyers;
create policy acq_buyers_select
  on public.acq_buyers for select
  using (
    public.is_platform_admin()
    or exists (
      select 1 from public.profiles p
      where p.user_id = auth.uid()
        and p.status = 'active'
        and p.dealer_group_id = acq_buyers.dealer_group_id
    )
  );

drop policy if exists acq_buyers_platform_write on public.acq_buyers;
create policy acq_buyers_platform_write
  on public.acq_buyers for all
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

-- Group admins can also manage buyers (setup page)
drop policy if exists acq_buyers_group_admin_write on public.acq_buyers;
create policy acq_buyers_group_admin_write
  on public.acq_buyers for all
  using (
    exists (
      select 1 from public.profiles p
      where p.user_id = auth.uid()
        and p.status = 'active'
        and p.role in ('group_admin', 'store_admin')
        and p.dealer_group_id = acq_buyers.dealer_group_id
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.user_id = auth.uid()
        and p.status = 'active'
        and p.role in ('group_admin', 'store_admin')
        and p.dealer_group_id = acq_buyers.dealer_group_id
    )
  );

do $$
begin
  if not exists (
    select 1 from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    where t.typname = 'acq_source_type' and e.enumlabel = 'wholesaler'
  ) then
    alter type public.acq_source_type add value 'wholesaler';
  end if;
end $$;

-- Exit strategy: convert enum → text for flexible values
alter table public.acq_purchases
  alter column exit_strategy type text using exit_strategy::text;

update public.acq_purchases set exit_strategy = 'prime' where exit_strategy = 'retail';
update public.acq_purchases set exit_strategy = 'wholesale' where exit_strategy = 'wholesale_sold';

alter table public.acq_purchases drop constraint if exists acq_purchases_exit_strategy_check;
alter table public.acq_purchases
  add constraint acq_purchases_exit_strategy_check
  check (
    exit_strategy is null
    or exit_strategy in (
      'prime', 'subprime', 'cash', 'wholesale', 'internal_transfer', 'arbitrated',
      -- legacy leftovers until cleaned
      'retail', 'wholesale_sold'
    )
  );

alter table public.acq_purchases
  add column if not exists buyer_id uuid references public.acq_buyers(id) on delete set null,
  add column if not exists recon_estimate numeric(12,2),
  add column if not exists delivery_date date,
  add column if not exists recon_description_done boolean not null default false,
  add column if not exists recon_merchandising_done boolean not null default false,
  add column if not exists recon_frontline_done boolean not null default false,
  add column if not exists frontline_date date,
  add column if not exists website_price numeric(12,2),
  add column if not exists next_store_profit numeric(12,2),
  add column if not exists has_trade boolean not null default false,
  add column if not exists trade_stock_number text,
  add column if not exists trade_vin text,
  add column if not exists trade_year integer,
  add column if not exists trade_make text,
  add column if not exists trade_model text,
  add column if not exists trade_acv numeric(12,2),
  add column if not exists trade_allowance numeric(12,2);

-- Rename semantic: recon_cost stays as actual recon cost
comment on column public.acq_purchases.recon_cost is 'Actual reconditioning cost';
comment on column public.acq_purchases.recon_estimate is 'Estimated recon at purchase';
comment on column public.acq_purchases.seller_name is 'Auction house / seller free text';
