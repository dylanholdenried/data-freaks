-- Acquire stage model v2:
-- - need_to_stock_in before in_transit (app order)
-- - wholesale = active queue (still in inventory to wholesale)
-- - sold = exit bucket (retail or wholesale_sold via exit_strategy)
-- - arbitration = open claim; arbitration_complete = resolved exit

do $$
begin
  if not exists (
    select 1 from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    where t.typname = 'acq_purchase_stage' and e.enumlabel = 'arbitration_complete'
  ) then
    alter type public.acq_purchase_stage add value 'arbitration_complete';
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'acq_exit_strategy') then
    create type public.acq_exit_strategy as enum ('retail', 'wholesale_sold');
  end if;
end $$;

alter table public.acq_purchases
  add column if not exists exit_strategy public.acq_exit_strategy;

comment on column public.acq_purchases.exit_strategy is
  'When stage=sold: retail vs wholesale_sold. Wholesale stage itself is the active wholesale queue.';

alter table public.acq_purchases
  alter column stage set default 'need_to_stock_in';
