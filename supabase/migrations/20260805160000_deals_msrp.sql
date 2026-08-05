-- Optional MSRP on deals (new vehicles); blank allowed on import

alter table public.deals
  add column if not exists msrp numeric(12,2);

comment on column public.deals.msrp is
  'Manufacturer suggested retail price. Typically set for new vehicles; null when unknown or not applicable.';

-- Commit RPC: persist optional msrp from normalized JSON
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
  v_msrp numeric(12,2);
  v_status text;
  v_has_trade boolean;
  v_trade_complete boolean;
  v_has_trade_status boolean;
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

  v_has_trade_status := exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'deals' and column_name = 'trade_status'
  );

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
        if nullif(trim(v_name), '') is null then
          continue;
        end if;
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

  for v_row in
    select * from public.deal_import_rows
    where batch_id = p_batch_id and is_valid = true
    order by row_number
  loop
    v_norm := v_row.normalized;
    v_res := coalesce(v_row.resolved, '{}'::jsonb);

    v_fm_id := null;
    if nullif(v_res->>'finance_manager_id', '') is not null then
      v_fm_id := (v_res->>'finance_manager_id')::uuid;
    elsif nullif(trim(coalesce(v_norm->>'finance_manager', '')), '') is not null then
      select id into v_fm_id
      from public.finance_managers
      where store_id = v_batch.store_id
        and lower(name) = lower(v_norm->>'finance_manager')
      limit 1;
      if v_fm_id is null then
        raise exception 'Row %: finance manager % not found', v_row.row_number, v_norm->>'finance_manager';
      end if;
    end if;

    v_sp1_id := null;
    v_sp2_id := null;
    if nullif(v_res->>'salesperson_1_id', '') is not null then
      v_sp1_id := (v_res->>'salesperson_1_id')::uuid;
    elsif nullif(trim(coalesce(v_norm->>'salesperson_1', '')), '') is not null then
      select id into v_sp1_id
      from public.salespeople
      where store_id = v_batch.store_id
        and lower(name) = lower(v_norm->>'salesperson_1')
      limit 1;
      if v_sp1_id is null then
        raise exception 'Row %: salesperson % not found', v_row.row_number, v_norm->>'salesperson_1';
      end if;
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

    v_list_na := coalesce((v_norm->>'list_price_na')::boolean, false);
    if v_list_na then
      v_list_price := null;
    elsif nullif(v_norm->>'list_price', '') is null then
      v_list_price := null;
    else
      v_list_price := (v_norm->>'list_price')::numeric;
    end if;

    if nullif(v_norm->>'msrp', '') is null then
      v_msrp := null;
    else
      v_msrp := (v_norm->>'msrp')::numeric;
    end if;

    v_status := lower(coalesce(v_norm->>'status', 'pending'));
    if v_status not in ('pending', 'closed') then
      v_status := 'pending';
    end if;

    v_has_trade := lower(coalesce(v_norm->>'has_trade', 'no')) in ('yes', 'y', 'true', '1');
    v_trade_complete := coalesce((v_norm->>'trade_complete')::boolean, false);

    if v_has_trade_status then
      insert into public.deals (
        store_id, department_id, status, trade_status, customer_last_name, sale_date,
        stock_number, vehicle_year, vehicle_make, vehicle_model, vin, trim, color,
        body_style, drivetrain, odometer, age, acquisition_source, finance_type,
        finance_manager_id, front_profit, back_profit, sale_price, list_price,
        list_price_na, msrp, entered_by
      ) values (
        v_batch.store_id,
        (v_res->>'department_id')::uuid,
        v_status::deal_status,
        case when v_has_trade then 'has_trade'::trade_status else 'no_trade'::trade_status end,
        nullif(trim(coalesce(v_norm->>'customer_last_name', '')), ''),
        (v_norm->>'sale_date')::date,
        v_norm->>'stock_number',
        (v_norm->>'vehicle_year')::integer,
        v_norm->>'vehicle_make',
        v_norm->>'vehicle_model',
        nullif(trim(coalesce(v_norm->>'vin', '')), ''),
        nullif(trim(coalesce(v_norm->>'trim', '')), ''),
        nullif(trim(coalesce(v_norm->>'color', '')), ''),
        nullif(trim(coalesce(v_norm->>'body_style', '')), ''),
        nullif(trim(coalesce(v_norm->>'drivetrain', '')), ''),
        case when nullif(v_norm->>'odometer', '') is null then null else (v_norm->>'odometer')::integer end,
        case when nullif(v_norm->>'age', '') is null then null else (v_norm->>'age')::integer end,
        nullif(trim(coalesce(v_norm->>'acquisition_source', '')), ''),
        case
          when nullif(trim(coalesce(v_norm->>'finance_type', '')), '') is null then null
          else (lower(v_norm->>'finance_type'))::finance_type
        end,
        v_fm_id,
        case when nullif(v_norm->>'front_profit', '') is null then null else (v_norm->>'front_profit')::numeric end,
        case when nullif(v_norm->>'back_profit', '') is null then null else (v_norm->>'back_profit')::numeric end,
        case when nullif(v_norm->>'sale_price', '') is null then null else (v_norm->>'sale_price')::numeric end,
        v_list_price,
        v_list_na,
        v_msrp,
        v_batch.uploaded_by
      )
      returning id into v_deal_id;
    else
      insert into public.deals (
        store_id, department_id, status, customer_last_name, sale_date,
        stock_number, vehicle_year, vehicle_make, vehicle_model, vin, trim, color,
        body_style, drivetrain, odometer, age, acquisition_source, finance_type,
        finance_manager_id, front_profit, back_profit, sale_price, list_price,
        list_price_na, msrp, entered_by
      ) values (
        v_batch.store_id,
        (v_res->>'department_id')::uuid,
        v_status::deal_status,
        nullif(trim(coalesce(v_norm->>'customer_last_name', '')), ''),
        (v_norm->>'sale_date')::date,
        v_norm->>'stock_number',
        (v_norm->>'vehicle_year')::integer,
        v_norm->>'vehicle_make',
        v_norm->>'vehicle_model',
        nullif(trim(coalesce(v_norm->>'vin', '')), ''),
        nullif(trim(coalesce(v_norm->>'trim', '')), ''),
        nullif(trim(coalesce(v_norm->>'color', '')), ''),
        nullif(trim(coalesce(v_norm->>'body_style', '')), ''),
        nullif(trim(coalesce(v_norm->>'drivetrain', '')), ''),
        case when nullif(v_norm->>'odometer', '') is null then null else (v_norm->>'odometer')::integer end,
        case when nullif(v_norm->>'age', '') is null then null else (v_norm->>'age')::integer end,
        nullif(trim(coalesce(v_norm->>'acquisition_source', '')), ''),
        case
          when nullif(trim(coalesce(v_norm->>'finance_type', '')), '') is null then null
          else (lower(v_norm->>'finance_type'))::finance_type
        end,
        v_fm_id,
        case when nullif(v_norm->>'front_profit', '') is null then null else (v_norm->>'front_profit')::numeric end,
        case when nullif(v_norm->>'back_profit', '') is null then null else (v_norm->>'back_profit')::numeric end,
        case when nullif(v_norm->>'sale_price', '') is null then null else (v_norm->>'sale_price')::numeric end,
        v_list_price,
        v_list_na,
        v_msrp,
        v_batch.uploaded_by
      )
      returning id into v_deal_id;
    end if;

    update public.deal_import_rows
    set deal_id = v_deal_id
    where id = v_row.id;

    if v_sp1_id is not null and nullif(v_norm->>'salesperson_1_share', '') is not null then
      insert into public.deal_salespeople (deal_id, salesperson_id, share_percent)
      values (v_deal_id, v_sp1_id, (v_norm->>'salesperson_1_share')::numeric);

      if v_sp2_id is not null and nullif(v_norm->>'salesperson_2_share', '') is not null then
        insert into public.deal_salespeople (deal_id, salesperson_id, share_percent)
        values (v_deal_id, v_sp2_id, (v_norm->>'salesperson_2_share')::numeric);
      end if;
    end if;

    if v_has_trade and v_trade_complete then
      insert into public.trades (
        deal_id, year, make, model, acv, allowance, exit_strategy
      ) values (
        v_deal_id,
        (v_norm->>'trade_year')::integer,
        v_norm->>'trade_make',
        v_norm->>'trade_model',
        (v_norm->>'trade_acv')::numeric,
        (v_norm->>'trade_allowance')::numeric,
        (lower(v_norm->>'trade_exit_strategy'))::trade_exit_strategy
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
