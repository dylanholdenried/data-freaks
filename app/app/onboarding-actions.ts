"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { profileMatchAuthUserId } from "@/lib/supabase/profile-match";
import { assertNotImpersonating } from "@/lib/impersonation";

export type OnboardingChecklist = {
  salespeople?: boolean;
  finance_managers?: boolean;
  acquisition_sources?: boolean;
  goals?: boolean;
};

async function requireActiveProfileId() {
  await assertNotImpersonating();
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    throw new Error("Not signed in");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, status")
    .or(profileMatchAuthUserId(user.id))
    .maybeSingle();

  if (!profile || profile.status !== "active") {
    throw new Error("Profile not active");
  }

  return profile.id as string;
}

export async function markWelcomeSeen() {
  const profileId = await requireActiveProfileId();
  const service = createSupabaseServiceClient();
  const { error } = await service
    .from("profiles")
    .update({ onboarding_welcome_seen_at: new Date().toISOString() })
    .eq("id", profileId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/app");
  revalidatePath("/app/setup");
}

export async function updateOnboardingChecklist(patch: OnboardingChecklist) {
  const profileId = await requireActiveProfileId();
  const service = createSupabaseServiceClient();

  const { data: existing, error: loadError } = await service
    .from("profiles")
    .select("onboarding_checklist")
    .eq("id", profileId)
    .maybeSingle();

  if (loadError) {
    throw new Error(loadError.message);
  }

  const current = (existing?.onboarding_checklist || {}) as OnboardingChecklist;
  const next = { ...current, ...patch };

  const { error } = await service
    .from("profiles")
    .update({ onboarding_checklist: next })
    .eq("id", profileId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/app/setup");
}
