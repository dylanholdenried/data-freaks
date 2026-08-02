import type { SupabaseClient } from "@supabase/supabase-js";

export const ACTIVE_DEAL_STATUSES = ["pending", "delivered", "closed"] as const;
export const INACTIVE_DEAL_STATUSES = ["dead", "unwound"] as const;

export type DealMatch = {
  id: string;
  status: string;
  stock_number: string;
  customer_last_name: string | null;
  sale_date: string;
  vin: string | null;
};

export function normalizeStock(value: string): string {
  return value.trim().toLowerCase();
}

export function normalizeVin(value: string): string {
  return value.trim().toUpperCase();
}

/** Escape ILIKE wildcards so the pattern is an exact case-insensitive match. */
function escapeIlike(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

export function isActiveDealStatus(status: string): boolean {
  return (ACTIVE_DEAL_STATUSES as readonly string[]).includes(status);
}

export function isInactiveDealStatus(status: string): boolean {
  return (INACTIVE_DEAL_STATUSES as readonly string[]).includes(status);
}

export function classifyStockMatches(matches: DealMatch[]): {
  blockingMatch: DealMatch | null;
  reuseMatch: DealMatch | null;
} {
  const blockingMatch = matches.find((m) => isActiveDealStatus(m.status)) ?? null;
  if (blockingMatch) {
    return { blockingMatch, reuseMatch: null };
  }
  const reuseMatch = matches.find((m) => isInactiveDealStatus(m.status)) ?? null;
  return { blockingMatch: null, reuseMatch };
}

export function isUniqueViolation(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("deals_store_stock_active_unique") ||
    lower.includes("duplicate key") ||
    lower.includes("unique constraint")
  );
}

type FindArgs = {
  storeId: string;
  excludeDealId?: string;
};

export async function findStockMatches(
  supabase: SupabaseClient,
  { storeId, stockNumber, excludeDealId }: FindArgs & { stockNumber: string }
): Promise<DealMatch[]> {
  const stock = stockNumber.trim();
  if (!storeId || !stock) return [];

  const key = normalizeStock(stock);
  const selectCols = "id, status, stock_number, customer_last_name, sale_date, vin";

  // Exact match first (typical stock entry), then case-insensitive fallback.
  let exactQuery = supabase
    .from("deals")
    .select(selectCols)
    .eq("store_id", storeId)
    .eq("stock_number", stock);
  if (excludeDealId) exactQuery = exactQuery.neq("id", excludeDealId);

  const { data: exactData, error: exactError } = await exactQuery;
  if (exactError) throw new Error(exactError.message);

  const exactMatches = (exactData ?? []) as DealMatch[];
  if (exactMatches.length > 0) return exactMatches;

  let query = supabase
    .from("deals")
    .select(selectCols)
    .eq("store_id", storeId)
    .ilike("stock_number", escapeIlike(stock));
  if (excludeDealId) query = query.neq("id", excludeDealId);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  return ((data ?? []) as DealMatch[]).filter(
    (row) => normalizeStock(row.stock_number) === key
  );
}

export async function findVinMatches(
  supabase: SupabaseClient,
  { storeId, vin, excludeDealId }: FindArgs & { vin: string }
): Promise<DealMatch[]> {
  const raw = vin.trim();
  if (!storeId || raw.length !== 17) return [];

  const key = normalizeVin(raw);
  let query = supabase
    .from("deals")
    .select("id, status, stock_number, customer_last_name, sale_date, vin")
    .eq("store_id", storeId)
    .ilike("vin", escapeIlike(raw));

  if (excludeDealId) {
    query = query.neq("id", excludeDealId);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  return ((data ?? []) as DealMatch[]).filter(
    (row) => row.vin != null && normalizeVin(row.vin) === key
  );
}
