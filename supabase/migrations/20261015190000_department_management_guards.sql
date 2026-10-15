-- Department management guardrails.
-- * Only platform/owner admins (is_platform_admin) may create or edit departments.
-- * Departments in live auto groups can never be deleted (deactivate instead), so
--   historical deals, goals, and source links keep their department.
-- * Inactive departments cannot receive new deals or have deals moved into them.
--   Existing deals already on an inactive department stay editable.
-- * A department can't move to another store, names are unique per store
--   (CSV import matches by name), and rollup parents must stay active while
--   active children point at them.

-- ── Write policies: platform/owner admins only ───────────────────────────────

drop policy if exists "departments_members_insert" on public.departments;
drop policy if exists "departments_members_update" on public.departments;
drop policy if exists "departments_platform_admin_insert" on public.departments;
drop policy if exists "departments_platform_admin_update" on public.departments;

create policy "departments_platform_admin_insert"
on public.departments
for insert
to authenticated
with check ((select public.is_platform_admin()));

create policy "departments_platform_admin_update"
on public.departments
for update
to authenticated
using ((select public.is_platform_admin()))
with check ((select public.is_platform_admin()));

-- No delete policy: authenticated users cannot delete departments.

-- ── Unique name per store ────────────────────────────────────────────────────

create unique index if not exists departments_store_name_unique_idx
  on public.departments (store_id, lower(btrim(name)));

-- ── Block deletes once the auto group is live ────────────────────────────────

create or replace function public.departments_guard_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.stores s
    join public.dealer_groups g on g.id = s.dealer_group_id
    where s.id = old.store_id
      and (g.status = 'active' or g.is_active)
  ) then
    raise exception 'Departments cannot be deleted once an auto group is live. Deactivate the department instead.'
      using errcode = 'P0001';
  end if;
  return old;
end;
$$;

drop trigger if exists departments_guard_delete on public.departments;
create trigger departments_guard_delete
before delete on public.departments
for each row
execute function public.departments_guard_delete();

-- ── Store lock, active-state, and rollup guards ──────────────────────────────

create or replace function public.departments_guard_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.store_id is distinct from old.store_id then
    raise exception 'A department cannot be moved to a different store.'
      using errcode = 'P0001';
  end if;

  if btrim(coalesce(new.name, '')) = '' then
    raise exception 'Department name is required.' using errcode = 'P0001';
  end if;

  if tg_op = 'UPDATE' and old.is_active and not new.is_active and exists (
    select 1
    from public.departments child
    where child.rolls_up_to_department_id = new.id
      and child.is_active
  ) then
    raise exception 'Deactivate or move the departments that roll up to this one first.'
      using errcode = 'P0001';
  end if;

  if new.is_active and new.rolls_up_to_department_id is not null and exists (
    select 1
    from public.departments parent
    where parent.id = new.rolls_up_to_department_id
      and not parent.is_active
  ) then
    raise exception 'An active department cannot roll up to an inactive department.'
      using errcode = 'P0001';
  end if;

  if tg_op = 'UPDATE' then
    new.updated_at := now();
  end if;

  return new;
end;
$$;

drop trigger if exists departments_guard_update on public.departments;
create trigger departments_guard_update
before insert or update on public.departments
for each row
execute function public.departments_guard_update();

-- ── Deals cannot be added to (or moved into) inactive departments ────────────

create or replace function public.deals_require_active_department()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.department_id is not distinct from old.department_id then
    return new;
  end if;

  if exists (
    select 1
    from public.departments d
    where d.id = new.department_id
      and not d.is_active
  ) then
    raise exception 'This department is inactive. Choose an active department.'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists deals_require_active_department on public.deals;
create trigger deals_require_active_department
before insert or update of department_id on public.deals
for each row
execute function public.deals_require_active_department();

-- Trigger-only functions: not callable through the API.
revoke execute on function public.departments_guard_delete() from public, anon, authenticated;
revoke execute on function public.departments_guard_update() from public, anon, authenticated;
revoke execute on function public.deals_require_active_department() from public, anon, authenticated;
