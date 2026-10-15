"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { profileMatchAuthUserId } from "@/lib/supabase/profile-match";
import { assertStoreAccess } from "@/lib/store-access";
import { isAppViewOnly } from "@/lib/impersonation";
import { isPlatformStaff } from "@/lib/roles";
import {
  DEPARTMENT_NAME_MAX,
  departmentNameKey,
  normalizeDepartmentName,
  renameBehaviorChange,
} from "@/lib/departments/name-rules";

export type ManagedDepartment = {
  id: string;
  name: string;
  store_id: string;
  rolls_up_to_department_id: string | null;
  is_active: boolean;
};

export type DepartmentActionResult =
  | { ok: true; department: ManagedDepartment }
  | { ok: false; error: string };

const DEPT_COLUMNS = "id,name,store_id,rolls_up_to_department_id,is_active";

const uuid = z.string().uuid();
const nameSchema = z
  .string()
  .transform(normalizeDepartmentName)
  .pipe(
    z
      .string()
      .min(1, "Department name is required.")
      .max(DEPARTMENT_NAME_MAX, `Keep the name under ${DEPARTMENT_NAME_MAX} characters.`)
  );

const createSchema = z.object({
  storeId: uuid,
  name: nameSchema,
  rollsUpToDepartmentId: uuid.nullable(),
});

const updateSchema = z.object({
  departmentId: uuid,
  name: nameSchema,
  rollsUpToDepartmentId: uuid.nullable(),
});

const activeSchema = z.object({
  departmentId: uuid,
  active: z.boolean(),
});

type Ctx = { supabase: SupabaseClient };

async function requireDepartmentManager(storeId: string): Promise<Ctx | { error: string }> {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, dealer_group_id, role")
    .or(profileMatchAuthUserId(user.id))
    .maybeSingle();

  if (!profile || !isPlatformStaff(profile.role)) {
    return { error: "Only platform and owner admins can manage departments." };
  }
  if (await isAppViewOnly(profile.role)) {
    return { error: "View only — changes are not allowed." };
  }
  if (!(await assertStoreAccess(supabase, profile, storeId))) {
    return { error: "That store is not available." };
  }
  return { supabase };
}

async function loadStoreDepartments(
  supabase: SupabaseClient,
  storeId: string
): Promise<ManagedDepartment[] | { error: string }> {
  const { data, error } = await supabase
    .from("departments")
    .select(DEPT_COLUMNS)
    .eq("store_id", storeId);
  if (error) return { error: error.message };
  return (data ?? []) as ManagedDepartment[];
}

async function loadDepartmentStoreId(departmentId: string): Promise<string | null> {
  const supabase = createSupabaseServerClient();
  const { data } = await supabase
    .from("departments")
    .select("store_id")
    .eq("id", departmentId)
    .maybeSingle();
  return (data as { store_id: string } | null)?.store_id ?? null;
}

function rollupError(
  self: { id: string | null },
  parentId: string | null,
  storeDepts: ManagedDepartment[]
): string | null {
  if (!parentId) return null;
  if (self.id && parentId === self.id) return "A department cannot roll up to itself.";
  const parent = storeDepts.find((d) => d.id === parentId);
  if (!parent) return "Pick a parent department from this store.";
  if (parent.rolls_up_to_department_id) {
    return "Rollups are one level only — pick a department that doesn't roll up itself.";
  }
  if (!parent.is_active) return "The parent department is inactive.";
  if (self.id && storeDepts.some((d) => d.rolls_up_to_department_id === self.id)) {
    return "Other departments roll up to this one, so it can't roll up to another department.";
  }
  return null;
}

function friendlyDbError(error: { code?: string; message: string }): string {
  if (error.code === "23505") return "A department with that name already exists in this store.";
  if (error.code === "42501" || /row-level security/i.test(error.message)) {
    return "Your account can't change departments right now. Owner admins must be signed in with two-factor authentication.";
  }
  return error.message;
}

function revalidateDepartmentViews() {
  revalidatePath("/app", "layout");
}

export async function createDepartment(input: unknown): Promise<DepartmentActionResult> {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const { storeId, name, rollsUpToDepartmentId } = parsed.data;

  const ctx = await requireDepartmentManager(storeId);
  if ("error" in ctx) return { ok: false, error: ctx.error };

  const storeDepts = await loadStoreDepartments(ctx.supabase, storeId);
  if ("error" in storeDepts) return { ok: false, error: storeDepts.error };

  if (storeDepts.some((d) => departmentNameKey(d.name) === departmentNameKey(name))) {
    return { ok: false, error: "A department with that name already exists in this store." };
  }
  const rollup = rollupError({ id: null }, rollsUpToDepartmentId, storeDepts);
  if (rollup) return { ok: false, error: rollup };

  const { data, error } = await ctx.supabase
    .from("departments")
    .insert({
      store_id: storeId,
      name,
      rolls_up_to_department_id: rollsUpToDepartmentId,
      is_active: true,
    })
    .select(DEPT_COLUMNS)
    .single();

  if (error || !data) {
    return { ok: false, error: error ? friendlyDbError(error) : "Create failed." };
  }

  revalidateDepartmentViews();
  return { ok: true, department: data as ManagedDepartment };
}

export async function updateDepartment(input: unknown): Promise<DepartmentActionResult> {
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const { departmentId, name, rollsUpToDepartmentId } = parsed.data;

  const storeId = await loadDepartmentStoreId(departmentId);
  if (!storeId) return { ok: false, error: "Department not found." };

  const ctx = await requireDepartmentManager(storeId);
  if ("error" in ctx) return { ok: false, error: ctx.error };

  const storeDepts = await loadStoreDepartments(ctx.supabase, storeId);
  if ("error" in storeDepts) return { ok: false, error: storeDepts.error };

  const current = storeDepts.find((d) => d.id === departmentId);
  if (!current) return { ok: false, error: "Department not found." };

  if (
    storeDepts.some(
      (d) => d.id !== departmentId && departmentNameKey(d.name) === departmentNameKey(name)
    )
  ) {
    return { ok: false, error: "A department with that name already exists in this store." };
  }

  const behaviorChange = renameBehaviorChange(current.name, name);
  if (behaviorChange) return { ok: false, error: behaviorChange };

  const rollup = rollupError({ id: departmentId }, rollsUpToDepartmentId, storeDepts);
  if (rollup) return { ok: false, error: rollup };

  const { data, error } = await ctx.supabase
    .from("departments")
    .update({ name, rolls_up_to_department_id: rollsUpToDepartmentId })
    .eq("id", departmentId)
    .eq("store_id", storeId)
    .select(DEPT_COLUMNS)
    .single();

  if (error || !data) {
    return { ok: false, error: error ? friendlyDbError(error) : "Update failed." };
  }

  revalidateDepartmentViews();
  return { ok: true, department: data as ManagedDepartment };
}

export async function setDepartmentActive(input: unknown): Promise<DepartmentActionResult> {
  const parsed = activeSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const { departmentId, active } = parsed.data;

  const storeId = await loadDepartmentStoreId(departmentId);
  if (!storeId) return { ok: false, error: "Department not found." };

  const ctx = await requireDepartmentManager(storeId);
  if ("error" in ctx) return { ok: false, error: ctx.error };

  const storeDepts = await loadStoreDepartments(ctx.supabase, storeId);
  if ("error" in storeDepts) return { ok: false, error: storeDepts.error };

  const current = storeDepts.find((d) => d.id === departmentId);
  if (!current) return { ok: false, error: "Department not found." };

  if (!active && storeDepts.some((d) => d.rolls_up_to_department_id === departmentId && d.is_active)) {
    return {
      ok: false,
      error: "Deactivate or move the departments that roll up to this one first.",
    };
  }
  if (active && current.rolls_up_to_department_id) {
    const parent = storeDepts.find((d) => d.id === current.rolls_up_to_department_id);
    if (parent && !parent.is_active) {
      return { ok: false, error: `Reactivate ${parent.name} first — this department rolls up to it.` };
    }
  }

  const { data, error } = await ctx.supabase
    .from("departments")
    .update({ is_active: active })
    .eq("id", departmentId)
    .eq("store_id", storeId)
    .select(DEPT_COLUMNS)
    .single();

  if (error || !data) {
    return { ok: false, error: error ? friendlyDbError(error) : "Update failed." };
  }

  revalidateDepartmentViews();
  return { ok: true, department: data as ManagedDepartment };
}
