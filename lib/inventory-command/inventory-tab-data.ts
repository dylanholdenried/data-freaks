/** Server loaders for the Inventory tab (single store on page load, all stores on demand). */

import type { SupabaseClient } from "@supabase/supabase-js";
import { flattenAcquisitionSourceDepartmentLinks } from "@/lib/acquisition-sources";
import { isPreOwnedDepartment } from "@/lib/buy-box/sale-books";
import { preOwnedSourceNames, type SoldDeal } from "./acq-source";
import { normalizeDisp } from "./compute";
import type { InvMovement, InvUnitDetailRow } from "./types";

export const INV_UNIT_DETAIL_SELECT =
  "stk,veh,body,age,ph,cost,price,pom,dsr,srp,vdp,vr,mmr,jd,pt,disp,d_vdp,d_srp,d_p,d_ph," +
  "vin,year,make,model,trim,odometer,ctm_pct,pt_align,markup,site_srp,site_vdp,bb_retail,market_price";

/** Sold-results lookback; the UI toggles 30 / 60 / 90 within this. */
export const SOLD_LOOKBACK_DAYS = 90;

const PAGE = 1000;

/** Reads every row past PostgREST's 1000-row cap. */
async function fetchAll<T>(
  build: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

export function toDetailUnits(rows: Record<string, unknown>[]): InvUnitDetailRow[] {
  return rows.map((u) => ({ ...u, disp: normalizeDisp(u.disp) })) as InvUnitDetailRow[];
}

export function isoDaysBefore(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

export type StoreSourceContext = {
  sourceNames: string[];
  preOwnedDeptIds: string[];
  tags: { stk: string; source: string }[];
};

export async function loadStoreSourceContext(
  supabase: SupabaseClient,
  storeIds: string[]
): Promise<Record<string, StoreSourceContext>> {
  const out: Record<string, StoreSourceContext> = {};
  for (const id of storeIds) out[id] = { sourceNames: [], preOwnedDeptIds: [], tags: [] };
  if (storeIds.length === 0) return out;

  const [sources, departments, tags] = await Promise.all([
    fetchAll<{
      id: string;
      name: string;
      active: boolean;
      store_id: string;
      acquisition_source_departments?: { department_id: string }[];
    }>((from, to) =>
      supabase
        .from("acquisition_sources")
        .select("id,name,active,store_id,acquisition_source_departments(department_id)")
        .in("store_id", storeIds)
        .order("name")
        .range(from, to)
    ),
    fetchAll<{ id: string; name: string; store_id: string }>((from, to) =>
      supabase
        .from("departments")
        .select("id,name,store_id")
        .in("store_id", storeIds)
        .range(from, to)
    ),
    fetchAll<{ store_id: string; stk: string; source: string }>((from, to) =>
      supabase
        .from("inv_acq_tags")
        .select("store_id,stk,source")
        .in("store_id", storeIds)
        .order("stk")
        .range(from, to)
    ),
  ]);

  for (const storeId of storeIds) {
    const storeSources = sources.filter((s) => s.store_id === storeId);
    const storeDepts = departments.filter((d) => d.store_id === storeId);
    out[storeId] = {
      sourceNames: preOwnedSourceNames(
        storeSources,
        flattenAcquisitionSourceDepartmentLinks(storeSources),
        storeDepts
      ),
      preOwnedDeptIds: storeDepts.filter((d) => isPreOwnedDepartment(d.name)).map((d) => d.id),
      tags: tags
        .filter((t) => t.store_id === storeId)
        .map((t) => ({ stk: t.stk, source: t.source })),
    };
  }
  return out;
}

export async function loadSoldDeals(
  supabase: SupabaseClient,
  preOwnedDeptIds: string[],
  sinceIso: string
): Promise<SoldDeal[]> {
  if (preOwnedDeptIds.length === 0) return [];
  return fetchAll<SoldDeal>((from, to) =>
    supabase
      .from("deals")
      .select("store_id,stock_number,sale_date,acquisition_source,front_profit,back_profit,sale_price,age")
      .eq("status", "closed")
      .in("department_id", preOwnedDeptIds)
      .gte("sale_date", sinceIso)
      .order("sale_date", { ascending: false })
      .range(from, to)
  );
}

export async function loadRecentMovements(
  supabase: SupabaseClient,
  storeIds: string[],
  sinceIso: string
): Promise<InvMovement[]> {
  if (storeIds.length === 0) return [];
  return fetchAll<InvMovement>((from, to) =>
    supabase
      .from("inv_movements")
      .select("store_id,movement_date,type,stk,veh,age,cost")
      .in("store_id", storeIds)
      .gte("movement_date", sinceIso)
      .order("movement_date", { ascending: false })
      .range(from, to)
  );
}
