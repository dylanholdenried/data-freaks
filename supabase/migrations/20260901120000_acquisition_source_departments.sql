-- Department-scoped acquisition sources (junction table + Jim Butler seed data).

create table public.acquisition_source_departments (
  acquisition_source_id uuid not null references public.acquisition_sources(id) on delete cascade,
  department_id uuid not null references public.departments(id) on delete cascade,
  primary key (acquisition_source_id, department_id)
);

create index acquisition_source_departments_department_id_idx
  on public.acquisition_source_departments(department_id);

alter table public.acquisition_source_departments enable row level security;

create policy "acquisition_source_departments_select"
on public.acquisition_source_departments
for select
using (
  exists (
    select 1
    from public.departments d
    where d.id = acquisition_source_departments.department_id
      and d.store_id in (select public.accessible_store_ids())
  )
);

create policy "acquisition_source_departments_insert"
on public.acquisition_source_departments
for insert
with check (
  exists (
    select 1
    from public.acquisition_sources a
    join public.departments d on d.id = acquisition_source_departments.department_id
    where a.id = acquisition_source_departments.acquisition_source_id
      and a.store_id = d.store_id
      and public.can_mutate_store(d.store_id)
  )
);

create policy "acquisition_source_departments_delete"
on public.acquisition_source_departments
for delete
using (
  exists (
    select 1
    from public.acquisition_sources a
    join public.departments d on d.id = acquisition_source_departments.department_id
    where a.id = acquisition_source_departments.acquisition_source_id
      and a.store_id = d.store_id
      and public.can_mutate_store(d.store_id)
  )
);

-- Fix mis-tagged Jim Butler deals.
update public.deals
set acquisition_source = 'New Jeep'
where id = 'ba6d1af2-8019-496b-80c3-ce6bfd7fc1c1';

update public.deals
set acquisition_source = 'New Chevrolet'
where id = '5f7f9956-3cad-4e37-a8b0-9a719d412068';

-- Assign Jim Butler sources to departments (by store/dept/source name).
insert into public.acquisition_source_departments (acquisition_source_id, department_id)
select a.id, d.id
from public.acquisition_sources a
join public.stores s on s.id = a.store_id
join public.dealer_groups dg on dg.id = s.dealer_group_id
join public.departments d on d.store_id = s.id
where dg.name = 'Jim Butler Auto Group'
  and s.name = 'Jim Butler Centralia'
  and d.name = 'Pre-Owned'
  and a.name in (
    'New Car Trade', 'Used Car Trade', 'Dylan Purchase', 'Jim Butler Transfer',
    'Tim Reed', 'Streets Purchase', 'Other Store'
  )
on conflict do nothing;

insert into public.acquisition_source_departments (acquisition_source_id, department_id)
select a.id, d.id
from public.acquisition_sources a
join public.stores s on s.id = a.store_id
join public.dealer_groups dg on dg.id = s.dealer_group_id
join public.departments d on d.store_id = s.id
where dg.name = 'Jim Butler Auto Group'
  and s.name = 'Jim Butler Centralia'
  and d.name = 'New Chevrolet'
  and a.name in (
    'New Chevrolet (Bulk Upload)', 'New Chevrolet in Stock', 'Chevy Dealer Trade',
    'Chevy Linn Dealer Trade', 'Chevy Fenton Dealer Trade', 'New Chevrolet',
    'Sold Ordered Unit', 'Chevy Linn Locate', 'Chevy Fenton Locate', 'New Car Locate'
  )
on conflict do nothing;

insert into public.acquisition_source_departments (acquisition_source_id, department_id)
select a.id, d.id
from public.acquisition_sources a
join public.stores s on s.id = a.store_id
join public.dealer_groups dg on dg.id = s.dealer_group_id
join public.departments d on d.store_id = s.id
where dg.name = 'Jim Butler Auto Group'
  and s.name = 'Jim Butler Centralia'
  and d.name = 'New CDJR'
  and a.name in (
    'New RAM', 'New Jeep', 'New Chrysler', 'New Dodge', 'CDJR Dealer Trade', 'New Car Locate'
  )
on conflict do nothing;

insert into public.acquisition_source_departments (acquisition_source_id, department_id)
select a.id, d.id
from public.acquisition_sources a
join public.stores s on s.id = a.store_id
join public.dealer_groups dg on dg.id = s.dealer_group_id
join public.departments d on d.store_id = s.id
where dg.name = 'Jim Butler Auto Group'
  and s.name = 'Jim Butler Centralia'
  and d.name = 'Chevrolet Fleet'
  and a.name in ('Chevy Linn Locate', 'Chevy Fenton Locate')
on conflict do nothing;

insert into public.acquisition_source_departments (acquisition_source_id, department_id)
select a.id, d.id
from public.acquisition_sources a
join public.stores s on s.id = a.store_id
join public.dealer_groups dg on dg.id = s.dealer_group_id
join public.departments d on d.store_id = s.id
where dg.name = 'Jim Butler Auto Group'
  and s.name = 'Jim Butler Linn'
  and d.name = 'Pre-Owned'
  and a.name in (
    'New Car Trade', 'Used Car Trade', 'Dylan Purchase', 'Purchase/Transfer (Bulk Upload)',
    'Jim Butler Transfer', 'Josh Purchase', 'Streets Purchase'
  )
on conflict do nothing;

insert into public.acquisition_source_departments (acquisition_source_id, department_id)
select a.id, d.id
from public.acquisition_sources a
join public.stores s on s.id = a.store_id
join public.dealer_groups dg on dg.id = s.dealer_group_id
join public.departments d on d.store_id = s.id
where dg.name = 'Jim Butler Auto Group'
  and s.name = 'Jim Butler Linn'
  and d.name = 'New Chevrolet'
  and a.name = 'New Chevrolet'
on conflict do nothing;

insert into public.acquisition_source_departments (acquisition_source_id, department_id)
select a.id, d.id
from public.acquisition_sources a
join public.stores s on s.id = a.store_id
join public.dealer_groups dg on dg.id = s.dealer_group_id
join public.departments d on d.store_id = s.id
where dg.name = 'Jim Butler Auto Group'
  and s.name = 'Jim Butler Linn'
  and d.name = 'Chevrolet Fleet'
  and a.name = 'New Chevrolet'
on conflict do nothing;

insert into public.acquisition_source_departments (acquisition_source_id, department_id)
select a.id, d.id
from public.acquisition_sources a
join public.stores s on s.id = a.store_id
join public.dealer_groups dg on dg.id = s.dealer_group_id
join public.departments d on d.store_id = s.id
where dg.name = 'Jim Butler Auto Group'
  and s.name = 'Jim Butler Linn'
  and d.name = 'New CDJR'
  and a.name in ('New RAM', 'New Jeep', 'New Chrysler', 'New Dodge')
on conflict do nothing;

insert into public.acquisition_source_departments (acquisition_source_id, department_id)
select a.id, d.id
from public.acquisition_sources a
join public.stores s on s.id = a.store_id
join public.dealer_groups dg on dg.id = s.dealer_group_id
join public.departments d on d.store_id = s.id
where dg.name = 'Jim Butler Auto Group'
  and s.name = 'Jim Butler Linn'
  and d.name = 'CDJR Fleet'
  and a.name in ('New RAM', 'New Jeep', 'New Chrysler', 'New Dodge')
on conflict do nothing;

-- Deactivate unused Centralia sources.
update public.acquisition_sources a
set active = false
from public.stores s
join public.dealer_groups dg on dg.id = s.dealer_group_id
where a.store_id = s.id
  and dg.name = 'Jim Butler Auto Group'
  and s.name = 'Jim Butler Centralia'
  and a.name in ('Chevy Fleet', 'Josh Purchase', 'New CDJR In Stock');
