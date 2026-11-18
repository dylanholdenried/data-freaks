-- Persist disposition on write-down cohort rows so Sold section can show Prime / Subprime / Wholesale.

alter table public.inv_write_down_cohort
  add column if not exists disp text;

comment on column public.inv_write_down_cohort.disp is
  'Inventory disposition at last sync: retail (prime), subprime, or wholesale.';
