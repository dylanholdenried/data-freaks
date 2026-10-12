-- Date the retail store sold an internal transfer (can differ from the buying store's sold date).

alter table public.acq_purchases
  add column if not exists retail_sold_date date;

comment on column public.acq_purchases.retail_sold_date is
  'Date the retail store sold an internal transfer. Next store gross is credited in this month.';
