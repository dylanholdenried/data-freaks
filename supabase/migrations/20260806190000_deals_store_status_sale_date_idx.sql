-- Speed Profit Center (and similar) closed-deal date-range filters.
-- Matches: store_id IN (...) AND status = 'closed' AND sale_date BETWEEN ...

create index if not exists deals_store_status_sale_date_idx
  on public.deals (store_id, status, sale_date);
