"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { profileMatchAuthUserId } from "@/lib/supabase/profile-match";
import { getEffectiveDealerGroupId } from "@/lib/dealer-group-context";

export async function signOut() {
  const supabase = createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/");
}

export async function createStore(formData: FormData) {
  const supabase = createSupabaseServerClient();
  const {
    data: { session }
  } = await supabase.auth.getSession();
  if (!session) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("dealer_group_id, role")
    .or(profileMatchAuthUserId(session.user.id))
    .maybeSingle();

  const dealerGroupId = await getEffectiveDealerGroupId(profile);
  if (!dealerGroupId) redirect("/app/dashboard");

  await supabase.from("stores").insert({
    dealer_group_id: dealerGroupId,
    name: String(formData.get("store_name")),
    is_demo: false
  });
  revalidatePath("/app/setup");
}

export async function createDepartment(formData: FormData) {
  const supabase = createSupabaseServerClient();
  await supabase.from("departments").insert({
    store_id: String(formData.get("store_id")),
    name: String(formData.get("department_name"))
  });
  revalidatePath("/app/setup");
}

export async function createSalesperson(formData: FormData) {
  const supabase = createSupabaseServerClient();
  await supabase.from("salespeople").insert({
    store_id: String(formData.get("store_id")),
    first_name: String(formData.get("first_name")),
    last_name: String(formData.get("last_name"))
  });
  revalidatePath("/app/setup");
}

export async function createSource(formData: FormData) {
  const supabase = createSupabaseServerClient();
  await supabase.from("acquisition_sources").insert({
    store_id: String(formData.get("store_id")),
    name: String(formData.get("source_name"))
  });
  revalidatePath("/app/setup");
}

export async function addCalendarDay(formData: FormData) {
  const supabase = createSupabaseServerClient();
  await supabase.from("store_calendar_days").upsert(
    {
      store_id: String(formData.get("store_id")),
      calendar_date: String(formData.get("calendar_date")),
      is_working_day: String(formData.get("is_working_day")) === "true"
    },
    { onConflict: "store_id,calendar_date" }
  );
  revalidatePath("/app/calendar");
  revalidatePath("/app/dashboard");
}

export async function createDeal(formData: FormData) {
  const supabase = createSupabaseServerClient();
  const {
    data: { session }
  } = await supabase.auth.getSession();
  if (!session) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id,dealer_group_id,role")
    .or(profileMatchAuthUserId(session.user.id))
    .maybeSingle();

  const dealerGroupId = await getEffectiveDealerGroupId(profile);
  if (!profile || !dealerGroupId) redirect("/app/dashboard");

  const front = Number(formData.get("front_profit") || 0);
  const back = Number(formData.get("back_profit") || 0);
  const sourceRaw = String(formData.get("acquisition_source_id") || "").trim();

  const payload = {
    dealer_group_id: dealerGroupId,
    store_id: String(formData.get("store_id")),
    department_id: String(formData.get("department_id")),
    status: String(formData.get("status") || "pending"),
    trade_status: String(formData.get("trade_status") || "no_trade"),
    finance: String(formData.get("finance") || "prime"),
    customer_last_name: String(formData.get("customer_last_name")),
    sale_date: String(formData.get("sale_date")),
    stock_number: String(formData.get("stock_number")),
    vehicle_year: Number(formData.get("vehicle_year")),
    vehicle_make: String(formData.get("vehicle_make")),
    vehicle_model: String(formData.get("vehicle_model")),
    vin: String(formData.get("vin") || "") || null,
    acquisition_source_id: sourceRaw ? sourceRaw : null,
    front_profit: Number.isFinite(front) ? front : 0,
    back_profit: Number.isFinite(back) ? back : 0,
    sale_price: Number(formData.get("sale_price") || 0),
    odometer: Number(formData.get("odometer") || 0),
    age: Number(formData.get("age") || 0),
    drivetrain: String(formData.get("drivetrain") || "") || null,
    body_style: String(formData.get("body_style") || "") || null,
    created_by: profile.id,
    updated_by: profile.id
  };

  const { data: deal, error } = await supabase.from("deals").insert(payload).select("id").single();
  if (error) {
    throw new Error(`Create deal failed: ${error.message}`);
  }

  const salespersonId = String(formData.get("salesperson_id") || "").trim();
  if (salespersonId) {
    await supabase.from("deal_salespeople").insert({
      deal_id: deal.id,
      salesperson_id: salespersonId,
      share_percent: Number(formData.get("share_percent") || 100)
    });
  }

  const note = String(formData.get("initial_note") || "").trim();
  if (note) {
    await supabase.from("deal_notes").insert({ deal_id: deal.id, author_id: profile.id, body: note });
  }

  revalidatePath("/app/deals");
  revalidatePath("/app/dashboard");
  redirect("/app/deals");
}
