-- Ensure calendar day upserts can target (store_id, date).
create unique index if not exists store_calendar_days_store_id_date_unique
  on public.store_calendar_days (store_id, date);
