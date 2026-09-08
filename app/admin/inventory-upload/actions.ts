"use server";

import { revalidatePath } from "next/cache";
import { requireAdminContext } from "@/app/admin/admin-data";
import { ingestInventoryExport } from "@/lib/inventory-command/ingest";
import { seedInventoryHistory, type HistorySeedPayload } from "@/lib/inventory-command/seed-history";
import { buildInventoryCsvTemplate } from "@/lib/inventory-command/template";
import { undoInventorySnapshot } from "@/lib/inventory-command/undo";

export async function getInventoryUploadBootstrap() {
  const { supabase } = await requireAdminContext();

  const [{ data: groups }, { data: stores }] = await Promise.all([
    supabase.from("dealer_groups").select("id,name,plan").order("name"),
    supabase.from("stores").select("id,name,dealer_group_id").order("name"),
  ]);

  // Recent snapshots for history panel
  const { data: snaps } = await supabase
    .from("inv_snapshots")
    .select("id,store_id,snapshot_date,source_filename,row_count,created_at")
    .order("created_at", { ascending: false })
    .limit(30);

  // True latest snapshot id per store (for undo affordance)
  const { data: allLatest } = await supabase
    .from("inv_snapshots")
    .select("id,store_id,snapshot_date")
    .order("snapshot_date", { ascending: false });

  const latestIdByStore: Record<string, string> = {};
  for (const row of allLatest ?? []) {
    if (!latestIdByStore[row.store_id]) {
      latestIdByStore[row.store_id] = row.id;
    }
  }

  return {
    groups: (groups ?? []) as { id: string; name: string; plan: string }[],
    stores: (stores ?? []) as { id: string; name: string; dealer_group_id: string }[],
    recent: (snaps ?? []) as {
      id: string;
      store_id: string;
      snapshot_date: string;
      source_filename: string | null;
      row_count: number | null;
      created_at: string;
    }[],
    latestIdByStore,
  };
}

export async function getInventoryTemplateCsvAction(): Promise<string> {
  await requireAdminContext();
  return buildInventoryCsvTemplate();
}

export type InventoryUploadResult = {
  ok: true;
  snapshotId: string;
  storeId: string;
  snapshotDate: string;
  unitCount: number;
  arrivals: number;
  exits: number;
  priceActions: number;
  replaced: boolean;
};

export async function uploadInventoryExportAction(
  formData: FormData
): Promise<InventoryUploadResult | { ok: false; error: string }> {
  try {
    const { supabase } = await requireAdminContext();
    const authClient = (await import("@/lib/supabase/server")).createSupabaseServerClient();
    const {
      data: { user },
    } = await authClient.auth.getUser();

    const dealerGroupId = String(formData.get("dealerGroupId") || "").trim();
    const storeId = String(formData.get("storeId") || "").trim();
    const snapshotDate =
      String(formData.get("snapshotDate") || "").trim() ||
      new Date().toISOString().slice(0, 10);
    const file = formData.get("file");

    if (!dealerGroupId || !storeId) {
      return { ok: false, error: "Select an Auto Group and store" };
    }
    if (!(file instanceof File) || file.size === 0) {
      return { ok: false, error: "Choose an .xls or .csv export file" };
    }

    const name = file.name.toLowerCase();
    if (!name.endsWith(".xls") && !name.endsWith(".xlsx") && !name.endsWith(".csv")) {
      return { ok: false, error: "File must be .xls, .xlsx, or .csv" };
    }

    const { data: store, error: storeErr } = await supabase
      .from("stores")
      .select("id, dealer_group_id, name")
      .eq("id", storeId)
      .maybeSingle();

    if (storeErr || !store) return { ok: false, error: "Store not found" };
    if (store.dealer_group_id !== dealerGroupId) {
      return { ok: false, error: "Store does not belong to the selected Auto Group" };
    }

    const buf = Buffer.from(await file.arrayBuffer());
    const result = await ingestInventoryExport({
      supabase,
      storeId,
      snapshotDate,
      fileBuffer: buf,
      filename: file.name,
      uploadedBy: user?.id ?? null,
    });

    try {
      const { syncAcquireOverlaysForStore } = await import(
        "@/lib/acquire/sync-inventory"
      );
      await syncAcquireOverlaysForStore(supabase, storeId, result.snapshotId);
    } catch (syncErr) {
      console.error("Acquire overlay sync after inventory upload", syncErr);
    }

    revalidatePath("/admin/inventory-upload");
    revalidatePath("/app/inventory-command");
    revalidatePath("/app/acquire/purchases");
    revalidatePath("/app/acquire/performance");

    return { ok: true, ...result };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Upload failed",
    };
  }
}

export type UndoInventoryResult = {
  ok: true;
  snapshotDate: string;
  storeId: string;
  sourceFilename: string | null;
  previousLatestDate: string | null;
};

export async function undoInventoryUploadAction(
  snapshotId: string
): Promise<UndoInventoryResult | { ok: false; error: string }> {
  try {
    const { supabase } = await requireAdminContext();
    const id = String(snapshotId || "").trim();
    if (!id) return { ok: false, error: "Missing snapshot id" };

    const result = await undoInventorySnapshot(supabase, id);

    revalidatePath("/admin/inventory-upload");
    revalidatePath("/app/inventory-command");

    return {
      ok: true,
      snapshotDate: result.snapshotDate,
      storeId: result.storeId,
      sourceFilename: result.sourceFilename,
      previousLatestDate: result.previousLatestDate,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Undo failed",
    };
  }
}

export async function seedInventoryHistoryAction(
  payload: HistorySeedPayload
): Promise<{ ok: true; summary: string } | { ok: false; error: string }> {
  try {
    const { supabase } = await requireAdminContext();
    const result = await seedInventoryHistory(supabase, payload);
    revalidatePath("/app/inventory-command");
    return {
      ok: true,
      summary: `Metrics ${result.metricsUpserted}, movements ${result.movementsInserted}, price actions ${result.priceActionsInserted}, snapshots ${result.snapshotsCreated}, units ${result.unitsInserted}`,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Seed failed",
    };
  }
}
