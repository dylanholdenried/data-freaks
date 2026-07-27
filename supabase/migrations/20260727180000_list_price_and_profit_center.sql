-- List price (required at close; NA voids lost-gross) + import commit support

alter table public.deals
  add column if not exists list_price numeric(12,2),
  add column if not exists list_price_na boolean not null default false;

alter table public.deals
  drop constraint if exists deals_list_price_na_check;

alter table public.deals
  add constraint deals_list_price_na_check
  check (
    (list_price_na = true and list_price is null)
    or (list_price_na = false)
  );

comment on column public.deals.list_price is
  'Asking/list price at sale. Null when list_price_na is true.';
comment on column public.deals.list_price_na is
  'When true, list price was unavailable; exclude deal from lost-gross averages.';

-- Recreate import commit RPC with list_price / list_price_na (preserves roster creation)
create or replace function public.commit_deal_import_batch(p_batch_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch public.deal_import_batches%rowtype;
  v_store_group uuid;
  v_row record;
  v_deal_id uuid;
  v_norm jsonb;
  v_res jsonb;
  v_name text;
  v_id uuid;
  v_created int := 0;
  v_inserted int := 0;
  v_sp1_id uuid;
  v_sp2_id uuid;
  v_fm_id uuid;
  v_list_na boolean;
  v_list_price numeric(12,2);
begin
  select * into v_batch
  from public.deal_import_batches
  where id = p_batch_id
  for update;

  if not found then
    raise exception 'Import batch not found';
  end if;

  if v_batch.status <> 'pending_review' then
    raise exception 'Batch is not pending review (status=%)', v_batch.status;
  end if;

  if v_batch.error_count > 0 or v_batch.valid_count = 0 then
    raise exception 'Batch has validation errors or no valid rows';
  end if;

  select dealer_group_id into v_store_group
  from public.stores
  where id = v_batch.store_id;

  if v_store_group is null or v_store_group <> v_batch.dealer_group_id then
    raise exception 'Store does not belong to the batch dealer group';
  end if;

  if exists (
    select 1 from public.deal_import_rows
    where batch_id = p_batch_id and is_valid = false
  ) then
    raise exception 'Batch contains invalid rows';
  end if;

  -- Create missing salespeople / finance managers / acquisition sources from resolved payloads
  for v_row in
    select * from public.deal_import_rows
    where batch_id = p_batch_id and is_valid = true
    order by row_number
  loop
    v_res := coalesce(v_row.resolved, '{}'::jsonb);

    if v_res ? 'create_salespeople' then
      for v_name in
        select jsonb_array_elements_text(v_res->'create_salespeople')
      loop
        select id into v_id
        from public.salespeople
        where store_id = v_batch.store_id
          and lower(name) = lower(v_name)
        limit 1;
        if v_id is null then
          insert into public.salespeople (store_id, name, active)
          values (v_batch.store_id, v_name, true)
          returning id into v_id;
          v_created := v_created + 1;
        end if;
      end loop;
    end if;

    if v_res ? 'create_finance_manager' and nullif(v_res->>'create_finance_manager', '') is not null then
      v_name := v_res->>'create_finance_manager';
      select id into v_id
      from public.finance_managers
      where store_id = v_batch.store_id
        and lower(name) = lower(v_name)
      limit 1;
      if v_id is null then
        insert into public.finance_managers (store_id, name, active)
        values (v_batch.store_id, v_name, true);
        v_created := v_created + 1;
      end if;
    end if;

    if v_res ? 'create_acquisition_source' and nullif(v_res->>'create_acquisition_source', '') is not null then
      v_name := v_res->>'create_acquisition_source';
      select id into v_id
      from public.acquisition_sources
      where store_id = v_batch.store_id
        and lower(name) = lower(v_name)
      limit 1;
      if v_id is null then
        insert into public.acquisition_sources (store_id, name)
        values (v_batch.store_id, v_name);
        v_created := v_created + 1;
      end if;
    end if;
  end loop;

  -- Insert deals
  for v_row in
    select * from public.deal_import_rows
    where batch_id = p_batch_id and is_valid = true
    order by row_number
  loop
    v_norm := v_row.normalized;
    v_res := coalesce(v_row.resolved, '{}'::jsonb);

    if nullif(v_res->>'finance_manager_id', '') is not null then
      v_fm_id := (v_res->>'finance_manager_id')::uuid;
    else
      select id into v_fm_id
      from public.finance_managers
      where store_id = v_batch.store_id
        and lower(name) = lower(v_norm->>'finance_manager')
      limit 1;
    end if;

    if v_fm_id is null then
      raise exception 'Row %: finance manager % not found', v_row.row_number, v_norm->>'finance_manager';
    end if;

    v_sp1_id := null;
    v_sp2_id := null;
    if nullif(v_res->>'salesperson_1_id', '') is not null then
      v_sp1_id := (v_res->>'salesperson_1_id')::uuid;
    else
      select id into v_sp1_id
      from public.salespeople
      where store_id = v_batch.store_id
        and lower(name) = lower(v_norm->>'salesperson_1')
      limit 1;
    end if;
    if v_sp1_id is null then
      raise exception 'Row %: salesperson % not found', v_row.row_number, v_norm->>'salesperson_1';
    end if;

    if nullif(v_norm->>'salesperson_2', '') is not null then
      if nullif(v_res->>'salesperson_2_id', '') is not null then
        v_sp2_id := (v_res->>'salesperson_2_id')::uuid;
      else
        select id into v_sp2_id
        from public.salespeople
        where store_id = v_batch.store_id
          and lower(name) = lower(v_norm->>'salesperson_2')
        limit 1;
      end if;
      if v_sp2_id is null then
        raise exception 'Row %: salesperson % not found', v_row.row_number, v_norm->>'salesperson_2';
      end if;
    end if;

    -- list_price from normalized JSON (list_price_na boolean + optional numeric)
    v_list_na := coalesce((v_norm->>'list_price_na')::boolean, false);
    if v_list_na then
      v_list_price := null;
    else
      if nullif(v_norm->>'list_price', '') is null then
        raise exception 'Row %: list_price is required', v_row.row_number;
      end if;
      v_list_price := (v_norm->>'list_price')::numeric;
    end if;

    insert into public.deals (
      dealer_group_id,
      store_id,
      department_id,
      status,
      trade_status,
      customer_last_name,
      sale_date,
      stock_number,
      vehicle_year,
      vehicle_make,
      vehicle_model,
      vin,
      trim,
      color,
      body_style,
      drivetrain,
      odometer,
      age,
      acquisition_source,
      finance_type,
      finance_manager_id,
      front_profit,
      back_profit,
      sale_price,
      list_price,
      list_price_na,
      entered_by
    ) values (
      v_batch.dealer_group_id,
      v_batch.store_id,
      (v_res->>'department_id')::uuid,
      'closed',
      case when lower(v_norm->>'has_trade') in ('yes', 'y', 'true', '1')
        then 'has_trade'::trade_status
        else 'no_trade'::trade_status
      end,
      v_norm->>'customer_last_name',
      (v_norm->>'sale_date')::date,
      v_norm->>'stock_number',
      (v_norm->>'vehicle_year')::integer,
      v_norm->>'vehicle_make',
      v_norm->>'vehicle_model',
      v_norm->>'vin',
      v_norm->>'trim',
      v_norm->>'color',
      v_norm->>'body_style',
      v_norm->>'drivetrain',
      (v_norm->>'odometer')::integer,
      (v_norm->>'age')::integer,
      v_norm->>'acquisition_source',
      (v_norm->>'finance_type')::finance_type,
      v_fm_id,
      (v_norm->>'front_profit')::numeric,
      (v_norm->>'back_profit')::numeric,
      (v_norm->>'sale_price')::numeric,
      v_list_price,
      v_list_na,
      v_batch.uploaded_by
    )
    returning id into v_deal_id;

    insert into public.deal_salespeople (deal_id, salesperson_id, share_percent)
    values (v_deal_id, v_sp1_id, (v_norm->>'salesperson_1_share')::numeric);

    if v_sp2_id is not null then
      insert into public.deal_salespeople (deal_id, salesperson_id, share_percent)
      values (v_deal_id, v_sp2_id, (v_norm->>'salesperson_2_share')::numeric);
    end if;

    if lower(v_norm->>'has_trade') in ('yes', 'y', 'true', '1') then
      insert into public.trades (
        deal_id, year, make, model, acv, allowance, exit_strategy
      ) values (
        v_deal_id,
        (v_norm->>'trade_year')::integer,
        v_norm->>'trade_make',
        v_norm->>'trade_model',
        (v_norm->>'trade_acv')::numeric,
        (v_norm->>'trade_allowance')::numeric,
        (v_norm->>'trade_exit_strategy')::trade_exit_strategy
      );
    end if;

    if nullif(trim(coalesce(v_norm->>'notes', '')), '') is not null then
      insert into public.deal_notes (deal_id, note)
      values (v_deal_id, trim(v_norm->>'notes'));
    end if;

    v_inserted := v_inserted + 1;
  end loop;

  update public.deal_import_batches
  set status = 'committed',
      committed_at = now()
  where id = p_batch_id;

  return jsonb_build_object(
    'batch_id', p_batch_id,
    'inserted', v_inserted,
    'created_refs', v_created
  );
end;
$$;

revoke all on function public.commit_deal_import_batch(uuid) from public;
grant execute on function public.commit_deal_import_batch(uuid) to service_role;
