-- Add owner_admin to app_role (must commit before the value is used in later SQL).
alter type public.app_role add value if not exists 'owner_admin';
