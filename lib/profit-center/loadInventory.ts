import type { SupabaseClient } from "@supabase/supabase-js";
import type { InvUnitRow } from "@/lib/inventory-command/types";

/** Inventory unit with owning store (from snapshot). */
export type InvUnitWithStore = InvUnitRow & { store_id: string };

export type LatestInventoryLoad = {
  units: InvUnitWithStore[];
  snapshotDate: string | null;
  storeIdsWithSnapshot: string[];
};

/** Latest inv_units across the given stores (one newest snapshot per store, merged). */
export async function loadLatestInventoryUnits(
  supabase: SupabaseClient,
  storeIds: string[]
): Promise<LatestInventoryLoad> {
  if (storeIds.length === 0) {
    return { units: [], snapshotDate: null, storeIdsWithSnapshot: [] };
  }

  const { data: allSnaps } = await supabase
    .from("inv_snapshots")
    .select("id, store_id, snapshot_date")
    .in("store_id", storeIds)
    .order("snapshot_date", { ascending: false });

  const latestSnapIdByStore = new Map<string, { id: string; date: string }>();
  for (const snap of allSnaps ?? []) {
    if (!latestSnapIdByStore.has(snap.store_id)) {
      latestSnapIdByStore.set(snap.store_id, {
        id: snap.id,
        date: snap.snapshot_date,
      });
    }
  }

  const snapIds = [...latestSnapIdByStore.values()].map((s) => s.id);
  if (snapIds.length === 0) {
    return { units: [], snapshotDate: null, storeIdsWithSnapshot: [] };
  }

  const snapIdToStore = new Map<string, string>();
  for (const [storeId, meta] of latestSnapIdByStore) {
    snapIdToStore.set(meta.id, storeId);
  }

  const { data: unitRows } = await supabase
    .from("inv_units")
    .select(
      "snapshot_id,stk,veh,body,age,ph,cost,price,pom,dsr,srp,vdp,vr,mmr,jd,pt,disp,d_vdp,d_srp,d_p,d_ph"
    )
    .in("snapshot_id", snapIds);

  const units: InvUnitWithStore[] = [];
  for (const row of unitRows ?? []) {
    const storeId = snapIdToStore.get(String(row.snapshot_id));
    if (!storeId) continue;
    units.push({
      stk: String(row.stk ?? ""),
      veh: typeof row.veh === "string" ? row.veh : null,
      body: typeof row.body === "string" ? row.body : null,
      age:
        typeof row.age === "number" && Number.isFinite(row.age)
          ? row.age
          : null,
      ph:
        typeof row.ph === "number" && Number.isFinite(row.ph) ? row.ph : null,
      cost:
        typeof row.cost === "number" && Number.isFinite(row.cost)
          ? row.cost
          : null,
      price:
        typeof row.price === "number" && Number.isFinite(row.price)
          ? row.price
          : null,
      pom:
        typeof row.pom === "number" && Number.isFinite(row.pom)
          ? row.pom
          : null,
      dsr:
        typeof row.dsr === "number" && Number.isFinite(row.dsr)
          ? row.dsr
          : null,
      srp:
        typeof row.srp === "number" && Number.isFinite(row.srp)
          ? row.srp
          : null,
      vdp:
        typeof row.vdp === "number" && Number.isFinite(row.vdp)
          ? row.vdp
          : null,
      vr:
        typeof row.vr === "number" && Number.isFinite(row.vr) ? row.vr : null,
      mmr:
        typeof row.mmr === "number" && Number.isFinite(row.mmr)
          ? row.mmr
          : null,
      jd:
        typeof row.jd === "number" && Number.isFinite(row.jd) ? row.jd : null,
      pt: typeof row.pt === "string" ? row.pt : null,
      disp:
        row.disp === "subprime"
          ? "subprime"
          : row.disp === "wholesale"
            ? "wholesale"
            : "retail",
      d_vdp:
        typeof row.d_vdp === "number" && Number.isFinite(row.d_vdp)
          ? row.d_vdp
          : null,
      d_srp:
        typeof row.d_srp === "number" && Number.isFinite(row.d_srp)
          ? row.d_srp
          : null,
      d_p:
        typeof row.d_p === "number" && Number.isFinite(row.d_p)
          ? row.d_p
          : null,
      d_ph:
        typeof row.d_ph === "number" && Number.isFinite(row.d_ph)
          ? row.d_ph
          : null,
      store_id: storeId,
    });
  }

  const dates = [...latestSnapIdByStore.values()].map((s) => s.date).sort();
  const snapshotDate = dates[dates.length - 1] ?? null;

  return {
    units,
    snapshotDate,
    storeIdsWithSnapshot: [...latestSnapIdByStore.keys()],
  };
}
