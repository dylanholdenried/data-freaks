import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { profileMatchAuthUserId } from "@/lib/supabase/profile-match";

/** Confirm the current session is an active platform admin, then return a service client for admin reads/writes. */
export async function requireAdminServiceClient() {
  const supabase = createSupabaseServerClient();
  const {
    data: { session },
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

  return createSupabaseServiceClient();
}
