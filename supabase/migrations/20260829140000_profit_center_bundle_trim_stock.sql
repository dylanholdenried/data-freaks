-- Enrich profit_center_deal_bundle with trim + stock_number for cohort drill-downs.

create or replace function public.profit_center_deal_bundle(
  p_store_ids uuid[],
  p_from date,
  p_to date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_store_ids uuid[];
  v_result jsonb;
begin
  if p_store_ids is null or cardinality(p_store_ids) = 0 then
    return jsonb_build_object(
      'deals', '[]'::jsonb,
      'trades', '[]'::jsonb,
      'deal_salespeople', '[]'::jsonb
    );
  end if;

  if p_from is null or p_to is null or p_from > p_to then
    raise exception 'invalid date range';
  end if;

  select coalesce(array_agg(s.id), '{}'::uuid[])
  into v_store_ids
  from unnest(p_store_ids) as s(id)
  where public.has_store_access(s.id);

  if cardinality(v_store_ids) = 0 then
    return jsonb_build_object(
      'deals', '[]'::jsonb,
      'trades', '[]'::jsonb,
      'deal_salespeople', '[]'::jsonb
    );
  end if;

  with closed_deals as (
    select
      d.id,
      d.sale_date,
      d.store_id,
      d.department_id,
      d.vehicle_year,
      d.vehicle_make,
      d.vehicle_model,
      d.trim,
      d.stock_number,
      d.body_style,
      d.acquisition_source,
      d.finance_type,
      d.front_profit,
      d.back_profit,
      d.sale_price,
      d.list_price,
      coalesce(d.list_price_na, false) as list_price_na,
      d.age,
      d.odometer
    from public.deals d
    where d.store_id = any (v_store_ids)
      and d.status = 'closed'
      and d.sale_date >= p_from
      and d.sale_date <= p_to
    order by d.sale_date asc
  )
  select jsonb_build_object(
    'deals',
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'id', cd.id,
              'sale_date', cd.sale_date,
              'store_id', cd.store_id,
              'department_id', cd.department_id,
              'vehicle_year', cd.vehicle_year,
              'vehicle_make', cd.vehicle_make,
              'vehicle_model', cd.vehicle_model,
              'trim', cd.trim,
              'stock_number', cd.stock_number,
              'body_style', cd.body_style,
              'acquisition_source', cd.acquisition_source,
              'finance_type', cd.finance_type,
              'front_profit', cd.front_profit,
              'back_profit', cd.back_profit,
              'sale_price', cd.sale_price,
              'list_price', cd.list_price,
              'list_price_na', cd.list_price_na,
              'age', cd.age,
              'odometer', cd.odometer
            )
            order by cd.sale_date asc
          )
          from closed_deals cd
        ),
        '[]'::jsonb
      ),
    'trades',
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'deal_id', t.deal_id,
              'acv', t.acv,
              'allowance', t.allowance
            )
          )
          from public.trades t
          where t.deal_id in (select cd.id from closed_deals cd)
        ),
        '[]'::jsonb
      ),
    'deal_salespeople',
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'deal_id', ds.deal_id,
              'salesperson_id', ds.salesperson_id,
              'share_percent', ds.share_percent
            )
          )
          from public.deal_salespeople ds
          where ds.deal_id in (select cd.id from closed_deals cd)
        ),
        '[]'::jsonb
      )
  )
  into v_result;

  return v_result;
end;
$$;

revoke all on function public.profit_center_deal_bundle(uuid[], date, date) from public;
revoke all on function public.profit_center_deal_bundle(uuid[], date, date) from anon;
grant execute on function public.profit_center_deal_bundle(uuid[], date, date) to authenticated;
grant execute on function public.profit_center_deal_bundle(uuid[], date, date) to service_role;
