"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { profileMatchAuthUserId } from "@/lib/supabase/profile-match";
import { assertStoreAccess } from "@/lib/store-access";
import { assertNotImpersonating } from "@/lib/impersonation";
import { canMutateAppData } from "@/lib/roles";
import { isPreOwnedDepartment } from "@/lib/buy-box/sale-books";

const UpdateSchema = z.object({
  dealId: z.string().uuid(),
  saleMmr: z.union([z.number().finite(), z.null()]),
  saleJd: z.union([z.number().finite(), z.null()]),
});

export type UpdateSaleBooksResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Manual override for locked sale-time MMR / JD on a closed pre-owned deal.
 * Auth + store access enforced server-side.
 */
export async function updateDealSaleBooks(
  input: unknown
): Promise<UpdateSaleBooksResult> {
  const parsed = UpdateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Invalid sale books update." };
  }

  const { dealId, saleMmr, saleJd } = parsed.data;

  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, error: "You must be signed in." };
  }

  try {
    await assertNotImpersonating();
  } catch {
    return {
      ok: false,
      error: "View only access — changes are not allowed while viewing as another user",
    };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, dealer_group_id, role, status")
    .or(profileMatchAuthUserId(user.id))
    .maybeSingle();

  if (!profile || profile.status !== "active" || !canMutateAppData(profile.role)) {
    return { ok: false, error: "You do not have permission to edit deals." };
  }

  const { data: dealData, error: dealError } = await supabase
    .from("deals")
    .select("id, status, store_id, department_id")
    .eq("id", dealId)
    .maybeSingle();

  if (dealError || !dealData) {
    return { ok: false, error: "Deal not found." };
  }

  const deal = dealData as {
    id: string;
    status: string;
    store_id: string;
    department_id: string;
  };

  if (!(await assertStoreAccess(supabase, profile, deal.store_id))) {
    return { ok: false, error: "You do not have access to this store." };
  }

  if (deal.status !== "closed") {
    return {
      ok: false,
      error: "Sale books can only be overridden on closed deals.",
    };
  }

  const { data: dept } = await supabase
    .from("departments")
    .select("name")
    .eq("id", deal.department_id)
    .maybeSingle();

  const deptName = (dept as { name: string } | null)?.name ?? "";
  if (!isPreOwnedDepartment(deptName)) {
    return {
      ok: false,
      error: "Sale books apply to pre-owned deals only.",
    };
  }

  const { error: updateError } = await supabase
    .from("deals")
    .update({
      sale_mmr: saleMmr,
      sale_jd: saleJd,
      sale_books_at: new Date().toISOString(),
      sale_books_source: "manual",
      sale_books_manual: true,
    })
    .eq("id", deal.id)
    .eq("status", "closed");

  if (updateError) {
    return { ok: false, error: updateError.message };
  }

  revalidatePath("/app/buy-box");
  revalidatePath(`/app/deals/${deal.id}/edit`);
  revalidatePath("/app/deals");

  return { ok: true };
}
