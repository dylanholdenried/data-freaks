import { createSupabaseServerClient } from "@/lib/supabase/server";
import { profileMatchAuthUserId } from "@/lib/supabase/profile-match";
import {
  getDealerGroupAcquireEnabled,
  getEffectiveDealerGroupId,
} from "@/lib/dealer-group-context";
import { getAccessibleStores } from "@/lib/store-access";
import { canAccessAcquire } from "@/lib/plan-access";
import { parseStoreIdsParam } from "@/lib/acquire/store-labels";
import type { AcqPurchase } from "@/lib/acquire/types";
import SelectAutoGroupEmptyState from "../../SelectAutoGroupEmptyState";
import AcquireNoAccessState from "../../AcquireNoAccessState";
import PerformanceClient from "./PerformanceClient";

export default async function AcquirePerformancePage({
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

  const { data: rows } = await supabase
    .from("acq_purchases")
    .select("*")
    .in("store_id", storeIds);

  return (
    <PerformanceClient
      stores={stores.map((s) => ({ id: s.id, name: s.name }))}
      initialStoreIds={initialStoreIds}
      purchases={(rows ?? []) as AcqPurchase[]}
    />
  );
}
