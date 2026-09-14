import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isPreOwnedDepartment,
  resolveLastInventoryBooks,
  saleBooksUpdatePayload,
} from "./sale-books";

/**
 * Best-effort: lock inventory/acquire books onto closed pre-owned deals for a store
 * that are still missing sale_mmr / sale_jd (and not manually overridden).
 */
export async function lockMissingSaleBooksForStore(
  supabase: SupabaseClient,
  storeId: string,
  opts?: { limit?: number }
): Promise<{ updated: number }> {
  const limit = opts?.limit ?? 500;

  const { data: deptRows } = await supabase
    .from("departments")
    .select("id,name")
    .eq("store_id", storeId);

  const preOwnedIds = new Set(
    ((deptRows ?? []) as { id: string; name: string }[])
      .filter((d) => isPreOwnedDepartment(d.name))
      .map((d) => d.id)
  );

  if (preOwnedIds.size === 0) return { updated: 0 };

  const { data: deals } = await supabase
    .from("deals")
    .select(
      "id,stock_number,department_id,sale_mmr,sale_jd,sale_books_manual"
    )
    .eq("store_id", storeId)
    .eq("status", "closed")
    .eq("sale_books_manual", false)
    .or("sale_mmr.is.null,sale_jd.is.null")
    .limit(limit);

  let updated = 0;
  for (const row of (deals ?? []) as {
    id: string;
    stock_number: string;
    department_id: string;
    sale_mmr: number | null;
    sale_jd: number | null;
    sale_books_manual: boolean;
  }[]) {
    if (!preOwnedIds.has(row.department_id)) continue;
    if (row.sale_books_manual) continue;

    const books = await resolveLastInventoryBooks(
      supabase,
      storeId,
      row.stock_number
    );
    if (books.sale_mmr == null && books.sale_jd == null) continue;

    const payload = saleBooksUpdatePayload(books);
    // Preserve any half-filled side already present
    if (row.sale_mmr != null) payload.sale_mmr = row.sale_mmr;
    if (row.sale_jd != null) payload.sale_jd = row.sale_jd;

    const { error } = await supabase
      .from("deals")
      .update(payload)
      .eq("id", row.id)
      .eq("sale_books_manual", false);

    if (!error) updated += 1;
  }

  return { updated };
}
