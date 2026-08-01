import { notFound } from "next/navigation";
import { requireAdminContext } from "@/app/admin/admin-data";
import { isAutoGroupUserRole, isOwnerAdmin, isPlatformStaff } from "@/lib/roles";
import UserDetailClient from "./UserDetailClient";

type PageProps = {
  params: { id: string };
};

export default async function AdminUserDetailPage({ params }: PageProps) {
  const { supabase, profileId: actorId, role: actorRole, isOwner } = await requireAdminContext();

  const { data: user } = await supabase
    .from("profiles")
    .select(
      "id, user_id, email, first_name, last_name, phone, role, status, dealer_group_id, created_at"
    )
    .eq("id", params.id)
    .maybeSingle();

  if (!user || !user.user_id) {
    notFound();
  }

  const [{ data: groups }, { data: stores }] = await Promise.all([
    supabase.from("dealer_groups").select("id, name").order("name", { ascending: true }),
    supabase
      .from("stores")
      .select("id, name, dealer_group_id")
      .order("name", { ascending: true }),
  ]);

  const accessKeys = [user.id, user.user_id].filter(Boolean);
  let assignedStoreIds: string[] = [];
  if (accessKeys.length > 0) {
    const { data: accessRows } = await supabase
      .from("user_store_access")
      .select("store_id")
      .in("user_id", accessKeys);
    assignedStoreIds = Array.from(new Set((accessRows ?? []).map((r) => r.store_id as string)));
  }

  let canEdit = false;
  let readOnlyReason: string | null = null;

  if (isOwnerAdmin(user.role)) {
    canEdit = false;
    readOnlyReason =
      user.id === actorId
        ? "Owner accounts cannot be edited from this page."
        : "Owner accounts cannot be edited.";
  } else if (user.role === "platform_admin") {
    if (isOwner) {
      canEdit = true;
    } else {
      canEdit = false;
      readOnlyReason = "Only the owner can edit platform admins.";
    }
  } else if (isAutoGroupUserRole(user.role)) {
    canEdit = isPlatformStaff(actorRole);
  } else {
    canEdit = false;
    readOnlyReason = "This user cannot be edited.";
  }

  return (
    <UserDetailClient
      user={{
        id: user.id,
        user_id: user.user_id,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        phone: user.phone,
        role: user.role,
        status: user.status,
        dealer_group_id: user.dealer_group_id,
        created_at: user.created_at,
      }}
      groups={(groups ?? []).map((g) => ({ id: g.id, name: g.name }))}
      stores={(stores ?? []).map((s) => ({
        id: s.id,
        name: s.name,
        dealer_group_id: s.dealer_group_id,
      }))}
      assignedStoreIds={assignedStoreIds}
      canEdit={canEdit}
      readOnlyReason={readOnlyReason}
      isOwnerViewer={isOwner}
    />
  );
}
