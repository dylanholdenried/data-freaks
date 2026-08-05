import type { SupabaseClient } from "@supabase/supabase-js";
import type { NormalizedDealImportRow } from "./csv-schema";
import type { ResolvedDealImport } from "./validate";

export type CommitBatchResult = {
  batch_id: string;
  inserted: number;
  created_refs: number;
};

type StagedRow = {
  row_number: number;
  normalized: NormalizedDealImportRow;
  resolved: ResolvedDealImport;
};

/**
 * Atomically commit a validated import batch via Postgres RPC when available.
 * Falls back to sequential service-role inserts if the RPC is missing.
 * Group/store IDs are taken only from the batch row — never from CSV content.
 */
export async function commitDealImportBatch(
  supabase: SupabaseClient,
  batchId: string
): Promise<CommitBatchResult> {
  const { data, error } = await supabase.rpc("commit_deal_import_batch", {
    p_batch_id: batchId,
  });

  if (!error) {
    const result = data as CommitBatchResult | null;
    if (!result || typeof result.inserted !== "number") {
      throw new Error("Commit failed: unexpected response from database");
    }
    return {
      batch_id: result.batch_id ?? batchId,
      inserted: result.inserted,
      created_refs: result.created_refs ?? 0,
    };
  }

  // Missing optional deals columns on older DBs — fall through to JS insert path
  // which retries without trade_status / other optional fields.
  const schemaMismatch =
    error.message.includes("does not exist") ||
    error.message.includes("trade_status") ||
    error.message.includes("dealer_group_id");

  // RPC missing or failed — use JS fallback only when function is absent or schema lags
  const missingFn =
    error.message.includes("Could not find the function") ||
    error.message.includes("commit_deal_import_batch") ||
    error.code === "PGRST202";

  if (!missingFn && !schemaMismatch) {
    throw new Error(`Commit failed: ${error.message}`);
  }

  return commitDealImportBatchJs(supabase, batchId);
}

async function commitDealImportBatchJs(
  supabase: SupabaseClient,
  batchId: string
): Promise<CommitBatchResult> {
  const { data: batch, error: batchError } = await supabase
    .from("deal_import_batches")
    .select(
      "id,status,error_count,valid_count,dealer_group_id,store_id,uploaded_by"
    )
    .eq("id", batchId)
    .maybeSingle();

  if (batchError || !batch) throw new Error("Import batch not found");

  const b = batch as {
    id: string;
    status: string;
    error_count: number;
    valid_count: number;
    dealer_group_id: string;
    store_id: string;
    uploaded_by: string | null;
  };

  if (b.status !== "pending_review") {
    throw new Error(`Batch is not pending review (status=${b.status})`);
  }
  if (b.error_count > 0 || b.valid_count <= 0) {
    throw new Error("Batch has validation errors or no valid rows");
  }

  const { data: store } = await supabase
    .from("stores")
    .select("dealer_group_id")
    .eq("id", b.store_id)
    .maybeSingle();

  if (!store || (store as { dealer_group_id: string }).dealer_group_id !== b.dealer_group_id) {
    throw new Error("Store does not belong to the batch dealer group");
  }

  const { data: rowData, error: rowsError } = await supabase
    .from("deal_import_rows")
    .select("row_number,normalized,resolved,is_valid")
    .eq("batch_id", batchId)
    .order("row_number");

  if (rowsError) throw new Error(rowsError.message);

  const rows = (rowData ?? []) as {
    row_number: number;
    normalized: NormalizedDealImportRow;
    resolved: ResolvedDealImport;
    is_valid: boolean;
  }[];

  if (rows.some((r) => !r.is_valid)) {
    throw new Error("Batch contains invalid rows");
  }

  let createdRefs = 0;
  const nameToSpId = new Map<string, string>();
  const nameToFmId = new Map<string, string>();

  // Prefetch existing roster
  const [spRes, fmRes, srcRes] = await Promise.all([
    supabase.from("salespeople").select("id,name").eq("store_id", b.store_id),
    supabase.from("finance_managers").select("id,name").eq("store_id", b.store_id),
    supabase.from("acquisition_sources").select("id,name").eq("store_id", b.store_id),
  ]);

  for (const sp of (spRes.data ?? []) as { id: string; name: string }[]) {
    nameToSpId.set(sp.name.trim().toLowerCase(), sp.id);
  }
  for (const fm of (fmRes.data ?? []) as { id: string; name: string }[]) {
    nameToFmId.set(fm.name.trim().toLowerCase(), fm.id);
  }
  const existingSources = new Set(
    ((srcRes.data ?? []) as { name: string }[]).map((s) => s.name.trim().toLowerCase())
  );

  for (const row of rows as StagedRow[]) {
    const res = row.resolved;
    for (const name of res.create_salespeople ?? []) {
      if (!name?.trim()) continue;
      const key = name.trim().toLowerCase();
      if (nameToSpId.has(key)) continue;
      const { data, error } = await supabase
        .from("salespeople")
        .insert({ store_id: b.store_id, name, active: true })
        .select("id")
        .single();
      if (error) throw new Error(`Create salesperson failed: ${error.message}`);
      nameToSpId.set(key, (data as { id: string }).id);
      createdRefs += 1;
    }
    if (res.create_finance_manager) {
      const key = res.create_finance_manager.trim().toLowerCase();
      if (!nameToFmId.has(key)) {
        const { data, error } = await supabase
          .from("finance_managers")
          .insert({
            store_id: b.store_id,
            name: res.create_finance_manager,
            active: true,
          })
          .select("id")
          .single();
        if (error) throw new Error(`Create finance manager failed: ${error.message}`);
        nameToFmId.set(key, (data as { id: string }).id);
        createdRefs += 1;
      }
    }
    if (res.create_acquisition_source) {
      const key = res.create_acquisition_source.trim().toLowerCase();
      if (!existingSources.has(key)) {
        const { error } = await supabase.from("acquisition_sources").insert({
          store_id: b.store_id,
          name: res.create_acquisition_source,
        });
        if (error) throw new Error(`Create acquisition source failed: ${error.message}`);
        existingSources.add(key);
        createdRefs += 1;
      }
    }
  }

  let inserted = 0;
  const insertedDealIds: string[] = [];

  try {
    for (const row of rows as StagedRow[]) {
      const n = row.normalized;
      const res = row.resolved;

      let sp1Id: string | null =
        res.salesperson_1_id ??
        (n.salesperson_1
          ? nameToSpId.get(n.salesperson_1.trim().toLowerCase()) ?? null
          : null);
      if (n.salesperson_1 && !sp1Id) {
        throw new Error(`Row ${row.row_number}: salesperson not found`);
      }

      let sp2Id: string | null = res.salesperson_2_id;
      if (n.salesperson_2 && !sp2Id) {
        sp2Id = nameToSpId.get(n.salesperson_2.trim().toLowerCase()) ?? null;
        if (!sp2Id) throw new Error(`Row ${row.row_number}: salesperson 2 not found`);
      }

      let fmId: string | null =
        res.finance_manager_id ??
        (n.finance_manager
          ? nameToFmId.get(n.finance_manager.trim().toLowerCase()) ?? null
          : null);
      if (n.finance_manager && !fmId) {
        throw new Error(`Row ${row.row_number}: finance manager not found`);
      }

      const dealStatus = n.status === "closed" ? "closed" : "pending";

      // Live deals table has no dealer_group_id — group is implied via store_id.
      const dealPayload: Record<string, unknown> = {
        store_id: b.store_id,
        department_id: res.department_id,
        status: dealStatus,
        trade_status: n.has_trade === "yes" ? "has_trade" : "no_trade",
        customer_last_name: n.customer_last_name,
        sale_date: n.sale_date,
        stock_number: n.stock_number,
        vehicle_year: n.vehicle_year,
        vehicle_make: n.vehicle_make,
        vehicle_model: n.vehicle_model,
        vin: n.vin,
        trim: n.trim,
        color: n.color,
        body_style: n.body_style,
        drivetrain: n.drivetrain,
        odometer: n.odometer,
        age: n.age,
        acquisition_source: n.acquisition_source,
        finance_type: n.finance_type,
        finance_manager_id: fmId,
        front_profit: n.front_profit,
        back_profit: n.back_profit,
        sale_price: n.sale_price,
        list_price: n.list_price_na ? null : n.list_price,
        list_price_na: n.list_price_na,
        msrp: n.msrp,
        entered_by: b.uploaded_by,
      };

      const { data: deal, error: dealError } = await supabase
        .from("deals")
        .insert(dealPayload)
        .select("id")
        .single();

      if (dealError) {
        // Retry without trade_status if column missing on older DBs
        if (dealError.message.includes("trade_status")) {
          delete dealPayload.trade_status;
          const retry = await supabase.from("deals").insert(dealPayload).select("id").single();
          if (retry.error) throw new Error(`Row ${row.row_number}: ${retry.error.message}`);
          insertedDealIds.push((retry.data as { id: string }).id);
        } else {
          throw new Error(`Row ${row.row_number}: ${dealError.message}`);
        }
      } else {
        insertedDealIds.push((deal as { id: string }).id);
      }

      const dealId = insertedDealIds[insertedDealIds.length - 1];

      await supabase
        .from("deal_import_rows")
        .update({ deal_id: dealId })
        .eq("batch_id", batchId)
        .eq("row_number", row.row_number);

      if (sp1Id && n.salesperson_1_share != null) {
        const splits = [
          {
            deal_id: dealId,
            salesperson_id: sp1Id,
            share_percent: n.salesperson_1_share,
          },
        ];
        if (sp2Id && n.salesperson_2_share != null) {
          splits.push({
            deal_id: dealId,
            salesperson_id: sp2Id,
            share_percent: n.salesperson_2_share,
          });
        }
        const { error: spError } = await supabase.from("deal_salespeople").insert(splits);
        if (spError) throw new Error(`Row ${row.row_number}: ${spError.message}`);
      }

      if (n.has_trade === "yes" && n.trade_complete) {
        const { error: tradeError } = await supabase.from("trades").insert({
          deal_id: dealId,
          year: n.trade_year,
          make: n.trade_make,
          model: n.trade_model,
          acv: n.trade_acv,
          allowance: n.trade_allowance,
          exit_strategy: n.trade_exit_strategy,
        });
        if (tradeError) throw new Error(`Row ${row.row_number}: ${tradeError.message}`);
      }

      if (n.notes) {
        const { error: noteError } = await supabase
          .from("deal_notes")
          .insert({ deal_id: dealId, note: n.notes });
        if (noteError) throw new Error(`Row ${row.row_number}: ${noteError.message}`);
      }

      inserted += 1;
    }
  } catch (err) {
    // Best-effort cleanup of partial inserts
    if (insertedDealIds.length > 0) {
      await supabase.from("deals").delete().in("id", insertedDealIds);
    }
    throw err;
  }

  const { error: updateError } = await supabase
    .from("deal_import_batches")
    .update({ status: "committed", committed_at: new Date().toISOString() })
    .eq("id", batchId);

  if (updateError) {
    throw new Error(
      `Deals inserted but batch status update failed: ${updateError.message}`
    );
  }

  return { batch_id: batchId, inserted, created_refs: createdRefs };
}

export type UnwindBatchResult = {
  batch_id: string;
  deleted: number;
};

/**
 * Delete deals created by a committed import batch and mark the batch unwound.
 */
export async function unwindDealImportBatch(
  supabase: SupabaseClient,
  batchId: string
): Promise<UnwindBatchResult> {
  const { data, error } = await supabase.rpc("unwind_deal_import_batch", {
    p_batch_id: batchId,
  });

  if (!error) {
    const result = data as UnwindBatchResult | null;
    if (!result || typeof result.deleted !== "number") {
      throw new Error("Unwind failed: unexpected response from database");
    }
    return {
      batch_id: result.batch_id ?? batchId,
      deleted: result.deleted,
    };
  }

  const missingFn =
    error.message.includes("Could not find the function") ||
    error.message.includes("unwind_deal_import_batch") ||
    error.code === "PGRST202";

  if (!missingFn) {
    throw new Error(`Unwind failed: ${error.message}`);
  }

  return unwindDealImportBatchJs(supabase, batchId);
}

async function unwindDealImportBatchJs(
  supabase: SupabaseClient,
  batchId: string
): Promise<UnwindBatchResult> {
  const { data: batch, error: batchError } = await supabase
    .from("deal_import_batches")
    .select("id,status,store_id")
    .eq("id", batchId)
    .maybeSingle();

  if (batchError || !batch) throw new Error("Import batch not found");

  const b = batch as { id: string; status: string; store_id: string };
  if (b.status !== "committed") {
    throw new Error(`Only committed batches can be unwound (status=${b.status})`);
  }

  const { data: rows, error: rowsError } = await supabase
    .from("deal_import_rows")
    .select("deal_id,normalized,is_valid")
    .eq("batch_id", batchId)
    .eq("is_valid", true);

  if (rowsError) throw new Error(rowsError.message);

  const typedRows = (rows ?? []) as {
    deal_id: string | null;
    normalized: { stock_number?: string } | null;
    is_valid: boolean;
  }[];

  let dealIds = typedRows.map((r) => r.deal_id).filter((id): id is string => !!id);

  if (dealIds.length === 0) {
    const stocks = typedRows
      .map((r) => r.normalized?.stock_number?.trim().toLowerCase())
      .filter((s): s is string => !!s);
    if (stocks.length > 0) {
      const { data: deals, error: dealsError } = await supabase
        .from("deals")
        .select("id,stock_number")
        .eq("store_id", b.store_id);
      if (dealsError) throw new Error(dealsError.message);
      const stockSet = new Set(stocks);
      dealIds = ((deals ?? []) as { id: string; stock_number: string }[])
        .filter((d) => stockSet.has(d.stock_number.trim().toLowerCase()))
        .map((d) => d.id);
    }
  }

  let deleted = 0;
  if (dealIds.length > 0) {
    const { error: delError, count } = await supabase
      .from("deals")
      .delete({ count: "exact" })
      .in("id", dealIds)
      .eq("store_id", b.store_id);
    if (delError) throw new Error(delError.message);
    deleted = count ?? dealIds.length;
  }

  await supabase
    .from("deal_import_rows")
    .update({ deal_id: null })
    .eq("batch_id", batchId)
    .not("deal_id", "is", null);

  const { error: updateError } = await supabase
    .from("deal_import_batches")
    .update({ status: "unwound", unwound_at: new Date().toISOString() })
    .eq("id", batchId);

  if (updateError) throw new Error(updateError.message);

  return { batch_id: batchId, deleted };
}
