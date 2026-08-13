-- Fleet desks roll up onto existing New Chevrolet / New CDJR dashboard cards.
-- One-level only; parent must be the same store.

alter table public.departments
  add column if not exists rolls_up_to_department_id uuid
    references public.departments(id) on delete restrict;

create index if not exists departments_rolls_up_to_department_id_idx
  on public.departments(rolls_up_to_department_id);

comment on column public.departments.rolls_up_to_department_id is
  'Optional parent department for dashboard/calendar/goal rollup. Child deals stay on this department; volume rolls into the parent card and combined goal.';

create or replace function public.departments_validate_rollup()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  parent_store uuid;
  parent_rollup uuid;
begin
  if new.rolls_up_to_department_id is null then
    return new;
  end if;

  if new.id is not null and new.rolls_up_to_department_id = new.id then
    raise exception 'department cannot roll up to itself';
  end if;

  select d.store_id, d.rolls_up_to_department_id
    into parent_store, parent_rollup
  from public.departments d
  where d.id = new.rolls_up_to_department_id;

  if not found then
    raise exception 'rollup parent department not found';
  end if;

  if parent_store is distinct from new.store_id then
    raise exception 'rollup parent must belong to the same store';
  end if;

  if parent_rollup is not null then
    raise exception 'rollup is one level only';
  end if;

  if exists (
    select 1
    from public.departments child
    where child.rolls_up_to_department_id = new.id
  ) and new.rolls_up_to_department_id is not null then
    raise exception 'cannot roll up a department that other departments roll up to';
  end if;

  return new;
end;
$$;

drop trigger if exists departments_validate_rollup on public.departments;
create trigger departments_validate_rollup
before insert or update of store_id, rolls_up_to_department_id
on public.departments
for each row
execute function public.departments_validate_rollup();

-- Jim Butler Linn + Centralia: Chevrolet Fleet / CDJR Fleet under existing New desks.
insert into public.departments (store_id, name, rolls_up_to_department_id)
select d.store_id, 'Chevrolet Fleet', d.id
from public.departments d
join public.stores s on s.id = d.store_id
where s.name in ('Jim Butler Linn', 'Jim Butler Centralia')
  and d.name = 'New Chevrolet'
  and d.rolls_up_to_department_id is null
  and not exists (
    select 1
    from public.departments existing
    where existing.store_id = d.store_id
      and lower(existing.name) = 'chevrolet fleet'
  );

insert into public.departments (store_id, name, rolls_up_to_department_id)
select d.store_id, 'CDJR Fleet', d.id
from public.departments d
join public.stores s on s.id = d.store_id
where s.name in ('Jim Butler Linn', 'Jim Butler Centralia')
  and d.name = 'New CDJR'
  and d.rolls_up_to_department_id is null
  and not exists (
    select 1
    from public.departments existing
    where existing.store_id = d.store_id
      and lower(existing.name) = 'cdjr fleet'
  );

insert into public.department_makes (department_id, make)
select fleet.id, dm.make
from public.departments fleet
join public.departments parent on parent.id = fleet.rolls_up_to_department_id
join public.department_makes dm on dm.department_id = parent.id
join public.stores s on s.id = fleet.store_id
where s.name in ('Jim Butler Linn', 'Jim Butler Centralia')
  and fleet.name in ('Chevrolet Fleet', 'CDJR Fleet')
  and not exists (
    select 1
    from public.department_makes existing
    where existing.department_id = fleet.id
      and existing.make = dm.make
  );
