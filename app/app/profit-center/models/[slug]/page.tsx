import { redirect } from "next/navigation";

/**
 * Pretty model URL → cohort page.
 * Query params (make, model, preset, store, department) are the source of truth.
 */
export default function ProfitCenterModelPage({
  params,
  searchParams,
}: {
  params: { slug: string };
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const q = new URLSearchParams();
  q.set("focus", "model");
  for (const key of ["make", "model", "preset", "store", "department", "value"] as const) {
    const v = searchParams[key];
    if (typeof v === "string" && v) q.set(key, v);
  }
  if (!q.has("make") && !q.has("model") && !q.has("value")) {
    // Best-effort: slug alone is not enough; send to PC
    redirect("/app/profit-center");
  }
  // Keep slug out of logic; cohort uses make/model
  void params.slug;
  redirect(`/app/profit-center/cohort?${q.toString()}`);
}
