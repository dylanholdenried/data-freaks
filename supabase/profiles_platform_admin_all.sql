-- Platform admins can manage all profiles (insert/update/delete/select).
drop policy if exists "profiles_platform_admin_all" on public.profiles;
create policy "profiles_platform_admin_all"
on public.profiles
for all
using (is_platform_admin())
with check (is_platform_admin());
