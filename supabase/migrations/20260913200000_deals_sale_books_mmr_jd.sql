-- Lock last reported MMR / JD Power Clean Trade onto closed pre-owned deals.
-- Values come from the last inventory snapshot that still contained the stock
-- (i.e. when the unit fell off the lot / sold). Manual override supported.

alter table public.deals
  add column if not exists sale_mmr numeric(12,2),
  add column if not exists sale_jd numeric(12,2),
  add column if not exists sale_books_at timestamptz,
  add column if not exists sale_books_source text,
  add column if not exists sale_books_manual boolean not null default false;

alter table public.deals drop constraint if exists deals_sale_books_source_check;
alter table public.deals
  add constraint deals_sale_books_source_check
  check (
    sale_books_source is null
    or sale_books_source = any (
      array[
        'inventory_snapshot'::text,
        'acquire_frozen'::text,
        'manual'::text
      ]
    )
  );

comment on column public.deals.sale_mmr is
  'MMR locked at close for pre-owned deals (last reported while on lot, or manual).';
comment on column public.deals.sale_jd is
  'JD Power Clean Trade locked at close for pre-owned deals (last reported while on lot, or manual).';
comment on column public.deals.sale_books_at is
  'Timestamp/date of the book values used (inventory snapshot date or manual save time).';
comment on column public.deals.sale_books_source is
  'inventory_snapshot | acquire_frozen | manual';
comment on column public.deals.sale_books_manual is
  'When true, close/backfill must not overwrite sale_mmr / sale_jd.';

create index if not exists deals_sale_books_missing_idx
  on public.deals (store_id, sale_date)
  where status = 'closed'
    and (sale_mmr is null or sale_jd is null);

-- Backfill from the most recent inv_units row for each store + stock.
-- Only pre-owned departments (Used / pre-owned / CPO / certified); never New / F&I.
-- Only fills nulls; never overwrites manual entries.
with last_books as (
  select distinct on (s.store_id, upper(trim(u.stk)))
    s.store_id,
    upper(trim(u.stk)) as stk_key,
    u.mmr,
    u.jd,
    s.snapshot_date
  from public.inv_units u
  join public.inv_snapshots s on s.id = u.snapshot_id
  where u.mmr is not null
     or u.jd is not null
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
    and d.sale_books_manual is not true
    and (d.sale_mmr is null or d.sale_jd is null)
    and (
      dept.name ~* 'used|pre-?owned|preowned|cpo|certified'
    )
    and not (
      dept.name ~* '\ynew\y'
      and dept.name !~* 'used|pre-?owned|preowned|cpo|certified'
    )
)
update public.deals d
set
  sale_mmr = coalesce(d.sale_mmr, lb.mmr),
  sale_jd = coalesce(d.sale_jd, lb.jd),
  sale_books_at = coalesce(
    d.sale_books_at,
    (lb.snapshot_date::timestamp at time zone 'UTC')
  ),
  sale_books_source = coalesce(d.sale_books_source, 'inventory_snapshot')
from preowned_closed pc
join last_books lb
  on lb.store_id = pc.store_id
 and lb.stk_key = pc.stk_key
where d.id = pc.id
  and (lb.mmr is not null or lb.jd is not null);

-- Secondary backfill from Acquire frozen/live books when inventory had no match.
with acq_books as (
  select distinct on (p.store_id, upper(trim(p.stock_number)))
    p.store_id,
    upper(trim(p.stock_number)) as stk_key,
    coalesce(p.frozen_mmr, p.live_mmr) as mmr,
    coalesce(p.frozen_jd, p.live_jd) as jd,
    coalesce(p.frozen_at, p.updated_at, p.created_at) as books_at
  from public.acq_purchases p
  where p.store_id is not null
    and p.stock_number is not null
    and (
      coalesce(p.frozen_mmr, p.live_mmr) is not null
      or coalesce(p.frozen_jd, p.live_jd) is not null
    )
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
    and d.sale_books_manual is not true
    and (d.sale_mmr is null or d.sale_jd is null)
    and dept.name ~* 'used|pre-?owned|preowned|cpo|certified'
    and not (
      dept.name ~* '\ynew\y'
      and dept.name !~* 'used|pre-?owned|preowned|cpo|certified'
    )
)
update public.deals d
set
  sale_mmr = coalesce(d.sale_mmr, ab.mmr),
  sale_jd = coalesce(d.sale_jd, ab.jd),
  sale_books_at = coalesce(d.sale_books_at, ab.books_at),
  sale_books_source = coalesce(d.sale_books_source, 'acquire_frozen')
from preowned_closed pc
join acq_books ab
  on ab.store_id = pc.store_id
 and ab.stk_key = pc.stk_key
where d.id = pc.id
  and (ab.mmr is not null or ab.jd is not null);
