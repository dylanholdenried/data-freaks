-- Align legacy production tables with provision/activate writes.

-- dealer_groups
alter table public.dealer_groups
  add column if not exists website text;

alter table public.dealer_groups
  add column if not exists number_of_stores integer;

alter table public.dealer_groups
  add column if not exists status public.dealer_group_status not null default 'pending';

alter table public.dealer_groups
  add column if not exists is_active boolean not null default true;

alter table public.dealer_groups
  add column if not exists updated_at timestamptz not null default now();

create index if not exists dealer_groups_status_idx on public.dealer_groups(status);

-- stores
alter table public.stores
  add column if not exists is_active boolean not null default true;

alter table public.stores
  add column if not exists code text;

alter table public.stores
  add column if not exists updated_at timestamptz not null default now();

-- departments
alter table public.departments
  add column if not exists is_active boolean not null default true;

alter table public.departments
  add column if not exists created_at timestamptz not null default now();

alter table public.departments
  add column if not exists updated_at timestamptz not null default now();
