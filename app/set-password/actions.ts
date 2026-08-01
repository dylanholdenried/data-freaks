"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { profileMatchAuthUserId } from "@/lib/supabase/profile-match";

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

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

/**
 * Set password for the currently authenticated session user only.
 * Confirmed email must match session.user.email (blocks leftover sessions).
 */
export async function setPasswordForSessionUser(input: {
  confirmedEmail: string;
  password: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const confirmedEmail = normalizeEmail(input.confirmedEmail || "");
  const password = String(input.password || "");

  if (!confirmedEmail) {
    return { ok: false, error: "Email confirmation is required." };
  }
  if (password.length < 8) {
    return { ok: false, error: "Password must be at least 8 characters." };
  }

  const supabase = createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user?.email) {
    return {
      ok: false,
      error: "This link has expired or is invalid. Ask your admin to send a new invite.",
    };
  }

  if (normalizeEmail(user.email) !== confirmedEmail) {
    return {
      ok: false,
      error:
        "Email does not match the account for this invite link. Check the address shown above and try again.",
    };
  }

  const { error: updateError } = await supabase.auth.updateUser({ password });
  if (updateError) {
    return { ok: false, error: updateError.message };
  }

  const activate = await activateProfileAfterPassword();
  if (!activate.ok) {
    return activate;
  }

  return { ok: true };
}
