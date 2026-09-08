import { createSupabaseServerClient } from "@/lib/supabase/server";
import { profileMatchAuthUserId } from "@/lib/supabase/profile-match";
import {
  getDealerGroupAcquireEnabled,
  getEffectiveDealerGroupId,
} from "@/lib/dealer-group-context";
import { getAccessibleStores } from "@/lib/store-access";
import { canAccessAcquire } from "@/lib/plan-access";
import { canMutateAcquire } from "@/lib/roles";
import { parseStoreIdsParam } from "@/lib/acquire/store-labels";
import { syncAcquireOverlaysForStoresLatest } from "@/lib/acquire/sync-inventory";
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

  const acquireEnabled = await getDealerGroupAcquireEnabled(dealerGroupId);
  if (!canAccessAcquire(acquireEnabled)) {
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

  const [{ data: rows, error }, { data: buyerRows, error: buyersError }] = await Promise.all([
    supabase
      .from("acq_purchases")
      .select("*")
      .in("store_id", storeIds)
      .order("updated_at", { ascending: false }),
    supabase
      .from("acq_buyers")
      .select("id, dealer_group_id, name, active")
      .eq("dealer_group_id", dealerGroupId)
      .order("name"),
  ]);

  if (error) {
    console.error("acq_purchases load", error);
  }
  if (buyersError) {
    console.error("acq_buyers load (purchases)", buyersError);
  }

  return (
    <PurchasesClient
      stores={stores.map((s) => ({ id: s.id, name: s.name }))}
      buyers={(buyerRows ?? []) as AcqBuyer[]}
      initialStoreIds={initialStoreIds}
      purchases={(rows ?? []) as AcqPurchase[]}
      canEdit={canMutateAcquire(profile.role)}
    />
  );
}
