import type { SupabaseClient } from "@supabase/supabase-js";
import type { InvUnitRow } from "@/lib/inventory-command/types";

export type LatestInventoryLoad = {
  units: InvUnitRow[];
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

  const { data: unitRows } = await supabase
    .from("inv_units")
    .select(
      "stk,veh,body,age,ph,cost,price,pom,dsr,srp,vdp,vr,mmr,jd,pt,disp,d_vdp,d_srp,d_p,d_ph"
    )
    .in("snapshot_id", snapIds);

  const units = (unitRows ?? []).map((u) => ({
    ...u,
    disp: (u.disp === "subprime" ? "subprime" : "retail") as
      | "retail"
      | "subprime",
  })) as InvUnitRow[];

  const dates = [...latestSnapIdByStore.values()].map((s) => s.date).sort();
  const snapshotDate = dates[dates.length - 1] ?? null;

  return {
    units,
    snapshotDate,
    storeIdsWithSnapshot: [...latestSnapIdByStore.keys()],
  };
}
