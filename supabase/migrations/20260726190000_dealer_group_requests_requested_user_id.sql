-- Align dealer_group_requests with app schema used by public signup + admin requests.

alter table public.dealer_group_requests
  add column if not exists requested_user_id uuid references auth.users(id);

alter table public.dealer_group_requests
  add column if not exists updated_at timestamptz not null default now();

create index if not exists dealer_group_requests_requested_user_id_idx
  on public.dealer_group_requests(requested_user_id);
