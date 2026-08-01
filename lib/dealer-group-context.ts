import { cookies } from "next/headers";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { isPlatformStaff } from "@/lib/roles";

export const SELECTED_DEALER_GROUP_COOKIE = "df_selected_dealer_group_id";

export type DealerGroupOption = { id: string; name: string };

type ProfileGroupFields = {
  role: string | null;
  dealer_group_id: string | null;
};

export async function getEffectiveDealerGroupId(
  profile: ProfileGroupFields | null | undefined
): Promise<string | null> {
  if (!profile) return null;

  if (!isPlatformStaff(profile.role)) {
    return profile.dealer_group_id ?? null;
  }

  const cookieStore = cookies();
  const selected = cookieStore.get(SELECTED_DEALER_GROUP_COOKIE)?.value?.trim() || null;

  if (selected) {
    const service = createSupabaseServiceClient();
    const { data } = await service.from("dealer_groups").select("id").eq("id", selected).maybeSingle();
    if (data?.id) return data.id;
  }

  return profile.dealer_group_id ?? null;
}

export async function listDealerGroupsForAdmin(): Promise<DealerGroupOption[]> {
  const service = createSupabaseServiceClient();
  const { data, error } = await service
    .from("dealer_groups")
    .select("id, name")
    .order("name", { ascending: true });

  if (error) {
    console.error("Error listing dealer_groups for admin", error);
    return [];
  }

  return (data ?? []) as DealerGroupOption[];
}
