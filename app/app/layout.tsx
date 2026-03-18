import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";

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
    .eq("user_id", session.user.id)
    .maybeSingle();

  if (!profile || profile.status !== "active") {
    redirect("/awaiting-approval");
  }

  async function signOut() {
    "use server";
    const supabase = createSupabaseServerClient();
    await supabase.auth.signOut();
    redirect("/");
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-slate-50">
      <div className="border-b border-border bg-white">
        <div className="container flex h-14 items-center justify-between">
          <div className="flex items-center gap-3">
            <a href="/app" className="text-sm font-semibold">
              Data Freaks
            </a>
            <nav className="flex items-center gap-3 text-xs text-muted-foreground">
              <a href="/app/dashboard" className="hover:text-foreground">
                Sales log
              </a>
              <a href="/app/deals" className="hover:text-foreground">
                Deals
              </a>
              <a href="/app/setup" className="hover:text-foreground">
                Setup
              </a>
              <a href="/app/calendar" className="hover:text-foreground">
                Calendar
              </a>
            </nav>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span>
              {profile.first_name} {profile.last_name} · {profile.role}
            </span>
            <form action={signOut}>
              <Button type="submit" variant="outline" size="sm">
                Sign out
              </Button>
            </form>
          </div>
        </div>
      </div>
      <main className="container py-6">{children}</main>
    </div>
  );
}

