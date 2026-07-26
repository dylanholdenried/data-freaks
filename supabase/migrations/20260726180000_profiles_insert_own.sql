-- Allow an authenticated user to create their own profile row (signup / invite claim).
-- Needed when signup runs under the user's JWT (e.g. auth.signUp session on a shared client).
-- Platform admins continue to manage all profiles via profiles_platform_admin_all.

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
on public.profiles
for insert
with check (
  auth.uid() = user_id
  or auth.uid() = id
);
