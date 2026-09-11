-- Phase 0: per-store billing / trial fields (no Stripe).
-- dealer_groups.plan + acquire_enabled remain as derived caches from stores.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'billing_interval') then
    create type public.billing_interval as enum ('monthly', 'annual');
  end if;
end$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'billing_status') then
    create type public.billing_status as enum (
      'none',
      'trialing',
      'active',
      'past_due',
      'canceled'
    );
  end if;
end$$;

alter table public.stores
  add column if not exists plan public.plan_tier not null default 'log',
  add column if not exists acquire_enabled boolean not null default false,
  add column if not exists billing_interval public.billing_interval,
  add column if not exists billing_status public.billing_status not null default 'none',
  add column if not exists trial_ends_at timestamptz,
  add column if not exists current_period_end timestamptz,
  add column if not exists bulk_import_window_ends_at timestamptz,
  add column if not exists activation_fee_paid_at timestamptz,
  add column if not exists monthly_price_cents integer not null default 250000;

alter table public.stores
  drop constraint if exists stores_monthly_price_cents_check;

alter table public.stores
  add constraint stores_monthly_price_cents_check
  check (monthly_price_cents >= 0);

create index if not exists stores_plan_idx on public.stores (plan);
create index if not exists stores_billing_status_idx on public.stores (billing_status);
create index if not exists stores_acquire_enabled_idx on public.stores (acquire_enabled)
  where acquire_enabled = true;

-- Migrate advise → analyze at group level, then backfill stores from group plan.
update public.dealer_groups
set plan = 'analyze'::public.plan_tier
where plan = 'advise'::public.plan_tier;

update public.stores s
set
  plan = case
    when g.plan in ('analyze'::public.plan_tier, 'advise'::public.plan_tier)
      then 'analyze'::public.plan_tier
    else 'log'::public.plan_tier
  end,
  acquire_enabled = coalesce(g.acquire_enabled, false),
  billing_status = case
    when g.plan in ('analyze'::public.plan_tier, 'advise'::public.plan_tier)
      then 'active'::public.billing_status
    else 'none'::public.billing_status
  end,
  billing_interval = case
    when g.plan in ('analyze'::public.plan_tier, 'advise'::public.plan_tier)
      then 'monthly'::public.billing_interval
    else null
  end,
  updated_at = now()
from public.dealer_groups g
where s.dealer_group_id = g.id
  and s.plan = 'log'::public.plan_tier
  and s.billing_status = 'none'::public.billing_status;

-- Ensure no store remains on advise.
update public.stores
set plan = 'analyze'::public.plan_tier
where plan = 'advise'::public.plan_tier;

-- Recompute group caches from stores.
create or replace function public.sync_dealer_group_plan_cache(p_group_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan public.plan_tier;
  v_acquire boolean;
begin
  select
    case
      when bool_or(s.plan = 'analyze'::public.plan_tier) then 'analyze'::public.plan_tier
      else 'log'::public.plan_tier
    end,
    coalesce(bool_or(s.acquire_enabled), false)
  into v_plan, v_acquire
  from public.stores s
  where s.dealer_group_id = p_group_id
    and s.is_active = true;

  if v_plan is null then
    v_plan := 'log'::public.plan_tier;
  end if;
  if v_acquire is null then
    v_acquire := false;
  end if;

  update public.dealer_groups
  set
    plan = v_plan,
    acquire_enabled = v_acquire,
    updated_at = now()
  where id = p_group_id;
end;
$$;

revoke all on function public.sync_dealer_group_plan_cache(uuid) from public;
grant execute on function public.sync_dealer_group_plan_cache(uuid) to service_role;

-- Sync all groups once after backfill.
do $$
declare
  r record;
begin
  for r in select id from public.dealer_groups
  loop
    perform public.sync_dealer_group_plan_cache(r.id);
  end loop;
end$$;
