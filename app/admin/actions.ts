"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { requireAdminServiceClient } from "@/app/admin/admin-data";

type PlanTier = "free" | "paid" | "premium";
type AppRole = "group_admin" | "store_admin";
type UserStatus = "invited" | "active" | "disabled";

function revalidateGroup(groupId?: string) {
  revalidatePath("/admin/groups");
  if (groupId) {
    revalidatePath(`/admin/groups/${groupId}`);
  }
}

export async function createAutoGroup(formData: FormData) {
  const supabase = await requireAdminServiceClient();

  const name = String(formData.get("name") || "").trim();
  if (!name) {
    throw new Error("Group name is required");
  }

  const plan = (String(formData.get("plan") || "free") as PlanTier) || "free";

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

  const plan = String(formData.get("plan") || "free") as PlanTier;

  const { error } = await supabase.from("dealer_groups").update({ name, plan }).eq("id", id);

  if (error) {
    throw new Error(`Update auto group failed: ${error.message}`);
  }

  revalidateGroup(id);
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
  const role = String(formData.get("role") || "store_admin") as AppRole;
  const status = String(formData.get("status") || "active") as UserStatus;

  if (!dealer_group_id || !email) {
    throw new Error("Email and group are required");
  }
  if (role !== "group_admin" && role !== "store_admin") {
    throw new Error("Invalid role");
  }

  const password = randomBytes(24).toString("base64url");

  const { data: authData, error: authError } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { first_name, last_name },
  });

  if (authError || !authData.user) {
    throw new Error(`Create auth user failed: ${authError?.message || "unknown error"}`);
  }

  const userId = authData.user.id;

  const { error: profileError } = await service.from("profiles").upsert(
    {
      id: userId,
      user_id: userId,
      email,
      first_name,
      last_name,
      role,
      status,
      dealer_group_id,
    },
    { onConflict: "user_id" }
  );

  if (profileError) {
    throw new Error(`Create profile failed: ${profileError.message}`);
  }

  revalidateGroup(dealer_group_id);
}

export async function updateUserInGroup(formData: FormData) {
  await requireAdminServiceClient();
  const service = createSupabaseServiceClient();

  const id = String(formData.get("id") || "").trim();
  const user_id = String(formData.get("user_id") || "").trim();
  const dealer_group_id = String(formData.get("dealer_group_id") || "").trim();
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const first_name = String(formData.get("first_name") || "").trim() || null;
  const last_name = String(formData.get("last_name") || "").trim() || null;
  const role = String(formData.get("role") || "store_admin") as AppRole;
  const status = String(formData.get("status") || "active") as UserStatus;

  if (!id || !user_id || !dealer_group_id || !email) {
    throw new Error("User id, auth id, email, and group are required");
  }
  if (role !== "group_admin" && role !== "store_admin") {
    throw new Error("Invalid role");
  }

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
    throw new Error("Cannot edit platform admins from Auto Groups");
  }

  const { error: authError } = await service.auth.admin.updateUserById(user_id, {
    email,
    user_metadata: { first_name, last_name },
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
      role,
      status,
    })
    .eq("id", id)
    .eq("dealer_group_id", dealer_group_id);

  if (profileError) {
    throw new Error(`Update profile failed: ${profileError.message}`);
  }

  revalidateGroup(dealer_group_id);
}

export async function disableUserInGroup(formData: FormData) {
  await requireAdminServiceClient();
  const service = createSupabaseServiceClient();

  const id = String(formData.get("id") || "").trim();
  const dealer_group_id = String(formData.get("dealer_group_id") || "").trim();
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
