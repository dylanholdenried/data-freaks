import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { profileMatchAuthUserId } from "@/lib/supabase/profile-match";
import { Button } from "@/components/ui/button";
import { BarChart3, CalendarRange, LayoutDashboard, Menu, Settings2 } from "lucide-react";
import { signOut } from "./actions";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const supabase = createSupabaseServerClient();
  const {
    data: { session }
  } = await supabase.auth.getSession();

  if (!session) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("first_name,last_name,role,status")
    .or(profileMatchAuthUserId(session.user.id))
    .maybeSingle();

  if (!profile || profile.status !== "active") {
    redirect("/awaiting-approval");
  }

  const navLink =
    "flex items-center gap-2 rounded-lg px-3 py-2 text-slate-300 hover:bg-white/10 hover:text-white";

  return (
    <div className="app-canvas flex min-h-screen">
      <aside className="hidden w-[248px] bg-gradient-to-b from-[#071735] via-[#05142e] to-[#031127] text-white lg:flex lg:flex-col">
        <div className="border-b border-white/10 px-5 py-5">
          <div className="mb-1 flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-500 font-semibold text-white">
              DF
            </div>
            <div className="text-sm font-semibold tracking-tight">Data Freaks</div>
          </div>
          <p className="text-[10px] uppercase tracking-[0.2em] text-blue-200/70">Store Analytics</p>
        </div>
        <nav className="space-y-2 px-3 py-4 text-xs">
          <Link
            href="/app/deals"
            prefetch
            className={`${navLink} bg-blue-500/25 font-medium text-white`}
          >
            <LayoutDashboard className="h-3.5 w-3.5" />
            Sales Registry
          </Link>
          <Link href="/app/setup" prefetch className={navLink}>
            <Settings2 className="h-3.5 w-3.5" />
            Setup & Config
          </Link>
          <Link href="/app/calendar" prefetch className={navLink}>
            <CalendarRange className="h-3.5 w-3.5" />
            Pace Calendar
          </Link>
        </nav>
        <div className="mt-auto space-y-3 p-3">
          <Link
            href="/app/deals/new"
            prefetch
            className="flex items-center justify-center rounded-xl bg-blue-500 px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-blue-900/25"
          >
            + Log Transaction
          </Link>
          <div className="rounded-xl bg-white/10 px-3 py-2 text-[11px] text-blue-100">
            <div className="font-medium">
              {profile.first_name} {profile.last_name}
            </div>
            <div className="text-blue-100/70">{profile.role}</div>
          </div>
        </div>
      </aside>
      <div className="flex min-h-screen flex-1 flex-col">
        <header className="border-b border-[#e7ebf3] bg-white">
          <div className="flex min-h-14 flex-wrap items-center justify-between gap-2 px-5 py-2 lg:h-14 lg:px-8 lg:py-0">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-blue-600" />
                <p className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">Dealer Command</p>
              </div>
              <details className="relative lg:hidden">
                <summary className="flex cursor-pointer list-none items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 shadow-sm [&::-webkit-details-marker]:hidden">
                  <Menu className="h-3.5 w-3.5" />
                  Menu
                </summary>
                <nav className="absolute left-0 z-50 mt-1 w-56 rounded-lg border border-slate-200 bg-white py-1 text-sm shadow-lg">
                  <Link
                    href="/app/deals"
                    className="block px-3 py-2 text-slate-700 hover:bg-slate-50"
                    prefetch
                  >
                    Sales Registry
                  </Link>
                  <Link href="/app/deals/new" className="block px-3 py-2 text-slate-700 hover:bg-slate-50" prefetch>
                    Log Transaction
                  </Link>
                  <Link href="/app/setup" className="block px-3 py-2 text-slate-700 hover:bg-slate-50" prefetch>
                    Setup & Config
                  </Link>
                  <Link href="/app/calendar" className="block px-3 py-2 text-slate-700 hover:bg-slate-50" prefetch>
                    Pace Calendar
                  </Link>
                </nav>
              </details>
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
        <div className="flex-1 px-5 py-6 lg:px-8">{children}</div>
      </div>
    </div>
  );
}
