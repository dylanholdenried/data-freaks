-- Let a signed-in user add a missing model under an existing make.
-- Names that already belong to another make are rejected so a bad decode
-- (Ram + Grand Cherokee) cannot create a second copy.

create unique index if not exists vehicle_models_make_name_lower_idx
  on public.vehicle_models (make_id, lower(name));

create or replace function public.ensure_vehicle_model(p_make_id uuid, p_name text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_id uuid;
  v_existing text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if not exists (
    select 1 from public.vehicle_makes
    where id = p_make_id and active
  ) then
    raise exception 'unknown make';
  end if;

  v_name := trim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  if char_length(v_name) < 1 or char_length(v_name) > 48 then
    raise exception 'invalid model name';
  end if;
  if v_name ~ '[^[:alnum:][:space:]\-\.\&/]' then
    raise exception 'invalid model name';
  end if;

  if exists (
    select 1
    from public.vehicle_models mo
    where mo.make_id <> p_make_id
      and lower(mo.name) = lower(v_name)
      and mo.active
  ) then
    raise exception 'model belongs to another make';
  end if;

  select mo.id, mo.name
    into v_id, v_existing
  from public.vehicle_models mo
  where mo.make_id = p_make_id
    and lower(mo.name) = lower(v_name)
  limit 1;

  if v_id is not null then
    return jsonb_build_object('id', v_id, 'name', v_existing);
  end if;

  begin
    insert into public.vehicle_models (make_id, name, active)
    values (p_make_id, v_name, true)
    returning id, name into v_id, v_existing;
  exception
    when unique_violation then
      select mo.id, mo.name
        into v_id, v_existing
      from public.vehicle_models mo
      where mo.make_id = p_make_id
        and lower(mo.name) = lower(v_name)
      limit 1;
  end;

  return jsonb_build_object('id', v_id, 'name', v_existing);
end;
$$;

revoke all on function public.ensure_vehicle_model(uuid, text) from public;
revoke all on function public.ensure_vehicle_model(uuid, text) from anon;
grant execute on function public.ensure_vehicle_model(uuid, text) to authenticated;
