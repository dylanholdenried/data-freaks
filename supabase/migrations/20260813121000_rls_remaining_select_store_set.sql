-- Finish SELECT policies that still called has_store_access() per row.
-- store_admin / store_viewer already use accessible_store_ids() on deals/dashboard
-- tables; these leftovers are deal-detail, setup, and inventory.

drop policy if exists "deal_events_select_store_access" on public.deal_events;
create policy "deal_events_select_store_access"
on public.deal_events
for select
using (
  exists (
    select 1 from public.deals d
    where d.id = deal_events.deal_id
      and d.store_id in (select public.accessible_store_ids())
  )
);

drop policy if exists "p_deal_flags_read" on public.deal_flags;
create policy "p_deal_flags_read"
on public.deal_flags
for select
using (
  exists (
    select 1 from public.deals d
    where d.id = deal_flags.deal_id
      and d.store_id in (select public.accessible_store_ids())
  )
);

drop policy if exists "department_makes_select" on public.department_makes;
create policy "department_makes_select"
on public.department_makes
for select
using (
  exists (
    select 1 from public.departments d
    where d.id = department_makes.department_id
      and d.store_id in (select public.accessible_store_ids())
  )
);

drop policy if exists "inv_daily_metrics_select" on public.inv_daily_metrics;
create policy "inv_daily_metrics_select"
on public.inv_daily_metrics
for select
using (store_id in (select public.accessible_store_ids()));

drop policy if exists "inv_movements_select" on public.inv_movements;
create policy "inv_movements_select"
on public.inv_movements
for select
using (store_id in (select public.accessible_store_ids()));

drop policy if exists "inv_price_actions_select" on public.inv_price_actions;
create policy "inv_price_actions_select"
on public.inv_price_actions
for select
using (store_id in (select public.accessible_store_ids()));

drop policy if exists "inv_snapshots_select" on public.inv_snapshots;
create policy "inv_snapshots_select"
on public.inv_snapshots
for select
using (store_id in (select public.accessible_store_ids()));

drop policy if exists "inv_units_select" on public.inv_units;
create policy "inv_units_select"
on public.inv_units
for select
using (
  exists (
    select 1 from public.inv_snapshots s
    where s.id = inv_units.snapshot_id
      and s.store_id in (select public.accessible_store_ids())
  )
);
