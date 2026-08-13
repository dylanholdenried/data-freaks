-- Unwind was failing: trades/deal_notes FKs to deals lacked ON DELETE CASCADE
-- (schema.sql already documents cascade; production was missing it).

alter table public.trades
  drop constraint if exists trades_deal_id_fkey;

alter table public.trades
  add constraint trades_deal_id_fkey
  foreign key (deal_id) references public.deals(id) on delete cascade;

alter table public.deal_notes
  drop constraint if exists deal_notes_deal_id_fkey;

alter table public.deal_notes
  add constraint deal_notes_deal_id_fkey
  foreign key (deal_id) references public.deals(id) on delete cascade;

-- Explicitly clear child rows before deleting deals (belt-and-suspenders with cascade)
create or replace function public.unwind_deal_import_batch(p_batch_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch public.deal_import_batches%rowtype;
  v_deal_ids uuid[];
  v_deleted int := 0;
begin
  select * into v_batch
  from public.deal_import_batches
  where id = p_batch_id
  for update;

  if not found then
    raise exception 'Import batch not found';
  end if;

  if v_batch.status <> 'committed' then
    raise exception 'Only committed batches can be unwound (status=%)', v_batch.status;
  end if;

  select coalesce(array_agg(deal_id) filter (where deal_id is not null), '{}'::uuid[])
  into v_deal_ids
  from public.deal_import_rows
  where batch_id = p_batch_id
    and is_valid = true;

  -- Legacy batches: resolve deal ids by stock number when deal_id was never recorded
  if coalesce(cardinality(v_deal_ids), 0) = 0 then
    select coalesce(array_agg(d.id), '{}'::uuid[])
    into v_deal_ids
    from public.deal_import_rows r
    join public.deals d
      on d.store_id = v_batch.store_id
     and lower(d.stock_number) = lower(nullif(trim(coalesce(r.normalized->>'stock_number', '')), ''))
    where r.batch_id = p_batch_id
      and r.is_valid = true
      and nullif(trim(coalesce(r.normalized->>'stock_number', '')), '') is not null;
  end if;

  if coalesce(cardinality(v_deal_ids), 0) > 0 then
    delete from public.trades where deal_id = any (v_deal_ids);
    delete from public.deal_notes where deal_id = any (v_deal_ids);
    -- deal_salespeople / deal_flags / deal_events cascade; delete deals last
    delete from public.deals
    where id = any (v_deal_ids)
      and store_id = v_batch.store_id;
    get diagnostics v_deleted = row_count;
  end if;

  update public.deal_import_rows
  set deal_id = null
  where batch_id = p_batch_id
    and deal_id is not null;

  update public.deal_import_batches
  set status = 'unwound',
      unwound_at = now()
  where id = p_batch_id;

  return jsonb_build_object(
    'batch_id', p_batch_id,
    'deleted', v_deleted
  );
end;
$$;

revoke all on function public.unwind_deal_import_batch(uuid) from public;
grant execute on function public.unwind_deal_import_batch(uuid) to service_role;
