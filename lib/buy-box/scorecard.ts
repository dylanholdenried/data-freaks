import {
  hasMissingBooksFlag,
  saleOverJd,
  saleOverMmr,
  type SaleBooksDeal,
} from "./sale-books";

export type SaleBooksKpis = {
  preOwnedClosed: number;
  withMmr: number;
  withJd: number;
  avgSaleOverMmr: number | null;
  avgSaleOverJd: number | null;
  avgFront: number | null;
  avgBack: number | null;
  missingFlagged: number;
  coverageMmrPct: number | null;
  coverageJdPct: number | null;
};

export type SaleBooksModelRow = {
  key: string;
  make: string;
  model: string;
  units: number;
  unitsWithMmr: number;
  unitsWithJd: number;
  avgSalePrice: number | null;
  avgSaleOverMmr: number | null;
  avgSaleOverJd: number | null;
  avgFront: number | null;
  avgBack: number | null;
};

function avg(nums: number[]): number | null {
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function pushNum(arr: number[], v: number | null | undefined) {
  if (v == null || !Number.isFinite(Number(v))) return;
  arr.push(Number(v));
}

export function computeSaleBooksKpis(
  deals: SaleBooksDeal[],
  opts?: { now?: Date }
): SaleBooksKpis {
  const now = opts?.now ?? new Date();
  const mmrDeltas: number[] = [];
  const jdDeltas: number[] = [];
  const fronts: number[] = [];
  const backs: number[] = [];
  let withMmr = 0;
  let withJd = 0;
  let missingFlagged = 0;

  for (const d of deals) {
    const overMmr = saleOverMmr(d);
    const overJd = saleOverJd(d);
    if (overMmr != null) {
      withMmr += 1;
      mmrDeltas.push(overMmr);
    }
    if (overJd != null) {
      withJd += 1;
      jdDeltas.push(overJd);
    }
    pushNum(fronts, d.front_profit);
    pushNum(backs, d.back_profit);
    if (hasMissingBooksFlag(d, { now, preOwned: true })) {
      missingFlagged += 1;
    }
  }

  const n = deals.length;
  return {
    preOwnedClosed: n,
    withMmr,
    withJd,
    avgSaleOverMmr: avg(mmrDeltas),
    avgSaleOverJd: avg(jdDeltas),
    avgFront: avg(fronts),
    avgBack: avg(backs),
    missingFlagged,
    coverageMmrPct: n > 0 ? (withMmr / n) * 100 : null,
    coverageJdPct: n > 0 ? (withJd / n) * 100 : null,
  };
}

export function rollupSaleBooksByModel(
  deals: SaleBooksDeal[]
): SaleBooksModelRow[] {
  const map = new Map<
    string,
    {
      make: string;
      model: string;
      prices: number[];
      overMmr: number[];
      overJd: number[];
      fronts: number[];
      backs: number[];
      units: number;
    }
  >();

  for (const d of deals) {
    const make = (d.vehicle_make ?? "").trim() || "—";
    const model = (d.vehicle_model ?? "").trim() || "—";
    const key = `${make.toUpperCase()}||${model.toUpperCase()}`;
    let row = map.get(key);
    if (!row) {
      row = {
        make,
        model,
        prices: [],
        overMmr: [],
        overJd: [],
        fronts: [],
        backs: [],
        units: 0,
      };
      map.set(key, row);
    }
    row.units += 1;
    pushNum(row.prices, d.sale_price);
    const om = saleOverMmr(d);
    const oj = saleOverJd(d);
    if (om != null) row.overMmr.push(om);
    if (oj != null) row.overJd.push(oj);
    pushNum(row.fronts, d.front_profit);
    pushNum(row.backs, d.back_profit);
  }

  return [...map.entries()]
    .map(([key, r]) => ({
      key,
      make: r.make,
      model: r.model,
      units: r.units,
      unitsWithMmr: r.overMmr.length,
      unitsWithJd: r.overJd.length,
      avgSalePrice: avg(r.prices),
      avgSaleOverMmr: avg(r.overMmr),
      avgSaleOverJd: avg(r.overJd),
      avgFront: avg(r.fronts),
      avgBack: avg(r.backs),
    }))
    .sort((a, b) => (b.avgSaleOverMmr ?? -1e12) - (a.avgSaleOverMmr ?? -1e12));
}
