-- Partial uniqueness for active deals + duplicate_vin flag type.
-- Allows reusing stock numbers when the only prior deals are dead/unwound.

-- Resolve any active (pending/delivered/closed) stock collisions before creating the index.
-- Keep the earliest deal; mark later duplicates dead.
update public.deals d
set status = 'dead'
where d.id in (
  select id
  from (
    select
      id,
      row_number() over (
        partition by store_id, lower(trim(stock_number))
        order by created_at asc, id asc
      ) as rn
    from public.deals
    where status in ('pending', 'delivered', 'closed')
  ) ranked
  where ranked.rn > 1
);

drop index if exists public.deals_store_stock_unique;

create unique index if not exists deals_store_stock_active_unique
  on public.deals (store_id, lower(trim(stock_number)))
  where status in ('pending', 'delivered', 'closed');

alter table public.deal_flags drop constraint if exists deal_flags_flag_type_check;
alter table public.deal_flags add constraint deal_flags_flag_type_check
  check (
    flag_type = any (
      array[
        'make_dept_mismatch'::text,
        'decoder_overridden'::text,
        'decode_failed'::text,
        'no_vin_at_close'::text,
        'duplicate_vin'::text
      ]
    )
  );
