-- Prevention indexes after Centralia roster dedupe (data merge already applied 2026-07-28).
-- Normalized unique name per store: NBSP → space, collapse whitespace, lower+trim.

create unique index if not exists salespeople_store_normalized_name_uidx
  on public.salespeople (
    store_id,
    (lower(trim(both from regexp_replace(replace(name, E'\u00A0', ' '), '\s+', ' ', 'g'))))
  );

create unique index if not exists finance_managers_store_normalized_name_uidx
  on public.finance_managers (
    store_id,
    (lower(trim(both from regexp_replace(replace(name, E'\u00A0', ' '), '\s+', ' ', 'g'))))
  );
