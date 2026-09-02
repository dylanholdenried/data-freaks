import { mean, sum } from "@/lib/profit-center/metrics";
import type { DateRange } from "@/lib/profit-center/dateRange";
import type {
  ExitBucket,
  TradeDeal,
  TradeDealSalesperson,
  TradeRow,
} from "@/lib/trades/types";

export type DepartmentInfo = {
  id: string;
  name: string;
  store_id: string;
};

export type StoreInfo = {
  id: string;
  name: string;
};

export type SalespersonInfo = {
  id: string;
  name: string;
  store_id: string;
};

/** Format ISO date (YYYY-MM-DD) as MM-DD-YYYY. */
export function formatDisplayDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  return `${m[2]}-${m[3]}-${m[1]}`;
}

/** ACV − allowance when both present; null otherwise. */
export function tradeHold(
  acv: number | null,
  allowance: number | null
): number | null {
  if (acv == null || allowance == null) return null;
  if (!Number.isFinite(acv) || !Number.isFinite(allowance)) return null;
  return acv - allowance;
}

export function exitBucket(exitStrategy: string | null): ExitBucket {
  if (exitStrategy === "retail") return "retail";
  if (exitStrategy === "wholesale") return "wholesale";
  return "unknown";
}

export function exitBucketLabel(bucket: ExitBucket): string {
  if (bucket === "retail") return "Retail";
  if (bucket === "wholesale") return "Wholesale";
  return "Unknown";
}

export type TradesSummary = {
  tradeCount: number;
  dealCount: number;
  dealsWithTrade: number;
  attachPct: number | null;
  retailCount: number;
  wholesaleCount: number;
  unknownCount: number;
  totalAcv: number;
  totalAllowance: number;
  netHold: number | null;
  avgHold: number | null;
  holdsWithValue: number;
};

export type DepartmentRollup = {
  departmentId: string;
  label: string;
  storeId: string | null;
  storeName: string | null;
  tradeCount: number;
  dealCount: number;
  dealsWithTrade: number;
  attachPct: number | null;
  totalAcv: number;
  totalAllowance: number;
  netHold: number | null;
  avgHold: number | null;
  retailCount: number;
  wholesaleCount: number;
  unknownCount: number;
};

export type SalespersonRollup = {
  salespersonId: string;
  label: string;
  storeId: string | null;
  storeName: string | null;
  tradeCount: number;
  avgHold: number | null;
  netHold: number | null;
};

export type MonthlyPoint = {
  key: string;
  label: string;
  tradeCount: number;
  netHold: number | null;
};

export type ExitMixPoint = {
  bucket: ExitBucket;
  label: string;
  count: number;
};

export type EnrichedTrade = TradeRow & {
  sale_date: string;
  store_id: string;
  department_id: string | null;
  departmentName: string;
  storeName: string;
  hold: number | null;
  exit: ExitBucket;
};

function pct(num: number, den: number): number | null {
  if (den <= 0) return null;
  return (num / den) * 100;
}

function summarizeTrades(
  trades: TradeRow[],
  dealCount: number,
  dealsWithTrade: number
): TradesSummary {
  let retailCount = 0;
  let wholesaleCount = 0;
  let unknownCount = 0;
  const acvs: number[] = [];
  const allowances: number[] = [];
  const holds: number[] = [];

  for (const t of trades) {
    const bucket = exitBucket(t.exit_strategy);
    if (bucket === "retail") retailCount += 1;
    else if (bucket === "wholesale") wholesaleCount += 1;
    else unknownCount += 1;

    if (t.acv != null) acvs.push(t.acv);
    if (t.allowance != null) allowances.push(t.allowance);

    const h = tradeHold(t.acv, t.allowance);
    if (h != null) holds.push(h);
  }

  return {
    tradeCount: trades.length,
    dealCount,
    dealsWithTrade,
    attachPct: pct(dealsWithTrade, dealCount),
    retailCount,
    wholesaleCount,
    unknownCount,
    totalAcv: sum(acvs),
    totalAllowance: sum(allowances),
    netHold: holds.length > 0 ? sum(holds) : null,
    avgHold: mean(holds),
    holdsWithValue: holds.length,
  };
}

export function summarizeRange(
  deals: TradeDeal[],
  trades: TradeRow[]
): TradesSummary {
  const dealIdsWithTrade = new Set(trades.map((t) => t.deal_id));
  return summarizeTrades(trades, deals.length, dealIdsWithTrade.size);
}

export function byDepartment(
  deals: TradeDeal[],
  trades: TradeRow[],
  departments: DepartmentInfo[],
  stores: StoreInfo[]
): DepartmentRollup[] {
  const deptById = new Map(departments.map((d) => [d.id, d]));
  const storeName = new Map(stores.map((s) => [s.id, s.name]));
  const dealsByDept = new Map<string, TradeDeal[]>();
  for (const d of deals) {
    const key = d.department_id ?? "__none__";
    const list = dealsByDept.get(key);
    if (list) list.push(d);
    else dealsByDept.set(key, [d]);
  }

  const tradesByDeal = new Map<string, TradeRow[]>();
  for (const t of trades) {
    const list = tradesByDeal.get(t.deal_id);
    if (list) list.push(t);
    else tradesByDeal.set(t.deal_id, [t]);
  }

  const keys = new Set(dealsByDept.keys());

  const rollups: DepartmentRollup[] = [];
  for (const key of keys) {
    const deptDeals = dealsByDept.get(key) ?? [];
    const dealIdSet = new Set(deptDeals.map((d) => d.id));
    const deptTrades: TradeRow[] = [];
    for (const dealId of dealIdSet) {
      const ts = tradesByDeal.get(dealId);
      if (ts) deptTrades.push(...ts);
    }
    const dealsWithTrade = deptTrades.length
      ? new Set(deptTrades.map((t) => t.deal_id)).size
      : 0;
    const summary = summarizeTrades(
      deptTrades,
      deptDeals.length,
      dealsWithTrade
    );
    if (deptDeals.length === 0 && deptTrades.length === 0) continue;

    const dept = key === "__none__" ? null : deptById.get(key) ?? null;
    const sid = dept?.store_id ?? deptDeals[0]?.store_id ?? null;

    rollups.push({
      departmentId: key,
      label:
        key === "__none__"
          ? "Unassigned"
          : dept?.name ?? "Unknown department",
      storeId: sid,
      storeName: sid ? storeName.get(sid) ?? null : null,
      tradeCount: summary.tradeCount,
      dealCount: summary.dealCount,
      dealsWithTrade: summary.dealsWithTrade,
      attachPct: summary.attachPct,
      totalAcv: summary.totalAcv,
      totalAllowance: summary.totalAllowance,
      netHold: summary.netHold,
      avgHold: summary.avgHold,
      retailCount: summary.retailCount,
      wholesaleCount: summary.wholesaleCount,
      unknownCount: summary.unknownCount,
    });
  }

  rollups.sort(
    (a, b) => b.tradeCount - a.tradeCount || a.label.localeCompare(b.label)
  );
  return rollups;
}

/**
 * Average net hold per salesperson (per trade vehicle on deals they are on).
 * Sorted most hold → most overallow (avgHold descending).
 */
export function bySalesperson(
  trades: TradeRow[],
  dealSalespeople: TradeDealSalesperson[],
  salespeople: SalespersonInfo[],
  stores: StoreInfo[]
): SalespersonRollup[] {
  const tradesByDeal = new Map<string, TradeRow[]>();
  for (const t of trades) {
    const list = tradesByDeal.get(t.deal_id);
    if (list) list.push(t);
    else tradesByDeal.set(t.deal_id, [t]);
  }

  const spById = new Map(salespeople.map((s) => [s.id, s]));
  const storeName = new Map(stores.map((s) => [s.id, s.name]));
  const holdsBySp = new Map<string, number[]>();

  for (const link of dealSalespeople) {
    const dealTrades = tradesByDeal.get(link.deal_id);
    if (!dealTrades || dealTrades.length === 0) continue;
    let bucket = holdsBySp.get(link.salesperson_id);
    if (!bucket) {
      bucket = [];
      holdsBySp.set(link.salesperson_id, bucket);
    }
    for (const t of dealTrades) {
      const h = tradeHold(t.acv, t.allowance);
      if (h != null) bucket.push(h);
    }
  }

  const rollups: SalespersonRollup[] = [];
  for (const [salespersonId, holds] of holdsBySp) {
    if (holds.length === 0) continue;
    const sp = spById.get(salespersonId);
    rollups.push({
      salespersonId,
      label: sp?.name ?? "Unknown",
      storeId: sp?.store_id ?? null,
      storeName: sp?.store_id ? storeName.get(sp.store_id) ?? null : null,
      tradeCount: holds.length,
      avgHold: mean(holds),
      netHold: sum(holds),
    });
  }

  rollups.sort((a, b) => {
    const ah = a.avgHold ?? -Infinity;
    const bh = b.avgHold ?? -Infinity;
    if (bh !== ah) return bh - ah;
    return a.label.localeCompare(b.label);
  });
  return rollups;
}

const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function monthKey(isoDate: string): string {
  return isoDate.slice(0, 7);
}

function monthLabel(key: string): string {
  const [y, m] = key.split("-");
  const mi = Number(m) - 1;
  const label = MONTH_LABELS[mi] ?? m;
  return `${label} ${y}`;
}

/** Monthly trade counts / net hold for the selected range. */
export function monthlySeries(
  deals: TradeDeal[],
  trades: TradeRow[],
  range: DateRange
): MonthlyPoint[] {
  const dealById = new Map(deals.map((d) => [d.id, d]));
  const buckets = new Map<string, { count: number; holds: number[] }>();

  const fromY = Number(range.from.slice(0, 4));
  const fromM = Number(range.from.slice(5, 7));
  const toY = Number(range.to.slice(0, 4));
  const toM = Number(range.to.slice(5, 7));
  let y = fromY;
  let m = fromM;
  while (y < toY || (y === toY && m <= toM)) {
    const key = `${y}-${String(m).padStart(2, "0")}`;
    buckets.set(key, { count: 0, holds: [] });
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
    if (buckets.size > 240) break;
  }

  for (const t of trades) {
    const deal = dealById.get(t.deal_id);
    if (!deal) continue;
    const key = monthKey(deal.sale_date);
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { count: 0, holds: [] };
      buckets.set(key, bucket);
    }
    bucket.count += 1;
    const h = tradeHold(t.acv, t.allowance);
    if (h != null) bucket.holds.push(h);
  }

  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, b]) => ({
      key,
      label: monthLabel(key),
      tradeCount: b.count,
      netHold: b.holds.length > 0 ? sum(b.holds) : null,
    }));
}

export function exitMixSeries(trades: TradeRow[]): ExitMixPoint[] {
  let retail = 0;
  let wholesale = 0;
  let unknown = 0;
  for (const t of trades) {
    const b = exitBucket(t.exit_strategy);
    if (b === "retail") retail += 1;
    else if (b === "wholesale") wholesale += 1;
    else unknown += 1;
  }
  return [
    { bucket: "retail", label: "Retail", count: retail },
    { bucket: "wholesale", label: "Wholesale", count: wholesale },
    { bucket: "unknown", label: "Unknown", count: unknown },
  ];
}

export function enrichTrades(
  deals: TradeDeal[],
  trades: TradeRow[],
  departments: DepartmentInfo[],
  stores: StoreInfo[]
): EnrichedTrade[] {
  const dealById = new Map(deals.map((d) => [d.id, d]));
  const deptName = new Map(departments.map((d) => [d.id, d.name]));
  const storeName = new Map(stores.map((s) => [s.id, s.name]));

  const rows: EnrichedTrade[] = [];
  for (const t of trades) {
    const deal = dealById.get(t.deal_id);
    if (!deal) continue;
    const department_id = deal.department_id;
    rows.push({
      ...t,
      sale_date: deal.sale_date,
      store_id: deal.store_id,
      department_id,
      departmentName:
        department_id == null
          ? "Unassigned"
          : deptName.get(department_id) ?? "Unknown department",
      storeName: storeName.get(deal.store_id) ?? "Unknown store",
      hold: tradeHold(t.acv, t.allowance),
      exit: exitBucket(t.exit_strategy),
    });
  }

  rows.sort((a, b) => {
    const d = b.sale_date.localeCompare(a.sale_date);
    if (d !== 0) return d;
    return a.id.localeCompare(b.id);
  });
  return rows;
}

export function filterByStore<T extends { store_id: string }>(
  rows: T[],
  storeId: string
): T[] {
  if (storeId === "all") return rows;
  return rows.filter((r) => r.store_id === storeId);
}
