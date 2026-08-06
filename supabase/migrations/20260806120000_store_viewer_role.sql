-- Add store_viewer to app_role (must commit before the value is used in later SQL).
alter type public.app_role add value if not exists 'store_viewer';
