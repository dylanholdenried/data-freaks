/**
 * Sale-time MMR / JD Power Clean Trade helpers.
 * Books = last reported values while the unit was still on the inventory lot.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type SaleBooksSource =
  | "inventory_snapshot"
  | "acquire_frozen"
  | "manual";

export type ResolvedSaleBooks = {
  sale_mmr: number | null;
  sale_jd: number | null;
  sale_pom: number | null;
  sale_books_at: string | null;
  sale_books_source: SaleBooksSource | null;
};

export type SaleBooksDeal = {
  id: string;
  store_id: string;
  department_id: string;
  sale_date: string;
  stock_number: string;
  vehicle_year: number | null;
  vehicle_make: string | null;
  vehicle_model: string | null;
  trim: string | null;
  odometer: number | null;
  age: number | null;
  sale_price: number | null;
  list_price: number | null;
  list_price_na: boolean;
  front_profit: number | null;
  back_profit: number | null;
  finance_type: string | null;
  sale_mmr: number | null;
  sale_jd: number | null;
  sale_pom: number | null;
  sale_books_at: string | null;
  sale_books_source: SaleBooksSource | null;
  sale_books_manual: boolean;
};

/** Days after close during which missing books are flagged for attention. */
export const MISSING_BOOKS_FLAG_DAYS = 7;

export function isPreOwnedDepartment(name: string | null | undefined): boolean {
  if (!name?.trim()) return false;
  const n = name.trim().toLowerCase();
  const usedLike = /used|pre-?owned|preowned|cpo|certified/.test(n);
  const newLike = /\bnew\b/.test(n) && !usedLike;
  if (newLike) return false;
  if (/^f\s*&\s*i$|^fi$|finance/.test(n)) return false;
  return usedLike;
}

function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

export function saleOverMmr(deal: {
  sale_price: number | null;
  sale_mmr: number | null;
}): number | null {
  const price = num(deal.sale_price);
  const mmr = num(deal.sale_mmr);
  if (price == null || mmr == null) return null;
  return price - mmr;
}

export function saleOverJd(deal: {
  sale_price: number | null;
  sale_jd: number | null;
}): number | null {
  const price = num(deal.sale_price);
  const jd = num(deal.sale_jd);
  if (price == null || jd == null) return null;
  return price - jd;
}

/** True when a closed pre-owned deal is missing either book within the flag window. */
export function hasMissingBooksFlag(
  deal: {
    sale_date: string;
    sale_mmr: number | null;
    sale_jd: number | null;
  },
  opts?: { now?: Date; preOwned?: boolean }
): boolean {
  if (opts?.preOwned === false) return false;
  const mmrMissing = num(deal.sale_mmr) == null;
  const jdMissing = num(deal.sale_jd) == null;
  if (!mmrMissing && !jdMissing) return false;

  const close = parseISODateLocal(deal.sale_date);
  if (!close) return false;
  const now = opts?.now ?? new Date();
  const today = startOfLocalDay(now);
  const end = startOfLocalDay(close);
  end.setDate(end.getDate() + MISSING_BOOKS_FLAG_DAYS);
  return today.getTime() <= end.getTime();
}

function parseISODateLocal(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso.trim());
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * Last MMR/JD while the stock was still on the lot = most recent inv_units row
 * for that store + stock (including historical snapshots after exit).
 */
export async function resolveLastInventoryBooks(
  supabase: SupabaseClient,
  storeId: string,
  stockNumber: string
): Promise<ResolvedSaleBooks> {
  const stk = stockNumber.trim();
  if (!storeId || !stk) {
    return emptyBooks();
  }

  const { data: units, error } = await supabase
    .from("inv_units")
    .select("stk, mmr, jd, pom, inv_snapshots!inner(store_id, snapshot_date)")
    .eq("inv_snapshots.store_id", storeId)
    .ilike("stk", stk)
    .order("snapshot_date", { ascending: false, foreignTable: "inv_snapshots" })
    .limit(40);

  if (!error && units && units.length > 0) {
    const want = stk.toUpperCase();
    type UnitRow = {
      stk: string;
      mmr: number | null;
      jd: number | null;
      pom: number | null;
      inv_snapshots:
        | { store_id: string; snapshot_date: string }
        | { store_id: string; snapshot_date: string }[]
        | null;
    };

    const ranked = (units as UnitRow[])
      .map((u) => {
        const snap = Array.isArray(u.inv_snapshots)
          ? u.inv_snapshots[0]
          : u.inv_snapshots;
        return {
          stk: u.stk,
          mmr: u.mmr,
          jd: u.jd,
          pom: u.pom,
          snapshot_date: snap?.snapshot_date ?? null,
        };
      })
      .filter((u) => u.stk.trim().toUpperCase() === want && u.snapshot_date)
      .sort((a, b) => (b.snapshot_date! > a.snapshot_date! ? 1 : -1));

    const best = ranked.find(
      (u) => num(u.mmr) != null || num(u.jd) != null || num(u.pom) != null
    );
    if (best) {
      return {
        sale_mmr: num(best.mmr),
        sale_jd: num(best.jd),
        sale_pom: num(best.pom),
        sale_books_at: best.snapshot_date
          ? `${best.snapshot_date}T12:00:00.000Z`
          : null,
        sale_books_source: "inventory_snapshot",
      };
    }
  }

  return resolveAcquireFallback(supabase, storeId, stk);
}

async function resolveAcquireFallback(
  supabase: SupabaseClient,
  storeId: string,
  stockNumber: string
): Promise<ResolvedSaleBooks> {
  const { data } = await supabase
    .from("acq_purchases")
    .select(
      "stock_number, frozen_mmr, frozen_jd, live_mmr, live_jd, live_pom, frozen_at, updated_at, created_at"
    )
    .eq("store_id", storeId)
    .ilike("stock_number", stockNumber)
    .order("updated_at", { ascending: false })
    .limit(20);

  const want = stockNumber.trim().toUpperCase();
  const row = ((data ?? []) as {
    stock_number: string;
    frozen_mmr: number | null;
    frozen_jd: number | null;
    live_mmr: number | null;
    live_jd: number | null;
    live_pom: number | null;
    frozen_at: string | null;
    updated_at: string | null;
    created_at: string | null;
  }[]).find((p) => p.stock_number.trim().toUpperCase() === want);

  if (!row) return emptyBooks();

  const mmr = num(row.frozen_mmr) ?? num(row.live_mmr);
  const jd = num(row.frozen_jd) ?? num(row.live_jd);
  const pom = num(row.live_pom);
  if (mmr == null && jd == null && pom == null) return emptyBooks();

  return {
    sale_mmr: mmr,
    sale_jd: jd,
    sale_pom: pom,
    sale_books_at: row.frozen_at ?? row.updated_at ?? row.created_at,
    sale_books_source: "acquire_frozen",
  };
}

function emptyBooks(): ResolvedSaleBooks {
  return {
    sale_mmr: null,
    sale_jd: null,
    sale_pom: null,
    sale_books_at: null,
    sale_books_source: null,
  };
}

/** Payload fragment to merge into a deal close/update for pre-owned units. */
export function saleBooksUpdatePayload(
  books: ResolvedSaleBooks,
  opts?: { preserveManual?: boolean; alreadyManual?: boolean }
): Record<string, unknown> {
  if (opts?.preserveManual && opts.alreadyManual) {
    return {};
  }
  if (
    books.sale_mmr == null &&
    books.sale_jd == null &&
    books.sale_pom == null &&
    !books.sale_books_source
  ) {
    return {
      sale_mmr: null,
      sale_jd: null,
      sale_pom: null,
      sale_books_at: null,
      sale_books_source: null,
      sale_books_manual: false,
    };
  }
  return {
    sale_mmr: books.sale_mmr,
    sale_jd: books.sale_jd,
    sale_pom: books.sale_pom,
    sale_books_at: books.sale_books_at,
    sale_books_source: books.sale_books_source,
    sale_books_manual: false,
  };
}
