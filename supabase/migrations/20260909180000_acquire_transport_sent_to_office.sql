-- Transport scheduled flag (broker/carrier booked) + Sent to office pipeline stage.

alter table public.acq_purchases
  add column if not exists transport_scheduled boolean not null default false;

comment on column public.acq_purchases.transport_scheduled is
  'True once transport has been scheduled with broker/carrier; orthogonal to stage.';

-- Insert between need_to_stock_in and in_transit (office paperwork before stock #).
do $$
begin
  if not exists (
    select 1 from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    where t.typname = 'acq_purchase_stage' and e.enumlabel = 'sent_to_office'
  ) then
    alter type public.acq_purchase_stage add value 'sent_to_office' before 'in_transit';
  end if;
end $$;
