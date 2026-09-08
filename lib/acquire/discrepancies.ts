import { allInCost, num } from "./cost";
import type { AcqPurchase } from "./types";

export type CostDiscrepancy = {
  kind: "cost";
  label: string;
  acquireValue: number;
  inventoryValue: number;
  delta: number;
};

export type DealDiscrepancy = {
  kind: "deal";
  field: string;
  label: string;
  acquireValue: number | string | null;
  dealValue: number | string | null;
};

export type MatchedDealSnapshot = {
  id: string;
  status: string;
  stock_number: string;
  vin: string | null;
  sale_price: number | null;
  front_profit: number | null;
  back_profit: number | null;
  sale_date: string | null;
};

const COST_TOLERANCE = 1; // $1

export function costDiscrepancy(p: AcqPurchase): CostDiscrepancy | null {
  if (!p.live_matched || p.live_cost == null) return null;
  const allIn = allInCost(p);
  if (allIn == null) return null;
  const delta = allIn - num(p.live_cost);
  if (Math.abs(delta) <= COST_TOLERANCE) return null;
  return {
    kind: "cost",
    label: "All-in vs inventory cost",
    acquireValue: allIn,
    inventoryValue: num(p.live_cost),
    delta,
  };
}

export function dealDiscrepancies(
  p: AcqPurchase,
  deal: MatchedDealSnapshot | null
): DealDiscrepancy[] {
  if (!deal) return [];
  const out: DealDiscrepancy[] = [];

  const checkNum = (
    field: string,
    label: string,
    acquire: number | null | undefined,
    registry: number | null | undefined
  ) => {
    if (acquire == null || registry == null) return;
    if (Math.abs(num(acquire) - num(registry)) <= COST_TOLERANCE) return;
    out.push({
      kind: "deal",
      field,
      label,
      acquireValue: num(acquire),
      dealValue: num(registry),
    });
  };

  checkNum("sold_price", "Sale price", p.sold_price, deal.sale_price);
  checkNum("front_gross", "Front gross", p.front_gross, deal.front_profit);
  checkNum("back_gross", "Back gross", p.back_gross, deal.back_profit);

  const acquireTotal =
    p.total_gross != null
      ? num(p.total_gross)
      : p.front_gross != null || p.back_gross != null
        ? num(p.front_gross) + num(p.back_gross)
        : null;
  const dealTotal =
    deal.front_profit != null || deal.back_profit != null
      ? num(deal.front_profit) + num(deal.back_profit)
      : null;
  checkNum("total_gross", "Total gross", acquireTotal, dealTotal);

  return out;
}
