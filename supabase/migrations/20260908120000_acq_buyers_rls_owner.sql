-- Fix acq_buyers RLS so owner_admin can manage buyers for their home group
-- without relying solely on is_platform_admin() (AAL2), and match profile on id OR user_id.

drop policy if exists acq_buyers_select on public.acq_buyers;
create policy acq_buyers_select
  on public.acq_buyers for select
  using (
    public.is_platform_admin()
    or exists (
      select 1 from public.profiles p
      where (p.user_id = auth.uid() or p.id = auth.uid())
        and p.status = 'active'
        and p.dealer_group_id = acq_buyers.dealer_group_id
    )
  );

drop policy if exists acq_buyers_platform_write on public.acq_buyers;
create policy acq_buyers_platform_write
  on public.acq_buyers for all
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

drop policy if exists acq_buyers_group_admin_write on public.acq_buyers;
create policy acq_buyers_group_admin_write
  on public.acq_buyers for all
  using (
    exists (
      select 1 from public.profiles p
      where (p.user_id = auth.uid() or p.id = auth.uid())
        and p.status = 'active'
        and p.role in ('group_admin', 'store_admin', 'owner_admin')
        and p.dealer_group_id = acq_buyers.dealer_group_id
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where (p.user_id = auth.uid() or p.id = auth.uid())
        and p.status = 'active'
        and p.role in ('group_admin', 'store_admin', 'owner_admin')
        and p.dealer_group_id = acq_buyers.dealer_group_id
    )
  );
