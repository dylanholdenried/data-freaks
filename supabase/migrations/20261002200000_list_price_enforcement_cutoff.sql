-- Start inventory-enforced list price fresh on 2026-10-01.
--
-- Deals sold on or after the cutoff: list price locks from inventory on close;
-- if not found it is NA + 'missing' until a platform/owner admin enters it.
-- Deals sold before the cutoff: inventory price still wins when found, but
-- when not found the user-typed value is kept ('legacy') — never 'missing'.

create or replace function public.list_price_enforced_from()
returns date
language sql
immutable
as $$ select date '2026-10-01' $$;

create or replace function public.deals_inventory_pricing()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_used boolean;
  v_enforced boolean;
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

  v_enforced := coalesce(new.sale_date, current_date) >= public.list_price_enforced_from();

  -- No JWT (migrations, SQL editor) or service role = trusted server context.
  v_privileged := coalesce((select auth.role()), 'service_role') = 'service_role'
    or public.is_platform_admin();

  if tg_op = 'INSERT' then
    v_csv_price := case when v_privileged then new.list_price end;
    new.list_price_entered := coalesce(new.list_price_entered, new.list_price);
    new.list_price_at := null;
    new.sale_inv_disp := null;
    if v_enforced then
      new.list_price := null;
      new.list_price_na := false;
      new.list_price_source := null;
    else
      new.list_price_source := 'legacy';
    end if;
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
  elsif not v_enforced
        and coalesce(old.list_price_source, 'legacy') in ('legacy', 'missing') then
    -- Pre-cutoff deal not locked from inventory: typed list price allowed.
    new.list_price_source := 'legacy';
    new.list_price_at := null;
    new.list_price_entered := coalesce(old.list_price_entered, new.list_price);
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
  elsif not v_enforced then
    new.list_price_source := 'legacy';
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

-- Historical 'missing' deals go back to the typed list price (NA if none was typed).
update public.deals
set
  list_price = list_price_entered,
  list_price_na = list_price_entered is null,
  list_price_source = 'legacy',
  list_price_at = null
where list_price_source = 'missing'
  and sale_date < public.list_price_enforced_from();
