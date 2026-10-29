-- Prepare for Supabase's Oct 30 Data API grant change.
--
-- Context:
--   * Existing production table grants already work for authenticated +
--     service_role; anon has no table access (see close_data_api_gaps).
--   * After Oct 30, NEW public tables no longer get automatic Data API grants.
--   * Re-assert authenticated/service_role grants and postgres default
--     privileges so `supabase db reset` / preview branches keep working, and
--     future tables created by migration role stay usable by the app.
--
-- App behavior: unchanged. RLS still gates row access. stores / dealer_groups /
-- deal_events stay SELECT-only for authenticated (writes via service_role).
--
-- Note: altering default privileges for role supabase_admin requires a
-- superuser and is intentionally omitted here.

-- ── 1. Postgres defaults: signed-in + service_role; never anon ───────────────

alter default privileges for role postgres in schema public
  revoke all on tables from anon;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon;
alter default privileges for role postgres in schema public
  revoke execute on functions from anon;

alter default privileges for role postgres in schema public
  grant select, insert, update, delete on tables to authenticated;
alter default privileges for role postgres in schema public
  grant all on tables to service_role;
alter default privileges for role postgres in schema public
  grant usage, select on sequences to authenticated;
alter default privileges for role postgres in schema public
  grant all on sequences to service_role;

-- ── 2. Re-assert grants on every existing public table ───────────────────────

do $$
declare
  r record;
  select_only text[] := array[
    'stores',
    'dealer_groups',
    'deal_events'
  ];
begin
  for r in
    select c.relname as table_name
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and not c.relispartition
    order by c.relname
  loop
    execute format('revoke all on table public.%I from anon', r.table_name);
    execute format('revoke all on table public.%I from public', r.table_name);

    if r.table_name = any (select_only) then
      execute format(
        'revoke insert, update, delete, truncate on table public.%I from authenticated',
        r.table_name
      );
      execute format(
        'grant select on table public.%I to authenticated',
        r.table_name
      );
    else
      execute format(
        'grant select, insert, update, delete on table public.%I to authenticated',
        r.table_name
      );
    end if;

    execute format('grant all on table public.%I to service_role', r.table_name);
  end loop;
end$$;

-- Sequences used by identity / serial columns
do $$
declare
  r record;
begin
  for r in
    select c.relname as seq_name
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'S'
    order by c.relname
  loop
    execute format('revoke all on sequence public.%I from anon', r.seq_name);
    execute format(
      'grant usage, select on sequence public.%I to authenticated',
      r.seq_name
    );
    execute format('grant all on sequence public.%I to service_role', r.seq_name);
  end loop;
end$$;
