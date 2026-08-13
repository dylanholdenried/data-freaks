import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { profileMatchAuthUserId } from "@/lib/supabase/profile-match";
import { isOwnerAdmin } from "@/lib/roles";
import type { SupabaseClient, User } from "@supabase/supabase-js";

export const MFA_PATH = "/mfa";

export async function getAuthenticatorLevel(supabase: SupabaseClient) {
  const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error) {
    console.error("mfa.getAuthenticatorAssuranceLevel", error);
    return { currentLevel: null as string | null, nextLevel: null as string | null };
  }
  return {
    currentLevel: data.currentLevel ?? null,
    nextLevel: data.nextLevel ?? null,
  };
}

export async function ownerAdminNeedsMfa(
  supabase: SupabaseClient,
  role: string | null | undefined
): Promise<boolean> {
  if (!isOwnerAdmin(role)) return false;
  const { currentLevel } = await getAuthenticatorLevel(supabase);
  return currentLevel !== "aal2";
}

/**
 * Redirect owner_admin to /mfa until the session is AAL2 (password + TOTP).
 * Other roles are unchanged. Call after getUser() in layouts / admin gates.
 */
export async function redirectOwnerAdminIfMfaRequired(
  supabase: SupabaseClient,
  role: string | null | undefined
) {
  if (await ownerAdminNeedsMfa(supabase, role)) {
    redirect(MFA_PATH);
  }
}

export async function loadActiveProfileRole(
  supabase: SupabaseClient,
  userId: string
): Promise<string | null> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, status")
    .or(profileMatchAuthUserId(userId))
    .maybeSingle();

  if (!profile || profile.status !== "active") return null;
  return profile.role ?? null;
}

/** For /mfa: signed-in owner_admin who still needs enrollment or TOTP. */
export async function requireOwnerAdminMfaPage(): Promise<{
  supabase: SupabaseClient;
  user: User;
  role: string;
}> {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const role = await loadActiveProfileRole(supabase, user.id);
  if (!isOwnerAdmin(role)) {
    redirect("/app");
  }

  if (!(await ownerAdminNeedsMfa(supabase, role))) {
    redirect("/app");
  }

  return { supabase, user, role: role! };
}
