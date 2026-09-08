import type { SupabaseClient } from "@supabase/supabase-js";

export type UndoSnapshotResult = {
  snapshotId: string;
  storeId: string;
  snapshotDate: string;
  sourceFilename: string | null;
  /** Max remaining snapshot_date for the store after undo, if any */
  previousLatestDate: string | null;
};

/**
 * Hard-delete a snapshot and its same-day derived rows (metrics, movements, price actions).
 * Only allowed when the snapshot is the store's latest by snapshot_date — otherwise later
 * days' deltas/movements would be inconsistent.
 */
export async function undoInventorySnapshot(
  supabase: SupabaseClient,
  snapshotId: string
): Promise<UndoSnapshotResult> {
  const { data: snap, error: snapErr } = await supabase
    .from("inv_snapshots")
    .select("id, store_id, snapshot_date, source_filename")
    .eq("id", snapshotId)
    .maybeSingle();

  if (snapErr) throw new Error(`Lookup failed: ${snapErr.message}`);
  if (!snap) throw new Error("Snapshot not found");

  const { data: latest, error: latestErr } = await supabase
    .from("inv_snapshots")
    .select("id, snapshot_date")
    .eq("store_id", snap.store_id)
    .order("snapshot_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestErr) throw new Error(`Latest check failed: ${latestErr.message}`);
  if (!latest || latest.id !== snap.id) {
    throw new Error(
      `Can only undo the latest snapshot for this store (latest is ${latest?.snapshot_date ?? "none"}). Undo newer days first.`
    );
  }

  const storeId = snap.store_id as string;
  const snapshotDate = snap.snapshot_date as string;

  // Units cascade from snapshot delete; clear date-keyed derived tables explicitly.
  const { error: delSnapErr } = await supabase.from("inv_snapshots").delete().eq("id", snap.id);
  if (delSnapErr) throw new Error(`Snapshot delete failed: ${delSnapErr.message}`);

  const { error: mErr } = await supabase
    .from("inv_daily_metrics")
    .delete()
    .eq("store_id", storeId)
    .eq("snapshot_date", snapshotDate);
  if (mErr) throw new Error(`Metrics delete failed: ${mErr.message}`);

  const { error: movErr } = await supabase
    .from("inv_movements")
    .delete()
    .eq("store_id", storeId)
    .eq("movement_date", snapshotDate);
  if (movErr) throw new Error(`Movements delete failed: ${movErr.message}`);

  const { error: paErr } = await supabase
    .from("inv_price_actions")
    .delete()
    .eq("store_id", storeId)
    .eq("action_date", snapshotDate);
  if (paErr) throw new Error(`Price actions delete failed: ${paErr.message}`);

  const { data: prev } = await supabase
    .from("inv_snapshots")
    .select("snapshot_date")
    .eq("store_id", storeId)
    .order("snapshot_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  return {
    snapshotId: snap.id,
    storeId,
    snapshotDate,
    sourceFilename: snap.source_filename ?? null,
    previousLatestDate: prev?.snapshot_date ?? null,
  };
}
