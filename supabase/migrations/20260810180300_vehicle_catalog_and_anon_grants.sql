-- Vehicle catalog: any authenticated user may read; only platform staff may write.

drop policy if exists "p_makes_read" on public.vehicle_makes;
drop policy if exists "p_makes_write" on public.vehicle_makes;
drop policy if exists "p_makes_update" on public.vehicle_makes;

drop policy if exists "p_models_read" on public.vehicle_models;
drop policy if exists "p_models_write" on public.vehicle_models;
drop policy if exists "p_models_update" on public.vehicle_models;

create policy "vehicle_makes_select"
on public.vehicle_makes
for select
to authenticated
using (true);

create policy "vehicle_makes_insert"
on public.vehicle_makes
for insert
to authenticated
with check (public.is_platform_admin());

create policy "vehicle_makes_update"
on public.vehicle_makes
for update
to authenticated
using (public.is_platform_admin())
with check (public.is_platform_admin());

create policy "vehicle_models_select"
on public.vehicle_models
for select
to authenticated
using (true);

create policy "vehicle_models_insert"
on public.vehicle_models
for insert
to authenticated
with check (public.is_platform_admin());

create policy "vehicle_models_update"
on public.vehicle_models
for update
to authenticated
using (public.is_platform_admin())
with check (public.is_platform_admin());

-- Reduce GraphQL / PostgREST schema exposure for anon on sensitive tables.
-- RLS already denies rows; this removes table visibility for anonymous clients.
revoke select on table public.audit_logs from anon;
revoke select on table public.dealer_group_requests from anon;
revoke select on table public.deal_import_batches from anon;
revoke select on table public.deal_import_rows from anon;
revoke select on table public.profiles from anon;
revoke select on table public.user_store_access from anon;
