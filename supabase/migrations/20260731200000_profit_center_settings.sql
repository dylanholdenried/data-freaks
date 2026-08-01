-- Profit Center buy-box scoring settings (per dealer group).
-- Platform admins write; group members read.

create table if not exists public.profit_center_settings (
  dealer_group_id uuid primary key references public.dealer_groups(id) on delete cascade,
  min_volume int not null default 3 check (min_volume >= 1),
  weight_front numeric not null default 0.35,
  weight_back numeric not null default 0.25,
  weight_turn numeric not null default 0.25,
  weight_trade numeric not null default 0.15,
  list_size int not null default 5 check (list_size >= 1),
  updated_at timestamptz not null default now()
);

alter table public.profit_center_settings enable row level security;

create policy "profit_center_settings_platform_admin_all"
on public.profit_center_settings
for all
using (public.is_platform_admin())
with check (public.is_platform_admin());

create policy "profit_center_settings_group_members_select"
on public.profit_center_settings
for select
using (
  exists (
    select 1 from public.profiles p
    where p.dealer_group_id = profit_center_settings.dealer_group_id
      and p.user_id = auth.uid()
      and p.status = 'active'
  )
  or public.is_platform_admin()
);
