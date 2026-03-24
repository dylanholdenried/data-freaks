-- Run this in Supabase SQL Editor if you see:
--   "column profiles.user_id does not exist"
-- Your `profiles` table was created without the column the app expects.

-- 1) Add the column (links each profile row to Supabase Auth)
alter table public.profiles
add column if not exists user_id uuid references auth.users (id) on delete cascade;

-- 2) One profile per auth user
create unique index if not exists profiles_user_id_unique on public.profiles (user_id)
where
  user_id is not null;

-- 3) Backfill from Auth by email (run only if your profiles table has an `email` column)
--    If this errors, skip it and set user_id manually in Table Editor.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'email'
  ) then
    update public.profiles p
    set user_id = u.id
    from auth.users u
    where p.user_id is null and p.email is not null and lower(u.email) = lower(p.email);
  end if;
end$$;

-- 4) If any rows still have null user_id, set them manually in Table Editor:
--    user_id = the UUID from Authentication → Users for that person.
