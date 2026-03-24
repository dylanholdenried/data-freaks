import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { profileMatchAuthUserId } from "@/lib/supabase/profile-match";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const supabase = createSupabaseServerClient();
  const {
    data: { session }
  } = await supabase.auth.getSession();

  if (!session) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, status")
    .or(profileMatchAuthUserId(session.user.id))
    .maybeSingle();

  if (!profile || profile.status !== "active" || profile.role !== "platform_admin") {
    redirect("/app");
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-slate-50">
      <div className="border-b border-border bg-white">
        <div className="container flex h-14 items-center justify-between">
          <div className="text-sm font-semibold">Data Freaks · Platform Admin</div>
          <nav className="flex items-center gap-4 text-xs">
            <a href="/admin/requests" className="text-muted-foreground hover:text-foreground">
              Requests
            </a>
            <a href="/admin/groups" className="text-muted-foreground hover:text-foreground">
              Groups
            </a>
            <a href="/admin/users" className="text-muted-foreground hover:text-foreground">
              Users
            </a>
          </nav>
        </div>
      </div>
      <main className="container py-6">{children}</main>
    </div>
  );
}

