-- Awaiting BOS: first Acquire pipeline step (before Need to Stock In).
-- Enum value must be committed before it can be used as a column default.

do $$
begin
  if not exists (
    select 1 from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    where t.typname = 'acq_purchase_stage' and e.enumlabel = 'awaiting_bos'
  ) then
    alter type public.acq_purchase_stage add value 'awaiting_bos' before 'need_to_stock_in';
  end if;
end $$;
