-- Tighten deal_flags RLS: store-scoped reads + mutate via can_mutate_store.
-- Prior policies used current_group_id(), which allowed any group member
-- (including store_viewer) to write flags for other stores in the same group.

drop policy if exists "p_deal_flags_read" on public.deal_flags;
create policy "p_deal_flags_read"
on public.deal_flags
for select
using (
  exists (
    select 1 from public.deals d
    where d.id = deal_flags.deal_id
      and public.has_store_access(d.store_id)
  )
);

drop policy if exists "p_deal_flags_write" on public.deal_flags;
create policy "p_deal_flags_write"
on public.deal_flags
for insert
with check (
  exists (
    select 1 from public.deals d
    where d.id = deal_flags.deal_id
      and public.can_mutate_store(d.store_id)
  )
);

drop policy if exists "p_deal_flags_update" on public.deal_flags;
create policy "p_deal_flags_update"
on public.deal_flags
for update
using (
  exists (
    select 1 from public.deals d
    where d.id = deal_flags.deal_id
      and public.can_mutate_store(d.store_id)
  )
)
with check (
  exists (
    select 1 from public.deals d
    where d.id = deal_flags.deal_id
      and public.can_mutate_store(d.store_id)
  )
);

drop policy if exists "p_deal_flags_delete" on public.deal_flags;
create policy "p_deal_flags_delete"
on public.deal_flags
for delete
using (
  exists (
    select 1 from public.deals d
    where d.id = deal_flags.deal_id
      and public.can_mutate_store(d.store_id)
  )
);
