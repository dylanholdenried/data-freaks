/**
 * Pricing Discipline metrics: sale price vs inventory-locked list price,
 * Adj % of Market at sale, and planned disposition vs actual finance type.
 *
 * Discount = list_price − sale_price (positive = gross given up).
 */

/**
 * Sale date from which used-deal list price is inventory-enforced (missing → admin entry).
 * Must match public.list_price_enforced_from() in the database.
 */
export const LIST_PRICE_ENFORCED_FROM = "2026-10-01";

export type InvDisposition = "retail" | "subprime" | "wholesale";

export type ListPriceSource =
  | "inventory_snapshot"
  | "manual"
  | "missing"
  | "legacy";

export type DispositionMatch =
  | "match"
  | "downgrade"
  | "upgrade"
  | "retailed_wholesale"
  | "unknown";

export const DISPOSITION_LABEL: Record<InvDisposition, string> = {
  retail: "Prime",
  subprime: "Subprime",
  wholesale: "Wholesale",
};

export const DISPOSITION_MATCH_LABEL: Record<DispositionMatch, string> = {
  match: "Match",
  downgrade: "Prime → Subprime",
  upgrade: "Subprime → Retail",
  retailed_wholesale: "Wholesale unit retailed",
  unknown: "—",
};

export const LIST_PRICE_SOURCE_LABEL: Record<ListPriceSource, string> = {
  inventory_snapshot: "Inventory",
  manual: "Manual (admin)",
  missing: "Missing",
  legacy: "Legacy (typed)",
};

export const FINANCE_TYPE_LABEL: Record<string, string> = {
  prime: "Prime",
  subprime: "Subprime",
  cash: "Cash",
  lease: "Lease",
};

export function formatFinanceTypeLabel(v: string | null | undefined): string {
  if (!v) return "—";
  return FINANCE_TYPE_LABEL[v] ?? v;
}

export function formatDisposition(v: string | null | undefined): string {
  if (!v) return "—";
  return DISPOSITION_LABEL[v as InvDisposition] ?? v;
}

function finite(v: number | null | undefined): v is number {
  return v != null && Number.isFinite(v);
}

export function toNum(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

export function dealDiscount(deal: {
  list_price: number | null;
  list_price_na?: boolean | null;
  sale_price: number | null;
}): number | null {
  if (deal.list_price_na) return null;
  if (!finite(deal.list_price) || !finite(deal.sale_price)) return null;
  return deal.list_price - deal.sale_price;
}

export function dealDiscountPct(deal: {
  list_price: number | null;
  list_price_na?: boolean | null;
  sale_price: number | null;
}): number | null {
  const d = dealDiscount(deal);
  if (d == null || !finite(deal.list_price) || deal.list_price === 0) return null;
  return (d / deal.list_price) * 100;
}

export function dispositionMatch(
  disp: string | null | undefined,
  financeType: string | null | undefined
): DispositionMatch {
  if (!disp || !financeType) return "unknown";
  if (disp === "wholesale") return "retailed_wholesale";
  const retailExit = financeType === "prime" || financeType === "cash" || financeType === "lease";
  if (disp === "retail") return retailExit ? "match" : financeType === "subprime" ? "downgrade" : "unknown";
  if (disp === "subprime") return financeType === "subprime" ? "match" : retailExit ? "upgrade" : "unknown";
  return "unknown";
}

export type PomBand = "lt90" | "90_95" | "95_100" | "100_105" | "gt105";

export const POM_BANDS: { key: PomBand; label: string }[] = [
  { key: "lt90", label: "Under 90%" },
  { key: "90_95", label: "90–95%" },
  { key: "95_100", label: "95–100%" },
  { key: "100_105", label: "100–105%" },
  { key: "gt105", label: "Over 105%" },
];

export function pomBand(pom: number | null | undefined): PomBand | null {
  if (!finite(pom)) return null;
  if (pom < 90) return "lt90";
  if (pom < 95) return "90_95";
  if (pom < 100) return "95_100";
  if (pom <= 105) return "100_105";
  return "gt105";
}

/** Sum of (allowance − ACV) across trades; positive = over-allowance given on the trade. */
export function tradeOverAllowance(
  trades: { acv: number | null; allowance: number | null }[]
): number | null {
  let total = 0;
  let any = false;
  for (const t of trades) {
    if (!finite(t.acv) || !finite(t.allowance)) continue;
    total += t.allowance - t.acv;
    any = true;
  }
  return any ? total : null;
}

export type PricingDealLike = {
  sale_price: number | null;
  list_price: number | null;
  list_price_na: boolean;
  list_price_source: string | null;
  list_price_entered: number | null;
  sale_pom: number | null;
  sale_inv_disp: string | null;
  finance_type: string | null;
  front_profit: number | null;
  age: number | null;
};

export type PricingGroupStats = {
  units: number;
  pricedUnits: number;
  totalDiscount: number;
  avgDiscount: number | null;
  avgDiscountPct: number | null;
  atOrAboveListPct: number | null;
  avgPom: number | null;
  avgFront: number | null;
  avgAge: number | null;
};

function avg(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function groupStats(deals: PricingDealLike[]): PricingGroupStats {
  const discounts: number[] = [];
  const pcts: number[] = [];
  const poms: number[] = [];
  const fronts: number[] = [];
  const ages: number[] = [];
  let atOrAbove = 0;

  for (const d of deals) {
    const disc = dealDiscount(d);
    if (disc != null) {
      discounts.push(disc);
      if (disc <= 0) atOrAbove += 1;
      const pct = dealDiscountPct(d);
      if (pct != null) pcts.push(pct);
    }
    if (finite(d.sale_pom)) poms.push(d.sale_pom);
    if (finite(d.front_profit)) fronts.push(d.front_profit);
    if (finite(d.age)) ages.push(d.age);
  }

  return {
    units: deals.length,
    pricedUnits: discounts.length,
    totalDiscount: discounts.reduce((a, b) => a + b, 0),
    avgDiscount: avg(discounts),
    avgDiscountPct: avg(pcts),
    atOrAboveListPct: discounts.length ? (atOrAbove / discounts.length) * 100 : null,
    avgPom: avg(poms),
    avgFront: avg(fronts),
    avgAge: avg(ages),
  };
}

export type PricingSummary = PricingGroupStats & {
  matchRate: number | null;
  missingCount: number;
  /** Inventory-locked deals where the originally typed list price equalled sale price. */
  typedEqualsSale: number;
  typedComparable: number;
};

export function summarize(deals: PricingDealLike[]): PricingSummary {
  const base = groupStats(deals);
  let matched = 0;
  let matchable = 0;
  let missingCount = 0;
  let typedEqualsSale = 0;
  let typedComparable = 0;

  for (const d of deals) {
    const m = dispositionMatch(d.sale_inv_disp, d.finance_type);
    if (m !== "unknown") {
      matchable += 1;
      if (m === "match") matched += 1;
    }
    if (d.list_price_source === "missing") missingCount += 1;
    if (
      d.list_price_source === "inventory_snapshot" &&
      finite(d.list_price_entered) &&
      finite(d.sale_price)
    ) {
      typedComparable += 1;
      if (Math.abs(d.list_price_entered - d.sale_price) < 0.5) typedEqualsSale += 1;
    }
  }

  return {
    ...base,
    matchRate: matchable ? (matched / matchable) * 100 : null,
    missingCount,
    typedEqualsSale,
    typedComparable,
  };
}
