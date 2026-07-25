"use server";

import { revalidatePath } from "next/cache";
import { requireAdminContext } from "@/app/admin/admin-data";
import { parseDealImportCsv } from "@/lib/deal-import/parse";
import { validateImportRows } from "@/lib/deal-import/validate";
import { commitDealImportBatch } from "@/lib/deal-import/commit";
import { buildTemplateCsv } from "@/lib/deal-import/csv-schema";

export type BatchPreview = {
  batchId: string;
  dealerGroupId: string;
  dealerGroupName: string;
  storeId: string;
  storeName: string;
  fileName: string;
  rowCount: number;
  validCount: number;
  errorCount: number;
  status: string;
  rows: {
    rowNumber: number;
    stockNumber: string;
    customerLastName: string;
    saleDate: string;
    isValid: boolean;
    errors: string[];
    warnings: string[];
  }[];
  willCreate: string[];
};

async function assertStoreInGroup(
  supabase: Awaited<ReturnType<typeof requireAdminContext>>["supabase"],
  dealerGroupId: string,
  storeId: string
) {
  const { data: store, error } = await supabase
    .from("stores")
    .select("id, name, dealer_group_id")
    .eq("id", storeId)
    .maybeSingle();

  if (error || !store) {
    throw new Error("Store not found");
  }
  if (store.dealer_group_id !== dealerGroupId) {
    throw new Error("Store does not belong to the selected Auto Group");
  }
  return store as { id: string; name: string; dealer_group_id: string };
}

export async function getBulkUploadBootstrap() {
  const { supabase } = await requireAdminContext();

  const [{ data: groups }, { data: stores }] = await Promise.all([
    supabase.from("dealer_groups").select("id,name").order("name"),
    supabase.from("stores").select("id,name,dealer_group_id").order("name"),
  ]);

  return {
    groups: (groups ?? []) as { id: string; name: string }[],
    stores: (stores ?? []) as { id: string; name: string; dealer_group_id: string }[],
  };
}

export async function getTemplateCsvAction(): Promise<string> {
  await requireAdminContext();
  return buildTemplateCsv();
}

export async function createBatchFromCsv(input: {
  dealerGroupId: string;
  storeId: string;
  fileName: string;
  csvText: string;
}): Promise<BatchPreview> {
  const { supabase, profileId } = await requireAdminContext();

  const dealerGroupId = input.dealerGroupId.trim();
  const storeId = input.storeId.trim();
  if (!dealerGroupId || !storeId) {
    throw new Error("Auto Group and Store are required");
  }

  const store = await assertStoreInGroup(supabase, dealerGroupId, storeId);

  const { data: group } = await supabase
    .from("dealer_groups")
    .select("id,name")
    .eq("id", dealerGroupId)
    .maybeSingle();
  if (!group) throw new Error("Auto Group not found");

  const { fileErrors, rows: parsedRows } = parseDealImportCsv(input.csvText);
  if (fileErrors.length > 0) {
    throw new Error(fileErrors.join("; "));
  }

  const [
    deptsResult,
    spResult,
    fmResult,
    srcResult,
    deptMakesResult,
    dealsResult,
  ] = await Promise.all([
    supabase.from("departments").select("id,name").eq("store_id", storeId),
    supabase.from("salespeople").select("id,name").eq("store_id", storeId),
    supabase.from("finance_managers").select("id,name").eq("store_id", storeId),
    supabase.from("acquisition_sources").select("id,name").eq("store_id", storeId),
    supabase.from("department_makes").select("department_id,make"),
    supabase.from("deals").select("stock_number").eq("store_id", storeId),
  ]);

  const existingStockNumbers = new Set(
    ((dealsResult.data ?? []) as { stock_number: string }[]).map((d) =>
      d.stock_number.trim().toLowerCase()
    )
  );

  const validated = validateImportRows(parsedRows, {
    departments: (deptsResult.data ?? []) as { id: string; name: string }[],
    salespeople: (spResult.data ?? []) as { id: string; name: string }[],
    financeManagers: (fmResult.data ?? []) as { id: string; name: string }[],
    acquisitionSources: (srcResult.data ?? []) as { id: string; name: string }[],
    departmentMakes: (deptMakesResult.data ?? []) as {
      department_id: string;
      make: string;
    }[],
    existingStockNumbers,
  });

  const validCount = validated.filter((r) => r.is_valid).length;
  const errorCount = validated.filter((r) => !r.is_valid).length;

  const { data: batch, error: batchError } = await supabase
    .from("deal_import_batches")
    .insert({
      dealer_group_id: dealerGroupId,
      store_id: storeId,
      uploaded_by: profileId,
      file_name: input.fileName || "upload.csv",
      status: "pending_review",
      row_count: validated.length,
      valid_count: validCount,
      error_count: errorCount,
    })
    .select("id")
    .single();

  if (batchError || !batch) {
    throw new Error(
      `Failed to create import batch: ${batchError?.message ?? "unknown error"}. Ensure the deal_import migration has been applied.`
    );
  }

  const rowInserts = validated.map((r) => ({
    batch_id: batch.id,
    row_number: r.rowNumber,
    raw: r.raw,
    normalized: r.normalized,
    resolved: r.resolved,
    errors: r.errors,
    warnings: r.warnings,
    is_valid: r.is_valid,
  }));

  const { error: rowsError } = await supabase.from("deal_import_rows").insert(rowInserts);
  if (rowsError) {
    await supabase.from("deal_import_batches").delete().eq("id", batch.id);
    throw new Error(`Failed to stage import rows: ${rowsError.message}`);
  }

  const willCreate = new Set<string>();
  for (const r of validated) {
    for (const w of r.warnings) willCreate.add(w);
  }

  return {
    batchId: batch.id,
    dealerGroupId,
    dealerGroupName: (group as { name: string }).name,
    storeId,
    storeName: store.name,
    fileName: input.fileName || "upload.csv",
    rowCount: validated.length,
    validCount,
    errorCount,
    status: "pending_review",
    rows: validated.map((r) => ({
      rowNumber: r.rowNumber,
      stockNumber: r.normalized?.stock_number ?? r.raw.stock_number ?? "",
      customerLastName: r.normalized?.customer_last_name ?? r.raw.customer_last_name ?? "",
      saleDate: r.normalized?.sale_date ?? r.raw.sale_date ?? "",
      isValid: r.is_valid,
      errors: r.errors,
      warnings: r.warnings,
    })),
    willCreate: Array.from(willCreate).sort(),
  };
}

export async function getBatchPreview(batchId: string): Promise<BatchPreview | null> {
  const { supabase } = await requireAdminContext();

  const { data: batch, error } = await supabase
    .from("deal_import_batches")
    .select(
      "id,dealer_group_id,store_id,file_name,status,row_count,valid_count,error_count"
    )
    .eq("id", batchId)
    .maybeSingle();

  if (error || !batch) return null;

  const b = batch as {
    id: string;
    dealer_group_id: string;
    store_id: string;
    file_name: string | null;
    status: string;
    row_count: number;
    valid_count: number;
    error_count: number;
  };

  // Re-verify store still belongs to group
  await assertStoreInGroup(supabase, b.dealer_group_id, b.store_id);

  const [{ data: group }, { data: store }, { data: rows }] = await Promise.all([
    supabase.from("dealer_groups").select("name").eq("id", b.dealer_group_id).maybeSingle(),
    supabase.from("stores").select("name").eq("id", b.store_id).maybeSingle(),
    supabase
      .from("deal_import_rows")
      .select("row_number,normalized,raw,errors,warnings,is_valid")
      .eq("batch_id", b.id)
      .order("row_number"),
  ]);

  const willCreate = new Set<string>();
  const previewRows = ((rows ?? []) as {
    row_number: number;
    normalized: { stock_number?: string; customer_last_name?: string; sale_date?: string } | null;
    raw: Record<string, string>;
    errors: string[];
    warnings: string[];
    is_valid: boolean;
  }[]).map((r) => {
    for (const w of r.warnings ?? []) willCreate.add(w);
    return {
      rowNumber: r.row_number,
      stockNumber: r.normalized?.stock_number ?? r.raw?.stock_number ?? "",
      customerLastName: r.normalized?.customer_last_name ?? r.raw?.customer_last_name ?? "",
      saleDate: r.normalized?.sale_date ?? r.raw?.sale_date ?? "",
      isValid: r.is_valid,
      errors: r.errors ?? [],
      warnings: r.warnings ?? [],
    };
  });

  return {
    batchId: b.id,
    dealerGroupId: b.dealer_group_id,
    dealerGroupName: (group as { name: string } | null)?.name ?? "Unknown",
    storeId: b.store_id,
    storeName: (store as { name: string } | null)?.name ?? "Unknown",
    fileName: b.file_name ?? "upload.csv",
    rowCount: b.row_count,
    validCount: b.valid_count,
    errorCount: b.error_count,
    status: b.status,
    rows: previewRows,
    willCreate: Array.from(willCreate).sort(),
  };
}

export async function cancelBatch(batchId: string): Promise<void> {
  const { supabase } = await requireAdminContext();

  const { data: batch } = await supabase
    .from("deal_import_batches")
    .select("id,status")
    .eq("id", batchId)
    .maybeSingle();

  if (!batch) throw new Error("Batch not found");
  if ((batch as { status: string }).status !== "pending_review") {
    throw new Error("Only pending batches can be cancelled");
  }

  const { error } = await supabase
    .from("deal_import_batches")
    .update({ status: "cancelled" })
    .eq("id", batchId);

  if (error) throw new Error(`Cancel failed: ${error.message}`);
  revalidatePath("/admin/bulk-upload");
}

export async function confirmBatch(
  batchId: string
): Promise<{ inserted: number; created_refs: number }> {
  const { supabase } = await requireAdminContext();

  const { data: batch, error } = await supabase
    .from("deal_import_batches")
    .select("id,status,error_count,valid_count,dealer_group_id,store_id")
    .eq("id", batchId)
    .maybeSingle();

  if (error || !batch) throw new Error("Batch not found");

  const b = batch as {
    id: string;
    status: string;
    error_count: number;
    valid_count: number;
    dealer_group_id: string;
    store_id: string;
  };

  if (b.status !== "pending_review") {
    throw new Error("Batch is not pending review");
  }
  if (b.error_count > 0) {
    throw new Error("Cannot confirm a batch with validation errors");
  }
  if (b.valid_count <= 0) {
    throw new Error("Batch has no valid rows to import");
  }

  // Critical: re-verify store ownership immediately before commit
  await assertStoreInGroup(supabase, b.dealer_group_id, b.store_id);

  const result = await commitDealImportBatch(supabase, batchId);
  revalidatePath("/admin/bulk-upload");
  revalidatePath("/app/deals");
  revalidatePath("/app/dashboard");
  return { inserted: result.inserted, created_refs: result.created_refs };
}
