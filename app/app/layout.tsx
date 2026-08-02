import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { profileMatchAuthUserId } from "@/lib/supabase/profile-match";
import {
  getEffectiveDealerGroupId,
  listDealerGroupsForAdmin,
} from "@/lib/dealer-group-context";
import { formatProfileName, formatRoleLabel } from "@/lib/profile-display";
import { isPlatformStaff } from "@/lib/roles";
import { Button } from "@/components/ui/button";
import { BarChart3, Shield } from "lucide-react";
import { DaAppThemeProvider } from "@/components/theme/theme-context";
import ThemeToggle from "@/components/theme/ThemeToggle";
import DealerAcqLogo from "@/components/brand/DealerAcqLogo";
import { signOut } from "./actions";
import AppMobileMenu from "./AppMobileMenu";
import AppSidebarNav from "./AppSidebarNav";
import AutoGroupSwitcher from "./AutoGroupSwitcher";
import WelcomeOnboardingModal from "./WelcomeOnboardingModal";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const supabase = createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("first_name,last_name,role,status,dealer_group_id,onboarding_welcome_seen_at")
    .or(profileMatchAuthUserId(session.user.id))
    .maybeSingle();

  if (!profile || profile.status !== "active") {
    redirect("/awaiting-approval");
  }

  const isPlatformAdmin = isPlatformStaff(profile.role);
  const groups = isPlatformAdmin ? await listDealerGroupsForAdmin() : [];
  const selectedGroupId = isPlatformAdmin
    ? await getEffectiveDealerGroupId(profile)
    : profile.dealer_group_id;
  const selectedGroupName = groups.find((g) => g.id === selectedGroupId)?.name;
  const showWelcome = profile.role === "group_admin" && !profile.onboarding_welcome_seen_at;
  const displayName = formatProfileName(profile.first_name, profile.last_name);
  const roleLabel = formatRoleLabel(profile.role);

  let groupPlan: string | null = null;
  if (selectedGroupId) {
    const { data: groupRow } = await supabase
      .from("dealer_groups")
      .select("plan")
      .eq("id", selectedGroupId)
      .maybeSingle();
    groupPlan = groupRow?.plan ?? null;
  }

  return (
    <DaAppThemeProvider>
      <div className="app-canvas flex min-h-screen">
        <aside className="fixed inset-y-0 left-0 z-30 hidden w-[248px] overflow-y-auto border-r border-[var(--da-line)] bg-[var(--da-panel)] text-[var(--da-text)] lg:flex lg:flex-col">
          <div className="border-b border-[var(--da-line)] px-5 py-5">
            <div className="mb-1">
              <DealerAcqLogo href="/app" desktopVariant="lockup" />
            </div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--da-muted)]">
              {selectedGroupName ? `Store Analytics · ${selectedGroupName}` : "Store Analytics"}
            </p>
          </div>
          {isPlatformAdmin ? (
            <div className="border-b border-[var(--da-line)] py-3">
              <AutoGroupSwitcher groups={groups} selectedGroupId={selectedGroupId} />
            </div>
          ) : null}
          <AppSidebarNav plan={groupPlan} />
          <div className="mt-auto space-y-3 p-3">
            {isPlatformAdmin ? (
              <Link
                href="/admin"
                prefetch
                className="flex items-center justify-center gap-2 rounded-xl border border-[var(--da-line)] bg-[var(--da-panel-2)] px-4 py-2 text-xs font-semibold text-[var(--da-text)] transition-colors hover:bg-[var(--da-line)]"
              >
                <Shield className="h-3.5 w-3.5" />
                Platform Admin
              </Link>
            ) : null}
            <ThemeToggle variant="sidebar" />
            <Link
              href="/app/deals/new"
              prefetch
              className="flex items-center justify-center rounded-xl bg-[var(--da-blue)] px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-black/25"
            >
              + New Deal
            </Link>
            <div className="rounded-xl bg-[var(--da-panel-2)] px-3 py-2 text-[11px] text-[var(--da-muted)]">
              <div className="font-medium text-[var(--da-text)]">{displayName}</div>
              <div>{roleLabel}</div>
            </div>
          </div>
        </aside>
        <div className="flex min-h-screen min-w-0 flex-1 flex-col lg:pl-[248px]">
          <header className="border-b border-[var(--da-line)] bg-[var(--da-panel)]">
            <div className="flex min-h-14 flex-wrap items-center justify-between gap-2 px-5 py-2 lg:h-14 lg:px-8 lg:py-0">
              <div className="flex min-w-0 flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 shrink-0 text-[var(--da-blue)]" />
                  <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[var(--da-muted)]">
                    Dealer Command
                  </p>
                </div>
                <AppMobileMenu
                  isPlatformAdmin={isPlatformAdmin}
                  groups={groups}
                  selectedGroupId={selectedGroupId}
                  plan={groupPlan}
                />
              </div>
              <div className="flex items-center gap-3 text-xs text-[var(--da-muted)]">
                <span className="hidden sm:inline">
                  {displayName} · {roleLabel}
                </span>
                <form action={signOut}>
                  <Button type="submit" variant="outline" size="sm">
                    Sign out
                  </Button>
                </form>
              </div>
            </div>
          </header>
          <div className="min-w-0 w-full flex-1 px-5 py-6 lg:px-8">{children}</div>
        </div>
        <WelcomeOnboardingModal firstName={profile.first_name} show={Boolean(showWelcome)} />
      </div>
    </DaAppThemeProvider>
  );
}
