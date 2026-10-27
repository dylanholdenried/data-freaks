import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllByIds, fetchAllRows } from "@/lib/supabase/fetch-all";
import type {
  ProfitDeal,
  ProfitDealSalesperson,
  ProfitTrade,
} from "@/lib/profit-center/aggregate";
import type { DateRange } from "@/lib/profit-center/dateRange";
import type { ProfitCenterDealBundle } from "@/lib/profit-center/dealBundle";
import {
  catalogFieldsForStored,
  type CatalogMake,
  type CatalogModel,
} from "@/lib/vehicle-catalog";

export type { ProfitCenterDealBundle };

type RpcBundle = {
  deals?: ProfitDeal[] | null;
  trades?: ProfitTrade[] | null;
  deal_salespeople?: ProfitDealSalesperson[] | null;
};

/**
 * Profit Center groups by the saved make/model text. Spellings like Sierra + trim
 * 1500, Transit 350, and CHEV never join Sierra 1500, Transit, or Chevrolet.
 * Resolve those here. Closed-deal updates also rerun inventory pricing, so the
 * stored row is left alone.
 */
async function canonicalizeDeals(
  supabase: SupabaseClient,
  deals: ProfitDeal[]
): Promise<ProfitDeal[]> {
  if (deals.length === 0) return deals;
  const [makesRes, modelsRes] = await Promise.all([
    supabase.from("vehicle_makes").select("id,name").eq("active", true),
    supabase.from("vehicle_models").select("id,name,make_id").eq("active", true),
  ]);
  if (makesRes.error || modelsRes.error || !makesRes.data?.length) return deals;
  const makes = makesRes.data as CatalogMake[];
  const models = (modelsRes.data ?? []) as CatalogModel[];
  return deals.map((deal) => {
    const fields = catalogFieldsForStored(
      deal.vehicle_make ?? "",
      deal.vehicle_model ?? "",
      makes,
      models,
      deal.trim ?? ""
    );
    return {
      ...deal,
      vehicle_make: fields.makeName || deal.vehicle_make,
      vehicle_model: fields.modelName || deal.vehicle_model,
    };
  });
}

function normalizeDeal(d: ProfitDeal): ProfitDeal {
  return {
    ...d,
    list_price_na:
      typeof d.list_price_na === "boolean" ? d.list_price_na : false,
    department_id: d.department_id === undefined ? null : d.department_id,
    trim: d.trim == null || d.trim === "" ? null : String(d.trim),
    stock_number:
      d.stock_number == null || d.stock_number === ""
        ? null
        : String(d.stock_number),
    odometer:
      d.odometer == null || !Number.isFinite(Number(d.odometer))
        ? null
        : Number(d.odometer),
  };
}

const DEAL_SELECT =
  "id,sale_date,store_id,department_id,vehicle_year,vehicle_make,vehicle_model,trim,stock_number,body_style," +
  "acquisition_source,finance_type,front_profit,back_profit,sale_price," +
  "list_price,list_price_na,age,odometer";

const DEAL_SELECT_NO_LIST =
  "id,sale_date,store_id,department_id,vehicle_year,vehicle_make,vehicle_model,trim,stock_number,body_style," +
  "acquisition_source,finance_type,front_profit,back_profit,sale_price,age,odometer";

function isMissingRpcError(message: string | undefined): boolean {
  if (!message) return false;
  const m = message.toLowerCase();
  return (
    m.includes("profit_center_deal_bundle") ||
    m.includes("could not find the function") ||
    m.includes("function public.profit_center_deal_bundle") ||
    (m.includes("does not exist") && m.includes("profit_center"))
  );
}

/**
 * Legacy multi-request path used when the RPC is not yet deployed.
 */
async function loadProfitCenterDealsPaged(
  supabase: SupabaseClient,
  storeIds: string[],
  range: DateRange
): Promise<ProfitCenterDealBundle> {
  const dealsRes = await fetchAllRows<ProfitDeal>((from, to) =>
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

  let deals = dealsRes.data;

  if (dealsRes.error?.message?.includes("list_price")) {
    const fallback = await fetchAllRows<
      Omit<ProfitDeal, "list_price" | "list_price_na">
    >((from, to) =>
      supabase
        .from("deals")
        .select(DEAL_SELECT_NO_LIST)
        .in("store_id", storeIds)
        .eq("status", "closed")
        .gte("sale_date", range.from)
        .lte("sale_date", range.to)
        .order("sale_date", { ascending: true })
        .range(from, to)
    );
    if (fallback.error) {
      throw new Error(fallback.error.message);
    }
    deals = fallback.data.map((d) => ({
      ...d,
      list_price: null,
      list_price_na: true,
    }));
  } else if (dealsRes.error) {
    throw new Error(dealsRes.error.message);
  }

  deals = await canonicalizeDeals(supabase, deals.map(normalizeDeal));

  const dealIds = deals.map((d) => d.id);
  const [tradesRes, dspRes] = await Promise.all([
    fetchAllByIds<ProfitTrade>(dealIds, (idChunk, from, to) =>
      supabase
        .from("trades")
        .select("deal_id,acv,allowance")
        .in("deal_id", idChunk)
        .range(from, to)
    ),
    fetchAllByIds<ProfitDealSalesperson>(dealIds, (idChunk, from, to) =>
      supabase
        .from("deal_salespeople")
        .select("deal_id,salesperson_id,share_percent")
        .in("deal_id", idChunk)
        .range(from, to)
    ),
  ]);

  if (tradesRes.error) throw new Error(tradesRes.error.message);
  if (dspRes.error) throw new Error(dspRes.error.message);

  return {
    deals,
    trades: tradesRes.data,
    dealSalespeople: dspRes.data,
  };
}

/**
 * Load closed deals + related trades / deal_salespeople for Profit Center.
 * Prefers a single Postgres RPC; falls back to paged PostgREST if missing.
 */
export async function loadProfitCenterDeals(
  supabase: SupabaseClient,
  storeIds: string[],
  range: DateRange
): Promise<ProfitCenterDealBundle> {
  if (storeIds.length === 0) {
    return { deals: [], trades: [], dealSalespeople: [] };
  }

  const { data, error } = await supabase.rpc("profit_center_deal_bundle", {
    p_store_ids: storeIds,
    p_from: range.from,
    p_to: range.to,
  });

  if (error) {
    if (isMissingRpcError(error.message)) {
      return loadProfitCenterDealsPaged(supabase, storeIds, range);
    }
    throw new Error(error.message);
  }

  const bundle = (data ?? {}) as RpcBundle;
  return {
    deals: await canonicalizeDeals(supabase, (bundle.deals ?? []).map(normalizeDeal)),
    trades: bundle.trades ?? [],
    dealSalespeople: bundle.deal_salespeople ?? [],
  };
}
