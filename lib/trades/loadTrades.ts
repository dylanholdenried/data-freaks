import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import type { DateRange } from "@/lib/profit-center/dateRange";
import type {
  TradeDeal,
  TradeDealSalesperson,
  TradeRow,
  TradesBundle,
} from "@/lib/trades/types";

const DEAL_SELECT = "id,sale_date,store_id,department_id";
const TRADE_SELECT =
  "id,deal_id,year,make,model,vin,acv,allowance,exit_strategy";

type TradeDealWithRelations = TradeDeal & {
  trades: TradeRow[] | null;
  deal_salespeople: Omit<TradeDealSalesperson, "deal_id">[] | null;
};

function normalizeTrade(t: TradeRow): TradeRow {
  return {
    ...t,
    year:
      t.year == null || !Number.isFinite(Number(t.year))
        ? null
        : Number(t.year),
    make: t.make == null || t.make === "" ? null : String(t.make),
    model: t.model == null || t.model === "" ? null : String(t.model),
    vin: t.vin == null || t.vin === "" ? null : String(t.vin),
    acv:
      t.acv == null || !Number.isFinite(Number(t.acv)) ? null : Number(t.acv),
    allowance:
      t.allowance == null || !Number.isFinite(Number(t.allowance))
        ? null
        : Number(t.allowance),
    exit_strategy:
      t.exit_strategy == null || t.exit_strategy === ""
        ? null
        : String(t.exit_strategy),
  };
}

/**
 * Load closed deals in range for the given stores, plus their trade rows
 * and deal↔salesperson attributions.
 */
export async function loadTradesBundle(
  supabase: SupabaseClient,
  storeIds: string[],
  range: DateRange
): Promise<TradesBundle> {
  if (storeIds.length === 0) {
    return { deals: [], trades: [], dealSalespeople: [] };
  }

  // Embed trades + splits so related rows ride along with each deals page
  // instead of fanning out into chunked `.in("deal_id")` requests.
  const dealsRes = await fetchAllRows<TradeDealWithRelations>((from, to) =>
    supabase
      .from("deals")
      .select(
        `${DEAL_SELECT},trades(${TRADE_SELECT}),deal_salespeople(salesperson_id,share_percent)`
      )
      .in("store_id", storeIds)
      .eq("status", "closed")
      .gte("sale_date", range.from)
      .lte("sale_date", range.to)
      .order("sale_date", { ascending: true })
      .range(from, to)
  );

  if (dealsRes.error) {
    throw new Error(dealsRes.error.message);
  }

  const trades: TradeRow[] = [];
  const dealSalespeople: TradeDealSalesperson[] = [];
  const deals: TradeDeal[] = dealsRes.data.map(
    ({ trades: dealTrades, deal_salespeople, ...deal }) => {
      for (const t of dealTrades ?? []) trades.push(normalizeTrade(t));
      for (const s of deal_salespeople ?? []) {
        dealSalespeople.push({ deal_id: deal.id, ...s });
      }
      return deal;
    }
  );

  return { deals, trades, dealSalespeople };
}
