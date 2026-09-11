import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { profileMatchAuthUserId } from "@/lib/supabase/profile-match";
import {
  getEffectiveDealerGroupId,
  getDealerGroupPlanInfo,
} from "@/lib/dealer-group-context";
import { isPlatformStaff } from "@/lib/roles";
import {
  annualPriceCents,
  billingStatusLabel,
  DEFAULT_MONTHLY_PRICE_CENTS,
  formatDateShort,
  formatMoneyFromCents,
  type StoreBillingRow,
} from "@/lib/billing";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import SelectAutoGroupEmptyState from "../SelectAutoGroupEmptyState";
import BillingClient from "./BillingClient";

export const dynamic = "force-dynamic";

export default async function BillingPage() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, dealer_group_id, role")
    .or(profileMatchAuthUserId(user!.id))
    .maybeSingle();

  const canView =
    profile?.role === "group_admin" || isPlatformStaff(profile?.role);
  if (!canView) {
    redirect("/app/dashboard");
  }

  const dealerGroupId = await getEffectiveDealerGroupId(profile);
  if (!dealerGroupId || !profile) {
    return <SelectAutoGroupEmptyState />;
  }

  const groupInfo = await getDealerGroupPlanInfo(dealerGroupId);
  const service = createSupabaseServiceClient();
  const { data: stores, error } = await service
    .from("stores")
    .select(
      "id, name, is_demo, plan, acquire_enabled, billing_interval, billing_status, trial_ends_at, current_period_end, bulk_import_window_ends_at, activation_fee_paid_at, monthly_price_cents"
    )
    .eq("dealer_group_id", dealerGroupId)
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (error) {
    console.error("Billing page stores load", error);
  }

  const storeRows = (stores ?? []) as StoreBillingRow[];

  const analyzeStores = storeRows.filter((s) => s.plan === "analyze");
  const listMonthly = analyzeStores.reduce(
    (sum, s) => sum + (s.monthly_price_cents ?? DEFAULT_MONTHLY_PRICE_CENTS),
    0
  );
  const listAnnual = analyzeStores.reduce(
    (sum, s) =>
      sum + annualPriceCents(s.monthly_price_cents ?? DEFAULT_MONTHLY_PRICE_CENTS),
    0
  );
  const trialingCount = storeRows.filter((s) => s.billing_status === "trialing").length;
  const acquireCount = storeRows.filter((s) => s.acquire_enabled).length;

  const summary = {
    groupName: groupInfo?.name ?? "Your group",
    storeCount: storeRows.length,
    analyzeCount: analyzeStores.length,
    trialingCount,
    acquireCount,
    listMonthlyLabel: formatMoneyFromCents(listMonthly),
    listAnnualLabel: formatMoneyFromCents(listAnnual),
  };

  const tableRows = storeRows.map((s) => {
    const price = s.monthly_price_cents ?? DEFAULT_MONTHLY_PRICE_CENTS;
    return {
      id: s.id,
      name: s.name,
      isDemo: Boolean(s.is_demo),
      plan: s.plan === "analyze" ? "Analyze" : "Log",
      status: billingStatusLabel(s.billing_status),
      statusKey: s.billing_status ?? "none",
      interval:
        s.billing_interval === "annual"
          ? "Annual"
          : s.billing_interval === "monthly"
            ? "Monthly"
            : "—",
      priceMonthly: formatMoneyFromCents(price),
      priceAnnual: formatMoneyFromCents(annualPriceCents(price)),
      acquire: Boolean(s.acquire_enabled),
      trialEnds: formatDateShort(s.trial_ends_at),
      periodEnd: formatDateShort(s.current_period_end),
      importWindowEnds: formatDateShort(s.bulk_import_window_ends_at),
      activationFeePaid: Boolean(s.activation_fee_paid_at),
    };
  });

  return (
    <BillingClient
      summary={summary}
      stores={tableRows}
      isPlatformStaff={isPlatformStaff(profile.role)}
    />
  );
}
