-- Align dealer_groups RLS with schema intent:
-- platform staff can read/manage all groups; members can select their own.
-- Removes legacy p_groups_read (id = current_group_id()) which blocked
-- platform admins from reading plan for cookie-selected store views.

drop policy if exists "p_groups_read" on public.dealer_groups;
drop policy if exists "dealer_groups_platform_admin_all" on public.dealer_groups;
drop policy if exists "dealer_groups_group_members_select" on public.dealer_groups;

create policy "dealer_groups_platform_admin_all"
on public.dealer_groups
for all
using (public.is_platform_admin())
with check (public.is_platform_admin());

create policy "dealer_groups_group_members_select"
on public.dealer_groups
for select
using (
  exists (
    select 1 from public.profiles p
    where p.dealer_group_id = dealer_groups.id
      and (p.user_id = auth.uid() or p.id = auth.uid())
      and p.status = 'active'
  )
);
