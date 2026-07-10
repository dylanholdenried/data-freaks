import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { profileMatchAuthUserId } from "@/lib/supabase/profile-match";
import NewDealForm from "./NewDealForm";

type Row = { id: string; name: string; store_id?: string };

export default async function NewDealPage() {
  const supabase = createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const { data: profile } = await supabase
    .from("profiles")
    .select("dealer_group_id")
    .or(profileMatchAuthUserId(session!.user.id))
    .maybeSingle();

  if (!profile?.dealer_group_id) {
    redirect("/app/dashboard");
  }

  const { data: stores } = await supabase
    .from("stores")
    .select("id,name")
    .eq("dealer_group_id", profile.dealer_group_id)
    .order("name");

  const storeIds = (stores ?? []).map((s: Row) => s.id);

  let departments: Row[] = [];
  let salespeople: Row[] = [];

  if (storeIds.length > 0) {
    const [deptResult, spResult] = await Promise.all([
      supabase
        .from("departments")
        .select("id,name,store_id")
        .in("store_id", storeIds)
        .order("name"),
      supabase
        .from("salespeople")
        .select("id,name,store_id")
        .in("store_id", storeIds)
        .eq("active", true)
        .order("name"),
    ]);
    departments = deptResult.data ?? [];
    salespeople = spResult.data ?? [];
  }

  return (
    <NewDealForm
      userId={session!.user.id}
      stores={stores ?? []}
      departments={departments}
      salespeople={salespeople}
    />
  );
}
