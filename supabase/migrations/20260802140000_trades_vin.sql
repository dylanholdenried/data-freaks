-- Trade-in VIN. Optional for pending deals; required before close in the UI.
alter table public.trades
  add column if not exists vin text;

comment on column public.trades.vin is
  'Trade-in VIN. Optional for pending; required before close.';
