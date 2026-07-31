import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { profileMatchAuthUserId } from "@/lib/supabase/profile-match";
import type { SupabaseClient } from "@supabase/supabase-js";

export type AdminContext = {
  supabase: SupabaseClient;
  profileId: string;
};

/** Confirm the current session is an active platform admin, then return a service client for admin reads/writes. */
export async function requireAdminServiceClient(): Promise<SupabaseClient> {
  const { supabase } = await requireAdminContext();
  return supabase;
}

/**
 * Same gate as requireAdminServiceClient, plus the admin's profile id (for audit fields).
 * Uses getUser() (validated JWT) + service-role profile read so RLS cannot false-negative
 * platform admins out of /admin after a mutation.
 */
export async function requireAdminContext(): Promise<AdminContext> {
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
    .select("id, role, status")
    .or(profileMatchAuthUserId(user.id))
    .maybeSingle();

  if (!profile || profile.status !== "active" || profile.role !== "platform_admin") {
    redirect("/app");
  }

  return {
    supabase: service,
    profileId: profile.id,
  };
}
