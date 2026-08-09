"use server";

import { redirect } from "next/navigation";
import { requireAdminContext } from "@/app/admin/admin-data";
import {
  buildImpersonationPayload,
  canImpersonateTarget,
  clearImpersonationCookie,
  getImpersonationState,
  setImpersonationCookie,
} from "@/lib/impersonation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

async function swapSessionViaMagicLink(email: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const service = createSupabaseServiceClient();
  const { data, error } = await service.auth.admin.generateLink({
    type: "magiclink",
    email: email.trim().toLowerCase(),
  });

  const hashedToken = data?.properties?.hashed_token;
  if (error || !hashedToken) {
    return { ok: false, error: error?.message || "Could not generate session link" };
  }

  const supabase = createSupabaseServerClient();
  const { error: verifyError } = await supabase.auth.verifyOtp({
    token_hash: hashedToken,
    type: "magiclink",
  });

  if (verifyError) {
    return { ok: false, error: verifyError.message || "Could not establish session" };
  }

  return { ok: true };
}

async function writeImpersonationAudit(input: {
  eventType: "impersonation_started" | "impersonation_ended";
  actorUserId: string;
  actorProfileId: string;
  targetProfileId: string;
  dealerGroupId: string | null;
  metadata?: Record<string, unknown>;
}) {
  const service = createSupabaseServiceClient();
  const { error } = await service.from("audit_logs").insert({
    actor_user_id: input.actorUserId,
    actor_profile_id: input.actorProfileId,
    dealer_group_id: input.dealerGroupId,
    store_id: null,
    entity_type: "profile",
    entity_id: input.targetProfileId,
    event_type: input.eventType,
    old_values: null,
    new_values: null,
    metadata: input.metadata ?? null,
  });
  if (error) {
    console.error("audit_logs impersonation write failed", error);
  }
}

/**
 * Owner-admin only: start a read-only session as the target auto-group user.
 */
export async function startImpersonationAction(targetProfileId: string) {
  const { profileId: actorProfileId, isOwner, supabase: service } = await requireAdminContext();

  if (!isOwner) {
    throw new Error("Only the owner can view the app as another user.");
  }

  if (await getImpersonationState()) {
    throw new Error("Already viewing as another user. Exit first.");
  }

  const id = String(targetProfileId || "").trim();
  if (!id) throw new Error("Missing user id");

  const {
    data: { user: actorUser },
  } = await createSupabaseServerClient().auth.getUser();
  if (!actorUser?.email) {
    throw new Error("Could not resolve your account email.");
  }

  const { data: actorProfile } = await service
    .from("profiles")
    .select("id, email")
    .eq("id", actorProfileId)
    .maybeSingle();

  const { data: target } = await service
    .from("profiles")
    .select("id, user_id, email, role, status, dealer_group_id, first_name, last_name")
    .eq("id", id)
    .maybeSingle();

  if (!target) {
    throw new Error("User not found.");
  }

  const allowed = canImpersonateTarget({ actorProfileId, target });
  if (!allowed.ok) {
    throw new Error(allowed.error);
  }

  const actorEmail = (actorProfile?.email || actorUser.email).trim().toLowerCase();
  const targetEmail = String(target.email).trim().toLowerCase();

  const payload = buildImpersonationPayload({
    actorEmail,
    actorProfileId,
    actorUserId: actorUser.id,
    targetProfileId: target.id,
    targetEmail,
  });

  // Set restore cookie before swapping session so a failed swap can still be cleared.
  await setImpersonationCookie(payload);

  const swapped = await swapSessionViaMagicLink(targetEmail);
  if (!swapped.ok) {
    await clearImpersonationCookie();
    throw new Error(swapped.error);
  }

  await writeImpersonationAudit({
    eventType: "impersonation_started",
    actorUserId: actorUser.id,
    actorProfileId,
    targetProfileId: target.id,
    dealerGroupId: target.dealer_group_id ?? null,
    metadata: {
      target_email: targetEmail,
      target_role: target.role,
      target_user_id: target.user_id,
      read_only: true,
    },
  });

  redirect("/app");
}

/**
 * Restore the owner-admin session from the signed impersonation cookie.
 */
export async function endImpersonationAction() {
  const state = await getImpersonationState();
  if (!state) {
    redirect("/login?error=impersonation_expired");
  }

  const targetProfileId = state.targetProfileId;
  const actorUserId = state.actorUserId;
  const actorProfileId = state.actorProfileId;

  const service = createSupabaseServiceClient();
  const { data: target } = await service
    .from("profiles")
    .select("dealer_group_id")
    .eq("id", targetProfileId)
    .maybeSingle();

  const restored = await swapSessionViaMagicLink(state.actorEmail);
  if (!restored.ok) {
    // Leave cookie so a retry is possible; fail closed to login.
    redirect(`/login?error=impersonation_restore_failed`);
  }

  await clearImpersonationCookie();

  await writeImpersonationAudit({
    eventType: "impersonation_ended",
    actorUserId,
    actorProfileId,
    targetProfileId,
    dealerGroupId: target?.dealer_group_id ?? null,
    metadata: {
      target_email: state.targetEmail,
      read_only: true,
    },
  });

  redirect(`/admin/users/${targetProfileId}`);
}

/** Form-friendly wrapper for start (hidden id field). */
export async function startImpersonationFormAction(formData: FormData) {
  const id = String(formData.get("id") || "").trim();
  await startImpersonationAction(id);
}

/** Used by banner Exit button. */
export async function endImpersonationFormAction() {
  await endImpersonationAction();
}
