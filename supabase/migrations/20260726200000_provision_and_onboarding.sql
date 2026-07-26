-- Provisioning + onboarding fields for request → activate → first-login flow.

alter table public.dealer_group_requests
  add column if not exists requested_user_id uuid references auth.users(id);

alter table public.dealer_group_requests
  add column if not exists dealer_group_id uuid references public.dealer_groups(id);

alter table public.dealer_group_requests
  add column if not exists provisioned_at timestamptz;

alter table public.dealer_group_requests
  add column if not exists activated_at timestamptz;

alter table public.dealer_group_requests
  add column if not exists updated_at timestamptz not null default now();

create index if not exists dealer_group_requests_requested_user_id_idx
  on public.dealer_group_requests(requested_user_id);

create index if not exists dealer_group_requests_dealer_group_id_idx
  on public.dealer_group_requests(dealer_group_id);

-- Backfill requested_user_id from notes when present (signup workaround).
update public.dealer_group_requests
set requested_user_id = (substring(notes from 'auth_user_id=([0-9a-f-]{36})'))::uuid
where requested_user_id is null
  and notes ~ 'auth_user_id=[0-9a-f-]{36}';

alter table public.profiles
  add column if not exists onboarding_welcome_seen_at timestamptz;

alter table public.profiles
  add column if not exists onboarding_checklist jsonb not null default '{}'::jsonb;
