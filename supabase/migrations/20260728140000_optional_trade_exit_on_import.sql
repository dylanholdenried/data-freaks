-- Allow imported trades without an exit strategy (nullable).
-- Manual close UI still requires exit_strategy when trade rows exist.

alter table public.trades
  alter column exit_strategy drop not null;

comment on column public.trades.exit_strategy is
  'Trade disposition plan. Nullable for imported deals; required when closing via the deal edit UI.';
