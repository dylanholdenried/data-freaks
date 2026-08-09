import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { Shield } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { profileMatchAuthUserId } from "@/lib/supabase/profile-match";
import { formatProfileName, formatRoleLabel } from "@/lib/profile-display";
import { isPlatformStaff } from "@/lib/roles";
import { isImpersonating } from "@/lib/impersonation";
import { Button } from "@/components/ui/button";
import { DaAppThemeProvider } from "@/components/theme/theme-context";
import ThemeToggle from "@/components/theme/ThemeToggle";
import DealerAcqLogo from "@/components/brand/DealerAcqLogo";
import { signOut } from "@/app/app/actions";
import AdminMobileMenu from "./AdminMobileMenu";
import AdminSidebarNav from "./AdminSidebarNav";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  if (await isImpersonating()) {
    redirect("/app");
  }

  const supabase = createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    redirect("/login");
  }

  const service = createSupabaseServiceClient();
  const { data: profile } = await service
    .from("profiles")
    .select("first_name, last_name, role, status")
    .or(profileMatchAuthUserId(user.id))
    .maybeSingle();

  if (!profile || profile.status !== "active" || !isPlatformStaff(profile.role)) {
    redirect("/app");
  }

  const displayName = formatProfileName(profile.first_name, profile.last_name);
  const roleLabel = formatRoleLabel(profile.role);

  return (
    <DaAppThemeProvider>
      <div className="app-canvas flex min-h-screen">
        <aside className="fixed inset-y-0 left-0 z-30 hidden w-[248px] overflow-y-auto border-r border-[var(--da-line)] bg-[var(--da-panel)] text-[var(--da-text)] lg:flex lg:flex-col">
          <div className="border-b border-[var(--da-line)] px-5 py-5">
            <div className="mb-1">
              <DealerAcqLogo href="/admin" desktopVariant="lockup" />
            </div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--da-muted)]">
              Platform Admin
            </p>
          </div>
          <AdminSidebarNav />
          <div className="mt-auto space-y-3 p-3">
            <ThemeToggle variant="sidebar" />
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
                  <Shield className="h-4 w-4 shrink-0 text-[var(--da-blue)]" />
                  <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[var(--da-muted)]">
                    Platform Admin
                  </p>
                </div>
                <AdminMobileMenu />
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
      </div>
    </DaAppThemeProvider>
  );
}
