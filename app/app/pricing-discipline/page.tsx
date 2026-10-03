import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { profileMatchAuthUserId } from "@/lib/supabase/profile-match";
import { getEffectiveDealerGroupId } from "@/lib/dealer-group-context";
import { getEffectiveEntitlements } from "@/lib/entitlements";
import { getAccessibleStores } from "@/lib/store-access";
import { canAccessPricingDiscipline } from "@/lib/plan-access";
import { isPlatformStaff, isStoreViewer } from "@/lib/roles";
import { isAppViewOnly } from "@/lib/impersonation";
import {
  ACTIVE_DATE_PRESETS,
  resolveDateRange,
  type DatePreset,
} from "@/lib/profit-center/dateRange";
import {
  loadMissingListPriceDeals,
  loadPricingDisciplineDeals,
} from "@/lib/pricing-discipline/load";
import SelectAutoGroupEmptyState from "../SelectAutoGroupEmptyState";
import PlanNoAccessState from "../PlanNoAccessState";
import PricingDisciplineClient from "./PricingDisciplineClient";

type Store = { id: string; name: string };
type Salesperson = { id: string; name: string; store_id: string };

function PricingDisciplineLockedState() {
  return (
    <div className="mx-auto flex max-w-lg flex-col gap-4 py-12">
      <section className="app-panel p-6">
        <p className="app-kicker">Analyze</p>
        <h1 className="mt-2 text-xl font-semibold tracking-tight text-foreground">
          Pricing Discipline
        </h1>
        <div className="mt-4 space-y-3 text-sm text-muted-foreground">
          <p>This page is not available yet and is locked for non-admin users.</p>
          <p>Platform admins can still open it while it is under construction.</p>
        </div>
        <div className="mt-6">
          <Button asChild variant="outline" size="sm">
            <Link href="/app/profit-center">Back to Profit Center</Link>
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
  return "last_3_months";
}

export default async function PricingDisciplinePage({
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
    return <PricingDisciplineLockedState />;
  }

  if (isStoreViewer(profile?.role)) {
    redirect("/app/dashboard");
  }

  const dealerGroupId = await getEffectiveDealerGroupId(profile);
  if (!dealerGroupId || !profile) {
    return <SelectAutoGroupEmptyState />;
  }

  const entitlements = await getEffectiveEntitlements(supabase, profile);
  if (!canAccessPricingDiscipline(entitlements.plan)) {
    return (
      <PlanNoAccessState
        title="Pricing Discipline"
        description="Sale price vs inventory list price, gross given up per deal, market positioning at sale, and planned disposition vs actual exit are available on the Analyze plan."
        requiredPlan="Analyze"
        viewerRole={profile.role}
      />
    );
  }

  const stores = (await getAccessibleStores(supabase, profile)) as Store[];
  const storeIds = stores.map((s) => s.id);

  const preset = parsePreset(
    typeof searchParams.preset === "string" ? searchParams.preset : undefined
  );
  const storeParam =
    typeof searchParams.store === "string" ? searchParams.store : undefined;
  const initialStoreId =
    storeParam && stores.some((s) => s.id === storeParam) ? storeParam : "all";
  const range = resolveDateRange(preset, { now: new Date() });

  const viewOnly = await isAppViewOnly(profile.role);
  const canOverride = isPlatformStaff(profile.role) && !viewOnly;

  const [bundle, missing, spRes] = await Promise.all([
    loadPricingDisciplineDeals(supabase, storeIds, range),
    loadMissingListPriceDeals(supabase, storeIds),
    storeIds.length
      ? supabase.from("salespeople").select("id,name,store_id").in("store_id", storeIds)
      : Promise.resolve({ data: [] as Salesperson[] }),
  ]);

  return (
    <PricingDisciplineClient
      stores={stores}
      departments={bundle.departments}
      deals={bundle.deals}
      dealSalespeople={bundle.dealSalespeople}
      trades={bundle.trades}
      salespeople={(spRes.data ?? []) as Salesperson[]}
      missingDeals={missing}
      canOverride={canOverride}
      groupName={entitlements.groupName ?? ""}
      preset={preset}
      range={range}
      initialStoreId={initialStoreId}
    />
  );
}
