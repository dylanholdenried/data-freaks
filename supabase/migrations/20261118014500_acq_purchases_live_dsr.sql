-- Days since price change from Inventory Command overlay (inv_units.dsr).
alter table public.acq_purchases
  add column if not exists live_dsr integer;

comment on column public.acq_purchases.live_dsr is
  'Days since last website price change, synced from Inventory Command inv_units.dsr.';
