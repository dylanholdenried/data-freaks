import { notFound } from "next/navigation";
import { requireAdminServiceClient } from "@/app/admin/admin-data";
import ProvisionWizardClient from "./ProvisionWizardClient";

type PageProps = { params: { id: string } };

function parseAuthUserIdFromNotes(notes: string | null | undefined): string | null {
  if (!notes) return null;
  const match = notes.match(/auth_user_id=([0-9a-f-]{36})/i);
  return match?.[1] ?? null;
}

export default async function ProvisionRequestPage({ params }: PageProps) {
  const supabase = await requireAdminServiceClient();
  const id = params.id;

  const { data: request, error } = await supabase
    .from("dealer_group_requests")
    .select(
      "id, first_name, last_name, email, title, website, number_of_stores, dealer_group_name, status, created_at, notes, requested_user_id, dealer_group_id"
    )
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("Error loading request for provision", error);
  }
  if (!request) notFound();

  const requestedUserId =
    request.requested_user_id || parseAuthUserIdFromNotes(request.notes) || null;

  let profile = null as null | {
    id: string;
    user_id: string | null;
    email: string | null;
    first_name: string | null;
    last_name: string | null;
    phone: string | null;
  };

  if (requestedUserId) {
    const { data } = await supabase
      .from("profiles")
      .select("id, user_id, email, first_name, last_name, phone")
      .or(`user_id.eq.${requestedUserId},id.eq.${requestedUserId}`)
      .maybeSingle();
    profile = data;
  }

  if (!profile && request.email) {
    const { data } = await supabase
      .from("profiles")
      .select("id, user_id, email, first_name, last_name, phone")
      .eq("email", request.email)
      .maybeSingle();
    profile = data;
  }

  let group = null as null | { id: string; name: string; plan: string; website: string | null };
  let initialStores: {
    id: string;
    name: string;
    departments: { id: string; name: string }[];
  }[] = [];

  if (request.dealer_group_id) {
    const { data: groupRow } = await supabase
      .from("dealer_groups")
      .select("id, name, plan, website")
      .eq("id", request.dealer_group_id)
      .maybeSingle();
    group = groupRow;

    const { data: stores } = await supabase
      .from("stores")
      .select("id, name")
      .eq("dealer_group_id", request.dealer_group_id)
      .order("name", { ascending: true });

    const storeIds = (stores ?? []).map((s) => s.id);
    let deptsByStore = new Map<string, { id: string; name: string }[]>();
    if (storeIds.length > 0) {
      const { data: depts } = await supabase
        .from("departments")
        .select("id, name, store_id")
        .in("store_id", storeIds)
        .order("name", { ascending: true });
      for (const d of depts ?? []) {
        const list = deptsByStore.get(d.store_id) ?? [];
        list.push({ id: d.id, name: d.name });
        deptsByStore.set(d.store_id, list);
      }
    }

    initialStores = (stores ?? []).map((s) => ({
      id: s.id,
      name: s.name,
      departments: deptsByStore.get(s.id) ?? [],
    }));
  }

  return (
    <ProvisionWizardClient
      request={request}
      profile={profile}
      group={group}
      initialStores={initialStores}
    />
  );
}
