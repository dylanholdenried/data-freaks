-- Inventory-locked list price for pre-owned deals.
--
-- Pre-owned list price is no longer typed by store users. On close, the deal
-- locks the most recent inventory upload price (inv_units.price), Adj % of
-- Market (pom) and planned disposition (disp) for the stock, on or before the
-- sale date. When the store has inventory coverage but the stock is not found,
-- the list price is NA + 'missing' until a platform/owner admin enters it.
--
-- list_price_source:
--   inventory_snapshot  locked from the daily inventory upload
--   manual              entered by a platform/owner admin (or admin CSV import fallback)
--   missing             store has inventory coverage, stock not found / unpriced
--   legacy              user-entered (new-car deals, or pre-owned before inventory coverage)

alter table public.deals
  add column if not exists list_price_source text,
  add column if not exists list_price_at date,
  add column if not exists sale_inv_disp text,
  add column if not exists list_price_entered numeric(12,2);

alter table public.deals drop constraint if exists deals_list_price_source_check;
alter table public.deals
  add constraint deals_list_price_source_check
  check (
    list_price_source is null
    or list_price_source in ('inventory_snapshot', 'manual', 'missing', 'legacy')
  );

alter table public.deals drop constraint if exists deals_sale_inv_disp_check;
alter table public.deals
  add constraint deals_sale_inv_disp_check
  check (
    sale_inv_disp is null
    or sale_inv_disp in ('retail', 'subprime', 'wholesale')
  );

comment on column public.deals.list_price_source is
  'inventory_snapshot | manual | missing | legacy — where list_price came from.';
comment on column public.deals.list_price_at is
  'Inventory snapshot date the list price was taken from.';
comment on column public.deals.sale_inv_disp is
  'Planned disposition (retail/subprime/wholesale) from the last inventory upload at sale.';
comment on column public.deals.list_price_entered is
  'List price originally typed by the user before inventory locking (audit only).';

create index if not exists inv_units_stk_key_idx
  on public.inv_units (upper(trim(stk)));

create index if not exists deals_list_price_missing_idx
  on public.deals (store_id, sale_date)
  where status = 'closed' and list_price_source = 'missing';

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.is_preowned_department(p_name text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select coalesce(
    p_name ~* 'used|pre-?owned|preowned|cpo|certified'
    and not (p_name ~* '^\s*f\s*&\s*i\s*$|^\s*fi\s*$|finance'),
    false
  );
$$;

create or replace function public.resolve_inventory_pricing(
  p_store_id uuid,
  p_stock_number text,
  p_sale_date date default null
)
returns table (
  list_price numeric,
  pom numeric,
  disp text,
  snapshot_date date,
  price_snapshot_date date
)
language sql
stable
security definer
set search_path = public
as $$
  with candidates as (
    select
      u.price,
      u.pom,
      u.disp,
      s.snapshot_date,
      s.snapshot_date <= coalesce(p_sale_date, current_date) as on_or_before
    from public.inv_units u
    join public.inv_snapshots s on s.id = u.snapshot_id
    where s.store_id = p_store_id
      and trim(coalesce(p_stock_number, '')) <> ''
      and upper(trim(u.stk)) = upper(trim(p_stock_number))
      and ((select auth.uid()) is null or public.has_store_access(p_store_id))
  ),
  ranked as (
    select
      c.*,
      row_number() over (
        order by
          c.on_or_before desc,
          case when c.on_or_before then c.snapshot_date end desc nulls last,
          c.snapshot_date asc
      ) as rn
    from candidates c
  ),
  latest as (
    select * from ranked where rn = 1
  ),
  priced as (
    select * from ranked where price is not null order by rn limit 1
  )
  select
    p.price,
    l.pom,
    case lower(trim(coalesce(l.disp, '')))
      when 'subprime' then 'subprime'
      when 'wholesale' then 'wholesale'
      else 'retail'
    end,
    l.snapshot_date,
    p.snapshot_date
  from latest l
  left join priced p on true;
$$;

revoke all on function public.resolve_inventory_pricing(uuid, text, date) from public, anon;
grant execute on function public.resolve_inventory_pricing(uuid, text, date) to authenticated, service_role;

create or replace function public.store_has_inventory_coverage(p_store_id uuid, p_on date)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.inv_snapshots s
    where s.store_id = p_store_id
      and s.snapshot_date <= coalesce(p_on, current_date)
  );
$$;

revoke all on function public.store_has_inventory_coverage(uuid, date) from public, anon;
grant execute on function public.store_has_inventory_coverage(uuid, date) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Backfill (runs before the trigger exists)
-- ---------------------------------------------------------------------------

update public.deals
set list_price_entered = list_price
where list_price is not null
  and list_price_entered is null;

update public.deals d
set list_price_source = 'legacy'
from public.departments dept
where dept.id = d.department_id
  and not public.is_preowned_department(dept.name);

update public.deals d
set list_price_source = 'legacy'
from public.departments dept
where dept.id = d.department_id
  and public.is_preowned_department(dept.name)
  and not public.store_has_inventory_coverage(d.store_id, d.sale_date);

with targets as (
  select d.id, d.sale_books_manual, r.*
  from public.deals d
  join public.departments dept on dept.id = d.department_id
  left join lateral public.resolve_inventory_pricing(d.store_id, d.stock_number, d.sale_date) r on true
  where d.status = 'closed'
    and public.is_preowned_department(dept.name)
    and public.store_has_inventory_coverage(d.store_id, d.sale_date)
)
update public.deals d
set
  list_price = t.list_price,
  list_price_na = t.list_price is null,
  list_price_source = case when t.list_price is null then 'missing' else 'inventory_snapshot' end,
  list_price_at = coalesce(t.price_snapshot_date, t.snapshot_date),
  sale_inv_disp = case when t.snapshot_date is not null then t.disp end,
  sale_pom = case
    when not d.sale_books_manual and t.pom is not null then t.pom
    else d.sale_pom
  end
from targets t
where d.id = t.id;

-- ---------------------------------------------------------------------------
-- Guard + lock trigger
-- ---------------------------------------------------------------------------

create or replace function public.deals_inventory_pricing()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_used boolean;
  v_privileged boolean;
  v_csv_price numeric;
  v_manual_edit boolean := false;
  v_resolve boolean;
  r record;
begin
  select public.is_preowned_department(dept.name)
    into v_used
  from public.departments dept
  where dept.id = new.department_id;

  if not coalesce(v_used, false)
     or not public.store_has_inventory_coverage(new.store_id, new.sale_date) then
    new.list_price_source := 'legacy';
    new.list_price_at := null;
    new.sale_inv_disp := null;
    return new;
  end if;

  -- No JWT (migrations, SQL editor) or service role = trusted server context.
  v_privileged := coalesce((select auth.role()), 'service_role') = 'service_role'
    or public.is_platform_admin();

  if tg_op = 'INSERT' then
    v_csv_price := case when v_privileged then new.list_price end;
    new.list_price_entered := coalesce(new.list_price_entered, new.list_price);
    new.list_price := null;
    new.list_price_na := false;
    new.list_price_source := null;
    new.list_price_at := null;
    new.sale_inv_disp := null;
  elsif v_privileged
        and new.list_price_source = 'manual'
        and (old.list_price_source is distinct from 'manual'
             or new.list_price is distinct from old.list_price) then
    v_manual_edit := true;
    new.list_price_na := new.list_price is null;
    new.list_price_at := null;
  elsif v_privileged
        and new.list_price_source is null
        and old.list_price_source is not null then
    -- Admin requested revert to inventory; resolved below when closed.
    new.list_price := old.list_price;
    new.list_price_na := old.list_price_na;
  else
    new.list_price := old.list_price;
    new.list_price_na := old.list_price_na;
    new.list_price_source := old.list_price_source;
    new.list_price_at := old.list_price_at;
    new.sale_inv_disp := old.sale_inv_disp;
    new.list_price_entered := old.list_price_entered;
  end if;

  if new.status is distinct from 'closed' then
    return new;
  end if;

  v_resolve := coalesce(new.list_price_source, '') <> 'manual'
    and (
      tg_op = 'INSERT'
      or old.status is distinct from 'closed'
      or new.stock_number is distinct from old.stock_number
      or new.sale_date is distinct from old.sale_date
      or new.store_id is distinct from old.store_id
      or new.department_id is distinct from old.department_id
      or new.list_price_source is null
      or new.list_price_source = 'legacy'
    );

  if not v_resolve and not (v_manual_edit or new.sale_inv_disp is null) then
    return new;
  end if;

  select * into r
  from public.resolve_inventory_pricing(new.store_id, new.stock_number, new.sale_date);

  if r.snapshot_date is not null then
    new.sale_inv_disp := r.disp;
    if not coalesce(new.sale_books_manual, false) and r.pom is not null then
      new.sale_pom := r.pom;
    end if;
  end if;

  if not v_resolve then
    return new;
  end if;

  if r.list_price is not null then
    new.list_price := r.list_price;
    new.list_price_na := false;
    new.list_price_source := 'inventory_snapshot';
    new.list_price_at := r.price_snapshot_date;
  elsif v_csv_price is not null then
    new.list_price := v_csv_price;
    new.list_price_na := false;
    new.list_price_source := 'manual';
    new.list_price_at := null;
  else
    new.list_price := null;
    new.list_price_na := true;
    new.list_price_source := 'missing';
    new.list_price_at := r.snapshot_date;
  end if;

  return new;
end;
$$;

revoke all on function public.deals_inventory_pricing() from public, anon, authenticated;

drop trigger if exists deals_inventory_pricing on public.deals;
create trigger deals_inventory_pricing
  before insert or update on public.deals
  for each row execute function public.deals_inventory_pricing();
