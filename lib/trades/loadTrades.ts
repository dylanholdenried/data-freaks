import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllByIds, fetchAllRows } from "@/lib/supabase/fetch-all";
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

  const dealsRes = await fetchAllRows<TradeDeal>((from, to) =>
    supabase
      .from("deals")
      .select(DEAL_SELECT)
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

  const deals = dealsRes.data;
  const dealIds = deals.map((d) => d.id);

  const [tradesRes, dspRes] = await Promise.all([
    fetchAllByIds<TradeRow>(dealIds, (idChunk, from, to) =>
      supabase
        .from("trades")
        .select(TRADE_SELECT)
        .in("deal_id", idChunk)
        .range(from, to)
    ),
    fetchAllByIds<TradeDealSalesperson>(dealIds, (idChunk, from, to) =>
      supabase
        .from("deal_salespeople")
        .select("deal_id,salesperson_id,share_percent")
        .in("deal_id", idChunk)
        .range(from, to)
    ),
  ]);

  if (tradesRes.error) {
    throw new Error(tradesRes.error.message);
  }
  if (dspRes.error) {
    throw new Error(dspRes.error.message);
  }

  return {
    deals,
    trades: tradesRes.data.map(normalizeTrade),
    dealSalespeople: dspRes.data,
  };
}
