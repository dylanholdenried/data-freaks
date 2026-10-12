"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { profileMatchAuthUserId } from "@/lib/supabase/profile-match";
import { assertNotImpersonating } from "@/lib/impersonation";
import { getEffectiveEntitlements } from "@/lib/entitlements";
import { canAccessInventoryCommand } from "@/lib/plan-access";
import { getAccessibleStores } from "@/lib/store-access";
import { isPlatformStaff, isStoreViewer } from "@/lib/roles";
import { normStk, type SoldDeal } from "@/lib/inventory-command/acq-source";
import {
  INV_UNIT_DETAIL_SELECT,
  isoDaysBefore,
  loadRecentMovements,
  loadSoldDeals,
  loadStoreSourceContext,
  SOLD_LOOKBACK_DAYS,
  toDetailUnits,
} from "@/lib/inventory-command/inventory-tab-data";
import type { InvMovement, InvUnitDetailRow } from "@/lib/inventory-command/types";

type Fail = { ok: false; error: string };

async function loadViewer() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, dealer_group_id, role, status")
    .or(profileMatchAuthUserId(user.id))
    .maybeSingle();
  if (!profile || profile.status !== "active") {
    return { ok: false as const, error: "Profile inactive" };
  }
  return { ok: true as const, supabase, user, profile };
}

/** Viewer who may read Inventory Command for a store. */
async function requireReader(storeId?: string) {
  const ctx = await loadViewer();
  if (!ctx.ok) return ctx;
  if (isStoreViewer(ctx.profile.role)) {
    return { ok: false as const, error: "Inventory Command is not available for view-only users." };
  }
  const entitlements = await getEffectiveEntitlements(ctx.supabase, ctx.profile);
  if (!canAccessInventoryCommand(entitlements.plan)) {
    return { ok: false as const, error: "Inventory Command requires the Analyze plan." };
  }
  const stores = await getAccessibleStores(ctx.supabase, ctx.profile);
  if (storeId && !stores.some((s) => s.id === storeId)) {
    return { ok: false as const, error: "No access to this store." };
  }
  return { ...ctx, stores };
}

export async function setInventoryAcqSourceAction(input: {
  storeId: string;
  stks: string[];
  /** null reverts the units to the stock-number rule. */
  source: string | null;
}): Promise<{ ok: true; updated: number } | Fail> {
  try {
    await assertNotImpersonating();
    const ctx = await requireReader(input.storeId);
    if (!ctx.ok) return ctx;
    if (!isPlatformStaff(ctx.profile.role)) {
      return { ok: false, error: "Only platform admins can tag acquisition sources." };
    }

    const stks = [...new Set(input.stks.map(normStk).filter(Boolean))];
    if (stks.length === 0) return { ok: false, error: "No stock numbers selected." };
    if (stks.length > 1000) return { ok: false, error: "Tag at most 1000 units at a time." };

    const { supabase, user } = ctx;

    if (input.source == null) {
      const { error } = await supabase
        .from("inv_acq_tags")
        .delete()
        .eq("store_id", input.storeId)
        .in("stk", stks);
      if (error) return { ok: false, error: error.message };
    } else {
      const contexts = await loadStoreSourceContext(supabase, [input.storeId]);
      const allowed = contexts[input.storeId]?.sourceNames ?? [];
      const source = allowed.find(
        (n) => n.trim().toLowerCase() === input.source!.trim().toLowerCase()
      );
      if (!source) {
        return { ok: false, error: `"${input.source}" is not in this store's acquisition sources.` };
      }
      const now = new Date().toISOString();
      const { error } = await supabase.from("inv_acq_tags").upsert(
        stks.map((stk) => ({
          store_id: input.storeId,
          stk,
          source,
          set_by: user.id,
          set_at: now,
        })),
        { onConflict: "store_id,stk" }
      );
      if (error) return { ok: false, error: error.message };
    }

    revalidatePath("/app/inventory-command");
    return { ok: true, updated: stks.length };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Tagging failed" };
  }
}

/** Full export row for the unit drawer (kept out of the page payload). */
export async function getInventoryUnitRawAction(input: {
  storeId: string;
  snapshotDate: string;
  stk: string;
}): Promise<{ ok: true; raw: Record<string, string | number | boolean> | null } | Fail> {
  try {
    const ctx = await requireReader(input.storeId);
    if (!ctx.ok) return ctx;
    const { data: snap } = await ctx.supabase
      .from("inv_snapshots")
      .select("id")
      .eq("store_id", input.storeId)
      .eq("snapshot_date", input.snapshotDate)
      .maybeSingle();
    if (!snap) return { ok: true, raw: null };
    const { data, error } = await ctx.supabase
      .from("inv_units")
      .select("raw")
      .eq("snapshot_id", snap.id)
      .eq("stk", input.stk)
      .maybeSingle();
    if (error) return { ok: false, error: error.message };
    return { ok: true, raw: (data?.raw as Record<string, string | number | boolean> | null) ?? null };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not load unit" };
  }
}

export type AllStoresHealthPayload = {
  stores: {
    id: string;
    name: string;
    snapshotDate: string;
    sourceNames: string[];
    tags: { stk: string; source: string }[];
    units: InvUnitDetailRow[];
  }[];
  movements: InvMovement[];
  sold: SoldDeal[];
};

export async function getAllStoresSourceHealthAction(): Promise<
  { ok: true; data: AllStoresHealthPayload } | Fail
> {
  try {
    const ctx = await requireReader();
    if (!ctx.ok) return ctx;
    const { supabase, stores } = ctx;
    const storeIds = stores.map((s) => s.id);
    if (storeIds.length === 0) return { ok: true, data: { stores: [], movements: [], sold: [] } };

    const { data: snaps } = await supabase
      .from("inv_snapshots")
      .select("id, store_id, snapshot_date")
      .in("store_id", storeIds)
      .order("snapshot_date", { ascending: false });

    const latest = new Map<string, { id: string; snapshot_date: string }>();
    for (const s of snaps ?? []) {
      if (!latest.has(s.store_id)) latest.set(s.store_id, { id: s.id, snapshot_date: s.snapshot_date });
    }
    const withSnap = stores.filter((s) => latest.has(s.id));
    if (withSnap.length === 0) return { ok: true, data: { stores: [], movements: [], sold: [] } };

    const contexts = await loadStoreSourceContext(
      supabase,
      withSnap.map((s) => s.id)
    );

    const unitsByStore = await Promise.all(
      withSnap.map(async (s) => {
        const { data } = await supabase
          .from("inv_units")
          .select(INV_UNIT_DETAIL_SELECT)
          .eq("snapshot_id", latest.get(s.id)!.id);
        return toDetailUnits((data ?? []) as unknown as Record<string, unknown>[]);
      })
    );

    const earliest = withSnap
      .map((s) => latest.get(s.id)!.snapshot_date)
      .sort()[0]!;

    const [movements, sold] = await Promise.all([
      loadRecentMovements(
        supabase,
        withSnap.map((s) => s.id),
        isoDaysBefore(earliest, 30)
      ),
      loadSoldDeals(
        supabase,
        withSnap.flatMap((s) => contexts[s.id]?.preOwnedDeptIds ?? []),
        isoDaysBefore(earliest, SOLD_LOOKBACK_DAYS)
      ),
    ]);

    return {
      ok: true,
      data: {
        stores: withSnap.map((s, i) => ({
          id: s.id,
          name: s.name,
          snapshotDate: latest.get(s.id)!.snapshot_date,
          sourceNames: contexts[s.id]?.sourceNames ?? [],
          tags: contexts[s.id]?.tags ?? [],
          units: unitsByStore[i] ?? [],
        })),
        movements,
        sold,
      },
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not load all stores" };
  }
}
