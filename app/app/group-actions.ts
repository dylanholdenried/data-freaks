"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { profileMatchAuthUserId } from "@/lib/supabase/profile-match";
import { SELECTED_DEALER_GROUP_COOKIE } from "@/lib/dealer-group-context";

async function requirePlatformAdminProfile() {
  const supabase = createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, status, dealer_group_id")
    .or(profileMatchAuthUserId(session.user.id))
    .maybeSingle();

  if (!profile || profile.status !== "active" || profile.role !== "platform_admin") {
    redirect("/app");
  }

  return profile;
}

async function setSelectedGroupCookie(groupId: string) {
  const service = createSupabaseServiceClient();
  const { data: group } = await service.from("dealer_groups").select("id").eq("id", groupId).maybeSingle();

  if (!group?.id) {
    throw new Error("Auto group not found");
  }

  cookies().set(SELECTED_DEALER_GROUP_COOKIE, group.id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 365,
  });
}

export async function setSelectedDealerGroupAction(formData: FormData) {
  await requirePlatformAdminProfile();

  const groupId = String(formData.get("dealer_group_id") || "").trim();
  if (!groupId) {
    throw new Error("Auto group is required");
  }

  await setSelectedGroupCookie(groupId);
  revalidatePath("/app", "layout");
  revalidatePath("/admin", "layout");
}

/** Set selected group and open store analytics for that group. */
export async function openStoreViewForGroupAction(formData: FormData) {
  await requirePlatformAdminProfile();

  const groupId = String(formData.get("dealer_group_id") || "").trim();
  if (!groupId) {
    throw new Error("Auto group is required");
  }

  await setSelectedGroupCookie(groupId);
  revalidatePath("/app", "layout");
  redirect("/app/dashboard");
}
