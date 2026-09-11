"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { requireAdminServiceClient } from "@/app/admin/admin-data";
import { sendInviteEmail, sendPasswordResetEmail } from "@/lib/email/resend";
import { isPlatformStaff, isStoreScopedRole, type AutoGroupUserRole } from "@/lib/roles";
import { generatePasswordSetupLink } from "@/lib/auth/password-setup-link";

type PlanTier = "log" | "analyze";
type AppRole = AutoGroupUserRole;
type UserStatus = "invited" | "requested" | "active" | "disabled";
type BillingInterval = "monthly" | "annual" | "";
type BillingStatus = "none" | "trialing" | "active" | "past_due" | "canceled";

async function syncGroupPlanCache(
  supabase: Awaited<ReturnType<typeof requireAdminServiceClient>>,
  groupId: string
) {
  const { error } = await supabase.rpc("sync_dealer_group_plan_cache", {
    p_group_id: groupId,
  });
  if (error) {
    console.error("sync_dealer_group_plan_cache failed", error);
  }
}

function revalidateGroup(groupId?: string) {
  revalidatePath("/admin/groups");
  revalidatePath("/admin/users");
  revalidatePath("/app/billing");
  if (groupId) {
    revalidatePath(`/admin/groups/${groupId}`);
  }
}

function revalidateUser(userId?: string) {
  revalidatePath("/admin/users");
  if (userId) {
    revalidatePath(`/admin/users/${userId}`);
  }
}

export async function createAutoGroup(formData: FormData) {
  const supabase = await requireAdminServiceClient();

  const name = String(formData.get("name") || "").trim();
  if (!name) {
    throw new Error("Group name is required");
  }

  const plan = String(formData.get("plan") || "log") === "analyze" ? "analyze" : "log";

  const { data, error } = await supabase
    .from("dealer_groups")
    .insert({
      name,
      plan,
      is_demo: false,
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(`Create auto group failed: ${error.message}`);
  }

  revalidateGroup(data.id);
  redirect(`/admin/groups/${data.id}`);
}

export async function updateAutoGroup(formData: FormData) {
  const supabase = await requireAdminServiceClient();

  const id = String(formData.get("id") || "").trim();
  if (!id) throw new Error("Group id is required");

  const name = String(formData.get("name") || "").trim();
  if (!name) throw new Error("Group name is required");

  const applyPlanToStores = String(formData.get("apply_plan_to_stores") || "") === "1";
  const planRaw = String(formData.get("plan") || "log");
  const plan: PlanTier = planRaw === "analyze" ? "analyze" : "log";

  const { error } = await supabase.from("dealer_groups").update({ name }).eq("id", id);

  if (error) {
    throw new Error(`Update auto group failed: ${error.message}`);
  }

  if (applyPlanToStores) {
    const patch: Record<string, unknown> = {
      plan,
      updated_at: new Date().toISOString(),
    };
    if (plan === "analyze") {
      patch.billing_status = "active";
      patch.billing_interval = "monthly";
    } else {
      patch.billing_status = "none";
      patch.billing_interval = null;
      patch.trial_ends_at = null;
      patch.acquire_enabled = false;
    }
    const { error: storeError } = await supabase
      .from("stores")
      .update(patch)
      .eq("dealer_group_id", id);
    if (storeError) {
      throw new Error(`Apply plan to stores failed: ${storeError.message}`);
    }
    await syncGroupPlanCache(supabase, id);
  }

  revalidateGroup(id);
}

export async function updateProfitCenterSettings(formData: FormData) {
  const supabase = await requireAdminServiceClient();

  const dealer_group_id = String(formData.get("dealer_group_id") || "").trim();
  if (!dealer_group_id) throw new Error("Group id is required");

  const min_volume = Math.max(1, parseInt(String(formData.get("min_volume") || "3"), 10) || 3);
  const list_size = Math.max(1, parseInt(String(formData.get("list_size") || "5"), 10) || 5);
  const weight_front = Number(formData.get("weight_front") || 0.35);
  const weight_back = Number(formData.get("weight_back") || 0.25);
  const weight_turn = Number(formData.get("weight_turn") || 0.25);
  const weight_trade = Number(formData.get("weight_trade") || 0.15);

  if (
    ![weight_front, weight_back, weight_turn, weight_trade].every(
      (w) => Number.isFinite(w) && w >= 0
    )
  ) {
    throw new Error("Weights must be non-negative numbers");
  }

  const sum = weight_front + weight_back + weight_turn + weight_trade;
  if (sum <= 0) throw new Error("Weights must sum to more than zero");

  const { error } = await supabase.from("profit_center_settings").upsert(
    {
      dealer_group_id,
      min_volume,
      list_size,
      weight_front,
      weight_back,
      weight_turn,
      weight_trade,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "dealer_group_id" }
  );

  if (error) {
    throw new Error(`Update Profit Center settings failed: ${error.message}`);
  }

  revalidateGroup(dealer_group_id);
  revalidatePath("/app/profit-center");
}

export async function createStoreInGroup(formData: FormData) {
  const supabase = await requireAdminServiceClient();

  const dealer_group_id = String(formData.get("dealer_group_id") || "").trim();
  const name = String(formData.get("name") || "").trim();

  if (!dealer_group_id || !name) {
    throw new Error("Store name and group are required");
  }

  const { error } = await supabase.from("stores").insert({
    dealer_group_id,
    name,
    is_demo: false,
    plan: "log",
    billing_status: "none",
    monthly_price_cents: 250000,
  });

  if (error) {
    throw new Error(`Create store failed: ${error.message}`);
  }

  await syncGroupPlanCache(supabase, dealer_group_id);
  revalidateGroup(dealer_group_id);
}

export async function updateStoreInGroup(formData: FormData) {
  const supabase = await requireAdminServiceClient();

  const id = String(formData.get("id") || "").trim();
  const dealer_group_id = String(formData.get("dealer_group_id") || "").trim();
  const name = String(formData.get("name") || "").trim();

  if (!id || !dealer_group_id || !name) {
    throw new Error("Store id, group, and name are required");
  }

  const planRaw = String(formData.get("plan") || "log");
  const plan: PlanTier = planRaw === "analyze" ? "analyze" : "log";
  const acquire_enabled = String(formData.get("acquire_enabled") || "") === "1";
  const billing_status = String(formData.get("billing_status") || "none") as BillingStatus;
  const intervalRaw = String(formData.get("billing_interval") || "") as BillingInterval;
  const billing_interval =
    intervalRaw === "monthly" || intervalRaw === "annual" ? intervalRaw : null;

  // Prefer dollars field (admin UI). Fall back to cents for older forms.
  const dollarsRaw = String(formData.get("monthly_price_dollars") || "")
    .trim()
    .replace(/[$,\s]/g, "");
  let monthly_price_cents: number;
  if (dollarsRaw !== "") {
    const dollars = Number(dollarsRaw);
    if (!Number.isFinite(dollars) || dollars < 0) {
      throw new Error("Monthly price must be a valid dollar amount (e.g. 2500)");
    }
    monthly_price_cents = Math.round(dollars * 100);
  } else {
    const monthlyRaw = String(formData.get("monthly_price_cents") || "250000");
    monthly_price_cents = Math.max(0, parseInt(monthlyRaw, 10) || 250000);
  }

  const trial_ends_at = String(formData.get("trial_ends_at") || "").trim() || null;
  const current_period_end = String(formData.get("current_period_end") || "").trim() || null;
  const bulk_import_window_ends_at =
    String(formData.get("bulk_import_window_ends_at") || "").trim() || null;
  const markActivationPaid = String(formData.get("activation_fee_paid") || "") === "1";
  const clearActivation = String(formData.get("clear_activation_fee") || "") === "1";

  const patch: Record<string, unknown> = {
    name,
    plan,
    acquire_enabled,
    billing_status:
      billing_status === "trialing" ||
      billing_status === "active" ||
      billing_status === "past_due" ||
      billing_status === "canceled"
        ? billing_status
        : "none",
    billing_interval,
    monthly_price_cents,
    trial_ends_at: trial_ends_at ? new Date(trial_ends_at).toISOString() : null,
    current_period_end: current_period_end
      ? new Date(current_period_end).toISOString()
      : null,
    bulk_import_window_ends_at: bulk_import_window_ends_at
      ? new Date(bulk_import_window_ends_at).toISOString()
      : null,
    updated_at: new Date().toISOString(),
  };

  if (clearActivation) {
    patch.activation_fee_paid_at = null;
  } else if (markActivationPaid) {
    const { data: existing } = await supabase
      .from("stores")
      .select("activation_fee_paid_at")
      .eq("id", id)
      .maybeSingle();
    if (!existing?.activation_fee_paid_at) {
      patch.activation_fee_paid_at = new Date().toISOString();
    }
  }

  const { error } = await supabase
    .from("stores")
    .update(patch)
    .eq("id", id)
    .eq("dealer_group_id", dealer_group_id);

  if (error) {
    throw new Error(`Update store failed: ${error.message}`);
  }

  await syncGroupPlanCache(supabase, dealer_group_id);
  revalidateGroup(dealer_group_id);
  redirect(`/admin/groups/${dealer_group_id}?billingSaved=1`);
}

export async function startStoreTrial90Days(formData: FormData) {
  const supabase = await requireAdminServiceClient();

  const id = String(formData.get("id") || "").trim();
  const dealer_group_id = String(formData.get("dealer_group_id") || "").trim();
  if (!id || !dealer_group_id) throw new Error("Store id and group are required");

  const trialEnd = new Date();
  trialEnd.setUTCDate(trialEnd.getUTCDate() + 90);
  const importEnd = new Date();
  importEnd.setUTCDate(importEnd.getUTCDate() + 90);

  const { error } = await supabase
    .from("stores")
    .update({
      plan: "analyze",
      billing_status: "trialing",
      billing_interval: "monthly",
      trial_ends_at: trialEnd.toISOString(),
      current_period_end: trialEnd.toISOString(),
      bulk_import_window_ends_at: importEnd.toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("dealer_group_id", dealer_group_id);

  if (error) {
    throw new Error(`Start trial failed: ${error.message}`);
  }

  await syncGroupPlanCache(supabase, dealer_group_id);
  revalidateGroup(dealer_group_id);
}

export async function deleteStoreInGroup(formData: FormData) {
  const supabase = await requireAdminServiceClient();

  const id = String(formData.get("id") || "").trim();
  const dealer_group_id = String(formData.get("dealer_group_id") || "").trim();
  if (!id || !dealer_group_id) throw new Error("Store id and group are required");

  const { error } = await supabase
    .from("stores")
    .delete()
    .eq("id", id)
    .eq("dealer_group_id", dealer_group_id);

  if (error) {
    throw new Error(`Delete store failed: ${error.message}`);
  }

  await syncGroupPlanCache(supabase, dealer_group_id);
  revalidateGroup(dealer_group_id);
}

export async function createUserInGroup(formData: FormData) {
  await requireAdminServiceClient();
  const service = createSupabaseServiceClient();

  const dealer_group_id = String(formData.get("dealer_group_id") || "").trim();
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const first_name = String(formData.get("first_name") || "").trim() || null;
  const last_name = String(formData.get("last_name") || "").trim() || null;
  const phone = String(formData.get("phone") || "").trim() || null;
  const role = String(formData.get("role") || "store_admin") as AppRole;
  const status = String(formData.get("status") || "invited") as UserStatus;
  const storeIds = formData
    .getAll("store_ids")
    .map((v) => String(v).trim())
    .filter(Boolean);

  if (!dealer_group_id || !email) {
    throw new Error("Email and group are required");
  }
  if (role !== "group_admin" && role !== "store_admin" && role !== "store_viewer") {
    throw new Error("Invalid role");
  }
  if (isStoreScopedRole(role) && storeIds.length === 0) {
    throw new Error("Select at least one store for this role");
  }

  // One email → one account. If they already exist, move/update into this group.
  const { data: existingProfile } = await service
    .from("profiles")
    .select("id, user_id, dealer_group_id, role, status")
    .eq("email", email)
    .maybeSingle();

  if (isPlatformStaff(existingProfile?.role)) {
    throw new Error("Cannot reassign a platform admin from Auto Groups");
  }

  let userId: string;
  let previousGroupId: string | null = null;
  let createdNewAccount = false;
  // New invites start as invited; do not demote an already-active account when reassigning.
  const effectiveStatus: UserStatus =
    existingProfile?.status === "active" ? "active" : status;

  if (existingProfile) {
    previousGroupId = existingProfile.dealer_group_id;
    userId = existingProfile.user_id || existingProfile.id;

    const { error: authError } = await service.auth.admin.updateUserById(userId, {
      email,
      user_metadata: { first_name, last_name, phone },
    });
    if (authError) {
      throw new Error(`Update auth user failed: ${authError.message}`);
    }

    const { error: profileError } = await service
      .from("profiles")
      .update({
        email,
        first_name,
        last_name,
        phone,
        role,
        status: effectiveStatus,
        dealer_group_id,
      })
      .eq("id", existingProfile.id);

    if (profileError) {
      throw new Error(`Update profile failed: ${profileError.message}`);
    }
  } else {
    createdNewAccount = true;
    const password = randomBytes(24).toString("base64url");

    const { data: authData, error: authError } = await service.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { first_name, last_name, phone },
    });

    if (authError || !authData.user) {
      // Auth user may exist without a profile (orphaned signup)
      if (authError?.message?.toLowerCase().includes("already been registered")) {
        createdNewAccount = false;
        const { data: listed } = await service.auth.admin.listUsers({ perPage: 1000 });
        const orphan = (listed?.users ?? []).find((u) => (u.email || "").toLowerCase() === email);
        if (!orphan) {
          throw new Error(`Create auth user failed: ${authError.message}`);
        }
        userId = orphan.id;
        const { error: profileError } = await service.from("profiles").insert({
          id: userId,
          user_id: userId,
          email,
          first_name,
          last_name,
          phone,
          role,
          status: effectiveStatus,
          dealer_group_id,
        });
        if (profileError) {
          throw new Error(`Create profile failed: ${profileError.message}`);
        }
      } else {
        throw new Error(`Create auth user failed: ${authError?.message || "unknown error"}`);
      }
    } else {
      userId = authData.user.id;

      const { error: profileError } = await service.from("profiles").insert({
        id: userId,
        user_id: userId,
        email,
        first_name,
        last_name,
        phone,
        role,
        status: effectiveStatus,
        dealer_group_id,
      });

      if (profileError) {
        throw new Error(`Create profile failed: ${profileError.message}`);
      }
    }
  }

  await syncUserStoreAccess(service, userId, dealer_group_id, role, storeIds);

  const { data: groupRow } = await service
    .from("dealer_groups")
    .select("name")
    .eq("id", dealer_group_id)
    .maybeSingle();
  const groupName = groupRow?.name || "your auto group";

  let emailWarning: string | undefined;
  const linkResult = await generatePasswordSetupLink(service, email);
  if (!linkResult.ok) {
    emailWarning = `Account saved, but invite email failed: ${linkResult.error}`;
  } else {
    const emailResult = await sendInviteEmail({
      to: email,
      firstName: first_name || "there",
      groupName,
      actionLink: linkResult.actionLink,
    });
    if (!emailResult.ok) {
      emailWarning = `Account saved, but invite email failed: ${emailResult.error}`;
    }
  }

  revalidateGroup(dealer_group_id);
  revalidateUser(existingProfile?.id ?? userId);
  if (previousGroupId && previousGroupId !== dealer_group_id) {
    revalidateGroup(previousGroupId);
  }

  return {
    saved: true as const,
    message: createdNewAccount ? "User Created" : "User Updated",
    emailWarning,
    redirectTo:
      previousGroupId && previousGroupId !== dealer_group_id
        ? `/admin/groups/${dealer_group_id}`
        : null,
  };
}

export async function updateUserInGroup(formData: FormData) {
  await requireAdminServiceClient();
  const service = createSupabaseServiceClient();

  const id = String(formData.get("id") || "").trim();
  const user_id = String(formData.get("user_id") || "").trim();
  const current_dealer_group_id = String(formData.get("current_dealer_group_id") || "").trim();
  const dealer_group_id = String(formData.get("dealer_group_id") || "").trim();
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const first_name = String(formData.get("first_name") || "").trim() || null;
  const last_name = String(formData.get("last_name") || "").trim() || null;
  const phone = String(formData.get("phone") || "").trim() || null;
  const role = String(formData.get("role") || "store_admin") as AppRole;
  const status = String(formData.get("status") || "invited") as UserStatus;
  const storeIds = formData
    .getAll("store_ids")
    .map((v) => String(v).trim())
    .filter(Boolean);

  if (!id || !user_id || !current_dealer_group_id || !dealer_group_id || !email) {
    throw new Error("User id, auth id, email, and group are required");
  }
  if (role !== "group_admin" && role !== "store_admin" && role !== "store_viewer") {
    throw new Error("Invalid role");
  }

  const movingGroups = current_dealer_group_id !== dealer_group_id;

  // Store checkboxes on this page only list the current group's stores.
  // When moving groups as store-scoped, assign stores on the destination group page.
  if (isStoreScopedRole(role) && storeIds.length === 0 && !movingGroups) {
    throw new Error("Select at least one store for this role");
  }

  const { data: existing } = await service
    .from("profiles")
    .select("role, dealer_group_id")
    .eq("id", id)
    .eq("dealer_group_id", current_dealer_group_id)
    .maybeSingle();

  if (!existing) {
    throw new Error("User not found in this auto group");
  }
  if (isPlatformStaff(existing.role)) {
    throw new Error("Cannot edit platform admins from Auto Groups");
  }

  if (movingGroups) {
    const { data: targetGroup } = await service
      .from("dealer_groups")
      .select("id")
      .eq("id", dealer_group_id)
      .maybeSingle();
    if (!targetGroup) {
      throw new Error("Destination auto group not found");
    }
  }

  const { error: authError } = await service.auth.admin.updateUserById(user_id, {
    email,
    user_metadata: { first_name, last_name, phone },
  });

  if (authError) {
    throw new Error(`Update auth user failed: ${authError.message}`);
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
    .eq("id", id)
    .eq("dealer_group_id", current_dealer_group_id);

  if (profileError) {
    throw new Error(`Update profile failed: ${profileError.message}`);
  }

  // When moving groups, ignore store checkboxes from the old page (wrong store ids).
  await syncUserStoreAccess(service, user_id, dealer_group_id, role, movingGroups ? [] : storeIds);

  revalidateGroup(current_dealer_group_id);
  revalidateUser(id);
  if (movingGroups) {
    revalidateGroup(dealer_group_id);
  }

  return {
    saved: true as const,
    redirectTo: movingGroups ? `/admin/groups/${dealer_group_id}` : null,
  };
}

async function syncUserStoreAccess(
  service: ReturnType<typeof createSupabaseServiceClient>,
  /** profiles.id / auth user id used as user_store_access.user_id */
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

  if (!isStoreScopedRole(role)) {
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

export async function disableUserInGroup(formData: FormData) {
  await requireAdminServiceClient();
  const service = createSupabaseServiceClient();

  const id = String(formData.get("id") || "").trim();
  const dealer_group_id = String(
    formData.get("current_dealer_group_id") || formData.get("dealer_group_id") || ""
  ).trim();
  if (!id || !dealer_group_id) throw new Error("User id and group are required");

  const { data: existing } = await service
    .from("profiles")
    .select("role")
    .eq("id", id)
    .eq("dealer_group_id", dealer_group_id)
    .maybeSingle();

  if (!existing) {
    throw new Error("User not found in this auto group");
  }
  if (isPlatformStaff(existing.role)) {
    throw new Error("Cannot disable platform admins from Auto Groups");
  }

  const { error } = await service
    .from("profiles")
    .update({ status: "disabled" })
    .eq("id", id)
    .eq("dealer_group_id", dealer_group_id);

  if (error) {
    throw new Error(`Disable user failed: ${error.message}`);
  }

  revalidateGroup(dealer_group_id);
  revalidateUser(id);
}

export async function sendUserPasswordReset(formData: FormData): Promise<
  | { saved: true; message: string }
  | { saved: false; error: string }
> {
  await requireAdminServiceClient();
  const service = createSupabaseServiceClient();

  const id = String(formData.get("id") || "").trim();
  const dealer_group_id = String(
    formData.get("current_dealer_group_id") || formData.get("dealer_group_id") || ""
  ).trim();

  if (!id || !dealer_group_id) {
    return { saved: false, error: "User id and group are required" };
  }

  const { data: existing } = await service
    .from("profiles")
    .select("id, email, first_name, role, status")
    .eq("id", id)
    .eq("dealer_group_id", dealer_group_id)
    .maybeSingle();

  if (!existing) {
    return { saved: false, error: "User not found in this auto group" };
  }
  if (isPlatformStaff(existing.role)) {
    return { saved: false, error: "Cannot reset password for platform admins from Auto Groups" };
  }

  const linkResult = await generatePasswordSetupLink(service, existing.email);
  if (!linkResult.ok) {
    return { saved: false, error: `Password reset failed: ${linkResult.error}` };
  }

  const emailResult = await sendPasswordResetEmail({
    to: existing.email,
    firstName: existing.first_name || "there",
    actionLink: linkResult.actionLink,
  });

  if (!emailResult.ok) {
    return { saved: false, error: `Password reset email failed: ${emailResult.error}` };
  }

  return {
    saved: true as const,
    message: "Password reset email sent",
  };
}
