-- Add New OEM acquisition sources for Jim Butler Linn and Centralia.
-- Idempotent: skips names that already exist for each store.

insert into public.acquisition_sources (store_id, name)
select s.id, src.name
from public.stores s
cross join (
  values
    ('New Chevrolet'),
    ('New Chrysler'),
    ('New Dodge'),
    ('New Jeep'),
    ('New RAM')
) as src(name)
where s.name in ('Jim Butler Linn', 'Jim Butler Centralia')
  and not exists (
    select 1
    from public.acquisition_sources a
    where a.store_id = s.id
      and lower(a.name) = lower(src.name)
  );
