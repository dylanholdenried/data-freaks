import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { Shield } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { profileMatchAuthUserId } from "@/lib/supabase/profile-match";
import { Button } from "@/components/ui/button";
import { signOut } from "@/app/app/actions";
import AdminMobileMenu from "./AdminMobileMenu";
import AdminSidebarNav from "./AdminSidebarNav";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const supabase = createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("first_name, last_name, role, status")
    .or(profileMatchAuthUserId(session.user.id))
    .maybeSingle();

  if (!profile || profile.status !== "active" || profile.role !== "platform_admin") {
    redirect("/app");
  }

  return (
    <div className="app-canvas flex min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[248px] overflow-y-auto bg-gradient-to-b from-[#071735] via-[#05142e] to-[#031127] text-white lg:flex lg:flex-col">
        <div className="border-b border-white/10 px-5 py-5">
          <div className="mb-1 flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-500 font-semibold text-white">
              DF
            </div>
            <div className="text-sm font-semibold tracking-tight">Data Freaks</div>
          </div>
          <p className="text-[10px] uppercase tracking-[0.2em] text-blue-200/70">Platform Admin</p>
        </div>
        <AdminSidebarNav />
        <div className="mt-auto space-y-3 p-3">
          <div className="rounded-xl bg-white/10 px-3 py-2 text-[11px] text-blue-100">
            <div className="font-medium">
              {profile.first_name} {profile.last_name}
            </div>
            <div className="text-blue-100/70">{profile.role}</div>
          </div>
        </div>
      </aside>
      <div className="flex min-h-screen min-w-0 flex-1 flex-col lg:pl-[248px]">
        <header className="border-b border-[#e7ebf3] bg-white">
          <div className="flex min-h-14 flex-wrap items-center justify-between gap-2 px-5 py-2 lg:h-14 lg:px-8 lg:py-0">
            <div className="flex min-w-0 flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 shrink-0 text-blue-600" />
                <p className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">
                  Platform Admin
                </p>
              </div>
              <AdminMobileMenu />
            </div>
            <div className="flex items-center gap-3 text-xs text-slate-500">
              <span className="hidden sm:inline">
                {profile.first_name} {profile.last_name} · {profile.role}
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
  );
}
