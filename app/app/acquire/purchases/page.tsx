import { createSupabaseServerClient } from "@/lib/supabase/server";
import { profileMatchAuthUserId } from "@/lib/supabase/profile-match";
import {
  getEffectiveDealerGroupId,
} from "@/lib/dealer-group-context";
import { getEffectiveEntitlements } from "@/lib/entitlements";
import { getAccessibleStores } from "@/lib/store-access";
import { canAccessAcquire } from "@/lib/plan-access";
import { canMutateAcquire } from "@/lib/roles";
import { parseStoreIdsParam } from "@/lib/acquire/store-labels";
import { syncAcquireOverlaysForStoresLatest } from "@/lib/acquire/sync-inventory";
import { daysInStep, stageEnteredAtByPurchase } from "@/lib/acquire/cost";
import type { AcqBuyer, AcqPurchase } from "@/lib/acquire/types";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import SelectAutoGroupEmptyState from "../../SelectAutoGroupEmptyState";
import AcquireNoAccessState from "../../AcquireNoAccessState";
import PurchasesClient from "./PurchasesClient";

export default async function AcquirePurchasesPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, dealer_group_id, role")
    .or(profileMatchAuthUserId(user!.id))
    .maybeSingle();

  const dealerGroupId = await getEffectiveDealerGroupId(profile);

  if (!dealerGroupId || !profile) {
    return <SelectAutoGroupEmptyState />;
  }

  const entitlements = await getEffectiveEntitlements(supabase, profile);
  if (!canAccessAcquire(entitlements.acquire_enabled)) {
    return <AcquireNoAccessState />;
  }

  const stores = await getAccessibleStores(supabase, profile);
  if (stores.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No stores available for your account.</p>
    );
  }

  const storeIds = stores.map((s) => s.id);
  const initialStoreIds = parseStoreIdsParam(searchParams, storeIds);

  // Pull latest IC cost/books onto purchases (runs even if no new inventory upload
  // happened after the purchase was logged). Service client bypasses write RLS.
  try {
    const service = createSupabaseServiceClient();
    await syncAcquireOverlaysForStoresLatest(service, storeIds);
  } catch (e) {
    console.error("Acquire overlay refresh on purchases page", e);
  }

  const [
    { data: assignedRows, error },
    { data: unassignedRows, error: unassignedError },
    { data: buyerRows, error: buyersError },
    { data: makeRows },
    { data: modelRows },
  ] = await Promise.all([
    supabase
      .from("acq_purchases")
      .select("*")
      .in("store_id", storeIds)
      .order("updated_at", { ascending: false }),
    supabase
      .from("acq_purchases")
      .select("*")
      .is("store_id", null)
      .eq("dealer_group_id", dealerGroupId)
      .order("updated_at", { ascending: false }),
    supabase
      .from("acq_buyers")
      .select("id, dealer_group_id, name, active")
      .eq("dealer_group_id", dealerGroupId)
      .order("name"),
    supabase.from("vehicle_makes").select("id,name").eq("active", true).order("name"),
    supabase.from("vehicle_models").select("id,name,make_id").eq("active", true).order("name"),
  ]);

  if (error) {
    console.error("acq_purchases load", error);
  }
  if (unassignedError) {
    console.error("acq_purchases unassigned load", unassignedError);
  }
  if (buyersError) {
    console.error("acq_buyers load (purchases)", buyersError);
  }

  const seen = new Set<string>();
  const rows: AcqPurchase[] = [];
  for (const row of [...(assignedRows ?? []), ...(unassignedRows ?? [])] as AcqPurchase[]) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    rows.push(row);
  }
  rows.sort((a, b) => String(b.updated_at ?? "").localeCompare(String(a.updated_at ?? "")));

  const basePurchases = rows;
  let purchases = basePurchases;
  if (basePurchases.length) {
    const { data: eventRows, error: eventsError } = await supabase
      .from("acq_stage_events")
      .select("purchase_id, to_stage, created_at")
      .in(
        "purchase_id",
        basePurchases.map((p) => p.id)
      )
      .order("created_at", { ascending: false });
    if (eventsError) {
      console.error("acq_stage_events load (purchases)", eventsError);
    }
    const enteredAt = stageEnteredAtByPurchase(basePurchases, eventRows ?? []);
    const now = new Date();
    purchases = basePurchases.map((p) => ({
      ...p,
      days_in_step: daysInStep(enteredAt[p.id] ?? p.created_at, now),
    }));
  }

  return (
    <PurchasesClient
      stores={stores.map((s) => ({ id: s.id, name: s.name }))}
      buyers={(buyerRows ?? []) as AcqBuyer[]}
      vehicleMakes={(makeRows ?? []) as { id: string; name: string }[]}
      vehicleModels={(modelRows ?? []) as { id: string; name: string; make_id: string }[]}
      initialStoreIds={initialStoreIds}
      purchases={purchases}
      canEdit={canMutateAcquire(profile.role)}
    />
  );
}
