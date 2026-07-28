-- Production deals is missing trade_status (schema snapshot has it; live DB does not).
-- Import commit RPC inserts trade_status; add the column so confirm can succeed.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'trade_status') then
    create type public.trade_status as enum ('no_trade', 'has_trade');
  end if;
end
$$;

alter table public.deals
  add column if not exists trade_status public.trade_status not null default 'no_trade';

comment on column public.deals.trade_status is
  'Whether the deal includes a trade-in (has_trade) or not (no_trade).';
