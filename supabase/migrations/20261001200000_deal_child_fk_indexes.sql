-- Cover deal child-table foreign keys flagged by the Supabase performance advisor.
-- Sales Registry embeds deal_salespeople per deal; without deal_id indexed each
-- deal row seq-scanned the whole table (~0.4s per 1000-deal page).

create index if not exists deal_salespeople_deal_id_idx
  on public.deal_salespeople (deal_id);

create index if not exists deal_salespeople_salesperson_id_idx
  on public.deal_salespeople (salesperson_id);

create index if not exists deal_notes_deal_id_idx
  on public.deal_notes (deal_id);
