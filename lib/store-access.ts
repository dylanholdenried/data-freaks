import type { SupabaseClient } from "@supabase/supabase-js";
import { getEffectiveDealerGroupId } from "@/lib/dealer-group-context";
import { isPlatformStaff } from "@/lib/roles";

export type StoreAccessProfile = {
  id: string;
  role: string | null;
  dealer_group_id: string | null;
};

export type AccessibleStore = {
  id: string;
  name: string;
};

/**
 * Resolve stores the current profile may view/edit.
 * - owner/platform_admin / group_admin → all stores in the effective dealer group
 * - store_admin → stores listed in user_store_access (within that group)
 */
export async function getAccessibleStores(
  supabase: SupabaseClient,
  profile: StoreAccessProfile | null | undefined
): Promise<AccessibleStore[]> {
  if (!profile) return [];

  const dealerGroupId = await getEffectiveDealerGroupId(profile);
  if (!dealerGroupId) return [];

  if (isPlatformStaff(profile.role) || profile.role === "group_admin") {
    const { data, error } = await supabase
      .from("stores")
      .select("id,name")
      .eq("dealer_group_id", dealerGroupId)
      .order("name");

    if (error) {
      console.error("getAccessibleStores: group stores", error);
      return [];
    }
    return (data ?? []) as AccessibleStore[];
  }

  // store_admin (and any other non–group-wide role): only assigned stores
  // Live table keys rows by auth/profile user_id (not profile_id).
  const accessUserId = profile.id;
  const { data: accessRows, error: accessError } = await supabase
    .from("user_store_access")
    .select("store_id")
    .eq("user_id", accessUserId);

  if (accessError) {
    console.error("getAccessibleStores: user_store_access", accessError);
    return [];
  }

  const assignedIds = (accessRows ?? []).map((r) => r.store_id as string);
  if (assignedIds.length === 0) return [];

  const { data, error } = await supabase
    .from("stores")
    .select("id,name")
    .eq("dealer_group_id", dealerGroupId)
    .in("id", assignedIds)
    .order("name");

  if (error) {
    console.error("getAccessibleStores: assigned stores", error);
    return [];
  }

  return (data ?? []) as AccessibleStore[];
}

export async function assertStoreAccess(
  supabase: SupabaseClient,
  profile: StoreAccessProfile | null | undefined,
  storeId: string
): Promise<boolean> {
  if (!storeId) return false;
  const stores = await getAccessibleStores(supabase, profile);
  return stores.some((s) => s.id === storeId);
}
