-- Lock adjusted % of market (inventory POM) at sale alongside MMR/JD.

alter table public.deals
  add column if not exists sale_pom numeric(8,2);

comment on column public.deals.sale_pom is
  'Adjusted % of market (POM) locked at close for pre-owned deals from last inventory report.';

-- Backfill from the same last inv_units snapshot used for sale books.
with last_pom as (
  select distinct on (s.store_id, upper(trim(u.stk)))
    s.store_id,
    upper(trim(u.stk)) as stk_key,
    u.pom
  from public.inv_units u
  join public.inv_snapshots s on s.id = u.snapshot_id
  where u.pom is not null
  order by s.store_id, upper(trim(u.stk)), s.snapshot_date desc
),
preowned_closed as (
  select
    d.id,
    d.store_id,
    upper(trim(d.stock_number)) as stk_key
  from public.deals d
  join public.departments dept on dept.id = d.department_id
  where d.status = 'closed'
    and d.sale_pom is null
    and dept.name ~* 'used|pre-?owned|preowned|cpo|certified'
    and not (
      dept.name ~* '\ynew\y'
      and dept.name !~* 'used|pre-?owned|preowned|cpo|certified'
    )
)
update public.deals d
set sale_pom = lp.pom
from preowned_closed pc
join last_pom lp
  on lp.store_id = pc.store_id
 and lp.stk_key = pc.stk_key
where d.id = pc.id;

-- Secondary: Acquire live_pom when inventory had no match.
with acq_pom as (
  select distinct on (p.store_id, upper(trim(p.stock_number)))
    p.store_id,
    upper(trim(p.stock_number)) as stk_key,
    p.live_pom as pom
  from public.acq_purchases p
  where p.store_id is not null
    and p.stock_number is not null
    and p.live_pom is not null
  order by p.store_id, upper(trim(p.stock_number)), p.updated_at desc nulls last
),
preowned_closed as (
  select
    d.id,
    d.store_id,
    upper(trim(d.stock_number)) as stk_key
  from public.deals d
  join public.departments dept on dept.id = d.department_id
  where d.status = 'closed'
    and d.sale_pom is null
    and dept.name ~* 'used|pre-?owned|preowned|cpo|certified'
    and not (
      dept.name ~* '\ynew\y'
      and dept.name !~* 'used|pre-?owned|preowned|cpo|certified'
    )
)
update public.deals d
set sale_pom = ap.pom
from preowned_closed pc
join acq_pom ap
  on ap.store_id = pc.store_id
 and ap.stk_key = pc.stk_key
where d.id = pc.id;
