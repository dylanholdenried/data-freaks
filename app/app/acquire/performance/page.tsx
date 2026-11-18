import { createSupabaseServerClient } from "@/lib/supabase/server";
import { profileMatchAuthUserId } from "@/lib/supabase/profile-match";
import { getEffectiveDealerGroupId } from "@/lib/dealer-group-context";
import { getEffectiveEntitlements } from "@/lib/entitlements";
import { getAccessibleStores } from "@/lib/store-access";
import { canAccessAcquire } from "@/lib/plan-access";
import { isPlatformStaff } from "@/lib/roles";
import { parseStoreIdsParam } from "@/lib/acquire/store-labels";
import type { AcqPurchase } from "@/lib/acquire/types";
import { parseAcquirePerfTab } from "@/lib/acquire/performance-analytics";
import {
  ACTIVE_DATE_PRESETS,
  type DatePreset,
} from "@/lib/profit-center/dateRange";
import {
  DEFAULT_BUY_BOX_SETTINGS,
  settingsFromDbRow,
} from "@/lib/profit-center/buyBox";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import SelectAutoGroupEmptyState from "../../SelectAutoGroupEmptyState";
import AcquireNoAccessState from "../../AcquireNoAccessState";
import PerformanceClient from "./PerformanceClient";

function PerformanceLockedState() {
  return (
    <div className="mx-auto flex max-w-lg flex-col gap-4 py-12">
      <section className="app-panel p-6">
        <p className="app-kicker">Acquire</p>
        <h1 className="mt-2 text-xl font-semibold tracking-tight text-foreground">
          Performance
        </h1>
        <div className="mt-4 space-y-3 text-sm text-muted-foreground">
          <p>This page is not available yet and is locked for non-admin users.</p>
          <p>Platform admins can still open it while it is under construction.</p>
        </div>
        <div className="mt-6">
          <Button asChild variant="outline" size="sm">
            <Link href="/app/acquire/purchases">Back to Purchases</Link>
          </Button>
        </div>
      </section>
    </div>
  );
}

function parsePreset(raw: string | undefined): DatePreset {
  if (raw && ACTIVE_DATE_PRESETS.has(raw as DatePreset)) {
    return raw as DatePreset;
  }
  return "mtd";
}

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

  if (!isPlatformStaff(profile?.role)) {
    return <PerformanceLockedState />;
  }

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
      <p className="text-sm text-muted-foreground">
        No stores available for your account.
      </p>
    );
  }

  const storeIds = stores.map((s) => s.id);
  const initialStoreIds = parseStoreIdsParam(searchParams, storeIds);
  const preset = parsePreset(
    typeof searchParams.preset === "string" ? searchParams.preset : undefined
  );
  const initialTab = parseAcquirePerfTab(
    typeof searchParams.tab === "string" ? searchParams.tab : undefined
  );

  const [purchasesRes, buyersRes, settingsRes] = await Promise.all([
    supabase.from("acq_purchases").select("*").in("store_id", storeIds),
    supabase
      .from("acq_buyers")
      .select("id,name")
      .eq("dealer_group_id", dealerGroupId)
      .order("name", { ascending: true }),
    supabase
      .from("profit_center_settings")
      .select(
        "min_volume,weight_front,weight_back,weight_turn,weight_trade,list_size"
      )
      .eq("dealer_group_id", dealerGroupId)
      .maybeSingle(),
  ]);

  const buyBoxSettings = settingsRes.error
    ? DEFAULT_BUY_BOX_SETTINGS
    : settingsFromDbRow(settingsRes.data ?? null);

  return (
    <PerformanceClient
      stores={stores.map((s) => ({ id: s.id, name: s.name }))}
      initialStoreIds={initialStoreIds}
      purchases={(purchasesRes.data ?? []) as AcqPurchase[]}
      buyers={(buyersRes.data ?? []) as { id: string; name: string }[]}
      buyBoxSettings={buyBoxSettings}
      initialPreset={preset}
      initialTab={initialTab}
    />
  );
}
