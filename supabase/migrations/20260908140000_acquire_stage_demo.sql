-- Add Demo status at end of Acquire purchase stage enum.

do $$
begin
  if not exists (
    select 1 from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    where t.typname = 'acq_purchase_stage' and e.enumlabel = 'demo'
  ) then
    alter type public.acq_purchase_stage add value 'demo';
  end if;
end $$;
