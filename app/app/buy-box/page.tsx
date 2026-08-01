import { createSupabaseServerClient } from "@/lib/supabase/server";
import { profileMatchAuthUserId } from "@/lib/supabase/profile-match";
import { getEffectiveDealerGroupId } from "@/lib/dealer-group-context";
import { canAccessBuyBox } from "@/lib/plan-access";
import PlanNoAccessState from "../PlanNoAccessState";
import SelectAutoGroupEmptyState from "../SelectAutoGroupEmptyState";

export default async function BuyBoxPage() {
  const supabase = createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, dealer_group_id, role")
    .or(profileMatchAuthUserId(session!.user.id))
    .maybeSingle();

  const dealerGroupId = await getEffectiveDealerGroupId(profile);

  if (!dealerGroupId || !profile) {
    return <SelectAutoGroupEmptyState />;
  }

  const { data: group } = await supabase
    .from("dealer_groups")
    .select("plan")
    .eq("id", dealerGroupId)
    .maybeSingle();

  if (!canAccessBuyBox(group?.plan)) {
    return (
      <PlanNoAccessState
        title="Buy-Box"
        description="A full buy-box and red-light list — built from your store’s closed deals — is available on the Advise plan."
        requiredPlan="Advise"
      />
    );
  }

  return (
    <div className="space-y-5">
      <section className="app-panel p-5">
        <p className="app-kicker">Advise</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-foreground">Buy-Box</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Define what to buy — and what to never buy again — from your own deal outcomes.
        </p>
      </section>

      <section className="app-panel space-y-3 p-6">
        <h2 className="text-lg font-semibold text-foreground">Coming soon</h2>
        <p className="text-sm text-muted-foreground">
          This page will host your store’s full buy-box and red-light build-out: target makes,
          models, price bands, and acquisition rules pulled from what actually grosses — plus a
          clear list of units to stop buying.
        </p>
        <p className="text-sm text-muted-foreground">
          Placeholder only for now. The product build lands next.
        </p>
      </section>
    </div>
  );
}
