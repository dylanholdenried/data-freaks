import { createSupabaseServerClient } from "@/lib/supabase/server";
import { profileMatchAuthUserId } from "@/lib/supabase/profile-match";
import { getEffectiveDealerGroupId } from "@/lib/dealer-group-context";
import NewDealForm from "./NewDealForm";
import SelectAutoGroupEmptyState from "../../SelectAutoGroupEmptyState";

type StoreRow = { id: string; name: string };
type ItemRow = { id: string; name: string; store_id: string };
type VehicleMakeRow = { id: string; name: string };
type VehicleModelRow = { id: string; name: string; make_id: string };
type DepartmentMakeRow = { department_id: string; make: string };

export default async function NewDealPage() {
  const supabase = createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const { data: profile } = await supabase
    .from("profiles")
    .select("dealer_group_id, role")
    .or(profileMatchAuthUserId(session!.user.id))
    .maybeSingle();

  const dealerGroupId = await getEffectiveDealerGroupId(profile);

  if (!dealerGroupId) {
    return <SelectAutoGroupEmptyState />;
  }

  const { data: storesData } = await supabase
    .from("stores")
    .select("id,name")
    .eq("dealer_group_id", dealerGroupId)
    .order("name");

  const stores = (storesData ?? []) as unknown as StoreRow[];
  const storeIds = stores.map((s) => s.id);

  let departments: ItemRow[] = [];
  let salespeople: ItemRow[] = [];

  const [deptResult, spResult, vMakesResult, vModelsResult, deptMakesResult] = await Promise.all([
    storeIds.length > 0
      ? supabase.from("departments").select("id,name,store_id").in("store_id", storeIds).order("name")
      : Promise.resolve({ data: [] as ItemRow[] }),
    storeIds.length > 0
      ? supabase.from("salespeople").select("id,name,store_id").in("store_id", storeIds).eq("active", true).order("name")
      : Promise.resolve({ data: [] as ItemRow[] }),
    supabase.from("vehicle_makes").select("id,name").eq("active", true).order("name"),
    supabase.from("vehicle_models").select("id,name,make_id").eq("active", true).order("name"),
    supabase.from("department_makes").select("department_id,make"),
  ]);

  departments = (deptResult.data ?? []) as unknown as ItemRow[];
  salespeople = (spResult.data ?? []) as unknown as ItemRow[];
  const vehicleMakes = (vMakesResult.data ?? []) as unknown as VehicleMakeRow[];
  const vehicleModels = (vModelsResult.data ?? []) as unknown as VehicleModelRow[];
  const departmentMakes = (deptMakesResult.data ?? []) as unknown as DepartmentMakeRow[];

  return (
    <NewDealForm
      userId={session!.user.id}
      stores={stores}
      departments={departments}
      salespeople={salespeople}
      vehicleMakes={vehicleMakes}
      vehicleModels={vehicleModels}
      departmentMakes={departmentMakes}
    />
  );
}
