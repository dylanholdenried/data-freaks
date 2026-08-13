import { createSupabaseServerClient } from "@/lib/supabase/server";
import { profileMatchAuthUserId } from "@/lib/supabase/profile-match";
import {
  getDealerGroupPlan,
  getEffectiveDealerGroupId,
} from "@/lib/dealer-group-context";
import { getAccessibleStores } from "@/lib/store-access";
import { canAccessInventoryCommand } from "@/lib/plan-access";
import { isStoreViewer } from "@/lib/roles";
import { redirect } from "next/navigation";
import type {
  InvDailyMetrics,
  InvMovement,
  InvPriceAction,
  InvUnitRow,
} from "@/lib/inventory-command/types";
import { countTtlFails } from "@/lib/inventory-command/compute";
import PlanNoAccessState from "../PlanNoAccessState";
import SelectAutoGroupEmptyState from "../SelectAutoGroupEmptyState";
import InventoryCommandClient from "./InventoryCommandClient";

export default async function InventoryCommandPage({
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

  if (isStoreViewer(profile?.role)) {
    redirect("/app/dashboard");
  }

  const dealerGroupId = await getEffectiveDealerGroupId(profile);

  if (!dealerGroupId || !profile) {
    return <SelectAutoGroupEmptyState />;
  }

  const groupPlan = await getDealerGroupPlan(dealerGroupId);

  if (!canAccessInventoryCommand(groupPlan)) {
    return (
      <PlanNoAccessState
        title="Inventory Command"
        description="Daily inventory command center — merchandising, pricing, demand, and subprime audit — is available on the Advise plan."
        requiredPlan="Advise"
      />
    );
  }

  const stores = await getAccessibleStores(supabase, profile);
  if (stores.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No stores available for your account.</p>
    );
  }

  const storeParam = typeof searchParams.store === "string" ? searchParams.store : null;
  const initialStoreId =
    storeParam && stores.some((s) => s.id === storeParam) ? storeParam : stores[0].id;

  const storeIds = stores.map((s) => s.id);

  // Latest snapshot per store
  const { data: allSnaps } = await supabase
    .from("inv_snapshots")
    .select("id, store_id, snapshot_date")
    .in("store_id", storeIds)
    .order("snapshot_date", { ascending: false });

  const latestByStore: Record<string, string | null> = {};
  const latestSnapIdByStore: Record<string, string | null> = {};
  for (const s of stores) {
    latestByStore[s.id] = null;
    latestSnapIdByStore[s.id] = null;
  }
  for (const snap of allSnaps ?? []) {
    if (!latestByStore[snap.store_id]) {
      latestByStore[snap.store_id] = snap.snapshot_date;
      latestSnapIdByStore[snap.store_id] = snap.id;
    }
  }

  const snapshotId = latestSnapIdByStore[initialStoreId];
  const snapshotDate = latestByStore[initialStoreId];

  let units: InvUnitRow[] = [];
  if (snapshotId) {
    const { data: unitRows } = await supabase
      .from("inv_units")
      .select(
        "stk,veh,body,age,ph,cost,price,pom,dsr,srp,vdp,vr,mmr,jd,pt,disp,d_vdp,d_srp,d_p,d_ph"
      )
      .eq("snapshot_id", snapshotId);
    units = (unitRows ?? []).map((u) => ({
      ...u,
      disp: (u.disp === "subprime" ? "subprime" : "retail") as "retail" | "subprime",
    })) as InvUnitRow[];
  }

  let metrics: InvDailyMetrics | null = null;
  if (snapshotDate) {
    const { data: m } = await supabase
      .from("inv_daily_metrics")
      .select("*")
      .eq("store_id", initialStoreId)
      .eq("snapshot_date", snapshotDate)
      .maybeSingle();
    metrics = (m as InvDailyMetrics) ?? null;
  }

  const { data: historyRows } = await supabase
    .from("inv_daily_metrics")
    .select("*")
    .eq("store_id", initialStoreId)
    .order("snapshot_date", { ascending: true })
    .limit(60);

  const metricsHistory = ((historyRows ?? []) as InvDailyMetrics[]).map((m) => {
    // Live-correct TTL for the latest snapshot (older rows stay as stored until re-ingest).
    if (snapshotDate && m.snapshot_date === snapshotDate && units.length > 0) {
      return { ...m, ttl_fail: countTtlFails(units) };
    }
    return m;
  });

  if (metrics && units.length > 0) {
    metrics = { ...metrics, ttl_fail: countTtlFails(units) };
  }

  // Trends uses the full history window (not just the latest snapshot day).
  let movements: InvMovement[] = [];
  let priceActions: InvPriceAction[] = [];
  {
    const [{ data: mov }, { data: pa }] = await Promise.all([
      supabase
        .from("inv_movements")
        .select("store_id,movement_date,type,stk,veh,age,cost")
        .eq("store_id", initialStoreId)
        .order("movement_date", { ascending: true })
        .limit(2000),
      supabase
        .from("inv_price_actions")
        .select("store_id,action_date,stk,veh,age,type,price,d_p")
        .eq("store_id", initialStoreId)
        .order("action_date", { ascending: true })
        .limit(2000),
    ]);
    movements = (mov ?? []) as InvMovement[];
    priceActions = (pa ?? []) as InvPriceAction[];
  }

  return (
    <InventoryCommandClient
      stores={stores}
      initialStoreId={initialStoreId}
      snapshotDate={snapshotDate}
      units={units}
      metrics={metrics}
      metricsHistory={metricsHistory}
      movements={movements}
      priceActions={priceActions}
      latestByStore={latestByStore}
    />
  );
}
