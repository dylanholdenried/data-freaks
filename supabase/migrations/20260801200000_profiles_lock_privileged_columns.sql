-- Lock sensitive profile columns on self-update.
-- Users may edit: first_name, last_name, phone, onboarding_* , updated_at.
-- Protected: id, user_id, email, role, status, dealer_group_id, is_impersonating, created_at.
-- service_role (admin APIs) and is_platform_admin()/owner bypass the lock.

create or replace function public.profiles_protect_privileged_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Admin API / migrations use the service role and must retain full control.
  if coalesce(auth.role(), '') = 'service_role' then
    return new;
  end if;

  -- Active platform staff (owner_admin / platform_admin) may manage profiles via user JWT.
  if public.is_platform_admin() then
    return new;
  end if;

  if new.id is distinct from old.id
     or new.user_id is distinct from old.user_id
     or new.email is distinct from old.email
     or new.role is distinct from old.role
     or new.status is distinct from old.status
     or new.dealer_group_id is distinct from old.dealer_group_id
     or new.is_impersonating is distinct from old.is_impersonating
     or new.created_at is distinct from old.created_at
  then
    raise exception 'Not allowed to change protected profile fields'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_protect_privileged_columns on public.profiles;
create trigger profiles_protect_privileged_columns
before update on public.profiles
for each row
execute function public.profiles_protect_privileged_columns();

-- Tighten self-update RLS: must remain own row after update (WITH CHECK).
drop policy if exists "profiles_update_self" on public.profiles;
create policy "profiles_update_self"
on public.profiles
for update
using (user_id = auth.uid() or id = auth.uid())
with check (user_id = auth.uid() or id = auth.uid());

comment on function public.profiles_protect_privileged_columns() is
  'Blocks non-admin users from changing role, status, email, dealer_group_id, and other privileged profile columns.';
