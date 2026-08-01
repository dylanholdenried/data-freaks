"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { requireAdminServiceClient } from "@/app/admin/admin-data";
import { sendInviteEmail, sendPasswordResetEmail } from "@/lib/email/resend";

type PlanTier = "log" | "analyze" | "advise";
type AppRole = "group_admin" | "store_admin";
type UserStatus = "invited" | "active" | "disabled";

function revalidateGroup(groupId?: string) {
  revalidatePath("/admin/groups");
  if (groupId) {
    revalidatePath(`/admin/groups/${groupId}`);
  }
}

function authRedirectBase() {
  return (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");
}

async function generatePasswordSetupLink(
  service: ReturnType<typeof createSupabaseServiceClient>,
  email: string
): Promise<{ ok: true; actionLink: string } | { ok: false; error: string }> {
  const redirectTo = `${authRedirectBase()}/auth/callback?next=${encodeURIComponent("/set-password")}`;
  const { data, error } = await service.auth.admin.generateLink({
    type: "recovery",
    email,
    options: { redirectTo },
  });
  if (error || !data?.properties?.action_link) {
    return { ok: false, error: error?.message || "Could not generate password link" };
  }
  return { ok: true, actionLink: data.properties.action_link };
}

export async function createAutoGroup(formData: FormData) {
  const supabase = await requireAdminServiceClient();

  const name = String(formData.get("name") || "").trim();
  if (!name) {
    throw new Error("Group name is required");
  }

  const plan = (String(formData.get("plan") || "log") as PlanTier) || "log";

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

  const plan = String(formData.get("plan") || "log") as PlanTier;

  const { error } = await supabase.from("dealer_groups").update({ name, plan }).eq("id", id);

  if (error) {
    throw new Error(`Update auto group failed: ${error.message}`);
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
  });

  if (error) {
    throw new Error(`Create store failed: ${error.message}`);
  }

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

  const { error } = await supabase
    .from("stores")
    .update({ name })
    .eq("id", id)
    .eq("dealer_group_id", dealer_group_id);

  if (error) {
    throw new Error(`Update store failed: ${error.message}`);
  }

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
  const status = String(formData.get("status") || "active") as UserStatus;
  const storeIds = formData
    .getAll("store_ids")
    .map((v) => String(v).trim())
    .filter(Boolean);

  if (!dealer_group_id || !email) {
    throw new Error("Email and group are required");
  }
  if (role !== "group_admin" && role !== "store_admin") {
    throw new Error("Invalid role");
  }
  if (role === "store_admin" && storeIds.length === 0) {
    throw new Error("Select at least one store for a store admin");
  }

  // One email → one account. If they already exist, move/update into this group.
  const { data: existingProfile } = await service
    .from("profiles")
    .select("id, user_id, dealer_group_id, role")
    .eq("email", email)
    .maybeSingle();

  if (existingProfile?.role === "platform_admin") {
    throw new Error("Cannot reassign a platform admin from Auto Groups");
  }

  let userId: string;
  let previousGroupId: string | null = null;
  let createdNewAccount = false;

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
        status,
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
          status,
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
        status,
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
  const status = String(formData.get("status") || "active") as UserStatus;
  const storeIds = formData
    .getAll("store_ids")
    .map((v) => String(v).trim())
    .filter(Boolean);

  if (!id || !user_id || !current_dealer_group_id || !dealer_group_id || !email) {
    throw new Error("User id, auth id, email, and group are required");
  }
  if (role !== "group_admin" && role !== "store_admin") {
    throw new Error("Invalid role");
  }

  const movingGroups = current_dealer_group_id !== dealer_group_id;

  // Store checkboxes on this page only list the current group's stores.
  // When moving groups as store_admin, assign stores on the destination group page.
  if (role === "store_admin" && storeIds.length === 0 && !movingGroups) {
    throw new Error("Select at least one store for a store admin");
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
  if (existing.role === "platform_admin") {
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
  if (existing.role === "platform_admin") {
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
  if (existing.role === "platform_admin") {
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
