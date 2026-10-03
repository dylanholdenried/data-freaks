import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllByIds, fetchAllRows } from "@/lib/supabase/fetch-all";
import { isPreOwnedDepartment } from "@/lib/buy-box/sale-books";
import type { DateRange } from "@/lib/profit-center/dateRange";
import { LIST_PRICE_ENFORCED_FROM, toNum } from "./metrics";

export type PricingDeal = {
  id: string;
  store_id: string;
  department_id: string;
  sale_date: string;
  stock_number: string | null;
  customer_last_name: string | null;
  vehicle_year: number | null;
  vehicle_make: string | null;
  vehicle_model: string | null;
  trim: string | null;
  age: number | null;
  sale_price: number | null;
  list_price: number | null;
  list_price_na: boolean;
  list_price_source: string | null;
  list_price_at: string | null;
  list_price_entered: number | null;
  sale_pom: number | null;
  sale_inv_disp: string | null;
  finance_type: string | null;
  front_profit: number | null;
  back_profit: number | null;
};

export type PricingDealSalesperson = {
  deal_id: string;
  salesperson_id: string;
  share_percent: number | null;
};

export type PricingTrade = {
  deal_id: string;
  acv: number | null;
  allowance: number | null;
};

export type PricingDepartment = { id: string; name: string; store_id: string };

export type PricingBundle = {
  deals: PricingDeal[];
  dealSalespeople: PricingDealSalesperson[];
  trades: PricingTrade[];
  departments: PricingDepartment[];
};

const DEAL_SELECT =
  "id,store_id,department_id,sale_date,stock_number,customer_last_name," +
  "vehicle_year,vehicle_make,vehicle_model,trim,age," +
  "sale_price,list_price,list_price_na,list_price_source,list_price_at,list_price_entered," +
  "sale_pom,sale_inv_disp,finance_type,front_profit,back_profit";

function normalize(d: PricingDeal): PricingDeal {
  return {
    ...d,
    age: toNum(d.age),
    sale_price: toNum(d.sale_price),
    list_price: toNum(d.list_price),
    list_price_na: Boolean(d.list_price_na),
    list_price_entered: toNum(d.list_price_entered),
    sale_pom: toNum(d.sale_pom),
    front_profit: toNum(d.front_profit),
    back_profit: toNum(d.back_profit),
  };
}

/** Closed pre-owned deals in range with salespeople and trades. */
export async function loadPricingDisciplineDeals(
  supabase: SupabaseClient,
  storeIds: string[],
  range: DateRange
): Promise<PricingBundle> {
  if (storeIds.length === 0) {
    return { deals: [], dealSalespeople: [], trades: [], departments: [] };
  }

  const { data: deptData, error: deptError } = await supabase
    .from("departments")
    .select("id,name,store_id")
    .in("store_id", storeIds)
    .order("name", { ascending: true });
  if (deptError) throw new Error(deptError.message);

  const departments = ((deptData ?? []) as PricingDepartment[]).filter((d) =>
    isPreOwnedDepartment(d.name)
  );
  const deptIds = departments.map((d) => d.id);
  if (deptIds.length === 0) {
    return { deals: [], dealSalespeople: [], trades: [], departments };
  }

  const dealsRes = await fetchAllRows<PricingDeal>((from, to) =>
    supabase
      .from("deals")
      .select(DEAL_SELECT)
      .in("store_id", storeIds)
      .in("department_id", deptIds)
      .eq("status", "closed")
      .gte("sale_date", range.from)
      .lte("sale_date", range.to)
      .order("sale_date", { ascending: false })
      .range(from, to)
  );
  if (dealsRes.error) throw new Error(dealsRes.error.message);

  const deals = dealsRes.data.map(normalize);
  const dealIds = deals.map((d) => d.id);

  const [dspRes, tradesRes] = await Promise.all([
    fetchAllByIds<PricingDealSalesperson>(dealIds, (idChunk, from, to) =>
      supabase
        .from("deal_salespeople")
        .select("deal_id,salesperson_id,share_percent")
        .in("deal_id", idChunk)
        .range(from, to)
    ),
    fetchAllByIds<PricingTrade>(dealIds, (idChunk, from, to) =>
      supabase
        .from("trades")
        .select("deal_id,acv,allowance")
        .in("deal_id", idChunk)
        .range(from, to)
    ),
  ]);
  if (dspRes.error) throw new Error(dspRes.error.message);
  if (tradesRes.error) throw new Error(tradesRes.error.message);

  return {
    deals,
    dealSalespeople: dspRes.data,
    trades: tradesRes.data.map((t) => ({
      ...t,
      acv: toNum(t.acv),
      allowance: toNum(t.allowance),
    })),
    departments,
  };
}

/** Closed pre-owned deals awaiting an admin list price (sold on/after the enforcement date). */
export async function loadMissingListPriceDeals(
  supabase: SupabaseClient,
  storeIds: string[]
): Promise<PricingDeal[]> {
  if (storeIds.length === 0) return [];
  const { data, error } = await supabase
    .from("deals")
    .select(DEAL_SELECT)
    .in("store_id", storeIds)
    .eq("status", "closed")
    .eq("list_price_source", "missing")
    .gte("sale_date", LIST_PRICE_ENFORCED_FROM)
    .order("sale_date", { ascending: false })
    .limit(500);
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as PricingDeal[]).map(normalize);
}
