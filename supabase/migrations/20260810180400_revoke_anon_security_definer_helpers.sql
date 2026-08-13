-- Prevent anonymous clients from calling SECURITY DEFINER helpers via RPC.
-- Authenticated still needs EXECUTE for RLS policy evaluation.

revoke execute on function public.accessible_store_ids() from anon;
revoke execute on function public.can_mutate_store(uuid) from anon;
revoke execute on function public.current_group_id() from anon;
revoke execute on function public.current_profile_id() from anon;
revoke execute on function public.has_store_access(uuid) from anon;
revoke execute on function public.is_owner_admin() from anon;
revoke execute on function public.is_platform_admin() from anon;
revoke execute on function public.log_deal_created() from anon;
revoke execute on function public.log_deal_status_changed() from anon;
revoke execute on function public.rls_auto_enable() from anon;
