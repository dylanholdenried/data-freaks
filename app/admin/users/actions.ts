"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { requireAdminContext } from "@/app/admin/admin-data";
import { sendInviteEmail, sendPasswordResetEmail } from "@/lib/email/resend";
import {
  isAutoGroupUserRole,
  isOwnerAdmin,
  isPlatformStaff,
} from "@/lib/roles";
import { generatePasswordSetupLink } from "@/lib/auth/password-setup-link";

type AppRole = "group_admin" | "store_admin";
type UserStatus = "invited" | "active" | "disabled";
type PlatformTargetRole = "platform_admin" | "owner_admin";

function revalidateUserPaths(profileId: string, dealerGroupId?: string | null) {
  revalidatePath("/admin/users");
  revalidatePath(`/admin/users/${profileId}`);
  revalidatePath("/admin/groups");
  if (dealerGroupId) {
    revalidatePath(`/admin/groups/${dealerGroupId}`);
  }
}

type TargetProfile = {
  id: string;
  user_id: string | null;
  email: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  role: string;
  status: string;
  dealer_group_id: string | null;
};

async function loadTarget(
  service: ReturnType<typeof createSupabaseServiceClient>,
  id: string
): Promise<TargetProfile | null> {
  const { data } = await service
    .from("profiles")
    .select("id, user_id, email, first_name, last_name, phone, role, status, dealer_group_id")
    .eq("id", id)
    .maybeSingle();
  return data as TargetProfile | null;
}

/**
 * Can the actor mutate this target profile?
 * - Auto-group users: any platform staff
 * - platform_admin: only owner_admin (not self-demote handled separately)
 * - owner_admin: never editable by anyone (including self demote via this UI)
 */
function canEditTarget(actorRole: string, target: TargetProfile, actorProfileId: string): {
  ok: boolean;
  error?: string;
} {
  if (isOwnerAdmin(target.role)) {
    return { ok: false, error: "Owner accounts cannot be edited here" };
  }
  if (target.role === "platform_admin") {
    if (!isOwnerAdmin(actorRole)) {
      return { ok: false, error: "Only the owner can edit platform admins" };
    }
    return { ok: true };
  }
  if (isAutoGroupUserRole(target.role)) {
    return { ok: true };
  }
  if (target.id === actorProfileId) {
    return { ok: false, error: "Cannot edit your own elevated account this way" };
  }
  return { ok: false, error: "Cannot edit this user" };
}

async function syncUserStoreAccess(
  service: ReturnType<typeof createSupabaseServiceClient>,
  userId: string,
  dealerGroupId: string,
  role: AppRole,
  storeIds: string[]
) {
  const { error: deleteError } = await service
    .from("user_store_access")
    .delete()
    .eq("user_id", userId);

  if (deleteError) {
    throw new Error(`Clear store access failed: ${deleteError.message}`);
  }

  if (role !== "store_admin") {
    return;
  }

  const uniqueIds = Array.from(new Set(storeIds));
  if (uniqueIds.length === 0) return;

  const { data: validStores, error: storesError } = await service
    .from("stores")
    .select("id")
    .eq("dealer_group_id", dealerGroupId)
    .in("id", uniqueIds);

  if (storesError) {
    throw new Error(`Validate stores failed: ${storesError.message}`);
  }

  const validIds = (validStores ?? []).map((s) => s.id as string);
  if (validIds.length !== uniqueIds.length) {
    throw new Error("One or more selected stores are not in this auto group");
  }

  const rows = validIds.map((store_id) => ({
    user_id: userId,
    store_id,
  }));

  const { error: insertError } = await service.from("user_store_access").insert(rows);
  if (insertError) {
    throw new Error(`Assign store access failed: ${insertError.message}`);
  }
}

export async function updateAdminUser(formData: FormData) {
  const { profileId: actorId, role: actorRole, isOwner } = await requireAdminContext();
  const service = createSupabaseServiceClient();

  const id = String(formData.get("id") || "").trim();
  const user_id = String(formData.get("user_id") || "").trim();
  if (!id || !user_id) {
    return { saved: false as const, error: "User id is required" };
  }

  const target = await loadTarget(service, id);
  if (!target) {
    return { saved: false as const, error: "User not found" };
  }

  const gate = canEditTarget(actorRole, target, actorId);
  if (!gate.ok) {
    return { saved: false as const, error: gate.error || "Not allowed" };
  }

  const email = String(formData.get("email") || "").trim().toLowerCase();
  const first_name = String(formData.get("first_name") || "").trim() || null;
  const last_name = String(formData.get("last_name") || "").trim() || null;
  const phone = String(formData.get("phone") || "").trim() || null;
  const status = String(formData.get("status") || target.status) as UserStatus;

  if (!email) {
    return { saved: false as const, error: "Email is required" };
  }
  if (!["invited", "active", "disabled"].includes(status)) {
    return { saved: false as const, error: "Invalid status" };
  }

  // Platform admin targets (owner-only): limited fields — no auto group / store role changes here
  if (target.role === "platform_admin") {
    if (!isOwner) {
      return { saved: false as const, error: "Only the owner can edit platform admins" };
    }
    const nextRole = String(formData.get("role") || "platform_admin") as PlatformTargetRole;
    if (nextRole !== "platform_admin") {
      return { saved: false as const, error: "Cannot change platform admin role from this form" };
    }

    const { error: authError } = await service.auth.admin.updateUserById(user_id, {
      email,
      user_metadata: { first_name, last_name, phone },
    });
    if (authError) {
      return { saved: false as const, error: `Update auth user failed: ${authError.message}` };
    }

    const { error: profileError } = await service
      .from("profiles")
      .update({ email, first_name, last_name, phone, status })
      .eq("id", id);

    if (profileError) {
      return { saved: false as const, error: `Update profile failed: ${profileError.message}` };
    }

    revalidateUserPaths(id, target.dealer_group_id);
    return { saved: true as const, message: "Changes Saved Successfully" };
  }

  const dealer_group_id = String(formData.get("dealer_group_id") || "").trim();
  const role = String(formData.get("role") || "store_admin") as AppRole;
  const storeIds = formData
    .getAll("store_ids")
    .map((v) => String(v).trim())
    .filter(Boolean);

  if (!dealer_group_id) {
    return { saved: false as const, error: "Auto group is required" };
  }
  if (role !== "group_admin" && role !== "store_admin") {
    return { saved: false as const, error: "Invalid role" };
  }
  if (role === "store_admin" && storeIds.length === 0) {
    return { saved: false as const, error: "Select at least one store for a store admin" };
  }

  const { data: targetGroup } = await service
    .from("dealer_groups")
    .select("id")
    .eq("id", dealer_group_id)
    .maybeSingle();
  if (!targetGroup) {
    return { saved: false as const, error: "Destination auto group not found" };
  }

  const previousGroupId = target.dealer_group_id;

  const { error: authError } = await service.auth.admin.updateUserById(user_id, {
    email,
    user_metadata: { first_name, last_name, phone },
  });
  if (authError) {
    return { saved: false as const, error: `Update auth user failed: ${authError.message}` };
  }

  const { error: profileError } = await service
    .from("profiles")
    .update({
      email,
      first_name,
      last_name,
      phone,
      role,
      status,
      dealer_group_id,
    })
    .eq("id", id);

  if (profileError) {
    return { saved: false as const, error: `Update profile failed: ${profileError.message}` };
  }

  await syncUserStoreAccess(service, user_id, dealer_group_id, role, storeIds);

  revalidateUserPaths(id, dealer_group_id);
  if (previousGroupId && previousGroupId !== dealer_group_id) {
    revalidatePath(`/admin/groups/${previousGroupId}`);
  }

  return { saved: true as const, message: "Changes Saved Successfully" };
}

export async function disableAdminUser(formData: FormData) {
  const { profileId: actorId, role: actorRole } = await requireAdminContext();
  const service = createSupabaseServiceClient();

  const id = String(formData.get("id") || "").trim();
  if (!id) {
    return { saved: false as const, error: "User id is required" };
  }

  const target = await loadTarget(service, id);
  if (!target) {
    return { saved: false as const, error: "User not found" };
  }

  if (target.id === actorId) {
    return { saved: false as const, error: "You cannot disable your own account" };
  }

  const gate = canEditTarget(actorRole, target, actorId);
  if (!gate.ok) {
    return { saved: false as const, error: gate.error || "Not allowed" };
  }

  const { error } = await service.from("profiles").update({ status: "disabled" }).eq("id", id);
  if (error) {
    return { saved: false as const, error: `Disable user failed: ${error.message}` };
  }

  revalidateUserPaths(id, target.dealer_group_id);
  return { saved: true as const, message: "User disabled" };
}

export async function resendAdminUserInvite(formData: FormData) {
  const { profileId: actorId, role: actorRole } = await requireAdminContext();
  const service = createSupabaseServiceClient();

  const id = String(formData.get("id") || "").trim();
  if (!id) {
    return { saved: false as const, error: "User id is required" };
  }

  const target = await loadTarget(service, id);
  if (!target) {
    return { saved: false as const, error: "User not found" };
  }

  // Platform staff may resend invites for auto-group users; owner may also for platform_admins
  if (isPlatformStaff(target.role)) {
    if (isOwnerAdmin(target.role)) {
      return { saved: false as const, error: "Cannot resend invite for the owner account" };
    }
    if (!isOwnerAdmin(actorRole)) {
      return { saved: false as const, error: "Only the owner can manage platform admin invites" };
    }
  } else if (!isAutoGroupUserRole(target.role)) {
    return { saved: false as const, error: "Cannot resend invite for this user" };
  } else {
    const gate = canEditTarget(actorRole, target, actorId);
    if (!gate.ok) {
      return { saved: false as const, error: gate.error || "Not allowed" };
    }
  }

  let groupName = "DealerACQ";
  if (target.dealer_group_id) {
    const { data: groupRow } = await service
      .from("dealer_groups")
      .select("name")
      .eq("id", target.dealer_group_id)
      .maybeSingle();
    if (groupRow?.name) groupName = groupRow.name;
  } else if (isPlatformStaff(target.role)) {
    groupName = "DealerACQ Platform";
  }

  const linkResult = await generatePasswordSetupLink(service, target.email);
  if (!linkResult.ok) {
    return { saved: false as const, error: `Invite failed: ${linkResult.error}` };
  }

  const emailResult = await sendInviteEmail({
    to: target.email,
    firstName: target.first_name || "there",
    groupName,
    actionLink: linkResult.actionLink,
  });
  if (!emailResult.ok) {
    return { saved: false as const, error: `Invite email failed: ${emailResult.error}` };
  }

  // Keep them in invited until they complete set-password (unless already active)
  if (target.status === "disabled") {
    await service.from("profiles").update({ status: "invited" }).eq("id", id);
  }

  revalidateUserPaths(id, target.dealer_group_id);
  return { saved: true as const, message: "Invite email sent" };
}

export async function resetAdminUserPassword(formData: FormData) {
  const { profileId: actorId, role: actorRole } = await requireAdminContext();
  const service = createSupabaseServiceClient();

  const id = String(formData.get("id") || "").trim();
  if (!id) {
    return { saved: false as const, error: "User id is required" };
  }

  const target = await loadTarget(service, id);
  if (!target) {
    return { saved: false as const, error: "User not found" };
  }

  if (isOwnerAdmin(target.role) && target.id !== actorId) {
    return { saved: false as const, error: "Cannot reset password for the owner account" };
  }
  if (target.role === "platform_admin" && !isOwnerAdmin(actorRole)) {
    return { saved: false as const, error: "Only the owner can reset platform admin passwords" };
  }
  if (isAutoGroupUserRole(target.role)) {
    const gate = canEditTarget(actorRole, target, actorId);
    if (!gate.ok) {
      return { saved: false as const, error: gate.error || "Not allowed" };
    }
  }

  const linkResult = await generatePasswordSetupLink(service, target.email);
  if (!linkResult.ok) {
    return { saved: false as const, error: `Password reset failed: ${linkResult.error}` };
  }

  const emailResult = await sendPasswordResetEmail({
    to: target.email,
    firstName: target.first_name || "there",
    actionLink: linkResult.actionLink,
  });
  if (!emailResult.ok) {
    return { saved: false as const, error: `Password reset email failed: ${emailResult.error}` };
  }

  return { saved: true as const, message: "Password reset email sent" };
}

/** Create an auto-group user from the global Users page (same as createUserInGroup). */
export async function createAutoGroupUserFromUsersPage(formData: FormData) {
  // Ensure invited by default when status omitted
  if (!formData.get("status")) {
    formData.set("status", "invited");
  }
  const { createUserInGroup } = await import("@/app/admin/actions");
  const result = await createUserInGroup(formData);
  if (result && "saved" in result && result.saved) {
    revalidatePath("/admin/users");
  }
  return result;
}
