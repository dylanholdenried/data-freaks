import { createSupabaseServerClient } from "@/lib/supabase/server";
import { profileMatchAuthUserId } from "@/lib/supabase/profile-match";
import {
  getEffectiveDealerGroupId,
} from "@/lib/dealer-group-context";
import { getEffectiveEntitlements } from "@/lib/entitlements";
import { getAccessibleStores } from "@/lib/store-access";
import { canAccessInventoryCommand } from "@/lib/plan-access";
import { isAppViewOnly } from "@/lib/impersonation";
import { isPlatformStaff, isStoreViewer } from "@/lib/roles";
import { redirect } from "next/navigation";
import type {
  InvDailyMetrics,
  InvMovement,
  InvPriceAction,
  InvUnitDetailRow,
} from "@/lib/inventory-command/types";
import type { SoldDeal } from "@/lib/inventory-command/acq-source";
import {
  INV_UNIT_DETAIL_SELECT,
  isoDaysBefore,
  loadRecentMovements,
  loadSoldDeals,
  loadStoreSourceContext,
  SOLD_LOOKBACK_DAYS,
  toDetailUnits,
} from "@/lib/inventory-command/inventory-tab-data";
import type { DhPurchaseOverlay } from "@/lib/inventory-command/dh-purchases";
import { ACQ_STAGES, type AcqPurchaseStage } from "@/lib/acquire/types";
import { countTtlFails } from "@/lib/inventory-command/compute";
import PlanNoAccessState from "../PlanNoAccessState";
import SelectAutoGroupEmptyState from "../SelectAutoGroupEmptyState";
import InventoryCommandClient from "./InventoryCommandClient";

function asAcqStage(raw: string | null | undefined): AcqPurchaseStage {
  if (raw && (ACQ_STAGES as readonly string[]).includes(raw)) {
    return raw as AcqPurchaseStage;
  }
  return "need_to_stock_in";
}

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

  const entitlements = await getEffectiveEntitlements(supabase, profile);

  if (!canAccessInventoryCommand(entitlements.plan)) {
    return (
      <PlanNoAccessState
        title="Inventory Command"
        description="Daily inventory command center — merchandising, pricing, demand, and subprime audit — is available on the Analyze plan."
        requiredPlan="Analyze"
        viewerRole={profile.role}
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

  let units: InvUnitDetailRow[] = [];
  if (snapshotId) {
    const { data: unitRows } = await supabase
      .from("inv_units")
      .select(INV_UNIT_DETAIL_SELECT)
      .eq("snapshot_id", snapshotId);
    units = toDetailUnits((unitRows ?? []) as unknown as Record<string, unknown>[]);
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

  let dhPurchases: DhPurchaseOverlay[] = [];
  {
    const { data: purchRows } = await supabase
      .from("acq_purchases")
      .select(
        "stock_number, stage, on_hold, vehicle_year, vehicle_make, vehicle_model"
      )
      .eq("store_id", initialStoreId);
    dhPurchases = (purchRows ?? []).map((p) => ({
      stock_number: p.stock_number,
      stage: asAcqStage(p.stage),
      on_hold: Boolean(p.on_hold),
      vehicle_year: p.vehicle_year,
      vehicle_make: p.vehicle_make,
      vehicle_model: p.vehicle_model,
    }));
  }

  const sourceContexts = await loadStoreSourceContext(supabase, [initialStoreId]);
  const sourceContext = sourceContexts[initialStoreId]!;
  let recentMovements: InvMovement[] = [];
  let soldDeals: SoldDeal[] = [];
  if (snapshotDate) {
    [recentMovements, soldDeals] = await Promise.all([
      loadRecentMovements(supabase, [initialStoreId], isoDaysBefore(snapshotDate, 30)),
      loadSoldDeals(
        supabase,
        sourceContext.preOwnedDeptIds,
        isoDaysBefore(snapshotDate, SOLD_LOOKBACK_DAYS)
      ),
    ]);
  }

  const canTagSources = isPlatformStaff(profile.role) && !(await isAppViewOnly(profile.role));

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
      dhPurchases={dhPurchases}
      inventoryTab={{
        sourceNames: sourceContext.sourceNames,
        tags: sourceContext.tags,
        recentMovements,
        soldDeals,
        canTagSources,
      }}
    />
  );
}
