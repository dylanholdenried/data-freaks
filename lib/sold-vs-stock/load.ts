import type { SupabaseClient } from "@supabase/supabase-js";
import { isPreOwnedDepartment } from "@/lib/buy-box/sale-books";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { parseVehicleParts } from "@/lib/inventory-command/vehicle";
import {
  catalogFieldsForStored,
  type CatalogMake,
  type CatalogModel,
} from "@/lib/vehicle-catalog";
import type { DateRange } from "./dateRange";
import type { SoldVsStockDeal, SoldVsStockUnit } from "./types";

const DEAL_SELECT =
  "id,sale_date,store_id,department_id,vehicle_year,vehicle_make,vehicle_model,trim," +
  "front_profit,back_profit,sale_price,age";

export async function loadVehicleCatalog(supabase: SupabaseClient): Promise<{
  makes: CatalogMake[];
  models: CatalogModel[];
}> {
  const [makesRes, modelsRes] = await Promise.all([
    supabase.from("vehicle_makes").select("id,name").eq("active", true),
    supabase.from("vehicle_models").select("id,name,make_id").eq("active", true),
  ]);
  return {
    makes: (makesRes.data ?? []) as CatalogMake[],
    models: (modelsRes.data ?? []) as CatalogModel[],
  };
}

type CatalogBundle = { makes: CatalogMake[]; models: CatalogModel[] };

function canonicalizeDeal(
  deal: SoldVsStockDeal,
  makes: CatalogMake[],
  models: CatalogModel[]
): SoldVsStockDeal {
  if (!makes.length) return deal;
  const fields = catalogFieldsForStored(
    deal.vehicle_make ?? "",
    deal.vehicle_model ?? "",
    makes,
    models,
    deal.trim ?? ""
  );
  return {
    ...deal,
    vehicle_make: fields.makeName || deal.vehicle_make,
    vehicle_model: fields.modelName || deal.vehicle_model,
  };
}

function canonicalizeUnit(
  unit: SoldVsStockUnit,
  makes: CatalogMake[],
  models: CatalogModel[]
): SoldVsStockUnit {
  if (!makes.length || (!unit.make && !unit.model)) return unit;
  const fields = catalogFieldsForStored(
    unit.make ?? "",
    unit.model ?? "",
    makes,
    models,
    unit.trim ?? ""
  );
  return {
    ...unit,
    make: fields.makeName || unit.make,
    model: fields.modelName || unit.model,
  };
}

export async function loadPreOwnedDepartmentIds(
  supabase: SupabaseClient,
  storeIds: string[]
): Promise<Set<string>> {
  if (storeIds.length === 0) return new Set();
  const { data } = await supabase
    .from("departments")
    .select("id,name,store_id")
    .in("store_id", storeIds);
  const ids = new Set<string>();
  for (const d of data ?? []) {
    if (isPreOwnedDepartment(d.name)) ids.add(d.id);
  }
  return ids;
}

export async function loadSoldVsStockDeals(
  supabase: SupabaseClient,
  storeIds: string[],
  range: DateRange,
  preOwnedDeptIds: Set<string>,
  catalog?: CatalogBundle
): Promise<SoldVsStockDeal[]> {
  if (storeIds.length === 0) return [];

  const res = await fetchAllRows<SoldVsStockDeal>((from, to) =>
    supabase
      .from("deals")
      .select(DEAL_SELECT)
      .in("store_id", storeIds)
      .eq("status", "closed")
      .gte("sale_date", range.from)
      .lte("sale_date", range.to)
      .order("sale_date", { ascending: true })
      .range(from, to)
  );

  if (res.error) throw new Error(res.error.message);

  const { makes, models } = catalog ?? (await loadVehicleCatalog(supabase));
  const filtered = res.data.filter(
    (d) => d.department_id != null && preOwnedDeptIds.has(d.department_id)
  );
  return filtered.map((d) => canonicalizeDeal(d, makes, models));
}

export type SoldVsStockInventoryLoad = {
  units: SoldVsStockUnit[];
  snapshotDate: string | null;
  storeIdsWithSnapshot: string[];
};

/** Latest on-lot units per store, with YMM + store_id for multi-store filters. */
export async function loadSoldVsStockInventory(
  supabase: SupabaseClient,
  storeIds: string[],
  catalog?: CatalogBundle
): Promise<SoldVsStockInventoryLoad> {
  if (storeIds.length === 0) {
    return { units: [], snapshotDate: null, storeIdsWithSnapshot: [] };
  }

  const { data: allSnaps } = await supabase
    .from("inv_snapshots")
    .select("id, store_id, snapshot_date")
    .in("store_id", storeIds)
    .order("snapshot_date", { ascending: false });

  const latestByStore = new Map<string, { id: string; date: string }>();
  for (const snap of allSnaps ?? []) {
    if (!latestByStore.has(snap.store_id)) {
      latestByStore.set(snap.store_id, {
        id: snap.id,
        date: snap.snapshot_date,
      });
    }
  }

  const snapMeta = [...latestByStore.entries()];
  if (snapMeta.length === 0) {
    return { units: [], snapshotDate: null, storeIdsWithSnapshot: [] };
  }

  const snapIdToStore = new Map(
    snapMeta.map(([storeId, meta]) => [meta.id, storeId])
  );
  const snapIds = snapMeta.map(([, meta]) => meta.id);

  const unitRes = await fetchAllRows<Record<string, unknown>>((from, to) =>
    supabase
      .from("inv_units")
      .select(
        "snapshot_id,stk,veh,year,make,model,trim,age,cost,price,disp"
      )
      .in("snapshot_id", snapIds)
      .range(from, to)
  );

  if (unitRes.error) throw new Error(unitRes.error.message);

  const { makes, models } = catalog ?? (await loadVehicleCatalog(supabase));

  const units: SoldVsStockUnit[] = [];
  for (const row of unitRes.data) {
    const snapshotId = String(row.snapshot_id ?? "");
    const storeId = snapIdToStore.get(snapshotId);
    if (!storeId) continue;

    const parsed = parseVehicleParts(
      typeof row.veh === "string" ? row.veh : null
    );
    const year =
      typeof row.year === "number" && Number.isFinite(row.year)
        ? row.year
        : parsed.year;
    const make =
      typeof row.make === "string" && row.make.trim()
        ? row.make
        : parsed.make;
    const model =
      typeof row.model === "string" && row.model.trim()
        ? row.model
        : parsed.model;
    const trim =
      typeof row.trim === "string" && row.trim.trim()
        ? row.trim
        : parsed.trim;

    const unit = canonicalizeUnit(
      {
        store_id: storeId,
        stk: String(row.stk ?? ""),
        veh: typeof row.veh === "string" ? row.veh : null,
        year,
        make,
        model,
        trim,
        age:
          typeof row.age === "number" && Number.isFinite(row.age)
            ? row.age
            : null,
        cost:
          typeof row.cost === "number" && Number.isFinite(row.cost)
            ? row.cost
            : null,
        price:
          typeof row.price === "number" && Number.isFinite(row.price)
            ? row.price
            : null,
        disp: typeof row.disp === "string" ? row.disp : null,
      },
      makes,
      models
    );
    units.push(unit);
  }

  const dates = snapMeta.map(([, m]) => m.date).sort();
  return {
    units,
    snapshotDate: dates[dates.length - 1] ?? null,
    storeIdsWithSnapshot: snapMeta.map(([id]) => id),
  };
}