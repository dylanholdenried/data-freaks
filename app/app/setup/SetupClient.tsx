"use client";

import { useMemo, useState, useTransition } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CheckCircle2, PlusCircle, Building2, UserMinus, UserCheck } from "lucide-react";
import { updateOnboardingChecklist } from "@/app/app/onboarding-actions";
import { isRolledUpDepartment } from "@/lib/departments/rollup";

// ── Types ─────────────────────────────────────────────────────────────────────

type StoreRow = { id: string; name: string };
type DeptRow = {
  id: string;
  name: string;
  store_id: string;
  rolls_up_to_department_id: string | null;
};
type PersonRow = { id: string; name: string; store_id: string; active: boolean };
type SourceRow = { id: string; name: string; store_id: string; active: boolean };
type GoalRow = { department_id: string; year: number; month: number; volume_goal: number };

interface Props {
  stores: StoreRow[];
  departments: DeptRow[];
  salespeople: PersonRow[];
  acquisitionSources: SourceRow[];
  financeManagers: PersonRow[];
  initialGoals: GoalRow[];
  initialYear: number;
  initialMonth: number;
  onboardingChecklist?: {
    salespeople?: boolean;
    finance_managers?: boolean;
    acquisition_sources?: boolean;
    goals?: boolean;
  };
  showOnboardingChecklist?: boolean;
  /** Impersonation / store_viewer — browse only, no writes. */
  readOnly?: boolean;
}

// ── Style constants (matches NewDealForm) ─────────────────────────────────────

const SEL =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm " +
  "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 " +
  "disabled:cursor-not-allowed disabled:opacity-60";

const LBL = "text-xs font-medium text-muted-foreground";

// ── Month names ───────────────────────────────────────────────────────────────

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// ── GoalsSection ──────────────────────────────────────────────────────────────

interface GoalsSectionProps {
  stores: StoreRow[];
  departments: DeptRow[];
  initialGoals: GoalRow[];
  initialYear: number;
  initialMonth: number;
  readOnly?: boolean;
}

function GoalsSection({
  stores,
  departments,
  initialGoals,
  initialYear,
  initialMonth,
  readOnly = false,
}: GoalsSectionProps) {
  const goalDepartments = useMemo(
    () => departments.filter((d) => !isRolledUpDepartment(d)),
    [departments]
  );
  const [year, setYear] = useState(initialYear);
  const [month, setMonth] = useState(initialMonth);
  const [goals, setGoals] = useState<GoalRow[]>(initialGoals);
  const [loadingMonth, setLoadingMonth] = useState(false);
  const [saving, setSaving] = useState(false);
  const [banner, setBanner] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);

  // Draft values keyed by department_id
  const [drafts, setDrafts] = useState<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    for (const g of initialGoals) {
      map[g.department_id] = String(g.volume_goal);
    }
    return map;
  });

  async function loadGoals(y: number, m: number) {
    setLoadingMonth(true);
    setBanner(null);
    const supabase = createSupabaseBrowserClient();
    const deptIds = goalDepartments.map((d) => d.id);
    if (deptIds.length === 0) {
      setGoals([]);
      setDrafts({});
      setLoadingMonth(false);
      return;
    }
    const { data, error } = await supabase
      .from("department_goals")
      .select("department_id,year,month,volume_goal")
      .in("department_id", deptIds)
      .eq("year", y)
      .eq("month", m);
    if (error) {
      setBanner({ kind: "err", msg: `Failed to load goals: ${error.message}` });
    } else {
      const rows = (data ?? []) as GoalRow[];
      setGoals(rows);
      const map: Record<string, string> = {};
      for (const g of rows) {
        map[g.department_id] = String(g.volume_goal);
      }
      setDrafts(map);
    }
    setLoadingMonth(false);
  }

  function handleYearChange(y: number) {
    setYear(y);
    loadGoals(y, month);
  }

  function handleMonthChange(m: number) {
    setMonth(m);
    loadGoals(year, m);
  }

  async function handleSave() {
    if (readOnly) {
      setBanner({ kind: "err", msg: "View only — changes are not allowed." });
      return;
    }
    setSaving(true);
    setBanner(null);

    const rows = goalDepartments
      .map((d) => {
        const raw = drafts[d.id] ?? "";
        const val = parseInt(raw, 10);
        return { department_id: d.id, year, month, volume_goal: isNaN(val) ? 0 : val };
      })
      .filter((r) => r.volume_goal > 0);

    if (rows.length === 0) {
      setBanner({ kind: "err", msg: "Enter at least one goal before saving." });
      setSaving(false);
      return;
    }

    const prevGoals = goals;
    const prevDrafts = { ...drafts };

    // Optimistic update
    setGoals(rows.map((r) => ({ ...r, year, month })));

    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase
      .from("department_goals")
      .upsert(rows, { onConflict: "department_id,year,month" });

    if (error) {
      // Revert
      setGoals(prevGoals);
      setDrafts(prevDrafts);
      setBanner({ kind: "err", msg: `Save failed: ${error.message}` });
    } else {
      setBanner({ kind: "ok", msg: `Goals saved for ${MONTH_NAMES[month - 1]} ${year}.` });
    }
    setSaving(false);
  }

  // Group parent departments by store (rolled-up fleet desks share the parent goal)
  const deptsByStore = new Map<string, DeptRow[]>();
  for (const d of goalDepartments) {
    const arr = deptsByStore.get(d.store_id) ?? [];
    arr.push(d);
    deptsByStore.set(d.store_id, arr);
  }

  const nowYear = new Date().getFullYear();
  const years = Array.from(
    new Set([nowYear - 1, nowYear, nowYear + 1, initialYear, year])
  ).sort((a, b) => a - b);

  return (
    <Card id="goals" className="app-panel scroll-mt-24 border-border shadow-none">
      <CardHeader className="border-border">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="text-lg">Monthly Department Goals</CardTitle>
          <div className="flex items-center gap-2">
            <select
              value={month}
              onChange={(e) => handleMonthChange(Number(e.target.value))}
              disabled={loadingMonth}
              className="h-8 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {MONTH_NAMES.map((name, i) => (
                <option key={i + 1} value={i + 1}>
                  {name}
                </option>
              ))}
            </select>
            <select
              value={year}
              onChange={(e) => handleYearChange(Number(e.target.value))}
              disabled={loadingMonth}
              className="h-8 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 pt-4">
        {banner && (
          <div
            className={`flex items-start gap-3 rounded-xl border p-4 ${
              banner.kind === "ok"
                ? "border-green-200 bg-green-50 text-green-800"
                : "border-[color-mix(in_srgb,var(--da-red)_35%,transparent)] bg-[color-mix(in_srgb,var(--da-red)_12%,transparent)] text-[var(--da-red)]"
            }`}
          >
            {banner.kind === "ok" && <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />}
            <p className="text-sm">{banner.msg}</p>
            <button
              type="button"
              onClick={() => setBanner(null)}
              className="ml-auto shrink-0 text-xs underline opacity-60 hover:opacity-100"
            >
              ✕
            </button>
          </div>
        )}

        {goalDepartments.length === 0 ? (
          <p className="text-sm text-muted-foreground">No departments configured yet.</p>
        ) : (
          <div className="space-y-6">
            {stores.map((store) => {
              const depts = deptsByStore.get(store.id) ?? [];
              if (depts.length === 0) return null;
              return (
                <div key={store.id}>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {store.name}
                  </p>
                  <div className="space-y-2">
                    {depts.map((dept) => (
                      <div key={dept.id} className="flex min-w-0 flex-wrap items-center gap-3">
                        <label className="min-w-0 flex-1 basis-40 text-sm text-foreground sm:flex-none sm:basis-auto sm:w-40 sm:shrink-0">
                          {dept.name}
                          {departments.some(
                            (d) => d.rolls_up_to_department_id === dept.id
                          ) ? (
                            <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                              includes fleet
                            </span>
                          ) : null}
                        </label>
                        <Input
                          type="number"
                          min={0}
                          placeholder="0"
                          value={drafts[dept.id] ?? ""}
                          onChange={(e) =>
                            setDrafts((prev) => ({ ...prev, [dept.id]: e.target.value }))
                          }
                          disabled={readOnly}
                          readOnly={readOnly}
                          className="w-28 shrink-0"
                        />
                        <span className="text-xs text-muted-foreground">units</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {goalDepartments.length > 0 && !readOnly ? (
          <div className="flex justify-end pt-2">
            <Button onClick={handleSave} disabled={saving || loadingMonth} className="min-w-[120px]">
              {saving ? "Saving…" : "Save Goals"}
            </Button>
          </div>
        ) : null}
        {goalDepartments.length > 0 && readOnly ? (
          <p className="pt-2 text-xs text-muted-foreground">View only — goals cannot be changed.</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

// ── RosterSection ─────────────────────────────────────────────────────────────

interface RosterSectionProps {
  title: string;
  table: string;
  stores: StoreRow[];
  initialItems: PersonRow[];
  emptyMessage?: string;
  hasActive?: boolean; // false for acquisition_sources (no active column)
  readOnly?: boolean;
}

function RosterSection({
  title,
  table,
  stores,
  initialItems,
  emptyMessage,
  hasActive = true,
  readOnly = false,
}: RosterSectionProps) {
  const [items, setItems] = useState<PersonRow[]>(initialItems);
  const [addName, setAddName] = useState("");
  const [addStoreId, setAddStoreId] = useState(stores.length === 1 ? stores[0].id : "");
  const [adding, setSaving] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [banner, setBanner] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);

  const storeById = new Map(stores.map((s) => [s.id, s.name]));

  async function handleAdd() {
    if (readOnly) {
      setBanner({ kind: "err", msg: "View only — changes are not allowed." });
      return;
    }
    const name = addName.trim();
    if (!name || !addStoreId) return;
    setSaving(true);
    setBanner(null);

    const supabase = createSupabaseBrowserClient();
    const insertPayload: Record<string, unknown> = { name, store_id: addStoreId };
    if (hasActive) insertPayload.active = true;

    const { data, error } = await supabase
      .from(table)
      .insert(insertPayload)
      .select("id,name,store_id" + (hasActive ? ",active" : ""))
      .single();

    if (error) {
      setBanner({ kind: "err", msg: `Add failed: ${error.message}` });
    } else {
      const newItem = data as unknown as PersonRow;
      setItems((prev) => [...prev, newItem].sort((a, b) => a.name.localeCompare(b.name)));
      setAddName("");
      if (stores.length > 1) setAddStoreId("");
      setBanner({ kind: "ok", msg: `${name} added to ${storeById.get(addStoreId) ?? "store"}.` });
    }
    setSaving(false);
  }

  async function handleToggleActive(item: PersonRow) {
    if (readOnly || !hasActive) return;
    const next = !item.active;
    setTogglingId(item.id);
    setBanner(null);

    // Optimistic
    setItems((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, active: next } : i))
    );

    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase
      .from(table)
      .update({ active: next })
      .eq("id", item.id);

    if (error) {
      // Revert
      setItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, active: item.active } : i))
      );
      setBanner({ kind: "err", msg: `Update failed: ${error.message}` });
    } else {
      setBanner({
        kind: "ok",
        msg: `${item.name} ${next ? "reactivated" : "deactivated"}.`,
      });
    }
    setTogglingId(null);
  }

  // Group by store for display
  const byStore = new Map<string, PersonRow[]>();
  for (const item of items) {
    const arr = byStore.get(item.store_id) ?? [];
    arr.push(item);
    byStore.set(item.store_id, arr);
  }

  const activeCount = hasActive ? items.filter((i) => i.active).length : items.length;

  return (
    <Card className="app-panel border-border shadow-none">
      <CardHeader className="border-border">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">{title}</CardTitle>
          <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">
            {activeCount} active
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 pt-4">
        {banner && (
          <div
            className={`flex items-start gap-3 rounded-xl border p-3 ${
              banner.kind === "ok"
                ? "border-green-200 bg-green-50 text-green-800"
                : "border-[color-mix(in_srgb,var(--da-red)_35%,transparent)] bg-[color-mix(in_srgb,var(--da-red)_12%,transparent)] text-[var(--da-red)]"
            }`}
          >
            {banner.kind === "ok" && <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />}
            <p className="text-sm">{banner.msg}</p>
            <button
              type="button"
              onClick={() => setBanner(null)}
              className="ml-auto shrink-0 text-xs underline opacity-60 hover:opacity-100"
            >
              ✕
            </button>
          </div>
        )}

        {/* Add form */}
        {!readOnly ? (
        <div className="flex flex-wrap items-end gap-2">
          {stores.length > 1 && (
            <div className="space-y-1">
              <label className={LBL}>Store</label>
              <select
                value={addStoreId}
                onChange={(e) => setAddStoreId(e.target.value)}
                className="h-10 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">Select store</option>
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="min-w-[200px] flex-1 space-y-1">
            <label className={LBL}>Name</label>
            <Input
              value={addName}
              onChange={(e) => setAddName(e.target.value)}
              placeholder={`Add ${title.toLowerCase()}…`}
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            />
          </div>
          <Button
            onClick={handleAdd}
            disabled={adding || !addName.trim() || !addStoreId}
            className="shrink-0"
          >
            <PlusCircle className="mr-1.5 h-4 w-4" />
            {adding ? "Adding…" : "Add"}
          </Button>
        </div>
        ) : (
          <p className="text-xs text-muted-foreground">View only — roster cannot be changed.</p>
        )}

        {/* List */}
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {emptyMessage ?? `No ${title.toLowerCase()} yet. Add one above.`}
          </p>
        ) : (
          <div className="space-y-4">
            {stores.map((store) => {
              const storeItems = byStore.get(store.id) ?? [];
              if (storeItems.length === 0) return null;
              return (
                <div key={store.id}>
                  {stores.length > 1 && (
                    <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {store.name}
                    </p>
                  )}
                  <div className="divide-y divide-border rounded-xl border border-border">
                    {storeItems.map((item) => {
                      const isActive = !hasActive || item.active;
                      return (
                        <div
                          key={item.id}
                          className="flex items-center justify-between gap-3 px-4 py-2.5"
                        >
                          <span
                            className={`text-sm font-medium ${
                              isActive ? "text-foreground" : "text-muted-foreground line-through"
                            }`}
                          >
                            {item.name}
                          </span>
                          {hasActive && !readOnly && (
                            <button
                              type="button"
                              disabled={togglingId === item.id}
                              onClick={() => handleToggleActive(item)}
                              className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50 ${
                                isActive
                                  ? "text-muted-foreground hover:bg-[color-mix(in_srgb,var(--da-red)_12%,transparent)] hover:text-red-600"
                                  : "text-emerald-600 hover:bg-[color-mix(in_srgb,var(--da-green)_12%,transparent)]"
                              }`}
                            >
                              {isActive ? (
                                <>
                                  <UserMinus className="h-3.5 w-3.5" />
                                  Deactivate
                                </>
                              ) : (
                                <>
                                  <UserCheck className="h-3.5 w-3.5" />
                                  Reactivate
                                </>
                              )}
                            </button>
                          )}
                          {hasActive && readOnly && !isActive ? (
                            <span className="text-xs text-muted-foreground">Inactive</span>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Main SetupClient ──────────────────────────────────────────────────────────

export default function SetupClient({
  stores,
  departments,
  salespeople,
  acquisitionSources,
  financeManagers,
  initialGoals,
  initialYear,
  initialMonth,
  onboardingChecklist = {},
  showOnboardingChecklist = false,
  readOnly = false,
}: Props) {
  const [pending, startTransition] = useTransition();
  const inferred = useMemo(
    () => ({
      salespeople: salespeople.some((s) => s.active !== false) || Boolean(onboardingChecklist.salespeople),
      finance_managers:
        financeManagers.some((s) => s.active !== false) || Boolean(onboardingChecklist.finance_managers),
      acquisition_sources:
        acquisitionSources.length > 0 || Boolean(onboardingChecklist.acquisition_sources),
      goals: initialGoals.length > 0 || Boolean(onboardingChecklist.goals),
    }),
    [salespeople, financeManagers, acquisitionSources, initialGoals, onboardingChecklist]
  );

  const checklistItems = [
    { key: "salespeople" as const, label: "Add salespeople" },
    { key: "finance_managers" as const, label: "Add finance managers" },
    { key: "acquisition_sources" as const, label: "Add acquisition sources" },
    { key: "goals" as const, label: "Set monthly department goals" },
  ];

  const allDone = checklistItems.every((item) => inferred[item.key]);

  function markDone(key: (typeof checklistItems)[number]["key"]) {
    if (readOnly) return;
    startTransition(async () => {
      await updateOnboardingChecklist({ [key]: true });
    });
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <section className="app-panel p-5">
        <p className="app-kicker">Administration</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-foreground">Setup & Config</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {readOnly
            ? "Browse stores, goals, and roster settings. Changes are disabled in this session."
            : "Manage stores, monthly goals, salespeople, acquisition sources, and finance managers."}
        </p>
      </section>

      {showOnboardingChecklist && !allDone && !readOnly ? (
        <Card className="border-[color-mix(in_srgb,var(--da-blue)_35%,transparent)] bg-[color-mix(in_srgb,var(--da-blue)_10%,transparent)] shadow-none">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-foreground">Finish group setup</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {checklistItems.map((item) => {
              const done = inferred[item.key];
              return (
                <div
                  key={item.key}
                  className="flex items-center justify-between gap-3 rounded-lg border border-[color-mix(in_srgb,var(--da-blue)_25%,transparent)] bg-card px-3 py-2"
                >
                  <div className="flex items-center gap-2 text-sm">
                    <CheckCircle2
                      className={`h-4 w-4 ${done ? "text-emerald-500" : "text-muted-foreground"}`}
                    />
                    <span className={done ? "text-muted-foreground line-through" : "text-foreground"}>
                      {item.label}
                    </span>
                  </div>
                  {!done ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={pending}
                      onClick={() => markDone(item.key)}
                    >
                      Mark done
                    </Button>
                  ) : null}
                </div>
              );
            })}
          </CardContent>
        </Card>
      ) : null}

      {/* Section 1: Stores (read-only) */}
      <Card className="app-panel border-border shadow-none">
        <CardHeader className="border-border">
          <CardTitle className="text-lg">Stores</CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          {stores.length === 0 ? (
            <p className="text-sm text-muted-foreground">No stores configured. Contact support to add a store.</p>
          ) : (
            <div className="divide-y divide-border rounded-xl border border-border">
              {stores.map((store) => (
                <div key={store.id} className="flex items-center gap-3 px-4 py-3">
                  <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="text-sm font-medium text-foreground">{store.name}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Section 2: Monthly Department Goals */}
      <GoalsSection
        stores={stores}
        departments={departments}
        initialGoals={initialGoals}
        initialYear={initialYear}
        initialMonth={initialMonth}
        readOnly={readOnly}
      />

      {/* Section 3: Salespeople */}
      <RosterSection
        title="Salespeople"
        table="salespeople"
        stores={stores}
        initialItems={salespeople}
        hasActive
        readOnly={readOnly}
      />

      {/* Section 4: Acquisition Sources */}
      <RosterSection
        title="Acquisition Sources"
        table="acquisition_sources"
        stores={stores}
        initialItems={acquisitionSources}
        readOnly={readOnly}
      />

      {/* Section 5: Finance Managers */}
      <RosterSection
        title="Finance Managers"
        table="finance_managers"
        stores={stores}
        initialItems={financeManagers}
        emptyMessage="No finance managers yet. Add one above to enable F&I tracking on deals."
        hasActive
        readOnly={readOnly}
      />
    </div>
  );
}
