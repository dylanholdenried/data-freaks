-- Allow purchases before a destination store is known
alter table public.acq_purchases
  alter column store_id drop not null;

comment on column public.acq_purchases.store_id is
  'Destination dealership; nullable when store is TBD at purchase time';
