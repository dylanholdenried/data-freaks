"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { profileMatchAuthUserId } from "@/lib/supabase/profile-match";

/**
 * After an invite/recovery user sets their password, flip invited → active
 * so /app layout allows them in. Only transitions invited → active for the
 * authenticated user (service role so RLS cannot block).
 */
export async function activateProfileAfterPassword(): Promise<
  { ok: true } | { ok: false; error: string }
> {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return { ok: false, error: "Not signed in" };
  }

  const service = createSupabaseServiceClient();
  const { data: profile, error: profileError } = await service
    .from("profiles")
    .select("id, status")
    .or(profileMatchAuthUserId(user.id))
    .maybeSingle();

  if (profileError) {
    return { ok: false, error: profileError.message };
  }
  if (!profile) {
    return { ok: false, error: "Profile not found" };
  }

  if (profile.status === "active") {
    return { ok: true };
  }

  if (profile.status !== "invited") {
    return {
      ok: false,
      error:
        profile.status === "disabled"
          ? "This account is disabled. Contact your admin."
          : "Account is not ready to activate",
    };
  }

  const { error: updateError } = await service
    .from("profiles")
    .update({ status: "active" })
    .eq("id", profile.id)
    .eq("status", "invited");

  if (updateError) {
    return { ok: false, error: updateError.message };
  }

  return { ok: true };
}
