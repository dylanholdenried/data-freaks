"use server";

import { revalidatePath } from "next/cache";
import { requireAdminServiceClient } from "@/app/admin/admin-data";
import { sendActivationEmail } from "@/lib/email/resend";
import {
  DEFAULT_DEPARTMENTS,
  type ProvisionDraftPayload,
  type ProvisionStoreInput,
} from "@/app/admin/provision-types";

export type { ProvisionDraftPayload, ProvisionStoreInput };
function revalidateProvision(requestId: string, groupId?: string | null) {
  revalidatePath("/admin/requests");
  revalidatePath(`/admin/requests/${requestId}/provision`);
  if (groupId) {
    revalidatePath(`/admin/groups/${groupId}`);
    revalidatePath("/admin/groups");
  }
}

function parseAuthUserIdFromNotes(notes: string | null | undefined): string | null {
  if (!notes) return null;
  const match = notes.match(/auth_user_id=([0-9a-f-]{36})/i);
  return match?.[1] ?? null;
}

export async function rejectDealerGroupRequest(requestId: string) {
  const supabase = await requireAdminServiceClient();
  const { error } = await supabase
    .from("dealer_group_requests")
    .update({ status: "rejected" })
    .eq("id", requestId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/admin/requests");
}

export async function saveProvisionDraft(requestId: string, payload: ProvisionDraftPayload) {
  const supabase = await requireAdminServiceClient();

  const groupName = payload.groupName.trim();
  const adminEmail = payload.adminEmail.trim().toLowerCase();
  if (!groupName) throw new Error("Auto group name is required");
  if (!adminEmail) throw new Error("Group admin email is required");
  if (!payload.stores.length || payload.stores.every((s) => !s.name.trim())) {
    throw new Error("Add at least one store");
  }

  const { data: request, error: requestError } = await supabase
    .from("dealer_group_requests")
    .select(
      "id, status, email, first_name, last_name, notes, requested_user_id, dealer_group_id, website, number_of_stores"
    )
    .eq("id", requestId)
    .maybeSingle();

  if (requestError || !request) {
    throw new Error(requestError?.message || "Request not found");
  }
  if (request.status === "rejected") {
    throw new Error("This request was rejected");
  }
  if (request.status === "active" && request.dealer_group_id) {
    throw new Error("This request is already activated");
  }

  const requestedUserId =
    request.requested_user_id || parseAuthUserIdFromNotes(request.notes) || null;

  let profileQuery = supabase
    .from("profiles")
    .select("id, user_id, email, status, role, dealer_group_id")
    .limit(1);

  if (requestedUserId) {
    profileQuery = profileQuery.or(`user_id.eq.${requestedUserId},id.eq.${requestedUserId}`);
  } else {
    profileQuery = profileQuery.eq("email", adminEmail);
  }

  const { data: profile, error: profileError } = await profileQuery.maybeSingle();
  if (profileError) {
    throw new Error(`Load profile failed: ${profileError.message}`);
  }
  if (!profile) {
    throw new Error("No signup profile found for this request. Ask the applicant to sign up again.");
  }

  let dealerGroupId = request.dealer_group_id as string | null;

  if (dealerGroupId) {
    const { error: groupUpdateError } = await supabase
      .from("dealer_groups")
      .update({
        name: groupName,
        plan: payload.plan,
        website: payload.website?.trim() || request.website || null,
        status: "pending",
        is_active: false,
        number_of_stores: payload.stores.filter((s) => s.name.trim()).length,
      })
      .eq("id", dealerGroupId);

    if (groupUpdateError) {
      throw new Error(`Update auto group failed: ${groupUpdateError.message}`);
    }
  } else {
    const { data: createdGroup, error: groupInsertError } = await supabase
      .from("dealer_groups")
      .insert({
        name: groupName,
        plan: payload.plan,
        website: payload.website?.trim() || request.website || null,
        status: "pending",
        is_active: false,
        is_demo: false,
        number_of_stores: payload.stores.filter((s) => s.name.trim()).length,
      })
      .select("id")
      .single();

    if (groupInsertError || !createdGroup) {
      throw new Error(`Create auto group failed: ${groupInsertError?.message || "unknown error"}`);
    }
    dealerGroupId = createdGroup.id;
  }

  // Sync stores: update named existing, insert new, delete removed
  const { data: existingStores, error: storesLoadError } = await supabase
    .from("stores")
    .select("id, name")
    .eq("dealer_group_id", dealerGroupId);

  if (storesLoadError) {
    throw new Error(`Load stores failed: ${storesLoadError.message}`);
  }

  const keepStoreIds = new Set(
    payload.stores.map((s) => s.id).filter((id): id is string => Boolean(id))
  );

  for (const existing of existingStores ?? []) {
    if (!keepStoreIds.has(existing.id)) {
      await supabase.from("departments").delete().eq("store_id", existing.id);
      const { error: deleteStoreError } = await supabase.from("stores").delete().eq("id", existing.id);
      if (deleteStoreError) {
        throw new Error(`Delete store failed: ${deleteStoreError.message}`);
      }
    }
  }

  const storeIdByTemp: { storeId: string; departments: string[] }[] = [];

  for (const store of payload.stores) {
    const storeName = store.name.trim();
    if (!storeName) continue;

    let storeId = store.id;
    if (storeId) {
      const { error: updateStoreError } = await supabase
        .from("stores")
        .update({ name: storeName, is_active: true, is_demo: false })
        .eq("id", storeId)
        .eq("dealer_group_id", dealerGroupId);
      if (updateStoreError) {
        throw new Error(`Update store failed: ${updateStoreError.message}`);
      }
    } else {
      const { data: createdStore, error: createStoreError } = await supabase
        .from("stores")
        .insert({
          dealer_group_id: dealerGroupId,
          name: storeName,
          is_demo: false,
          is_active: true,
        })
        .select("id")
        .single();
      if (createStoreError || !createdStore) {
        throw new Error(`Create store failed: ${createStoreError?.message || "unknown error"}`);
      }
      storeId = createdStore.id;
    }

    const deptNames = (store.departments.length ? store.departments : DEFAULT_DEPARTMENTS)
      .map((d) => d.trim())
      .filter(Boolean);

    const { data: existingDepts, error: deptLoadError } = await supabase
      .from("departments")
      .select("id, name")
      .eq("store_id", storeId);

    if (deptLoadError) {
      throw new Error(`Load departments failed: ${deptLoadError.message}`);
    }

    const desired = new Set(deptNames.map((n) => n.toLowerCase()));
    for (const dept of existingDepts ?? []) {
      if (!desired.has(String(dept.name).toLowerCase())) {
        await supabase.from("departments").delete().eq("id", dept.id);
      }
    }

    const existingByName = new Map(
      (existingDepts ?? []).map((d) => [String(d.name).toLowerCase(), d.id as string])
    );

    for (const name of deptNames) {
      const key = name.toLowerCase();
      if (existingByName.has(key)) continue;
      const { error: createDeptError } = await supabase.from("departments").insert({
        store_id: storeId,
        name,
        is_active: true,
      });
      if (createDeptError) {
        throw new Error(`Create department failed: ${createDeptError.message}`);
      }
    }

    storeIdByTemp.push({ storeId: storeId!, departments: deptNames });
  }

  if (storeIdByTemp.length === 0) {
    throw new Error("Add at least one store");
  }

  // Link signup profile as group_admin (still invited until activate)
  const { error: profileUpdateError } = await supabase
    .from("profiles")
    .update({
      first_name: payload.adminFirstName.trim() || request.first_name,
      last_name: payload.adminLastName.trim() || request.last_name,
      phone: payload.adminPhone?.trim() || null,
      email: adminEmail,
      role: "group_admin",
      dealer_group_id: dealerGroupId,
      status: "invited",
    })
    .eq("id", profile.id);

  if (profileUpdateError) {
    throw new Error(`Update group admin profile failed: ${profileUpdateError.message}`);
  }

  // group_admin does not need user_store_access rows; clear any leftover store_admin grants
  await supabase.from("user_store_access").delete().eq("user_id", profile.user_id || profile.id);

  const { error: requestUpdateError } = await supabase
    .from("dealer_group_requests")
    .update({
      dealer_group_name: groupName,
      website: payload.website?.trim() || request.website || null,
      number_of_stores: storeIdByTemp.length,
      requested_user_id: requestedUserId || profile.user_id || profile.id,
      dealer_group_id: dealerGroupId,
      provisioned_at: new Date().toISOString(),
      first_name: payload.adminFirstName.trim() || request.first_name,
      last_name: payload.adminLastName.trim() || request.last_name,
      email: adminEmail,
      status: "pending",
    })
    .eq("id", requestId);

  if (requestUpdateError) {
    throw new Error(`Update request failed: ${requestUpdateError.message}`);
  }

  revalidateProvision(requestId, dealerGroupId);
  return { dealerGroupId, storeCount: storeIdByTemp.length };
}

export async function activateAutoGroup(requestId: string): Promise<{ redirectTo: string }> {
  const supabase = await requireAdminServiceClient();

  const { data: request, error: requestError } = await supabase
    .from("dealer_group_requests")
    .select(
      "id, status, email, first_name, last_name, dealer_group_name, requested_user_id, dealer_group_id, notes"
    )
    .eq("id", requestId)
    .maybeSingle();

  if (requestError || !request) {
    throw new Error(requestError?.message || "Request not found");
  }
  if (!request.dealer_group_id) {
    throw new Error("Save a draft with at least one store before activating");
  }
  if (request.status === "rejected") {
    throw new Error("Cannot activate a rejected request");
  }

  const { data: stores, error: storesError } = await supabase
    .from("stores")
    .select("id")
    .eq("dealer_group_id", request.dealer_group_id);

  if (storesError) {
    throw new Error(`Load stores failed: ${storesError.message}`);
  }
  if (!stores?.length) {
    throw new Error("Add at least one store before activating");
  }

  const requestedUserId =
    request.requested_user_id || parseAuthUserIdFromNotes(request.notes) || null;

  let profile: {
    id: string;
    user_id: string | null;
    email: string | null;
    first_name: string | null;
    dealer_group_id: string | null;
  } | null = null;

  if (requestedUserId) {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, user_id, email, first_name, dealer_group_id")
      .or(`user_id.eq.${requestedUserId},id.eq.${requestedUserId}`)
      .maybeSingle();
    if (error) throw new Error(error.message);
    profile = data;
  }

  if (!profile) {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, user_id, email, first_name, dealer_group_id")
      .eq("dealer_group_id", request.dealer_group_id)
      .eq("role", "group_admin")
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    profile = data;
  }

  if (!profile) {
    throw new Error("Group admin profile not found — save draft first");
  }

  const now = new Date().toISOString();

  const { error: groupError } = await supabase
    .from("dealer_groups")
    .update({ status: "active", is_active: true })
    .eq("id", request.dealer_group_id);

  if (groupError) {
    throw new Error(`Activate group failed: ${groupError.message}`);
  }

  const { error: profileActivateError } = await supabase
    .from("profiles")
    .update({
      status: "active",
      role: "group_admin",
      dealer_group_id: request.dealer_group_id,
      onboarding_welcome_seen_at: null,
      onboarding_checklist: {},
    })
    .eq("id", profile.id);

  if (profileActivateError) {
    throw new Error(`Activate profile failed: ${profileActivateError.message}`);
  }

  const { error: requestActivateError } = await supabase
    .from("dealer_group_requests")
    .update({
      status: "active",
      activated_at: now,
      dealer_group_id: request.dealer_group_id,
    })
    .eq("id", requestId);

  if (requestActivateError) {
    throw new Error(`Activate request failed: ${requestActivateError.message}`);
  }

  let emailWarning: string | undefined;
  const emailResult = await sendActivationEmail({
    to: profile.email || request.email,
    firstName: profile.first_name || request.first_name || "there",
    groupName: request.dealer_group_name,
  });
  if (!emailResult.ok) {
    emailWarning = emailResult.error;
  }

  revalidateProvision(requestId, request.dealer_group_id);

  const redirectTo = emailWarning
    ? `/admin/groups/${request.dealer_group_id}?activated=1&emailError=${encodeURIComponent(emailWarning)}`
    : `/admin/groups/${request.dealer_group_id}?activated=1`;

  // Return a URL for the client to navigate — calling redirect() from a
  // client-invoked server action surfaces as a cryptic render error in production.
  return { redirectTo };
}
