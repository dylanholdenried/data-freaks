-- Distinguish new-group vs join-existing signup requests for admin workflows.
alter table public.dealer_group_requests
  add column if not exists request_mode text not null default 'new';

alter table public.dealer_group_requests
  drop constraint if exists dealer_group_requests_request_mode_check;

alter table public.dealer_group_requests
  add constraint dealer_group_requests_request_mode_check
  check (request_mode in ('new', 'existing'));

comment on column public.dealer_group_requests.request_mode is
  'new = create dealership/group; existing = join an existing dealership/group';

-- Backfill from notes written by /signup.
update public.dealer_group_requests
set request_mode = 'existing'
where request_mode = 'new'
  and notes ilike 'Requested access to existing group:%';
