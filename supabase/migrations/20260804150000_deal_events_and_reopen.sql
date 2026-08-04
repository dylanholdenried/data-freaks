-- Lifecycle audit trail for deals (created + status changes).
-- Powers the deal edit page activity log and supports reopen attribution.

create table if not exists public.deal_events (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals(id) on delete cascade,
  actor_user_id uuid references auth.users(id),
  actor_profile_id uuid references public.profiles(id),
  event_type text not null check (event_type in ('created', 'status_changed')),
  from_status public.deal_status,
  to_status public.deal_status,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists deal_events_deal_id_created_at_idx
  on public.deal_events (deal_id, created_at desc);

alter table public.deal_events enable row level security;

drop policy if exists "deal_events_select_store_access" on public.deal_events;
create policy "deal_events_select_store_access"
on public.deal_events
for select
using (
  exists (
    select 1
    from public.deals d
    where d.id = deal_id
      and public.has_store_access(d.store_id)
  )
);

-- Clients must not forge audit rows; triggers (security definer) write events.
revoke insert, update, delete on public.deal_events from anon, authenticated;
grant select on public.deal_events to authenticated;

create or replace function public.log_deal_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_user uuid;
  v_profile_id uuid;
begin
  v_actor_user := coalesce(NEW.entered_by, auth.uid());
  v_profile_id := public.current_profile_id();
  if v_profile_id is null and v_actor_user is not null then
    select p.id
      into v_profile_id
    from public.profiles p
    where p.user_id = v_actor_user
       or p.id = v_actor_user
    limit 1;
  end if;

  insert into public.deal_events (
    deal_id,
    actor_user_id,
    actor_profile_id,
    event_type,
    from_status,
    to_status,
    metadata,
    created_at
  ) values (
    NEW.id,
    v_actor_user,
    v_profile_id,
    'created',
    null,
    NEW.status,
    '{}'::jsonb,
    coalesce(NEW.created_at, now())
  );

  return NEW;
end;
$$;

create or replace function public.log_deal_status_changed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if OLD.status is distinct from NEW.status then
    insert into public.deal_events (
      deal_id,
      actor_user_id,
      actor_profile_id,
      event_type,
      from_status,
      to_status,
      metadata
    ) values (
      NEW.id,
      auth.uid(),
      public.current_profile_id(),
      'status_changed',
      OLD.status,
      NEW.status,
      '{}'::jsonb
    );
  end if;

  return NEW;
end;
$$;

drop trigger if exists deals_log_created on public.deals;
create trigger deals_log_created
  after insert on public.deals
  for each row
  execute function public.log_deal_created();

drop trigger if exists deals_log_status_change on public.deals;
create trigger deals_log_status_change
  after update of status on public.deals
  for each row
  execute function public.log_deal_status_changed();

-- Historical "Created" rows for existing deals (status actors only going forward).
insert into public.deal_events (
  deal_id,
  actor_user_id,
  actor_profile_id,
  event_type,
  from_status,
  to_status,
  metadata,
  created_at
)
select
  d.id,
  d.entered_by,
  (
    select p.id
    from public.profiles p
    where d.entered_by is not null
      and (p.user_id = d.entered_by or p.id = d.entered_by)
    limit 1
  ),
  'created',
  null,
  d.status,
  '{}'::jsonb,
  coalesce(d.created_at, now())
from public.deals d
where not exists (
  select 1
  from public.deal_events e
  where e.deal_id = d.id
    and e.event_type = 'created'
);
