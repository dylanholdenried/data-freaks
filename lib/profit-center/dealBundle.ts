import type {
  ProfitDeal,
  ProfitDealSalesperson,
  ProfitTrade,
} from "@/lib/profit-center/aggregate";
import type { DateRange } from "@/lib/profit-center/dateRange";

export type ProfitCenterDealBundle = {
  deals: ProfitDeal[];
  trades: ProfitTrade[];
  dealSalespeople: ProfitDealSalesperson[];
};

/** Slice a wider bundle down to an inclusive sale_date window. */
export function sliceDealBundleToRange(
  bundle: ProfitCenterDealBundle,
  range: DateRange
): ProfitCenterDealBundle {
  const deals = bundle.deals.filter(
    (d) => d.sale_date >= range.from && d.sale_date <= range.to
  );
  const idSet = new Set(deals.map((d) => d.id));
  return {
    deals,
    trades: bundle.trades.filter((t) => idSet.has(t.deal_id)),
    dealSalespeople: bundle.dealSalespeople.filter((r) =>
      idSet.has(r.deal_id)
    ),
  };
}

/** True when `outer` fully contains `inner` on the calendar. */
export function rangeContains(outer: DateRange, inner: DateRange): boolean {
  return outer.from <= inner.from && outer.to >= inner.to;
}
