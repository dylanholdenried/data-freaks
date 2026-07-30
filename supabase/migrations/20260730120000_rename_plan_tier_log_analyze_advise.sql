-- Rename plan_tier enum values to match product tiers:
--   free    -> log
--   paid    -> analyze
--   premium -> advise
-- Apply via Supabase MCP / SQL editor (not auto-applied by the app).

alter type public.plan_tier rename value 'free' to 'log';
alter type public.plan_tier rename value 'paid' to 'analyze';
alter type public.plan_tier rename value 'premium' to 'advise';

alter table public.dealer_groups
  alter column plan set default 'log'::public.plan_tier;
