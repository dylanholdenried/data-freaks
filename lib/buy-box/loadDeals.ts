import type { SupabaseClient } from "@supabase/supabase-js";
import type { DateRange } from "@/lib/profit-center/dateRange";
import {
  isPreOwnedDepartment,
  type SaleBooksDeal,
  type SaleBooksSource,
} from "./sale-books";

const DEAL_SELECT =
  "id,store_id,department_id,sale_date,stock_number," +
  "vehicle_year,vehicle_make,vehicle_model,trim,odometer,sale_price," +
  "front_profit,back_profit,finance_type," +
  "sale_mmr,sale_jd,sale_books_at,sale_books_source,sale_books_manual";

type DeptRow = { id: string; name: string };

function asDeal(row: Record<string, unknown>): SaleBooksDeal {
  return {
    id: String(row.id),
    store_id: String(row.store_id),
    department_id: String(row.department_id),
    sale_date: String(row.sale_date),
    stock_number: String(row.stock_number ?? ""),
    vehicle_year: row.vehicle_year == null ? null : Number(row.vehicle_year),
    vehicle_make: (row.vehicle_make as string | null) ?? null,
    vehicle_model: (row.vehicle_model as string | null) ?? null,
    trim: (row.trim as string | null) ?? null,
    odometer: row.odometer == null ? null : Number(row.odometer),
    sale_price: row.sale_price == null ? null : Number(row.sale_price),
    front_profit: row.front_profit == null ? null : Number(row.front_profit),
    back_profit: row.back_profit == null ? null : Number(row.back_profit),
    finance_type: (row.finance_type as string | null) ?? null,
    sale_mmr: row.sale_mmr == null ? null : Number(row.sale_mmr),
    sale_jd: row.sale_jd == null ? null : Number(row.sale_jd),
    sale_books_at: (row.sale_books_at as string | null) ?? null,
    sale_books_source: (row.sale_books_source as SaleBooksSource | null) ?? null,
    sale_books_manual: Boolean(row.sale_books_manual),
  };
}

/**
 * Closed pre-owned deals in range with sale-book columns.
 * Excludes New / F&I via department name.
 */
export async function loadSaleBooksDeals(
  supabase: SupabaseClient,
  storeIds: string[],
  range: DateRange,
  departments: DeptRow[]
): Promise<SaleBooksDeal[]> {
  if (storeIds.length === 0) return [];

  const preOwnedDeptIds = new Set(
    departments.filter((d) => isPreOwnedDepartment(d.name)).map((d) => d.id)
  );
  if (preOwnedDeptIds.size === 0) return [];

  const pageSize = 1000;
  let from = 0;
  const rows: SaleBooksDeal[] = [];

  for (;;) {
    const { data, error } = await supabase
      .from("deals")
      .select(DEAL_SELECT)
      .in("store_id", storeIds)
      .eq("status", "closed")
      .gte("sale_date", range.from)
      .lte("sale_date", range.to)
      .order("sale_date", { ascending: false })
      .range(from, from + pageSize - 1);

    if (error) throw new Error(error.message);
    const batch = (data ?? []) as unknown as Record<string, unknown>[];
    for (const row of batch) {
      const deal = asDeal(row);
      if (preOwnedDeptIds.has(deal.department_id)) {
        rows.push(deal);
      }
    }
    if (batch.length < pageSize) break;
    from += pageSize;
  }

  return rows;
}

export function formatFinanceType(raw: string | null | undefined): string {
  if (!raw?.trim()) return "—";
  const v = raw.trim().toLowerCase();
  if (v === "prime") return "Prime";
  if (v === "subprime") return "Subprime";
  if (v === "cash") return "Cash";
  if (v === "lease") return "Lease";
  return raw.trim().replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
