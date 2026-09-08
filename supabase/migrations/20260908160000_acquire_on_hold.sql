-- Flag for title/office holds — not a pipeline stage.

alter table public.acq_purchases
  add column if not exists on_hold boolean not null default false;

comment on column public.acq_purchases.on_hold is
  'True when office/title (or similar) blocks sale; orthogonal to stage.';
