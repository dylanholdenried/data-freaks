import { createSupabaseServerClient } from "@/lib/supabase/server";
import { profileMatchAuthUserId } from "@/lib/supabase/profile-match";
import { fetchAllByIds, fetchAllRows } from "@/lib/supabase/fetch-all";
import { getEffectiveDealerGroupId } from "@/lib/dealer-group-context";
import { getAccessibleStores } from "@/lib/store-access";
import {
  resolveDateRange,
  type DatePreset,
} from "@/lib/profit-center/dateRange";
import type {
  ProfitDeal,
  ProfitDealSalesperson,
  ProfitTrade,
} from "@/lib/profit-center/aggregate";
import SelectAutoGroupEmptyState from "../SelectAutoGroupEmptyState";
import ProfitCenterClient from "./ProfitCenterClient";

type Store = { id: string; name: string };
type Salesperson = { id: string; name: string; store_id: string };

const PRESETS = new Set<DatePreset>([
  "mtd",
  "ytd",
  "last_month",
  "last_3_months",
  "last_6_months",
  "last_12_months",
  "month",
  "custom",
]);

function parsePreset(raw: string | undefined): DatePreset {
  if (raw && PRESETS.has(raw as DatePreset)) return raw as DatePreset;
  return "mtd";
}

export default async function ProfitCenterPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const supabase = createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, dealer_group_id, role")
    .or(profileMatchAuthUserId(session!.user.id))
    .maybeSingle();

  const dealerGroupId = await getEffectiveDealerGroupId(profile);

  if (!dealerGroupId || !profile) {
    return <SelectAutoGroupEmptyState />;
  }

  const stores = (await getAccessibleStores(supabase, profile)) as Store[];
  const storeIds = stores.map((s) => s.id);

  const preset = parsePreset(
    typeof searchParams.preset === "string" ? searchParams.preset : undefined
  );
  const yearParam =
    typeof searchParams.year === "string" ? parseInt(searchParams.year, 10) : NaN;
  const monthParam =
    typeof searchParams.month === "string" ? parseInt(searchParams.month, 10) : NaN;
  const customFrom =
    typeof searchParams.from === "string" ? searchParams.from : undefined;
  const customTo =
    typeof searchParams.to === "string" ? searchParams.to : undefined;

  const now = new Date();
  const range = resolveDateRange(preset, {
    now,
    year: Number.isFinite(yearParam) ? yearParam : now.getFullYear(),
    month: Number.isFinite(monthParam) ? monthParam : now.getMonth() + 1,
    customFrom,
    customTo,
  });

  if (storeIds.length === 0) {
    return (
      <ProfitCenterClient
        stores={[]}
        deals={[]}
        trades={[]}
        salespeople={[]}
        dealSalespeople={[]}
        preset={preset}
        year={Number.isFinite(yearParam) ? yearParam : now.getFullYear()}
        month={Number.isFinite(monthParam) ? monthParam : now.getMonth() + 1}
        customFrom={range.from}
        customTo={range.to}
        range={range}
      />
    );
  }

  const [dealsRes, spRes] = await Promise.all([
    fetchAllRows<ProfitDeal>((from, to) =>
      supabase
        .from("deals")
        .select(
          "id,sale_date,store_id,vehicle_year,vehicle_make,vehicle_model,body_style," +
            "acquisition_source,finance_type,front_profit,back_profit,sale_price," +
            "list_price,list_price_na,age"
        )
        .in("store_id", storeIds)
        .eq("status", "closed")
        .gte("sale_date", range.from)
        .lte("sale_date", range.to)
        .order("sale_date", { ascending: true })
        .range(from, to)
    ),
    supabase
      .from("salespeople")
      .select("id,name,store_id")
      .in("store_id", storeIds),
  ]);

  let deals = dealsRes.data;

  // Fallback if migration not yet applied (list_price columns missing)
  if (dealsRes.error?.message?.includes("list_price")) {
    const fallback = await fetchAllRows<
      Omit<ProfitDeal, "list_price" | "list_price_na">
    >((from, to) =>
      supabase
        .from("deals")
        .select(
          "id,sale_date,store_id,vehicle_year,vehicle_make,vehicle_model,body_style," +
            "acquisition_source,finance_type,front_profit,back_profit,sale_price,age"
        )
        .in("store_id", storeIds)
        .eq("status", "closed")
        .gte("sale_date", range.from)
        .lte("sale_date", range.to)
        .order("sale_date", { ascending: true })
        .range(from, to)
    );
    deals = fallback.data.map((d) => ({
      ...d,
      list_price: null,
      list_price_na: true,
    }));
  } else if (dealsRes.error) {
    throw new Error(dealsRes.error.message);
  }

  for (const d of deals) {
    if (typeof d.list_price_na !== "boolean") {
      (d as { list_price_na: boolean }).list_price_na = false;
    }
  }

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
  const trades = tradesRes.data;
  const dealSalespeople = dspRes.data;

  const salespeople = (spRes.data ?? []) as Salesperson[];

  return (
    <ProfitCenterClient
      stores={stores}
      deals={deals}
      trades={trades}
      salespeople={salespeople}
      dealSalespeople={dealSalespeople}
      preset={preset}
      year={Number.isFinite(yearParam) ? yearParam : now.getFullYear()}
      month={Number.isFinite(monthParam) ? monthParam : now.getMonth() + 1}
      customFrom={customFrom ?? range.from}
      customTo={customTo ?? range.to}
      range={range}
    />
  );
}
