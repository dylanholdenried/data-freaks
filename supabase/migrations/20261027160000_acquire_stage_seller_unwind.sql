-- Add Seller Unwind exit stage (no required fields on the purchase card).

do $$
begin
  if not exists (
    select 1 from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    where t.typname = 'acq_purchase_stage' and e.enumlabel = 'seller_unwind'
  ) then
    alter type public.acq_purchase_stage add value 'seller_unwind' after 'arbitration_complete';
  end if;
end $$;

comment on type public.acq_purchase_stage is
  'Acquire purchase pipeline stages; seller_unwind is an exit with no required card fields';
