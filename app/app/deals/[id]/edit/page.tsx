import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { profileMatchAuthUserId } from "@/lib/supabase/profile-match";
import { getEffectiveDealerGroupId } from "@/lib/dealer-group-context";
import { getAccessibleStores } from "@/lib/store-access";
import UpdatePendingForm from "./UpdatePendingForm";
import SelectAutoGroupEmptyState from "../../../SelectAutoGroupEmptyState";

type DealRow = {
  id: string;
  status: string;
  store_id: string;
  department_id: string;
  sale_date: string;
  stock_number: string;
  customer_last_name: string | null;
  vehicle_year: number;
  vehicle_make: string;
  vehicle_model: string;
  vin: string | null;
  trim: string | null;
  color: string | null;
  body_style: string | null;
  drivetrain: string | null;
  odometer: number | null;
  acquisition_source: string | null;
  finance_type: string | null;
  finance_manager_id: string | null;
  front_profit: number | null;
  back_profit: number | null;
  sale_price: number | null;
  list_price: number | null;
  list_price_na: boolean;
  age: number | null;
};

type SpRow = { salesperson_id: string; share_percent: number };
type SalespersonOption = { id: string; name: string };
type VehicleMakeRow = { id: string; name: string };
type VehicleModelRow = { id: string; name: string; make_id: string };
type DeptOption = { id: string; name: string };

type TradeRow = {
  id: string;
  vin: string | null;
  year: number | null;
  make: string | null;
  model: string | null;
  acv: number | null;
  allowance: number | null;
  exit_strategy: string | null;
};

export default async function EditDealPage({ params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, dealer_group_id, role")
    .or(profileMatchAuthUserId(session!.user.id))
    .maybeSingle();

  const dealerGroupId = await getEffectiveDealerGroupId(profile);

  if (!dealerGroupId || !profile) {
    return <SelectAutoGroupEmptyState />;
  }

  // 1. User's accessible stores — establishes the auth boundary
  const accessibleStores = await getAccessibleStores(supabase, profile);
  const storeById = new Map(accessibleStores.map((s) => [s.id, s.name]));
  const storeIds = accessibleStores.map((s) => s.id);

  // 2. Fetch the deal — no status filter; any deal by ID loads here
  const { data: dealData, error: dealFetchError } = await supabase
    .from("deals")
    .select(
      "id,status,store_id,department_id,sale_date,stock_number,customer_last_name," +
        "vehicle_year,vehicle_make,vehicle_model," +
        "vin,trim,color,body_style,drivetrain,odometer," +
        "acquisition_source,finance_type,finance_manager_id," +
        "front_profit,back_profit,sale_price,list_price,list_price_na,age"
    )
    .eq("id", params.id)
    .maybeSingle();

  // Auth guard: deal must exist and belong to this user's group.
  // Split into two checks so TypeScript narrows dealData to non-null before
  // the store_id access — avoids the GenericStringError cast overlap error in
  // strict/production builds.
  if (dealFetchError || !dealData) {
    notFound();
  }

  // dealData is non-null here; cast via unknown because Supabase returns an
  // untyped generic when no database type definitions are passed to the client.
  const deal = dealData as unknown as DealRow;

  // Second guard: deal must belong to this user's dealer group
  if (!storeIds.includes(deal.store_id)) {
    notFound();
  }

  const storeName = storeById.get(deal.store_id) ?? "Unknown Store";

  // 3. All parallel data: dropdowns + dept name + salespeople + trades + vehicle lists
  const [
    srcResult,
    fmResult,
    deptResult,
    spResult,
    storeSpResult,
    tradesResult,
    vMakesResult,
    vModelsResult,
    deptMakesResult,
  ] = await Promise.all([
      supabase
        .from("acquisition_sources")
        .select("id,name")
        .eq("store_id", deal.store_id)
        .order("name"),
      supabase
        .from("finance_managers")
        .select("id,name")
        .eq("store_id", deal.store_id)
        .eq("active", true)
        .order("name"),
      supabase
        .from("departments")
        .select("id,name")
        .eq("store_id", deal.store_id)
        .order("name"),
      supabase
        .from("deal_salespeople")
        .select("salesperson_id,share_percent")
        .eq("deal_id", deal.id),
      supabase
        .from("salespeople")
        .select("id,name")
        .eq("store_id", deal.store_id)
        .eq("active", true)
        .order("name"),
      supabase
        .from("trades")
        .select("id,vin,year,make,model,acv,allowance,exit_strategy")
        .eq("deal_id", deal.id),
      supabase
        .from("vehicle_makes")
        .select("id,name")
        .eq("active", true)
        .order("name"),
      supabase
        .from("vehicle_models")
        .select("id,name,make_id")
        .eq("active", true)
        .order("name"),
      supabase.from("department_makes").select("department_id,make"),
    ]);

  const acquisitionSources = (srcResult.data ?? []) as { id: string; name: string }[];
  const financeManagers = (fmResult.data ?? []) as { id: string; name: string }[];
  const departments = (deptResult.data ?? []) as DeptOption[];

  const dealSalespeople = (spResult.data ?? []) as SpRow[];
  let salespeople = (storeSpResult.data ?? []) as SalespersonOption[];

  // Keep inactive salespeople who are already on the deal selectable
  const missingIds = dealSalespeople
    .map((s) => s.salesperson_id)
    .filter((id) => !salespeople.some((sp) => sp.id === id));
  if (missingIds.length > 0) {
    const { data: missingSp } = await supabase
      .from("salespeople")
      .select("id,name")
      .in("id", missingIds);
    salespeople = [
      ...salespeople,
      ...((missingSp ?? []) as SalespersonOption[]),
    ];
  }

  const trades = (tradesResult.data ?? []) as TradeRow[];
  const vehicleMakes = (vMakesResult.data ?? []) as VehicleMakeRow[];
  const vehicleModels = (vModelsResult.data ?? []) as VehicleModelRow[];
  const departmentMakes = (deptMakesResult.data ?? []) as {
    department_id: string;
    make: string;
  }[];

  return (
    <UpdatePendingForm
      dealId={deal.id}
      dealStatus={deal.status}
      stockNumber={deal.stock_number}
      customerLastName={deal.customer_last_name ?? ""}
      vehicleYear={deal.vehicle_year}
      vehicleMake={deal.vehicle_make}
      vehicleModel={deal.vehicle_model}
      storeId={deal.store_id}
      storeName={storeName}
      initialSaleDate={deal.sale_date}
      initialDepartmentId={deal.department_id}
      departments={departments}
      initialVin={deal.vin}
      initialTrim={deal.trim}
      initialColor={deal.color}
      initialBodyStyle={deal.body_style}
      initialDrivetrain={deal.drivetrain}
      initialOdometer={deal.odometer}
      initialAcquisitionSource={deal.acquisition_source}
      initialFinanceType={deal.finance_type}
      initialFinanceManagerId={deal.finance_manager_id}
      initialFrontProfit={deal.front_profit}
      initialBackProfit={deal.back_profit}
      initialSalePrice={deal.sale_price}
      initialListPrice={deal.list_price}
      initialListPriceNa={deal.list_price_na ?? false}
      initialAge={deal.age}
      acquisitionSources={acquisitionSources}
      financeManagers={financeManagers}
      vehicleMakes={vehicleMakes}
      vehicleModels={vehicleModels}
      departmentMakes={departmentMakes}
      salespeople={salespeople}
      initialSplits={dealSalespeople}
      trades={trades}
    />
  );
}
