/**
 * Per-deal metric helpers for Profit Center.
 *
 * Lost Gross = sale_price − list_price (negative is bad).
 *   Excluded when list_price_na or either price missing.
 *
 * Trade Hold = ACV − allowance (negative is bad).
 *   Per deal: average holds across that deal’s trade rows with both values,
 *   then those deal-level holds are averaged at the group level.
 */

export type DealTrade = {
  deal_id: string;
  acv: number | null;
  allowance: number | null;
};

export function lostGross(deal: {
  sale_price: number | null;
  list_price: number | null;
  list_price_na: boolean;
}): number | null {
  if (deal.list_price_na) return null;
  if (deal.sale_price == null || deal.list_price == null) return null;
  if (!Number.isFinite(deal.sale_price) || !Number.isFinite(deal.list_price)) {
    return null;
  }
  return deal.sale_price - deal.list_price;
}

/** Average trade hold for a single deal’s trades; null if none usable. */
export function dealTradeHold(
  trades: { acv: number | null; allowance: number | null }[]
): number | null {
  const holds: number[] = [];
  for (const t of trades) {
    if (t.acv == null || t.allowance == null) continue;
    if (!Number.isFinite(t.acv) || !Number.isFinite(t.allowance)) continue;
    holds.push(t.acv - t.allowance);
  }
  if (holds.length === 0) return null;
  return holds.reduce((a, b) => a + b, 0) / holds.length;
}

export function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}
