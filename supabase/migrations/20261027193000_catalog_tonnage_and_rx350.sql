-- Split van/cargo tonnage models and add Lexus RX 350 so Profit Center
-- does not roll distinct series into one bucket. Also add Dodge Ram 1500/2500
-- so historical Dodge Ram trucks stay on Dodge, separate from Ram brand.

insert into public.vehicle_models (make_id, name, active)
select m.id, v.name, true
from public.vehicle_makes m
join (
  values
    ('Ford', 'Transit 250'),
    ('Ford', 'Transit 350'),
    ('Chevrolet', 'Express 2500'),
    ('Chevrolet', 'Express 3500'),
    ('GMC', 'Savana 2500'),
    ('Ram', 'ProMaster 2500'),
    ('Lexus', 'RX 350'),
    ('Dodge', 'Ram 1500'),
    ('Dodge', 'Ram 2500')
) as v(make_name, name)
  on lower(m.name) = lower(v.make_name)
where m.active
  and not exists (
    select 1
    from public.vehicle_models existing
    where existing.make_id = m.id
      and lower(existing.name) = lower(v.name)
  );
