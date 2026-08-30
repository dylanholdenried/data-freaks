import { PRICE_BANDS, priceBandForSalePrice } from "./priceBands";
import {
  ODOMETER_BANDS,
  odometerBandForMiles,
} from "./odometerBands";
import { dealTradeHold, lostGross, mean, sum } from "./metrics";
import { inferTruckClass, TRUCK_CLASS_LABELS } from "./truckClass";

export type ProfitDeal = {
  id: string;
  sale_date: string;
  store_id: string;
  department_id: string | null;
  vehicle_year: number;
  vehicle_make: string;
  vehicle_model: string;
  trim: string | null;
  stock_number: string | null;
  body_style: string | null;
  acquisition_source: string | null;
  finance_type: string | null;
  front_profit: number | null;
  back_profit: number | null;
  sale_price: number | null;
  list_price: number | null;
  list_price_na: boolean;
  age: number | null;
  odometer: number | null;
};

export type ProfitTrade = {
  deal_id: string;
  acv: number | null;
  allowance: number | null;
};

export type ProfitDealSalesperson = {
  deal_id: string;
  salesperson_id: string;
  share_percent: number;
};

export type Dimension =
  | "make"
  | "model"
  | "year"
  | "trim"
  | "price"
  | "odometer"
  | "acquisition"
  | "body_style"
  | "truck_class"
  | "department"
  | "salesperson";

export type RollupRow = {
  key: string;
  label: string;
  volume: number;
  front: number;
  back: number;
  total: number;
  avgFront: number | null;
  avgBack: number | null;
  avgTotal: number | null;
  avgAge: number | null;
  avgSalePrice: number | null;
  trades: number;
  tradePct: number | null;
  primePct: number | null;
  subprimePct: number | null;
  cashPct: number | null;
  /** Salesperson-only extras */
  avgLostGross: number | null;
  avgTradeHold: number | null;
  isTotal?: boolean;
};

export type AggregateContext = {
  deals: ProfitDeal[];
  tradesByDeal: Map<string, ProfitTrade[]>;
  dealSalespeople: ProfitDealSalesperson[];
  salespersonNames: Map<string, string>;
  departmentNames: Map<string, string>;
};

function n(v: number | null | undefined): number {
  return v == null || !Number.isFinite(v) ? 0 : v;
}

function dimensionKey(
  deal: ProfitDeal,
  dim: Dimension,
  ctx: AggregateContext
): { key: string; label: string }[] {
  switch (dim) {
    case "make":
      return [{ key: deal.vehicle_make || "(Unknown)", label: deal.vehicle_make || "(Unknown)" }];
    case "model": {
      const label = `${deal.vehicle_make} ${deal.vehicle_model}`.trim() || "(Unknown)";
      return [{ key: label.toLowerCase(), label }];
    }
    case "year":
      return [
        {
          key: String(deal.vehicle_year || 0),
          label: deal.vehicle_year ? String(deal.vehicle_year) : "(Unknown)",
        },
      ];
    case "trim": {
      const trim = deal.trim?.trim() || "(Unknown)";
      return [{ key: trim.toLowerCase(), label: trim }];
    }
    case "price": {
      const band = priceBandForSalePrice(deal.sale_price);
      if (!band) return [{ key: "(no price)", label: "(No sale price)" }];
      return [{ key: band.id, label: band.label }];
    }
    case "odometer": {
      const band = odometerBandForMiles(deal.odometer);
      if (!band) return [{ key: "(no odometer)", label: "(No odometer)" }];
      return [{ key: band.id, label: band.label }];
    }
    case "acquisition": {
      const src = deal.acquisition_source?.trim() || "(Unknown)";
      return [{ key: src.toLowerCase(), label: src }];
    }
    case "body_style": {
      const bs = deal.body_style?.trim() || "(Unknown)";
      return [{ key: bs.toLowerCase(), label: bs }];
    }
    case "truck_class": {
      const label = inferTruckClass(deal.vehicle_make, deal.vehicle_model);
      return [{ key: label.toLowerCase(), label }];
    }
    case "department": {
      if (!deal.department_id) {
        return [{ key: "(unassigned)", label: "(Unassigned)" }];
      }
      return [
        {
          key: deal.department_id,
          label: ctx.departmentNames.get(deal.department_id) ?? "Unknown",
        },
      ];
    }
    case "salesperson": {
      const splits = ctx.dealSalespeople.filter((s) => s.deal_id === deal.id);
      if (splits.length === 0) {
        return [{ key: "(unassigned)", label: "(Unassigned)" }];
      }
      return splits.map((s) => ({
        key: s.salesperson_id,
        label: ctx.salespersonNames.get(s.salesperson_id) ?? "Unknown",
      }));
    }
    default:
      return [{ key: "?", label: "?" }];
  }
}

function buildRow(
  key: string,
  label: string,
  deals: ProfitDeal[],
  ctx: AggregateContext,
  opts?: { isTotal?: boolean; salespersonId?: string }
): RollupRow {
  const volume = deals.length;
  const fronts = deals.map((d) => n(d.front_profit));
  const backs = deals.map((d) => n(d.back_profit));
  const front = sum(fronts);
  const back = sum(backs);
  const total = front + back;

  const frontValues = deals
    .map((d) => d.front_profit)
    .filter((v): v is number => v != null && Number.isFinite(v));
  const backValues = deals
    .map((d) => d.back_profit)
    .filter((v): v is number => v != null && Number.isFinite(v));
  const totalValues: number[] = [];
  for (const d of deals) {
    if (
      d.front_profit != null &&
      Number.isFinite(d.front_profit) &&
      d.back_profit != null &&
      Number.isFinite(d.back_profit)
    ) {
      totalValues.push(d.front_profit + d.back_profit);
    }
  }

  const ages = deals.map((d) => d.age).filter((a): a is number => a != null && Number.isFinite(a));
  const salePrices = deals
    .map((d) => d.sale_price)
    .filter((p): p is number => p != null && Number.isFinite(p));

  let tradeCount = 0;
  for (const d of deals) {
    const trades = ctx.tradesByDeal.get(d.id) ?? [];
    if (trades.length > 0) tradeCount += 1;
  }

  let prime = 0;
  let subprime = 0;
  let cash = 0;
  for (const d of deals) {
    const ft = (d.finance_type ?? "").toLowerCase();
    if (ft === "prime") prime += 1;
    else if (ft === "subprime") subprime += 1;
    else if (ft === "cash") cash += 1;
  }

  const lostValues: number[] = [];
  const holdValues: number[] = [];
  for (const d of deals) {
    const lg = lostGross(d);
    if (lg != null) lostValues.push(lg);
    const hold = dealTradeHold(ctx.tradesByDeal.get(d.id) ?? []);
    if (hold != null) holdValues.push(hold);
  }

  const pct = (count: number) => (volume === 0 ? null : (count / volume) * 100);

  return {
    key,
    label,
    volume,
    front,
    back,
    total,
    avgFront: mean(frontValues),
    avgBack: mean(backValues),
    avgTotal: mean(totalValues),
    avgAge: mean(ages),
    avgSalePrice: mean(salePrices),
    trades: tradeCount,
    tradePct: pct(tradeCount),
    primePct: pct(prime),
    subprimePct: pct(subprime),
    cashPct: pct(cash),
    avgLostGross: mean(lostValues),
    avgTradeHold: mean(holdValues),
    isTotal: opts?.isTotal,
  };
}

export function aggregateByDimension(
  dim: Dimension,
  ctx: AggregateContext
): { rows: RollupRow[]; total: RollupRow } {
  const buckets = new Map<string, { label: string; deals: ProfitDeal[] }>();

  for (const deal of ctx.deals) {
    const keys = dimensionKey(deal, dim, ctx);
    // For salesperson dimension a deal can appear in multiple buckets (split deals).
    // Volume still counts the deal once per salesperson it is attributed to.
    for (const { key, label } of keys) {
      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = { label, deals: [] };
        buckets.set(key, bucket);
      }
      if (!bucket.deals.some((d) => d.id === deal.id)) {
        bucket.deals.push(deal);
      }
    }
  }

  const rows: RollupRow[] = [];
  for (const [key, bucket] of buckets) {
    rows.push(
      buildRow(key, bucket.label, bucket.deals, ctx, {
        salespersonId: dim === "salesperson" ? key : undefined,
      })
    );
  }

  // Sort: volume desc, then label
  rows.sort((a, b) => b.volume - a.volume || a.label.localeCompare(b.label));

  // For price bands, keep band order and include empty bands
  if (dim === "price") {
    const byKey = new Map(rows.map((r) => [r.key, r]));
    const ordered: RollupRow[] = PRICE_BANDS.map((band) => {
      return byKey.get(band.id) ?? buildRow(band.id, band.label, [], ctx);
    });
    const orphans = rows.filter((r) => !PRICE_BANDS.some((b) => b.id === r.key));
    rows.length = 0;
    rows.push(...ordered, ...orphans);
  }

  // For odometer bands, keep band order and include empty bands
  if (dim === "odometer") {
    const byKey = new Map(rows.map((r) => [r.key, r]));
    const ordered: RollupRow[] = ODOMETER_BANDS.map((band) => {
      return byKey.get(band.id) ?? buildRow(band.id, band.label, [], ctx);
    });
    const orphans = rows.filter(
      (r) => !ODOMETER_BANDS.some((b) => b.id === r.key)
    );
    rows.length = 0;
    rows.push(...ordered, ...orphans);
  }

  // Truck class: fixed order 1500 → 2500 → 3500 → 4500+ → (No class)
  if (dim === "truck_class") {
    const byKey = new Map(rows.map((r) => [r.key, r]));
    const ordered: RollupRow[] = TRUCK_CLASS_LABELS.map((label) => {
      const key = label.toLowerCase();
      return byKey.get(key) ?? buildRow(key, label, [], ctx);
    });
    rows.length = 0;
    rows.push(...ordered);
  }

  const total = buildRow("__total__", "Total", ctx.deals, ctx, { isTotal: true });
  return { rows, total };
}

export type ProfitFilters = {
  storeId: string | "all";
  /** Department name (not id) so All-stores view matches across stores. */
  departmentName: string | "all";
  make: string | "all";
  model: string | "all";
  year: string | "all";
  priceBandId: string | "all";
  acquisition: string | "all";
  bodyStyle: string | "all";
  truckClass: string | "all";
  salespersonId: string | "all";
  financeType: string | "all";
};

export function filterDeals(
  deals: ProfitDeal[],
  filters: ProfitFilters,
  extras: {
    tradesByDeal: Map<string, ProfitTrade[]>;
    dealSalespeople: ProfitDealSalesperson[];
    departmentNames?: Map<string, string>;
  }
): ProfitDeal[] {
  return deals.filter((d) => {
    if (filters.storeId !== "all" && d.store_id !== filters.storeId) return false;
    if (filters.departmentName !== "all") {
      const name = d.department_id
        ? extras.departmentNames?.get(d.department_id) ?? "(Unknown)"
        : "(Unassigned)";
      if (name !== filters.departmentName) return false;
    }
    if (filters.make !== "all" && d.vehicle_make !== filters.make) return false;
    if (filters.model !== "all" && d.vehicle_model !== filters.model) return false;
    if (filters.year !== "all" && String(d.vehicle_year) !== filters.year) return false;
    if (filters.priceBandId !== "all") {
      const band = priceBandForSalePrice(d.sale_price);
      if (!band || band.id !== filters.priceBandId) return false;
    }
    if (filters.acquisition !== "all") {
      const src = d.acquisition_source?.trim() || "(Unknown)";
      if (src !== filters.acquisition) return false;
    }
    if (filters.bodyStyle !== "all") {
      const bs = d.body_style?.trim() || "(Unknown)";
      if (bs !== filters.bodyStyle) return false;
    }
    if (filters.truckClass !== "all") {
      if (inferTruckClass(d.vehicle_make, d.vehicle_model) !== filters.truckClass) {
        return false;
      }
    }
    if (filters.financeType !== "all") {
      if ((d.finance_type ?? "").toLowerCase() !== filters.financeType) return false;
    }
    if (filters.salespersonId !== "all") {
      const onDeal = extras.dealSalespeople.some(
        (s) => s.deal_id === d.id && s.salesperson_id === filters.salespersonId
      );
      if (!onDeal) return false;
    }
    return true;
  });
}

export function buildTradesByDeal(trades: ProfitTrade[]): Map<string, ProfitTrade[]> {
  const map = new Map<string, ProfitTrade[]>();
  for (const t of trades) {
    const list = map.get(t.deal_id) ?? [];
    list.push(t);
    map.set(t.deal_id, list);
  }
  return map;
}
